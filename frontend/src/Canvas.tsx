import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CanvasEdge, CanvasNode, EntityDetail, EntitySummary, Lang } from "./types";
import { NodeCard } from "./NodeCard";

export interface FocusRequest {
  slug: string;
  n: number;
}

interface Props {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  details: Record<string, EntityDetail>;
  allEntities: EntitySummary[];
  /** A freshly opened board's slugs, in dependency order (basics first),
   *  waiting to be packed into rows once every card has rendered and can be
   *  measured. */
  pendingLayout: string[] | null;
  focus: FocusRequest | null;
  onMove: (slug: string, x: number, y: number) => void;
  onPlaceMany: (positions: Record<string, { x: number; y: number }>) => void;
  onLayoutDone: () => void;
  onClose: (slug: string) => void;
  onSetLang: (slug: string, lang: Lang) => void;
  onToggleProof: (slug: string) => void;
  onGoto: (fromSlug: string, toSlug: string) => void;
  onOpenSource: (detail: EntityDetail) => void;
}

interface Rect { x: number; y: number; w: number; h: number }

// No scrolling/panning (deliberately -- a huge canvas was hard to find your
// way around): the canvas is always exactly the viewport, and zoom is the
// only way to fit more on it.
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 2;
const ZOOM_STEP = 1.2;
const FIT_MARGIN = 40;

const LAYOUT_ORIGIN = 40;
const LAYOUT_GAP_X = 40;
const LAYOUT_GAP_Y = 40;
const MAX_COLUMNS = 8;

interface Size { w: number; h: number }

/** Row-major flow in reading order: cards fill a row left to right, then
 *  the next row. Returns positions plus the bounding box. */
function flowLayout(order: string[], sizes: Map<string, Size>, columns: number) {
  const positions: Record<string, { x: number; y: number }> = {};
  let y = LAYOUT_ORIGIN, r = 0;
  for (let i = 0; i < order.length; i += columns) {
    let x = LAYOUT_ORIGIN, rowH = 0;
    for (const slug of order.slice(i, i + columns)) {
      const s = sizes.get(slug)!;
      positions[slug] = { x, y };
      x += s.w + LAYOUT_GAP_X;
      rowH = Math.max(rowH, s.h);
    }
    r = Math.max(r, x - LAYOUT_GAP_X);
    y += rowH + LAYOUT_GAP_Y;
  }
  return { positions, box: { r, b: y - LAYOUT_GAP_Y } };
}

function clampZoom(z: number): number {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z));
}

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

export function Canvas({
  nodes, edges, details, allEntities, pendingLayout, focus,
  onMove, onPlaceMany, onLayoutDone, onClose, onSetLang, onToggleProof, onGoto, onOpenSource,
}: Props) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [lines, setLines] = useState<[number, number, number, number][]>([]);
  const [view, setView] = useState({ w: 1200, h: 800 });
  const [zoom, setZoom] = useState(1);
  const [topSlug, setTopSlug] = useState<string | null>(null);
  const [layoutShown, setLayoutShown] = useState(true);
  // One card at a time can be shown at 100% on top of a zoomed-out board,
  // to read it without zooming the whole canvas (which can't pan).
  const [enlargedSlug, setEnlargedSlug] = useState<string | null>(null);
  const toggleEnlarge = useCallback((slug: string) => setEnlargedSlug((s) => (s === slug ? null : slug)), []);
  const viewRef = useRef(view);
  viewRef.current = view;
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const prevCountRef = useRef(nodes.length);

  useLayoutEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    const measure = () => {
      // The pane is display:none while another tab is active -- ignore the
      // 0x0 it reports then instead of fitting everything into nothing.
      if (vp.clientWidth > 0 && vp.clientHeight > 0) setView({ w: vp.clientWidth, h: vp.clientHeight });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(vp);
    return () => ro.disconnect();
  }, []);

  const cardEl = (slug: string) =>
    wrapRef.current?.querySelector<HTMLDivElement>(`.node-card[data-slug="${CSS.escape(slug)}"]`) ?? null;

  const zoomToFit = (box: { r: number; b: number }) => {
    if (box.r <= 0 || box.b <= 0) return 1;
    const { w, h } = viewRef.current;
    return clampZoom(Math.min(1, w / (box.r + FIT_MARGIN), h / (box.b + FIT_MARGIN)));
  };
  const contentBox = () => {
    let r = 0, b = 0;
    wrapRef.current?.querySelectorAll<HTMLDivElement>(".node-card").forEach((el) => {
      r = Math.max(r, el.offsetLeft + el.offsetWidth);
      b = Math.max(b, el.offsetTop + el.offsetHeight);
    });
    return { r, b };
  };
  const shrinkToShowAll = () => setZoom((z) => Math.min(z, zoomToFit(contentBox())));

  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;

    const recompute = () => {
      const rectFor = (slug: string): Rect | null => {
        const el = cardEl(slug);
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
    const grew = nodes.length > prevCountRef.current;
    prevCountRef.current = nodes.length;
    // MathJax typesets asynchronously after mount/update, which can change
    // card heights after this layout pass already ran -- catch that too.
    // A newly opened card must never land outside the visible area: zoom
    // out just enough to show everything (never zooms in on its own).
    const t = setTimeout(() => {
      recompute();
      if (grew && !pendingLayout) shrinkToShowAll();
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges, details, zoom]);

  // Pack a freshly opened board by measured card size -- heights depend on
  // the typeset formulas, so a fixed grid would overlap. Cards flow in
  // dependency order (basics first, like reading), and the column count is
  // whichever makes the whole board fit the screen at the largest zoom: a
  // deep chain of dependencies laid out one level per row came out tall and
  // narrow, and had to be shrunk to an unreadable 25%.
  useEffect(() => {
    if (!pendingLayout) return;
    setLayoutShown(false);
    setEnlargedSlug(null);
    const apply = (requireAll: boolean) => {
      const sizes = new Map<string, Size>();
      for (const slug of pendingLayout) {
        const el = cardEl(slug);
        if (el) sizes.set(slug, { w: el.offsetWidth, h: el.offsetHeight });
        else if (requireAll) return null;
      }
      const order = pendingLayout.filter((s) => sizes.has(s));
      const { w, h } = viewRef.current;
      let best: { positions: Record<string, { x: number; y: number }>; fit: number } | null = null;
      for (let columns = 1; columns <= Math.min(MAX_COLUMNS, Math.max(order.length, 1)); columns++) {
        const { positions, box } = flowLayout(order, sizes, columns);
        // Unclamped, so huge boards still pick the best shape even when
        // every option ends up below MIN_ZOOM.
        const fit = Math.min(1, w / (box.r + FIT_MARGIN), h / (box.b + FIT_MARGIN));
        if (!best || fit > best.fit + 0.001) best = { positions, fit };
      }
      if (!best) return null;
      onPlaceMany(best.positions);
      setZoom(clampZoom(best.fit));
      return best.positions;
    };
    const t1 = setTimeout(() => {
      if (apply(true)) setLayoutShown(true);
    }, 600);
    const t2 = setTimeout(() => {
      apply(false);
      setLayoutShown(true);
      onLayoutDone();
    }, 1600);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingLayout, details]);

  // Opening a card from the index/trainer, or following a link to a card
  // that's already on the canvas: raise it, make sure it's in view, and
  // flash it so it's obvious which one it is.
  useEffect(() => {
    if (!focus) return;
    let tries = 0;
    let findTimer: ReturnType<typeof setTimeout>;
    let flashTimer: ReturnType<typeof setTimeout> | undefined;
    const run = () => {
      const el = cardEl(focus.slug);
      if (!el) {
        if (tries++ < 30) findTimer = setTimeout(run, 100);
        return;
      }
      setTopSlug(focus.slug);
      const { w, h } = viewRef.current;
      const z = zoomRef.current;
      if (el.offsetLeft + el.offsetWidth > w / z || el.offsetTop + el.offsetHeight > h / z) shrinkToShowAll();
      el.classList.remove("flash");
      void el.offsetWidth;
      el.classList.add("flash");
      flashTimer = setTimeout(() => el.classList.remove("flash"), 1600);
    };
    findTimer = setTimeout(run, 80);
    return () => {
      clearTimeout(findTimer);
      if (flashTimer) clearTimeout(flashTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus]);

  // The visible area in canvas coordinates (what drags are clamped to). The
  // layer itself is laid out much larger so a card near the right edge
  // isn't squeezed by its containing block; the viewport clips it anyway.
  const boundsW = view.w / zoom;
  const boundsH = view.h / zoom;
  const layerW = Math.max(boundsW, 4000);
  const layerH = Math.max(boundsH, 3000);

  return (
    <div className="canvas-viewport" ref={viewportRef}>
      <div
        className="canvas-wrap"
        ref={wrapRef}
        style={{ width: layerW, height: layerH, transform: `scale(${zoom})`, opacity: layoutShown ? 1 : 0 }}
      >
        <svg className="canvas-edges" width={layerW} height={layerH}>
          {lines.map(([x1, y1, x2, y2], i) => (
            <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#c4c4c4" strokeWidth={2} />
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
              zoom={zoom}
              boundsW={boundsW}
              boundsH={boundsH}
              isTop={topSlug === node.slug}
              enlarged={enlargedSlug === node.slug && zoom < 0.95}
              onToggleEnlarge={toggleEnlarge}
              onRaise={setTopSlug}
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
      {nodes.length > 0 && (
        <div className="zoom-controls">
          <button aria-label="Уменьшить" onClick={() => setZoom((z) => clampZoom(z / ZOOM_STEP))}>−</button>
          <span className="zoom-value">{Math.round(zoom * 100)}%</span>
          <button aria-label="Увеличить" onClick={() => setZoom((z) => clampZoom(z * ZOOM_STEP))}>+</button>
          <button className="zoom-fit" onClick={() => setZoom(zoomToFit(contentBox()))}>Вместить всё</button>
        </div>
      )}
    </div>
  );
}
