import re
from datetime import datetime, timedelta

from app.db.models import ReviewCard

QUALITY_BY_GRADE = {"again": 2, "good": 4, "easy": 5}

CLOZE_RE = re.compile(r"\*\*(.+?)\*\*")


def cloze_term(statement_ru: str | None) -> str | None:
    if not statement_ru:
        return None
    m = CLOZE_RE.search(statement_ru)
    return m.group(1) if m else None


def apply_grade(card: ReviewCard, grade: str, has_cloze_term: bool) -> None:
    """SM-2, with a 3-button grade set mapped to quality 2/4/5.

    Level 1 is recognition (flip card); after 3 consecutive good/easy grades
    a card with a clozable defining term is promoted to level 2 (fill in the
    blank). A single "again" drops it back to level 1.
    """
    quality = QUALITY_BY_GRADE[grade]

    if quality < 3:
        card.repetitions = 0
        card.interval_days = 1
        card.streak = 0
        if card.level == 2:
            card.level = 1
    else:
        if card.repetitions == 0:
            card.interval_days = 1
        elif card.repetitions == 1:
            card.interval_days = 6
        else:
            card.interval_days = round(card.interval_days * card.ease_factor)
        card.repetitions += 1
        card.streak += 1
        if card.level == 1 and card.streak >= 3 and has_cloze_term:
            card.level = 2
            card.streak = 0

    card.ease_factor = max(1.3, card.ease_factor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)))
    card.last_reviewed_at = datetime.utcnow()
    card.due_at = datetime.utcnow() + timedelta(days=card.interval_days)
