import { useEffect, useState } from "react";
import type { EntityDetail, EntitySummary, ReviewCardOut } from "./types";
import { KIND_LABEL_RU } from "./types";
import { api } from "./api";
import { clozeStatement, clozeTerm, mdBody } from "./markdown";
import { useTypesetHtml } from "./useTypesetHtml";

interface Props {
  allEntities: EntitySummary[];
  details: Record<string, EntityDetail>;
  ensureDetail: (slug: string) => void;
}

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function Trainer({ allEntities, details, ensureDetail }: Props) {
  const [queue, setQueue] = useState<ReviewCardOut[] | null>(null);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [clozeResult, setClozeResult] = useState<{ correct: boolean; term: string } | null>(null);

  function load() {
    api.dueCards().then((cards) => {
      setQueue(shuffle(cards));
      setIndex(0);
      setRevealed(false);
      setClozeResult(null);
    });
  }
  useEffect(load, []);

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

  function next() {
    setIndex((i) => i + 1);
    setRevealed(false);
    setClozeResult(null);
  }

  function grade(g: "again" | "good" | "easy") {
    if (!current) return;
    api.grade(current.slug, g).finally(next);
  }

  if (queue === null) return null;
  if (queue.length === 0) {
    return (
      <div className="trainer">
        <div className="done">
          <p>Пока нечего повторять — открой несколько карточек во вкладке «Карточки», и они появятся здесь.</p>
        </div>
      </div>
    );
  }
  if (!current) {
    return (
      <div className="trainer">
        <div className="done">
          <p>Колода пройдена — {queue.length} карточек.</p>
          <button onClick={load}>Начать заново</button>
        </div>
      </div>
    );
  }
  if (!detail) return null;

  return (
    <div className="trainer">
      <div className="progress">{index + 1} / {queue.length}</div>

      {!isLevel2 && (
        <div className="flashcard">
          <div className="kind-line" style={{ color: `var(--${current.kind})` }}>
            <span className="dot" style={{ background: `var(--${current.kind})` }} />
            {KIND_LABEL_RU[current.kind]}
          </div>
          <h3>{current.title_ru}</h3>
          {!revealed && <button className="reveal-btn" onClick={() => setRevealed(true)}>Показать</button>}
          {revealed && (
            <>
              <div className="answer" ref={answerBox.ref} style={{ opacity: answerBox.ready ? 1 : 0 }} />
              <div className="grade-row">
                <button className="grade-btn" onClick={() => grade("again")}>Ещё раз</button>
                <button className="grade-btn" onClick={() => grade("good")}>Хорошо</button>
                <button className="grade-btn" onClick={() => grade("easy")}>Легко</button>
              </div>
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
          <div className="cloze-body" ref={clozeBox.ref} style={{ opacity: clozeBox.ready ? 1 : 0 }} />
          {!clozeResult && (
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
