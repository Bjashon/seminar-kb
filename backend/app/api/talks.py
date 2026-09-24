import re
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.db.models import Entity, EntityKind, EntityLink, Season, Talk
from app.db.session import get_db
from app.schemas import BoardEdgeOut, BoardOut, TalkPartOut, TalkSummaryOut
from app.services.ordering import topo_order
from app.services.talk_groups import paper_group

router = APIRouter(prefix="/talks", tags=["talks"])

# Notion titles look like "s07_ep30 Lie antialgebras: Prémices Part I" --
# strip the leading code (shown separately) and, for a paper merged across
# several talks, the trailing "Part <roman-or-arabic>" too, since one entry
# then stands for all the parts at once.
_CODE_PREFIX_RE = re.compile(r"^s\d{2}_(?:ep|sp)\d+:?\s*", re.IGNORECASE)
_PART_SUFFIX_RE = re.compile(r"\s*Part\s+[IVXLCDM]+\.?\s*$|\s*Part\s+\d+\.?\s*$", re.IGNORECASE)


def _display_title(raw: str, strip_part: bool) -> str:
    t = _CODE_PREFIX_RE.sub("", raw)
    if strip_part:
        t = _PART_SUFFIX_RE.sub("", t)
    return t.strip() or raw


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
        .order_by(Talk.episode_code, Talk.date)
        .all()
    )
    all_talks = db.query(Talk).all()

    out: list[TalkSummaryOut] = []
    for talk, season_number, count in rows:
        group = paper_group(talk, all_talks)
        out.append(
            TalkSummaryOut(
                id=talk.id,
                episode_code=talk.episode_code,
                title=_display_title(talk.title, strip_part=len(group) > 1),
                parts=[TalkPartOut(episode_code=t.episode_code, date=t.date) for t in group],
                season_number=season_number,
                entity_count=count,
            )
        )
    # By each paper's first presentation, not by whichever talk happens to
    # own its entities (ep28/29/36 is owned by ep36 but started 03/08).
    out.sort(key=lambda t: (t.parts[0].date is None, t.parts[0].date or date.min, t.parts[0].episode_code))
    return out


@router.get("/{talk_id}/board", response_model=BoardOut)
def talk_board(talk_id: int, db: Session = Depends(get_db)) -> BoardOut:
    """Every entity of one paper (all kinds, not just what the trainer
    drills) plus the "uses" links among them, for laying the whole paper out
    on the canvas at once. Slugs come back in dependency order."""
    talk = db.get(Talk, talk_id)
    if talk is None:
        raise HTTPException(status_code=404, detail="Talk not found")

    group_ids = [t.id for t in paper_group(talk, db.query(Talk).all())]
    entities = (
        db.query(Entity)
        .filter(Entity.talk_id.in_(group_ids))
        .order_by(Entity.source_page, Entity.id)
        .all()
    )
    entities = topo_order(db, entities)

    slug_by_id = {e.id: e.slug for e in entities}
    links = (
        db.query(EntityLink)
        .filter(EntityLink.from_entity_id.in_(slug_by_id), EntityLink.to_entity_id.in_(slug_by_id))
        .all()
    )
    return BoardOut(
        slugs=[e.slug for e in entities],
        edges=[BoardEdgeOut(from_slug=slug_by_id[l.from_entity_id], to_slug=slug_by_id[l.to_entity_id]) for l in links],
    )
