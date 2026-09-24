"""Write talks_metadata.json (the snapshot load_talks_metadata.py applies
on every deploy) from the talks currently in the database.

Point it at a throwaway database freshly filled by parse_export.py -- not
at dev.db, which also holds placeholder talks load_entities.py made. The
full procedure is in docs/adding-talks.md ("Новые доклады").

Run from backend/: python -m app.ingestion.dump_talks_metadata
"""

import json
from pathlib import Path, PureWindowsPath

from app.db.models import Season, Talk
from app.db.session import SessionLocal

OUT = Path(__file__).resolve().parent / "talks_metadata.json"


def _portable(path: str) -> str:
    """Paths relative to data/raw/export/, so the committed snapshot doesn't
    depend on where the repo sits on whoever's machine (only the file name
    is used downstream, by talk_groups.py)."""
    if path.startswith("http"):
        return path
    parts = PureWindowsPath(path).parts
    if "export" in parts:
        parts = parts[len(parts) - parts[::-1].index("export"):]
    return "/".join(parts)


def main() -> None:
    db = SessionLocal()
    try:
        seasons = {s.id: s.number for s in db.query(Season).all()}
        talks = (
            db.query(Talk)
            .filter(Talk.episode_code.isnot(None))
            .order_by(Talk.episode_code, Talk.id)
            .all()
        )
        rows = [
            {
                "episode_code": t.episode_code,
                "title": t.title,
                "date": t.date.isoformat() if t.date else None,
                "season_number": seasons.get(t.season_id),
                "article_pdf_paths": [_portable(p) for p in t.article_pdf_paths or []],
            }
            for t in talks
        ]
    finally:
        db.close()

    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(rows, f, ensure_ascii=False, indent=2)
    print(f"Wrote {len(rows)} talks to {OUT.name}")


if __name__ == "__main__":
    main()
