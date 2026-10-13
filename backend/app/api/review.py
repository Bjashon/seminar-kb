import re
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.db.models import DeckProgress, Entity, EntityKind, ReviewCard, Talk
from app.db.session import get_db
from app.schemas import BookmarkIn, DeckPassedIn, GradeIn, ReviewCardOut, SnoozeIn
from app.services.ordering import topo_order
from app.services.srs import apply_grade, cloze_term
from app.services.talk_groups import paper_group

router = APIRouter(prefix="/review", tags=["review"])

# The trainer's fixed decks, the ones one walks through card by card (the
# "history" queue has no position: a graded card leaves it by itself).
DECK = re.compile(r"foundational|bookmarked|article:\d{1,9}")


def _bypass_due_cards(db: Session, entities: list[Entity], now: datetime) -> list[ReviewCardOut]:
    """Shared by the "foundational" and "article" modes: both drill a fixed
    pool of entities regardless of SRS due date -- that's the point of
    picking them explicitly -- but a snooze still holds, same as history
    mode. `entities` must already be in the order to present them (see
    topo_order) -- this does not reshuffle or reorder by due date, unlike
    history mode, since a designed learning sequence beats a random one."""
    out: list[ReviewCardOut] = []
    for entity in entities:
        card = db.query(ReviewCard).filter(ReviewCard.entity_id == entity.id).one_or_none()
        if card is None:
            card = ReviewCard(entity_id=entity.id)
            db.add(card)
            db.flush()
        if card.snoozed_until and card.snoozed_until > now:
            continue
        out.append(
            ReviewCardOut(slug=entity.slug, title_ru=entity.title_ru, kind=entity.kind.value,
                          level=card.level, due_at=card.due_at, bookmarked=card.bookmarked)
        )
    db.commit()
    return out


@router.get("/due", response_model=list[ReviewCardOut])
def due_cards(
    mode: str = Query("history", pattern="^(history|foundational|article|bookmarked)$"),
    talk_id: int | None = Query(None),
    db: Session = Depends(get_db),
) -> list[ReviewCardOut]:
    now = datetime.utcnow()

    if mode == "foundational":
        entities = (
            db.query(Entity)
            .filter(Entity.is_foundational.is_(True))
            .order_by(Entity.topic_order, Entity.source_page.asc().nulls_first(), Entity.id)
            .all()
        )
        return _bypass_due_cards(db, topo_order(db, entities), now)

    if mode == "article":
        # By talk id, not episode code: Notion titles two different papers
        # "s07_ep35 ... Part I/II", so a code alone would mix them together.
        talk = db.get(Talk, talk_id) if talk_id is not None else None
        if talk is None:
            raise HTTPException(status_code=400, detail="a valid talk_id is required for mode=article")
        group_ids = [t.id for t in paper_group(talk, db.query(Talk).all())]
        entities = (
            db.query(Entity)
            .filter(Entity.talk_id.in_(group_ids))
            .filter(Entity.kind.in_([EntityKind.definition, EntityKind.property]))
            .order_by(Entity.source_page.asc().nulls_first(), Entity.id)
            .all()
        )
        return _bypass_due_cards(db, topo_order(db, entities), now)

    if mode == "bookmarked":
        # The owner's own set: whatever carries the bookmark, in the same
        # designed order as the other fixed pools.
        entities = (
            db.query(Entity)
            .join(ReviewCard, ReviewCard.entity_id == Entity.id)
            .filter(ReviewCard.bookmarked.is_(True))
            .order_by(Entity.topic_order, Entity.source_page.asc().nulls_first(), Entity.id)
            .all()
        )
        return _bypass_due_cards(db, topo_order(db, entities), now)

    rows = (
        db.query(ReviewCard, Entity)
        .join(Entity, Entity.id == ReviewCard.entity_id)
        .filter(ReviewCard.due_at <= now)
        .filter((ReviewCard.snoozed_until.is_(None)) | (ReviewCard.snoozed_until <= now))
        .order_by(ReviewCard.due_at)
        .all()
    )
    return [
        ReviewCardOut(slug=e.slug, title_ru=e.title_ru, kind=e.kind.value, level=c.level, due_at=c.due_at,
                      bookmarked=c.bookmarked)
        for c, e in rows
    ]


def _deck(deck: str) -> str:
    if not DECK.fullmatch(deck):
        raise HTTPException(status_code=404, detail="No such deck")
    return deck


@router.get("/decks", response_model=dict[str, list[str]])
def deck_progress(db: Session = Depends(get_db)) -> dict[str, list[str]]:
    """For every fixed deck that has been started: the cards already passed
    in its current round. Stored here, not in the browser, so that every
    device continues from the same card."""
    return {row.deck: list(row.passed or []) for row in db.query(DeckProgress).all()}


@router.post("/decks/{deck}/passed", response_model=list[str])
def deck_passed(deck: str, body: DeckPassedIn, db: Session = Depends(get_db)) -> list[str]:
    """Add cards to the deck's passed ones. Adding, not replacing: a tab left
    open on another device knows an older state, and an answer given there
    must not wipe out what was passed since."""
    deck = _deck(deck)
    known = {s for (s,) in db.query(Entity.slug).filter(Entity.slug.in_(body.slugs[:1000])).all()}
    row = db.get(DeckProgress, deck)
    if row is None:
        row = DeckProgress(deck=deck, passed=[])
        db.add(row)
    passed = list(row.passed or [])
    for slug in body.slugs:
        if slug in known and slug not in passed:
            passed.append(slug)
    row.passed = passed  # a new list: an in-place append would not be seen as a change
    row.updated_at = datetime.utcnow()
    db.commit()
    return passed


@router.delete("/decks/{deck}", response_model=list[str])
def deck_restart(deck: str, db: Session = Depends(get_db)) -> list[str]:
    """Start the deck's round over."""
    row = db.get(DeckProgress, _deck(deck))
    if row is not None:
        db.delete(row)
        db.commit()
    return []


@router.get("/bookmarks", response_model=list[str])
def bookmarks(db: Session = Depends(get_db)) -> list[str]:
    """Slugs of the cards in the owner's own study set."""
    rows = (
        db.query(Entity.slug)
        .join(ReviewCard, ReviewCard.entity_id == Entity.id)
        .filter(ReviewCard.bookmarked.is_(True))
        .order_by(Entity.topic_order, Entity.title_ru)
        .all()
    )
    return [slug for (slug,) in rows]


@router.post("/{slug}/bookmark", response_model=ReviewCardOut)
def bookmark(slug: str, body: BookmarkIn, db: Session = Depends(get_db)) -> ReviewCardOut:
    """Put a card into the owner's own study set, or take it out. Like
    snooze, this is not a grade: the SRS fields stay untouched."""
    entity = db.query(Entity).filter(Entity.slug == slug).one_or_none()
    if entity is None:
        raise HTTPException(status_code=404, detail="Entity not found")

    card = db.query(ReviewCard).filter(ReviewCard.entity_id == entity.id).one_or_none()
    if card is None:
        card = ReviewCard(entity_id=entity.id)
        db.add(card)

    card.bookmarked = body.bookmarked
    db.commit()

    return ReviewCardOut(slug=entity.slug, title_ru=entity.title_ru, kind=entity.kind.value,
                          level=card.level, due_at=card.due_at, bookmarked=card.bookmarked)


@router.post("/{slug}/grade", response_model=ReviewCardOut)
def grade(slug: str, body: GradeIn, db: Session = Depends(get_db)) -> ReviewCardOut:
    if body.grade not in ("again", "good", "easy"):
        raise HTTPException(status_code=400, detail="grade must be again|good|easy")

    entity = db.query(Entity).filter(Entity.slug == slug).one_or_none()
    if entity is None:
        raise HTTPException(status_code=404, detail="Entity not found")

    card = db.query(ReviewCard).filter(ReviewCard.entity_id == entity.id).one_or_none()
    if card is None:
        card = ReviewCard(entity_id=entity.id)
        db.add(card)

    apply_grade(card, body.grade, has_cloze_term=bool(cloze_term(entity.statement_ru)))
    db.commit()

    return ReviewCardOut(slug=entity.slug, title_ru=entity.title_ru, kind=entity.kind.value,
                          level=card.level, due_at=card.due_at, bookmarked=card.bookmarked)


@router.post("/{slug}/snooze", response_model=ReviewCardOut)
def snooze(slug: str, body: SnoozeIn, db: Session = Depends(get_db)) -> ReviewCardOut:
    """Pull a card out of the queue for a while without it counting as a
    grade -- unlike "again", it must not touch ease_factor/interval_days/
    repetitions/streak/level at all."""
    entity = db.query(Entity).filter(Entity.slug == slug).one_or_none()
    if entity is None:
        raise HTTPException(status_code=404, detail="Entity not found")

    card = db.query(ReviewCard).filter(ReviewCard.entity_id == entity.id).one_or_none()
    if card is None:
        card = ReviewCard(entity_id=entity.id)
        db.add(card)

    card.snoozed_until = datetime.utcnow() + timedelta(days=body.days)
    db.commit()

    return ReviewCardOut(slug=entity.slug, title_ru=entity.title_ru, kind=entity.kind.value,
                          level=card.level, due_at=card.due_at, bookmarked=card.bookmarked)
