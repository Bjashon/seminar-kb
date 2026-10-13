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


class ExternalLinkOut(BaseModel):
    source: str  # "wikipedia" | "nlab" | "eom"
    url: str


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
    # Outside pages about the card's own term (best first).
    links: list[ExternalLinkOut] = []
    # In the owner's own study set ("Мой набор"): the violet bookmark.
    bookmarked: bool = False
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
    # What the file is for ("note" in the project's files.json).
    note: str | None = None


class ProjectFileGroupOut(BaseModel):
    # A block of the project page's file list (see _file_groups in api/projects.py).
    title: str
    note: str | None = None
    files: list[ProjectFileOut]


class ProjectOut(BaseModel):
    slug: str
    title: str
    body_md: str
    files: list[ProjectFileOut]
    # The same files in blocks, as the page shows them.
    file_groups: list[ProjectFileGroupOut] = []
    # The pseudo-talk holding the project's own cards, if it has any
    # (episode code proj_<slug>) -- gives the page its trainer and board.
    talk_id: int | None
    # projects/<slug>/lecture.html exists: the page offers the course.
    has_lecture: bool = False
    # The same course on claude.ai, with the Claude chat modes the site
    # does not have ("claude_url" in lecture.json).
    lecture_claude_url: str | None = None
    # What the course's button says when it is not a lecture on a paper
    # ("label" in lecture.json).
    lecture_label: str | None = None


class LectureOut(BaseModel):
    # The course text (HTML fragment with formulas) and its interactive data
    # (quizzes, flashcards, glossary, calculator presets) from lecture.json.
    html: str
    data: dict


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
    # In the owner's own study set ("Мой набор").
    bookmarked: bool = False


class BookmarkIn(BaseModel):
    bookmarked: bool


class DeckPassedIn(BaseModel):
    # Cards passed in the deck's current round (one after an answer; several
    # when a browser hands over what it used to keep itself).
    slugs: list[str]


class SnoozeIn(BaseModel):
    days: int = 3


class GradeIn(BaseModel):
    grade: str  # "again" | "good" | "easy"
