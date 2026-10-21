import re

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.projects import _project_dir, _read
from app.db.models import Entity, EntityKind, ReviewCard, Talk
from app.db.session import get_db
from app.schemas import UserCardsIn, UserCardsOut

router = APIRouter(prefix="/cards", tags=["cards"])

# Her own themes are decks like a paper's: a talk row with this code and no
# date, made when she adds cards to a theme by a new name.
MY_THEME = re.compile(r"my_(\d+)")


@router.post("", response_model=UserCardsOut)
def add_user_cards(payload: UserCardsIn, db: Session = Depends(get_db)) -> UserCardsOut:
    """Cards she made in a course on claude.ai (picked there in the text and
    written by Claude), sent here by a link or pasted. Where they go is her
    choice: the course's own deck ("Тренажёр по теме", made for a project that
    has none yet), "Мой набор" (bookmarked, in no deck), any existing deck, or a
    theme of her own under a new name. A card that came before to the same
    place (the same link opened twice) is not added again; one she had
    deleted there is brought back instead (and counts as added)."""
    project_title = None
    if payload.project:
        project_title, _ = _read(_project_dir(payload.project))
    target = payload.target

    talk: Talk | None = None
    if target.kind == "project":
        if not payload.project:
            raise HTTPException(status_code=400, detail="no course to take the deck from")
        code = f"proj_{payload.project}"
        talk = db.query(Talk).filter(Talk.episode_code == code).first()
        if talk is None:
            talk = Talk(episode_code=code, title=project_title)
            db.add(talk)
            db.flush()
    elif target.kind == "talk":
        talk = db.get(Talk, target.talk_id) if target.talk_id is not None else None
        if talk is None:
            raise HTTPException(status_code=404, detail="No such theme")
    elif target.kind == "new":
        name = (target.title or "").strip()
        if not name:
            raise HTTPException(status_code=400, detail="a new theme needs a name")
        mine = [t for t in db.query(Talk).filter(Talk.episode_code.like("my%")).all() if MY_THEME.fullmatch(t.episode_code or "")]
        # The same name twice is the same theme, not a second one.
        talk = next((t for t in mine if t.title.strip().lower() == name.lower()), None)
        if talk is None:
            n = 1 + max((int(MY_THEME.fullmatch(t.episode_code).group(1)) for t in mine), default=0)
            talk = Talk(episode_code=f"my_{n}", title=name)
            db.add(talk)
            db.flush()

    # The index groups cards by topic: the deck's own one, else its title.
    here = db.query(Entity).filter(Entity.talk_id == talk.id).all() if talk else []
    own = next((e for e in here if e.topic and not e.made_by_user), None)
    if own is not None:
        topic, topic_order = own.topic, own.topic_order
    elif talk is not None and talk.episode_code and MY_THEME.fullmatch(talk.episode_code):
        topic, topic_order = talk.title, 1000
    else:
        topic, topic_order = project_title or (talk.title if talk else "Мои карточки"), 1000

    talk_id = talk.id if talk else None
    mine_here = db.query(Entity).filter(Entity.made_by_user.is_(True), Entity.talk_id.is_(talk_id) if talk_id is None else Entity.talk_id == talk_id).all()
    seen = {(e.title_ru, e.statement_ru) for e in mine_here if e.deleted_at is None}
    deleted = {(e.title_ru, e.statement_ru): e for e in mine_here if e.deleted_at is not None}
    prefix = f"my-{payload.project or 'card'}-"
    taken = {s for (s,) in db.query(Entity.slug).filter(Entity.slug.like(prefix + "%")).all()}
    n = 1 + max((int(s[len(prefix):]) for s in taken if s[len(prefix):].isdigit()), default=0)

    added: list[str] = []
    already = 0
    for card in payload.cards:
        # Titles are plain text everywhere (no MathJax): a stray "$" would show.
        title_ru = card.title_ru.replace("$", "").strip()
        if (title_ru, card.statement_ru) in seen:
            already += 1
            continue
        seen.add((title_ru, card.statement_ru))
        back = deleted.get((title_ru, card.statement_ru))
        if back is not None:
            back.deleted_at = None
            if target.kind == "bookmarks":
                review = db.query(ReviewCard).filter(ReviewCard.entity_id == back.id).one_or_none()
                if review is None:
                    db.add(ReviewCard(entity_id=back.id, bookmarked=True))
                else:
                    review.bookmarked = True
            added.append(back.slug)
            continue
        entity = Entity(
            slug=f"{prefix}{n}", kind=EntityKind(card.kind), talk_id=talk_id,
            title_ru=title_ru, title_en=(card.title_en or "").replace("$", "").strip() or None,
            statement_ru=card.statement_ru, statement_en=card.statement_en,
            aliases=[], links=[], topic=topic, topic_order=topic_order,
            source_label=(card.source_label or "Моя карточка из курса").strip(),
            is_foundational=False, made_by_user=True,
        )
        db.add(entity)
        if target.kind == "bookmarks":
            db.flush()
            db.add(ReviewCard(entity_id=entity.id, bookmarked=True))
        added.append(entity.slug)
        n += 1
    db.commit()
    return UserCardsOut(added=added, already=already, talk_id=talk_id)
