"""Check that the outside pages cards link to still exist.

A card's "links" (and https links written inline as [text](https://...))
point at Wikipedia, nLab and the Encyclopedia of Mathematics. This script
opens every one of them and reports pages that are gone, moved or turned into
a disambiguation page. It cannot tell whether a page is about the right
notion -- that is decided by reading the page when the link is added (see
docs/adding-talks.md); here it only prints where each link really leads.

Run from backend/ (needs the network):
  python -m app.ingestion.check_external_links            # all files
  python -m app.ingestion.check_external_links -v         # also list the pages that are fine

Exits 1 if any link is broken.
"""

import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

EXTRACTED = Path(__file__).resolve().parent / "extracted"
UA = {"User-Agent": "seminar-kb-linkcheck/1.0 (https://github.com/Bjashon/seminar-kb; knowledge base of a mathematics seminar)"}
MATH = re.compile(r"\$\$[\s\S]+?\$\$|\$[^$\n]+?\$")
INLINE = re.compile(r"\]\((https://[^\s()]+(?:\([^\s()]*\)[^\s()]*)*)\)")


def fetch(url: str) -> tuple[int, str]:
    for attempt in range(5):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=40) as r:
                return r.status, r.read().decode("utf-8", errors="replace")
        except urllib.error.HTTPError as e:
            if e.code in (429, 503):
                time.sleep(int(e.headers.get("Retry-After") or 0) or 5 * (attempt + 1))
                continue
            return e.code, ""
        except Exception:  # noqa: BLE001 -- a dead site is a finding, not a crash
            return 0, ""
    return 429, ""


def check_wikipedia(urls: list[str]) -> dict[str, str]:
    """url -> problem ("" if fine), asking 20 titles per request."""
    out: dict[str, str] = {}
    by_lang: dict[str, list[str]] = {}
    for u in urls:
        by_lang.setdefault(urllib.parse.urlparse(u).netloc.split(".")[0], []).append(u)
    for lang, group in by_lang.items():
        titles = {u: urllib.parse.unquote(u.split("/wiki/", 1)[1]).replace("_", " ") for u in group}
        asked = sorted(set(titles.values()))
        info: dict[str, str] = {}
        for i in range(0, len(asked), 20):
            chunk = asked[i:i + 20]
            q = urllib.parse.urlencode({"action": "query", "format": "json", "formatversion": 2, "redirects": 1,
                                        "titles": "|".join(chunk), "prop": "pageprops"})
            status, body = fetch(f"https://{lang}.wikipedia.org/w/api.php?{q}")
            if status != 200:
                info.update({t: f"Wikipedia answered {status}" for t in chunk})
                continue
            query = json.loads(body)["query"]
            norm = {n["from"]: n["to"] for n in query.get("normalized", [])}
            redir = {r["from"]: r["to"] for r in query.get("redirects", [])}
            pages = {p["title"]: p for p in query["pages"]}
            for t in chunk:
                final = redir.get(norm.get(t, t), norm.get(t, t))
                p = pages.get(final)
                if not p or p.get("missing") or p.get("invalid"):
                    info[t] = "no such page"
                elif "disambiguation" in (p.get("pageprops") or {}):
                    info[t] = "is a disambiguation page"
                elif final != norm.get(t, t):
                    info[t] = f"redirects to «{final}» -- link that page if it is the right one"
                else:
                    info[t] = ""
            time.sleep(1.5)
        for u, t in titles.items():
            out[u] = info[t]
    return out


def check_plain(url: str, gone_markers: tuple[str, ...]) -> str:
    status, body = fetch(url)
    if status != 200:
        return f"answered {status}" if status else "site unreachable"
    if any(m in body for m in gone_markers):
        return "no such page"
    return ""


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    verbose = "-v" in sys.argv[1:]
    where: dict[str, list[str]] = {}
    for f in sorted(EXTRACTED.glob("*.json")):
        d = json.loads(f.read_text(encoding="utf-8"))
        for e in d["entities"]:
            urls = [l["url"] for l in e.get("links", [])]
            for key in ("statement_ru", "statement_en", "proof_ru", "proof_en"):
                urls += INLINE.findall(MATH.sub("", e.get(key) or ""))
            for u in urls:
                where.setdefault(u, []).append(f"{f.name}:{e['slug']}")
    urls = sorted(where)
    problems: dict[str, str] = {}
    wiki = [u for u in urls if ".wikipedia.org/wiki/" in u]
    problems.update(check_wikipedia(wiki))
    for u in urls:
        if u in problems:
            continue
        if u.startswith("https://ncatlab.org/"):
            problems[u] = check_plain(u, ())
        elif u.startswith("https://encyclopediaofmath.org/"):
            problems[u] = check_plain(u, ("There is currently no text in this page",))
        else:
            problems[u] = check_plain(u, ())
        time.sleep(0.3)
    bad = 0
    for u in urls:
        if problems[u]:
            bad += 1
            print(f"BROKEN: {u} -- {problems[u]}  [{', '.join(sorted(set(where[u])))}]")
        elif verbose:
            print(f"ok: {u}")
    print(f"{len(urls)} links, {bad} broken")
    return 1 if bad else 0


if __name__ == "__main__":
    raise SystemExit(main())
