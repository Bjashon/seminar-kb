import re
from datetime import datetime, timedelta

from app.db.models import ReviewCard

QUALITY_BY_GRADE = {"again": 2, "good": 4, "easy": 5}

# Plain SM-2 gives "good" and "easy" the same next interval and only nudges
# the ease factor, so the two buttons looked identical for weeks. "Easy" has
# to mean "I know this, show it much later": 4 days instead of 1 the first
# time, and a third further than "good" from then on.
EASY_FIRST_INTERVAL_DAYS = 4
EASY_BONUS = 1.3
# Towards level 2 a "good" is worth 2 points and an "easy" 3, and 6 points
# promote the card: three goods in a row, or two easies.
STREAK_POINTS = {"good": 2, "easy": 3}
PROMOTE_AT = 6

CLOZE_RE = re.compile(r"\*\*(.+?)\*\*")


def cloze_term(statement_ru: str | None) -> str | None:
    if not statement_ru:
        return None
    m = CLOZE_RE.search(statement_ru)
    return m.group(1) if m else None


def apply_grade(card: ReviewCard, grade: str, has_cloze_term: bool) -> None:
    """SM-2, with a 3-button grade set mapped to quality 2/4/5, and an
    "easy" that pushes the card further than a "good" (see EASY_* above).

    Level 1 is recognition (flip card); after three good grades in a row, or
    two easy ones, a card with a clozable defining term is promoted to level
    2 (fill in the blank). A single "again" drops it back to level 1.
    """
    quality = QUALITY_BY_GRADE[grade]

    if quality < 3:
        card.repetitions = 0
        card.interval_days = 1
        card.streak = 0
        if card.level == 2:
            card.level = 1
    else:
        easy = grade == "easy"
        if card.repetitions == 0:
            interval = EASY_FIRST_INTERVAL_DAYS if easy else 1
        elif card.repetitions == 1:
            interval = 6 * (EASY_BONUS if easy else 1)
        else:
            interval = card.interval_days * card.ease_factor * (EASY_BONUS if easy else 1)
        card.interval_days = round(interval)
        card.repetitions += 1
        card.streak += STREAK_POINTS[grade]
        if card.level == 1 and card.streak >= PROMOTE_AT and has_cloze_term:
            card.level = 2
            card.streak = 0

    card.ease_factor = max(1.3, card.ease_factor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)))
    card.last_reviewed_at = datetime.utcnow()
    card.due_at = datetime.utcnow() + timedelta(days=card.interval_days)
