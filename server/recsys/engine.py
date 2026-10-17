from collections import Counter, defaultdict
from typing import Any, Dict, List, Optional, Sequence, Set, Tuple

from .catalog import Catalog
from .similarity import (
    BOILERPLATE_TAGS,
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
        norm_required_tags = [t.strip().lower() for t in request.required_tags]
        eligible: List[EditItem] = [
            item
            for item in self.catalog.all_items
            if item.id not in excluded_ids
            and (
                request.category_filter is None
                or item.category.lower() == request.category_filter.lower()
            )
            and (
                not norm_required_tags
                or all(
                    req_tag in [t.lower() for t in item.tags]
                    for req_tag in norm_required_tags
                )
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

        # 7. Evaluate whether the delivered feed required relaxation
        # Under the complete 10-item sliding-window policy, a sequence of length < 10
        # has no complete window and therefore 0 violating windows.
        if len(final_items) < 10:
            actual_cap_relaxed = False
            actual_relaxation_warnings: List[str] = []
        else:
            is_valid, _ = verify_sliding_window_diversity(
                final_items, max_per_window=2, window_size=10
            )
            if is_valid:
                actual_cap_relaxed = False
                actual_relaxation_warnings = []
            else:
                actual_cap_relaxed = True
                actual_relaxation_warnings = relaxation_warnings

        warnings.extend(actual_relaxation_warnings)

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
                "creator_cap_relaxed": actual_cap_relaxed,
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
            # When history exists, category balancing was not run; emit honest reason codes
            reasons = ("session_continuity",) if affinity > 0.10 else ("fallback_exploration",)
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
            has_informative_shared = bool(
                {t.lower().strip() for t in item.tags if t.strip()}
                & {t.lower().strip() for t in current_edit.tags if t.strip()}
                - BOILERPLATE_TAGS
            )

            if meaningful_shared and tag_score > 0.10:
                reasons.append("tag_similarity")
            elif has_informative_shared and tag_score > 0.05:
                # Broad non-distinctive tag overlap (must still be informative, non-boilerplate)
                reasons.append("thematic_relation")

            if hist_score > 0.10:
                reasons.append("session_continuity")

            # Honest fallback when no thematic similarity exists
            if not reasons:
                reasons.append("fallback_exploration")

            scored.append((item, total_score, tuple(reasons)))

        # Deterministic sort: primary score DESC, secondary edit.id ASC
        scored.sort(key=lambda x: (-x[1], x[0].id))
        return scored

    def _apply_creator_cap(
        self,
        ranked: List[Tuple[EditItem, float, Tuple[str, ...]]],
        max_per_window: int = 2,
        window_size: int = 10,
        budget: int = 50000,
    ) -> Tuple[List[Tuple[EditItem, float, Tuple[str, ...]]], bool, List[str]]:
        """
        Deterministic sliding-window diversity reranker.
        Ensures at most max_per_window items from any creator within window_size.
        Enforces the cap whenever a feasible complete ordering exists using bounded
        deterministic backtracking search with state memoization.
        If proven infeasible or budget exhausted, falls back to minimizing concentration
        and explicitly reports the genuine relaxation reason.
        """
        if not ranked:
            return [], False, []

        if len(ranked) < window_size:
            return ranked, False, []

        unique_creators = {candidate[0].creator for candidate in ranked}
        warnings: List[str] = []

        # Case 1: Insufficient distinct creators in the eligible pool (e.g. 1-creator demo)
        if len(unique_creators) <= max_per_window:
            warnings.extend([
                "creator_cap_relaxed",
                "creator_cap_relaxed_insufficient_diversity",
                "creator_cap_relaxed_proven_infeasible",
            ])
            return ranked, True, sorted(list(set(warnings)))

        # Case 2: Attempt greedy placement first
        greedy_remaining = list(ranked)
        greedy_result: List[Tuple[EditItem, float, Tuple[str, ...]]] = []
        greedy_violated = False

        while greedy_remaining:
            window_start = max(0, len(greedy_result) - (window_size - 1))
            recent_creators = [r[0].creator for r in greedy_result[window_start:]]

            chosen_idx = None
            for idx, candidate in enumerate(greedy_remaining):
                creator = candidate[0].creator
                if recent_creators.count(creator) < max_per_window:
                    chosen_idx = idx
                    break

            if chosen_idx is not None:
                greedy_result.append(greedy_remaining.pop(chosen_idx))
            else:
                greedy_violated = True
                break

        if not greedy_violated:
            return greedy_result, False, []

        # Case 3: Bounded deterministic backtracking search with state memoization
        creators_list = sorted(list(unique_creators))
        items_by_creator: Dict[str, List[Tuple[Tuple[EditItem, float, Tuple[str, ...]], int]]] = {
            c: [] for c in creators_list
        }
        for orig_idx, item in enumerate(ranked):
            items_by_creator[item[0].creator].append((item, orig_idx))

        steps = 0
        memo: Set[Tuple[Tuple[str, ...], Tuple[int, ...]]] = set()
        budget_exhausted = False

        def dfs(
            current_creators: List[str], remaining_counts: Dict[str, int]
        ) -> Optional[List[str]]:
            nonlocal steps, budget_exhausted
            steps += 1
            if steps > budget:
                budget_exhausted = True
                return None

            if sum(remaining_counts.values()) == 0:
                return current_creators

            recent = tuple(current_creators[-(window_size - 1) :])
            counts_tuple = tuple(remaining_counts[c] for c in creators_list)
            state_key = (recent, counts_tuple)
            if state_key in memo:
                return None

            # Sort candidate creators by the original rank index of their next item
            candidate_creators = []
            for c in creators_list:
                if remaining_counts[c] > 0 and recent.count(c) < max_per_window:
                    consumed = len(items_by_creator[c]) - remaining_counts[c]
                    orig_idx = items_by_creator[c][consumed][1]
                    candidate_creators.append((orig_idx, c))

            candidate_creators.sort()

            for _, c in candidate_creators:
                remaining_counts[c] -= 1
                current_creators.append(c)
                res = dfs(current_creators, remaining_counts)
                if res is not None:
                    return res
                current_creators.pop()
                remaining_counts[c] += 1
                if budget_exhausted:
                    return None

            memo.add(state_key)
            return None

        init_counts = {c: len(items_by_creator[c]) for c in creators_list}
        feasible_creator_order = dfs([], init_counts)

        if feasible_creator_order is not None:
            # Reconstruct exact candidate items in deterministic feasible order
            ptrs = {c: 0 for c in creators_list}
            reconstructed: List[Tuple[EditItem, float, Tuple[str, ...]]] = []
            for c in feasible_creator_order:
                reconstructed.append(items_by_creator[c][ptrs[c]][0])
                ptrs[c] += 1
            return reconstructed, False, []

        # Case 4: Infeasible or search budget exhausted. Fallback to greedy concentration-minimization.
        remaining = list(ranked)
        fallback_result: List[Tuple[EditItem, float, Tuple[str, ...]]] = []
        relaxation_occurred = False

        while remaining:
            window_start = max(0, len(fallback_result) - (window_size - 1))
            recent_creators = [r[0].creator for r in fallback_result[window_start:]]

            chosen_idx = None
            for idx, candidate in enumerate(remaining):
                creator = candidate[0].creator
                if recent_creators.count(creator) < max_per_window:
                    chosen_idx = idx
                    break

            if chosen_idx is not None:
                fallback_result.append(remaining.pop(chosen_idx))
            else:
                relaxation_occurred = True
                min_count = min(recent_creators.count(c[0].creator) for c in remaining)
                best_idx = 0
                for idx, candidate in enumerate(remaining):
                    if recent_creators.count(candidate[0].creator) == min_count:
                        best_idx = idx
                        break
                fallback_result.append(remaining.pop(best_idx))

        warnings.append("creator_cap_relaxed")
        if budget_exhausted:
            warnings.append("creator_cap_relaxed_search_budget_exhausted")
        else:
            warnings.append("creator_cap_relaxed_insufficient_diversity")
            warnings.append("creator_cap_relaxed_proven_infeasible")

        return fallback_result, True, sorted(list(set(warnings)))
