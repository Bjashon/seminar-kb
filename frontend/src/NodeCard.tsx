import { memo, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { CanvasNode, EntityDetail, EntitySummary, Lang } from "./types";
import { KIND_LABEL_RU } from "./types";
import { mdBody } from "./markdown";
import { useTypesetHtml } from "./useTypesetHtml";

interface Props {
  node: CanvasNode;
  detail: EntityDetail;
  allEntities: EntitySummary[];
  onMove: (slug: string, x: number, y: number) => void;
  onClose: (slug: string) => void;
  onSetLang: (slug: string, lang: Lang) => void;
  onToggleProof: (slug: string) => void;
  onGoto: (fromSlug: string, toSlug: string) => void;
  onOpenSource: (detail: EntityDetail) => void;
}

export const NodeCard = memo(function NodeCard({ node, detail, allEntities, onMove, onClose, onSetLang, onToggleProof, onGoto, onOpenSource }: Props) {
  const [dragging, setDragging] = useState(false);
  const dragState = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
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

  function handlePointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest("button")) return;
    setDragging(true);
    dragState.current = { startX: e.clientX, startY: e.clientY, origX: node.x, origY: node.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }
  function handlePointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!dragging || !dragState.current) return;
    const { startX, startY, origX, origY } = dragState.current;
    const x = Math.max(0, Math.min(3100, origX + (e.clientX - startX)));
    const y = Math.max(0, Math.min(2100, origY + (e.clientY - startY)));
    onMove(node.slug, x, y);
  }
  function endDrag() {
    setDragging(false);
    dragState.current = null;
  }

  function onBodyClick(e: React.MouseEvent<HTMLDivElement>) {
    const target = e.target as HTMLElement;
    const gotoEl = target.closest("[data-goto]") as HTMLElement | null;
    if (gotoEl) {
      onGoto(node.slug, gotoEl.dataset.goto!);
    }
  }

  return (
    <div ref={cardRef} className={"node-card" + (dragging ? " dragging" : "")} data-slug={node.slug} style={{ left: node.x, top: node.y }}>
      <div
        className="node-drag-handle"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <div className="kind-line" style={{ color: `var(--${detail.kind})` }}>
          <span className="dot" style={{ background: `var(--${detail.kind})` }} />
          {KIND_LABEL_RU[detail.kind]}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
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
    </div>
  );
});
