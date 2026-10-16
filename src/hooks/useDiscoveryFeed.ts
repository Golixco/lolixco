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
 * - Production local search is synchronous: zero artificial latency or skeleton flicker.
 * - Out-of-order protection: stale asynchronous responses never overwrite newer queries.
 */
export function useDiscoveryFeed(
  allEdits: Edit[],
  query: string,
  category: string,
  options: DiscoveryFeedOptions = {}
): DiscoveryFeedState {
  const { simulateDelayMs = 0 } = options;
  const requestIdRef = useRef(0);

  // Synchronous initial state
  const syncResults = useMemo(() => {
    return searchEdits(allEdits, query, category);
  }, [allEdits, query, category]);

  const [state, setState] = useState<DiscoveryFeedState>(() => ({
    searchResults: syncResults,
    edits: syncResults.map((r) => r.edit),
    loading: false,
  }));

  useEffect(() => {
    // If no simulated delay (normal production behavior), update synchronously immediately
    if (!simulateDelayMs || simulateDelayMs <= 0) {
      setState({
        searchResults: syncResults,
        edits: syncResults.map((r) => r.edit),
        loading: false,
      });
      return;
    }

    // Isolated test / demonstration mode with simulated latency
    const currentRequestId = ++requestIdRef.current;
    setState((prev) => ({ ...prev, loading: true }));

    const timer = setTimeout(() => {
      // Discard stale responses if a newer request was dispatched
      if (currentRequestId === requestIdRef.current) {
        setState({
          searchResults: syncResults,
          edits: syncResults.map((r) => r.edit),
          loading: false,
        });
      }
    }, simulateDelayMs);

    return () => {
      clearTimeout(timer);
    };
  }, [syncResults, simulateDelayMs]);

  return state;
}
