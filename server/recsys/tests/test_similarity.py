from pathlib import Path
import unittest

from server.recsys.catalog import load_catalog_from_json
from server.recsys.similarity import (
    category_match_score,
    compute_session_history_affinity,
    compute_tag_idf,
    get_meaningful_shared_tags,
    get_usable_history,
    tag_idf_similarity,
)
from server.recsys.types import WatchHistoryEntry


class TestSimilarity(unittest.TestCase):
    def setUp(self):
        snapshot_path = Path(__file__).resolve().parents[1] / "catalog_snapshot.json"
        self.catalog = load_catalog_from_json(snapshot_path)
        self.idf_table = compute_tag_idf(self.catalog)

    def test_idf_weights_severely_discount_boilerplate_tags(self):
        # 'demo' and 'original' are boilerplate tags in all 17 edits
        idf_demo = self.idf_table["demo"]
        idf_original = self.idf_table["original"]
        idf_cinematic = self.idf_table["cinematic"]
        idf_neon = self.idf_table["neon"]

        # Boilerplate tags receive minimal weight (0.01)
        self.assertAlmostEqual(idf_demo, 0.01)
        self.assertAlmostEqual(idf_original, 0.01)

        # Non-boilerplate tags receive true IDF values
        self.assertGreater(idf_cinematic, 1.0)
        self.assertGreater(idf_neon, 0.5)

    def test_meaningful_shared_tags_detection(self):
        # Edit 0 (Cinematic): ["cinematic", "original", "demo", "landscape"]
        # Edit 1 (Gaming): ["gaming", "original", "demo", "neon"]
        # Edit 6 (Cinematic): ["cinematic", "original", "demo", "landscape"]

        # Cross-category edits 0 and 1 only share boilerplate tags -> meaningful set is EMPTY
        meaningful_0_1 = get_meaningful_shared_tags(
            self.catalog.get(0).tags, self.catalog.get(1).tags, self.catalog
        )
        self.assertEqual(meaningful_0_1, set())

        # Same-category edits 0 and 6 share "cinematic" (informative topic tag)
        meaningful_0_6 = get_meaningful_shared_tags(
            self.catalog.get(0).tags, self.catalog.get(6).tags, self.catalog
        )
        self.assertIn("cinematic", meaningful_0_6)

    def test_tag_similarity_prevents_generic_tag_inflation(self):
        sim_same_topic = tag_idf_similarity(
            self.catalog.get(0).tags, self.catalog.get(6).tags, self.idf_table
        )
        sim_cross_topic = tag_idf_similarity(
            self.catalog.get(0).tags, self.catalog.get(1).tags, self.idf_table
        )

        self.assertGreater(sim_same_topic, 0.95)
        # Because boilerplate tags are discounted to 0.01, cross-topic similarity with only boilerplate is ~0.0
        self.assertLess(sim_cross_topic, 0.05)

    def test_category_match_score(self):
        self.assertEqual(category_match_score("Cinematic", "Cinematic"), 1.0)
        self.assertEqual(category_match_score("cinematic", "CINEMATIC"), 1.0)
        self.assertEqual(category_match_score("Cinematic", "Gaming"), 0.0)
        self.assertEqual(category_match_score("", "Cinematic"), 0.0)

    def test_usable_history_filtering(self):
        # 1. Unknown edit ID
        h_unknown = [
            WatchHistoryEntry(edit_id=999, unique_watch_ms=10000, occurred_at="2026-10-16T12:00:00Z")
        ]
        usable, ignored = get_usable_history(h_unknown, self.catalog)
        self.assertEqual(len(usable), 0)
        self.assertEqual(ignored, 1)

        # 2. Quick skip (<2000ms)
        h_skip = [
            WatchHistoryEntry(edit_id=0, unique_watch_ms=1500, occurred_at="2026-10-16T12:00:00Z")
        ]
        usable, ignored = get_usable_history(h_skip, self.catalog)
        self.assertEqual(len(usable), 0)
        self.assertEqual(ignored, 1)

        # 3. Valid watch (>= 2000ms)
        h_valid = [
            WatchHistoryEntry(edit_id=0, unique_watch_ms=8000, occurred_at="2026-10-16T12:00:00Z")
        ]
        usable, ignored = get_usable_history(h_valid, self.catalog)
        self.assertEqual(len(usable), 1)
        self.assertEqual(ignored, 0)
        self.assertEqual(usable[0].edit_id, 0)


if __name__ == "__main__":
    unittest.main()
