"""Load a committed snapshot of talk metadata (title, date, season,
article PDF paths) into the seasons/talks tables.

parse_export.py needs the full private Notion export under data/raw/,
which is gitignored and excluded from the Docker build (see
.dockerignore) -- it can only ever run against a local checkout. Without
it, load_entities.py's talk lookup falls back to creating a bare
placeholder Talk row (title = episode_code, no date, no season) for any
episode_code it doesn't find, which is all prod ever had. This loads a
small, git-committed JSON dump of just the metadata (not the PDFs
themselves) so deploys get real titles/dates too.

Regenerate the snapshot after running parse_export.py locally, from
backend/:
  python -c "
  import json
  from app.db.session import SessionLocal
  from app.db.models import Talk, Season
  db = SessionLocal()
  seasons = {s.id: s.number for s in db.query(Season).all()}
  talks = db.query(Talk).filter(Talk.episode_code.isnot(None)).order_by(Talk.episode_code).all()
  rows = [{'episode_code': t.episode_code, 'title': t.title,
           'date': t.date.isoformat() if t.date else None,
           'season_number': seasons.get(t.season_id),
           'article_pdf_paths': t.article_pdf_paths or []} for t in talks]
  json.dump(rows, open('app/ingestion/talks_metadata.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
  "

Run from backend/: python -m app.ingestion.load_talks_metadata
"""

import json
from datetime import datetime
from pathlib import Path

from app.db.base import Base
from app.db.models import Season, Talk
from app.db.session import SessionLocal, engine

METADATA_PATH = Path(__file__).resolve().parent / "talks_metadata.json"


def main() -> None:
    Base.metadata.create_all(bind=engine)
    if not METADATA_PATH.exists():
        print(f"No {METADATA_PATH.name}, skipping talk metadata load")
        return

    with open(METADATA_PATH, encoding="utf-8") as f:
        rows = json.load(f)

    db = SessionLocal()
    try:
        seasons_by_number = {s.number: s for s in db.query(Season).all()}
        talks_by_code = {t.episode_code: t for t in db.query(Talk).all() if t.episode_code}

        applied = 0
        for row in rows:
            code = row["episode_code"]
            season = None
            if row.get("season_number") is not None:
                season = seasons_by_number.get(row["season_number"])
                if season is None:
                    season = Season(number=row["season_number"], label=f"Season {row['season_number']}")
                    db.add(season)
                    db.flush()
                    seasons_by_number[row["season_number"]] = season

            talk = talks_by_code.get(code)
            if talk is None:
                talk = Talk(episode_code=code)
                db.add(talk)
                talks_by_code[code] = talk

            talk.title = row["title"]
            talk.date = datetime.strptime(row["date"], "%Y-%m-%d").date() if row.get("date") else None
            if season is not None:
                talk.season_id = season.id
            talk.article_pdf_paths = row.get("article_pdf_paths") or []
            applied += 1

        db.commit()
        print(f"Talk metadata: {applied} rows applied from {METADATA_PATH.name}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
