from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from app.db.models import EDITABLE_FIELDS, Entity, EntityLink, ReviewCard
from app.db.session import get_db
from app.schemas import EntityDetailOut, EntityEditIn, EntitySummaryOut, LinkOut, SourceOut

router = APIRouter(prefix="/entities", tags=["entities"])


def _link_out(entity: Entity) -> LinkOut:
    return LinkOut(slug=entity.slug, title_ru=entity.title_ru, title_en=entity.title_en, kind=entity.kind.value)


@router.get("", response_model=list[EntitySummaryOut])
def list_entities(db: Session = Depends(get_db)) -> list[EntitySummaryOut]:
    entities = (
        db.query(Entity)
        .options(joinedload(Entity.talk))
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
        .filter(EntityLink.from_entity_id == entity.id)
        .all()
    )
    used_by = (
        db.query(Entity)
        .join(EntityLink, EntityLink.from_entity_id == Entity.id)
        .filter(EntityLink.to_entity_id == entity.id)
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
        source=SourceOut(
            label=entity.source_label, document=entity.source_document, page=entity.source_page,
            episode_code=entity.talk.episode_code if entity.talk else None,
            citation=entity.source_citation,
        ),
        uses=[_link_out(e) for e in uses],
        used_by=[_link_out(e) for e in used_by],
    )


@router.get("/{slug}", response_model=EntityDetailOut)
def get_entity(slug: str, db: Session = Depends(get_db)) -> EntityDetailOut:
    entity = _entity(slug, db)
    # Opening a card puts it into the trainer's "history" queue.
    if db.query(ReviewCard).filter(ReviewCard.entity_id == entity.id).one_or_none() is None:
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
    """Only a card she made herself (in a course on claude.ai) can go: the
    others come back from extracted/*.json on every deploy anyway."""
    entity = _entity(slug, db)
    if not entity.made_by_user:
        raise HTTPException(status_code=403, detail="Only a card made in a course can be deleted")
    db.query(ReviewCard).filter(ReviewCard.entity_id == entity.id).delete()
    db.query(EntityLink).filter((EntityLink.from_entity_id == entity.id) | (EntityLink.to_entity_id == entity.id)).delete()
    db.delete(entity)
    db.commit()
