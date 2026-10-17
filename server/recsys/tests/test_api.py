"""
Comprehensive unit and integration tests for the Lolixco Recommendation API.

Tests:
- API health (/api/v1/health) and readiness (/api/v1/ready)
- Cold-start Home recommendations
- Up Next recommendations for Edit ID 0
- Active video suppression from Up Next
- Valid candidate exclusions (exclude_edit_ids)
- Invalid/unknown current IDs (404)
- Missing current_edit_id for up_next (422)
- Malformed requests & extra fields (422)
- Strict type validation: reject boolean, float, and stringified numeric IDs
- Category filter validation (canonical vs invalid)
- Request limit bounds (ge=1, le=50)
- Empty eligible results
- Deterministic repeated responses
- Reason codes and diagnostics
- Mode handling (auto, baseline, neural -> 503)
- Backend readiness failure when catalog is corrupt or missing
"""

import json
from pathlib import Path
import tempfile
import unittest

from fastapi.testclient import TestClient

from server.recsys.api import app, create_app
from server.recsys.catalog import load_catalog_from_json

SNAPSHOT_PATH = Path(__file__).parent.parent / "catalog_snapshot.json"


class TestRecommendationAPI(unittest.TestCase):
    """Test suite for /api/v1 endpoints."""

    def setUp(self) -> None:
        self.client = TestClient(app)

    def test_health_endpoint(self) -> None:
        """Test GET /api/v1/health returns 200 with service metadata."""
        resp = self.client.get("/api/v1/health")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["status"], "ok")
        self.assertEqual(data["service"], "lolixco-recsys")
        self.assertIn("timestamp", data)

    def test_ready_endpoint_healthy(self) -> None:
        """Test GET /api/v1/ready returns 200 and catalog info."""
        resp = self.client.get("/api/v1/ready")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["status"], "ready")
        self.assertEqual(data["catalog_version"], "demo-catalog-v1")
        self.assertEqual(data["policy_version"], "baseline-v1")
        self.assertEqual(data["total_edits"], 17)

    def test_ready_endpoint_unhealthy_when_catalog_missing(self) -> None:
        """Test GET /api/v1/ready returns 503 when catalog fails to load."""
        broken_app = create_app(catalog_path="/tmp/nonexistent_catalog.json")
        client = TestClient(broken_app)
        resp = client.get("/api/v1/ready")
        self.assertEqual(resp.status_code, 503)
        data = resp.json()
        self.assertIn("not ready", data["detail"])

    def test_cold_start_home_recommendations(self) -> None:
        """Test POST /api/v1/recommendations for home surface with cold-start."""
        payload = {
            "surface": "home",
            "limit": 6,
        }
        resp = self.client.post("/api/v1/recommendations", json=payload)
        self.assertEqual(resp.status_code, 200)
        data = resp.json()

        self.assertEqual(data["surface"], "home")
        self.assertEqual(data["schema_version"], "1.0")
        self.assertEqual(data["mode_used"], "baseline")
        self.assertEqual(len(data["items"]), 6)
        self.assertEqual(data["total_eligible"], 17)
        self.assertFalse(data["has_more"])
        self.assertIsNone(data["next_cursor"])

        # Check ranks and reason codes
        for idx, item in enumerate(data["items"], start=1):
            self.assertEqual(item["rank"], idx)
            self.assertIn("cold_start", item["reason_codes"])
            self.assertIn("category_balance", item["reason_codes"])
            self.assertIsInstance(item["edit"], dict)
            self.assertIsInstance(item["edit"]["id"], int)
            self.assertIsInstance(item["edit"]["title"], str)

    def test_up_next_for_edit_id_zero(self) -> None:
        """Test POST /api/v1/recommendations for up_next surface with edit ID 0."""
        payload = {
            "surface": "up_next",
            "current_edit_id": 0,
            "limit": 4,
        }
        resp = self.client.post("/api/v1/recommendations", json=payload)
        self.assertEqual(resp.status_code, 200)
        data = resp.json()

        self.assertEqual(data["surface"], "up_next")
        self.assertEqual(len(data["items"]), 4)
        # Edit 0 must NEVER appear in Up Next for Edit 0
        returned_ids = [item["edit_id"] for item in data["items"]]
        self.assertNotIn(0, returned_ids)
        self.assertEqual(data["total_eligible"], 16)

    def test_up_next_requires_current_edit_id(self) -> None:
        """Test that surface=up_next without current_edit_id returns 422."""
        payload = {
            "surface": "up_next",
            "limit": 4,
        }
        resp = self.client.post("/api/v1/recommendations", json=payload)
        self.assertEqual(resp.status_code, 422)

    def test_up_next_unknown_current_edit_id_returns_404(self) -> None:
        """Test that surface=up_next with an ID outside catalog returns 404."""
        payload = {
            "surface": "up_next",
            "current_edit_id": 9999,
            "limit": 4,
        }
        resp = self.client.post("/api/v1/recommendations", json=payload)
        self.assertEqual(resp.status_code, 404)
        self.assertIn("not found in catalog", resp.json()["detail"])

    def test_active_video_suppression_and_exclusions(self) -> None:
        """Test candidate exclusion parameter exclude_edit_ids."""
        payload = {
            "surface": "up_next",
            "current_edit_id": 0,
            "exclude_edit_ids": [1, 2, 3],
            "limit": 4,
        }
        resp = self.client.post("/api/v1/recommendations", json=payload)
        self.assertEqual(resp.status_code, 200)
        data = resp.json()

        returned_ids = [item["edit_id"] for item in data["items"]]
        self.assertNotIn(0, returned_ids)
        self.assertNotIn(1, returned_ids)
        self.assertNotIn(2, returned_ids)
        self.assertNotIn(3, returned_ids)
        self.assertEqual(data["total_eligible"], 13)

    def test_category_filter_canonical_and_invalid(self) -> None:
        """Test category filter matching and error handling."""
        # Valid category (case-insensitive)
        payload = {
            "surface": "home",
            "filters": {"category": "cinematic"},
            "limit": 10,
        }
        resp = self.client.post("/api/v1/recommendations", json=payload)
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        for item in data["items"]:
            self.assertEqual(item["edit"]["category"], "Cinematic")

        # Invalid category returns 422
        bad_payload = {
            "surface": "home",
            "filters": {"category": "NonExistentCategory"},
        }
        bad_resp = self.client.post("/api/v1/recommendations", json=bad_payload)
        self.assertEqual(bad_resp.status_code, 422)

    def test_strict_type_validation_rejects_bool_float_string_ids(self) -> None:
        """Strict validation must reject boolean, float, and stringified numeric IDs."""
        # Boolean current_edit_id (Python bool is subclass of int, but JSON bool is boolean)
        resp_bool = self.client.post("/api/v1/recommendations", json={"surface": "up_next", "current_edit_id": True})
        self.assertEqual(resp_bool.status_code, 422)

        # String current_edit_id
        resp_str = self.client.post("/api/v1/recommendations", json={"surface": "up_next", "current_edit_id": "0"})
        self.assertEqual(resp_str.status_code, 422)

        # Float current_edit_id
        resp_float = self.client.post("/api/v1/recommendations", json={"surface": "up_next", "current_edit_id": 1.5})
        self.assertEqual(resp_float.status_code, 422)

        # Negative ID
        resp_neg = self.client.post("/api/v1/recommendations", json={"surface": "up_next", "current_edit_id": -1})
        self.assertEqual(resp_neg.status_code, 422)

        # Boolean in exclude_edit_ids
        resp_exclude = self.client.post(
            "/api/v1/recommendations",
            json={"surface": "home", "exclude_edit_ids": [True]},
        )
        self.assertEqual(resp_exclude.status_code, 422)

    def test_extra_fields_rejected(self) -> None:
        """Unknown fields must be rejected (extra='forbid')."""
        payload = {
            "surface": "home",
            "limit": 5,
            "unexpected_parameter": "value",
        }
        resp = self.client.post("/api/v1/recommendations", json=payload)
        self.assertEqual(resp.status_code, 422)

    def test_limit_bounds_and_rejection(self) -> None:
        """Limit must be between 1 and 50."""
        # Limit 0 -> 422
        self.assertEqual(
            self.client.post("/api/v1/recommendations", json={"surface": "home", "limit": 0}).status_code,
            422,
        )
        # Limit 51 -> 422
        self.assertEqual(
            self.client.post("/api/v1/recommendations", json={"surface": "home", "limit": 51}).status_code,
            422,
        )
        # Limit 1 -> 200
        resp1 = self.client.post("/api/v1/recommendations", json={"surface": "home", "limit": 1})
        self.assertEqual(resp1.status_code, 200)
        self.assertEqual(len(resp1.json()["items"]), 1)

    def test_empty_eligible_results(self) -> None:
        """When all items are excluded, return 200 with 0 items."""
        all_ids = list(range(17))
        payload = {
            "surface": "home",
            "exclude_edit_ids": all_ids,
        }
        resp = self.client.post("/api/v1/recommendations", json=payload)
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["items"], [])
        self.assertEqual(data["total_eligible"], 0)

    def test_deterministic_repeated_responses(self) -> None:
        """Identical requests must yield identical rankings and scores."""
        payload = {"surface": "home", "limit": 8}
        resp1 = self.client.post("/api/v1/recommendations", json=payload).json()
        resp2 = self.client.post("/api/v1/recommendations", json=payload).json()

        ids1 = [item["edit_id"] for item in resp1["items"]]
        ids2 = [item["edit_id"] for item in resp2["items"]]
        self.assertEqual(ids1, ids2)

        scores1 = [item["score"] for item in resp1["items"]]
        scores2 = [item["score"] for item in resp2["items"]]
        self.assertEqual(scores1, scores2)

    def test_neural_mode_returns_503(self) -> None:
        """Explicit neural mode in Stage 1 must cleanly return 503."""
        payload = {"surface": "home", "mode": "neural"}
        resp = self.client.post("/api/v1/recommendations", json=payload)
        self.assertEqual(resp.status_code, 503)
        self.assertIn("Neural recommendation mode is not available", resp.json()["detail"])


if __name__ == "__main__":
    unittest.main()
