"""List seminar talks from the Notion export, with whether each one's
article is already in the knowledge base.

Run from backend/:
  python -m app.ingestion.list_talks                      # everything
  python -m app.ingestion.list_talks --from 2026-10-01    # a date range
  python -m app.ingestion.list_talks --season 7 --todo    # only what's left

"Covered" means some extracted/*.json cites a PDF with the same filename,
or lists it in "also_covers_documents" (another version of the same paper,
e.g. the journal version of an arXiv preprint already extracted). Several
talks often present one paper in parts (identical PDF re-uploaded under
each talk), so a later part shows as covered once any part is done.
"""

import argparse
import json
import sys
from datetime import date
from pathlib import Path, PureWindowsPath

from app.ingestion.parse_export import (
    EPISODE_CODE_RE,
    load_rows,
    normalize_title,
    parse_date,
    resolve_local_path,
    split_paths,
)

EXTRACTED_DIR = Path(__file__).resolve().parent / "extracted"


def covered_documents() -> dict[str, str]:
    """PDF filename -> the extracted JSON file that covers it."""
    out: dict[str, str] = {}
    for f in sorted(EXTRACTED_DIR.glob("*.json")):
        d = json.loads(f.read_text(encoding="utf-8"))
        docs = {d.get("source_document"), *d.get("also_covers_documents", [])}
        docs |= {(e.get("source") or {}).get("document") for e in d.get("entities", [])}
        for doc in docs:
            if doc:
                out.setdefault(doc, f.name)
    return out


def main() -> None:
    # A Windows console defaults to cp1252 and crashes on Cyrillic titles.
    sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser()
    ap.add_argument("--from", dest="date_from", type=date.fromisoformat)
    ap.add_argument("--to", dest="date_to", type=date.fromisoformat)
    ap.add_argument("--season", type=int)
    ap.add_argument("--todo", action="store_true", help="only talks whose article isn't covered yet")
    args = ap.parse_args()

    covered = covered_documents()
    rows = []
    for r in load_rows():
        articles = [resolve_local_path(p) for p in split_paths(r["📝 Article: Year-Title"])]
        slides = split_paths(r["Presentation"])
        if not articles and not slides:
            continue  # season divider / blank row, not a talk (see parse_export.py)
        title = normalize_title(r["Title"])
        m = EPISODE_CODE_RE.match(title)
        d = parse_date(r["Date"])
        if args.season is not None and (not m or int(m.group(2)) != args.season):
            continue
        if args.date_from and (d is None or d < args.date_from):
            continue
        if args.date_to and (d is None or d > args.date_to):
            continue
        names = [p if p.startswith("http") else PureWindowsPath(p).name for p in articles]
        hits = sorted({covered[n] for n in names if n in covered})
        if not articles:
            status = "только слайды"
        elif hits:
            status = "готово: " + ", ".join(hits)
        else:
            status = "НОВАЯ"
        if args.todo and status != "НОВАЯ":
            continue
        rows.append((d, m.group(1) if m else "-", title, names, status))

    rows.sort(key=lambda x: (x[0] is None, x[0] or date.min, x[1]))
    for d, code, title, names, status in rows:
        when = d.strftime("%d/%m/%Y") if d else "??/??/????"
        print(f"{when}  {code:11} {status}")
        print(f"            {title[:90]}")
        for n in names:
            print(f"            - {n}")


if __name__ == "__main__":
    main()
