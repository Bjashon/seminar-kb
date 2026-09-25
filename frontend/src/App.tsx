import { useCallback, useEffect, useState } from "react";
import type { Board, CanvasEdge, CanvasNode, EntityDetail, EntitySummary, Lang } from "./types";
import { api } from "./api";
import { Canvas, type FocusRequest } from "./Canvas";
import { formatDate } from "./dates";
import { IndexPage } from "./IndexPage";
import { Trainer } from "./Trainer";
import { ProjectsPage } from "./ProjectsPage";
import { SourcePanel } from "./SourcePanel";

type Mode = "reader" | "index" | "trainer" | "projects";

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

/** The summary card a board opens with. Not a real entity (nothing to fetch,
 *  no /entities/ row) -- just shaped like one so NodeCard can render it,
 *  which also makes every entity title mentioned in it a clickable link. */
function briefDetail(slug: string, brief: NonNullable<Board["brief"]>): EntityDetail {
  const parts = brief.parts.map((p) => (p.date ? `${p.episode_code} · ${formatDate(p.date)}` : p.episode_code)).join(", ");
  const withCitation = (text: string) => (brief.bibliography ? `${text}\n\n*${brief.bibliography}*` : text);
  return {
    slug,
    kind: "brief",
    title_ru: brief.title,
    title_en: brief.title,
    statement_ru: withCitation(brief.brief_ru),
    statement_en: withCitation(brief.brief_en ?? brief.brief_ru),
    proof_ru: null,
    proof_en: null,
    aliases: [],
    topic: null,
    source: { label: parts, document: null, page: null, episode_code: null, citation: null },
    uses: [],
    used_by: [],
  };
}

export default function App() {
  const [entities, setEntities] = useState<EntitySummary[]>([]);
  const [details, setDetails] = useState<Record<string, EntityDetail>>({});
  const [mode, setMode] = useState<Mode>("reader");
  const [nodes, setNodes] = useState<CanvasNode[]>([]);
  const [edges, setEdges] = useState<CanvasEdge[]>([]);
  const [sourceSlug, setSourceSlug] = useState<string | null>(null);
  const [pendingLayout, setPendingLayout] = useState<string[] | null>(null);
  const [focus, setFocus] = useState<FocusRequest | null>(null);

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
      setFocus({ slug: toSlug, n: Date.now() });
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
        return [...prev, { slug: toSlug, x, y, lang: "ru" as Lang, proofOpen: false, scale: 1 }];
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
  const placeMany = useCallback((positions: Record<string, { x: number; y: number }>) => {
    setNodes((prev) => prev.map((n) => (positions[n.slug] ? { ...n, ...positions[n.slug] } : n)));
  }, []);
  const layoutDone = useCallback(() => setPendingLayout(null), []);

  // A paper's board replaces whatever was on the canvas: every entity of the
  // paper at once, linked, in dependency order (the backend sorts it; Canvas
  // packs it into rows once the cards have rendered and can be measured).
  const openBoard = useCallback(
    (talkId: number) => {
      api.getBoard(talkId).then((board: Board) => {
        board.slugs.forEach(ensureDetail);
        let slugs = board.slugs;
        if (board.brief) {
          const briefSlug = `brief-${talkId}`;
          const brief = briefDetail(briefSlug, board.brief);
          setDetails((prev) => ({ ...prev, [briefSlug]: brief }));
          slugs = [briefSlug, ...slugs];
        }
        setNodes(slugs.map((slug, i) => ({ slug, x: 40, y: 40 + i * 4, lang: "ru" as Lang, proofOpen: false, scale: 1 })));
        setEdges(board.edges.map((e) => ({ from: e.from_slug, to: e.to_slug })));
        setPendingLayout(slugs);
        setMode("reader");
      });
    },
    [ensureDetail]
  );
  const closeNode = useCallback((slug: string) => {
    setNodes((prev) => prev.filter((n) => n.slug !== slug));
    setEdges((prev) => prev.filter((e) => e.from !== slug && e.to !== slug));
  }, []);
  const setNodeLang = useCallback((slug: string, lang: Lang) => {
    setNodes((prev) => prev.map((n) => (n.slug === slug ? { ...n, lang } : n)));
  }, []);
  const setNodeScale = useCallback((slug: string, scale: number) => {
    setNodes((prev) => prev.map((n) => (n.slug === slug ? { ...n, scale } : n)));
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
          <button aria-selected={mode === "reader"} onClick={() => setMode("reader")}>Дашборд</button>
          <button aria-selected={mode === "index"} onClick={() => setMode("index")}>Указатель</button>
          <button aria-selected={mode === "trainer"} onClick={() => setMode("trainer")}>Тренажёр</button>
          <button aria-selected={mode === "projects"} onClick={() => setMode("projects")}>Статьи</button>
        </nav>
      </div>
      <div className="layout">
        <main className="main">
          {/* All three views stay mounted (just hidden, never unmounted) so
              switching tabs neither loses state (Trainer's queue/index) nor
              drags one view's scroll position onto another -- each pane
              keeps its own native scroll offset and is exactly as you left
              it when you come back. */}
          <div className="main-pane no-scroll" hidden={mode !== "reader"}>
            <Canvas
              nodes={nodes}
              edges={edges}
              details={details}
              allEntities={entities}
              pendingLayout={pendingLayout}
              focus={focus}
              onPlaceMany={placeMany}
              onLayoutDone={layoutDone}
              onResize={setNodeScale}
              onMove={moveNode}
              onClose={closeNode}
              onSetLang={setNodeLang}
              onToggleProof={toggleProof}
              onGoto={gotoFromCard}
              onOpenSource={openSource}
            />
          </div>
          <div className="main-pane" hidden={mode !== "index"}>
            <IndexPage entities={entities} onOpen={openFromIndex} onOpenSource={openSourceFromIndex} />
          </div>
          <div className="main-pane" hidden={mode !== "trainer"}>
            <div className="main-inner">
              <Trainer
                allEntities={entities}
                details={details}
                ensureDetail={ensureDetail}
                onOpenCard={openFromTrainer}
                onOpenBoard={openBoard}
              />
            </div>
          </div>
          <div className="main-pane" hidden={mode !== "projects"}>
            <ProjectsPage allEntities={entities} onOpen={openFromIndex} />
          </div>
        </main>
        {sourceDetail && <SourcePanel detail={sourceDetail} onClose={closeSource} />}
      </div>
    </>
  );
}
