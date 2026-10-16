from pathlib import Path
import unittest

from server.recsys.catalog import (
    Catalog,
    load_catalog_from_json,
    parse_duration_to_ms,
)
from server.recsys.types import (
    EditItem,
    RecommendationRequest,
    WatchHistoryEntry,
)


class TestCatalogValidation(unittest.TestCase):
    def test_parse_duration_to_ms_valid(self):
        ms, sec = parse_duration_to_ms("0:12")
        self.assertEqual(ms, 12000)
        self.assertEqual(sec, 12.0)

        ms, sec = parse_duration_to_ms("1:05")
        self.assertEqual(ms, 65000)
        self.assertEqual(sec, 65.0)

        ms, sec = parse_duration_to_ms("1:02:03")
        self.assertEqual(ms, 3723000)
        self.assertEqual(sec, 3723.0)

        ms, sec = parse_duration_to_ms("45.5")
        self.assertEqual(ms, 45500)
        self.assertEqual(sec, 45.5)

    def test_parse_duration_to_ms_invalid(self):
        for bad in ["", "0:00", "-0:12", "not_a_time", "1:2:3:4", "-5", None]:
            with self.subTest(duration=bad):
                with self.assertRaises((ValueError, TypeError)):
                    parse_duration_to_ms(bad)  # type: ignore

    def test_edit_item_strict_schema_validation(self):
        # 1. Valid edit with ID 0
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

        # 2. Boolean True rejected as numeric ID
        with self.assertRaises(TypeError):
            EditItem(
                id=True,  # type: ignore
                title="Bad ID",
                category="Cinematic",
                tags=("tag",),
                description="",
                creator="C",
                poster="/p.svg",
                source="/s.webm",
                duration="0:12",
                duration_ms=12000,
                duration_sec=12.0,
            )

        # 3. String as tags sequence rejected
        with self.assertRaises(TypeError):
            EditItem(
                id=1,
                title="Bad Tags",
                category="Cinematic",
                tags="gaming",  # type: ignore
                description="",
                creator="C",
                poster="/p.svg",
                source="/s.webm",
                duration="0:12",
                duration_ms=12000,
                duration_sec=12.0,
            )

        # 4. Null title rejected
        with self.assertRaises(TypeError):
            EditItem(
                id=1,
                title=None,  # type: ignore
                category="Cinematic",
                tags=("tag",),
                description="",
                creator="C",
                poster="/p.svg",
                source="/s.webm",
                duration="0:12",
                duration_ms=12000,
                duration_sec=12.0,
            )

        # 5. String "false" rejected for trending
        with self.assertRaises(TypeError):
            EditItem(
                id=1,
                title="Bad Trending",
                category="Cinematic",
                tags=("tag",),
                description="",
                creator="C",
                poster="/p.svg",
                source="/s.webm",
                duration="0:12",
                duration_ms=12000,
                duration_sec=12.0,
                trending="false",  # type: ignore
            )

    def test_catalog_from_dict_list_strict_schema(self):
        valid_record = {
            "id": 0,
            "title": "Title",
            "category": "Cinematic",
            "tags": ["cinematic"],
            "description": "Desc",
            "creator": "Creator",
            "poster": "/p.svg",
            "source": "/s.webm",
            "duration": "0:12",
            "trending": False,
        }

        # Valid record loads cleanly
        cat = Catalog.from_dict_list([valid_record])
        self.assertEqual(len(cat), 1)
        self.assertEqual(cat.get(0).title, "Title")

        # Missing duration must raise error (not silently default)
        no_duration = dict(valid_record)
        del no_duration["duration"]
        with self.assertRaises(ValueError):
            Catalog.from_dict_list([no_duration])

        # Boolean True as ID must raise TypeError
        bool_id = dict(valid_record)
        bool_id["id"] = True
        with self.assertRaises(TypeError):
            Catalog.from_dict_list([bool_id])

        # String as tags must raise TypeError
        string_tags = dict(valid_record)
        string_tags["tags"] = "gaming"
        with self.assertRaises(TypeError):
            Catalog.from_dict_list([string_tags])

        # Null title must raise TypeError
        null_title = dict(valid_record)
        null_title["title"] = None
        with self.assertRaises(TypeError):
            Catalog.from_dict_list([null_title])

        # String "false" for trending must raise TypeError
        str_trending = dict(valid_record)
        str_trending["trending"] = "false"
        with self.assertRaises(TypeError):
            Catalog.from_dict_list([str_trending])

        # Unexpected extra fields must raise ValueError
        extra_fields = dict(valid_record)
        extra_fields["unexpected_hack"] = 123
        with self.assertRaises(ValueError):
            Catalog.from_dict_list([extra_fields])

    def test_request_model_strict_validation(self):
        # Valid requests
        req_home = RecommendationRequest(surface="home", limit=12)
        self.assertEqual(req_home.surface, "home")
        self.assertEqual(req_home.limit, 12)

        req_upnext = RecommendationRequest(surface="up_next", current_edit_id=0, limit=5)
        self.assertEqual(req_upnext.surface, "up_next")
        self.assertEqual(req_upnext.current_edit_id, 0)

        # Boolean rejected as current_edit_id
        with self.assertRaises(TypeError):
            RecommendationRequest(surface="up_next", current_edit_id=True)

        # Missing current_edit_id for up_next
        with self.assertRaises(ValueError):
            RecommendationRequest(surface="up_next", current_edit_id=None)

        # Invalid surface
        with self.assertRaises(ValueError):
            RecommendationRequest(surface="explore")

        # Invalid limit
        with self.assertRaises(ValueError):
            RecommendationRequest(surface="home", limit=0)
        with self.assertRaises(ValueError):
            RecommendationRequest(surface="home", limit=100)
        with self.assertRaises(ValueError):
            RecommendationRequest(surface="home", limit=True)  # type: ignore

        # Boolean in exclude_edit_ids
        with self.assertRaises(TypeError):
            RecommendationRequest(surface="home", exclude_edit_ids=(True,))

        # History entry validation
        with self.assertRaises(TypeError):
            WatchHistoryEntry(edit_id=True, unique_watch_ms=5000, occurred_at="2026-10-16T12:00:00Z")
        with self.assertRaises(TypeError):
            WatchHistoryEntry(edit_id=0, unique_watch_ms=True, occurred_at="2026-10-16T12:00:00Z")

        # Category filter validation
        req_valid_cat = RecommendationRequest(surface="home", category_filter="Cinematic")
        self.assertEqual(req_valid_cat.category_filter, "Cinematic")

        with self.assertRaises(ValueError):
            RecommendationRequest(surface="home", category_filter="UnknownCategory")
        with self.assertRaises(TypeError):
            RecommendationRequest(surface="home", category_filter=123)  # type: ignore

    def test_load_catalog_from_json_strict_envelope(self):
        import tempfile
        import json

        valid_payload = {
            "catalog_version": "demo-catalog-v1",
            "total_edits": 1,
            "edits": [
                {
                    "id": 0,
                    "title": "Title",
                    "category": "Cinematic",
                    "tags": ["cinematic"],
                    "description": "Desc",
                    "creator": "Creator",
                    "poster": "/p.svg",
                    "source": "/s.webm",
                    "duration": "0:12",
                    "trending": False,
                }
            ],
        }

        # 1. Valid snapshot loads cleanly
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as f:
            json.dump(valid_payload, f)
            temp_path = f.name

        try:
            cat = load_catalog_from_json(temp_path)
            self.assertEqual(len(cat), 1)
            self.assertEqual(cat.catalog_version, "demo-catalog-v1")
        finally:
            Path(temp_path).unlink()

        # 2. Reject list root (old loose behavior)
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as f:
            json.dump(valid_payload["edits"], f)
            temp_path = f.name
        try:
            with self.assertRaises(TypeError):
                load_catalog_from_json(temp_path)
        finally:
            Path(temp_path).unlink()

        # 3. Reject unexpected envelope keys
        bad_envelope = dict(valid_payload)
        bad_envelope["unexpected_key"] = "malicious"
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as f:
            json.dump(bad_envelope, f)
            temp_path = f.name
        try:
            with self.assertRaises(ValueError):
                load_catalog_from_json(temp_path)
        finally:
            Path(temp_path).unlink()

        # 4. Reject missing required envelope keys
        missing_envelope = dict(valid_payload)
        del missing_envelope["total_edits"]
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as f:
            json.dump(missing_envelope, f)
            temp_path = f.name
        try:
            with self.assertRaises(ValueError):
                load_catalog_from_json(temp_path)
        finally:
            Path(temp_path).unlink()

        # 5. Reject wrong catalog_version
        wrong_ver = dict(valid_payload)
        wrong_ver["catalog_version"] = "wrong-v2"
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as f:
            json.dump(wrong_ver, f)
            temp_path = f.name
        try:
            with self.assertRaises(ValueError):
                load_catalog_from_json(temp_path)
        finally:
            Path(temp_path).unlink()

        # 6. Reject floating-point or non-integer total_edits
        float_count = dict(valid_payload)
        float_count["total_edits"] = 1.0
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as f:
            json.dump(float_count, f)
            temp_path = f.name
        try:
            with self.assertRaises(TypeError):
                load_catalog_from_json(temp_path)
        finally:
            Path(temp_path).unlink()

        # 7. Reject total_edits count mismatch with edits array
        count_mismatch = dict(valid_payload)
        count_mismatch["total_edits"] = 99
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as f:
            json.dump(count_mismatch, f)
            temp_path = f.name
        try:
            with self.assertRaises(ValueError):
                load_catalog_from_json(temp_path)
        finally:
            Path(temp_path).unlink()


if __name__ == "__main__":
    unittest.main()

