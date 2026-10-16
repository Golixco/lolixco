from collections import defaultdict
from typing import Dict, List, Optional, Sequence, Set, Tuple

from .catalog import Catalog
from .similarity import (
    category_match_score,
    compute_session_history_affinity,
    compute_tag_idf,
    tag_idf_similarity,
)
from .types import (
    EditItem,
    RecommendationRequest,
    RecommendationResponse,
    RecommendedItem,
)


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
                },
            )

        # 3. Creator Diversity Pre-Check
        unique_creators = {item.creator for item in eligible}
        creator_cap_relaxed = len(unique_creators) <= 2
        if creator_cap_relaxed:
            warnings.append("creator_cap_relaxed")

        # 4. Surface Dispatch
        if request.surface == "home":
            ranked_items = self._recommend_home(eligible, request)
        else:
            ranked_items = self._recommend_up_next(eligible, request)

        # 5. Apply Creator Cap if not relaxed
        if not creator_cap_relaxed:
            ranked_items = self._apply_creator_cap(ranked_items, max_per_window=2, window_size=10)

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
                "warnings": warnings,
                "creator_cap_relaxed": creator_cap_relaxed,
            },
        )

    def _recommend_home(
        self, eligible: List[EditItem], request: RecommendationRequest
    ) -> List[Tuple[EditItem, float, Tuple[str, ...]]]:
        """
        Home feed recommendation.
        If history is empty, performs deterministic category round-robin balance.
        If history exists, incorporates session affinity.
        """
        has_history = bool(request.history)

        if not has_history:
            # Cold-start: Category round-robin
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
                # Normalized linear position score in [0.50, 1.0] for cold start
                score = 1.0 - (0.50 * idx / max(total - 1, 1))
                results.append((item, score, ("cold_start", "category_balance")))

            return results

        # History-aware home feed
        scored: List[Tuple[EditItem, float, Tuple[str, ...]]] = []
        for item in eligible:
            affinity = compute_session_history_affinity(
                item, request.history, self.catalog, self.idf_table
            )
            score = 0.50 + 0.50 * affinity  # Baseline floor of 0.50
            reasons = ("session_continuity",) if affinity > 0.10 else ("cold_start", "category_balance")
            scored.append((item, score, reasons))

        # Deterministic sort: score DESC, id ASC
        scored.sort(key=lambda x: (-x[1], x[0].id))
        return scored

    def _recommend_up_next(
        self, eligible: List[EditItem], request: RecommendationRequest
    ) -> List[Tuple[EditItem, float, Tuple[str, ...]]]:
        """
        Up Next recommendation given currently playing video.
        Scored with category match, IDF tag similarity, and optional session affinity.
        """
        assert request.current_edit_id is not None
        current_edit = self.catalog.get(request.current_edit_id)
        assert current_edit is not None

        has_history = bool(request.history)

        # Dynamic renormalized weights
        w_cat = 0.45 if has_history else 0.55
        w_tag = 0.35 if has_history else 0.45
        w_hist = 0.20 if has_history else 0.00

        scored: List[Tuple[EditItem, float, Tuple[str, ...]]] = []

        for item in eligible:
            cat_score = category_match_score(item.category, current_edit.category)
            tag_score = tag_idf_similarity(item.tags, current_edit.tags, self.idf_table)
            hist_score = (
                compute_session_history_affinity(
                    item, request.history, self.catalog, self.idf_table
                )
                if has_history
                else 0.0
            )

            total_score = w_cat * cat_score + w_tag * tag_score + w_hist * hist_score

            reasons: List[str] = []
            if cat_score > 0.0:
                reasons.append("category_match")
            if tag_score > 0.15:
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
    ) -> List[Tuple[EditItem, float, Tuple[str, ...]]]:
        """
        Sliding window re-ranking to enforce creator diversity.
        Ensures at most max_per_window items from any creator within window_size.
        """
        selected: List[Tuple[EditItem, float, Tuple[str, ...]]] = []
        deferred: List[Tuple[EditItem, float, Tuple[str, ...]]] = []

        for candidate in ranked:
            item = candidate[0]
            # Check last (window_size - 1) items in selected
            recent_creators = [
                x[0].creator for x in selected[-(window_size - 1) :]
            ]
            creator_count = recent_creators.count(item.creator)

            if creator_count < max_per_window:
                selected.append(candidate)
            else:
                deferred.append(candidate)

        # Append deferred items at the end to avoid dropping content
        selected.extend(deferred)
        return selected
