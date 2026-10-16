import copy
import json
from pathlib import Path
import tempfile
import unittest

from server.recsys.export_catalog import (
    check_catalog_drift,
    fetch_edits_from_source,
    get_repo_root,
)


class TestCatalogDrift(unittest.TestCase):
    def setUp(self):
        self.repo_root = get_repo_root()
        self.snapshot_path = self.repo_root / "server" / "recsys" / "catalog_snapshot.json"
        with self.snapshot_path.open("r", encoding="utf-8") as f:
            self.valid_snapshot = json.load(f)

    def test_live_source_matches_snapshot_positive(self):
        """Positive test: Real unchanged snapshot matches live TypeScript source."""
        synced, diffs = check_catalog_drift(self.repo_root, self.snapshot_path)
        self.assertTrue(
            synced,
            f"Catalog snapshot drifted from src/data/edits.ts: {diffs}",
        )
        self.assertEqual(len(diffs), 0)

    def test_fetch_edits_from_source_sanity(self):
        live_edits = fetch_edits_from_source(self.repo_root)
        self.assertEqual(len(live_edits), 17)
        self.assertEqual(live_edits[0]["id"], 0)
        self.assertEqual(live_edits[0]["title"], "Into the Light")
        self.assertEqual(live_edits[16]["id"], 16)
        self.assertEqual(live_edits[16]["title"], "Midnight City")

    def test_drift_fails_on_tampered_total_edits(self):
        """Negative test: Tampered total_edits must fail drift check."""
        tampered = copy.deepcopy(self.valid_snapshot)
        tampered["total_edits"] = 99  # Does not match 17 edits

        with tempfile.NamedTemporaryFile("w", encoding="utf-8", suffix=".json") as tmp:
            json.dump(tampered, tmp)
            tmp.flush()

            synced, diffs = check_catalog_drift(self.repo_root, Path(tmp.name))
            self.assertFalse(synced)
            self.assertTrue(any("internal count mismatch" in d for d in diffs))

    def test_drift_fails_on_tampered_catalog_version(self):
        """Negative test: Tampered catalog_version must fail drift check."""
        tampered = copy.deepcopy(self.valid_snapshot)
        tampered["catalog_version"] = "tampered-v2"

        with tempfile.NamedTemporaryFile("w", encoding="utf-8", suffix=".json") as tmp:
            json.dump(tampered, tmp)
            tmp.flush()

            synced, diffs = check_catalog_drift(self.repo_root, Path(tmp.name))
            self.assertFalse(synced)
            self.assertTrue(any("Catalog version mismatch" in d for d in diffs))

    def test_drift_fails_on_unexpected_record_field(self):
        """Negative test: Edit with unexpected extra fields must fail drift check."""
        tampered = copy.deepcopy(self.valid_snapshot)
        tampered["edits"][0]["unexpected_hacked_field"] = "malicious"

        with tempfile.NamedTemporaryFile("w", encoding="utf-8", suffix=".json") as tmp:
            json.dump(tampered, tmp)
            tmp.flush()

            synced, diffs = check_catalog_drift(self.repo_root, Path(tmp.name))
            self.assertFalse(synced)
            self.assertTrue(any("unexpected extra fields" in d for d in diffs))

    def test_drift_fails_on_missing_required_field(self):
        """Negative test: Edit missing a required field (e.g. poster) must fail drift check."""
        tampered = copy.deepcopy(self.valid_snapshot)
        del tampered["edits"][0]["poster"]

        with tempfile.NamedTemporaryFile("w", encoding="utf-8", suffix=".json") as tmp:
            json.dump(tampered, tmp)
            tmp.flush()

            synced, diffs = check_catalog_drift(self.repo_root, Path(tmp.name))
            self.assertFalse(synced)
            self.assertTrue(any("missing required fields" in d for d in diffs))

    def test_drift_fails_on_mutated_field_value(self):
        """Negative test: Mutated title or duration must fail drift check."""
        tampered = copy.deepcopy(self.valid_snapshot)
        tampered["edits"][0]["title"] = "Mutated Title"

        with tempfile.NamedTemporaryFile("w", encoding="utf-8", suffix=".json") as tmp:
            json.dump(tampered, tmp)
            tmp.flush()

            synced, diffs = check_catalog_drift(self.repo_root, Path(tmp.name))
            self.assertFalse(synced)
            self.assertTrue(any("title" in d and "drifted" in d for d in diffs))


if __name__ == "__main__":
    unittest.main()
