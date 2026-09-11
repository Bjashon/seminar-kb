import re
from pathlib import PureWindowsPath

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.db.models import Entity, EntityKind, Season, Talk
from app.db.session import get_db
from app.schemas import TalkSummaryOut

router = APIRouter(prefix="/talks", tags=["talks"])

# Notion titles look like "s07_ep30 Lie antialgebras: Prémices Part I" --
# strip the leading code and a trailing "Part <roman-or-arabic>" so the
# picker can show one clean paper title next to the joined episode codes.
_CODE_PREFIX_RE = re.compile(r"^s\d{2}_(?:ep|sp)\d+:?\s*", re.IGNORECASE)
_PART_SUFFIX_RE = re.compile(r"\s*Part\s+[IVXLCDM]+\.?\s*$|\s*Part\s+\d+\.?\s*$", re.IGNORECASE)


def _display_title(raw: str) -> str:
    t = _PART_SUFFIX_RE.sub("", _CODE_PREFIX_RE.sub("", raw))
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
        .order_by(Talk.episode_code)
        .all()
    )
    all_talks = db.query(Talk).all()

    def basenames(talk: Talk) -> set[str]:
        # article_pdf_paths were resolved on Windows (see parse_export.py)
        # and stored as backslash paths regardless of which OS later reads
        # them (this API can run in a Linux container), and each talk gets
        # its own folder even when re-uploading the identical PDF -- so only
        # the filename, not the full path, can identify "same paper".
        return {PureWindowsPath(p).name for p in (talk.article_pdf_paths or []) if not p.startswith("http")}

    out: list[TalkSummaryOut] = []
    for talk, season_number, count in rows:
        own_names = basenames(talk)
        siblings = [
            t for t in all_talks
            if t.id != talk.id and t.episode_code and own_names & basenames(t)
        ]
        group = sorted([talk, *siblings], key=lambda t: t.episode_code or "")
        out.append(
            TalkSummaryOut(
                episode_code=talk.episode_code,
                title=_display_title(talk.title),
                episode_codes=[t.episode_code for t in group],
                season_number=season_number,
                date=talk.date,
                dates=[t.date for t in group if t.date],
                entity_count=count,
            )
        )
    return out
