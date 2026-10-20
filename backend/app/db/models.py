import enum
from datetime import date, datetime

from sqlalchemy import Date, DateTime, Enum, Float, ForeignKey, Integer, JSON, String, Text, UniqueConstraint
from sqlalchemy import false as sql_false
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class EntityKind(str, enum.Enum):
    definition = "definition"
    theorem = "theorem"
    property = "property"
    problem = "problem"


class Season(Base):
    __tablename__ = "seasons"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    number: Mapped[int] = mapped_column(Integer, unique=True, index=True)
    label: Mapped[str | None] = mapped_column(String(255), nullable=True)

    talks: Mapped[list["Talk"]] = relationship(back_populates="season")


class Talk(Base):
    __tablename__ = "talks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    season_id: Mapped[int | None] = mapped_column(ForeignKey("seasons.id"), nullable=True, index=True)
    episode_code: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)
    title: Mapped[str] = mapped_column(Text)
    speaker: Mapped[str | None] = mapped_column(String(255), nullable=True)
    date: Mapped[date | None] = mapped_column(Date, nullable=True)
    youtube_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    # Lists of paths/URLs: a talk can cite several source papers, not just one.
    article_pdf_paths: Mapped[list] = mapped_column(JSON, default=list)
    presentation_pdf_paths: Mapped[list] = mapped_column(JSON, default=list)
    source_language: Mapped[str | None] = mapped_column(String(8), nullable=True)
    # Short summary of the paper's results, shown as the first card of the
    # paper's board. Authored alongside the extracted entities (see the
    # "brief_ru"/"brief_en" keys in extracted/*.json).
    brief_ru: Mapped[str | None] = mapped_column(Text, nullable=True)
    brief_en: Mapped[str | None] = mapped_column(Text, nullable=True)

    season: Mapped["Season"] = relationship(back_populates="talks")
    entities: Mapped[list["Entity"]] = relationship(back_populates="talk")


class Entity(Base):
    __tablename__ = "entities"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    kind: Mapped[EntityKind] = mapped_column(Enum(EntityKind), index=True)
    talk_id: Mapped[int | None] = mapped_column(ForeignKey("talks.id"), nullable=True, index=True)
    slug: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    title_ru: Mapped[str | None] = mapped_column(Text, nullable=True)
    title_en: Mapped[str | None] = mapped_column(Text, nullable=True)
    statement_ru: Mapped[str | None] = mapped_column(Text, nullable=True)
    statement_en: Mapped[str | None] = mapped_column(Text, nullable=True)
    proof_ru: Mapped[str | None] = mapped_column(Text, nullable=True)
    proof_en: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_machine_translated: Mapped[bool] = mapped_column(default=False)
    aliases: Mapped[list] = mapped_column(JSON, default=list)
    # Outside pages about the card's own term, best first:
    # [{"source": "wikipedia" | "nlab" | "eom", "url": "https://..."}].
    # The card underlines its defined term and opens these.
    links: Mapped[list | None] = mapped_column(JSON, nullable=True, default=list)
    topic: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    topic_order: Mapped[int] = mapped_column(Integer, default=0)
    # Provenance: which document/page this came from, or None for hand-authored
    # foundational glossary entries (not derived from any specific talk PDF).
    source_label: Mapped[str | None] = mapped_column(String(255), nullable=True)
    source_document: Mapped[str | None] = mapped_column(String(512), nullable=True)
    source_page: Mapped[int | None] = mapped_column(Integer, nullable=True)
    source_citation: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Curated flag for the trainer's "basics" mode -- drilled regardless of
    # whether the entity was ever looked up, unlike the default history-only
    # queue. Set by hand for now (see load_entities.py); may grow a UI toggle.
    is_foundational: Mapped[bool] = mapped_column(default=False)
    # A card the owner made herself -- picked in a course on claude.ai and
    # written there by Claude -- not one extracted into extracted/*.json:
    # load_entities never touches it, the trainer drills it whatever its kind,
    # and it can be deleted from the trainer.
    made_by_user: Mapped[bool] = mapped_column(default=False, server_default=sql_false())
    # Her own wording of a card from extracted/*.json: each field she changed
    # on the site (one of EDITABLE_FIELDS) mapped to the text the JSON has
    # for it, kept current by load_entities -- so a reload doesn't overwrite
    # her text, and she can restore the original. None for a card she never
    # edited, and for her own cards (load_entities doesn't touch them).
    edited_fields: Mapped[dict | None] = mapped_column(JSON(none_as_null=True), nullable=True)

    talk: Mapped["Talk"] = relationship(back_populates="entities")


# The card text the owner can change on the site (PATCH /entities/<slug>).
EDITABLE_FIELDS = ("title_ru", "title_en", "statement_ru", "statement_en", "proof_ru", "proof_en")


class EntityLink(Base):
    __tablename__ = "entity_links"
    __table_args__ = (UniqueConstraint("from_entity_id", "to_entity_id", name="uq_entity_link_pair"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    from_entity_id: Mapped[int] = mapped_column(ForeignKey("entities.id"), index=True)
    to_entity_id: Mapped[int] = mapped_column(ForeignKey("entities.id"), index=True)


class SearchQuery(Base):
    __tablename__ = "search_queries"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    query_text: Mapped[str] = mapped_column(Text)
    matched_entity_ids: Mapped[list] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class DeckProgress(Base):
    """Where the owner is in one of the trainer's fixed decks ("foundational",
    "bookmarked", "article:<talk id>"): the cards already passed in the
    current round. Kept on the server -- she is the only user -- so that the
    phone and the desktop continue from the same card."""
    __tablename__ = "deck_progress"

    deck: Mapped[str] = mapped_column(String(64), primary_key=True)
    # Entity slugs, in the order they were passed.
    passed: Mapped[list] = mapped_column(JSON, default=list)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class CourseState(Base):
    """What the owner has done in a project's course (lecture.html): modules
    marked as passed, test answers, flashcard marks. On the server for the
    same reason as DeckProgress.

    No longer used: the site stopped showing courses (20/10/2026; they live
    on claude.ai only, and keep their progress there). The table stays, with
    what was saved in it, and nothing reads or writes it."""
    __tablename__ = "course_state"

    slug: Mapped[str] = mapped_column(String(64), primary_key=True)
    # {"done": {module id: true}, "cards": {flashcard index: "know" | "again"},
    #  "quiz": {quiz id: {question index: chosen option}}}
    state: Mapped[dict] = mapped_column(JSON, default=dict)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class ReviewCard(Base):
    __tablename__ = "review_cards"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    entity_id: Mapped[int] = mapped_column(ForeignKey("entities.id"), unique=True, index=True)
    due_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    interval_days: Mapped[float] = mapped_column(Float, default=0)
    ease_factor: Mapped[float] = mapped_column(Float, default=2.5)
    repetitions: Mapped[int] = mapped_column(Integer, default=0)
    last_reviewed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    # 1 = recognition (flip card), 2 = recall (cloze blank) -- promoted after a streak of good/easy grades.
    level: Mapped[int] = mapped_column(Integer, default=1)
    # Points towards level 2 since the last "again": a good is 2, an easy 3,
    # and 6 promote (services/srs.py).
    streak: Mapped[int] = mapped_column(Integer, default=0)
    # Hand-picked into the owner's own study set (the violet bookmark on a
    # card; "Мой набор" in the trainer). Independent of the SRS state.
    bookmarked: Mapped[bool] = mapped_column(default=False)
    # "Postpone" is deliberately separate from grading (apply_grade/SM-2):
    # the user isn't saying they know or don't know the card, just that they
    # don't want it in the queue right now -- so it must not touch
    # ease_factor/interval_days/repetitions/streak/level at all.
    snoozed_until: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
