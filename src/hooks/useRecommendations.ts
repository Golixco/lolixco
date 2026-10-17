import { useEffect, useRef, useState } from "react";
import { type Edit } from "../data/edits";
import {
  computeLocalFallback,
  fetchRecommendations,
  type RecommendationParams,
  type RecommendationResult,
  type RecommendedItem,
} from "../api/recommendations";

export interface UseRecommendationsState {
  items: RecommendedItem[];
  edits: Edit[];
  loading: boolean;
  source: "api" | "fallback";
  diagnostics: RecommendationResult["diagnostics"];
  refetch: () => void;
}

export function useRecommendations(
  params: RecommendationParams,
  enabled: boolean = true,
): UseRecommendationsState {
  // Compute immediate deterministic fallback so UI is immediately rendered without flicker or blank states
  const [result, setResult] = useState<RecommendationResult>(() => computeLocalFallback(params));
  const [loading, setLoading] = useState<boolean>(enabled);
  const [nonce, setNonce] = useState(0);

  // Keep track of the latest request ID or sequence number to avoid race conditions
  const seqRef = useRef(0);

  const refetch = () => {
    setNonce((n) => n + 1);
  };

  useEffect(() => {
    if (!enabled) {
      setResult(computeLocalFallback(params));
      setLoading(false);
      return;
    }

    const currentSeq = ++seqRef.current;
    const controller = new AbortController();

    setLoading(true);

    fetchRecommendations(params, controller.signal)
      .then((res) => {
        // Only apply if this is still the newest request
        if (currentSeq === seqRef.current) {
          setResult(res);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (controller.signal.aborted) {
          return;
        }
        if (currentSeq === seqRef.current) {
          // Graceful fallback on network failure or unexpected error
          setResult(computeLocalFallback(params));
          setLoading(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [
    params.surface,
    params.currentEditId,
    params.limit,
    params.categoryFilter,
    JSON.stringify(params.excludeEditIds ?? []),
    nonce,
    enabled,
  ]);

  return {
    items: result.items,
    edits: result.edits,
    loading,
    source: result.source,
    diagnostics: result.diagnostics,
    refetch,
  };
}
