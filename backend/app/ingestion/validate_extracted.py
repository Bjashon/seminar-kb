"""Check extracted/*.json against the rules the app depends on, before
loading or committing. Every rule here was learned from a real bug.

Run from backend/:
  python -m app.ingestion.validate_extracted                 # all files
  python -m app.ingestion.validate_extracted s07_ep42.json   # entity checks for these only

Exits 1 on errors. Warnings don't fail. Cross-file checks (duplicate slugs,
unresolved depends_on) always look at every file, since links resolve
across all of them. Page checks need PyMuPDF (pip install pymupdf) and the
cited PDFs in data/sources/<episode_code>/; without it they're skipped.
"""

import json
import re
import sys
from collections import Counter
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
EXTRACTED = Path(__file__).resolve().parent / "extracted"
SOURCES = REPO / "data" / "sources"

KINDS = {"definition", "theorem", "property"}
# Not in the app's MathJax setup -- they render as red error text.
BAD_MACROS = re.compile(r"\\(llbracket|rrbracket|coloneqq|eqqcolon|mathclap|shortparallel)\b")


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    only = set(sys.argv[1:])
    data = {}
    errors: list[str] = []
    warnings: list[str] = []
    for f in sorted(EXTRACTED.glob("*.json")):
        try:
            data[f.name] = json.loads(f.read_text(encoding="utf-8"))
        except Exception as e:  # noqa: BLE001 -- report and keep checking the rest
            errors.append(f"{f.name}: does not parse: {e}")

    names: set[str] = set()
    slugs: Counter[str] = Counter()
    for d in data.values():
        for e in d["entities"]:
            slugs[e["slug"]] += 1
            for t in (e.get("title_en"), *e.get("aliases", [])):
                if t:
                    names.add(t.strip().lower())
    for s, n in slugs.items():
        if n > 1:
            errors.append(f"slug {s!r} defined in {n} places (the loader would silently overwrite one with the other)")

    try:
        import pymupdf
    except ImportError:
        pymupdf = None
        warnings.append("PyMuPDF not installed -- source page numbers not checked (pip install pymupdf)")
    page_counts: dict[Path, int] = {}

    for name, d in data.items():
        if only and name not in only:
            continue
        code = d.get("episode_code")
        if not code:
            errors.append(f"{name}: no episode_code")
        for key in ("bibliography", "brief_ru", "brief_en", "source_document"):
            if not d.get(key):
                errors.append(f"{name}: missing top-level {key!r}")
        for e in d["entities"]:
            tag = f"{name}:{e.get('slug')}"
            if e.get("kind") not in KINDS:
                errors.append(f"{tag}: kind {e.get('kind')!r} (only {sorted(KINDS)} render)")
            for key in ("title_en", "title_ru"):
                t = e.get(key) or ""
                if not t:
                    errors.append(f"{tag}: missing {key}")
                if "$" in t or "\\" in t:
                    errors.append(f"{tag}: LaTeX in {key} (titles are plain text, never typeset): {t!r}")
            for key in ("statement_en", "statement_ru"):
                if not e.get(key):
                    errors.append(f"{tag}: missing {key}")
            for key in ("statement_en", "statement_ru", "proof_en", "proof_ru"):
                txt = e.get(key) or ""
                m = BAD_MACROS.search(txt)
                if m:
                    errors.append(f"{tag}: {m.group(0)} in {key} is not supported by the app's MathJax")
                if txt.replace("$$", "").count("$") % 2:
                    errors.append(f"{tag}: unbalanced $ in {key}")
            if e.get("kind") == "definition" and "**" not in (e.get("statement_ru") or ""):
                warnings.append(f"{tag}: definition with no **bold** term in statement_ru (no fill-in-the-term trainer level)")
            for dep in e.get("depends_on", []):
                if dep.strip().lower() not in names:
                    errors.append(f"{tag}: depends_on {dep!r} matches no title_en/alias (the link would be dropped)")
            if not e.get("topic") or "topic_order" not in e:
                errors.append(f"{tag}: missing topic/topic_order")

            src = e.get("source") or {}
            doc, page = src.get("document"), src.get("page")
            if doc and code:
                pdf = SOURCES / code / doc
                if not pdf.is_file():
                    errors.append(f"{tag}: cited PDF not in data/sources/{code}/ ({doc}) -- the source link would 404")
                elif pymupdf and page:
                    if pdf not in page_counts:
                        page_counts[pdf] = pymupdf.open(pdf).page_count
                    if not 1 <= page <= page_counts[pdf]:
                        errors.append(
                            f"{tag}: page {page} but the PDF has {page_counts[pdf]} pages -- "
                            "source.page must be the page number inside the PDF file, not the printed one"
                        )

    for w in warnings:
        print("warning:", w)
    for e in errors:
        print("ERROR:", e)
    total = sum(len(d["entities"]) for d in data.values())
    print(f"{len(data)} files, {total} entities: {len(errors)} errors, {len(warnings)} warnings")
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
