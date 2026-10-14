"""Builds the claude.ai copy of the course on problem 2.6: one self-contained HTML page.

The page is the site's course as is -- the same lecture.html, lecture.json, styles
(frontend/src/lecture/lecture.css) and code (frontend/src/lecture/mount.ts with the
bracket calculators) -- plus what the site does not have: a drawer "Спросить лектора"
that asks Claude through the artifact runtime (`sample` capability).

Usage: python build_artifact.py <repo root> <output .html>
The JavaScript is bundled with the frontend's own rolldown (frontend/node_modules).
After publishing, the page's address goes into CLAUDE_URL of build_lecture_json.py.
"""
import json
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

root = Path(sys.argv[1]).resolve()
out = Path(sys.argv[2])
proj = root / "projects" / "monomial-identities"
lecture_dir = root / "frontend" / "src" / "lecture"

# ---------------------------------------------------------------- the course itself
html = (proj / "lecture.html").read_text(encoding="utf-8")
html = re.sub(r"<!--.*?-->\s*", "", html, flags=re.S)
data = json.loads((proj / "lecture.json").read_text(encoding="utf-8"))
data.pop("claude_url", None)  # the copy does not link to itself
modules = re.findall(r'<section class="module" id="(m\d+)" data-title="([^"]+)"', html)
assert len(modules) == 10, modules

css = (lecture_dir / "lecture.css").read_text(encoding="utf-8")
# The site keeps three of the course's colours on .lecture and one as a literal;
# here every colour is a token, so that the page follows the viewer's theme.
head = ".lecture {\n  --even: var(--accent);\n  --odd: #b8630a;\n  --soft-note: #fffbe6;\n}\n"
assert head in css
css = css.replace(head, "")
assert "background: #22418f;" in css
css = css.replace("background: #22418f;", "background: var(--accent-strong);")
assert not re.search(r"#[0-9a-fA-F]{3,8}\b", css), "a literal colour is left in lecture.css"

# ---------------------------------------------------------------- the code
with tempfile.TemporaryDirectory() as tmp:
    entry = Path(tmp) / "entry.ts"
    entry.write_text(
        f'import {{ mountLecture, typeset }} from "{(lecture_dir / "mount").as_posix()}";\n'
        f'import {{ setMath, esc }} from "{(lecture_dir / "shared").as_posix()}";\n'
        "(window as any).SeminarLecture = { mountLecture, typeset, setMath, esc };\n",
        encoding="utf-8",
    )
    bundle = Path(tmp) / "bundle.js"
    rolldown = root / "frontend" / "node_modules" / ".bin" / ("rolldown.cmd" if sys.platform == "win32" else "rolldown")
    subprocess.run([str(rolldown), str(entry), "--format", "iife", "--file", str(bundle), "--minify"],
                   check=True, capture_output=True, cwd=root / "frontend")
    js = bundle.read_text(encoding="utf-8")
assert "</script" not in js.lower()

# ---------------------------------------------------------------- what the lecturer knows
RULES = r"""Ты — лектор плана-курса «Скобочные тождества алгебр Ли» (задача 2.6 из «Днестровской тетради», автор задачи Ю. А. Бахтурин). С тобой говорит математик, специалист по неассоциативным алгебрам; она сама работает над этой задачей. Обращайся на «ты».

Правила ответа.
1. Отвечай по-русски, коротко и по существу: сначала ответ, потом объяснение. Формулы пиши в TeX между знаками доллара: $...$ в строке и $$...$$ отдельной строкой. Своих макросов не вводи.
2. Строго различай статусы: «доказано», «доказано с компьютером» (точный перебор), «посчитано» (например, ранги по модулю простого), «не перепроверено», «открыто». Никогда не выдавай открытое или посчитанное за доказанное.
3. Гипотеза в общем виде ОТКРЫТА. Если просят доказать открытое утверждение, скажи это прямо и предложи, с чего начать, или разбери частный случай. Если предлагаешь собственное рассуждение, назови его так и укажи, где его надо проверить.
4. Опирайся на справку ниже и на текст модуля. Чего там нет и чего ты не знаешь наверняка — так и скажи. Не выдумывай ссылок, номеров теорем и страниц.
5. Если собеседница ошибается, скажи, в чём именно, и покажи на маленьком примере ($n\le 6$).
6. Не пересказывай справку целиком: отвечай на заданный вопрос.
7. Если в вопросе есть блок «[Место в курсе …]», собеседница выделила это место в тексте курса: объясни именно его. Формулы в блоке записаны в TeX буквально, как в курсе, — читай их по символам и не подменяй фрагмент похожим; опирайся на абзац вокруг. Если вопрос при этом не задан, объясни, что означает выделенное и зачем оно здесь."""

REFERENCE = r"""СПРАВКА (состояние на 12.10.2026)

ПОСТАНОВКА. Поле характеристики 0. Форма $\sigma$ — элемент свободного коммутативного неассоциативного группоида с одним порождающим $x$ (неупорядоченное бинарное дерево), $|\sigma|$ — число листьев. $w_\sigma$ — полилинейный лиев одночлен: в листья расставлены разные буквы. Гипотеза Бахтурина: тождества $w_\sigma=0$ и $w_\tau=0$ равносильны тогда и только тогда, когда $\sigma=\tau$. В тетради (изд. 1993) написано «равны как элементы свободного коммутативного группоида от переменных $x_1,\dots,x_n$»; буквально это неверно уже при $n=3$ ($[[x_1,x_2],x_3]$ и $[x_1,[x_2,x_3]]$ различны в группоиде от трёх букв, а тождества равносильны), сравнивать надо после отождествления букв. Отметки о решении в тетради нет.

ОБОЗНАЧЕНИЯ. $F$ — свободная алгебра Ли счётного ранга; $\gamma_n$ — нижний центральный ряд; $F^{(d)}$ — производный ряд, $F^{(0)}=F$; гребёнка $c_n$ — форма $[[\dots[x,x],x],\dots,x]$; вишня — вершина $[x,x]$. $I_\sigma$ — линейная оболочка значений $w_\sigma$ в $F$. $\mathrm{Lie}(n)$ — полилинейная часть, $\dim=(n-1)!$. $M_\sigma\subseteq\mathrm{Lie}(n)$ — оболочка $w_\sigma$ со всеми расстановками букв.

ДОКАЗАНО.
- Лемма 1: $I_\sigma$ — вербальный идеал (умножение на элемент — дифференцирование). Лемма 2: $I_x=F$, $I_{[\alpha,\beta]}=[I_\alpha,I_\beta]$. Лемма 3: $w_\tau=0$ следует из $w_\sigma=0$ тогда и только тогда, когда $I_\tau\subseteq I_\sigma$.
- Гипотеза равносильна: $\sigma\mapsto I_\sigma$ инъективно; идеалы, получаемые из $F$ коммутированием, образуют свободный коммутативный группоид; однозначность разложения: из $[A,B]=[C,D]$ следует $\{A,B\}=\{C,D\}$ для идеалов вида $I_\sigma$.
- Теорема о сведении: при $|\sigma|=|\tau|$ следование $w_\sigma=0\Rightarrow w_\tau=0$ равносильно $M_\tau\subseteq M_\sigma$; тождества разных степеней не равносильны. Чем больше $M_\sigma$, тем сильнее тождество; у гребёнки $M=\mathrm{Lie}(n)$.
- Лемма о трёх идеалах: $[[A,B],C]\subseteq[[A,C],B]+[A,[B,C]]$. Шаг Якоби: поддерево $[[a,b],c]$ заменяется на $[[a,c],b]$ и на $[a,[b,c]]$, получаются формы $\tau_1,\tau_2$ с $I_\sigma\subseteq I_{\tau_1}+I_{\tau_2}$; отношение выводимости $\sigma\preceq\rho$; из $\sigma\preceq\rho$ следует $M_\sigma\subseteq M_\rho$.
- Инварианты формы, читаемые по идеалу: число листьев; высота (через формулу «позвоночника» и теорему Пуанкаре–Биркгофа–Витта); число Стралера $\mathrm{st}$ ($\mathrm{st}(x)=0$; у вершины $\mathrm{st}+1$ при равных детях, иначе максимум) — это номер последнего члена производного ряда, содержащего $I_\sigma$ (лемма 12 статьи М. В. Зайцева, Матем. сб., 1981; выводится из его леммы 3: если $[U,V]\subseteq M(N)$, а $U$ и $V$ не лежат в $M(N)$, то $U+V\subseteq N$); число вишен: $n-\mathrm{ch}(\sigma)$ — наибольшая степень по одной букве у ненулевого полиоднородного элемента степени $n$ в $I_\sigma$.
- Тонкие алгебры: базис $e_g$, $g$ из абелевой группы, $[e_g,e_h]=c(g,h)e_{g+h}$. Примеры: Витта ($c(i,j)=j-i$), торические ($c=\omega(u,v)$, $\omega$ — кососимметричная целочисленная форма), скобка Пуассона мономов Лорана ($c(p,q)=\det(p+(1,1),q+(1,1))$). Раскраска листьев базисными элементами даёт значение: произведение $c$ по вершинам. $\mathrm{Inv}(\sigma)$ — множество составов раскраски с ненулевым значением. Лемма о монотонности: $M_\sigma\subseteq M_\tau\Rightarrow\mathrm{Inv}(\sigma)\subseteq\mathrm{Inv}(\tau)$.
- Пример: в алгебре Витта набор весов $\{-1,-1,1,1,1\}$ допустим для $[F',\gamma_3]=[[a,b],[c,[d,e]]]$ и недопустим для $[F,F'']=[a,[[b,c],[d,e]]]$ (две вишни $\{-1,1\}$ дают равные суммы). Значит, из тождества $[F,F'']$ не следует тождество $[F',\gamma_3]$.
- Внутри семейства полинильпотентных форм (гребёнка, в листья которой вставлены гребёнки, и так далее) гипотеза верна при всех $n$ — вывод из теоремы о свободе полугруппы многообразий относительно умножения (Парфёнов; Бахтурин, теорема 4.3.7 книги) и неразложимости нильпотентных многообразий; в источниках так не сформулировано.

ДОКАЗАНО С КОМПЬЮТЕРОМ.
- Гипотеза при $n\le 12$ (число форм при $n=1..12$: 1, 1, 1, 2, 3, 6, 11, 23, 46, 98, 207, 451): для каждого $n$ есть список тонких алгебр (при $n=11,12$ девять: три торические и шесть скобок Пуассона), множества $\mathrm{Inv}$ которых различают все формы. Проверка — перебор раскрасок в целых числах.
- Одна алгебра Витта различает все формы при $n\le 10$.

ПОСЧИТАНО (не доказательство).
- Ранги: все $M_\sigma$ различны при $n\le 8$ (точно при $n\le 6$, по модулю двух простых при $n=7,8$). Размерности: $n=4$: 6 и 3; $n=5$: 24 ($\gamma_5$), 20 ($[F',\gamma_3]$), 15 ($[F,F'']$), цепочка $[F,F'']\subset[F',\gamma_3]\subset\gamma_5$; $n=6$: 120 ($\gamma_6$), 105 ($[F,[F',\gamma_3]]$), 75 ($[F',\gamma_4]$), 75 ($[F,[F,F'']]$), 40 ($[\gamma_3,\gamma_3]$), 30 ($[F',F'']$). Размерность формы не различает.
- J1: при $n\le 8$ каждое включение $M_\sigma\subseteq M_\rho$ выводится шагами Якоби (следований 1, 3, 9, 28, 90 при $n=4..8$). J2: при $n\le 17$ нет двух разных форм, выводимых друг из друга. J1 и J2 в общем виде дали бы гипотезу; оба открыты.
- Одна алгебра Витта, судя по перебору, не различает при $n=11$ формы $[x,[c_2,[c_2,[c_2,c_4]]]]$ и $[x,[c_2,[c_2,[x,[c_2,c_3]]]]]$ (веса от $-6$ до $6$, по 1 345 542 набора с каждой стороны); доказательства совпадения нет; двумерные веса эту пару различают.
- Для систем тождеств шагов Якоби не хватает уже при $n=7$. Инварианты общего положения перестают различать формы при $n=7$.

НЕ ПЕРЕПРОВЕРЕНО. Алгебра Витта распознаёт формы с двумя вишнями при любом $n$ (для одной вишни, то есть гребёнки, это следует из доказанной инвариантности числа вишен). Набросок: из гипотезы над $\mathbb Q$ следует её аналог для групп (через присоединённое кольцо Ли свободной группы), и тогда разные внешние коммутаторные слова веса не больше 12 задают разные многообразия групп.

ОТКРЫТО. Гипотеза при всех $n$; J1 и J2 при всех $n$ (J2 следует из гипотезы, J1 вместе с J2 сильнее её); положительная характеристика и кольцо целых чисел (размерности там другие: над полем из двух элементов $\dim M_{[F,F'']}=14$ при $n=5$).

ЛИТЕРАТУРА (прочитано по тексту). Книга Бахтурина «Тождества в алгебрах Ли» (1985): коммутатор многообразий определён в п. 4.3.8, теорем о нём нет; упражнение 4.10.20 — случай $n=5$ нашей задачи; теорема о монотонности 4.3.3 и теорема 4.3.7 о свободе полугруппы многообразий относительно умножения. Зайцев (Матем. сб., 1981): леммы 3, 8, 12; лемма 8: из $U\subseteq U'$, $V\subseteq V'$ (ненулевые), $[U,V]=[U',V']$ следует $U+V=U'+V'$. В § 2 той же статьи — пример над любым полем: вербальный идеал $U$, не содержащий $F^{(4)}$, с $[U,F']=[U+F^{(4)},F']$; значит, для ПРОИЗВОЛЬНЫХ вербальных идеалов сокращать в коммутаторе нельзя, и доказательство гипотезы обязано использовать специальный вид идеалов $I_\sigma$. Там же: для $\rho=[[[[c_2,c_2],x],c_2],x]$ верно $[F''',F]\subseteq[I_\rho,F]$ (три применения леммы о трёх идеалах), хотя $F'''\not\subseteq I_\rho$ — включения нельзя сокращать даже для идеалов форм. Зайцев (Алгебра и логика, 1998): многообразия, заданные одним полилинейным одночленом, названы коммутаторными; слова «не был исследован» относятся там к базисному рангу этого класса; лемма 1: при $V\subseteq I$ выполнено $d_I([U,V])=d_I(U)+d_I(V)$, при $I=F'$ это число вишен. Брумберг (Матем. сб., 1969): для групп поставлена задача 3.11 о сокращении в коммутанте вербальных подгрупп; ответ отрицательный (Зайцев, 1981, § 3). Wilson (1974): для групп тот же свободный коммутативный группоид; вопрос об инъективности не ставится. Х. Нейман «Многообразия групп»: утверждения о единственности нет. Не проверены MathSciNet, zbMATH, обзор Бахтурина 2021 года.

МАРШРУТЫ. J — всё следует из Якоби (J1 и J2). T — тонкие алгебры: найти явное семейство с двумерными весами и доказать, что по $\mathrm{Inv}([\alpha,\beta])$ восстанавливается пара $\{\alpha,\beta\}$; сейчас главный кандидат. U — однозначность разложения напрямую, по образцу умножения многообразий. S — «позвоночник» и порядок сомножителей. R — представления $S_n$ (проверить J1 при $n=9$–$11$). C — искать контрпример."""

SUGGEST = {
    "m0": ["Объясни гипотезу на примере n = 4", "Почему буквальная формулировка из тетради неверна?", "Что уже доказано, а что только посчитано?"],
    "m1": ["Какие формы бывают при шести листьях?", "Что такое гребёнка и что такое вишня?"],
    "m2": ["Почему из нильпотентности следует метабелевость, а обратно нет?", "Что значит, что тождества равносильны?"],
    "m3": ["Почему оболочка значений одночлена — идеал?", "Как из однозначности разложения следует гипотеза?"],
    "m4": ["Почему большее подпространство даёт более сильное тождество?", "Разбери доказательство теоремы о сведении"],
    "m5": ["Как устроен сертификат из тонких алгебр?", "Покажи, как алгебра Витта различает две формы с пятью листьями", "Что такое шаг Якоби?"],
    "m6": ["Как по идеалу прочитать число Стралера?", "Почему высота — инвариант?", "На каком примере все инварианты молчат?"],
    "m7": ["Какой маршрут сейчас самый перспективный и почему?", "Почему одной алгебры Витта не хватает?", "Чем коммутатор многообразий труднее умножения?"],
    "m8": ["С чего начать на этой неделе?", "Что отдать Аристотелю в первую очередь?"],
    "m9": ["Проверь меня: задай три вопроса по курсу", "Что прочитано в литературе и чего там нет?"],
}
assert set(SUGGEST) == {m for m, _ in modules}
for text in (RULES, REFERENCE):
    assert text.count("$") % 2 == 0

# The selection-to-cards tool shared by the courses on claude.ai. The site's address (where
# "Отправить на сайт" leads) comes from SEMINAR_SITE_URL, not from this public repo: the site
# has no login. Without it the course asks for the address once.
PICKS = (root / "artifacts" / "picks.js").read_text(encoding="utf-8")
SITE = os.environ.get("SEMINAR_SITE_URL", "").strip()
assert "</script>" not in PICKS.lower()

# ---------------------------------------------------------------- the page
TOKENS = r"""
/* Layout: the site's course as is -- contents on the left, one column of text -- and a drawer for questions on the right. */
:root {
  --bg: #ffffff; --bg-soft: #f6f6f6; --ink: #1a1a1a; --ink-soft: #6e6e6e; --border: #e2e2e2;
  --definition: #7e9b18; --theorem: #1f3a7a; --brief: #7445c9; --brief-border: #cdbdf0; --brief-halo: rgba(116, 69, 201, .09);
  --ok: #1f7a6c; --no: #9c6a1f; --accent: #2a4fb0; --accent-strong: #22418f;
  --even: #2a4fb0; --odd: #b8630a; --soft-note: #fffbe6;
  --veil: rgba(20, 24, 34, .28);
  --f-text: "Literata", Georgia, "Times New Roman", serif;
  --f-ui: "Source Sans 3", "Segoe UI", system-ui, -apple-system, sans-serif;
  --f-mono: ui-monospace, Consolas, "Courier New", monospace;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg: #16181d; --bg-soft: #1f2229; --ink: #e7e9ee; --ink-soft: #9ea5b1; --border: #333843;
    --definition: #b9d353; --theorem: #9db8ff; --brief: #bba2f5; --brief-border: #5b4b8d; --brief-halo: rgba(187, 162, 245, .12);
    --ok: #63cbb8; --no: #e3b56b; --accent: #9db8ff; --accent-strong: #b9ccff;
    --even: #9db8ff; --odd: #f1ad5c; --soft-note: #2b2a1d;
    --veil: rgba(0, 0, 0, .5);
    color-scheme: dark;
  }
}
:root[data-theme="dark"] {
  --bg: #16181d; --bg-soft: #1f2229; --ink: #e7e9ee; --ink-soft: #9ea5b1; --border: #333843;
  --definition: #b9d353; --theorem: #9db8ff; --brief: #bba2f5; --brief-border: #5b4b8d; --brief-halo: rgba(187, 162, 245, .12);
  --ok: #63cbb8; --no: #e3b56b; --accent: #9db8ff; --accent-strong: #b9ccff;
  --even: #9db8ff; --odd: #f1ad5c; --soft-note: #2b2a1d;
  --veil: rgba(0, 0, 0, .5);
  color-scheme: dark;
}
* { box-sizing: border-box; }
[hidden] { display: none !important; }
html { scroll-behavior: smooth; }
@media (prefers-reduced-motion: reduce) { html { scroll-behavior: auto; } * { transition: none !important; } }
body { margin: 0; background: var(--bg); color: var(--ink); font: 15px/1.5 var(--f-ui); -webkit-font-smoothing: antialiased; }
button, input, select, textarea { font: inherit; color: inherit; }
:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 3px; }
.page { max-width: 1160px; margin: 0 auto; padding-inline: 20px; padding-block: 26px 120px; }
"""

SHELL_CSS = r"""
/* ---------- what the copy adds to the site's styles ---------- */
.lecture-toc-side { top: calc(env(safe-area-inset-top, 0px) + 18px); }
.lecture-body [id], .lecture-body .module { scroll-margin-top: 14px; }
.copy-note { font: 13.5px/1.5 var(--f-ui); color: var(--ink-soft); margin: 14px 0 0; }

.ask-fab { position: fixed; right: 18px; bottom: calc(18px + env(safe-area-inset-bottom, 0px)); z-index: 40; border: 1px solid var(--accent); background: var(--accent); color: var(--bg);
  font: 600 14.5px/1 var(--f-ui); padding: 13px 20px; border-radius: 999px; cursor: pointer; box-shadow: 0 8px 22px -10px var(--veil); }
.ask-fab:hover { background: var(--accent-strong); border-color: var(--accent-strong); }
.drawer { position: fixed; top: 0; right: 0; bottom: 0; width: min(460px, 100vw); z-index: 50; background: var(--bg); border-left: 1px solid var(--border);
  box-shadow: -18px 0 40px -24px var(--veil); display: flex; flex-direction: column;
  padding-top: env(safe-area-inset-top, 0px); padding-bottom: env(safe-area-inset-bottom, 0px); }
.drawer-head { display: flex; gap: 10px; align-items: center; justify-content: space-between; padding: 14px 16px 10px; border-bottom: 1px solid var(--border); }
.drawer-head .t { font: 600 19px/1.2 var(--f-text); }
.drawer .x { border: 0; background: none; font: 26px/1 var(--f-ui); color: var(--ink-soft); padding: 2px 8px; cursor: pointer; }
.drawer .x:hover { color: var(--ink); }
.drawer-note { font: 13px/1.45 var(--f-ui); color: var(--ink-soft); padding: 8px 16px 0; }
.msgs { flex: 1; overflow-y: auto; padding: 12px 16px; display: grid; gap: 12px; align-content: start; }
.msg { font: 15.5px/1.6 var(--f-text); min-width: 0; }
.msg .w { display: block; font: 600 11.5px/1.4 var(--f-ui); letter-spacing: .06em; text-transform: uppercase; color: var(--ink-soft); margin-bottom: 2px; }
.msg.me .w { color: var(--accent); }
.msg.me .body { font-style: italic; }
.msg .body { overflow-x: auto; }
.msg .body p { margin: 0 0 10px; }
.msg .body p:last-child { margin-bottom: 0; }
.msg .body ul, .msg .body ol { margin: 0 0 10px; padding-left: 20px; }
.msg .body code { font-family: var(--f-mono); font-size: 13.5px; background: var(--bg-soft); padding: 1px 4px; border-radius: 3px; }
.msg .body mjx-container { max-width: 100%; }
.msg .body mjx-container[display="true"] { overflow-x: auto; overflow-y: hidden; }
.msg .body .small { font: 13px/1.45 var(--f-ui); color: var(--ink-soft); }
.msg.pending .body { color: var(--ink-soft); }
.suggest { display: flex; flex-wrap: wrap; gap: 6px; padding: 0 16px 8px; }
.suggest button { border: 1px solid var(--border); background: var(--bg-soft); border-radius: 999px; padding: 6px 11px; font: 13px/1.25 var(--f-ui); color: var(--ink); text-align: left; cursor: pointer; }
.suggest button:hover { border-color: var(--accent); }
.composer { border-top: 1px solid var(--border); padding: 10px 16px 14px; display: grid; gap: 8px; }
.composer textarea { width: 100%; min-height: 72px; max-height: 40vh; resize: vertical; border: 1px solid var(--border); background: var(--bg); border-radius: 8px; padding: 9px 11px; font: 15.5px/1.45 var(--f-text); }
.composer textarea:focus { border-color: var(--accent); outline: none; }
.composer .row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; justify-content: space-between; }
.composer .btn { display: inline-flex; align-items: center; padding: 6px 12px; border-radius: 7px; border: 1px solid var(--accent); background: none; color: var(--accent); font: 600 13px/1.3 var(--f-ui); cursor: pointer; }
.composer .btn:hover { background: var(--accent); color: var(--bg); }
.composer .btn.solid { background: var(--accent); color: var(--bg); }
.composer .btn.solid:hover { background: var(--accent-strong); }
.composer .btn[disabled] { opacity: .45; cursor: default; }
.chat-err { color: var(--no); font: 13.5px var(--f-ui); }
@media (max-width: 640px) {
  .page { padding-inline: 16px; }
  .drawer { width: 100vw; top: 12vh; border-left: 0; border-top: 1px solid var(--border); border-radius: 14px 14px 0 0; }
  .ask-fab { right: 14px; }
}
@media (min-width: 900px) { body.pk-push { padding-right: min(460px, 100vw); } body.pk-push .ask-fab { display: none; } }
.quote-chip { display: flex; gap: 8px; align-items: flex-start; font: 13.5px/1.45 var(--f-ui); color: var(--ink-soft); border: 1px dashed var(--border); border-radius: 8px; padding: 6px 8px 6px 10px; }
.quote-chip .qc-t { flex: 1; min-width: 0; color: var(--ink); overflow-x: auto; }
.quote-chip .x { font-size: 20px; padding: 0 4px; }
.msg.me .body .q { display: block; margin-top: 6px; padding-left: 8px; border-left: 2px solid var(--border); font-style: normal; color: var(--ink-soft); }
"""

BODY = r"""
<div class="lecture">
<div class="page">
  <div class="lecture-layout">
    <aside class="lecture-toc-side" aria-label="Содержание курса"><nav class="lecture-toc" id="toc-side"></nav></aside>
    <div class="lecture-main">
      <details class="lecture-toc-mobile"><summary>Содержание курса</summary><nav class="lecture-toc" id="toc-mobile"></nav></details>
      <div class="lecture-body" id="lecture-body">
__LECTURE__
      <p class="copy-note" id="ask-na">Кнопка «Спросить лектора» появляется, когда страница открыта в Claude: отвечает Claude от имени твоего аккаунта. Всё остальное — текст, тесты, атлас, калькуляторы — работает и без неё.</p>
      </div>
    </div>
  </div>
</div>
</div>

<button class="ask-fab" id="ask-fab" hidden>Спросить лектора</button>

<aside class="drawer" id="drawer" hidden aria-label="Спросить лектора">
  <div class="drawer-head">
    <span class="t">Спросить лектора</span>
    <button class="x" id="drawer-close" aria-label="Закрыть">×</button>
  </div>
  <div class="drawer-note">Отвечает Claude по тексту курса и по модулю, который ты сейчас читаешь. Гипотеза открыта: ответ лектора — подсказка, а не доказательство; выкладки проверяй.</div>
  <div class="msgs" id="msgs" aria-live="polite"></div>
  <div class="suggest" id="suggest"></div>
  <form class="composer" id="composer">
    <textarea id="chat-in" placeholder="Например: почему из J1 и J2 следует гипотеза?" aria-label="Сообщение"></textarea>
    <div class="row"><span class="chat-err" id="chat-err" aria-live="polite"></span>
      <span class="row"><button type="button" class="btn" id="chat-stop" hidden>Остановить</button><button type="button" class="btn" id="chat-clear">Очистить</button><button type="submit" class="btn solid" id="chat-send">Отправить</button></span></div>
  </form>
</aside>
"""

PAGE_JS = r"""
(function () {
  const L = window.SeminarLecture, DATA = window.LECTURE_DATA;
  const $ = (s) => document.querySelector(s);
  const body = $("#lecture-body");
  L.mountLecture({ root: body, tocs: [$("#toc-side"), $("#toc-mobile")], data: DATA, slug: "monomial-identities", onOpenCard: function () {} });

  // ---------- ask the lecturer (Claude through the `sample` capability) ----------
  const esc = L.esc, setMath = L.setMath;
  const MODULES = Array.from(body.querySelectorAll("section.module")).map((el) => ({ id: el.id, title: el.dataset.title || el.id, el }));
  function currentModule() {
    const a = document.querySelector("#toc-side a.current, #toc-mobile a.current");
    return MODULES.find((m) => a && m.id === a.dataset.toc) || MODULES[0];
  }
  let sample = null, ctl = null, busy = false;
  const history = [];
  const drawer = $("#drawer"), msgs = $("#msgs");
  function renderMD(text) {
    const math = [];
    let t = String(text).replace(/\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\$[^$\n]+?\$|\\\([\s\S]+?\\\)/g, (m) => { math.push(m); return "\u0000" + (math.length - 1) + "\u0000"; });
    t = esc(t);
    const inline = (s) => s.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<i>$2</i>").replace(/`([^`\n]+)`/g, "<code>$1</code>");
    const blocks = t.split(/\n{2,}/).map((b) => {
      const lines = b.split("\n");
      if (lines.every((l) => /^\s*[-*•]\s+/.test(l))) return "<ul>" + lines.map((l) => "<li>" + inline(l.replace(/^\s*[-*•]\s+/, "")) + "</li>").join("") + "</ul>";
      if (lines.every((l) => /^\s*\d+[.)]\s+/.test(l))) return "<ol>" + lines.map((l) => "<li>" + inline(l.replace(/^\s*\d+[.)]\s+/, "")) + "</li>").join("") + "</ol>";
      if (/^#{1,4}\s/.test(lines[0])) return "<p><b>" + inline(lines[0].replace(/^#{1,4}\s/, "")) + "</b>" + (lines.length > 1 ? "<br>" + lines.slice(1).map(inline).join("<br>") : "") + "</p>";
      return "<p>" + lines.map(inline).join("<br>") + "</p>";
    });
    return blocks.join("").replace(/\u0000(\d+)\u0000/g, (_, i) => esc(math[+i]));
  }
  function addMsg(who, text, cls) {
    const d = document.createElement("div");
    d.className = "msg " + (cls || "");
    d.innerHTML = '<span class="w">' + esc(who) + '</span><div class="body"></div>';
    const b = d.querySelector(".body");
    if (text) setMath(b, cls === "me" ? "<p>" + esc(text).split("\n").map((l) => l.startsWith("&gt; ") ? '<span class="q">' + l.slice(5) + "</span>" : l).join("<br>").replace(/<br><span/g, "<span") + "</p>" : renderMD(text));
    msgs.appendChild(d); msgs.scrollTop = msgs.scrollHeight;
    return b;
  }
  function renderSuggest() {
    const list = history.length ? [] : (SUGGEST[currentModule().id] || []);
    $("#suggest").innerHTML = list.map((s) => '<button type="button">' + esc(s) + "</button>").join("");
  }
  function renderChat() {
    msgs.innerHTML = "";
    if (!history.length) addMsg("Лектор", "Спрашивай по курсу и по задаче: определения, шаги доказательств, «а что если». Я вижу, какой модуль у тебя открыт. Гипотеза в общем виде открыта — если попросишь её доказать, я так и скажу и предложу, с чего начать.");
    history.forEach((m) => addMsg(m.role === "user" ? "Ты" : "Лектор", m.shown || m.content, m.role === "user" ? "me" : ""));
    renderSuggest();
  }
  $("#suggest").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) send(b.textContent); });
  // On a wide screen the panel takes its own column and the text moves left (body.pk-push, see
  // artifacts/picks.js); the block being read stays where it was.
  function setDrawer(open) {
    let keep = null;
    for (const el of body.querySelectorAll("section.module > *")) { const r = el.getBoundingClientRect(); if (r.bottom > 90) { keep = { el, top: r.top }; break; } }
    drawer.hidden = !open;
    document.body.classList.toggle("pk-push", open);
    if (keep) { const d = keep.el.getBoundingClientRect().top - keep.top; if (Math.abs(d) > 1) window.scrollTo({ top: window.scrollY + d, behavior: "instant" }); }
  }
  $("#ask-fab").addEventListener("click", () => { const pk = document.querySelector(".pk-panel"); if (pk && !pk.hidden) pk.querySelector(".pk-x").click(); setDrawer(true); renderChat(); $("#chat-in").focus(); });
  $("#drawer-close").addEventListener("click", () => setDrawer(false));
  let askQuote = null;
  function showQuote() {
    let q = $("#quote-chip");
    if (!q) { q = document.createElement("div"); q.id = "quote-chip"; q.className = "quote-chip"; $("#composer").prepend(q); }
    if (!askQuote) { q.hidden = true; $("#chat-in").placeholder = "Например: почему из J1 и J2 следует гипотеза?"; return; }
    q.hidden = false;
    q.innerHTML = '<span>Про это место:</span><span class="qc-t"></span><button type="button" class="x" aria-label="Убрать">×</button>';
    setMath(q.querySelector(".qc-t"), esc(askQuote.text));
    q.querySelector(".x").addEventListener("click", () => { askQuote = null; showQuote(); });
    $("#chat-in").placeholder = "Что именно объяснить? Можно оставить пустым";
  }
  document.addEventListener("pk-ask", (e) => {
    if (!sample) { $("#chat-err").textContent = ""; alert("Лектор недоступен: страница открыта не в Claude."); return; }
    askQuote = e.detail; setDrawer(true); renderChat(); showQuote(); $("#chat-in").focus();
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !drawer.hidden) setDrawer(false); });
  $("#chat-clear").addEventListener("click", () => { if (busy) return; history.length = 0; $("#chat-err").textContent = ""; renderChat(); });
  $("#chat-stop").addEventListener("click", () => { if (ctl) ctl.abort(); });
  $("#composer").addEventListener("submit", (e) => { e.preventDefault(); const v = $("#chat-in").value.trim(); if (v || askQuote) { $("#chat-in").value = ""; send(v || "Объясни это место."); } });
  $("#chat-in").addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); $("#composer").requestSubmit(); } });
  const ERR = {
    not_granted: "Доступ к Claude для этой страницы не разрешён — вопросы лектору недоступны.",
    sampling_disabled: "Claude недоступен для этого аккаунта.",
    rate_limited: "Слишком много запросов подряд. Подожди немного и спроси ещё раз.",
    session_expired: "Сессия истекла — войди в Claude заново.",
    prompt_too_large: "Разговор стал слишком длинным. Нажми «Очистить» и задай вопрос заново.",
    refused: "Claude отказался отвечать на такую формулировку. Попробуй переспросить иначе.",
    empty_completion: "Ответ пустой. Попробуй сформулировать вопрос проще.",
  };
  function unavailable() { sample = null; $("#ask-fab").hidden = true; $("#ask-na").hidden = false; setDrawer(false); }
  async function send(text) {
    if (busy || !sample) return;
    // The place she pointed at (see "pk-ask" below) goes to Claude in full, with its TeX;
    // she sees her question and the fragment as a quote.
    const q = askQuote; askQuote = null; showQuote();
    const full = q ? text + "\n\n" + window.PICKS.quoteFor(q) : text;
    const shown = q ? text + "\n> " + q.text : text;
    history.push({ role: "user", content: full, shown });
    addMsg("Ты", shown, "me");
    $("#suggest").innerHTML = "";
    const b = addMsg("Лектор", "", "pending");
    b.textContent = "Думаю…";
    const mod = currentModule();
    // The module as the reader sees it, without the widgets' own text.
    const clone = mod.el.cloneNode(true);
    clone.querySelectorAll(".quiz, .lab, .done-row, .lec-cards, mjx-assistive-mml").forEach((x) => x.remove());
    clone.querySelectorAll("mjx-container").forEach((x) => x.remove());
    const moduleText = (mod.el.dataset.plain || clone.textContent).replace(/\s+/g, " ").trim().slice(0, 7000);
    const rules = RULES + "\n\n" + REFERENCE + "\n\nСейчас открыт модуль «" + mod.title + "». Его текст (формулы в нём могут быть пропущены):\n" + moduleText;
    busy = true; ctl = new AbortController();
    $("#chat-send").disabled = true; $("#chat-stop").hidden = false; $("#chat-err").textContent = "";
    try {
      const res = await sample([{ role: "user", content: rules }].concat(history.slice(-16).map((m) => ({ role: m.role, content: m.content }))), {
        cache: false, signal: ctl.signal,
        onText: (ev) => { b.textContent = ev.text; msgs.scrollTop = msgs.scrollHeight; },
      });
      history.push({ role: "assistant", content: res.text });
      b.parentElement.classList.remove("pending");
      setMath(b, renderMD(res.text) + (res.truncated ? '<p class="small">Ответ оборвался — спроси покороче или по частям.</p>' : ""));
    } catch (e) {
      b.parentElement.classList.remove("pending");
      if (e && e.text) { history.push({ role: "assistant", content: e.text }); setMath(b, renderMD(e.text)); }
      else { b.parentElement.remove(); history.pop(); }
      if (!e || e.code !== "cancelled") $("#chat-err").textContent = (e && ERR[e.code]) || "Не получилось получить ответ. Попробуй ещё раз.";
      if (e && ["not_granted", "sampling_disabled", "not_declared", "capability_disabled", "capability_removed"].includes(e.code)) unavailable();
    } finally {
      busy = false; ctl = null;
      $("#chat-send").disabled = false; $("#chat-stop").hidden = true;
      msgs.scrollTop = msgs.scrollHeight; renderSuggest();
    }
  }
  if (window.claude && typeof window.claude.use === "function") {
    window.claude.use("sample").then((s) => {
      if (!s) return;
      sample = s;
      $("#ask-fab").hidden = false; $("#ask-na").hidden = true;
    }).catch(function () { /* unavailable: the page works without it */ });
  }
})();
"""


def js_value(value):
    """JSON that is safe inside a <script> element."""
    return json.dumps(value, ensure_ascii=False).replace("<", "\\u003c").replace("\u2028", "\\u2028").replace("\u2029", "\\u2029")


# The module texts as plain text with their TeX kept, for the lecturer: MathJax
# replaces the formulas in the page, so they are taken from the source here.
def plain(fragment):
    fragment = re.sub(r'<div class="(?:quiz|lec-cards|done-row)"[^>]*>.*?</div>', " ", fragment, flags=re.S)
    fragment = re.sub(r'<div class="lab".*?\n</div>', " ", fragment, flags=re.S)
    text = re.sub(r"<[^>]+>", " ", fragment)
    for a, b in (("&lt;", "<"), ("&gt;", ">"), ("&amp;", "&"), ("&nbsp;", " "), ("&larr;", "←"), ("&rarr;", "→")):
        text = text.replace(a, b)
    return re.sub(r"\s+", " ", text).strip()


sections = re.split(r'(?=<section class="module" id="m\d+")', html)
plain_by_id = {}
for sec in sections[1:]:
    mid = re.match(r'<section class="module" id="(m\d+)"', sec).group(1)
    plain_by_id[mid] = plain(sec)[:7000]
assert set(plain_by_id) == set(SUGGEST)
for mid, text in plain_by_id.items():
    marker = f'<section class="module" id="{mid}" '
    assert html.count(marker) == 1
    html = html.replace(marker, f'{marker}data-plain="{text.replace("&", "&amp;").replace(chr(34), "&quot;").replace("<", "&lt;")}" ')

page = "".join([
    "<title>Скобочные тождества алгебр Ли</title>\n",
    '<link rel="preconnect" href="https://fonts.googleapis.com">\n',
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n',
    '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Literata:opsz,wght@7..72,400;7..72,500;7..72,600&family=Source+Sans+3:wght@400;500;600&display=swap">\n',
    "<style>", TOKENS, css, SHELL_CSS, "</style>\n",
    BODY.replace("__LECTURE__", html),
    "<script>\nwindow.MathJax = { tex: { inlineMath: [['$', '$']], displayMath: [['$$', '$$']] }, svg: { fontCache: 'global' },\n"
    "  options: { skipHtmlTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code'] } };\n",
    "window.LECTURE_DATA = ", js_value(data), ";\n",
    "const RULES = ", js_value(RULES), ";\nconst REFERENCE = ", js_value(REFERENCE), ";\nconst SUGGEST = ", js_value(SUGGEST), ";\n",
    "</script>\n<script>\n", js, "\n</script>\n<script>", PAGE_JS, "</script>\n",
    '<script async id="MathJax-script" src="https://cdnjs.cloudflare.com/ajax/libs/mathjax/3.2.2/es5/tex-svg.js"></script>\n',
    # Picking words, formulas, statements into cards for the site's trainer (shared with the other courses).
    '<script>window.PICKS_CONFIG = { project: "monomial-identities", title: "Скобочные тождества алгебр Ли", root: ".lecture-body",\n'
    '  modules: "section.module", reference: REFERENCE, push: "pk-push", closeOther: "#drawer-close", askButton: true, site: ' + js_value(SITE) + ' };</script>\n',
    "<script>\n", PICKS, "\n</script>\n",
])
assert page.lower().count("</script>") == 6, page.lower().count("</script>")
out.write_text(page, encoding="utf-8", newline="\n")
print(f"{out}: {len(page.encode('utf-8')) / 1024:.0f} KB, modules {len(modules)}, quizzes {sum(len(v) for v in data['quizzes'].values())}")
