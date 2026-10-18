import { useEffect, useRef, useState, useMemo } from "react";
import type { Edit } from "../data/edits";
import { searchEdits, type SearchResult } from "../data/searchEngine";

export interface DiscoveryFeedOptions {
  /**
   * Strictly restricted to development demonstrations or automated tests.
   * Default is 0 (synchronous local filtering with zero artificial delay).
   */
  simulateDelayMs?: number;
}

export interface DiscoveryFeedState {
  searchResults: SearchResult[];
  edits: Edit[];
  loading: boolean;
}

/**
 * Hook managing discovery feed filtering and search ranking.
 *
 * Guarantees:
 * - Production local search is synchronous: zero artificial latency, zero skeleton flicker,
 *   and instant updates without stale intermediate renders.
 * - Out-of-order protection: stale asynchronous responses never overwrite newer queries when simulated.
 * - Supports structured fandom filtering alongside category and text/hashtag query.
 */
export function useDiscoveryFeed(
  allEdits: Edit[],
  query: string,
  category: string,
  fandomOrOptions?: string | DiscoveryFeedOptions,
  maybeOptions: DiscoveryFeedOptions = {}
): DiscoveryFeedState {
  const fandomId = typeof fandomOrOptions === "string" ? fandomOrOptions : undefined;
  const options =
    typeof fandomOrOptions === "object" && fandomOrOptions !== null
      ? fandomOrOptions
      : maybeOptions;

  const { simulateDelayMs = 0 } = options;
  const requestIdRef = useRef(0);

  // Synchronous memoized results derived directly in the render pass
  const syncResults = useMemo(() => {
    return searchEdits(allEdits, query, category, fandomId);
  }, [allEdits, query, category, fandomId]);

  const syncEdits = useMemo(() => {
    return syncResults.map((r) => r.edit);
  }, [syncResults]);

  // Asynchronous state used exclusively when simulateDelayMs > 0
  const [asyncState, setAsyncState] = useState<{
    searchResults: SearchResult[];
    edits: Edit[];
    loading: boolean;
    query: string;
    category: string;
    fandomId?: string;
  }>(() => ({
    searchResults: syncResults,
    edits: syncEdits,
    loading: false,
    query,
    category,
    fandomId,
  }));

  useEffect(() => {
    if (!simulateDelayMs || simulateDelayMs <= 0) {
      return;
    }

    const currentRequestId = ++requestIdRef.current;
    setAsyncState((prev) => ({
      ...prev,
      loading: true,
      query,
      category,
      fandomId,
    }));

    const timer = setTimeout(() => {
      if (currentRequestId === requestIdRef.current) {
        setAsyncState({
          searchResults: syncResults,
          edits: syncEdits,
          loading: false,
          query,
          category,
          fandomId,
        });
      }
    }, simulateDelayMs);

    return () => {
      clearTimeout(timer);
    };
  }, [syncResults, syncEdits, simulateDelayMs, query, category, fandomId]);

  // Production synchronous mode: Return current memoized search results directly
  if (!simulateDelayMs || simulateDelayMs <= 0) {
    return {
      searchResults: syncResults,
      edits: syncEdits,
      loading: false,
    };
  }

  // Asynchronous simulation mode
  return {
    searchResults: asyncState.searchResults,
    edits: asyncState.edits,
    loading: asyncState.loading,
  };
}
