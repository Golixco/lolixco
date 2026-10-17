import test from "node:test";
import assert from "node:assert/strict";
import { edits } from "../src/data/edits.ts";
import {
  computeLocalFallback,
  fetchRecommendations,
  isRecsysApiEnabled,
} from "../src/api/recommendations.ts";
import { validLoop, loopSeek } from "../src/data/logic.js";

test("API response mapping maps server IDs to validated local Edit objects", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({
        schema_version: "1.0",
        request_id: "test_req",
        surface: "home",
        mode_used: "baseline",
        catalog_version: "demo-catalog-v1",
        policy_version: "baseline-v1",
        as_of: "2026-10-17T12:00:00Z",
        items: [
          {
            rank: 1,
            edit_id: 0,
            score: 0.95,
            reason_codes: ["cold_start", "category_balance"],
          },
          {
            rank: 2,
            edit_id: 2,
            score: 0.88,
            reason_codes: ["cold_start", "category_balance"],
          },
        ],
        total_eligible: 17,
        diagnostics: { warnings: [] },
      }),
    });

    const result = await fetchRecommendations({ surface: "home", limit: 2 });
    assert.equal(result.source, "api");
    assert.equal(result.items.length, 2);
    assert.equal(result.edits.length, 2);
    assert.equal(result.items[0].editId, 0);
    assert.equal(result.items[0].edit.title, "Into the Light");
    assert.equal(result.items[1].editId, 2);
    assert.equal(result.items[1].edit.title, edits[2].title);
    // Verify local assets are preserved
    assert.equal(result.items[0].edit.poster, edits[0].poster);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Duplicate or unknown server IDs are safely filtered without crashing", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({
        items: [
          { rank: 1, edit_id: 1, score: 0.9, reason_codes: [] },
          { rank: 2, edit_id: 1, score: 0.8, reason_codes: [] }, // duplicate
          { rank: 3, edit_id: 9999, score: 0.7, reason_codes: [] }, // unknown ID
          { rank: 4, edit_id: 3, score: 0.6, reason_codes: [] },
        ],
        total_eligible: 17,
      }),
    });

    const result = await fetchRecommendations({ surface: "home", limit: 4 });
    assert.equal(result.items.length, 2);
    assert.deepEqual(
      result.items.map((i) => i.editId),
      [1, 3]
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Current video is strictly excluded from Up Next recommendations", async () => {
  // Test with edit ID 0
  const fallbackUpNext0 = computeLocalFallback({
    surface: "up_next",
    currentEditId: 0,
    limit: 4,
  });
  assert.equal(fallbackUpNext0.items.length, 4);
  assert.ok(fallbackUpNext0.items.every((item) => item.editId !== 0));

  // Test with server response attempting to include active video
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({
        items: [
          { rank: 1, edit_id: 0, score: 1.0, reason_codes: [] }, // rogue active ID
          { rank: 2, edit_id: 4, score: 0.9, reason_codes: [] },
        ],
      }),
    });

    const result = await fetchRecommendations({
      surface: "up_next",
      currentEditId: 0,
      limit: 2,
    });
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].editId, 4);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Deterministic fallback occurs when API returns HTTP error or network failure", async () => {
  const originalFetch = globalThis.fetch;
  try {
    // 500 error
    globalThis.fetch = async () => ({
      ok: false,
      status: 500,
    });
    const errResult = await fetchRecommendations({ surface: "home", limit: 5 });
    assert.equal(errResult.source, "fallback");
    assert.equal(errResult.items.length, 5);
    assert.equal(errResult.items[0].reasonCodes[0], "local_fallback");

    // Network throws
    globalThis.fetch = async () => {
      throw new Error("Connection refused");
    };
    const networkResult = await fetchRecommendations({ surface: "home", limit: 3 });
    assert.equal(networkResult.source, "fallback");
    assert.equal(networkResult.items.length, 3);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("AbortSignal cancellation is respected and does not trigger fallback", async () => {
  const originalFetch = globalThis.fetch;
  try {
    const controller = new AbortController();
    globalThis.fetch = async (_url, options) => {
      if (options?.signal?.aborted) {
        throw new DOMException("The operation was aborted", "AbortError");
      }
      return new Promise((_, reject) => {
        options?.signal?.addEventListener("abort", () => {
          reject(new DOMException("The operation was aborted", "AbortError"));
        });
      });
    };

    const promise = fetchRecommendations(
      { surface: "home", limit: 4 },
      controller.signal
    );
    controller.abort();

    await assert.rejects(promise, { name: "AbortError" });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Category filter and search logic remain independent", () => {
  // Recommendations with category filter
  const gamingRecs = computeLocalFallback({
    surface: "home",
    categoryFilter: "Gaming",
    limit: 10,
  });
  assert.ok(gamingRecs.items.length > 0);
  assert.ok(gamingRecs.items.every((i) => i.edit.category === "Gaming"));

  // Featured does not restrict category
  const allRecs = computeLocalFallback({
    surface: "home",
    categoryFilter: "Featured",
    limit: 10,
  });
  const cats = new Set(allRecs.items.map((i) => i.edit.category));
  assert.ok(cats.size > 1);
});

test("Player A-B loop and seeking logic remain intact with recommendation integration", () => {
  // Validate loop boundaries
  assert.equal(validLoop(0, 5, 12), true);
  assert.equal(validLoop(5, 5, 12), false); // 0 length rejected
  assert.equal(validLoop(10, 15, 12), false); // out of bounds rejected

  // Active loop resets to start upon reaching end
  assert.equal(loopSeek(5, 1, 5, true), 1);
  assert.equal(loopSeek(3, 1, 5, true), 3);
});
