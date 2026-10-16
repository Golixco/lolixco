from pathlib import Path
import unittest

from server.recsys.catalog import (
    Catalog,
    load_catalog_from_json,
    parse_duration_to_ms,
)
from server.recsys.types import EditItem


class TestCatalog(unittest.TestCase):
    def test_parse_duration_to_ms_valid(self):
        # 12 seconds
        ms, sec = parse_duration_to_ms("0:12")
        self.assertEqual(ms, 12000)
        self.assertEqual(sec, 12.0)

        # 1 minute 5 seconds
        ms, sec = parse_duration_to_ms("1:05")
        self.assertEqual(ms, 65000)
        self.assertEqual(sec, 65.0)

        # 1 hour 2 minutes 3 seconds
        ms, sec = parse_duration_to_ms("1:02:03")
        self.assertEqual(ms, 3723000)
        self.assertEqual(sec, 3723.0)

        # pure seconds
        ms, sec = parse_duration_to_ms("45.5")
        self.assertEqual(ms, 45500)
        self.assertEqual(sec, 45.5)

    def test_parse_duration_to_ms_invalid(self):
        with self.assertRaises(ValueError):
            parse_duration_to_ms("")
        with self.assertRaises(ValueError):
            parse_duration_to_ms("0:00")
        with self.assertRaises(ValueError):
            parse_duration_to_ms("-0:12")
        with self.assertRaises(ValueError):
            parse_duration_to_ms("not_a_time")
        with self.assertRaises(ValueError):
            parse_duration_to_ms("1:2:3:4")

    def test_edit_item_validation(self):
        # Valid edit with ID 0
        edit0 = EditItem(
            id=0,
            title="Into the Light",
            category="Cinematic",
            tags=("cinematic", "original", "demo"),
            description="Testing artwork",
            creator="Lolixco demo",
            poster="/poster.svg",
            source="/video.webm",
            duration="0:12",
            duration_ms=12000,
            duration_sec=12.0,
            trending=False,
        )
        self.assertEqual(edit0.id, 0)
        self.assertEqual(edit0.title, "Into the Light")

        # Invalid negative ID
        with self.assertRaises(ValueError):
            EditItem(
                id=-1,
                title="Bad ID",
                category="Cinematic",
                tags=(),
                description="",
                creator="",
                poster="",
                source="",
                duration="0:12",
                duration_ms=12000,
                duration_sec=12.0,
            )

        # Invalid empty title
        with self.assertRaises(ValueError):
            EditItem(
                id=1,
                title="",
                category="Cinematic",
                tags=(),
                description="",
                creator="",
                poster="",
                source="",
                duration="0:12",
                duration_ms=12000,
                duration_sec=12.0,
            )

    def test_catalog_id_zero_preservation_and_lookups(self):
        snapshot_path = Path(__file__).resolve().parents[1] / "catalog_snapshot.json"
        catalog = load_catalog_from_json(snapshot_path)

        # All 17 items loaded
        self.assertEqual(len(catalog), 17)

        # ID 0 is in catalog and properly retrieved
        self.assertIn(0, catalog)
        edit0 = catalog.get(0)
        self.assertIsNotNone(edit0)
        self.assertEqual(edit0.id, 0)
        self.assertEqual(edit0.title, "Into the Light")
        self.assertEqual(edit0.category, "Cinematic")
        self.assertEqual(edit0.duration_ms, 12000)

        # ID 16 is in catalog
        self.assertIn(16, catalog)
        edit16 = catalog.get(16)
        self.assertIsNotNone(edit16)
        self.assertEqual(edit16.id, 16)
        self.assertEqual(edit16.title, "Midnight City")

        # Non-existent ID returns None
        self.assertIsNone(catalog.get(999))
        self.assertNotIn(999, catalog)

    def test_catalog_duplicate_ids_rejected(self):
        raw = [
            {"id": 0, "title": "A", "category": "C", "tags": [], "duration": "0:12"},
            {"id": 0, "title": "B", "category": "C", "tags": [], "duration": "0:12"},
        ]
        with self.assertRaises(ValueError) as ctx:
            Catalog.from_dict_list(raw)
        self.assertIn("Duplicate edit ID", str(ctx.exception))

    def test_catalog_categories_and_creators(self):
        snapshot_path = Path(__file__).resolve().parents[1] / "catalog_snapshot.json"
        catalog = load_catalog_from_json(snapshot_path)

        expected_categories = ("Anime", "Cinematic", "Gaming", "Movies", "Phonk", "Series")
        self.assertEqual(catalog.categories, expected_categories)
        self.assertEqual(catalog.creators, ("Lolixco demo",))


if __name__ == "__main__":
    unittest.main()
