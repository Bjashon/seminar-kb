"""Builds the claude.ai copy of the Gerstenhaber course: one self-contained HTML page.

The copy has its own look (a squared notebook; a chalkboard in the dark theme) and what the
site's course lacks: the panel «Спросить лектора» and the rehearsal «Вопросы из зала» (Claude
through the `sample` capability), the card set of artifacts/picks.js, progress kept in the
artifact's `db`. All of that is template.html next to this script. The course itself -- the
header, the modules, the tests, flashcards, glossary and calculator presets -- comes from the
same lecture.html and lecture.json as the site's course, so the copy follows the text.

Usage: python build_artifact.py <repo root> <output .html> [lecture.html] [lecture.json]
The last two replace projects/gerstenhaber/lecture.html and lecture.json (to try a draft).
SEMINAR_SITE_URL: the site's address for «Отправить на сайт»; it is not kept in this public
repo, and without it the course asks for it once.

What happens to lecture.html on the way:
- the header: class lec-hero -> hero, the title <h2 class="lec-title"> -> <h1> with its last
  word in <em>; the progress line gets the real number of modules;
- what only makes sense on the site is dropped: the links to the site's cards (.lec-cards) and
  every element marked data-only="site". Elements marked data-only="copy" are kept here (the
  site hides them);
- the block «Репетиция с «залом»» goes where the text has <div data-slot="rehearse"></div>,
  otherwise after the flashcards (#fc-list), otherwise at the end of the last module;
- module ids and their number are taken from the text as they are; the calculators find their
  blocks by the ids inside them, in whatever module they stand.
Suggested questions in the panel: "suggest" in lecture.json, {module id: [question, ...]};
a module without an entry gets two generic ones.

The copy lives at https://claude.ai/artifact/53CxBbBCZ4sJsSLirKm51T: publish the output to that
url (its capabilities sample, db, user stay as they are).
"""
import html as htmllib
import json
import os
import re
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")  # the report is in Russian; a Windows console may not be UTF-8
root = Path(sys.argv[1]).resolve()
out = Path(sys.argv[2])
proj = root / "projects" / "gerstenhaber"
lecture_html = Path(sys.argv[3]) if len(sys.argv) > 3 else proj / "lecture.html"
lecture_json = Path(sys.argv[4]) if len(sys.argv) > 4 else proj / "lecture.json"
here = Path(__file__).resolve().parent

warnings = []


def warn(text):
    warnings.append(text)


# ---------------------------------------------------------------- HTML helpers
VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"}


def element_end(text, start):
    """Where the element whose start tag begins at `start` ends (after its closing tag)."""
    m = re.compile(r"<([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>").match(text, start)
    assert m, text[start:start + 80]
    tag = m.group(1).lower()
    if tag in VOID or m.group(0).endswith("/>"):
        return m.end()
    depth = 0
    for t in re.compile(r"<(/?)%s\b[^>]*>" % tag, re.I).finditer(text, start):
        if t.group(1):
            depth -= 1
        elif not t.group(0).endswith("/>"):
            depth += 1
        if depth == 0:
            return t.end()
    raise ValueError(f"<{tag}> is not closed: {text[start:start + 120]!r}")


def remove_elements(text, start_tag):
    """Removes every element whose start tag matches the regex `start_tag`; returns (text, count)."""
    n = 0
    while True:
        m = re.search(start_tag, text)
        if not m:
            return text, n
        end = element_end(text, m.start())
        # with the line it stood on, when it stood alone
        a, b = m.start(), end
        line_start = text.rfind("\n", 0, a) + 1
        if text[line_start:a].strip() == "" and text[b:b + 1] == "\n":
            a, b = line_start, b + 1
        text = text[:a] + text[b:]
        n += 1


def class_attr(name):
    """A start tag whose class list contains `name`."""
    return r'<[a-zA-Z][a-zA-Z0-9]*\b[^>]*\bclass="(?:[^"]*\s)?%s(?:\s[^"]*)?"[^>]*>' % re.escape(name)


def js_value(value):
    """JSON that is safe inside a <script> element."""
    return json.dumps(value, ensure_ascii=False).replace("<", "\\u003c").replace("\u2028", "\\u2028").replace("\u2029", "\\u2029")


def fill(text, token, value):
    assert text.count(token) == 1, (token, text.count(token))
    return text.replace(token, value)


# ---------------------------------------------------------------- the text
src = lecture_html.read_text(encoding="utf-8")
src = re.sub(r"<!--.*?-->\s*", "", src, flags=re.S)
assert "<script" not in src.lower(), "lecture.html must not contain scripts"

# The text before the rewrite has two site-only places without a data-only mark; when they
# are not there, nothing happens.
LEGACY = [
    # the legend in the header: the site's cards are not in the copy
    (r"<li><b>Карточки</b> под целями модуля открывают карточки проекта на Дашборде\. Прогресс сохраняется в этом браузере\.</li>",
     "<li><b>Проверь себя</b> — короткий тест в конце модуля. Прогресс сохраняется в этом браузере.</li>"),
    # the site's pointer to this copy: the copy has the rehearsal itself
    (r"<h3>Вопросы лектору и репетиция с Claude</h3>\s*<p>.*?</p>", '<div data-slot="rehearse"></div>'),
]
legacy_used = 0
for pattern, repl in LEGACY:
    src, k = re.subn(pattern, lambda m: repl, src, count=1, flags=re.S)
    legacy_used += k

src, n_site_only = remove_elements(src, r'<[a-zA-Z][a-zA-Z0-9]*\b[^>]*\bdata-only="site"[^>]*>')
src, n_cards = remove_elements(src, class_attr("lec-cards"))

# ---- the header
m = re.search(class_attr("lec-hero"), src) or re.search(r"<header\b[^>]*>", src)
if m:
    a, b = m.start(), element_end(src, m.start())
    hero, body = src[a:b], (src[:a] + src[b:]).strip()
    if src[:a].strip():
        warn("перед заголовком курса есть текст — он поставлен в начало модулей")
else:
    hero, body = "", src.strip()
    warn("в lecture.html нет заголовка курса (<header class=\"lec-hero\">)")
hero = re.sub(r'(<header\b[^>]*\bclass=")lec-hero(")', r"\1hero\2", hero, count=1)

title = "Обобщённые алгебры Герстенхабера"


def h1(m):
    global title
    inner = m.group(1).strip()
    title = re.sub(r"\s+", " ", htmllib.unescape(re.sub(r"<[^>]+>", "", inner))).strip() or title
    if "<" not in inner and " " in inner:  # the copy sets the last word of the title in italics
        head, last = inner.rsplit(" ", 1)
        if "$" not in last:
            inner = f"{head} <em>{last}</em>"
    return f"<h1>{inner}</h1>"


hero, n_title = re.subn(r'<h2\b[^>]*\bclass="lec-title"[^>]*>(.*?)</h2>', h1, hero, count=1, flags=re.S)
if not n_title:
    m = re.search(r"<h1\b[^>]*>(.*?)</h1>", hero, re.S)
    if m:
        title = re.sub(r"\s+", " ", htmllib.unescape(re.sub(r"<[^>]+>", "", m.group(1)))).strip() or title
    elif hero:
        warn("в заголовке курса нет названия (<h2 class=\"lec-title\">)")

# ---- the modules: ids and titles as the text has them
modules = []
for m in re.finditer(class_attr("module"), body):
    tag = m.group(0)
    if not tag.startswith("<section"):
        continue
    mid = re.search(r'\bid="([^"]*)"', tag)
    mtitle = re.search(r'\bdata-title="([^"]*)"', tag)
    assert mid and mid.group(1), f"у модуля нет id: {tag}"
    if not mtitle:
        warn(f"у модуля {mid.group(1)} нет data-title: в оглавлении будет его id")
    modules.append((mid.group(1), htmllib.unescape(mtitle.group(1)) if mtitle else mid.group(1)))
ids = [mid for mid, _ in modules]
assert ids, "в lecture.html нет ни одного <section class=\"module\">"
assert len(set(ids)) == len(ids), f"повторяются id модулей: {ids}"
for mid in ids:
    if not re.fullmatch(r"[A-Za-z0-9_-]+", mid):
        warn(f"id модуля «{mid}»: лучше только латиница, цифры и дефис")

hero = re.sub(r'(\bid="progress-text"[^>]*>)[^<]*', lambda m: m.group(1) + f"Пройдено 0 из {len(ids)}", hero, count=1)

# ---- the rehearsal block
template = (here / "template.html").read_text(encoding="utf-8")
template = re.sub(r"\A<!--TEMPLATE.*?-->\n", "", template, count=1, flags=re.S)
m = re.search(r"<!--@@REHEARSAL\n(.*?)REHEARSAL@@-->\n\n?", template, re.S)
assert m, "в template.html нет блока @@REHEARSAL"
rehearsal = m.group(1).strip()
template = template[:m.start()] + template[m.end():]

slot = re.search(r'<div\b[^>]*\bdata-slot="rehearse"[^>]*>\s*</div>', body)
fc = re.search(r'<[a-zA-Z][a-zA-Z0-9]*\b[^>]*\bid="fc-list"[^>]*>', body)
if slot:
    body = body[:slot.start()] + rehearsal + body[slot.end():]
    where = "на месте data-slot=\"rehearse\""
elif fc:
    end = element_end(body, fc.start())
    body = body[:end] + "\n\n" + rehearsal + body[end:]
    where = "после карточек"
else:
    last = list(re.finditer(r"<section\b[^>]*>", body))[-1]
    end = element_end(body, last.start())
    section = body[last.start():end]
    dr = list(re.finditer(class_attr("done-row"), section))
    at = last.start() + (dr[-1].start() if dr else len(section) - len("</section>"))
    body = body[:at] + rehearsal + "\n\n" + body[at:]
    where = "в конце последнего модуля"

# ---------------------------------------------------------------- the data
data = json.loads(lecture_json.read_text(encoding="utf-8"))
data.pop("claude_url", None)  # the copy does not link to itself
given = data.pop("suggest", None) or {}
assert isinstance(given, dict), "suggest в lecture.json: {id модуля: [вопрос, ...]}"
GENERIC = ["Объясни этот модуль подробнее, со всеми выкладками", "Разбери пример из этого модуля по шагам"]
suggest = {}
for mid in ids:
    q = given.get(mid)
    assert q is None or (isinstance(q, list) and all(isinstance(s, str) for s in q)), f"suggest[{mid}]: нужен список строк"
    suggest[mid] = q or GENERIC
for mid in sorted(set(given) - set(ids)):
    warn(f"suggest: модуля «{mid}» в тексте нет — его вопросы не показываются")
n_generic = sum(1 for mid in ids if not given.get(mid))

quizzes = data.get("quizzes") or {}
in_text = re.findall(r'\bdata-quiz="([^"]*)"', body)
for qid in in_text:
    if not quizzes.get(qid):
        warn(f"тест {qid}: в lecture.json нет вопросов — блок будет пустым")
for qid in sorted(set(quizzes) - set(in_text)):
    warn(f"тест {qid}: вопросы есть в lecture.json, но блока data-quiz=\"{qid}\" в тексте нет")

# Classes of the text the copy's styles do not know render unstyled: say so.
css = "".join(re.findall(r"<style>(.*?)</style>", template, re.S))
known = set(re.findall(r"\.([A-Za-z_][\w-]*)", css))
used = {c for attr in re.findall(r'\bclass="([^"]*)"', hero + body) for c in attr.split()}
unknown = sorted(used - known)
if unknown:
    warn("классы текста, которых нет в стилях копии (они без оформления): " + ", ".join(unknown))

# ---------------------------------------------------------------- the page
PICKS = (root / "artifacts" / "picks.js").read_text(encoding="utf-8")
assert "</script" not in PICKS.lower()
SITE = os.environ.get("SEMINAR_SITE_URL", "").strip()

page = template
page = fill(page, "@@TITLE@@", htmllib.escape(title, quote=False))
page = fill(page, "<!--@@HERO@@-->", hero)
page = fill(page, "<!--@@MODULES@@-->", body)
page = fill(page, "/*@@LECTURE_DATA@@*/{}", js_value(data))
page = fill(page, "/*@@SUGGEST@@*/{}", js_value(suggest))
page = fill(page, '/*@@TITLE_JS@@*/""', js_value(title))
page = fill(page, '/*@@SITE_JS@@*/""', js_value(SITE))
page = fill(page, "/*@@PICKS_JS@@*/", PICKS.rstrip("\n"))
left = re.findall(r"@@[A-Z_]+@@|@@REHEARSAL", page)
assert not left, f"не заполнено: {left}"
assert page.lower().count("</script>") == template.lower().count("</script>"), "в данных или тексте оказался </script>"

out.write_text(page, encoding="utf-8", newline="\n")
print(f"{out}: {len(page.encode('utf-8')) / 1024:.0f} KB")
print(f"  «{title}»; модулей {len(ids)}: {', '.join(ids)}")
print(f"  тестов {len(quizzes)} (вопросов {sum(len(v) for v in quizzes.values())}), карточек {len(data.get('flashcards') or [])}, "
      f"глоссарий {len(data.get('glossary') or [])}, примеров калькулятора {len(data.get('presets') or [])}")
print(f"  подсказки лектору: свои у {len(ids) - n_generic} модулей, общие у {n_generic}; репетиция — {where}")
print(f"  убрано только для сайта: ссылок на карточки {n_cards}, data-only=\"site\" {n_site_only}; старых правок текста {legacy_used}")
for w in warnings:
    print("  ВНИМАНИЕ:", w)
