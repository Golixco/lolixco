import test from "node:test";
import assert from "node:assert/strict";

import {
  isShort,
  isVideo,
  composeHomeFeed,
  filterShorts,
  splitMixedResults,
} from "../src/data/feedComposition.ts";
import { edits as productionEdits } from "../src/data/edits.ts";

function createMockEdit(id, options = {}) {
  return {
    id,
    title: `Edit ${id}`,
    category: options.category || "Gaming",
    tags: options.tags || ["gaming", "clip"],
    description: `Description ${id}`,
    creator: "Test creator",
    poster: `/posters/poster-${id}.jpg`,
    source: `/videos/video-${id}.mp4`,
    duration: options.duration || "0:15",
    trending: !!options.trending,
    format: options.format,
    fandomIds: options.fandomIds,
  };
}

// ---------------------------------------------------------------------------
// 1. Format Classification Invariants
// ---------------------------------------------------------------------------

test("Format Classification: only explicit format='short' is classified as Short", () => {
  const shortItem = createMockEdit(100, { format: "short" });
  const videoItem = createMockEdit(101, { format: "video" });
  const legacyItem = createMockEdit(102); // format undefined
  const briefLegacyItem = createMockEdit(103, { duration: "0:08" }); // short duration but no short format

  assert.equal(isShort(shortItem), true, "Explicit format='short' must be Short");
  assert.equal(isVideo(shortItem), false);

  assert.equal(isShort(videoItem), false, "Explicit format='video' must NOT be Short");
  assert.equal(isVideo(videoItem), true);

  assert.equal(isShort(legacyItem), false, "Undefined format must default to video");
  assert.equal(isVideo(legacyItem), true);

  assert.equal(
    isShort(briefLegacyItem),
    false,
    "Short duration alone must NEVER classify an item as Short"
  );
  assert.equal(isVideo(briefLegacyItem), true);

  assert.equal(isShort(null), false);
  assert.equal(isVideo(null), false);
});

// ---------------------------------------------------------------------------
// 2. Production Catalog: Zero Shorts omits the Shorts Shelf completely
// ---------------------------------------------------------------------------

test("Feed Composition: Zero Shorts in catalog completely omits Shorts shelf", () => {
  // Production edits has 17 video edits and 0 shorts
  assert.equal(productionEdits.length, 17);
  assert.ok(productionEdits.every((e) => isVideo(e)));

  const recommendedFromEngine = productionEdits.slice(1, 7);
  const currentVideoId = 0;

  const sections = composeHomeFeed({
    recommendedVideos: recommendedFromEngine,
    catalog: productionEdits,
    currentEditId: currentVideoId,
  });

  // Verify no shorts shelf is created
  const shortsShelves = sections.filter((s) => s.type === "shorts_shelf");
  assert.equal(
    shortsShelves.length,
    0,
    "When Shorts catalog is empty, Shorts shelf must be COMPLETELY OMITTED"
  );

  // Verify video sections are created
  const videoRows = sections.filter((s) => s.type === "video_row");
  assert.ok(videoRows.length >= 2, "Expected at least recommended and more rows");

  assert.equal(sections[0].id, "recommended-edits");
  assert.equal(sections[0].title, "Recommended Edits");
  assert.equal(sections[0].items.length, 6);

  assert.equal(sections[1].id, "more-to-discover");
  assert.equal(sections[1].title, "More to Discover");
  assert.ok(sections[1].items.length > 0);

  // Verify Zero Duplicate IDs across all sections and current video
  const seenIds = new Set([currentVideoId]);
  for (const section of sections) {
    for (const item of section.items) {
      assert.ok(
        !seenIds.has(item.id),
        `Duplicate video ID ${item.id} found in section ${section.id}`
      );
      seenIds.add(item.id);
    }
  }
});

// ---------------------------------------------------------------------------
// 3. Mixed Catalog (e.g. 50 Videos + 20 Shorts) Composition
// ---------------------------------------------------------------------------

test("Feed Composition: Mixed catalog composes recommended row, shorts shelf, and more row", () => {
  // Generate 50 videos and 20 shorts
  const fixtureCatalog = [];
  for (let i = 0; i < 50; i++) {
    fixtureCatalog.push(createMockEdit(i, { format: "video", category: "Anime" }));
  }
  for (let i = 50; i < 70; i++) {
    fixtureCatalog.push(createMockEdit(i, { format: "short", category: "Anime" }));
  }

  const currentEditId = 0;
  const mockRecommendations = [
    fixtureCatalog[1],
    fixtureCatalog[2],
    fixtureCatalog[3],
    fixtureCatalog[4],
    fixtureCatalog[5],
    fixtureCatalog[6],
  ];

  const sections = composeHomeFeed({
    recommendedVideos: mockRecommendations,
    catalog: fixtureCatalog,
    currentEditId,
  });

  assert.equal(sections.length, 3);

  // Section 1: Recommended Edits (16:9)
  assert.equal(sections[0].type, "video_row");
  assert.equal(sections[0].id, "recommended-edits");
  assert.equal(sections[0].items.length, 6);
  assert.ok(sections[0].items.every((e) => isVideo(e)));

  // Section 2: Curated Shorts (9:16)
  assert.equal(sections[1].type, "shorts_shelf");
  assert.equal(sections[1].id, "curated-shorts");
  assert.equal(sections[1].title, "Curated Shorts");
  assert.ok(sections[1].items.length > 0);
  assert.ok(
    sections[1].items.every((e) => isShort(e)),
    "Every item in shorts_shelf must have format === 'short'"
  );

  // Section 3: More to Discover (16:9)
  assert.equal(sections[2].type, "video_row");
  assert.equal(sections[2].id, "more-to-discover");
  assert.ok(sections[2].items.length > 0);
  assert.ok(sections[2].items.every((e) => isVideo(e)));

  // Verify Zero Duplicate video IDs across all sections
  const videoIds = new Set([currentEditId]);
  for (const item of sections[0].items) {
    assert.ok(!videoIds.has(item.id));
    videoIds.add(item.id);
  }
  for (const item of sections[2].items) {
    assert.ok(
      !videoIds.has(item.id),
      `More to Discover must not duplicate Recommended video ${item.id}`
    );
    videoIds.add(item.id);
  }
});

// ---------------------------------------------------------------------------
// 4. Edge Cases: Empty, Single, Short-only catalogs
// ---------------------------------------------------------------------------

test("Feed Composition: Edge cases (empty, single, short-only)", () => {
  // Empty catalog
  const emptySections = composeHomeFeed({
    recommendedVideos: [],
    catalog: [],
  });
  assert.deepEqual(emptySections, [], "Empty catalog must return empty sections");

  // Single video
  const singleVideo = [createMockEdit(1)];
  const singleSections = composeHomeFeed({
    recommendedVideos: [],
    catalog: singleVideo,
  });
  assert.equal(singleSections.length, 1);
  assert.equal(singleSections[0].type, "video_row");
  assert.equal(singleSections[0].items.length, 1);

  // Short-only catalog
  const shortsOnly = [
    createMockEdit(50, { format: "short" }),
    createMockEdit(51, { format: "short" }),
  ];
  const shortOnlySections = composeHomeFeed({
    recommendedVideos: [],
    catalog: shortsOnly,
  });
  assert.equal(shortOnlySections.length, 1);
  assert.equal(shortOnlySections[0].type, "shorts_shelf");
  assert.equal(shortOnlySections[0].items.length, 2);
});

// ---------------------------------------------------------------------------
// 5. filterShorts and splitMixedResults
// ---------------------------------------------------------------------------

test("Feed Composition: filterShorts respects categories, fandoms, and query", () => {
  const mixed = [
    createMockEdit(1, { format: "video", category: "Gaming" }),
    createMockEdit(2, { format: "short", category: "Gaming", fandomIds: ["valorant"], tags: ["ace"] }),
    createMockEdit(3, { format: "short", category: "Anime", fandomIds: ["jujutsu-kaisen"] }),
    createMockEdit(4, { format: "short", category: "Gaming", fandomIds: ["doom"] }),
  ];

  // All shorts
  const allShorts = filterShorts(mixed);
  assert.equal(allShorts.length, 3);
  assert.deepEqual(allShorts.map((s) => s.id), [2, 3, 4]);

  // Category filter
  const gamingShorts = filterShorts(mixed, { category: "Gaming" });
  assert.deepEqual(gamingShorts.map((s) => s.id), [2, 4]);

  // Fandom filter
  const valoShorts = filterShorts(mixed, { fandomId: "valorant" });
  assert.deepEqual(valoShorts.map((s) => s.id), [2]);

  // Query filter
  const aceShorts = filterShorts(mixed, { query: "ace" });
  assert.deepEqual(aceShorts.map((s) => s.id), [2]);
});

test("Feed Composition: splitMixedResults partitions without altering relative rank", () => {
  const mixed = [
    createMockEdit(1, { format: "video" }),
    createMockEdit(2, { format: "short" }),
    createMockEdit(3, { format: "video" }),
    createMockEdit(4, { format: "short" }),
  ];

  const { videos, shorts } = splitMixedResults(mixed);
  assert.deepEqual(videos.map((v) => v.id), [1, 3]);
  assert.deepEqual(shorts.map((s) => s.id), [2, 4]);
});
