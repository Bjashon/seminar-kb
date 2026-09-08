import { useCallback, useEffect, useState } from "react";
import type { CanvasEdge, CanvasNode, EntityDetail, EntitySummary, Lang } from "./types";
import { api } from "./api";
import { Canvas } from "./Canvas";
import { IndexPage } from "./IndexPage";
import { Trainer } from "./Trainer";
import { SourcePanel } from "./SourcePanel";

type Mode = "reader" | "index" | "trainer";

// New-card spawn positions cycle through a small grid anchored near the
// canvas origin, instead of drifting indefinitely (fromNode.x + 470 forever,
// or 60 + prev.length * 30 forever) -- that used to walk cards off the edge
// of whatever's currently scrolled into view, making them look "invisible".
const SPAWN_ORIGIN_X = 60;
const SPAWN_ORIGIN_Y = 60;
const SPAWN_STEP_X = 470;
const SPAWN_STEP_Y = 260;
const SPAWN_COLS = 3;
const SPAWN_ROWS = 3;

export default function App() {
  const [entities, setEntities] = useState<EntitySummary[]>([]);
  const [details, setDetails] = useState<Record<string, EntityDetail>>({});
  const [mode, setMode] = useState<Mode>("reader");
  const [nodes, setNodes] = useState<CanvasNode[]>([]);
  const [edges, setEdges] = useState<CanvasEdge[]>([]);
  const [sourceSlug, setSourceSlug] = useState<string | null>(null);

  useEffect(() => {
    api.listEntities().then(setEntities);
  }, []);

  // Stable across renders (functional state updates only) so that
  // NodeCard, wrapped in React.memo, doesn't re-render -- and stomp on
  // MathJax's already-typeset DOM -- every time a sibling card changes.
  const ensureDetail = useCallback((slug: string) => {
    setDetails((prev) => {
      if (prev[slug]) return prev;
      api.getEntity(slug).then((d) => setDetails((p) => ({ ...p, [slug]: d })));
      return prev;
    });
  }, []);

  const gotoFromCard = useCallback(
    (fromSlug: string | null, toSlug: string) => {
      ensureDetail(toSlug);
      setNodes((prev) => {
        if (prev.some((n) => n.slug === toSlug)) return prev;
        const fromNode = fromSlug ? prev.find((n) => n.slug === fromSlug) : null;
        let x: number, y: number;
        if (fromNode) {
          const col = Math.round((fromNode.x - SPAWN_ORIGIN_X) / SPAWN_STEP_X);
          const nextCol = (col + 1) % SPAWN_COLS;
          x = SPAWN_ORIGIN_X + nextCol * SPAWN_STEP_X;
          y = nextCol === 0 ? SPAWN_ORIGIN_Y : fromNode.y;
        } else {
          const i = prev.length % (SPAWN_COLS * SPAWN_ROWS);
          x = SPAWN_ORIGIN_X + (i % SPAWN_COLS) * SPAWN_STEP_X;
          y = SPAWN_ORIGIN_Y + Math.floor(i / SPAWN_COLS) * SPAWN_STEP_Y;
        }
        return [...prev, { slug: toSlug, x, y, lang: "ru" as Lang, proofOpen: false }];
      });
      if (fromSlug && fromSlug !== toSlug) {
        setEdges((prev) =>
          prev.some((e) => (e.from === fromSlug && e.to === toSlug) || (e.from === toSlug && e.to === fromSlug))
            ? prev
            : [...prev, { from: fromSlug, to: toSlug }]
        );
      }
    },
    [ensureDetail]
  );

  const moveNode = useCallback((slug: string, x: number, y: number) => {
    setNodes((prev) => prev.map((n) => (n.slug === slug ? { ...n, x, y } : n)));
  }, []);
  const closeNode = useCallback((slug: string) => {
    setNodes((prev) => prev.filter((n) => n.slug !== slug));
    setEdges((prev) => prev.filter((e) => e.from !== slug && e.to !== slug));
  }, []);
  const setNodeLang = useCallback((slug: string, lang: Lang) => {
    setNodes((prev) => prev.map((n) => (n.slug === slug ? { ...n, lang } : n)));
  }, []);
  const toggleProof = useCallback((slug: string) => {
    setNodes((prev) => prev.map((n) => (n.slug === slug ? { ...n, proofOpen: !n.proofOpen } : n)));
  }, []);
  const openSource = useCallback((d: EntityDetail) => setSourceSlug(d.slug), []);
  const closeSource = useCallback(() => setSourceSlug(null), []);

  const openFromIndex = useCallback(
    (slug: string) => {
      gotoFromCard(null, slug);
      setMode("reader");
    },
    [gotoFromCard]
  );

  const openFromTrainer = useCallback(
    (slug: string) => {
      gotoFromCard(null, slug);
      setMode("reader");
    },
    [gotoFromCard]
  );

  const openSourceFromIndex = useCallback(
    (slug: string) => {
      ensureDetail(slug);
      setSourceSlug(slug);
    },
    [ensureDetail]
  );

  const sourceDetail = sourceSlug ? details[sourceSlug] : null;

  return (
    <>
      <div className="topbar">
        <button className="brand-link" onClick={() => setMode("index")}>Seminar KB</button>
        <nav className="top-nav">
          <span className="hint-small" style={{ visibility: mode === "reader" ? "visible" : "hidden" }}>
            тащи карточки за верхнюю плашку
          </span>
          <button aria-selected={mode === "reader"} onClick={() => setMode("reader")}>Карточки</button>
          <button aria-selected={mode === "index"} onClick={() => setMode("index")}>Указатель</button>
          <button aria-selected={mode === "trainer"} onClick={() => setMode("trainer")}>Тренажёр</button>
        </nav>
      </div>
      <div className="layout">
        <main className="main">
          {mode === "reader" && (
            <Canvas
              nodes={nodes}
              edges={edges}
              details={details}
              allEntities={entities}
              onMove={moveNode}
              onClose={closeNode}
              onSetLang={setNodeLang}
              onToggleProof={toggleProof}
              onGoto={gotoFromCard}
              onOpenSource={openSource}
            />
          )}
          {mode === "index" && (
            <IndexPage entities={entities} onOpen={openFromIndex} onOpenSource={openSourceFromIndex} />
          )}
          {/* Always mounted (just hidden) so an in-progress review session
              isn't lost -- switching tabs used to unmount Trainer and reset
              its queue/index/reveal state from scratch. */}
          <div className="main-inner" hidden={mode !== "trainer"}>
            <Trainer allEntities={entities} details={details} ensureDetail={ensureDetail} onOpenCard={openFromTrainer} />
          </div>
        </main>
        {sourceDetail && <SourcePanel detail={sourceDetail} onClose={closeSource} />}
      </div>
    </>
  );
}
