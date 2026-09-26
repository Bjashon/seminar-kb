from datetime import date, datetime

from pydantic import BaseModel


class SourceOut(BaseModel):
    label: str | None
    document: str | None
    page: int | None
    episode_code: str | None
    citation: str | None


class LinkOut(BaseModel):
    slug: str
    title_ru: str | None
    title_en: str | None
    kind: str


class EntitySummaryOut(BaseModel):
    slug: str
    kind: str
    title_ru: str | None
    title_en: str | None
    topic: str | None
    topic_order: int
    source_citation: str | None
    source_page: int | None
    episode_code: str | None


class EntityDetailOut(BaseModel):
    slug: str
    kind: str
    title_ru: str | None
    title_en: str | None
    statement_ru: str | None
    statement_en: str | None
    proof_ru: str | None
    proof_en: str | None
    aliases: list[str]
    topic: str | None
    source: SourceOut
    uses: list[LinkOut]
    used_by: list[LinkOut]


class BoardEdgeOut(BaseModel):
    from_slug: str  # "from uses to"
    to_slug: str


class ProjectSummaryOut(BaseModel):
    slug: str
    title: str


class ProjectFileOut(BaseModel):
    path: str  # relative to the project folder, e.g. "Gerstenhaber.pdf" or "checks/README.md"
    size: int


class ProjectOut(BaseModel):
    slug: str
    title: str
    body_md: str
    files: list[ProjectFileOut]
    # The pseudo-talk holding the project's own cards, if it has any
    # (episode code proj_<slug>) -- gives the page its trainer and board.
    talk_id: int | None


class TalkPartOut(BaseModel):
    episode_code: str
    date: date | None


class BoardBriefOut(BaseModel):
    title: str
    parts: list[TalkPartOut]
    bibliography: str | None
    brief_ru: str
    brief_en: str | None


class BoardOut(BaseModel):
    slugs: list[str]
    edges: list[BoardEdgeOut]
    brief: BoardBriefOut | None


class TalkSummaryOut(BaseModel):
    id: int
    episode_code: str
    title: str
    # Every talk presenting this same paper, self included, e.g. one split
    # into "Part I/II/III" across several seminar dates -- entities are
    # attached to just one of them (see load_entities.py), so the picker
    # needs these to show it's really one training for N talks.
    parts: list[TalkPartOut]
    season_number: int | None
    entity_count: int


class ReviewCardOut(BaseModel):
    slug: str
    title_ru: str | None
    kind: str
    level: int
    due_at: datetime


class SnoozeIn(BaseModel):
    days: int = 3


class GradeIn(BaseModel):
    grade: str  # "again" | "good" | "easy"
