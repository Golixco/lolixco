import { edits, type Edit } from "../data/edits";

export interface RecommendedItem {
  rank: number;
  editId: number;
  score: number;
  reasonCodes: string[];
  edit: Edit;
}

export interface RecommendationDiagnostics {
  warnings: string[];
  fallbackReason: string | null;
}

export interface RecommendationResult {
  surface: "home" | "up_next";
  source: "api" | "fallback";
  modeUsed: string;
  catalogVersion: string;
  policyVersion: string;
  items: RecommendedItem[];
  edits: Edit[];
  totalEligible: number;
  diagnostics: RecommendationDiagnostics;
}

export interface WatchHistoryContext {
  edit_id: number;
  unique_watch_ms: number;
  occurred_at: string;
}

export interface RecommendationParams {
  surface: "home" | "up_next";
  currentEditId?: number;
  limit?: number;
  categoryFilter?: string | null;
  excludeEditIds?: number[];
  history?: WatchHistoryContext[];
}

/**
 * Determine if API requests are permitted in current environment.
 * - In dev mode, defaults to enabled (proxied via Vite).
 * - In prod mode, only enabled if VITE_RECSYS_API_URL is explicitly set.
 * - Can be explicitly forced via VITE_RECSYS_ENABLED=true/false.
 */
export function isRecsysApiEnabled(): boolean {
  if (typeof import.meta !== "undefined" && import.meta.env) {
    const forced = import.meta.env.VITE_RECSYS_ENABLED;
    if (forced === "true") return true;
    if (forced === "false") return false;

    const apiUrl = import.meta.env.VITE_RECSYS_API_URL;
    if (apiUrl) return true;

    // In Vite dev mode, default to true (proxied to localhost:8000)
    // In Vite production build without VITE_RECSYS_API_URL, default to false (standalone demo mode)
    return Boolean(import.meta.env.DEV);
  }

  // Node.js test environment support
  const proc = typeof globalThis !== "undefined"
    ? (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process
    : undefined;

  if (proc?.env) {
    if (proc.env.VITE_RECSYS_ENABLED === "false") return false;
    if (proc.env.VITE_RECSYS_ENABLED === "true") return true;
    return true;
  }

  return false;
}

/**
 * Resolve the base API endpoint.
 */
export function getRecsysApiBase(): string {
  if (typeof import.meta !== "undefined" && import.meta.env?.VITE_RECSYS_API_URL) {
    return import.meta.env.VITE_RECSYS_API_URL.replace(/\/$/, "");
  }
  return "/api/v1";
}

/**
 * Compute deterministic fallback recommendations when backend is unavailable.
 * Ensures zero crashes, no blank screens, and accurate source telemetry.
 */
export function computeLocalFallback(params: RecommendationParams): RecommendationResult {
  const limit = Math.max(1, Math.min(50, params.limit ?? (params.surface === "up_next" ? 4 : 12)));
  const excluded = new Set<number>(params.excludeEditIds ?? []);
  if (params.surface === "up_next" && params.currentEditId !== undefined) {
    excluded.add(params.currentEditId);
  }

  let pool = edits.filter((e) => !excluded.has(e.id));

  if (params.categoryFilter && params.categoryFilter !== "Featured") {
    const normCat = params.categoryFilter.toLowerCase();
    pool = pool.filter((e) => e.category.toLowerCase() === normCat);
  }

  const selectedEdits = pool.slice(0, limit);
  const items: RecommendedItem[] = selectedEdits.map((edit, idx) => ({
    rank: idx + 1,
    editId: edit.id,
    score: Math.max(0, 1 - idx * 0.1),
    reasonCodes: ["local_fallback"],
    edit,
  }));

  return {
    surface: params.surface,
    source: "fallback",
    modeUsed: "local_fallback",
    catalogVersion: "demo-catalog-v1",
    policyVersion: "baseline-v1",
    items,
    edits: selectedEdits,
    totalEligible: pool.length,
    diagnostics: {
      warnings: ["backend_unavailable_local_fallback"],
      fallbackReason: "api_disabled_or_unreachable",
    },
  };
}

/**
 * Fetch recommendations from the Python backend API.
 * Maps server-returned edit IDs strictly to local validated Edit records.
 * Falls back cleanly on network failures, timeouts, or backend downtime.
 */
export async function fetchRecommendations(
  params: RecommendationParams,
  signal?: AbortSignal,
): Promise<RecommendationResult> {
  if (!isRecsysApiEnabled()) {
    return computeLocalFallback(params);
  }

  const endpoint = `${getRecsysApiBase()}/recommendations`;

  const payload: Record<string, unknown> = {
    surface: params.surface,
    limit: params.limit ?? (params.surface === "up_next" ? 4 : 12),
    mode: "auto",
  };

  if (params.surface === "up_next") {
    if (params.currentEditId === undefined || params.currentEditId === null) {
      return computeLocalFallback(params);
    }
    payload.current_edit_id = params.currentEditId;
  }

  if (params.categoryFilter && params.categoryFilter !== "Featured") {
    payload.filters = { category: params.categoryFilter, tags_all: [] };
  }

  if (params.excludeEditIds && params.excludeEditIds.length > 0) {
    payload.exclude_edit_ids = params.excludeEditIds;
  }

  if (params.history && params.history.length > 0) {
    payload.context = { history: params.history };
  }

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal,
    });

    if (!response.ok) {
      return computeLocalFallback(params);
    }

    const data = await response.json();

    if (!data || !Array.isArray(data.items)) {
      return computeLocalFallback(params);
    }

    // Map server IDs to validated local Edit objects to preserve Vite base paths and media
    const editsById = new Map<number, Edit>(edits.map((e) => [e.id, e]));
    const mappedItems: RecommendedItem[] = [];
    const mappedEdits: Edit[] = [];
    const seenIds = new Set<number>();

    for (const rawItem of data.items) {
      const rawId = rawItem.edit_id ?? rawItem.edit?.id;
      if (typeof rawId !== "number" || seenIds.has(rawId)) {
        continue;
      }

      // Enforce active video suppression on client even if server misbehaved
      if (params.surface === "up_next" && rawId === params.currentEditId) {
        continue;
      }

      const localEdit = editsById.get(rawId);
      if (!localEdit) {
        // Unknown server ID - ignore safely without crashing
        continue;
      }

      seenIds.add(rawId);
      mappedEdits.push(localEdit);
      mappedItems.push({
        rank: rawItem.rank ?? mappedItems.length + 1,
        editId: rawId,
        score: typeof rawItem.score === "number" ? rawItem.score : 0,
        reasonCodes: Array.isArray(rawItem.reason_codes) ? rawItem.reason_codes : [],
        edit: localEdit,
      });
    }

    return {
      surface: params.surface,
      source: "api",
      modeUsed: data.mode_used || "baseline",
      catalogVersion: data.catalog_version || "demo-catalog-v1",
      policyVersion: data.policy_version || "baseline-v1",
      items: mappedItems,
      edits: mappedEdits,
      totalEligible: typeof data.total_eligible === "number" ? data.total_eligible : mappedEdits.length,
      diagnostics: {
        warnings: Array.isArray(data.diagnostics?.warnings) ? data.diagnostics.warnings : [],
        fallbackReason: data.diagnostics?.fallback_reason ?? null,
      },
    };
  } catch (error) {
    if (signal?.aborted || (error instanceof Error && error.name === "AbortError")) {
      throw error;
    }
    // Network errors, connection refused, or invalid JSON fall back gracefully
    return computeLocalFallback(params);
  }
}
