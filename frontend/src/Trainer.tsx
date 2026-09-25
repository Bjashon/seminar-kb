import { useEffect, useState } from "react";
import type { EntityDetail, EntitySummary, ReviewCardOut, TalkSummary } from "./types";
import { KIND_LABEL_RU } from "./types";
import { api } from "./api";
import { clozeStatement, clozeTerm, mdBody } from "./markdown";
import { useTypesetHtml } from "./useTypesetHtml";
import { formatDate, todayIso } from "./dates";

interface Props {
  allEntities: EntitySummary[];
  details: Record<string, EntityDetail>;
  ensureDetail: (slug: string) => void;
  onOpenCard: (slug: string) => void;
  onOpenBoard: (talkId: number) => void;
}

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

type TrainerMode = "history" | "foundational" | "article";

export function Trainer({ allEntities, details, ensureDetail, onOpenCard, onOpenBoard }: Props) {
  const [mode, setMode] = useState<TrainerMode>("history");
  const [queue, setQueue] = useState<ReviewCardOut[] | null>(null);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [clozeResult, setClozeResult] = useState<{ correct: boolean; term: string } | null>(null);
  const [talks, setTalks] = useState<TalkSummary[] | null>(null);
  const [selectedTalk, setSelectedTalk] = useState<number | null>(null);

  function load(m: TrainerMode, talkId?: number) {
    api.dueCards(m, talkId).then((cards) => {
      // Only "history" is a grab-bag of whatever's due -- shuffling it is
      // fine. "foundational" and "article" are a designed learning sequence
      // (the backend topologically orders them by "uses" dependency), so
      // scrambling them would defeat the point.
      setQueue(m === "history" ? shuffle(cards) : cards);
      setIndex(0);
      setRevealed(false);
      setClozeResult(null);
    });
  }
  useEffect(() => {
    if (mode === "article") {
      // Picking an article is a separate step (see the picker below) --
      // nothing to drill yet until one is chosen.
      setQueue(null);
      setSelectedTalk(null);
      if (!talks) api.listTalks().then(setTalks);
      return;
    }
    load(mode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

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
  const answerHtml = revealed && detail && !isLevel2 ? mdBody(detail.statement_ru, "ru", allEntities, detail.slug) : "";
  const clozeHtml = isLevel2 && detail ? clozeStatement(detail.statement_ru!, "ru", allEntities, detail.slug) : "";
  const answerBox = useTypesetHtml(answerHtml);
  const clozeBox = useTypesetHtml(clozeHtml);

  function onLinkClick(e: React.MouseEvent<HTMLDivElement>) {
    const target = e.target as HTMLElement;
    const gotoEl = target.closest("[data-goto]") as HTMLElement | null;
    if (gotoEl) onOpenCard(gotoEl.dataset.goto!);
  }

  function next() {
    setIndex((i) => i + 1);
    setRevealed(false);
    setClozeResult(null);
  }

  function grade(g: "again" | "good" | "easy") {
    if (!current) return;
    api.grade(current.slug, g).finally(next);
  }

  function snooze() {
    if (!current) return;
    api.snooze(current.slug).finally(next);
  }

  const modeSwitch = (
    <div className="lang-switch">
      <button aria-selected={mode === "history"} onClick={() => setMode("history")}>По истории</button>
      <button aria-selected={mode === "foundational"} onClick={() => setMode("foundational")}>Базовые понятия</button>
      <button aria-selected={mode === "article"} onClick={() => setMode("article")}>По статьям</button>
    </div>
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
      <div className="trainer">
        {modeSwitch}
        <div className="article-picker">
          {talks === null && <p>Загрузка списка статей…</p>}
          {talks !== null && talks.length === 0 && <p>Пока нет статей с определениями или свойствами.</p>}
          {talks?.map((t) => {
            const isNext = !!upcoming && t.parts.some((p) => p.date === upcoming);
            return (
            <div key={t.id} className={"article-row" + (isNext ? " upcoming" : "")}>
              <div className="article-main">
                <div className="article-codes">
                  {t.parts.map((p, i) => {
                    const label = p.date ? `${p.episode_code} · ${formatDate(p.date)}` : p.episode_code;
                    return (
                      <span key={p.episode_code + i}>
                        {i > 0 && ", "}
                        {p.date === upcoming ? <mark className="marker">{label}</mark> : label}
                      </span>
                    );
                  })}
                  {isNext && <span className="upcoming-tag">ближайший доклад</span>}
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
      <div className="trainer">
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
              : "В этой статье нет определений или свойств."}
          </p>
        </div>
      </div>
    );
  }
  if (!current) {
    return (
      <div className="trainer">
        {modeSwitch}
        {mode === "article" && (
          <button className="article-back" onClick={() => setSelectedTalk(null)}>&larr; К списку статей</button>
        )}
        <div className="done">
          <p>Колода пройдена — {queue.length} карточек.</p>
          <button onClick={() => load(mode, selectedTalk ?? undefined)}>Начать заново</button>
        </div>
      </div>
    );
  }
  if (!detail) return null;

  return (
    <div className="trainer">
      {modeSwitch}
      {mode === "article" && (
        <button className="article-back" onClick={() => setSelectedTalk(null)}>&larr; К списку статей</button>
      )}
      <div className="progress">{index + 1} / {queue.length}</div>

      {!isLevel2 && (
        <div className="flashcard">
          <div className="kind-line" style={{ color: `var(--${current.kind})` }}>
            <span className="dot" style={{ background: `var(--${current.kind})` }} />
            {KIND_LABEL_RU[current.kind]}
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
            </>
          )}
        </div>
      )}

      {isLevel2 && (
        <div className="flashcard cloze">
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
                  const correct = (input?.value ?? "").trim().toLowerCase() === term.trim().toLowerCase();
                  if (input) input.disabled = true;
                  setClozeResult({ correct, term });
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
          : "Уровень 1: узнавание. 3 подряд «хорошо/легко» переводят карточку на уровень 2 (впиши термин)."}
      </div>
    </div>
  );
}
