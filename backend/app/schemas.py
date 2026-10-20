from datetime import date, datetime

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


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
    made_by_user: bool = False


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
    # She made it herself (see Entity.made_by_user): it can be deleted.
    made_by_user: bool = False
    # Fields of a card from the JSON she rewrote on the site (title_ru, ...,
    # proof_en): their original can be restored. Empty for her own cards.
    edited: list[str] = []
    topic: str | None
    source: SourceOut
    uses: list[LinkOut]
    used_by: list[LinkOut]


class EntityEditIn(BaseModel):
    # Her own wording of a card, written on the site: only the fields sent
    # change. title_ru can't be emptied; an empty other field becomes null.
    model_config = ConfigDict(extra="forbid")

    title_ru: str | None = Field(default=None, max_length=300)
    title_en: str | None = Field(default=None, max_length=300)
    statement_ru: str | None = Field(default=None, max_length=20000)
    statement_en: str | None = Field(default=None, max_length=20000)
    proof_ru: str | None = Field(default=None, max_length=20000)
    proof_en: str | None = Field(default=None, max_length=20000)


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
    # The project's course on claude.ai, with the lecturer ("claude_url" in
    # lecture.json); the site does not show courses itself, only links there.
    lecture_claude_url: str | None = None
    # "label" in lecture.json: set for a course that is not a lecture on a
    # paper (the link then says "Курс на claude.ai", not "Лекция …").
    lecture_label: str | None = None


class UserCardIn(BaseModel):
    # One card she made in a course on claude.ai: picked there, written by Claude.
    kind: Literal["definition", "theorem", "property"]
    title_ru: str = Field(min_length=1, max_length=300)
    title_en: str | None = Field(default=None, max_length=300)
    statement_ru: str = Field(min_length=1, max_length=20000)
    statement_en: str | None = Field(default=None, max_length=20000)
    source_label: str | None = Field(default=None, max_length=200)


class CardTargetIn(BaseModel):
    # Where the cards go: the course's own deck, "Мой набор" (bookmarked, no
    # deck), an existing deck (talk_id), or a theme of her own by a new name.
    kind: Literal["project", "bookmarks", "talk", "new"] = "project"
    talk_id: int | None = None
    title: str | None = Field(default=None, max_length=200)


class UserCardsIn(BaseModel):
    project: str | None = Field(default=None, pattern=r"^[a-z0-9-]{1,64}$")  # the course they came from
    target: CardTargetIn = CardTargetIn()
    cards: list[UserCardIn] = Field(min_length=1, max_length=100)


class UserCardsOut(BaseModel):
    added: list[str]       # slugs of the new cards
    already: int           # the same card had come before (a link opened twice)
    talk_id: int | None    # the deck to open; None: they went to "Мой набор"


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
