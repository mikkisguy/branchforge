/**
 * useFlowLayoutPositions
 *
 * Computes auto-layout positions for the flow graph, using a Web Worker
 * for large graphs (> FLOW_VIRTUALIZATION_THRESHOLD nodes) so dagre's
 * computation doesn't block the main thread.
 *
 * For small graphs, layout is computed synchronously via useMemo — the
 * overhead is negligible and avoids worker round-trip latency.
 *
 * Results are cached in a two-level cache keyed by graph topology (node
 * IDs + edge source→target pairs + mode):
 *
 *   L1 — module-level Map (instant, survives modal close/reopen)
 *   L2 — localStorage (survives page reload)
 *
 * Bump CACHE_VERSION when the layout algorithm changes so old cached
 * positions are ignored.
 *
 * Returns `{ positions, isComputing }`. While `isComputing` is true the
 * caller should show a loading indicator instead of rendering ReactFlow.
 */

import { useEffect, useMemo, useReducer, useRef } from "react";
import type { FlowLayoutMode, FlowNode, FlowEdge } from "@branchforge/shared";
import { computeAutoLayout } from "@/components/flow/flow-graph-utils";
import { FLOW_VIRTUALIZATION_THRESHOLD } from "@/lib/constants";

type PositionMap = Map<string, { x: number; y: number }>;
type PositionRecord = Record<string, { x: number; y: number }>;

// ── Cache config ──────────────────────────────────────────────────────

/** Bump when the layout algorithm changes (e.g. ranker switch). */
const CACHE_VERSION = 2;
const CACHE_PREFIX = `flow-layout-v${CACHE_VERSION}`;
const CACHE_MAX_ENTRIES = 20;

// ── L1: module-level Map ──────────────────────────────────────────────
// Survives component unmount/remount (modal close/open) and layout mode
// switches. Cleared on full page reload.
const l1Cache = new Map<string, PositionRecord>();

// ── L2: localStorage ──────────────────────────────────────────────────
// Survives page reload. Keys are hashed to keep them short.

/** djb2 hash → base36. Short enough for a localStorage key. */
function hashKey(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}

function lsGet(topologyKey: string): PositionRecord | null {
  try {
    const raw = localStorage.getItem(`${CACHE_PREFIX}:${hashKey(topologyKey)}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { k: string; p: PositionRecord };
    // Guard against hash collisions — the full topology key must match.
    if (parsed.k !== topologyKey) return null;
    return parsed.p;
  } catch {
    return null; // parse error, private mode, quota, etc.
  }
}

function lsSet(topologyKey: string, positions: PositionRecord): void {
  try {
    localStorage.setItem(
      `${CACHE_PREFIX}:${hashKey(topologyKey)}`,
      JSON.stringify({ k: topologyKey, p: positions })
    );
  } catch {
    // QuotaExceededError or private browsing — L1 cache still works.
  }
}

// ── Unified cache access ──────────────────────────────────────────────

function getCached(key: string): PositionRecord | null {
  // L1
  const l1 = l1Cache.get(key);
  if (l1) return l1;

  // L2
  const l2 = lsGet(key);
  if (l2) {
    // Backfill L1 so subsequent reads are instant.
    if (l1Cache.size >= CACHE_MAX_ENTRIES) {
      const first = l1Cache.keys().next().value;
      if (first) l1Cache.delete(first);
    }
    l1Cache.set(key, l2);
    return l2;
  }

  return null;
}

function setCached(key: string, positions: PositionRecord): void {
  if (l1Cache.size >= CACHE_MAX_ENTRIES) {
    const first = l1Cache.keys().next().value;
    if (first) l1Cache.delete(first);
  }
  l1Cache.set(key, positions);
  lsSet(key, positions);
}

// ── Helpers ───────────────────────────────────────────────────────────

function topologyKey(
  mode: FlowLayoutMode,
  nodes: FlowNode[],
  edges: FlowEdge[]
): string {
  // Only topology matters — title/status/wordCount changes don't affect
  // dagre positions, so we exclude them to maximize cache hits.
  const nodeIds = nodes.map((n) => n.id).join(",");
  const edgeKeys = edges.map((e) => `${e.source}>${e.target}`).join("|");
  return `${mode}:${nodeIds}:${edgeKeys}`;
}

function recordToMap(record: PositionRecord): PositionMap {
  return new Map(Object.entries(record));
}

function mapToRecord(map: PositionMap): PositionRecord {
  const obj: PositionRecord = {};
  for (const [id, pos] of map) obj[id] = pos;
  return obj;
}

// ── Worker layout state ───────────────────────────────────────────────
// Combined into one reducer so the async worker message handler (which
// runs outside React's automatic batching) only triggers a single render.

type WorkerLayoutState = {
  positions: PositionMap;
  isComputing: boolean;
};

type WorkerLayoutAction =
  | { type: "cache_hit"; positions: PositionMap }
  | { type: "start" }
  | { type: "done"; positions: PositionMap }
  | { type: "idle" };

function workerLayoutReducer(
  state: WorkerLayoutState,
  action: WorkerLayoutAction
): WorkerLayoutState {
  switch (action.type) {
    case "cache_hit":
      return { positions: action.positions, isComputing: false };
    case "start":
      return state.isComputing ? state : { ...state, isComputing: true };
    case "done":
      return { positions: action.positions, isComputing: false };
    case "idle":
      return state.isComputing ? { ...state, isComputing: false } : state;
    default: {
      const _exhaustive: never = action;
      void _exhaustive;
      return state;
    }
  }
}

// ── Hook ──────────────────────────────────────────────────────────────

export function useFlowLayoutPositions(
  mode: FlowLayoutMode,
  nodes: FlowNode[],
  edges: FlowEdge[]
): {
  positions: PositionMap;
  isComputing: boolean;
} {
  const useWorker =
    typeof Worker !== "undefined" &&
    nodes.length > FLOW_VIRTUALIZATION_THRESHOLD;

  const cacheKey = useMemo(
    () => topologyKey(mode, nodes, edges),
    [mode, nodes, edges]
  );

  // Sync path — for small graphs or environments without Worker (tests).
  const syncPositions = useMemo<PositionMap>(() => {
    if (useWorker) return new Map();

    const cached = getCached(cacheKey);
    if (cached) return recordToMap(cached);

    const positions = computeAutoLayout(mode, nodes, edges);
    setCached(cacheKey, mapToRecord(positions));
    return positions;
  }, [useWorker, cacheKey, mode, nodes, edges]);

  // Async path — Web Worker for large graphs.
  const [workerLayout, dispatchWorkerLayout] = useReducer(
    workerLayoutReducer,
    undefined,
    (): WorkerLayoutState => {
      // Initialize from cache so the first render after mount is instant.
      const cached = getCached(cacheKey);
      return {
        positions: cached ? recordToMap(cached) : new Map(),
        isComputing: useWorker && cached === null,
      };
    }
  );
  const workerRef = useRef<Worker | null>(null);
  // Monotonically-increasing job id. The worker is shared, processes
  // messages in order, and we can't cancel a queued message — so each
  // effect run tags its postMessage + handler with a unique id, and the
  // handler bails out if the id has been superseded. This prevents a
  // stale response from a previous topology/mode from briefly
  // overwriting state and polluting the cache.
  const jobIdRef = useRef(0);

  useEffect(() => {
    if (!useWorker) {
      dispatchWorkerLayout({ type: "idle" });
      return;
    }

    // Cache hit — skip the worker entirely.
    const cached = getCached(cacheKey);
    if (cached) {
      dispatchWorkerLayout({
        type: "cache_hit",
        positions: recordToMap(cached),
      });
      return;
    }

    dispatchWorkerLayout({ type: "start" });

    // Lazily create the worker (reused across re-computations).
    if (!workerRef.current) {
      workerRef.current = new Worker(
        new URL("../workers/flow-layout.worker.ts", import.meta.url),
        { type: "module" }
      );
    }

    const worker = workerRef.current;
    const jobId = ++jobIdRef.current;

    const handler = (e: MessageEvent) => {
      const { jobId: responseJobId, positions } = e.data as {
        jobId: number;
        positions: PositionRecord;
      };
      if (responseJobId !== jobIdRef.current) return; // superseded — discard
      setCached(cacheKey, positions);
      dispatchWorkerLayout({
        type: "done",
        positions: recordToMap(positions),
      });
    };
    worker.addEventListener("message", handler);
    worker.postMessage({ jobId, mode, nodes, edges });

    // Cleanup: remove *this* effect's listener so stale responses from
    // a previous mode/input change are ignored. The worker itself is
    // terminated on unmount via the separate effect below.
    return () => {
      worker.removeEventListener("message", handler);
    };
  }, [useWorker, cacheKey, mode, nodes, edges]);

  // Terminate worker when the component unmounts.
  // react-doctor-disable-next-line react-doctor/exhaustive-deps
  useEffect(() => {
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

  return {
    positions: useWorker ? workerLayout.positions : syncPositions,
    isComputing: useWorker ? workerLayout.isComputing : false,
  };
}
