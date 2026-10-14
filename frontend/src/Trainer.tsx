import { useEffect, useRef, useState } from "react";
import type { EntityDetail, EntitySummary, ReviewCardOut, TalkSummary } from "./types";
import { KIND_LABEL_RU } from "./types";
import { api } from "./api";
import { clozeStatement, clozeTerm, keepMathWithNeighbours, mdBody, plainTerm, sameTerm } from "./markdown";
import { useTypesetHtml } from "./useTypesetHtml";
import { partLabel, todayIso } from "./dates";
import { BookmarkButton, BookmarkIcon } from "./BookmarkButton";

interface Props {
  allEntities: EntitySummary[];
  details: Record<string, EntityDetail>;
  ensureDetail: (slug: string) => void;
  onOpenCard: (slug: string) => void;
  onOpenBoard: (talkId: number) => void;
  onSetBookmark: (slug: string, on: boolean) => void;
  /** Start the per-article drill for this talk right away (a project page's
   *  "Тренажёр по теме" button). `seq` changes on every request so the same
   *  talk can be asked for twice in a row. */
  request: { talkId: number; seq: number } | null;
  /** The trainer's tab is the one on screen. */
  active: boolean;
  /** A card she made herself was deleted here. */
  onDeleted: (slug: string) => void;
}

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

type TrainerMode = "history" | "foundational" | "article" | "bookmarked";

// Where you are in a deck is kept per deck, on the server (the site has one
// user, and her phone and desktop must continue from the same card): the
// fixed decks (basics, one article, your own set) are long, and switching to
// another one and back -- or reloading the page -- must not send you to card
// 1 again. What is stored is the cards already passed in the current round,
// so a deck that gained a card still resumes at the right place. "History"
// needs none of this: a graded card leaves that queue by itself.
const deckKey = (m: TrainerMode, talkId?: number | null): string | null =>
  m === "history" ? null : m === "article" ? (talkId == null ? null : `article:${talkId}`) : m;

// For a day the position lived in the browser; hand over what is there, once.
const OLD_PREFIX = "trainer-passed-v1:";
async function handOverBrowserProgress(): Promise<void> {
  let keys: string[] = [];
  try {
    keys = Object.keys(localStorage).filter((k) => k.startsWith(OLD_PREFIX));
  } catch {
    return;
  }
  for (const k of keys) {
    try {
      const slugs = JSON.parse(localStorage.getItem(k) ?? "[]");
      if (Array.isArray(slugs) && slugs.length) await api.deckPassed(k.slice(OLD_PREFIX.length), slugs);
      localStorage.removeItem(k);
    } catch {
      /* stays in the browser until the server takes it */
    }
  }
}
/** On a phone a displayed formula a little wider than the card is shrunk to
 *  fit it -- down to 3/4 of its size; one wider still scrolls sideways. */
function fitFormulas(box: HTMLElement | null) {
  if (!box || !window.matchMedia("(max-width: 700px)").matches) return;
  for (const m of box.querySelectorAll<HTMLElement>('mjx-container[display="true"]')) {
    m.style.fontSize = "";
    if (m.scrollWidth <= m.clientWidth + 1) continue;
    const size = parseFloat(getComputedStyle(m).fontSize);
    m.style.fontSize = `${size * Math.max(0.75, (m.clientWidth - 2) / m.scrollWidth)}px`;
  }
}

/** The first card at or after `from` that has not been passed yet. */
function firstOpen(queue: ReviewCardOut[], passed: Set<string>, from: number): number {
  let i = from;
  while (i < queue.length && passed.has(queue[i].slug)) i++;
  return i;
}

export function Trainer({ allEntities, details, ensureDetail, onOpenCard, onOpenBoard, onSetBookmark, request, active, onDeleted }: Props) {
  const [mode, setMode] = useState<TrainerMode>("history");
  // A talk asked for from outside while the mode is still switching to
  // "article" -- the mode effect below would otherwise clear the selection
  // right after it was made.
  const pendingTalk = useRef<number | null>(null);
  const [queue, setQueue] = useState<ReviewCardOut[] | null>(null);
  const [index, setIndex] = useState(0);
  // Cards of the current deck already passed in this round (see deckKey),
  // and which deck the queue on screen belongs to: right after a switch the
  // old deck is still shown until the new one arrives, and an answer given
  // in that moment must be booked to the deck it was given in.
  const [passed, setPassed] = useState<Set<string>>(new Set());
  const [deck, setDeck] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [clozeResult, setClozeResult] = useState<{ correct: boolean; term: string } | null>(null);
  const [talks, setTalks] = useState<TalkSummary[] | null>(null);
  const [selectedTalk, setSelectedTalk] = useState<number | null>(null);
  // The passed cards of every started deck, as the server last told: the
  // article list shows how far each one is.
  const [decks, setDecks] = useState<Record<string, string[]>>({});
  // Only the latest request may fill the queue: switching decks quickly must
  // not let a slow answer for the previous one land on top of the new one.
  const loadSeq = useRef(0);
  const handedOver = useRef<Promise<void> | null>(null);

  function load(m: TrainerMode, talkId?: number, restart = false) {
    const seq = ++loadSeq.current;
    const key = deckKey(m, talkId);
    handedOver.current ??= handOverBrowserProgress();
    const progress = handedOver.current
      .then(() => (key && restart ? api.deckRestart(key) : undefined))
      .then(() => api.deckProgress())
      // Without the server's word the deck still opens, from its first card.
      .catch(() => ({}) as Record<string, string[]>);
    Promise.all([api.dueCards(m, talkId), progress]).then(([cards, all]) => {
      if (seq !== loadSeq.current) return;
      // Only "history" is a grab-bag of whatever's due -- shuffling it is
      // fine. "foundational", "article" and "bookmarked" are a designed
      // learning sequence (the backend topologically orders them by "uses"
      // dependency), so scrambling them would defeat the point.
      const q = m === "history" ? shuffle(cards) : cards;
      const done = new Set<string>(key ? all[key] ?? [] : []);
      setDecks(all);
      setQueue(q);
      setDeck(key);
      setPassed(done);
      setIndex(firstOpen(q, done, 0));
      setRevealed(false);
      setClozeResult(null);
    });
  }
  useEffect(() => {
    if (mode === "article") {
      if (!talks) api.listTalks().then(setTalks);
      if (pendingTalk.current !== null) {
        const talkId = pendingTalk.current;
        pendingTalk.current = null;
        pickArticle(talkId);
        return;
      }
      // Back to the article that was being drilled; otherwise picking one
      // is a separate step (see the picker below).
      if (selectedTalk !== null) load("article", selectedTalk);
      else setQueue(null);
      return;
    }
    load(mode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  useEffect(() => {
    if (!request) return;
    // The deck may be new (cards just sent from a course): the list must know it.
    api.listTalks().then(setTalks);
    if (mode === "article") {
      pickArticle(request.talkId);
    } else {
      pendingTalk.current = request.talkId;
      setMode("article");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request]);

  function pickArticle(talkId: number) {
    setSelectedTalk(talkId);
    load("article", talkId);
  }

  const current = queue?.[index];
  useEffect(() => {
    if (current) ensureDetail(current.slug);
  }, [current, ensureDetail]);

  const detail = current ? details[current.slug] : undefined;
  const isLevel2 = !!current && current.level === 2 && !!clozeTerm(detail?.statement_ru);

  // Hooks must run unconditionally (before any early return below), so both
  // possible bodies are always prepared -- each is just empty when unused.
  const answerHtml = revealed && detail && !isLevel2 ? keepMathWithNeighbours(mdBody(detail.statement_ru, "ru", allEntities, detail.slug, detail.links)) : "";
  const clozeHtml = isLevel2 && detail ? keepMathWithNeighbours(clozeStatement(detail.statement_ru!, "ru", allEntities, detail.slug)) : "";
  const answerBox = useTypesetHtml(answerHtml);
  const clozeBox = useTypesetHtml(clozeHtml);
  useEffect(() => { if (answerBox.ready) fitFormulas(answerBox.ref.current); }, [answerBox.ready, answerBox.ref]);
  useEffect(() => { if (clozeBox.ready) fitFormulas(clozeBox.ref.current); }, [clozeBox.ready, clozeBox.ref]);

  // On a phone the deck buttons and the counter fill the first screen: each
  // new card is brought up to just under the top bar, with them a scroll away
  // above it; with no card (a list, a finished deck) the pane goes to its top.
  // Coming back to the tab leaves the pane where it was.
  const rootRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const placed = useRef<unknown>(null);
  const spot: unknown = current && detail ? current : `${mode}|${selectedTalk}|${queue?.length}`;
  useEffect(() => {
    const pane = rootRef.current?.closest<HTMLElement>(".main-pane");
    if (!active || !pane || placed.current === spot || !window.matchMedia("(max-width: 700px)").matches) return;
    placed.current = spot;
    const card = cardRef.current;
    pane.scrollTop = card ? pane.scrollTop + card.getBoundingClientRect().top - pane.getBoundingClientRect().top - 12 : 0;
  });

  function onLinkClick(e: React.MouseEvent<HTMLDivElement>) {
    const target = e.target as HTMLElement;
    const gotoEl = target.closest("[data-goto]") as HTMLElement | null;
    if (gotoEl) onOpenCard(gotoEl.dataset.goto!);
  }

  const passedHere = queue ? queue.filter((c) => passed.has(c.slug)).length : 0;

  /** The card has been answered or put off: on to the next one not yet passed. */
  function next(slug: string) {
    if (!queue) return;
    const done = new Set(passed);
    if (deck) {
      done.add(slug);
      setPassed(done);
      // The server adds the card to what it has and answers with the whole
      // list -- which may hold cards passed meanwhile on another device.
      const here = deck;
      api.deckPassed(here, [slug]).then((list) => {
        setDecks((d) => ({ ...d, [here]: list }));
        setPassed((p) => (p === done ? new Set(list) : p));
      }).catch(() => { /* the position stays in this page until the next answer gets through */ });
    }
    setIndex(firstOpen(queue, done, index + 1));
    setRevealed(false);
    setClozeResult(null);
  }

  function restart() {
    load(mode, selectedTalk ?? undefined, true);
  }

  function grade(g: "again" | "good" | "easy") {
    if (!current) return;
    const slug = current.slug;
    api.grade(slug, g).finally(() => next(slug));
  }

  /** Only a card she made herself (in a course on claude.ai). */
  function removeMine() {
    if (!current || !window.confirm("Удалить эту карточку? Её можно будет снова прислать из курса.")) return;
    const slug = current.slug;
    api.deleteEntity(slug).then(() => {
      next(slug);
      onDeleted(slug);
    }).catch(() => window.alert("Не получилось удалить карточку."));
  }

  function snooze() {
    if (!current) return;
    const slug = current.slug;
    api.snooze(slug).finally(() => next(slug));
  }

  const modeSwitch = (
    <div className="lang-switch">
      <button aria-selected={mode === "history"} onClick={() => setMode("history")}>По истории</button>
      <button aria-selected={mode === "foundational"} onClick={() => setMode("foundational")}>Базовые понятия</button>
      <button aria-selected={mode === "article"} onClick={() => setMode("article")}>По статьям</button>
      <button className="with-bookmark" aria-selected={mode === "bookmarked"} onClick={() => setMode("bookmarked")}>
        <BookmarkIcon />
        Мой набор
      </button>
    </div>
  );
  const bookmark = current && detail && (
    <BookmarkButton on={!!detail.bookmarked} onToggle={() => onSetBookmark(current.slug, !detail.bookmarked)} />
  );

  if (mode === "article" && selectedTalk === null) {
    // The next talk on the calendar, today's included: whichever part of
    // any paper has the earliest date not yet in the past.
    const today = todayIso();
    const upcoming = (talks ?? [])
      .flatMap((t) => t.parts.map((p) => p.date))
      .filter((d): d is string => !!d && d >= today)
      .sort()[0];
    return (
      <div className="trainer" ref={rootRef}>
        {modeSwitch}
        <div className="article-picker">
          {talks === null && <p>Загрузка списка статей…</p>}
          {talks !== null && talks.length === 0 && <p>Пока нет статей с определениями или свойствами.</p>}
          {talks?.map((t) => {
            const isNext = !!upcoming && t.parts.some((p) => p.date === upcoming);
            const begun = Math.min(decks[deckKey("article", t.id)!]?.length ?? 0, t.entity_count);
            return (
            <div key={t.id} className={"article-row" + (isNext ? " upcoming" : "")}>
              <div className="article-main">
                <div className="article-codes">
                  {t.parts.map((p, i) => {
                    const label = partLabel(p.episode_code, p.date);
                    return (
                      <span key={p.episode_code + i}>
                        {i > 0 && ", "}
                        {p.date === upcoming ? <mark className="marker">{label}</mark> : label}
                      </span>
                    );
                  })}
                  {isNext && <span className="upcoming-tag">ближайший доклад</span>}
                  {begun > 0 && <span className="passed-tag">пройдено {begun} из {t.entity_count}</span>}
                </div>
                <div className="article-title">{t.title}</div>
              </div>
              <span className="article-count" title="определений и свойств">{t.entity_count}</span>
              <div className="article-actions">
                <button onClick={() => pickArticle(t.id)}>Тренажёр</button>
                <button onClick={() => onOpenBoard(t.id)}>Доска</button>
              </div>
            </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (queue === null) return null;
  if (queue.length === 0) {
    return (
      <div className="trainer" ref={rootRef}>
        {modeSwitch}
        {mode === "article" && (
          <button className="article-back" onClick={() => setSelectedTalk(null)}>&larr; К списку статей</button>
        )}
        <div className="done">
          <p>
            {mode === "history"
              ? "Пока нечего повторять — открой несколько карточек во вкладке «Дашборд», и они появятся здесь."
              : mode === "foundational"
              ? "Базовые понятия ещё не размечены."
              : mode === "bookmarked"
              ? "В твоём наборе пока пусто — отметь карточку фиолетовой закладкой на дашборде или здесь, в тренажёре."
              : "В этой статье нет определений или свойств."}
          </p>
        </div>
      </div>
    );
  }
  if (!current) {
    return (
      <div className="trainer" ref={rootRef}>
        {modeSwitch}
        {mode === "article" && (
          <button className="article-back" onClick={() => setSelectedTalk(null)}>&larr; К списку статей</button>
        )}
        <div className="done">
          <p>Колода пройдена — {queue.length} карточек.</p>
          <button onClick={restart}>Начать заново</button>
        </div>
      </div>
    );
  }
  if (!detail) return null;

  return (
    <div className="trainer" ref={rootRef}>
      {modeSwitch}
      {mode === "article" && (
        <button className="article-back" onClick={() => setSelectedTalk(null)}>&larr; К списку статей</button>
      )}
      <div className="progress">
        {(deck ? passedHere : index) + 1} / {queue.length}
        {deck && passedHere > 0 && (
          <button className="restart-btn" onClick={restart} title="Начать эту колоду с первой карточки">с начала</button>
        )}
      </div>

      {!isLevel2 && (
        <div className="flashcard" ref={cardRef}>
          {bookmark}
          <div className="kind-line" style={{ color: `var(--${current.kind})` }}>
            <span className="dot" style={{ background: `var(--${current.kind})` }} />
            {KIND_LABEL_RU[current.kind]}
            {detail.made_by_user && <span className="level-tag">· моя</span>}
          </div>
          <h3>{current.title_ru}</h3>
          {!revealed && (
            <>
              <button className="reveal-btn" onClick={() => setRevealed(true)}>Показать</button>
              <button className="snooze-btn" onClick={snooze}>Отложить</button>
            </>
          )}
          {revealed && (
            <>
              <div className="answer" ref={answerBox.ref} onClick={onLinkClick} style={{ opacity: answerBox.ready ? 1 : 0 }} />
              <div className="grade-row">
                <button className="grade-btn" onClick={() => grade("again")}>Ещё раз</button>
                <button className="grade-btn" onClick={() => grade("good")}>Хорошо</button>
                <button className="grade-btn" onClick={() => grade("easy")}>Легко</button>
              </div>
              <button className="snooze-btn" onClick={snooze}>Отложить</button>
              {detail.made_by_user && <button className="snooze-btn" onClick={removeMine}>Удалить мою карточку</button>}
            </>
          )}
        </div>
      )}

      {isLevel2 && (
        <div className="flashcard cloze" ref={cardRef}>
          {bookmark}
          <div className="kind-line">
            <span className="dot" style={{ background: `var(--${current.kind})` }} />
            {KIND_LABEL_RU[current.kind]}
            <span className="level-tag">· уровень 2 · впиши термин</span>
          </div>
          <div className="cloze-body" ref={clozeBox.ref} onClick={onLinkClick} style={{ opacity: clozeBox.ready ? 1 : 0 }} />
          {!clozeResult && (
            <>
              <button
                className="check-btn"
                onClick={() => {
                  const input = document.getElementById("cloze-input") as HTMLInputElement | null;
                  const term = clozeTerm(detail.statement_ru) ?? "";
                  const correct = sameTerm(input?.value ?? "", term);
                  if (input) input.disabled = true;
                  setClozeResult({ correct, term: plainTerm(term) });
                }}
              >
                Проверить
              </button>
              <button className="snooze-btn" onClick={snooze}>Отложить</button>
            </>
          )}
          {clozeResult && (
            <>
              <div className={"cloze-feedback " + (clozeResult.correct ? "ok" : "no")}>
                {clozeResult.correct ? "Верно." : `Правильный ответ: ${clozeResult.term}`}
              </div>
              <div className="grade-row">
                <button className="grade-btn" onClick={() => grade("again")}>Ещё раз</button>
                <button className="grade-btn" onClick={() => grade("good")}>Хорошо</button>
                <button className="grade-btn" onClick={() => grade("easy")}>Легко</button>
              </div>
            </>
          )}
        </div>
      )}

      <div className="hint">
        {isLevel2
          ? "Уровень 2: по определению вспомни и впиши сам термин."
          : "Уровень 1: узнавание. «Легко» откладывает карточку дальше, чем «Хорошо». Три «Хорошо» подряд или два «Легко» переводят её на уровень 2 (впиши термин)."}
      </div>
    </div>
  );
}
