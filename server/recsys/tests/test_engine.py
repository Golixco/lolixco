from pathlib import Path
import unittest

from server.recsys.catalog import Catalog, load_catalog_from_json
from server.recsys.engine import RecommendationEngine
from server.recsys.types import (
    EditItem,
    RecommendationRequest,
    WatchHistoryEntry,
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

    def test_repeatability_and_determinism(self):
        req = RecommendationRequest(surface="home", limit=17)
        resp1 = self.engine.recommend(req)
        resp2 = self.engine.recommend(req)

        ids1 = [item.edit.id for item in resp1.items]
        ids2 = [item.edit.id for item in resp2.items]
        scores1 = [item.score for item in resp1.items]
        scores2 = [item.score for item in resp2.items]

        self.assertEqual(ids1, ids2)
        self.assertEqual(scores1, scores2)

    def test_up_next_relevance_and_active_video_suppression(self):
        # Current edit is 0 ("Into the Light", Cinematic)
        req = RecommendationRequest(surface="up_next", current_edit_id=0, limit=10)
        resp = self.engine.recommend(req)

        # Invariant: Active edit 0 MUST be suppressed from its own Up Next
        rec_ids = [item.edit.id for item in resp.items]
        self.assertNotIn(0, rec_ids)

        # The other Cinematic edits in catalog are ID 6 ("Broken Crowns") and ID 12 ("Cold Hearts")
        # They should be ranked #1 and #2 due to exact category match + tag similarity
        self.assertEqual(resp.items[0].edit.id, 6)
        self.assertEqual(resp.items[0].edit.category, "Cinematic")
        self.assertIn("category_match", resp.items[0].reason_codes)

        self.assertEqual(resp.items[1].edit.id, 12)
        self.assertEqual(resp.items[1].edit.category, "Cinematic")
        self.assertIn("category_match", resp.items[1].reason_codes)

        # Total eligible is 16 (17 minus active video 0)
        self.assertEqual(resp.total_eligible, 16)

    def test_up_next_with_exclusions(self):
        # Exclude edit 6
        req = RecommendationRequest(
            surface="up_next", current_edit_id=0, exclude_edit_ids=(6,), limit=5
        )
        resp = self.engine.recommend(req)
        rec_ids = [item.edit.id for item in resp.items]

        self.assertNotIn(0, rec_ids)
        self.assertNotIn(6, rec_ids)
        self.assertEqual(resp.items[0].edit.id, 12)

    def test_unknown_current_edit_raises_keyerror(self):
        req = RecommendationRequest(surface="up_next", current_edit_id=999)
        with self.assertRaises(KeyError) as ctx:
            self.engine.recommend(req)
        self.assertIn("999", str(ctx.exception))

    def test_empty_eligible_pool_returns_gracefully(self):
        # Exclude all 17 items
        all_ids = tuple(range(17))
        req = RecommendationRequest(surface="home", exclude_edit_ids=all_ids)
        resp = self.engine.recommend(req)

        self.assertEqual(resp.total_eligible, 0)
        self.assertEqual(len(resp.items), 0)
        self.assertEqual(resp.diagnostics.get("fallback_reason"), "empty_eligible_pool")

    def test_creator_diversity_cap_enforcement_multi_creator(self):
        # Create a synthetic catalog with multiple creators to test cap enforcement
        multi_creator_items = []
        for i in range(15):
            # Creators: CreatorA (10 items), CreatorB (5 items)
            creator = "CreatorA" if i < 10 else "CreatorB"
            multi_creator_items.append(
                EditItem(
                    id=i,
                    title=f"Edit {i}",
                    category="Cinematic",
                    tags=("cinematic", "tag"),
                    description="",
                    creator=creator,
                    poster="",
                    source="",
                    duration="0:12",
                    duration_ms=12000,
                    duration_sec=12.0,
                )
            )

        cat = Catalog(multi_creator_items)
        engine = RecommendationEngine(cat)

        req = RecommendationRequest(surface="home", limit=10)
        resp = engine.recommend(req)

        # Distinct creators > 2? Here we have 2 creators.
        # Let's add a third creator so creator cap is NOT relaxed:
        multi_creator_items.append(
            EditItem(
                id=15,
                title="Edit 15",
                category="Gaming",
                tags=("gaming",),
                description="",
                creator="CreatorC",
                poster="",
                source="",
                duration="0:12",
                duration_ms=12000,
                duration_sec=12.0,
            )
        )
        cat3 = Catalog(multi_creator_items)
        engine3 = RecommendationEngine(cat3)
        resp3 = engine3.recommend(req)

        self.assertFalse(resp3.diagnostics.get("creator_cap_relaxed"))
        # Check first 5 items: CreatorA should appear at most 2 times in the top positions
        creators_in_top = [item.edit.creator for item in resp3.items]
        # In any 10-window, no creator can appear > 2 times before deferred items
        self.assertLessEqual(creators_in_top[:4].count("CreatorA"), 2)

    def test_deterministic_tie_breaking(self):
        # Edits 1 and 7 are both Gaming with exact same category and tags
        # Given current edit 13 (Gaming), both edits 1 and 7 will have identical score
        req = RecommendationRequest(surface="up_next", current_edit_id=13, limit=10)
        resp = self.engine.recommend(req)

        # Both match Gaming and neon tag
        top_ids = [item.edit.id for item in resp.items[:2]]
        # Edit 1 must precede Edit 7 due to deterministic ID ASC tie-break
        self.assertEqual(top_ids, [1, 7])


if __name__ == "__main__":
    unittest.main()
