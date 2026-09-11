from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from app.db.models import Entity, EntityLink, ReviewCard
from app.db.session import get_db
from app.schemas import EntityDetailOut, EntitySummaryOut, LinkOut, SourceOut

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
        )
        for e in entities
    ]


@router.get("/{slug}", response_model=EntityDetailOut)
def get_entity(slug: str, db: Session = Depends(get_db)) -> EntityDetailOut:
    entity = db.query(Entity).filter(Entity.slug == slug).one_or_none()
    if entity is None:
        raise HTTPException(status_code=404, detail="Entity not found")

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

    if not db.query(ReviewCard).filter(ReviewCard.entity_id == entity.id).one_or_none():
        db.add(ReviewCard(entity_id=entity.id))
        db.commit()

    return EntityDetailOut(
        slug=entity.slug, kind=entity.kind.value, title_ru=entity.title_ru, title_en=entity.title_en,
        statement_ru=entity.statement_ru, statement_en=entity.statement_en,
        proof_ru=entity.proof_ru, proof_en=entity.proof_en,
        aliases=entity.aliases or [], topic=entity.topic,
        source=SourceOut(
            label=entity.source_label, document=entity.source_document, page=entity.source_page,
            episode_code=entity.talk.episode_code if entity.talk else None,
            citation=entity.source_citation,
        ),
        uses=[_link_out(e) for e in uses],
        used_by=[_link_out(e) for e in used_by],
    )
