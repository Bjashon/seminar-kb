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


class TalkSummaryOut(BaseModel):
    episode_code: str
    title: str
    season_number: int | None
    date: date | None
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
