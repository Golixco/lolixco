from pathlib import Path
import unittest

from server.recsys.catalog import load_catalog_from_json
from server.recsys.similarity import (
    category_match_score,
    compute_session_history_affinity,
    compute_tag_idf,
    tag_idf_similarity,
)
from server.recsys.types import WatchHistoryEntry


class TestSimilarity(unittest.TestCase):
    def setUp(self):
        snapshot_path = Path(__file__).resolve().parents[1] / "catalog_snapshot.json"
        self.catalog = load_catalog_from_json(snapshot_path)
        self.idf_table = compute_tag_idf(self.catalog)

    def test_idf_weights_downweight_generic_tags(self):
        # 'demo' and 'original' appear in all 17 edits: DF = 17
        # 'cinematic' appears in 3 edits (id 0, 6, 12): DF = 3
        # 'neon' appears in 8 edits (odd IDs): DF = 8
        idf_demo = self.idf_table["demo"]
        idf_original = self.idf_table["original"]
        idf_cinematic = self.idf_table["cinematic"]
        idf_neon = self.idf_table["neon"]

        # Universal tags must have lower IDF than specific category tags
        self.assertLess(idf_demo, idf_cinematic)
        self.assertLess(idf_original, idf_cinematic)
        self.assertLess(idf_demo, idf_neon)
        self.assertGreater(idf_cinematic, idf_neon)

    def test_tag_similarity_prevents_generic_tag_inflation(self):
        # Edit 0 (Cinematic): tags ["cinematic", "original", "demo", "landscape"]
        # Edit 6 (Cinematic): tags ["cinematic", "original", "demo", "landscape"]
        # Edit 1 (Gaming): tags ["gaming", "original", "demo", "neon"]

        # Edit 0 and Edit 6 share the specific "cinematic" and "landscape" tags
        sim_same_topic = tag_idf_similarity(
            self.catalog.get(0).tags, self.catalog.get(6).tags, self.idf_table
        )
        # Edit 0 and Edit 1 share ONLY generic tags ("original", "demo")
        sim_cross_topic = tag_idf_similarity(
            self.catalog.get(0).tags, self.catalog.get(1).tags, self.idf_table
        )

        self.assertEqual(sim_same_topic, 1.0)
        self.assertLess(sim_cross_topic, 0.45)
        self.assertGreater(sim_same_topic, sim_cross_topic)

    def test_category_match_score(self):
        self.assertEqual(category_match_score("Cinematic", "Cinematic"), 1.0)
        self.assertEqual(category_match_score("cinematic", "CINEMATIC"), 1.0)
        self.assertEqual(category_match_score("Cinematic", "Gaming"), 0.0)
        self.assertEqual(category_match_score("", "Cinematic"), 0.0)

    def test_session_history_affinity_filters_skips(self):
        candidate = self.catalog.get(0)  # Cinematic

        # History with a quick skip (1.5s < 2.0s threshold)
        skip_history = [
            WatchHistoryEntry(edit_id=6, unique_watch_ms=1500, occurred_at="2026-10-16T12:00:00Z")
        ]
        affinity_skip = compute_session_history_affinity(
            candidate, skip_history, self.catalog, self.idf_table
        )
        self.assertEqual(affinity_skip, 0.0)

        # History with full watch (12s) of a matching cinematic video (ID 6)
        full_watch_history = [
            WatchHistoryEntry(edit_id=6, unique_watch_ms=12000, occurred_at="2026-10-16T12:00:00Z")
        ]
        affinity_full = compute_session_history_affinity(
            candidate, full_watch_history, self.catalog, self.idf_table
        )
        self.assertGreater(affinity_full, 0.70)


if __name__ == "__main__":
    unittest.main()
