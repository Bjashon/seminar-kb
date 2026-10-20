import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { EditableField, EntityDetail, EntitySummary, Lang } from "./types";
import { PROOF_LABEL_RU } from "./types";
import { api } from "./api";
import { mdBody } from "./markdown";
import { useTypesetHtml } from "./useTypesetHtml";

type Draft = Record<EditableField, string>;
const FIELDS: EditableField[] = ["title_ru", "title_en", "statement_ru", "statement_en", "proof_ru", "proof_en"];

function draftOf(d: EntityDetail): Draft {
  return Object.fromEntries(FIELDS.map((f) => [f, d[f] ?? ""])) as Draft;
}

/** A field as the server keeps it (api/entities.py): a title is one line
 *  with single spaces, an empty text is no text. */
function normal(field: EditableField, value: string): string {
  if (field.startsWith("title_")) return value.split(/\s+/).filter(Boolean).join(" ");
  return value.trim() ? value : "";
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** A textarea as tall as its text. A title is one line: Enter is a space. */
function GrowingText({ id, value, onChange, className, oneLine }: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  className: string;
  oneLine?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + el.offsetHeight - el.clientHeight}px`;
  }, [value]);
  return (
    <textarea
      id={id}
      ref={ref}
      className={className}
      rows={1}
      value={value}
      spellCheck={false}
      onChange={(e) => onChange(oneLine ? e.target.value.replace(/\s*\n\s*/g, " ") : e.target.value)}
    />
  );
}

/** The text as the card shows it. Dimmed, not hidden, while MathJax works:
 *  hiding it on every pause in typing would make it blink. */
function Preview({ html, className }: { html: string; className: string }) {
  const box = useTypesetHtml(html);
  return <div className={className} ref={box.ref} style={{ opacity: box.ready ? 1 : 0.35 }} />;
}

/** In Russian, for her: what went wrong and that nothing is lost. */
function failure(e: unknown, what: string): string {
  const status = Number(String((e as Error)?.message ?? "").split(" ")[0]);
  if (status === 404) return "Этой карточки на сервере нет — обнови страницу.";
  if (status === 422) return "Сервер не принял текст: пустое название или слишком длинный текст (больше 20 000 знаков).";
  if (status) return `Не получилось ${what}: сервер ответил ошибкой ${status}. Текст остался здесь — попробуй ещё раз.`;
  return `Не получилось ${what}: нет связи с сервером. Текст остался здесь — попробуй ещё раз.`;
}

interface Props {
  detail: EntityDetail;
  /** Which language's title and texts are edited (the other one's draft is kept). */
  lang: Lang;
  allEntities: EntitySummary[];
  /** Saved, or the original brought back: the card as the server now has it. */
  onSaved: (detail: EntityDetail) => void;
  onCancel: () => void;
  /** Given where the card itself has no RU/EN switch (the trainer). */
  onSetLang?: (lang: Lang) => void;
}

/** Her own wording of a card: title, statement and proof (an explanation on
 *  a definition), TeX as in the content JSON, each text with a live preview
 *  rendered the way the card renders it. Only what changed is sent; the
 *  card's original text stays on the server and can be brought back. */
export function CardEditor({ detail, lang, allEntities, onSaved, onCancel, onSetLang }: Props) {
  const [draft, setDraft] = useState<Draft>(() => draftOf(detail));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const id = useId();

  const title = `title_${lang}` as const;
  const statementField = `statement_${lang}` as const;
  const proofField = `proof_${lang}` as const;
  const set = (field: EditableField) => (value: string) => {
    setDraft((d) => ({ ...d, [field]: value }));
    setError(null);
  };
  const changed = FIELDS.filter((f) => normal(f, draft[f]) !== normal(f, detail[f] ?? ""));

  const statement = useDebounced(draft[statementField], 300);
  const proof = useDebounced(draft[proofField], 300);
  const proofName = PROOF_LABEL_RU(detail.kind);

  async function save() {
    if (busy) return;
    if (!draft.title_ru.trim()) {
      setError("Название на русском не может быть пустым.");
      return;
    }
    if (!changed.length) {
      onCancel();
      return;
    }
    setBusy(true);
    try {
      onSaved(await api.editEntity(detail.slug, Object.fromEntries(changed.map((f) => [f, draft[f]]))));
    } catch (e) {
      setError(failure(e, "сохранить"));
      setBusy(false);
    }
  }

  function cancel() {
    if (changed.length && !window.confirm("Закрыть без сохранения? Правки пропадут.")) return;
    onCancel();
  }

  async function restoreOriginal() {
    if (!window.confirm("Вернуть исходный текст карточки? Все твои правки в ней, на обоих языках, пропадут.")) return;
    setBusy(true);
    try {
      onSaved(await api.restoreEntity(detail.slug));
    } catch (e) {
      setError(failure(e, "вернуть исходный текст"));
      setBusy(false);
    }
  }

  return (
    <div
      className="card-editor"
      onKeyDown={(e) => {
        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          save();
        }
      }}
    >
      <div className="ce-top">
        <span className="ce-hint">
          Формулы — как в исходнике: <code>$…$</code> в строке, <code>$$…$$</code> отдельно; <code>**термин**</code> — определяемое слово.
        </span>
        {onSetLang && (
          <div className="lang-switch">
            <button aria-selected={lang === "ru"} onClick={() => onSetLang("ru")}>RU</button>
            <button aria-selected={lang === "en"} onClick={() => onSetLang("en")}>EN</button>
          </div>
        )}
      </div>

      <label className="ce-label" htmlFor={`${id}-title`}>Название</label>
      <GrowingText id={`${id}-title`} className="ce-input ce-title" value={draft[title]} onChange={set(title)} oneLine />
      {/[$\\]/.test(draft[title]) && (
        <div className="ce-note">Название показывается обычным текстом, формулы в нём не набираются: пиши символами (Z₂, n-алгебра Ли).</div>
      )}

      <label className="ce-label" htmlFor={`${id}-statement`}>Формулировка</label>
      <GrowingText id={`${id}-statement`} className="ce-input ce-text" value={draft[statementField]} onChange={set(statementField)} />
      {statement.trim() && (
        <div className="ce-preview">
          <div className="ce-preview-label">Как на карточке</div>
          <Preview className="body-text" html={mdBody(statement, lang, allEntities, detail.slug, detail.links)} />
        </div>
      )}

      <label className="ce-label" htmlFor={`${id}-proof`}>{proofName[0].toUpperCase() + proofName.slice(1)}</label>
      <GrowingText id={`${id}-proof`} className="ce-input ce-text" value={draft[proofField]} onChange={set(proofField)} />
      {proof.trim() && (
        <div className="ce-preview">
          <div className="ce-preview-label">Как на карточке</div>
          <Preview className="proof-body" html={mdBody(proof, lang, allEntities, detail.slug)} />
        </div>
      )}

      {error && <div className="import-error" role="alert">{error}</div>}
      <div className="ce-actions">
        {!!detail.edited?.length && (
          <button className="ce-restore" onClick={restoreOriginal} disabled={busy}>Вернуть исходный текст</button>
        )}
        <span className="ce-spacer" />
        <button onClick={cancel} disabled={busy}>Отмена</button>
        <button className="primary" onClick={save} disabled={busy}>{busy ? "Сохраняю…" : "Сохранить"}</button>
      </div>
    </div>
  );
}
