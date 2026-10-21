import { memo, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { CanvasNode, EntityDetail, EntitySummary, Lang } from "./types";
import { KIND_LABEL_RU, PROOF_LABEL_RU } from "./types";
import { mdBody } from "./markdown";
import { useTypesetHtml } from "./useTypesetHtml";
import { BookmarkButton } from "./BookmarkButton";
import { CardEditor } from "./CardEditor";

interface Props {
  node: CanvasNode;
  detail: EntityDetail;
  allEntities: EntitySummary[];
  zoom: number;
  /** Visible canvas area, in canvas coordinates -- drags stay inside it,
   *  since there's no scrolling to go fetch a card dragged out of view. */
  boundsW: number;
  boundsH: number;
  isTop: boolean;
  enlarged: boolean;
  onToggleEnlarge: (slug: string) => void;
  onRaise: (slug: string) => void;
  onMove: (slug: string, x: number, y: number) => void;
  onResize: (slug: string, scale: number) => void;
  onClose: (slug: string) => void;
  onSetLang: (slug: string, lang: Lang) => void;
  onToggleProof: (slug: string) => void;
  onSetBookmark: (slug: string, on: boolean) => void;
  onGoto: (fromSlug: string, toSlug: string) => void;
  onOpenSource: (detail: EntityDetail) => void;
  /** She saved her own wording of the card (or brought the original back). */
  onEdited: (detail: EntityDetail) => void;
  /** Delete the card (App asks first, closes it, offers to bring it back). */
  onDelete: (slug: string, title: string) => void;
}

// An open editor is wider than a card, and shown at 100% like an enlarged one.
const EDIT_WIDTH = 760;

function TrashIcon() {
  return (
    <svg className="trash-icon" viewBox="0 0 14 16" width="12" height="14" aria-hidden="true">
      <path d="M1 3.5h12M5 3.5V1.5h4v2M2.5 3.5l.8 11h7.4l.8-11M5.6 6.5v5.5M8.4 6.5v5.5" />
    </svg>
  );
}

export const NodeCard = memo(function NodeCard({
  node, detail, allEntities, zoom, boundsW, boundsH, isTop, enlarged, onToggleEnlarge, onRaise, onMove, onResize, onClose,
  onSetLang, onToggleProof, onSetBookmark, onGoto, onOpenSource, onEdited, onDelete,
}: Props) {
  const [dragging, setDragging] = useState(false);
  const [editing, setEditing] = useState(false);
  // Enlarged and editing cards are both shown at 100% on top of the board,
  // kept inside the visible area (there's no panning), and aren't dragged.
  const popped = enlarged || editing;
  const dragState = useRef<{ startX: number; startY: number; origX: number; origY: number; moved: boolean } | null>(null);
  const resizeState = useRef<{ startX: number; startY: number; s0: number; w0: number; h0: number } | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  const title = node.lang === "ru" ? detail.title_ru : detail.title_en;
  const statement = node.lang === "ru" ? detail.statement_ru : detail.statement_en;
  const proof = node.lang === "ru" ? detail.proof_ru : detail.proof_en;
  const hasSource = !!(detail.source && detail.source.page);

  const bodyHtml = mdBody(statement, node.lang, allEntities, node.slug, detail.links);
  const proofHtml = proof ? mdBody(proof, node.lang, allEntities, node.slug) : "";
  const body = useTypesetHtml(bodyHtml);
  const proofBox = useTypesetHtml(proofHtml);

  // Cards stay compact by default (CSS max-width). Only a formula that
  // genuinely doesn't fit at that width should widen the card -- so measure
  // the true rendered width of any display-mode formula after MathJax has
  // typeset it, and grow only when one of them actually overflows.
  useLayoutEffect(() => {
    const card = cardRef.current;
    if (!card || editing) return; // the editor has its own width (see below)
    const displays: HTMLElement[] = [];
    if (body.ref.current) {
      displays.push(...(Array.from(body.ref.current.querySelectorAll('mjx-container[display="true"]')) as HTMLElement[]));
    }
    if (node.proofOpen && proofBox.ref.current) {
      displays.push(...(Array.from(proofBox.ref.current.querySelectorAll('mjx-container[display="true"]')) as HTMLElement[]));
    }
    const widest = displays.reduce((max, el) => Math.max(max, el.scrollWidth), 0);
    const COMPACT_CONTENT_WIDTH = 592; // 640px card minus horizontal padding
    const CARD_PADDING = 40;
    if (widest > COMPACT_CONTENT_WIDTH) {
      card.style.width = `${Math.min(widest + CARD_PADDING, window.innerWidth * 0.95)}px`;
      card.style.maxWidth = "95vw";
    } else {
      card.style.width = "";
      card.style.maxWidth = "";
    }
  }, [body.ready, proofBox.ready, node.proofOpen, node.lang, editing]);

  const scale = node.scale ?? 1;

  // The whole card is a drag handle, except anything clickable. The drag
  // only starts after a few pixels of movement (and only then captures the
  // pointer): capturing on pointerdown would retarget the click to the card
  // itself, silently breaking concept links and the source title.
  const INTERACTIVE = "button, a, input, textarea, select, [data-goto], [data-ext], .has-source, .node-resize, .card-editor";
  function handlePointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.button !== 0 || popped) return;
    if ((e.target as HTMLElement).closest(INTERACTIVE)) return;
    e.preventDefault(); // no text selection while dragging
    onRaise(node.slug);
    dragState.current = { startX: e.clientX, startY: e.clientY, origX: node.x, origY: node.y, moved: false };
  }
  function handlePointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const st = dragState.current;
    if (!st) return;
    if (!st.moved) {
      if (Math.hypot(e.clientX - st.startX, e.clientY - st.startY) < 4) return;
      st.moved = true;
      setDragging(true);
      cardRef.current?.setPointerCapture(e.pointerId);
    }
    const cardW = (cardRef.current?.offsetWidth ?? 440) * scale;
    const x = Math.max(0, Math.min(boundsW - cardW, st.origX + (e.clientX - st.startX) / zoom));
    const y = Math.max(0, Math.min(boundsH - 48, st.origY + (e.clientY - st.startY) / zoom));
    onMove(node.slug, x, y);
  }
  function endDrag() {
    setDragging(false);
    dragState.current = null;
  }

  // Corner grip: scales the whole card (text and formulas too) by how far
  // it's dragged along the diagonal.
  const MIN_SCALE = 0.4;
  const MAX_SCALE = 2.5;
  function handleResizeDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const el = cardRef.current;
    if (!el) return;
    onRaise(node.slug);
    resizeState.current = { startX: e.clientX, startY: e.clientY, s0: scale, w0: el.offsetWidth, h0: el.offsetHeight };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function handleResizeMove(e: ReactPointerEvent<HTMLDivElement>) {
    const st = resizeState.current;
    if (!st) return;
    const grow = ((e.clientX - st.startX) + (e.clientY - st.startY)) / zoom;
    const s = st.s0 * (1 + grow / ((st.w0 + st.h0) * st.s0));
    onResize(node.slug, Math.max(MIN_SCALE, Math.min(MAX_SCALE, s)));
  }
  function endResize() {
    resizeState.current = null;
  }

  // Shown at 100% regardless of canvas zoom: undo the canvas scale on this
  // card, and nudge it so it stays fully on screen (there's no panning).
  let enlargeStyle: React.CSSProperties =
    scale !== 1 ? { transform: `scale(${scale})`, transformOrigin: "0 0" } : {};
  if (popped) {
    const viewW = boundsW * zoom;
    const viewH = boundsH * zoom;
    const ZOOM_BAR_CLEARANCE = 72; // keep clear of the zoom controls pinned bottom-right
    // An editor's width is known before it renders; its height isn't, so it
    // gets all the height there is and scrolls inside past that.
    const w = editing ? Math.min(EDIT_WIDTH, viewW - 24) : cardRef.current?.offsetWidth ?? 520;
    const maxH = viewH - 12 - ZOOM_BAR_CLEARANCE;
    const h = editing ? maxH : Math.min(cardRef.current?.offsetHeight ?? 400, maxH);
    const left = Math.max(12, Math.min(node.x * zoom, viewW - w - 12));
    const top = Math.max(12, Math.min(node.y * zoom, viewH - h - ZOOM_BAR_CLEARANCE));
    enlargeStyle = {
      transform: `translate(${(left - node.x * zoom) / zoom}px, ${(top - node.y * zoom) / zoom}px) scale(${1 / zoom})`,
      transformOrigin: "0 0",
      zIndex: isTop ? 21 : 20,
      maxHeight: maxH,
      overflowY: "auto",
      ...(editing ? { width: w, minWidth: 0, maxWidth: "none" } : {}),
    };
  }

  // Two cards shown at 100% can overlap: the one being worked in comes up.
  const raiseOnTouch = popped && !isTop ? () => onRaise(node.slug) : undefined;

  function onBodyClick(e: React.MouseEvent<HTMLDivElement>) {
    const target = e.target as HTMLElement;
    const gotoEl = target.closest("[data-goto]") as HTMLElement | null;
    if (gotoEl) {
      onGoto(node.slug, gotoEl.dataset.goto!);
    }
  }

  return (
    <div
      ref={cardRef}
      className={`node-card kind-${detail.kind}` + (dragging ? " dragging" : "") + (editing ? " editing" : "")}
      data-slug={node.slug}
      data-scale={scale}
      style={{ left: node.x, top: node.y, zIndex: isTop ? 3 : undefined, ...enlargeStyle }}
      onPointerDownCapture={raiseOnTouch}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <div className="node-drag-handle">
        <div className="kind-line" style={{ color: `var(--${detail.kind})` }}>
          <span className="dot" style={{ background: `var(--${detail.kind})` }} />
          {KIND_LABEL_RU[detail.kind]}
          {!!detail.edited?.length && (
            <span className="level-tag" title="Текст изменён на сайте; исходный можно вернуть в редакторе (✎)">· изменено</span>
          )}
          {detail.deleted && (
            <span className="level-tag" title="Карточка удалена; вернуть её можно в тренажёре, «Удалённые»">· удалена</span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {(zoom < 0.95 || enlarged) && !editing && (
            <button
              className="node-enlarge"
              aria-label={enlarged ? "Уменьшить карточку" : "Увеличить карточку"}
              title={enlarged ? "Уменьшить карточку" : "Увеличить карточку"}
              onClick={() => onToggleEnlarge(node.slug)}
            >
              {enlarged ? "⤡" : "⤢"}
            </button>
          )}
          {detail.kind !== "brief" && !editing && (
            <button
              className="node-edit"
              aria-label="Изменить карточку"
              title="Изменить карточку"
              onClick={() => {
                setEditing(true);
                onRaise(node.slug);
              }}
            >
              ✎
            </button>
          )}
          {detail.kind !== "brief" && !editing && (
            <button
              className="node-delete"
              aria-label="Удалить карточку"
              title="Удалить карточку"
              onClick={() => onDelete(node.slug, detail.title_ru ?? detail.title_en ?? node.slug)}
            >
              <TrashIcon />
            </button>
          )}
          {detail.kind !== "brief" && (
            <BookmarkButton on={!!detail.bookmarked} onToggle={() => onSetBookmark(node.slug, !detail.bookmarked)} />
          )}
          <div className="lang-switch">
            <button aria-selected={node.lang === "ru"} onClick={() => onSetLang(node.slug, "ru")}>RU</button>
            <button aria-selected={node.lang === "en"} onClick={() => onSetLang(node.slug, "en")}>EN</button>
          </div>
          <button className="node-close" aria-label="Закрыть карточку" onClick={() => onClose(node.slug)}>×</button>
        </div>
      </div>
      {/* Hidden, not unmounted, while editing: its typeset text lives outside
          React (useTypesetHtml) and would come back empty after "Отмена". */}
      <div className="node-body" onClick={onBodyClick} hidden={editing}>
        <h3 className={"title" + (hasSource ? " has-source" : "")} onClick={() => hasSource && onOpenSource(detail)}>
          {title}
        </h3>
        {detail.source.label && (
          <div className={"source-label" + (hasSource ? " has-source" : "")} onClick={() => hasSource && onOpenSource(detail)}>
            {detail.source.label}
          </div>
        )}
        <div className="body-text" ref={body.ref} style={{ opacity: body.ready ? 1 : 0 }} />
        {proof && (
          <>
            <button className="proof-toggle" onClick={() => onToggleProof(node.slug)}>
              {node.proofOpen ? "Скрыть" : "Показать"} {PROOF_LABEL_RU(detail.kind)}
            </button>
            <div
              className="proof-body"
              ref={proofBox.ref}
              hidden={!node.proofOpen}
              style={{ opacity: proofBox.ready ? 1 : 0 }}
            />
          </>
        )}
      </div>
      {editing && (
        <CardEditor
          detail={detail}
          lang={node.lang}
          allEntities={allEntities}
          onSaved={(d) => {
            setEditing(false);
            onEdited(d);
          }}
          onCancel={() => setEditing(false)}
        />
      )}
      {!popped && (
        <div
          className="node-resize"
          title="Потяни, чтобы изменить размер. Двойной клик — исходный размер"
          onPointerDown={handleResizeDown}
          onPointerMove={handleResizeMove}
          onPointerUp={endResize}
          onPointerCancel={endResize}
          onDoubleClick={() => onResize(node.slug, 1)}
        />
      )}
    </div>
  );
});
