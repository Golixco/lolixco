from pathlib import Path
import unittest

from server.recsys.export_catalog import (
    check_catalog_drift,
    fetch_edits_from_source,
    get_repo_root,
)


class TestCatalogDrift(unittest.TestCase):
    def test_live_source_matches_snapshot(self):
        repo_root = get_repo_root()
        snapshot_path = repo_root / "server" / "recsys" / "catalog_snapshot.json"

        synced, diffs = check_catalog_drift(repo_root, snapshot_path)
        self.assertTrue(
            synced,
            f"Catalog snapshot has drifted from src/data/edits.ts: {diffs}",
        )
        self.assertEqual(len(diffs), 0)

    def test_fetch_edits_from_source_sanity(self):
        repo_root = get_repo_root()
        live_edits = fetch_edits_from_source(repo_root)

        self.assertEqual(len(live_edits), 17)
        self.assertEqual(live_edits[0]["id"], 0)
        self.assertEqual(live_edits[0]["title"], "Into the Light")
        self.assertEqual(live_edits[16]["id"], 16)
        self.assertEqual(live_edits[16]["title"], "Midnight City")


if __name__ == "__main__":
    unittest.main()
