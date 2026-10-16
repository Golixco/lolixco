from collections import Counter, defaultdict
from typing import Any, Dict, List, Optional, Sequence, Set, Tuple

from .catalog import Catalog
from .similarity import (
    category_match_score,
    compute_session_history_affinity,
    compute_tag_idf,
    get_meaningful_shared_tags,
    get_usable_history,
    tag_idf_similarity,
)
from .types import (
    EditItem,
    RecommendationRequest,
    RecommendationResponse,
    RecommendedItem,
)


def verify_sliding_window_diversity(
    items: Sequence[RecommendedItem],
    max_per_window: int = 2,
    window_size: int = 10,
) -> Tuple[bool, List[str]]:
    """
    Verify that EVERY complete sliding window of length window_size contains
    at most max_per_window items from any single creator.
    """
    violations: List[str] = []
    n = len(items)
    for start in range(max(0, n - window_size + 1)):
        window = items[start : start + window_size]
        creators = [item.edit.creator for item in window]
        counts = Counter(creators)
        for creator, count in counts.items():
            if count > max_per_window:
                violations.append(
                    f"Window [{start}:{start + window_size}] has {count} items for creator {creator!r} (max {max_per_window})"
                )
    return (len(violations) == 0), violations


class RecommendationEngine:
    """
    Deterministic Stage 1 Recommendation Engine for Lolixco.
    Produces repeatable, explainable rankings using real catalog features.
    """

    def __init__(self, catalog: Catalog, policy_version: str = "baseline-v1"):
        self.catalog = catalog
        self.policy_version = policy_version
        self.idf_table = compute_tag_idf(catalog)

    def recommend(self, request: RecommendationRequest) -> RecommendationResponse:
        """Generate recommendations according to surface and context."""
        warnings: List[str] = [
            "publication_time_missing",
            "quality_prior_uninformative",
        ]

        # 1. Active suppression & exclusions
        excluded_ids: Set[int] = set(request.exclude_edit_ids)
        if request.surface == "up_next":
            if request.current_edit_id is None:
                raise ValueError("current_edit_id must be provided for up_next surface")
            if request.current_edit_id not in self.catalog:
                raise KeyError(
                    f"current_edit_id {request.current_edit_id} not found in catalog"
                )
            # Strictly suppress active video from Up Next
            excluded_ids.add(request.current_edit_id)

        # 2. Candidate pool filtering
        eligible: List[EditItem] = [
            item
            for item in self.catalog.all_items
            if item.id not in excluded_ids
            and (
                request.category_filter is None
                or item.category.lower() == request.category_filter.lower()
            )
        ]

        total_eligible = len(eligible)
        if total_eligible == 0:
            return RecommendationResponse(
                surface=request.surface,
                mode_used="baseline",
                catalog_version=self.catalog.catalog_version,
                policy_version=self.policy_version,
                items=(),
                total_eligible=0,
                diagnostics={
                    "fallback_reason": "empty_eligible_pool",
                    "warnings": warnings,
                    "creator_cap_relaxed": False,
                },
            )

        # 3. Validate usable history signals
        usable_history, ignored_count = get_usable_history(request.history, self.catalog)
        if ignored_count > 0:
            warnings.append("history_items_ignored")
        if request.history and not usable_history:
            warnings.append("history_unusable_or_skipped")

        # 4. Surface Dispatch
        if request.surface == "home":
            ranked_items = self._recommend_home(eligible, usable_history)
        else:
            ranked_items = self._recommend_up_next(eligible, request, usable_history)

        # 5. Creator Diversity Re-ranking
        ranked_items, cap_relaxed, relaxation_warnings = self._apply_creator_cap(
            ranked_items, max_per_window=2, window_size=10
        )
        warnings.extend(relaxation_warnings)

        # 6. Apply limit and wrap in RecommendedItem with 1-based ranks
        limited_items = ranked_items[: request.limit]
        final_items: Tuple[RecommendedItem, ...] = tuple(
            RecommendedItem(
                rank=idx + 1,
                edit=item,
                score=round(score, 4),
                reason_codes=reasons,
            )
            for idx, (item, score, reasons) in enumerate(limited_items)
        )

        return RecommendationResponse(
            surface=request.surface,
            mode_used="baseline",
            catalog_version=self.catalog.catalog_version,
            policy_version=self.policy_version,
            items=final_items,
            total_eligible=total_eligible,
            diagnostics={
                "fallback_reason": None,
                "warnings": sorted(list(set(warnings))),
                "creator_cap_relaxed": cap_relaxed,
            },
        )

    def _recommend_home(
        self, eligible: List[EditItem], usable_history: Sequence[Any]
    ) -> List[Tuple[EditItem, float, Tuple[str, ...]]]:
        """
        Home feed recommendation.
        If usable_history is empty, performs deterministic category round-robin balance.
        If usable_history exists, incorporates session affinity.
        """
        if not usable_history:
            # True cold-start: Category round-robin
            buckets: Dict[str, List[EditItem]] = defaultdict(list)
            for item in eligible:
                buckets[item.category].append(item)

            # Sort deterministically by ID within each bucket
            for cat in buckets:
                buckets[cat].sort(key=lambda x: x.id)

            sorted_categories = sorted(buckets.keys())
            interleaved: List[EditItem] = []
            max_len = max(len(b) for b in buckets.values())

            for step in range(max_len):
                for cat in sorted_categories:
                    if step < len(buckets[cat]):
                        interleaved.append(buckets[cat][step])

            results: List[Tuple[EditItem, float, Tuple[str, ...]]] = []
            total = len(interleaved)
            for idx, item in enumerate(interleaved):
                score = 1.0 - (0.50 * idx / max(total - 1, 1))
                results.append((item, score, ("cold_start", "category_balance")))

            return results

        # History-aware home feed (only when verified usable signals exist)
        scored: List[Tuple[EditItem, float, Tuple[str, ...]]] = []
        for item in eligible:
            affinity = compute_session_history_affinity(
                item, usable_history, self.catalog, self.idf_table
            )
            score = 0.50 + 0.50 * affinity
            reasons = ("session_continuity",) if affinity > 0.10 else ("cold_start", "category_balance")
            scored.append((item, score, reasons))

        # Deterministic sort: score DESC, id ASC
        scored.sort(key=lambda x: (-x[1], x[0].id))
        return scored

    def _recommend_up_next(
        self,
        eligible: List[EditItem],
        request: RecommendationRequest,
        usable_history: Sequence[Any],
    ) -> List[Tuple[EditItem, float, Tuple[str, ...]]]:
        """
        Up Next recommendation given currently playing video.
        Scored with category match, IDF tag similarity, and optional session affinity.
        """
        assert request.current_edit_id is not None
        current_edit = self.catalog.get(request.current_edit_id)
        assert current_edit is not None

        has_usable_hist = bool(usable_history)

        w_cat = 0.45 if has_usable_hist else 0.55
        w_tag = 0.35 if has_usable_hist else 0.45
        w_hist = 0.20 if has_usable_hist else 0.00

        scored: List[Tuple[EditItem, float, Tuple[str, ...]]] = []

        for item in eligible:
            cat_score = category_match_score(item.category, current_edit.category)
            tag_score = tag_idf_similarity(item.tags, current_edit.tags, self.idf_table)
            hist_score = (
                compute_session_history_affinity(
                    item, usable_history, self.catalog, self.idf_table
                )
                if has_usable_hist
                else 0.0
            )

            total_score = w_cat * cat_score + w_tag * tag_score + w_hist * hist_score

            reasons: List[str] = []
            if cat_score > 0.0:
                reasons.append("category_match")

            # Meaningful tag discrimination: Only emit tag_similarity if shared tags
            # contain at least one distinctive (non-boilerplate) tag!
            meaningful_shared = get_meaningful_shared_tags(
                item.tags, current_edit.tags, self.catalog
            )
            if meaningful_shared and tag_score > 0.10:
                reasons.append("tag_similarity")

            if hist_score > 0.10:
                reasons.append("session_continuity")
            if not reasons:
                reasons.append("thematic_relation")

            scored.append((item, total_score, tuple(reasons)))

        # Deterministic sort: primary score DESC, secondary edit.id ASC
        scored.sort(key=lambda x: (-x[1], x[0].id))
        return scored

    def _apply_creator_cap(
        self,
        ranked: List[Tuple[EditItem, float, Tuple[str, ...]]],
        max_per_window: int = 2,
        window_size: int = 10,
    ) -> Tuple[List[Tuple[EditItem, float, Tuple[str, ...]]], bool, List[str]]:
        """
        Deterministic sliding-window diversity reranker.
        Ensures at most max_per_window items from any creator within window_size.
        If strict enforcement is impossible (e.g. <= 2 creators or pool exhausted),
        emits explicit diagnostics and places remaining candidates to minimize concentration.
        """
        if not ranked:
            return [], False, []

        unique_creators = {candidate[0].creator for candidate in ranked}
        warnings: List[str] = []

        # Case 1: Insufficient distinct creators in the eligible pool (e.g. 1-creator demo)
        if len(unique_creators) <= max_per_window:
            warnings.append("creator_cap_relaxed")
            return ranked, True, warnings

        # Case 2: Greedy placement with sliding window check
        remaining = list(ranked)
        result: List[Tuple[EditItem, float, Tuple[str, ...]]] = []
        relaxation_occurred = False

        while remaining:
            window_start = max(0, len(result) - (window_size - 1))
            recent_creators = [r[0].creator for r in result[window_start:]]

            # Find the highest-ranked remaining candidate satisfying the window cap
            chosen_idx = None
            for idx, candidate in enumerate(remaining):
                creator = candidate[0].creator
                if recent_creators.count(creator) < max_per_window:
                    chosen_idx = idx
                    break

            if chosen_idx is not None:
                result.append(remaining.pop(chosen_idx))
            else:
                # No remaining candidate satisfies the sliding window constraint
                # (Mathematical impossibility or candidate pool exhausted)
                relaxation_occurred = True

                # Pick candidate that minimizes recent concentration, tie-breaking by initial rank
                min_count = min(recent_creators.count(c[0].creator) for c in remaining)
                best_idx = 0
                for idx, candidate in enumerate(remaining):
                    if recent_creators.count(candidate[0].creator) == min_count:
                        best_idx = idx
                        break

                result.append(remaining.pop(best_idx))

        if relaxation_occurred:
            warnings.append("creator_cap_relaxed_insufficient_diversity")

        return result, relaxation_occurred, warnings
