from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.db.models import Entity, EntityKind, Season, Talk
from app.db.session import get_db
from app.schemas import TalkSummaryOut

router = APIRouter(prefix="/talks", tags=["talks"])


@router.get("", response_model=list[TalkSummaryOut])
def list_talks(db: Session = Depends(get_db)) -> list[TalkSummaryOut]:
    """Talks with at least one definition/property entity -- the pool the
    per-article trainer mode can offer, since that's all it drills."""
    rows = (
        db.query(Talk, Season.number, func.count(Entity.id))
        .join(Entity, Entity.talk_id == Talk.id)
        .outerjoin(Season, Season.id == Talk.season_id)
        .filter(Talk.episode_code.isnot(None))
        .filter(Entity.kind.in_([EntityKind.definition, EntityKind.property]))
        .group_by(Talk.id, Season.number)
        .order_by(Talk.episode_code)
        .all()
    )
    return [
        TalkSummaryOut(
            episode_code=talk.episode_code, title=talk.title, season_number=season_number,
            date=talk.date, entity_count=count,
        )
        for talk, season_number, count in rows
    ]
