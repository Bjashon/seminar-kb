import { useLayoutEffect, useRef, useState } from "react";
import type { CanvasEdge, CanvasNode, EntityDetail, EntitySummary, Lang } from "./types";
import { NodeCard } from "./NodeCard";

interface Props {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  details: Record<string, EntityDetail>;
  allEntities: EntitySummary[];
  onMove: (slug: string, x: number, y: number) => void;
  onClose: (slug: string) => void;
  onSetLang: (slug: string, lang: Lang) => void;
  onToggleProof: (slug: string) => void;
  onGoto: (fromSlug: string, toSlug: string) => void;
  onOpenSource: (detail: EntityDetail) => void;
}

interface Rect { x: number; y: number; w: number; h: number }

function sameLines(a: number[][], b: number[][]): boolean {
  if (a.length !== b.length) return false;
  return a.every((line, i) => line.every((v, j) => Math.abs(v - b[i][j]) < 0.5));
}

function edgePointTowards(rect: Rect, tx: number, ty: number): [number, number] {
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  const dx = tx - cx;
  const dy = ty - cy;
  if (dx === 0 && dy === 0) return [cx, cy];
  const scaleX = dx !== 0 ? rect.w / 2 / Math.abs(dx) : Infinity;
  const scaleY = dy !== 0 ? rect.h / 2 / Math.abs(dy) : Infinity;
  const scale = Math.min(scaleX, scaleY);
  return [cx + dx * scale, cy + dy * scale];
}

export function Canvas({ nodes, edges, details, allEntities, onMove, onClose, onSetLang, onToggleProof, onGoto, onOpenSource }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [lines, setLines] = useState<[number, number, number, number][]>([]);

  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;

    const recompute = () => {
      const rectFor = (slug: string): Rect | null => {
        const el = wrap.querySelector<HTMLDivElement>(`.node-card[data-slug="${slug}"]`);
        if (!el) return null;
        return { x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight };
      };
      const next = edges
        .map((edge) => {
          const a = rectFor(edge.from);
          const b = rectFor(edge.to);
          if (!a || !b) return null;
          const aCx = a.x + a.w / 2, aCy = a.y + a.h / 2;
          const bCx = b.x + b.w / 2, bCy = b.y + b.h / 2;
          const [x1, y1] = edgePointTowards(a, bCx, bCy);
          const [x2, y2] = edgePointTowards(b, aCx, aCy);
          return [x1, y1, x2, y2] as [number, number, number, number];
        })
        .filter((l): l is [number, number, number, number] => l !== null);
      setLines((prev) => (sameLines(prev, next) ? prev : next));
    };

    recompute();
    // MathJax typesets asynchronously after mount/update, which can change
    // card heights after this layout pass already ran -- catch that too.
    const t = setTimeout(recompute, 350);
    return () => clearTimeout(t);
  }, [nodes, edges, details]);

  return (
    <div className="canvas-wrap" ref={wrapRef}>
      {nodes.length === 0 && (
        <div className="canvas-empty-hint">Пусто — найдите определение или теорему в Указателе</div>
      )}
      <svg className="canvas-edges" width={3200} height={2200}>
        {lines.map(([x1, y1, x2, y2], i) => (
          <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#d0d0d0" strokeWidth={2} />
        ))}
      </svg>
      {nodes.map((node) => {
        const detail = details[node.slug];
        if (!detail) return null;
        return (
          <NodeCard
            key={node.slug}
            node={node}
            detail={detail}
            allEntities={allEntities}
            onMove={onMove}
            onClose={onClose}
            onSetLang={onSetLang}
            onToggleProof={onToggleProof}
            onGoto={onGoto}
            onOpenSource={onOpenSource}
          />
        );
      })}
    </div>
  );
}
