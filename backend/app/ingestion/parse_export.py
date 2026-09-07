"""Parse the Notion CSV export into seasons/talks rows.

Run from backend/: python -m app.ingestion.parse_export

Source: data/raw/export/Private & Shared/Asian-European seminar on
non-associative algebras/Seminar <hash>_all.csv (not the "main" csv --
that one is grouped by season via divider rows in an order that doesn't
match the actual episode codes; season number is instead parsed directly
out of each episode code, e.g. "s04" from "s04_ep03").

A row counts as a real talk iff it has at least one attached PDF (article
or presentation) -- this is what actually distinguishes a scheduled talk
from a season-divider label row or a stray blank row (verified against the
export: exactly 217 of 236 rows in the CSV have an attachment).
"""

import csv
import re
from pathlib import Path
from urllib.parse import unquote

from app.core.config import settings
from app.db.base import Base
from app.db.models import Season, Talk
from app.db.session import SessionLocal, engine

EXPORT_ROOT = (
    Path(__file__).resolve().parents[3]
    / "data"
    / "raw"
    / "export"
    / "Private & Shared"
)
CSV_PATH = (
    EXPORT_ROOT
    / "Asian-European seminar on non-associative algebras"
    / "Seminar d1f3b5d8feef4244be08f3a95d1d050b_all.csv"
)

EPISODE_CODE_RE = re.compile(r"^(s(\d\d)_(?:ep|sp)\d+)")


def normalize_title(raw: str) -> str:
    return re.sub(r"\s+", " ", raw.replace("\xa0", " ")).strip()


def split_paths(field: str) -> list[str]:
    """Split a possibly multi-valued attachment field into individual entries.

    Notion exports a comma-joined list when a talk cites several papers
    (verified: 14 rows have more than one article attached). Entries are
    either a local relative path (percent-encoded, decoded + resolved below)
    or an external URL (e.g. an arxiv.org link) kept as-is.
    """
    if not field.strip():
        return []
    return [p.strip() for p in field.split(", ") if p.strip()]


def resolve_local_path(entry: str) -> str:
    """Decode a Notion-relative path and resolve it under EXPORT_ROOT.

    External URLs are returned unchanged. Notion truncates long folder names
    when generating the export, and the CSV's encoded path and the actual
    zip entry get truncated to slightly different lengths -- the CSV side
    keeps a trailing space that the real folder name doesn't have (verified
    against all 21 mismatches produced by an earlier, stricter version of
    this resolver: every one was exactly this, nothing else). Stripping
    trailing whitespace per path segment fixes all of them.
    """
    if entry.startswith("http://") or entry.startswith("https://"):
        return entry
    decoded = unquote(entry)
    segments = [seg.rstrip() for seg in decoded.split("/")]
    return str(EXPORT_ROOT.joinpath(*segments))


def fallback_title_from_paths(paths: list[str]) -> str:
    for p in paths:
        if not p.startswith("http"):
            stem = Path(unquote(p)).stem
            return stem.replace("_", " ").strip()
    return "(untitled)"


def parse_date(raw: str):
    from datetime import datetime

    raw = raw.strip()
    if not raw:
        return None
    return datetime.strptime(raw, "%B %d, %Y").date()


def load_rows() -> list[dict]:
    with open(CSV_PATH, encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def main() -> None:
    Base.metadata.create_all(bind=engine)  # no-op once alembic has run; safe either way
    rows = load_rows()

    attached_rows = [
        r for r in rows if r["📝 Article: Year-Title"].strip() or r["Presentation"].strip()
    ]
    print(f"CSV rows: {len(rows)}, rows with an attachment (= real talks): {len(attached_rows)}")

    db = SessionLocal()
    try:
        seasons_by_number: dict[int, Season] = {
            s.number: s for s in db.query(Season).all()
        }

        created = 0
        missing_files: list[str] = []
        seen_titles: dict[str, str] = {}

        for row in attached_rows:
            title = normalize_title(row["Title"])
            article_paths = [resolve_local_path(p) for p in split_paths(row["📝 Article: Year-Title"])]
            presentation_paths = [resolve_local_path(p) for p in split_paths(row["Presentation"])]

            if not title:
                title = fallback_title_from_paths(article_paths + presentation_paths)

            match = EPISODE_CODE_RE.match(title)
            episode_code = match.group(1) if match else None
            season_number = int(match.group(2)) if match else None

            season = None
            if season_number is not None:
                season = seasons_by_number.get(season_number)
                if season is None:
                    season = Season(number=season_number, label=f"Season {season_number}")
                    db.add(season)
                    db.flush()
                    seasons_by_number[season_number] = season

            if title in seen_titles:
                print(f"WARNING: duplicate normalized title, keeping both rows: {title!r}")
            seen_titles[title] = episode_code or ""

            for p in article_paths + presentation_paths:
                if not p.startswith("http") and not Path(p).exists():
                    missing_files.append(p)

            talk = Talk(
                season_id=season.id if season else None,
                episode_code=episode_code,
                title=title,
                speaker=row["Speaker"].strip() or None,
                date=parse_date(row["Date"]),
                youtube_url=row["🎞️"].strip() or None,
                article_pdf_paths=article_paths,
                presentation_pdf_paths=presentation_paths,
                source_language=None,
            )
            db.add(talk)
            created += 1

        db.commit()
        print(f"Inserted {created} talks across {len(seasons_by_number)} seasons.")
        if missing_files:
            print(f"WARNING: {len(missing_files)} referenced local file(s) do not exist on disk:")
            for m in missing_files:
                print("  -", m)
    finally:
        db.close()


if __name__ == "__main__":
    main()
