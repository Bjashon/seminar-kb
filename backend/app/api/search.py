from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.db.models import Entity, SearchQuery
from app.db.session import get_db
from app.schemas import EntitySummaryOut

router = APIRouter(tags=["search"])


@router.get("/search", response_model=list[EntitySummaryOut])
def search(q: str = Query(..., min_length=1), db: Session = Depends(get_db)) -> list[EntitySummaryOut]:
    # Filtering in Python rather than SQL lower()/ILIKE: SQLite's lower() is
    # ASCII-only, so a Cyrillic query would silently match nothing there
    # while working fine on Postgres. Python's str.lower() is Unicode-aware
    # and the corpus is small, so this stays correct on both engines.
    needle = q.strip().lower()
    all_entities = db.query(Entity).order_by(Entity.topic_order, Entity.title_ru).all()

    def matches(e: Entity) -> bool:
        haystacks = [e.title_ru, e.title_en, e.statement_ru, e.statement_en]
        return any(h and needle in h.lower() for h in haystacks)

    results = [e for e in all_entities if matches(e)][:50]

    db.add(SearchQuery(query_text=q, matched_entity_ids=[e.id for e in results]))
    db.commit()

    return [
        EntitySummaryOut(slug=e.slug, kind=e.kind.value, title_ru=e.title_ru, title_en=e.title_en,
                          topic=e.topic, topic_order=e.topic_order)
        for e in results
    ]
