import { memo, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { CanvasNode, EntityDetail, EntitySummary, Lang } from "./types";
import { KIND_LABEL_RU } from "./types";
import { mdBody } from "./markdown";
import { useTypesetHtml } from "./useTypesetHtml";

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
  onGoto: (fromSlug: string, toSlug: string) => void;
  onOpenSource: (detail: EntityDetail) => void;
}

export const NodeCard = memo(function NodeCard({
  node, detail, allEntities, zoom, boundsW, boundsH, isTop, enlarged, onToggleEnlarge, onRaise, onMove, onResize, onClose,
  onSetLang, onToggleProof, onGoto, onOpenSource,
}: Props) {
  const [dragging, setDragging] = useState(false);
  const dragState = useRef<{ startX: number; startY: number; origX: number; origY: number; moved: boolean } | null>(null);
  const resizeState = useRef<{ startX: number; startY: number; s0: number; w0: number; h0: number } | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  const title = node.lang === "ru" ? detail.title_ru : detail.title_en;
  const statement = node.lang === "ru" ? detail.statement_ru : detail.statement_en;
  const proof = node.lang === "ru" ? detail.proof_ru : detail.proof_en;
  const hasSource = !!(detail.source && detail.source.page);

  const bodyHtml = mdBody(statement, node.lang, allEntities, node.slug);
  const proofHtml = proof ? mdBody(proof, node.lang, allEntities, node.slug) : "";
  const body = useTypesetHtml(bodyHtml);
  const proofBox = useTypesetHtml(proofHtml);

  // Cards stay compact by default (CSS max-width). Only a formula that
  // genuinely doesn't fit at that width should widen the card -- so measure
  // the true rendered width of any display-mode formula after MathJax has
  // typeset it, and grow only when one of them actually overflows.
  useLayoutEffect(() => {
    const card = cardRef.current;
    if (!card) return;
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
  }, [body.ready, proofBox.ready, node.proofOpen, node.lang]);

  const scale = node.scale ?? 1;

  // The whole card is a drag handle, except anything clickable. The drag
  // only starts after a few pixels of movement (and only then captures the
  // pointer): capturing on pointerdown would retarget the click to the card
  // itself, silently breaking concept links and the source title.
  const INTERACTIVE = "button, a, input, textarea, select, [data-goto], .has-source, .node-resize";
  function handlePointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.button !== 0 || enlarged) return;
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
  if (enlarged) {
    const viewW = boundsW * zoom;
    const viewH = boundsH * zoom;
    const ZOOM_BAR_CLEARANCE = 72; // keep clear of the zoom controls pinned bottom-right
    const w = cardRef.current?.offsetWidth ?? 520;
    const maxH = viewH - 12 - ZOOM_BAR_CLEARANCE;
    const h = Math.min(cardRef.current?.offsetHeight ?? 400, maxH);
    const left = Math.max(12, Math.min(node.x * zoom, viewW - w - 12));
    const top = Math.max(12, Math.min(node.y * zoom, viewH - h - ZOOM_BAR_CLEARANCE));
    enlargeStyle = {
      transform: `translate(${(left - node.x * zoom) / zoom}px, ${(top - node.y * zoom) / zoom}px) scale(${1 / zoom})`,
      transformOrigin: "0 0",
      zIndex: 20,
      maxHeight: maxH,
      overflowY: "auto",
    };
  }

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
      className={"node-card" + (dragging ? " dragging" : "")}
      data-slug={node.slug}
      data-scale={scale}
      style={{ left: node.x, top: node.y, zIndex: isTop ? 3 : undefined, ...enlargeStyle }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <div className="node-drag-handle">
        <div className="kind-line" style={{ color: `var(--${detail.kind})` }}>
          <span className="dot" style={{ background: `var(--${detail.kind})` }} />
          {KIND_LABEL_RU[detail.kind]}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {(zoom < 0.95 || enlarged) && (
            <button
              className="node-enlarge"
              aria-label={enlarged ? "Уменьшить карточку" : "Увеличить карточку"}
              title={enlarged ? "Уменьшить карточку" : "Увеличить карточку"}
              onClick={() => onToggleEnlarge(node.slug)}
            >
              {enlarged ? "⤡" : "⤢"}
            </button>
          )}
          <div className="lang-switch">
            <button aria-selected={node.lang === "ru"} onClick={() => onSetLang(node.slug, "ru")}>RU</button>
            <button aria-selected={node.lang === "en"} onClick={() => onSetLang(node.slug, "en")}>EN</button>
          </div>
          <button className="node-close" aria-label="Закрыть карточку" onClick={() => onClose(node.slug)}>×</button>
        </div>
      </div>
      <div className="node-body" onClick={onBodyClick}>
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
              {node.proofOpen ? "Скрыть доказательство" : "Показать доказательство"}
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
      {!enlarged && (
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
