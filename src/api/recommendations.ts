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
  tagsAll?: string[];
  excludeEditIds?: number[];
  history?: WatchHistoryContext[];
  timeoutMs?: number;
}

export const DEFAULT_REQUEST_TIMEOUT_MS = 5000;

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

  if (params.tagsAll && params.tagsAll.length > 0) {
    const normTags = params.tagsAll.map((t) => t.trim().toLowerCase());
    pool = pool.filter((e) => {
      const editTags = e.tags.map((t) => t.toLowerCase());
      return normTags.every((t) => editTags.includes(t));
    });
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
 * Re-throws caller-initiated AbortError to preserve cancellation semantics.
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

  const filters: Record<string, unknown> = {};
  if (params.categoryFilter && params.categoryFilter !== "Featured") {
    filters.category = params.categoryFilter;
  }
  if (params.tagsAll && params.tagsAll.length > 0) {
    filters.tags_all = params.tagsAll;
  }
  if (Object.keys(filters).length > 0) {
    payload.filters = filters;
  }

  if (params.excludeEditIds && params.excludeEditIds.length > 0) {
    payload.exclude_edit_ids = params.excludeEditIds;
  }

  if (params.history && params.history.length > 0) {
    payload.context = { history: params.history };
  }

  // Setup bounded timeout with caller-initiated signal preservation
  const timeoutMs = params.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  const timeoutController = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;

  if (signal?.aborted) {
    throw signal.reason || new DOMException("The operation was aborted", "AbortError");
  }

  const abortListener = () => {
    if (timer) clearTimeout(timer);
    timeoutController.abort(signal?.reason || new DOMException("The operation was aborted", "AbortError"));
  };

  if (signal) {
    signal.addEventListener("abort", abortListener, { once: true });
  }

  timer = setTimeout(() => {
    timeoutController.abort(new DOMException("Request timed out", "TimeoutError"));
  }, timeoutMs);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: timeoutController.signal,
    });

    if (timer) clearTimeout(timer);
    if (signal) signal.removeEventListener("abort", abortListener);

    if (!response.ok) {
      return computeLocalFallback(params);
    }

    let data: unknown;
    try {
      data = await response.json();
    } catch {
      return computeLocalFallback(params);
    }

    // Strict response envelope validation
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      return computeLocalFallback(params);
    }

    const envelope = data as Record<string, unknown>;
    if (envelope.schema_version !== "1.0" || envelope.surface !== params.surface) {
      return computeLocalFallback(params);
    }

    if (!Array.isArray(envelope.items)) {
      return computeLocalFallback(params);
    }

    // Defense in depth: strict exclusion & client-side catalog lookup
    const excludedIds = new Set<number>(params.excludeEditIds ?? []);
    if (params.surface === "up_next" && params.currentEditId !== undefined) {
      excludedIds.add(params.currentEditId);
    }

    const editsById = new Map<number, Edit>(edits.map((e) => [e.id, e]));
    const mappedItems: RecommendedItem[] = [];
    const mappedEdits: Edit[] = [];
    const seenIds = new Set<number>();

    for (const rawItem of envelope.items) {
      if (!rawItem || typeof rawItem !== "object") continue;
      const rawObj = rawItem as Record<string, unknown>;
      const rawId = rawObj.edit_id ?? (rawObj.edit as Record<string, unknown> | undefined)?.id;

      if (typeof rawId !== "number" || !Number.isInteger(rawId) || rawId < 0) {
        continue;
      }

      // Check client-side exclusions and deduplicate
      if (excludedIds.has(rawId) || seenIds.has(rawId)) {
        continue;
      }

      const localEdit = editsById.get(rawId);
      if (!localEdit) {
        // Unknown server ID - safely ignore
        continue;
      }

      seenIds.add(rawId);
      mappedEdits.push(localEdit);
      mappedItems.push({
        rank: typeof rawObj.rank === "number" ? rawObj.rank : mappedItems.length + 1,
        editId: rawId,
        score: typeof rawObj.score === "number" ? rawObj.score : 0,
        reasonCodes: Array.isArray(rawObj.reason_codes)
          ? (rawObj.reason_codes as string[]).filter((r) => typeof r === "string")
          : [],
        edit: localEdit,
      });
    }

    // Valid response from API, even if 0 items matched filters
    return {
      surface: params.surface,
      source: "api",
      modeUsed: typeof envelope.mode_used === "string" ? envelope.mode_used : "baseline",
      catalogVersion: typeof envelope.catalog_version === "string" ? envelope.catalog_version : "demo-catalog-v1",
      policyVersion: typeof envelope.policy_version === "string" ? envelope.policy_version : "baseline-v1",
      items: mappedItems,
      edits: mappedEdits,
      totalEligible: typeof envelope.total_eligible === "number" ? envelope.total_eligible : mappedEdits.length,
      diagnostics: {
        warnings: Array.isArray((envelope.diagnostics as Record<string, unknown> | undefined)?.warnings)
          ? ((envelope.diagnostics as Record<string, unknown>).warnings as string[])
          : [],
        fallbackReason: (envelope.diagnostics as Record<string, unknown> | undefined)?.fallback_reason as string | null ?? null,
      },
    };
  } catch (error) {
    if (timer) clearTimeout(timer);
    if (signal) signal.removeEventListener("abort", abortListener);

    // If caller explicitly aborted, rethrow the cancellation
    if (signal?.aborted) {
      throw signal.reason || (error instanceof Error ? error : new DOMException("The operation was aborted", "AbortError"));
    }

    // Network errors, timeouts, or unparseable JSON fall back cleanly
    return computeLocalFallback(params);
  }
}
