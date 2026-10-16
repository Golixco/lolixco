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

        # Boilerplate tags receive fixed zero weight (0.0)
        self.assertEqual(idf_demo, 0.0)
        self.assertEqual(idf_original, 0.0)

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
        # Because boilerplate tags are zero-weighted and filtered, cross-topic similarity with only boilerplate is strictly 0.0
        self.assertEqual(sim_cross_topic, 0.0)

    def test_adversarial_boilerplate_only_mixed_and_distinctive_tag_sets(self):
        """
        Adversarial regression test:
        1. Boilerplate-only overlap produces strictly 0.0 similarity.
        2. Boilerplate overlap with non-matching tags produces strictly 0.0 similarity.
        3. Mixed sets with genuine informative overlap are preserved.
        4. Identical distinctive sets yield 1.0.
        """
        # Case 1: Both edits contain ONLY boilerplate tags (reproduction case from review)
        tags_boilerplate_only_a = ["original", "demo"]
        tags_boilerplate_only_b = ["original", "demo"]
        sim_boilerplate_only = tag_idf_similarity(
            tags_boilerplate_only_a, tags_boilerplate_only_b, self.idf_table
        )
        self.assertEqual(
            sim_boilerplate_only,
            0.0,
            "Boilerplate-only overlap must yield 0.0 similarity, not 1.0",
        )

        # Case 2: Boilerplate overlap with other non-matching tags
        tags_disjoint_with_boilerplate_a = ["original", "demo", "cinematic", "film"]
        tags_disjoint_with_boilerplate_b = ["original", "demo", "gaming", "neon"]
        sim_disjoint_with_bp = tag_idf_similarity(
            tags_disjoint_with_boilerplate_a,
            tags_disjoint_with_boilerplate_b,
            self.idf_table,
        )
        self.assertEqual(
            sim_disjoint_with_bp,
            0.0,
            "Disjoint tags with boilerplate overlap must yield 0.0 similarity",
        )

        # Case 3: Mixed tags with genuine informative overlap
        tags_mixed_a = ["original", "demo", "phonk", "drift"]
        tags_mixed_b = ["original", "demo", "phonk", "bass"]
        sim_mixed = tag_idf_similarity(tags_mixed_a, tags_mixed_b, self.idf_table)
        self.assertGreater(sim_mixed, 0.0)
        # Verify the calculation equals exactly IDF("phonk") / (IDF("phonk") + IDF("drift") + IDF("bass"))
        expected_intersection = self.idf_table.get("phonk", 1.0)
        expected_union = (
            self.idf_table.get("phonk", 1.0)
            + self.idf_table.get("drift", 1.0)
            + self.idf_table.get("bass", 1.0)
        )
        self.assertAlmostEqual(sim_mixed, expected_intersection / expected_union)

        # Case 4: Genuinely distinctive tag sets with 100% overlap
        tags_distinctive_a = ["phonk", "drift"]
        tags_distinctive_b = ["phonk", "drift"]
        sim_distinctive = tag_idf_similarity(
            tags_distinctive_a, tags_distinctive_b, self.idf_table
        )
        self.assertEqual(sim_distinctive, 1.0)

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
