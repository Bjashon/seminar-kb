from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from app.api.talks import deck_name
from app.db.models import EDITABLE_FIELDS, Entity, EntityLink, ReviewCard, Talk
from app.db.session import get_db
from app.schemas import DeletedCardOut, EntityDetailOut, EntityEditIn, EntitySummaryOut, LinkOut, SourceOut

router = APIRouter(prefix="/entities", tags=["entities"])


def _link_out(entity: Entity) -> LinkOut:
    return LinkOut(slug=entity.slug, title_ru=entity.title_ru, title_en=entity.title_en, kind=entity.kind.value)


@router.get("", response_model=list[EntitySummaryOut])
def list_entities(db: Session = Depends(get_db)) -> list[EntitySummaryOut]:
    entities = (
        db.query(Entity)
        .options(joinedload(Entity.talk))
        .filter(Entity.deleted_at.is_(None))
        .order_by(Entity.topic_order, Entity.title_ru)
        .all()
    )
    return [
        EntitySummaryOut(
            slug=e.slug, kind=e.kind.value, title_ru=e.title_ru, title_en=e.title_en,
            topic=e.topic, topic_order=e.topic_order,
            source_citation=e.source_citation, source_page=e.source_page,
            episode_code=e.talk.episode_code if e.talk else None,
            made_by_user=e.made_by_user,
        )
        for e in entities
    ]


def _entity(slug: str, db: Session) -> Entity:
    entity = db.query(Entity).filter(Entity.slug == slug).one_or_none()
    if entity is None:
        raise HTTPException(status_code=404, detail="Entity not found")
    return entity


def _detail_out(entity: Entity, db: Session) -> EntityDetailOut:
    """The card as the site shows it (GET, and the answer to an edit)."""
    uses = (
        db.query(Entity)
        .join(EntityLink, EntityLink.to_entity_id == Entity.id)
        .filter(EntityLink.from_entity_id == entity.id, Entity.deleted_at.is_(None))
        .all()
    )
    used_by = (
        db.query(Entity)
        .join(EntityLink, EntityLink.from_entity_id == Entity.id)
        .filter(EntityLink.to_entity_id == entity.id, Entity.deleted_at.is_(None))
        .all()
    )
    card = db.query(ReviewCard).filter(ReviewCard.entity_id == entity.id).one_or_none()
    edited = entity.edited_fields or {}

    return EntityDetailOut(
        slug=entity.slug, kind=entity.kind.value, title_ru=entity.title_ru, title_en=entity.title_en,
        statement_ru=entity.statement_ru, statement_en=entity.statement_en,
        proof_ru=entity.proof_ru, proof_en=entity.proof_en,
        aliases=entity.aliases or [], links=entity.links or [], bookmarked=bool(card and card.bookmarked),
        made_by_user=entity.made_by_user, edited=[f for f in EDITABLE_FIELDS if f in edited], topic=entity.topic,
        deleted=entity.deleted_at is not None,
        source=SourceOut(
            label=entity.source_label, document=entity.source_document, page=entity.source_page,
            episode_code=entity.talk.episode_code if entity.talk else None,
            citation=entity.source_citation,
        ),
        uses=[_link_out(e) for e in uses],
        used_by=[_link_out(e) for e in used_by],
    )


@router.get("/deleted", response_model=list[DeletedCardOut])
def deleted_entities(db: Session = Depends(get_db)) -> list[DeletedCardOut]:
    """The cards she deleted, the latest first: the trainer's "Удалённые",
    where each can be brought back."""
    entities = (
        db.query(Entity)
        .filter(Entity.deleted_at.isnot(None))
        .order_by(Entity.deleted_at.desc(), Entity.id.desc())
        .all()
    )
    all_talks = db.query(Talk).all() if entities else []
    return [
        DeletedCardOut(
            slug=e.slug, kind=e.kind.value, title_ru=e.title_ru, deleted_at=e.deleted_at,
            # A card of hers in no deck is in "Мой набор" (it came there bookmarked).
            deck=deck_name(e.talk, all_talks) if e.talk else ("Мой набор" if e.made_by_user else None),
        )
        for e in entities
    ]


@router.get("/{slug}", response_model=EntityDetailOut)
def get_entity(slug: str, db: Session = Depends(get_db)) -> EntityDetailOut:
    """A deleted card too (with deleted: true): a card open on the page, or
    one just brought back, must still be found."""
    entity = _entity(slug, db)
    # Opening a card puts it into the trainer's "history" queue.
    if entity.deleted_at is None and db.query(ReviewCard).filter(ReviewCard.entity_id == entity.id).one_or_none() is None:
        db.add(ReviewCard(entity_id=entity.id))
        db.commit()
    return _detail_out(entity, db)


@router.patch("/{slug}", response_model=EntityDetailOut)
def edit_entity(slug: str, body: EntityEditIn, db: Session = Depends(get_db)) -> EntityDetailOut:
    """Her own wording of a card, written on the site; only the fields sent
    change. load_entities overwrites a card from extracted/*.json on every
    deploy, so the first change of a field keeps the text it had (the
    JSON's) in edited_fields: load_entities then leaves the field alone, and
    /restore brings the original back. Writing the original back by hand
    does the same for that one field. Her own cards are just rewritten."""
    entity = _entity(slug, db)
    changes = body.model_dump(exclude_unset=True)
    if "title_ru" in changes and not (changes["title_ru"] or "").strip():
        raise HTTPException(status_code=422, detail="title_ru can't be empty")
    edited = dict(entity.edited_fields or {})
    for field, value in changes.items():
        # Titles are one line of plain text; an empty text is no text.
        value = " ".join((value or "").split()) if field.startswith("title_") else value
        value = value if value and value.strip() else None
        if not entity.made_by_user:
            if field in edited:
                if value == edited[field]:
                    del edited[field]
            elif value != getattr(entity, field):
                edited[field] = getattr(entity, field)
        setattr(entity, field, value)
    if not entity.made_by_user:
        entity.edited_fields = edited or None  # a new dict: a change in place wouldn't be saved
    db.commit()
    return _detail_out(entity, db)


@router.post("/{slug}/restore", response_model=EntityDetailOut)
def restore_entity(slug: str, db: Session = Depends(get_db)) -> EntityDetailOut:
    """Every field she rewrote goes back to the text extracted/*.json has."""
    entity = _entity(slug, db)
    for field, original in (entity.edited_fields or {}).items():
        if field in EDITABLE_FIELDS:
            setattr(entity, field, original)
    entity.edited_fields = None
    db.commit()
    return _detail_out(entity, db)


@router.delete("/{slug}", status_code=204)
def delete_entity(slug: str, db: Session = Depends(get_db)) -> None:
    """Any card, hers or one from extracted/*.json, the same way: hidden,
    not removed (see Entity.deleted_at). A row really deleted would come
    back from the JSON on the next deploy; this way it stays deleted, and
    keeps its review state and links for /undelete. Deleting it twice keeps
    the first date."""
    entity = _entity(slug, db)
    if entity.deleted_at is None:
        entity.deleted_at = datetime.utcnow()
        db.commit()


@router.post("/{slug}/undelete", response_model=EntityDetailOut)
def undelete_entity(slug: str, db: Session = Depends(get_db)) -> EntityDetailOut:
    """A deleted card back where it was: its deck, its place in the trainer,
    its links."""
    entity = _entity(slug, db)
    entity.deleted_at = None
    db.commit()
    return _detail_out(entity, db)
