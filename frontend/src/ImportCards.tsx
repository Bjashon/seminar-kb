import { useEffect, useState } from "react";
import type { CardTarget, EntitySummary, TalkSummary, UserCard } from "./types";
import { KIND_LABEL_RU } from "./types";
import { api } from "./api";
import { escapeHtml, mdBody } from "./markdown";
import { useTypesetHtml } from "./useTypesetHtml";

/** What a course on claude.ai sends: the cards she picked and Claude wrote,
 *  and the project the course belongs to. */
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

/** The decks one can add to, grouped as in the trainer's list. */
function deckGroups(talks: TalkSummary[]): { label: string; talks: TalkSummary[] }[] {
  const mine = talks.filter((t) => /^my_\d+$/.test(t.episode_code));
  const projects = talks.filter((t) => t.episode_code.startsWith("proj_"));
  const papers = talks.filter((t) => !mine.includes(t) && !projects.includes(t));
  return [
    { label: "Мои темы", talks: mine },
    { label: "Проекты", talks: projects },
    { label: "Статьи семинара", talks: papers },
  ].filter((g) => g.talks.length);
}

type Where = CardTarget["kind"];

interface Props {
  /** The code from the link the course opened; null: she pastes it here. */
  code: string | null;
  entities: EntitySummary[];
  onClose: () => void;
  /** Cards added: open their deck (null: "Мой набор"). */
  onAdded: (talkId: number | null) => void;
}

/** "Карточки из курса": shows what a course sent and adds it where she
 *  chooses -- the course's deck, "Мой набор", a ready theme or a new one --
 *  once she says so; a link alone never adds anything. */
export function ImportCards({ code, entities, onClose, onAdded }: Props) {
  const [text, setText] = useState("");
  const [packet, setPacket] = useState<CardsPacket | null>(null);
  const [projectTitle, setProjectTitle] = useState<string | null>(null);
  const [talks, setTalks] = useState<TalkSummary[] | null>(null);
  const [where, setWhere] = useState<Where>("project");
  const [talkId, setTalkId] = useState<number | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ added: number; already: number; talkId: number | null } | null>(null);

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
      .catch(() => setWhere((w) => (w === "project" ? "bookmarks" : w)));
    api.listTalks().then((list) => {
      setTalks(list);
      setTalkId((id) => id ?? list[0]?.id ?? null);
    });
  }, [packet]);

  const html = packet
    ? packet.cards
        .map((c) => `<div class="import-card"><div class="import-kind">${KIND_LABEL_RU[c.kind]}</div><h4>${escapeHtml(c.title_ru)}</h4>${mdBody(c.statement_ru, "ru", entities)}</div>`)
        .join("")
    : "";
  const box = useTypesetHtml(html);

  const courseName = projectTitle ?? packet?.title ?? packet?.project ?? "";
  const target: CardTarget | null =
    where === "project" ? (projectTitle ? { kind: "project" } : null)
    : where === "bookmarks" ? { kind: "bookmarks" }
    : where === "talk" ? (talkId !== null ? { kind: "talk", talk_id: talkId } : null)
    : newTitle.trim() ? { kind: "new", title: newTitle.trim() } : null;
  const placeName =
    where === "project" ? "в тренажёр по теме курса"
    : where === "bookmarks" ? "в «Мой набор»"
    : where === "talk" ? `в тему «${talks?.find((t) => t.id === talkId)?.title ?? "…"}»`
    : `в новую тему «${newTitle.trim() || "…"}»`;

  function add() {
    if (!packet || !target) return;
    setBusy(true);
    api.addUserCards(projectTitle ? packet.project : null, target, packet.cards)
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
            {packet.cards.length} {plural(packet.cards.length, "карточка", "карточки", "карточек")} из курса «{courseName}». Посмотри, выбери, куда добавить, и добавь.
          </p>
        )}
        <div className="import-list" hidden={!packet} ref={box.ref} style={{ opacity: box.ready ? 1 : 0 }} />
        {packet && !result && (
          <fieldset className="import-target">
            <legend>Куда добавить</legend>
            {projectTitle && (
              <label>
                <input type="radio" name="where" checked={where === "project"} onChange={() => setWhere("project")} />
                <span>В тренажёр по теме курса «{projectTitle}»</span>
              </label>
            )}
            <label>
              <input type="radio" name="where" checked={where === "bookmarks"} onChange={() => setWhere("bookmarks")} />
              <span>В «Мой набор»</span>
            </label>
            <label>
              <input type="radio" name="where" checked={where === "talk"} onChange={() => setWhere("talk")} />
              <span>В готовую тему</span>
            </label>
            {where === "talk" && (
              <select value={talkId ?? ""} onChange={(e) => setTalkId(Number(e.target.value))}>
                {talks === null && <option value="">Загрузка…</option>}
                {talks && deckGroups(talks).map((g) => (
                  <optgroup key={g.label} label={g.label}>
                    {g.talks.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
                  </optgroup>
                ))}
              </select>
            )}
            <label>
              <input type="radio" name="where" checked={where === "new"} onChange={() => setWhere("new")} />
              <span>В новую тему</span>
            </label>
            {where === "new" && (
              <input type="text" className="import-new-theme" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Название темы" maxLength={200} autoFocus />
            )}
          </fieldset>
        )}
        {error && <p className="import-error">{error}</p>}
        {result && (
          <p className="import-ok">
            Добавлено {placeName}: {result.added}.{result.already > 0 && ` Уже были там раньше: ${result.already}.`}
          </p>
        )}
        <div className="modal-actions">
          {!packet && <button className="primary" disabled={!text.trim()} onClick={() => read(text)}>Прочитать</button>}
          {packet && !result && (
            <button className="primary" disabled={busy || !target} onClick={add}>
              {busy ? "Добавляю…" : `Добавить ${packet.cards.length} ${placeName}`}
            </button>
          )}
          {result && (
            <button className="primary" onClick={() => onAdded(result.talkId)}>
              {result.talkId === null ? "Открыть «Мой набор»" : "Открыть тренажёр по теме"}
            </button>
          )}
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
