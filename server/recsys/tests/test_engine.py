from pathlib import Path
import unittest

from server.recsys.catalog import Catalog, load_catalog_from_json
from server.recsys.engine import (
    RecommendationEngine,
    verify_sliding_window_diversity,
)
from server.recsys.types import (
    EditItem,
    RecommendationRequest,
    WatchHistoryEntry,
)


def make_test_item(edit_id: int, creator: str, category: str = "Cinematic") -> EditItem:
    return EditItem(
        id=edit_id,
        title=f"Edit {edit_id}",
        category=category,
        tags=("cinematic", "tag"),
        description="Desc",
        creator=creator,
        poster="/p.svg",
        source="/s.webm",
        duration="0:12",
        duration_ms=12000,
        duration_sec=12.0,
        trending=False,
    )


class TestRecommendationEngine(unittest.TestCase):
    def setUp(self):
        snapshot_path = Path(__file__).resolve().parents[1] / "catalog_snapshot.json"
        self.catalog = load_catalog_from_json(snapshot_path)
        self.engine = RecommendationEngine(self.catalog)

    def test_cold_start_home_category_balance(self):
        req = RecommendationRequest(surface="home", limit=12)
        resp = self.engine.recommend(req)

        self.assertEqual(resp.surface, "home")
        self.assertEqual(resp.mode_used, "baseline")
        self.assertEqual(len(resp.items), 12)
        self.assertEqual(resp.total_eligible, 17)

        # The first 6 items must span all 6 distinct categories
        top_6_categories = [item.edit.category for item in resp.items[:6]]
        self.assertEqual(len(set(top_6_categories)), 6)
        expected_categories = {"Anime", "Cinematic", "Gaming", "Movies", "Phonk", "Series"}
        self.assertEqual(set(top_6_categories), expected_categories)

        # Check reason codes for cold start
        for item in resp.items:
            self.assertEqual(item.reason_codes, ("cold_start", "category_balance"))

        # Verify ID 0 is preserved and present
        item_ids = [item.edit.id for item in resp.items]
        self.assertIn(0, item_ids)

        # Single creator cap relaxation warning present
        self.assertTrue(resp.diagnostics.get("creator_cap_relaxed"))
        self.assertIn("creator_cap_relaxed", resp.diagnostics.get("warnings", []))

    def test_usable_history_detection_preserves_cold_start_on_unusable_signals(self):
        # 1. History with ONLY quick skips (< 2s)
        skip_req = RecommendationRequest(
            surface="home",
            limit=12,
            history=(
                WatchHistoryEntry(edit_id=0, unique_watch_ms=1000, occurred_at="2026-10-16T12:00:00Z"),
                WatchHistoryEntry(edit_id=1, unique_watch_ms=1500, occurred_at="2026-10-16T12:05:00Z"),
            ),
        )
        skip_resp = self.engine.recommend(skip_req)

        # Must preserve TRUE category-balanced cold start!
        top_6_cats = [item.edit.category for item in skip_resp.items[:6]]
        self.assertEqual(len(set(top_6_cats)), 6)
        for item in skip_resp.items:
            self.assertEqual(item.reason_codes, ("cold_start", "category_balance"))
        self.assertIn("history_unusable_or_skipped", skip_resp.diagnostics.get("warnings", []))

        # 2. History with ONLY unknown edit IDs
        unknown_req = RecommendationRequest(
            surface="home",
            limit=12,
            history=(
                WatchHistoryEntry(edit_id=999, unique_watch_ms=15000, occurred_at="2026-10-16T12:00:00Z"),
            ),
        )
        unknown_resp = self.engine.recommend(unknown_req)

        # Must preserve TRUE category-balanced cold start!
        top_6_cats_unknown = [item.edit.category for item in unknown_resp.items[:6]]
        self.assertEqual(len(set(top_6_cats_unknown)), 6)
        for item in unknown_resp.items:
            self.assertEqual(item.reason_codes, ("cold_start", "category_balance"))
        self.assertIn("history_unusable_or_skipped", unknown_resp.diagnostics.get("warnings", []))
        self.assertIn("history_items_ignored", unknown_resp.diagnostics.get("warnings", []))

        # 3. History with GENUINE usable watch time (e.g. 10s of Edit 6, Cinematic)
        valid_req = RecommendationRequest(
            surface="home",
            limit=12,
            history=(
                WatchHistoryEntry(edit_id=6, unique_watch_ms=10000, occurred_at="2026-10-16T12:00:00Z"),
            ),
        )
        valid_resp = self.engine.recommend(valid_req)

        # Top item should be Cinematic edit 0 due to strong category & tag affinity
        self.assertEqual(valid_resp.items[0].edit.category, "Cinematic")
        self.assertIn("session_continuity", valid_resp.items[0].reason_codes)

    def test_generic_boilerplate_tags_do_not_emit_tag_similarity_explanation(self):
        # Current edit is 0 (Cinematic): ["cinematic", "original", "demo", "landscape"]
        req = RecommendationRequest(surface="up_next", current_edit_id=0, limit=16)
        resp = self.engine.recommend(req)

        # Edit 6 ("Broken Crowns", Cinematic) shares the meaningful tag "cinematic"
        item_6 = next(i for i in resp.items if i.edit.id == 6)
        self.assertIn("tag_similarity", item_6.reason_codes)

        # Edit 4 ("Silent World", Series) shares ONLY "original", "demo", and "landscape"
        # It must NOT emit "tag_similarity" because it has no distinctive topic tag overlap!
        item_4 = next(i for i in resp.items if i.edit.id == 4)
        self.assertNotIn("tag_similarity", item_4.reason_codes)

        # Same for Gaming edit 1 which only shares "original" and "demo"
        item_1 = next(i for i in resp.items if i.edit.id == 1)
        self.assertNotIn("tag_similarity", item_1.reason_codes)

    def test_creator_diversity_reranker_adversarial_1_to_6_creators(self):
        # 1. Single Creator (1-creator demo catalog):
        # Must be relaxed with explicit warning and return all items
        req1 = RecommendationRequest(surface="home", limit=12)
        resp1 = self.engine.recommend(req1)
        self.assertTrue(resp1.diagnostics.get("creator_cap_relaxed"))
        self.assertIn("creator_cap_relaxed", resp1.diagnostics.get("warnings", []))
        self.assertEqual(len(resp1.items), 12)

        # 2. Two Creators (<= 2 creators):
        items_2c = [make_test_item(i, "CreatorA" if i % 2 == 0 else "CreatorB") for i in range(12)]
        cat_2c = Catalog(items_2c)
        engine_2c = RecommendationEngine(cat_2c)
        resp_2c = engine_2c.recommend(req1)
        self.assertTrue(resp_2c.diagnostics.get("creator_cap_relaxed"))
        self.assertIn("creator_cap_relaxed", resp_2c.diagnostics.get("warnings", []))
        self.assertEqual(len(resp_2c.items), 12)

        # 3. Three Creators (3 creators):
        # Note: In a 10-item window, 3 creators can at most provide 3 * 2 = 6 items.
        # Once 6 items are placed, all 3 creators have count 2.
        # The engine must detect mathematical impossibility, relax gracefully, and emit diagnostic.
        items_3c = []
        for i in range(20):
            c = "CreatorA" if i < 10 else ("CreatorB" if i < 15 else "CreatorC")
            items_3c.append(make_test_item(i, c))

        cat_3c = Catalog(items_3c)
        engine_3c = RecommendationEngine(cat_3c)
        resp_3c = engine_3c.recommend(RecommendationRequest(surface="home", limit=15))

        self.assertTrue(resp_3c.diagnostics.get("creator_cap_relaxed"))
        self.assertIn("creator_cap_relaxed_insufficient_diversity", resp_3c.diagnostics.get("warnings", []))
        self.assertEqual(len(resp_3c.items), 15)

        # 4. Four Creators (4 creators):
        # 4 creators can at most provide 4 * 2 = 8 items in a 10-window.
        # For a 15-item feed, relaxation is mathematically required once the window saturates.
        items_4c = [make_test_item(i, f"Creator_{i % 4}") for i in range(20)]
        cat_4c = Catalog(items_4c)
        engine_4c = RecommendationEngine(cat_4c)
        resp_4c = engine_4c.recommend(RecommendationRequest(surface="home", limit=15))

        self.assertTrue(resp_4c.diagnostics.get("creator_cap_relaxed"))
        self.assertIn("creator_cap_relaxed_insufficient_diversity", resp_4c.diagnostics.get("warnings", []))
        self.assertEqual(len(resp_4c.items), 15)

        # 5. Five Creators (5 creators):
        # 5 creators * 2 = 10 items. Perfect capacity to satisfy a 2-per-10 sliding window!
        # With 5 creators (4 items each), strict enforcement is mathematically feasible.
        items_5c = [make_test_item(i, f"Creator_{i % 5}") for i in range(25)]
        cat_5c = Catalog(items_5c)
        engine_5c = RecommendationEngine(cat_5c)
        resp_5c = engine_5c.recommend(RecommendationRequest(surface="home", limit=20))

        # Strict enforcement must succeed without relaxation
        self.assertFalse(resp_5c.diagnostics.get("creator_cap_relaxed"))
        valid_5c, violations_5c = verify_sliding_window_diversity(resp_5c.items, max_per_window=2, window_size=10)
        self.assertTrue(valid_5c, f"Violations found in 5-creator feed: {violations_5c}")

        # 6. Six Creators (6 creators):
        # 6 creators provides ample diversity. Strict enforcement succeeds for all complete sliding windows.
        items_6c = [make_test_item(i, f"Creator_{i % 6}") for i in range(30)]
        cat_6c = Catalog(items_6c)
        engine_6c = RecommendationEngine(cat_6c)
        resp_6c = engine_6c.recommend(RecommendationRequest(surface="home", limit=25))

        self.assertFalse(resp_6c.diagnostics.get("creator_cap_relaxed"))
        valid_6c, violations_6c = verify_sliding_window_diversity(resp_6c.items, max_per_window=2, window_size=10)
        self.assertTrue(valid_6c, f"Violations found in 6-creator feed: {violations_6c}")

        # 7. Five Creators with Extreme Skew:
        # CreatorA (20 items), Creators B/C/D/E (1 item each).
        # Once the minority creators are used up, strict enforcement is mathematically impossible.
        # The engine must detect this, relax, emit diagnostic, and not drop any eligible items.
        items_skew = [make_test_item(i, "CreatorA") for i in range(20)]
        items_skew.extend([make_test_item(20 + j, f"Minority_{j}") for j in range(4)])
        cat_skew = Catalog(items_skew)
        engine_skew = RecommendationEngine(cat_skew)
        resp_skew = engine_skew.recommend(RecommendationRequest(surface="home", limit=20))

        self.assertTrue(resp_skew.diagnostics.get("creator_cap_relaxed"))
        self.assertIn("creator_cap_relaxed_insufficient_diversity", resp_skew.diagnostics.get("warnings", []))
        self.assertEqual(len(resp_skew.items), 20)

    def test_up_next_relevance_and_active_video_suppression(self):
        req = RecommendationRequest(surface="up_next", current_edit_id=0, limit=10)
        resp = self.engine.recommend(req)

        rec_ids = [item.edit.id for item in resp.items]
        self.assertNotIn(0, rec_ids)

        # Edit 6 and Edit 12 are Cinematic, ranked at top
        self.assertEqual(resp.items[0].edit.id, 6)
        self.assertEqual(resp.items[0].edit.category, "Cinematic")
        self.assertEqual(resp.items[1].edit.id, 12)
        self.assertEqual(resp.items[1].edit.category, "Cinematic")

    def test_deterministic_tie_breaking(self):
        req = RecommendationRequest(surface="up_next", current_edit_id=13, limit=10)
        resp = self.engine.recommend(req)

        top_ids = [item.edit.id for item in resp.items[:2]]
        self.assertEqual(top_ids, [1, 7])

    def test_empty_eligible_pool_returns_gracefully(self):
        all_ids = tuple(range(17))
        req = RecommendationRequest(surface="home", exclude_edit_ids=all_ids)
        resp = self.engine.recommend(req)

        self.assertEqual(resp.total_eligible, 0)
        self.assertEqual(len(resp.items), 0)
        self.assertEqual(resp.diagnostics.get("fallback_reason"), "empty_eligible_pool")

    def test_adversarial_creator_diversity_feasibility(self):
        """
        Adversarial regression test:
        5 creators: A, B, C, D, E (3 edits each).
        Initial order: DDACBEECEABDABC (15 items).
        A valid solution exists (e.g. DACBEDECABDACBE or ABCDEABCDEABCDE).
        Engine must find a feasible ordering without relaxing the creator cap.
        """
        creator_seq = "DDACBEECEABDABC"
        items = []
        for idx, c in enumerate(creator_seq):
            items.append(
                EditItem(
                    id=idx,
                    title=f"Edit {idx}",
                    category="Cinematic",
                    tags=("cinematic", "film"),
                    description="Adversarial item",
                    creator=f"Creator_{c}",
                    poster="/p.svg",
                    source="/s.webm",
                    duration="0:15",
                    duration_ms=15000,
                    duration_sec=15.0,
                    trending=False,
                )
            )

        cat = Catalog(items)
        engine = RecommendationEngine(cat)
        req = RecommendationRequest(surface="home", limit=15)
        resp = engine.recommend(req)

        self.assertEqual(len(resp.items), 15)
        self.assertFalse(resp.diagnostics.get("creator_cap_relaxed"), "Feasible catalog should not relax cap")
        self.assertNotIn("creator_cap_relaxed", resp.diagnostics.get("warnings", []))
        self.assertNotIn("creator_cap_relaxed_insufficient_diversity", resp.diagnostics.get("warnings", []))

        # Verify every 10-item sliding window has <= 2 items per creator
        valid, violations = verify_sliding_window_diversity(resp.items, max_per_window=2, window_size=10)
        self.assertTrue(valid, f"Expected zero window violations, got: {violations}")

        # Verify all 15 item IDs are preserved
        result_ids = [item.edit.id for item in resp.items]
        self.assertEqual(sorted(result_ids), list(range(15)))

    def test_distinguish_proven_infeasibility_from_budget_exhaustion(self):
        """Verify explicit differentiation between proven infeasibility and search budget exhaustion."""
        # 1. Proven infeasibility (3 creators, 20 items: max capacity in 10-window is 6 < 10)
        items_3c = []
        for i in range(20):
            c = "CreatorA" if i < 10 else ("CreatorB" if i < 15 else "CreatorC")
            items_3c.append(make_test_item(i, c))

        cat_3c = Catalog(items_3c)
        engine_3c = RecommendationEngine(cat_3c)
        resp_3c = engine_3c.recommend(RecommendationRequest(surface="home", limit=15))

        self.assertTrue(resp_3c.diagnostics.get("creator_cap_relaxed"))
        self.assertIn("creator_cap_relaxed_proven_infeasible", resp_3c.diagnostics.get("warnings", []))
        self.assertNotIn("creator_cap_relaxed_search_budget_exhausted", resp_3c.diagnostics.get("warnings", []))

        # 2. Budget exhaustion test on adversarial sequence with budget=1
        creator_seq = "DDACBEECEABDABC"
        items = [make_test_item(i, f"Creator_{c}") for i, c in enumerate(creator_seq)]
        ranked = [(it, 1.0 - i * 0.01, ("test",)) for i, it in enumerate(items)]

        # With budget=1, it cannot complete the backtracking search and must flag budget exhaustion
        _, relaxed, warnings = self.engine._apply_creator_cap(ranked, max_per_window=2, window_size=10, budget=1)
        self.assertTrue(relaxed)
        self.assertIn("creator_cap_relaxed_search_budget_exhausted", warnings)

    def test_category_filter_rejection_and_empty_valid_filter(self):
        """Reject unknown category filters; handle valid categories with 0 items cleanly."""
        # Unknown category filter rejected at schema level
        with self.assertRaises(ValueError):
            RecommendationRequest(surface="home", category_filter="VFX")

        # Valid category filter with zero matching items (all Cinematic items excluded)
        cinematic_ids = tuple(item.id for item in self.engine.catalog.all_items if item.category == "Cinematic")
        req_zero = RecommendationRequest(surface="home", category_filter="Cinematic", exclude_edit_ids=cinematic_ids)
        resp_zero = self.engine.recommend(req_zero)

        self.assertEqual(resp_zero.total_eligible, 0)
        self.assertEqual(len(resp_zero.items), 0)
        self.assertEqual(resp_zero.diagnostics.get("fallback_reason"), "empty_eligible_pool")

    def test_honest_explanations_in_up_next_and_history_home(self):
        """Do not claim category_balance in history Home, nor thematic_relation without thematic similarity."""
        # 1. History-aware Home: low affinity items must NOT claim category_balance
        valid_req = RecommendationRequest(
            surface="home",
            limit=17,
            history=(
                WatchHistoryEntry(edit_id=6, unique_watch_ms=10000, occurred_at="2026-10-16T12:00:00Z"),
            ),
        )
        resp = self.engine.recommend(valid_req)
        for item in resp.items:
            self.assertNotIn(
                "category_balance",
                item.reason_codes,
                f"Item {item.edit.id} claimed category_balance in history-aware feed",
            )

        # 2. Up Next: Unrelated item with no shared category, no shared tags, and no history
        # Create an unrelated item with disjoint category and tags
        disjoint_item = EditItem(
            id=99,
            title="Disjoint Sound",
            category="Phonk",
            tags=("phonk", "drift", "bass"),
            description="Pure phonk music",
            creator="Phonk Producer",
            poster="/p.svg",
            source="/s.webm",
            duration="0:30",
            duration_ms=30000,
            duration_sec=30.0,
            trending=False,
        )
        custom_catalog = Catalog([self.engine.catalog.get(0), disjoint_item])
        custom_engine = RecommendationEngine(custom_catalog)
        resp_upnext = custom_engine.recommend(RecommendationRequest(surface="up_next", current_edit_id=0, limit=5))

        self.assertEqual(len(resp_upnext.items), 1)
        upnext_item = resp_upnext.items[0]
        self.assertEqual(upnext_item.edit.id, 99)
        self.assertNotIn("thematic_relation", upnext_item.reason_codes)
        self.assertIn("fallback_exploration", upnext_item.reason_codes)


if __name__ == "__main__":
    unittest.main()
