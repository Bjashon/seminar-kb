import { useEffect, useState } from "react";
import type { EntitySummary, UserCard } from "./types";
import { KIND_LABEL_RU } from "./types";
import { api } from "./api";
import { escapeHtml, mdBody } from "./markdown";
import { useTypesetHtml } from "./useTypesetHtml";

/** What a course on claude.ai sends: the cards she picked and Claude wrote,
 *  and the project whose deck they belong to. */
export interface CardsPacket {
  project: string;
  title: string | null;
  cards: UserCard[];
}

const KINDS = new Set(["definition", "theorem", "property"]);

/** The code a course gives: the site's link "…/#import=<code>", the bare
 *  code (base64url of the JSON, maybe prefixed "seminar-cards:"), or the
 *  JSON itself. Throws on anything else. */
export function parseCardsCode(raw: string): CardsPacket {
  let s = raw.trim();
  const at = s.indexOf("#import=");
  if (at >= 0) s = s.slice(at + "#import=".length);
  s = s.replace(/^seminar-cards:/, "").trim();
  let text = s;
  if (!s.startsWith("{")) {
    const b64 = s.replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
    text = new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
  }
  const data = JSON.parse(text);
  if (!data || typeof data.project !== "string" || !/^[a-z0-9-]{1,64}$/.test(data.project) || !Array.isArray(data.cards)) {
    throw new Error("not a packet of cards");
  }
  const cards: UserCard[] = data.cards
    .filter((c: Record<string, unknown>) => c && KINDS.has(String(c.kind)) && typeof c.title_ru === "string" && typeof c.statement_ru === "string")
    .map((c: Record<string, unknown>) => ({
      kind: c.kind as UserCard["kind"],
      title_ru: String(c.title_ru),
      title_en: typeof c.title_en === "string" ? c.title_en : null,
      statement_ru: String(c.statement_ru),
      statement_en: typeof c.statement_en === "string" ? c.statement_en : null,
      source_label: typeof c.source_label === "string" ? c.source_label : null,
    }));
  if (!cards.length) throw new Error("no cards");
  return { project: data.project, title: typeof data.title === "string" ? data.title : null, cards };
}

interface Props {
  /** The code from the link the course opened; null: she pastes it here. */
  code: string | null;
  entities: EntitySummary[];
  onClose: () => void;
  /** Cards added: open their deck. */
  onAdded: (talkId: number) => void;
}

/** "Карточки из курса": shows what a course sent and adds it to the
 *  project's deck once she says so -- a link alone never adds anything. */
export function ImportCards({ code, entities, onClose, onAdded }: Props) {
  const [text, setText] = useState("");
  const [packet, setPacket] = useState<CardsPacket | null>(null);
  const [projectTitle, setProjectTitle] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ added: number; already: number; talkId: number } | null>(null);

  function read(raw: string) {
    try {
      setPacket(parseCardsCode(raw));
      setError(null);
    } catch {
      setPacket(null);
      setError("Не получилось прочитать код. Скопируй его из курса ещё раз, целиком.");
    }
  }
  useEffect(() => {
    if (code) read(code);
  }, [code]);
  useEffect(() => {
    if (!packet) return;
    setProjectTitle(null);
    api.getProject(packet.project)
      .then((p) => setProjectTitle(p.title))
      .catch(() => setError(`На сайте нет проекта «${packet.project}», карточки некуда добавить.`));
  }, [packet]);

  const html = packet
    ? packet.cards
        .map((c) => `<div class="import-card"><div class="import-kind">${KIND_LABEL_RU[c.kind]}</div><h4>${escapeHtml(c.title_ru)}</h4>${mdBody(c.statement_ru, "ru", entities)}</div>`)
        .join("")
    : "";
  const box = useTypesetHtml(html);

  function add() {
    if (!packet) return;
    setBusy(true);
    api.addUserCards(packet.project, packet.cards)
      .then((r) => setResult({ added: r.added.length, already: r.already, talkId: r.talk_id }))
      .catch(() => setError("Сайт не принял карточки. Попробуй ещё раз чуть позже."))
      .finally(() => setBusy(false));
  }

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-label="Карточки из курса">
        <h2>Карточки из курса</h2>
        {!packet && (
          <>
            <p className="hint-line">Вставь сюда код, который дал курс на claude.ai (кнопка «Скопировать код» в наборе карточек).</p>
            <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="seminar-cards:…" autoFocus />
          </>
        )}
        {packet && (
          <p className="hint-line">
            {packet.cards.length} {plural(packet.cards.length, "карточка", "карточки", "карточек")} для тренажёра по теме
            {" «"}{projectTitle ?? packet.title ?? packet.project}{"»"}. Посмотри и добавь.
          </p>
        )}
        <div className="import-list" hidden={!packet} ref={box.ref} style={{ opacity: box.ready ? 1 : 0 }} />
        {error && <p className="import-error">{error}</p>}
        {result && (
          <p className="import-ok">
            Добавлено: {result.added}.{result.already > 0 && ` Уже были раньше: ${result.already}.`}
          </p>
        )}
        <div className="modal-actions">
          {!packet && <button className="primary" disabled={!text.trim()} onClick={() => read(text)}>Прочитать</button>}
          {packet && !result && (
            <button className="primary" disabled={busy || !projectTitle} onClick={add}>
              {busy ? "Добавляю…" : `Добавить ${packet.cards.length} в тренажёр`}
            </button>
          )}
          {result && <button className="primary" onClick={() => onAdded(result.talkId)}>Открыть тренажёр по теме</button>}
          <button onClick={onClose}>{result ? "Закрыть" : "Отмена"}</button>
        </div>
      </div>
    </div>
  );
}

function plural(n: number, one: string, few: string, many: string): string {
  const d = n % 10, h = n % 100;
  if (d === 1 && h !== 11) return one;
  if (d >= 2 && d <= 4 && (h < 12 || h > 14)) return few;
  return many;
}
