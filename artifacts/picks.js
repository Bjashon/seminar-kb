/* Набор карточек в курсе на claude.ai -- общий для курсов-артефактов.
 *
 * Выделила в тексте слово, формулу, утверждение -> кнопка «＋ В карточки» -> фрагмент
 * (с TeX-исходником формул и абзацем вокруг) ложится в набор. Или вписала в панели сама
 * («Написать самой»: термин, определение своими словами, формулы в $…$) -> тоже в набор,
 * с пометкой own и модулем, который она читала. В наборе «Сделать карточки»:
 * Claude (capability `sample`) пишет из фрагментов карточки для тренажёра сайта -- формальная
 * формулировка и абзац «Пояснение». «Отправить на сайт» открывает сайт по ссылке
 * <сайт>/#import=<код>; сайт показывает карточки и добавляет их в «Тренажёр по теме» проекта
 * (ImportCards.tsx, POST /projects/<slug>/cards). «Скопировать код» -- то же через вставку на
 * странице проекта, если ссылка не открылась.
 *
 * Набор хранится в личной записи артефакта (`db`: data/users/<id>/picks), один на все
 * устройства; без db -- в этом браузере. Нужны capabilities sample, db, user.
 *
 * Перед этим скриптом страница задаёт window.PICKS_CONFIG:
 *   project   -- slug проекта на сайте ("gerstenhaber")
 *   title     -- название курса
 *   root      -- где выделять (".main")
 *   modules   -- селектор модулей с data-title ("section.module")
 *   reference -- справка по статье для Claude (строка)
 *   push      -- класс body, который сдвигает текст под панель на широком экране
 *   closeOther-- селектор кнопки, закрывающей другую боковую панель (лектора), или null
 *   site      -- адрес сайта по умолчанию (можно поменять в панели)
 *   askButton -- показывать под выделением и кнопку «Спросить про это»: она шлёт событие
 *                "pk-ask" с {text, ctx, module, moduleTitle}; чат курса открывается и
 *                добавляет к вопросу блок window.PICKS.quoteFor(detail) -- фрагмент с TeX и
 *                абзац вокруг, чтобы лектор читал именно это место.
 */
(function () {
  "use strict";
  const C = Object.assign({ root: "body", modules: "section", reference: "", push: "pk-push", closeOther: null, site: "", askButton: false }, window.PICKS_CONFIG || {});
  if (!C.project) return;
  const LOCAL = "pk-picks-v1:" + C.project;
  const KIND = { definition: "Определение", theorem: "Теорема", property: "Свойство" };
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  // ---------------- styles ----------------
  const css = `
.pk-float { position: absolute; z-index: 60; display: flex; gap: 6px; }
.pk-float button { border: 0; border-radius: 999px; padding: 8px 14px; font: 600 14px/1.2 var(--f-ui, "Source Sans 3", system-ui, sans-serif);
  background: var(--accent, #2a4fb0); color: var(--accent-ink, #fff); box-shadow: 0 6px 18px -6px rgba(0,0,0,.45); cursor: pointer; white-space: nowrap; }
.pk-float .pk-ask { background: var(--card, var(--bg, #fff)); color: var(--accent, #2a4fb0); border: 1px solid var(--accent, #2a4fb0); }
.pk-fab { position: fixed; left: 18px; bottom: calc(18px + env(safe-area-inset-bottom, 0px)); z-index: 41; border-radius: 999px; padding: 12px 18px;
  font: 600 15px/1.2 var(--f-ui, "Source Sans 3", system-ui, sans-serif); border: 1px solid var(--accent, #2a4fb0); background: var(--card, var(--bg, #fff)); color: var(--accent, #2a4fb0);
  box-shadow: 0 6px 18px -8px rgba(0,0,0,.4); cursor: pointer; }
.pk-panel { position: fixed; top: 0; right: 0; bottom: 0; width: min(460px, 100vw); z-index: 52; display: flex; flex-direction: column;
  background: var(--card, var(--bg, #fff)); color: var(--ink, #1b1b1b); border-left: 1px solid var(--rule, var(--border, #ddd)); box-shadow: -18px 0 40px -24px rgba(0,0,0,.45);
  padding-top: env(safe-area-inset-top, 0px); padding-bottom: env(safe-area-inset-bottom, 0px); font: 15px/1.5 var(--f-ui, "Source Sans 3", system-ui, sans-serif); }
.pk-panel[hidden], .pk-float[hidden], .pk-fab[hidden], .pk-panel [hidden] { display: none !important; }
.pk-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 14px 16px 10px; border-bottom: 1px solid var(--rule, var(--border, #ddd)); }
.pk-head b { font: 400 22px/1.2 var(--f-display, var(--f-body, Georgia, serif)); }
.pk-x { border: 0; background: none; font: 26px/1 system-ui, sans-serif; color: var(--ink-soft, #666); cursor: pointer; padding: 2px 8px; }
.pk-body { flex: 1; overflow-y: auto; padding: 12px 16px 16px; }
.pk-note { color: var(--ink-soft, #666); font-size: 13.5px; margin: 0 0 12px; }
.pk-h { font: 700 12px/1.3 var(--f-ui, system-ui, sans-serif); letter-spacing: .08em; text-transform: uppercase; color: var(--ink-soft, #666); margin: 16px 0 8px; }
.pk-item, .pk-card { border: 1px solid var(--rule, var(--border, #ddd)); border-radius: 8px; padding: 8px 10px; margin-bottom: 8px; background: var(--paper, var(--bg-soft, #fafafa)); position: relative; }
.pk-item .pk-mod, .pk-card .pk-kind { font-size: 11.5px; letter-spacing: .05em; text-transform: uppercase; color: var(--ink-soft, #666); padding-right: 26px; }
.pk-item .pk-text { font: 15.5px/1.5 var(--f-body, Georgia, serif); padding-right: 22px; }
.pk-card .pk-title { font-weight: 700; margin: 2px 26px 4px 0; }
.pk-card .pk-st { font: 15.5px/1.55 var(--f-body, Georgia, serif); }
.pk-card .pk-st p { margin: 0 0 8px; }
.pk-del { position: absolute; top: 4px; right: 4px; border: 0; background: none; color: var(--ink-soft, #666); font: 20px/1 system-ui, sans-serif; cursor: pointer; padding: 2px 6px; }
.pk-row { display: flex; flex-wrap: wrap; gap: 8px; margin: 10px 0; align-items: center; }
.pk-btn { display: inline-block; text-decoration: none; border: 1px solid var(--accent, #2a4fb0); border-radius: 8px; padding: 8px 13px; background: none; color: var(--accent, #2a4fb0);
  font: 600 14px/1.2 var(--f-ui, system-ui, sans-serif); cursor: pointer; }
.pk-btn.solid { background: var(--accent, #2a4fb0); color: var(--accent-ink, #fff); }
.pk-btn[aria-disabled="true"], .pk-btn:disabled { opacity: .5; pointer-events: none; }
.pk-msg { font-size: 14px; margin: 6px 0; }
.pk-msg.err { color: var(--bad, #b3303a); }
.pk-msg.ok { color: var(--good, #1c7a49); }
.pk-site { font-size: 13px; color: var(--ink-soft, #666); word-break: break-all; }
.pk-site input, .pk-code { width: 100%; font: 13px/1.4 ui-monospace, Consolas, monospace; border: 1px solid var(--rule, var(--border, #ddd)); border-radius: 6px; padding: 6px 8px;
  background: var(--paper, #fff); color: var(--ink, #111); }
.pk-code { min-height: 90px; }
.pk-own textarea { width: 100%; min-height: 76px; resize: vertical; box-sizing: border-box; font: 16px/1.45 var(--f-body, Georgia, serif); border: 1px solid var(--rule, var(--border, #ddd));
  border-radius: 8px; padding: 8px 10px; background: var(--paper, #fff); color: var(--ink, #111); }
.pk-own-prev { font: 15.5px/1.5 var(--f-body, Georgia, serif); margin-top: 6px; padding: 6px 10px; border-left: 3px solid var(--rule, var(--border, #ddd)); }
.pk-own-prev:empty { display: none; }
.pk-own-prev p { margin: 0 0 6px; }
.pk-flash { position: fixed; top: calc(12px + env(safe-area-inset-top, 0px)); left: 50%; transform: translateX(-50%); z-index: 61; padding: 8px 16px; border-radius: 999px;
  background: var(--card, var(--bg, #fff)); color: var(--ink, #111); border: 1px solid var(--rule, var(--border, #ddd)); box-shadow: 0 6px 18px -8px rgba(0,0,0,.4);
  font: 14px/1.3 var(--f-ui, "Source Sans 3", system-ui, sans-serif); white-space: nowrap; }
.pk-flash.bad { color: var(--bad, #b3303a); white-space: normal; max-width: calc(100vw - 32px); }
.pk-panel mjx-container[display="true"] { overflow-x: auto; overflow-y: hidden; max-width: 100%; }
.pk-acts { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
.pk-mini { border: 1px solid var(--rule, var(--border, #ddd)); background: var(--card, var(--bg, #fff)); color: var(--ink-soft, #666); border-radius: 6px; padding: 4px 9px;
  font: 600 12.5px/1.2 var(--f-ui, system-ui, sans-serif); cursor: pointer; }
.pk-mini:hover { color: var(--accent, #2a4fb0); border-color: var(--accent, #2a4fb0); }
.pk-mini.danger:hover { color: var(--bad, #b3303a); border-color: var(--bad, #b3303a); }
.pk-mini.armed, .pk-btn.armed { color: var(--bad, #b3303a); border-color: var(--bad, #b3303a); }
.pk-badge { display: inline-block; margin-left: 6px; padding: 1px 7px; border-radius: 999px; border: 1px solid var(--rule, var(--border, #ddd)); font-size: 10.5px; letter-spacing: .04em; text-transform: none; }
.pk-badge.ok { color: var(--good, #1c7a49); border-color: currentColor; }
.pk-card.pk-sent { opacity: .82; }
.pk-editing { background: var(--card, var(--bg, #fff)); border-color: var(--accent, #2a4fb0); }
.pk-lab { display: block; font: 700 11.5px/1.3 var(--f-ui, system-ui, sans-serif); letter-spacing: .06em; text-transform: uppercase; color: var(--ink-soft, #666); margin: 8px 0 4px; }
.pk-editing input, .pk-editing select, .pk-editing textarea { width: 100%; box-sizing: border-box; border: 1px solid var(--rule, var(--border, #ddd)); border-radius: 6px; padding: 6px 8px;
  background: var(--paper, #fff); color: var(--ink, #111); font: 16px/1.45 var(--f-body, Georgia, serif); }
.pk-editing textarea { resize: vertical; min-height: 120px; font: 14.5px/1.45 ui-monospace, Consolas, monospace; }
.pk-en { margin-top: 8px; }
.pk-en summary { cursor: pointer; font-size: 13px; color: var(--ink-soft, #666); }
.pk-en input, .pk-en textarea { margin-top: 6px; }
@media (min-width: 900px) { body.pk-push { padding-right: min(460px, 100vw); } }
@media (max-width: 640px) { .pk-panel { width: 100vw; top: 12vh; border-left: 0; border-top: 1px solid var(--rule, var(--border, #ddd)); border-radius: 12px 12px 0 0; } .pk-fab { left: 14px; } }
`;
  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);

  // ---------------- state ----------------
  let state = { items: {}, cards: [], site: C.site || "" };
  let ref = null, exists = false, queue = Promise.resolve(), sample = null, busy = false;
  const items = () => Object.entries(state.items || {}).filter(([, v]) => v && v.text).sort((a, b) => (a[1].at || 0) - (b[1].at || 0));
  // Every card has an id (kept in the record), so editing and deleting stay on the right card
  // when the set changes on her other device. Cards made before ids existed get one here, once.
  const newId = () => "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  function giveIds() {
    const cards = state.cards || [];
    if (cards.every((c) => c && c.id)) return false;
    state.cards = cards.filter(Boolean).map((c) => (c.id ? c : Object.assign({}, c, { id: newId() })));
    return true;
  }

  function loadLocal() {
    try { const v = JSON.parse(localStorage.getItem(LOCAL) || "null"); if (v && typeof v === "object") state = Object.assign(state, v); } catch (e) { /* nothing kept */ }
  }
  function saveLocal() { try { localStorage.setItem(LOCAL, JSON.stringify(state)); } catch (e) { /* storage unavailable */ } }
  // One write at a time; `patch` merges into the record (nested objects merge, arrays replace).
  function write(patch, whole) {
    if (!ref) { saveLocal(); return; }
    queue = queue.then(async () => {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          if (whole || !exists) { await ref.set(whole ? state : Object.assign({ items: {}, cards: [], site: state.site || "" }, patch)); exists = true; }
          else await ref.update(patch);
          return;
        } catch (e) {
          if (e && e.code === "invalid_argument" && exists && !whole) { exists = false; continue; }
          if (e && e.code === "unavailable" && attempt === 0) { await new Promise((r) => setTimeout(r, 500 + Math.random() * 500)); continue; }
          if (e && e.code === "quota_exceeded") flash("Набор переполнен: удали часть фрагментов или отправь карточки и очисти набор.", true);
          console.warn("picks not saved", e);
          return;
        }
      }
    });
  }

  // ---------------- capturing a selection ----------------
  const root = () => document.querySelector(C.root) || document.body;
  /** The course's own TeX shorthands (MathJax config macros: \Z, \rp{a}, ...) written out in
   *  standard TeX -- the site's MathJax does not know them and would show a red error. */
  function expandMacros(s) {
    const M = (window.MathJax && window.MathJax.config && window.MathJax.config.tex && window.MathJax.config.tex.macros) || {};
    const names = Object.keys(M).sort((a, b) => b.length - a.length);
    let out = String(s || "");
    if (names.length) {
      const re = new RegExp("\\\\(" + names.join("|") + ")(?![A-Za-z])", "g");
      for (let pass = 0; pass < 4; pass++) {
        re.lastIndex = 0;
        if (!re.test(out)) break;
        re.lastIndex = 0;
        let res = "", i = 0, m;
        while ((m = re.exec(out))) {
          const def = M[m[1]], body = Array.isArray(def) ? def[0] : def, n = Array.isArray(def) ? def[1] || 0 : 0;
          let j = m.index + m[0].length;
          const args = [];
          for (let k = 0; k < n; k++) {
            while (out[j] === " ") j++;
            if (out[j] === "{") {
              const st = j;
              for (let depth = 0; j < out.length; j++) {
                if (out[j] === "{") depth++;
                else if (out[j] === "}" && --depth === 0) { j++; break; }
              }
              args.push(out.slice(st + 1, j - 1));
            } else { args.push(out[j] || ""); j++; }
          }
          res += out.slice(i, m.index) + String(body).replace(/#(\d)/g, (_, d) => args[d - 1] || "");
          i = j; re.lastIndex = j;
        }
        out = res + out.slice(i);
      }
    }
    return out.replace(/\\class\{[^{}]*\}\{((?:[^{}]|\{[^{}]*\})*)\}/g, "$1");
  }
  function mathMap(el) {
    const m = new Map();
    try { for (const it of window.MathJax.startup.document.getMathItemsWithin(el)) m.set(it.typesetRoot, it); } catch (e) { /* MathJax not ready */ }
    return m;
  }
  /** The text of `el` with every typeset formula put back as its TeX source; with `range`, only what it covers. */
  function texText(el, range) {
    const math = mathMap(el);
    let out = "";
    const BLOCK = /^(P|DIV|LI|H[1-6]|TR|SECTION|ASIDE|BLOCKQUOTE|FIGURE|UL|OL|TABLE|DETAILS)$/;
    (function walk(n) {
      if (n.nodeType === 3) {
        if (range && !range.intersectsNode(n)) return;
        let t = n.data;
        if (range) {
          if (n === range.startContainer && n === range.endContainer) t = t.slice(range.startOffset, range.endOffset);
          else if (n === range.startContainer) t = t.slice(range.startOffset);
          else if (n === range.endContainer) t = t.slice(0, range.endOffset);
        }
        out += t;
        return;
      }
      if (n.nodeType !== 1) return;
      const tag = n.tagName;
      if (tag === "MJX-CONTAINER") {
        if (range && !range.intersectsNode(n)) return;
        const it = math.get(n);
        out += it ? (it.display ? "\n$$" + it.math + "$$\n" : "$" + it.math + "$") : (n.textContent || "");
        return;
      }
      if (/^(SCRIPT|STYLE|BUTTON|INPUT|TEXTAREA|SVG)$/.test(tag) || n.classList.contains("pk-float")) return;
      if (tag === "BR") { out += "\n"; return; }
      const block = BLOCK.test(tag);
      if (block && out && !out.endsWith("\n")) out += "\n";
      for (const c of n.childNodes) walk(c);
      if (block && !out.endsWith("\n")) out += "\n";
    })(el);
    return out.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  }
  function blockOf(node) {
    const el = node.nodeType === 1 ? node : node.parentElement;
    return (el && el.closest("p, li, .dlg, .box, .line, td, blockquote, figure, h2, h3, h4, .quiz .q, " + C.modules)) || root();
  }
  function currentPick() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return null;
    const range = sel.getRangeAt(0);
    const r = root();
    if (!r.contains(range.commonAncestorContainer)) return null;
    let anc = range.commonAncestorContainer.nodeType === 1 ? range.commonAncestorContainer : range.commonAncestorContainer.parentElement;
    // A selection that starts or ends inside a formula: take the formula whole, as TeX.
    const inMath = anc && anc.closest("mjx-container");
    if (inMath) anc = inMath.parentElement;
    if (anc && anc.closest(".pk-panel, .pk-float, #drawer, .drawer")) return null;
    const text = expandMacros(texText(anc || r, range));
    if (text.replace(/\s/g, "").length < 2 || text.length > 3000) return null;
    let ctx = expandMacros(texText(blockOf(range.commonAncestorContainer)));
    if (ctx.length > 1600) {
      const at = Math.max(0, ctx.indexOf(text.slice(0, 40)));
      ctx = (at > 700 ? "…" : "") + ctx.slice(Math.max(0, at - 700), at + text.length + 700) + "…";
    }
    const mod = (anc || r).closest(C.modules);
    const modTitle = mod ? (mod.dataset.title || (mod.querySelector("h2, h3") || {}).textContent || mod.id || "") : "";
    return { range, text, ctx: ctx === text ? "" : ctx, module: mod ? mod.id || "" : "", moduleTitle: modTitle.trim().slice(0, 120) };
  }

  // Two buttons under a selection: into the card set, and "ask the lecturer about this place"
  // (the course's chat listens for the "pk-ask" event; see window.PICKS.quoteFor).
  const fl = document.createElement("div");
  fl.className = "pk-float"; fl.hidden = true;
  fl.innerHTML = '<button type="button" class="pk-add">＋ В карточки</button>' + (C.askButton ? '<button type="button" class="pk-ask">Спросить про это</button>' : "");
  document.body.appendChild(fl);
  const addBtn = fl.querySelector(".pk-add"), askBtn = fl.querySelector(".pk-ask");
  let pending = null, selTimer = 0;
  function placeAddButton() {
    pending = currentPick();
    if (!pending) { fl.hidden = true; return; }
    const rects = pending.range.getClientRects();
    const last = rects.length ? rects[rects.length - 1] : pending.range.getBoundingClientRect();
    const touch = matchMedia("(pointer: coarse)").matches;
    fl.hidden = false;
    const w = fl.offsetWidth || 140;
    // Below the selection: a phone shows its own menu above it.
    const top = last.bottom + window.scrollY + (touch ? 34 : 8);
    const left = Math.min(Math.max(8, last.right + window.scrollX - w / 2), window.scrollX + document.documentElement.clientWidth - w - 8);
    fl.style.top = top + "px"; fl.style.left = left + "px";
  }
  document.addEventListener("selectionchange", () => { clearTimeout(selTimer); selTimer = setTimeout(placeAddButton, 220); });
  fl.addEventListener("pointerdown", (e) => e.preventDefault());  // keep the selection
  /** The place she points at, as the lecturer should read it: the fragment with its TeX and the paragraph around. */
  window.PICKS = { quoteFor: (d) => `[Место в курсе${d.moduleTitle ? ", модуль «" + d.moduleTitle + "»" : ""}; формулы в TeX, как в тексте]\nВыделено: ${d.text}` + (d.ctx ? `\nАбзац вокруг: ${d.ctx}` : "") };
  if (askBtn) askBtn.addEventListener("click", () => {
    const p = pending || currentPick();
    if (!p) return;
    document.dispatchEvent(new CustomEvent("pk-ask", { detail: { text: p.text, ctx: p.ctx, module: p.module, moduleTitle: p.moduleTitle } }));
    try { window.getSelection().removeAllRanges(); } catch (e) { /* nothing selected */ }
    fl.hidden = true; pending = null;
  });
  addBtn.addEventListener("click", () => {
    const p = pending || currentPick();
    if (!p) return;
    const id = "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const item = { text: p.text, ctx: p.ctx, module: p.module, moduleTitle: p.moduleTitle, at: Date.now() };
    state.items = Object.assign({}, state.items, { [id]: item });
    write({ items: { [id]: item } });
    try { window.getSelection().removeAllRanges(); } catch (e) { /* nothing selected */ }
    fl.hidden = true; pending = null;
    render();
    flash(`В наборе: ${items().length}`);
  });

  // ---------------- panel ----------------
  const fab = document.createElement("button");
  fab.type = "button"; fab.className = "pk-fab"; fab.hidden = true;
  document.body.appendChild(fab);
  const panel = document.createElement("aside");
  panel.className = "pk-panel"; panel.hidden = true; panel.setAttribute("aria-label", "Набор для карточек");
  panel.innerHTML = `<div class="pk-head"><b>Набор для карточек</b><button class="pk-x" type="button" aria-label="Закрыть">×</button></div><div class="pk-body"></div>`;
  document.body.appendChild(panel);
  const body = panel.querySelector(".pk-body");
  let toastTimer = 0;
  function flash(text, bad) {
    let t = document.querySelector(".pk-flash");
    if (!t) { t = document.createElement("div"); t.className = "pk-flash"; t.setAttribute("role", "status"); document.body.appendChild(t); }
    t.textContent = text; t.classList.toggle("bad", !!bad);
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.remove(), 3500);
  }
  // Keep the block being read in place when the text moves aside for the panel.
  function readingAnchor() {
    for (const el of root().querySelectorAll(C.modules + " > *")) { const r = el.getBoundingClientRect(); if (r.bottom > 90) return { el, top: r.top }; }
    return null;
  }
  function setOpen(open) {
    if (open && C.closeOther) { const x = document.querySelector(C.closeOther); const other = x && x.closest("aside, .drawer"); if (x && other && !other.hidden) x.click(); }
    const keep = readingAnchor();
    panel.hidden = !open;
    document.body.classList.toggle("pk-open", open);
    if (C.push) document.body.classList.toggle(C.push, open);
    if (keep) { const d = keep.el.getBoundingClientRect().top - keep.top; if (Math.abs(d) > 1) window.scrollTo({ top: window.scrollY + d, behavior: "instant" }); }
    if (open) render();
  }
  fab.addEventListener("click", () => setOpen(panel.hidden));
  panel.querySelector(".pk-x").addEventListener("click", () => setOpen(false));

  /** Markdown of a card: paragraphs, **bold**, *italic*; formulas left for MathJax. */
  function md(text) {
    const math = [];
    let t = String(text || "").replace(/\$\$[\s\S]+?\$\$|\$[^$\n]+?\$/g, (m) => { math.push(m); return "\u0001" + (math.length - 1) + "\u0001"; });
    t = esc(t).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<i>$2</i>");
    t = t.split(/\n{2,}/).map((p) => "<p>" + p.replace(/\n/g, "<br>") + "</p>").join("");
    return t.replace(/\u0001(\d+)\u0001/g, (_, i) => esc(math[+i]));
  }
  function typeset(el) {
    const MJ = window.MathJax;
    if (!MJ || !MJ.typesetPromise) return;
    try { if (MJ.typesetClear) MJ.typesetClear([el]); } catch (e) { /* first time */ }
    (MJ.startup && MJ.startup.promise ? MJ.startup.promise : Promise.resolve()).then(() => MJ.typesetPromise([el])).catch((e) => console.warn(e));
  }

  // Only the cards not sent yet: a card that has gone to the site is edited there now.
  function packetCode() {
    const packet = { v: 1, project: C.project, title: C.title || "", cards: (state.cards || []).filter((c) => !c.sent).map((c) => ({
      kind: c.kind, title_ru: c.title_ru, title_en: c.title_en || null, statement_ru: c.statement_ru, statement_en: c.statement_en || null,
      source_label: "Моя карточка из курса" + (c.moduleTitle ? ": " + c.moduleTitle : ""),
    })) };
    const bytes = new TextEncoder().encode(JSON.stringify(packet));
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function siteBase(s) {
    try { const u = new URL(String(s).trim()); if (u.protocol !== "https:" && u.hostname !== "localhost" && u.hostname !== "127.0.0.1") return ""; return u.origin + u.pathname.replace(/\/+$/, ""); } catch (e) { return ""; }
  }

  let note = { text: "", bad: false }, editingSite = false, busyText = "";
  // The card being edited (by id) and what she has typed so far: survives redrawing.
  let editId = null, editDraft = null;
  // A deleting button pressed once waits for a second press (no browser dialogs in an artifact).
  let armed = "", armTimer = 0;
  function arm(key) {
    armed = key; clearTimeout(armTimer);
    armTimer = setTimeout(() => { armed = ""; render(); }, 4000);
    render();
  }
  const sentCards = () => (state.cards || []).filter((c) => c.sent);
  /** Fragments that went into kept cards (sent or edited by her): «Сделать карточки» leaves them alone. */
  const covered = () => new Set((state.cards || []).filter((c) => c.sent || c.edited).flatMap((c) => c.from || []));

  function cardHtml(c) {
    const id = esc(c.id || "");
    const all = (c.from || []).length;
    return `<div class="pk-card${c.sent ? " pk-sent" : ""}"><div class="pk-kind">${KIND[c.kind] || ""}` +
      (c.sent ? `<span class="pk-badge ok">отправлена</span>` : "") + (c.edited ? `<span class="pk-badge">исправлена</span>` : "") + `</div>` +
      `<div class="pk-title">${esc(c.title_ru)}</div><div class="pk-st">${md(c.statement_ru)}</div><div class="pk-acts">` +
      (c.sent ? `<button class="pk-mini" type="button" data-resend="${id}" title="Снова включить в отправку на сайт">Отправить снова</button>`
        : `<button class="pk-mini" type="button" data-edit="${id}">Изменить</button>`) +
      `<button class="pk-mini danger${armed === "card:" + c.id ? " armed" : ""}" type="button" data-card="${id}">${armed === "card:" + c.id ? "Точно удалить?" : "Удалить"}</button>` +
      (all ? `<button class="pk-mini danger${armed === "all:" + c.id ? " armed" : ""}" type="button" data-card-all="${id}">${armed === "all:" + c.id ? "Точно? Нажми ещё раз" : "Удалить с фрагментами"}</button>` : "") +
      `</div></div>`;
  }
  function editorHtml() {
    const d = editDraft;
    return `<div class="pk-card pk-editing">` +
      `<label class="pk-lab">Вид</label><select data-ed="kind">` +
      Object.entries(KIND).map(([k, v]) => `<option value="${k}"${d.kind === k ? " selected" : ""}>${v}</option>`).join("") + `</select>` +
      `<label class="pk-lab">Название</label><input type="text" data-ed="title_ru" value="${esc(d.title_ru)}">` +
      `<label class="pk-lab">Текст карточки</label><textarea data-ed="statement_ru" rows="9">${esc(d.statement_ru)}</textarea>` +
      `<div class="pk-own-prev" data-ed-prev>${d.statement_ru.trim() ? md(d.statement_ru) : ""}</div>` +
      `<details class="pk-en"${d.enOpen ? " open" : ""}><summary>Английская версия — поправь, если меняешь смысл</summary>` +
      `<input type="text" data-ed="title_en" value="${esc(d.title_en || "")}"><textarea data-ed="statement_en" rows="6">${esc(d.statement_en || "")}</textarea></details>` +
      `<div class="pk-row"><button class="pk-btn solid" type="button" data-act="ed-save">Сохранить</button><button class="pk-btn" type="button" data-act="ed-cancel">Отмена</button></div></div>`;
  }
  // What she is typing in "Написать самой": kept in this browser until it goes into the set.
  const DRAFT = LOCAL + ":draft";
  let draft = "";
  try { draft = localStorage.getItem(DRAFT) || ""; } catch (e) { /* storage unavailable */ }
  function render() {
    const list = items();
    // Always there: with an empty set it is the way to the panel, to type a definition in.
    fab.hidden = false;
    fab.textContent = list.length ? `Набор карточек · ${list.length}` : "Набор карточек";
    if (panel.hidden) return;
    const cards = state.cards || [];
    const site = siteBase(state.site);
    // The panel is drawn anew on every change (her other device included): what she is
    // typing, and where the cursor is, must survive that.
    const act = document.activeElement;
    const focusSel = act && body.contains(act) ? (act.matches("[data-own]") ? "[data-own]" : act.dataset && act.dataset.ed ? `[data-ed="${act.dataset.ed}"]` : null) : null;
    const typing = focusSel && typeof act.selectionStart === "number" ? [act.selectionStart, act.selectionEnd] : null;
    const sentFrom = new Set(sentCards().flatMap((c) => c.from || []));
    const fresh = list.filter(([id]) => !covered().has(id));
    const replaced = cards.filter((c) => !c.sent && !c.edited).length;
    const unsent = cards.filter((c) => !c.sent).length;
    let h = `<p class="pk-note">Выделяй в тексте слово, формулу или утверждение и жми «＋ В карточки» — или впиши своё в поле ниже. Потом Claude сделает из собранного карточки с пояснениями, и они уйдут в «Тренажёр по теме» на сайте.</p>`;
    h += `<div class="pk-h">Собрано: ${list.length}</div>`;
    h += list.length ? list.map(([id, it]) => `<div class="pk-item"><div class="pk-mod">${esc((it.own ? "Своё" + (it.moduleTitle ? " · " : "") : "") + (it.moduleTitle || ""))}` +
      (sentFrom.has(id) ? `<span class="pk-badge ok">карточка отправлена</span>` : "") + `</div><div class="pk-text">${md(it.text)}</div><button class="pk-del" type="button" data-del="${id}" aria-label="Удалить фрагмент" title="Удалить фрагмент">×</button></div>`).join("")
      : `<p class="pk-note">Пока пусто.</p>`;
    h += `<div class="pk-h">Написать самой</div><div class="pk-own"><textarea data-own rows="3" placeholder="Термин или определение своими словами; формулы в $…$">${esc(draft)}</textarea>` +
      `<div class="pk-own-prev">${draft.trim() ? md(draft) : ""}</div>` +
      `<div class="pk-row"><button class="pk-btn" type="button" data-act="own-add" ${draft.trim() ? "" : "disabled"}>＋ В набор</button></div></div>`;
    h += `<div class="pk-row"><button class="pk-btn solid" type="button" data-act="make" ${!fresh.length || busy || !sample ? "disabled" : ""}>${busy ? busyText || "Claude пишет карточки…" : replaced ? "Сделать карточки заново" : "Сделать карточки"}</button></div>`;
    if (list.length && !fresh.length && !busy) h += `<p class="pk-note">Все фрагменты уже в отправленных или исправленных карточках. Добавь новые — или удали ненужное.</p>`;
    else if (cards.length - replaced > 0 && !busy) h += `<p class="pk-note">«Сделать карточки» не тронет отправленные и исправленные тобой карточки и возьмёт только остальные фрагменты.</p>`;
    if (!sample) h += `<p class="pk-msg">Claude здесь недоступен, поэтому карточки не сделать. Собранное сохранится.</p>`;
    if (note.text) h += `<p class="pk-msg ${note.bad ? "err" : "ok"}">${esc(note.text)}</p>`;
    if (cards.length) {
      const nSent = cards.length - unsent;
      h += `<div class="pk-h">Карточки: ${cards.length}${nSent ? ` · отправлено ${nSent}` : ""}</div>`;
      h += cards.map((c) => (editId && c.id === editId && editDraft ? editorHtml() : cardHtml(c))).join("");
      if (unsent) {
        const code = packetCode();
        h += `<div class="pk-row">` +
          (site ? `<a class="pk-btn solid" href="${esc(site + "/#import=" + code)}" target="_blank" rel="noopener" data-act="sent"${editId ? ` aria-disabled="true"` : ""}>Отправить на сайт (${unsent})</a>` : "") +
          `<button class="pk-btn" type="button" data-act="copy"${editId ? " disabled" : ""}>Скопировать код</button></div>`;
        if (editId) h += `<p class="pk-msg">Сначала сохрани или отмени правку карточки.</p>`;
        h += `<textarea class="pk-code" readonly hidden></textarea>`;
        h += `<p class="pk-note">${site ? "Сайт откроется в новой вкладке и покажет карточки — останется нажать «Добавить»." : "Впиши ниже адрес сайта, и появится кнопка «Отправить на сайт»."} Если вкладка не открылась: «Скопировать код», потом на сайте страница проекта → «Карточки из курса» → вставить. Уйдут только неотправленные карточки.</p>`;
      } else h += `<p class="pk-note">Все карточки отправлены. Исправлять их теперь можно на сайте (✎ на карточке).</p>`;
      if (nSent) h += `<div class="pk-row"><button class="pk-btn${armed === "drop-sent" ? " armed" : ""}" type="button" data-act="drop-sent">${armed === "drop-sent" ? "Точно убрать? Нажми ещё раз" : `Убрать отправленные (${nSent}) и их фрагменты`}</button></div>`;
    }
    h += `<div class="pk-h">Сайт</div>` + (site && !editingSite
      ? `<div class="pk-site">${esc(site)} <button class="pk-btn" type="button" data-act="site-edit" style="padding:3px 8px;font-size:12.5px">изменить</button></div>`
      : `<div class="pk-site"><input type="url" placeholder="https://…" value="${esc(state.site || "")}" data-site><div class="pk-row"><button class="pk-btn" type="button" data-act="site-save">Сохранить адрес</button></div></div>`);
    body.innerHTML = h;
    typeset(body);
    if (focusSel) {
      const t = body.querySelector(focusSel);
      if (t) { t.focus(); if (typing && typeof t.setSelectionRange === "function") try { t.setSelectionRange(typing[0], typing[1]); } catch (e) { /* not a text field */ } }
    }
  }

  // ---------------- a definition of her own ----------------
  let prevTimer = 0;
  body.addEventListener("input", (e) => {
    // Editing a generated card: what she types lives in editDraft until «Сохранить».
    if (e.target.dataset && e.target.dataset.ed && editDraft) {
      editDraft[e.target.dataset.ed] = e.target.value;
      if (e.target.dataset.ed === "statement_ru") {
        clearTimeout(prevTimer);
        prevTimer = setTimeout(() => { const p = body.querySelector("[data-ed-prev]"); if (p && editDraft) { p.innerHTML = editDraft.statement_ru.trim() ? md(editDraft.statement_ru) : ""; typeset(p); } }, 350);
      }
      return;
    }
    if (!e.target.matches("[data-own]")) return;
    draft = e.target.value;
    try { if (draft) localStorage.setItem(DRAFT, draft); else localStorage.removeItem(DRAFT); } catch (err) { /* storage unavailable */ }
    body.querySelector('[data-act="own-add"]').disabled = !draft.trim();
    // How the formulas come out, as she types.
    clearTimeout(prevTimer);
    prevTimer = setTimeout(() => { const p = body.querySelector(".pk-own-prev"); if (p) { p.innerHTML = draft.trim() ? md(draft) : ""; typeset(p); } }, 350);
  });
  body.addEventListener("keydown", (e) => {
    if (e.target.matches("[data-own]") && e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); addOwn(); }
    else if (e.target.dataset && e.target.dataset.ed && e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); saveEdit(); }
  });
  // The English part folded or open: kept across redrawing (toggle does not bubble).
  body.addEventListener("toggle", (e) => { if (editDraft && e.target.matches && e.target.matches(".pk-en")) editDraft.enOpen = e.target.open; }, true);

  function startEdit(id) {
    const c = (state.cards || []).find((x) => x.id === id);
    if (!c || c.sent) return;
    editId = id;
    editDraft = { kind: c.kind, title_ru: c.title_ru || "", statement_ru: c.statement_ru || "", title_en: c.title_en || "", statement_en: c.statement_en || "", enOpen: false };
    render();
    const t = body.querySelector('[data-ed="statement_ru"]');
    if (t) { t.focus(); t.scrollIntoView({ block: "nearest" }); }
  }
  function saveEdit() {
    const cards = state.cards || [];
    const i = cards.findIndex((c) => c.id === editId);
    if (i < 0 || !editDraft) { editId = null; editDraft = null; note = { text: "Этой карточки уже нет в наборе.", bad: true }; render(); return; }
    const d = editDraft, old = cards[i];
    const title = d.title_ru.replace(/\$/g, "").trim(), st = expandMacros(d.statement_ru.trim());
    if (!title || !st) { note = { text: "У карточки должны быть название и текст.", bad: true }; render(); return; }
    const titleEn = (d.title_en || "").replace(/\$/g, "").trim(), stEn = (d.statement_en || "").trim();
    const nc = Object.assign({}, old, { kind: KIND[d.kind] ? d.kind : old.kind, title_ru: title, statement_ru: st,
      title_en: titleEn || null, statement_en: stEn ? expandMacros(stEn) : null });
    const changed = ["kind", "title_ru", "statement_ru", "title_en", "statement_en"].some((k) => (nc[k] || null) !== (old[k] || null));
    editId = null; editDraft = null; note = { text: "", bad: false };
    if (changed) {
      nc.edited = true;
      state.cards = cards.slice(); state.cards[i] = nc;
      write({ cards: state.cards });
      flash("Карточка исправлена");
    }
    render();
  }
  /** Removes cards (by id); with `withFrags` also the fragments they were made from, unless another card still uses them. */
  function removeCards(ids, withFrags) {
    const drop = new Set(ids);
    const all = state.cards || [];
    const gone = all.filter((c) => drop.has(c.id)), keep = all.filter((c) => !drop.has(c.id));
    if (!gone.length) return;
    let itemsPatch = null;
    if (withFrags) {
      const still = new Set(keep.flatMap((c) => c.from || []));
      const frags = [...new Set(gone.flatMap((c) => c.from || []))].filter((id) => !still.has(id) && state.items && state.items[id]);
      if (frags.length) {
        state.items = Object.assign({}, state.items); itemsPatch = {};
        frags.forEach((id) => { delete state.items[id]; itemsPatch[id] = null; });
      }
    }
    state.cards = keep;
    if (editId && drop.has(editId)) { editId = null; editDraft = null; }
    armed = "";
    write(itemsPatch ? { cards: keep, items: itemsPatch } : { cards: keep });
    render();
    flash(gone.length === 1 ? (itemsPatch ? "Карточка и её фрагменты удалены" : "Карточка удалена") : `Удалено карточек: ${gone.length}`);
  }
  /** Marks the not-yet-sent cards as sent: next time only new ones go to the site. */
  function markSent() {
    const now = Date.now();
    let any = false;
    state.cards = (state.cards || []).map((c) => (c.sent ? c : (any = true, Object.assign({}, c, { sent: now }))));
    if (editId && state.cards.some((c) => c.id === editId && c.sent)) { editId = null; editDraft = null; }
    if (any) write({ cards: state.cards });
  }
  function addOwn() {
    const text = expandMacros(draft.trim());
    if (text.replace(/\s/g, "").length < 2) return;
    if (text.length > 3000) { note = { text: "Слишком длинно для одной карточки — раздели на несколько.", bad: true }; render(); return; }
    // The module she is reading goes with it: Claude gets that module's text as context.
    const anchor = readingAnchor();
    const mod = anchor ? anchor.el.closest(C.modules) : null;
    const modTitle = mod ? (mod.dataset.title || (mod.querySelector("h2, h3") || {}).textContent || mod.id || "") : "";
    const id = "o" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const item = { text, ctx: "", module: mod ? mod.id || "" : "", moduleTitle: modTitle.trim().slice(0, 120), own: true, at: Date.now() };
    state.items = Object.assign({}, state.items, { [id]: item });
    write({ items: { [id]: item } });
    draft = "";
    try { localStorage.removeItem(DRAFT); } catch (err) { /* storage unavailable */ }
    note = { text: "", bad: false };
    render();
    flash(`В наборе: ${items().length}`);
  }

  body.addEventListener("click", async (e) => {
    const t = e.target.closest("[data-del], [data-card], [data-card-all], [data-edit], [data-resend], [data-act]");
    if (!t) return;
    if (t.dataset.del) {
      const id = t.dataset.del;
      state.items = Object.assign({}, state.items); delete state.items[id];
      write({ items: { [id]: null } });
      render(); return;
    }
    if (t.dataset.edit) { startEdit(t.dataset.edit); return; }
    if (t.dataset.card) {
      const key = "card:" + t.dataset.card;
      if (armed !== key) { arm(key); return; }
      removeCards([t.dataset.card], false); return;
    }
    if (t.dataset.cardAll) {
      const key = "all:" + t.dataset.cardAll;
      if (armed !== key) { arm(key); return; }
      removeCards([t.dataset.cardAll], true); return;
    }
    if (t.dataset.resend) {
      state.cards = (state.cards || []).map((c) => (c.id === t.dataset.resend ? Object.assign({}, c, { sent: null }) : c));
      write({ cards: state.cards }); render(); return;
    }
    const act = t.dataset.act;
    if (act === "own-add") addOwn();
    else if (act === "make") make();
    else if (act === "ed-save") saveEdit();
    else if (act === "ed-cancel") { editId = null; editDraft = null; render(); }
    else if (act === "sent") { if (editId) { e.preventDefault(); return; } setTimeout(() => { markSent(); render(); }, 300); }
    else if (act === "copy") {
      const text = "seminar-cards:" + packetCode();
      let ok = false;
      try { await navigator.clipboard.writeText(text); ok = true; } catch (err) { /* no clipboard here */ }
      markSent(); render();
      if (ok) { note = { text: "Код скопирован. На сайте: страница проекта → «Карточки из курса» → вставить.", bad: false }; render(); }
      else {
        // Nothing left to send after marking, so the field is drawn here, with the code in it.
        let ta = body.querySelector(".pk-code");
        if (!ta) { ta = document.createElement("textarea"); ta.className = "pk-code"; ta.readOnly = true; body.appendChild(ta); }
        ta.hidden = false; ta.value = text; ta.focus(); ta.select(); note = { text: "Скопируй код из поля ниже.", bad: false };
      }
    } else if (act === "drop-sent") {
      if (armed !== "drop-sent") { arm("drop-sent"); return; }
      removeCards(sentCards().map((c) => c.id), true);
    } else if (act === "site-edit") { editingSite = true; render(); }
    else if (act === "site-save") {
      const v = siteBase(body.querySelector("[data-site]").value);
      if (!v) { note = { text: "Нужен полный адрес сайта, начиная с https://", bad: true }; render(); return; }
      state.site = v; editingSite = false; note = { text: "", bad: false };
      write({ site: v }); render();
    }
  });

  // ---------------- making cards ----------------
  // She asked (14/10/2026) for full, detailed mathematical definitions, not approximate ones:
  // Claude gets the whole text of the modules the fragments come from, and these demands.
  const RULES = `Ты готовишь карточки для тренажёра с интервальным повторением по курсу «${C.title || ""}». Читает их профессиональный математик, по-русски в первую очередь.
Ниже: справка по статье курса; полный текст модулей курса, из которых взяты фрагменты (формулы в TeX); фрагменты — выделенные ею в тексте (с абзацем вокруг) и написанные ею самой.

ГЛАВНОЕ: каждая карточка содержит ПОЛНОЕ и ТОЧНОЕ математическое утверждение, а не пересказ и не «примерно».
- Определение: объемлющая структура и все условия (над каким полем или кольцом, какая градуировка, однородны ли элементы, есть ли единица, чётность операций); все аксиомы — нумерованным списком, каждая формулой с кванторами («для всех однородных $a,b,c\\in V$»). Символ или понятие, которое само требует определения (не общепринятое), здесь не определяется: у него своя карточка, а здесь стоит её название (см. «КОРОТКО»). Равносильная формулировка — только если статья ею пользуется, и одной строкой.
- Теорема, лемма, предложение: все предположения и точное заключение формулами; номер из статьи — в названии («Теорема 14: …»).
- Факт, свойство, формула: точное утверждение с кванторами и условиями, при которых оно верно.
- Формулировки бери из текста модулей и справки, по существу дословно. Ничего не упрощай и не опускай: ни условий, ни знаков, ни особых случаев («при $\\mathfrak D=0$ …»). Если выделено слово из большого определения — карточка про всё понятие целиком. Если формулировка опирается на другое понятие курса (не общепринятое) — для него отдельная карточка.
- В формулировке нет слов «примерно», «грубо говоря», «по сути», «что-то вроде», «и т. п.».
- Фрагмент с пометкой «написала сама» — не цитата из курса, а её собственный текст: термин, определение или утверждение своими словами, возможно неполное или в своих обозначениях. Карточка по нему пишется по тем же правилам. Есть понятие в курсе или справке — формулировка оттуда; нет — стандартное точное определение из литературы, в её обозначениях, если они корректны. Если в её тексте ошибка (неверный знак, пропущенное условие, не то тождество), в карточке верная формулировка, а в «Пояснении» одной фразой сказано, что исправлено и почему.

КОРОТКО (она просила 19/10/2026: «не пиши простыни»). Карточки повторяют, в том числе на телефоне.
- Одна карточка — одно понятие, одна теорема или один факт. Формулировка — не больше 6–8 строк. Не помещается — раздели: вспомогательные понятия, обозначения, леммы — отдельными карточками.
- Ссылки вместо пересказа: вспомогательное понятие в тексте называй точно так, как называется его карточка (её title_ru, в именительном падеже, регистр не важен: «где $\\|a\\|$ — обращённая чётность»). На сайте такое название само становится ссылкой на карточку. Поэтому title_ru — само понятие в именительном падеже: «Обращённая чётность», а не «Определение обращённой чётности».
- Никаких повторов: что сказано формулой, не пересказывай словами.

Сделай карточки по выделенному: одна карточка на одно понятие, теорему или факт; фрагменты про одно и то же — одна карточка.
Каждая карточка:
- kind: "definition" — понятие или обозначение; "theorem" — теорема, лемма, предложение статьи; "property" — факт, свойство, формула, пример;
- title_ru: короткое название обычным текстом, без $ и без TeX (формулы юникодом: «{1,1}», «n·n!», «𝔇»);
- statement_ru: сначала формулировка, как сказано выше. Формулы в $...$; каждая аксиома и ключевое тождество — отдельной строкой в $$...$$, несколько подряд — одним блоком \\begin{aligned}...\\end{aligned}; списки «1.», «2.» с новой строки; абзацы разделены пустой строкой. Только стандартные команды MathJax (\\mathbb, \\mathfrak, \\operatorname, \\begin{aligned} и т. п.; никаких \\coloneqq, \\llbracket и своих сокращений). В определении первый фрагмент **жирным** — сам определяемый термин. После формулировки — пустая строка и абзац «*Пояснение.* …»: 1–2 коротких предложения — смысл или простой пример, без пересказа формулировки;
- title_en, statement_en — то же по-английски («*Explanation.*»);
- from — номера фрагментов, из которых сделана карточка.

Перед ответом перечитай каждую карточку: названы ли все условия; определён ли каждый символ — в ней самой или в карточке, чьё название в ней стоит (и есть ли такая карточка в ответе); совпадают ли знаки и обозначения со статьёй; нет ли простыни, которую надо разбить. Пиши только то, что есть в статье и курсе или прямо из них следует.

Ответ — только JSON такого вида:
{"cards":[{"kind":"definition","title_ru":"…","statement_ru":"…","title_en":"…","statement_en":"…","from":[1]}]}`;

  const BATCH = 5;  // fragments per request: full definitions are long, a huge answer can be cut off
  const bytes = (s) => new TextEncoder().encode(s).length;
  /** The full text of the modules these fragments come from (TeX restored), within a byte budget. */
  function moduleTexts(batch, budget) {
    const out = [];
    for (const id of [...new Set(batch.map(([, it]) => it.module).filter(Boolean))]) {
      const el = document.getElementById(id);
      if (!el || budget < 3000) continue;
      let t = expandMacros(texText(el));
      while (bytes(t) > Math.min(budget, 60000) && t.length > 3000) t = t.slice(0, Math.floor(t.length * 0.85)) + "\n…";
      budget -= bytes(t);
      out.push(`--- Модуль «${el.dataset.title || id}» ---\n${t}`);
    }
    return out.join("\n\n");
  }
  async function makeBatch(batch, maxBytes) {
    const frag = batch.map(([, it], i) => it.own
      ? `${i + 1}. [написала сама${it.moduleTitle ? `, читая модуль «${it.moduleTitle}»` : ""}]\nТекст: ${it.text}`
      : `${i + 1}. [модуль «${it.moduleTitle || "?"}»]\nВыделено: ${it.text}` + (it.ctx ? `\nАбзац вокруг: ${it.ctx}` : "")).join("\n\n");
    const head = RULES + (C.reference ? "\n\n=== Справка по статье ===\n" + C.reference : "");
    const tail = "\n\n=== Фрагменты ===\n" + frag;
    const mods = moduleTexts(batch, maxBytes - bytes(head) - bytes(tail) - 2000);
    const input = head + (mods ? "\n\n=== Текст модулей курса ===\n" + mods : "") + tail;
    const res = await sample.json([{ role: "user", content: input }], { cache: false, modelTier: "complex" });
    const raw = res && Array.isArray(res.cards) ? res.cards : Array.isArray(res) ? res : [];
    const ids = batch.map(([id]) => id);
    return raw.filter((c) => c && KIND[c.kind] && typeof c.title_ru === "string" && typeof c.statement_ru === "string" && c.title_ru.trim() && c.statement_ru.trim())
      .map((c) => {
        const from = (Array.isArray(c.from) ? c.from : []).map((n) => ids[n - 1]).filter(Boolean);
        const first = from.length ? state.items[from[0]] : null;
        return { kind: c.kind, title_ru: c.title_ru.replace(/\$/g, "").trim(), title_en: typeof c.title_en === "string" ? c.title_en.replace(/\$/g, "").trim() : null,
          statement_ru: expandMacros(c.statement_ru.trim()), statement_en: typeof c.statement_en === "string" ? expandMacros(c.statement_en.trim()) : null, from, moduleTitle: first ? first.moduleTitle : "" };
      });
  }
  async function make() {
    // Cards she has sent or corrected stay; only the remaining fragments go to Claude.
    const done = covered();
    const list = items().filter(([id]) => !done.has(id));
    if (!list.length || !sample || busy) return;
    busy = true; note = { text: "", bad: false }; render();
    let maxBytes = 250000;
    try { const lim = await sample.limits(); if (lim && lim.maxPromptBytes) maxBytes = lim.maxPromptBytes - 6000; } catch (e) { /* default */ }
    const batches = [];
    for (let i = 0; i < list.length; i += BATCH) batches.push(list.slice(i, i + BATCH));
    const cards = [];
    let failed = 0, lastErr = null;
    try {
      for (let b = 0; b < batches.length; b++) {
        busyText = batches.length > 1 ? `Claude пишет карточки… (${b + 1} из ${batches.length})` : "Claude пишет карточки…";
        render();
        try { cards.push(...await makeBatch(batches[b], maxBytes)); }
        catch (err) {
          failed++; lastErr = err;
          if (err && (err.code === "not_granted" || err.code === "rate_limited")) break;
        }
      }
      const why = { not_granted: "Доступ к Claude для этой страницы не разрешён.", rate_limited: "Слишком много запросов подряд — подожди немного.", invalid_json: "Claude ответил не в том виде — нажми ещё раз.", prompt_too_large: "Слишком много текста за раз — убери часть фрагментов." };
      if (lastErr && lastErr.code === "not_granted") sample = null;
      if (!cards.length) note = { text: (lastErr && why[lastErr.code]) || "Claude не вернул ни одной карточки. Попробуй ещё раз или убери лишние фрагменты.", bad: true };
      else {
        const kept = (state.cards || []).filter((c) => c.sent || c.edited);
        state.cards = kept.concat(cards.slice(0, 80).map((c) => Object.assign({ id: newId() }, c)));
        if (editId && !state.cards.some((c) => c.id === editId)) { editId = null; editDraft = null; }
        write({ cards: state.cards });
        note = failed ? { text: `Часть фрагментов не обработана (${failed} из ${batches.length} порций): ${(lastErr && why[lastErr.code]) || "ошибка"}. Готовые карточки ниже; «Сделать карточки заново» повторит всё.`, bad: true }
          : { text: "Проверь карточки: неточное исправь («Изменить»), лишнее удали.", bad: false };
      }
    } finally { busy = false; busyText = ""; render(); }
  }

  // ---------------- connecting ----------------
  loadLocal(); if (giveIds()) saveLocal(); render();
  if (window.claude && typeof window.claude.use === "function") {
    window.claude.use("sample").then((s) => { sample = s; render(); }).catch(() => { /* no Claude here */ });
    Promise.all([window.claude.use("db"), window.claude.use("user")]).then(async ([db, user]) => {
      const uid = db && user ? await user.id() : null;
      if (!db || !uid) return;  // the browser keeps the set
      ref = db.doc("data/users/" + uid + "/picks");
      let first = true;
      ref.onSnapshot((snap) => {
        exists = snap.exists;
        const d = snap.exists ? snap.data() : null;
        if (first) {
          first = false;
          // What this browser collected before the record answered: handed over once.
          let local = null;
          try { local = JSON.parse(localStorage.getItem(LOCAL) || "null"); localStorage.removeItem(LOCAL); } catch (e) { /* nothing */ }
          const merged = { items: Object.assign({}, local && local.items, d && d.items), cards: (d && d.cards && d.cards.length ? d.cards : local && local.cards) || [], site: (d && d.site) || (local && local.site) || C.site || "" };
          state = merged;
          if (local && (Object.keys(local.items || {}).length || (local.cards || []).length || (local.site && !(d && d.site)))) write(null, true);
        } else if (d) {
          state = { items: d.items || {}, cards: d.cards || [], site: d.site || state.site };
        }
        if (giveIds()) write({ cards: state.cards });
        if (editId && !(state.cards || []).some((c) => c.id === editId && !c.sent)) { editId = null; editDraft = null; }
        render();
      }, (e) => console.warn("picks sync stopped", e));
    }).catch(() => { /* the browser keeps the set */ });
  }
})();
