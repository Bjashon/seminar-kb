from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.models import Entity, ReviewCard
from app.db.session import get_db
from app.schemas import GradeIn, ReviewCardOut
from app.services.srs import apply_grade, cloze_term

router = APIRouter(prefix="/review", tags=["review"])


@router.get("/due", response_model=list[ReviewCardOut])
def due_cards(db: Session = Depends(get_db)) -> list[ReviewCardOut]:
    rows = (
        db.query(ReviewCard, Entity)
        .join(Entity, Entity.id == ReviewCard.entity_id)
        .filter(ReviewCard.due_at <= datetime.utcnow())
        .order_by(ReviewCard.due_at)
        .all()
    )
    return [
        ReviewCardOut(slug=e.slug, title_ru=e.title_ru, kind=e.kind.value, level=c.level, due_at=c.due_at)
        for c, e in rows
    ]


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
                          level=card.level, due_at=card.due_at)
