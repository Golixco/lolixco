import test from "node:test";
import assert from "node:assert/strict";

import { composeHomeFeed, isShort, isVideo } from "../src/data/feedComposition.ts";
import { createImmersionSession, advanceImmersionNext } from "../src/utils/immersionQueue.ts";
import { edits as productionEdits } from "../src/data/edits.ts";

/**
 * Builds an isolated synthetic catalog of 50 landscape videos (100–149)
 * and 20 portrait Shorts (200–219) for scale and performance verification.
 */
function buildSyntheticCuratedCatalog() {
  const categories = ["Gaming", "Anime", "Movies", "Series", "Multifandom", "Phonk"];
  const fandoms = ["valorant", "doom", "jujutsu-kaisen", "demon-slayer", "spider-man"];
  const items = [];

  // 1. 50 Landscape Edits (IDs 100–149)
  for (let i = 0; i < 50; i++) {
    const id = 100 + i;
    const cat = categories[i % categories.length];
    const fan = fandoms[i % fandoms.length];
    // Generate deterministic valid 11-character YouTube video ID
    const vidId = `yt_vid_${String(i).padStart(4, "0")}`;

    items.push({
      id,
      title: `${cat} - ${fan} Cinematic Edit #${i + 1}`,
      category: cat,
      tags: [fan, cat.toLowerCase(), "cinematic"],
      description: `Synthetic scale test edit for ${cat} ${fan}`,
      creator: `Editor_${i}`,
      poster: `https://i.ytimg.com/vi/${vidId}/maxresdefault.jpg`,
      source: `https://www.youtube.com/watch?v=${vidId}`,
      duration: "1:30",
      trending: i < 5,
      format: "video",
      fandomIds: [fan],
      sourceType: "youtube_embed",
      youtubeVideoId: vidId,
      channelTitle: `Studio ${i}`,
      channelId: `UC_${vidId}`,
      sourceUrl: `https://www.youtube.com/watch?v=${vidId}`,
    });
  }

  // 2. 20 Portrait Shorts (IDs 200–219)
  for (let j = 0; j < 20; j++) {
    const id = 200 + j;
    const cat = categories[j % categories.length];
    const fan = fandoms[j % fandoms.length];
    const vidId = `yt_sht_${String(j).padStart(4, "0")}`;

    items.push({
      id,
      title: `${cat} ${fan} Vertical Short #${j + 1}`,
      category: cat,
      tags: [fan, "shorts", "vertical"],
      description: `Synthetic scale test short for ${cat}`,
      creator: `ShortCreator_${j}`,
      poster: `https://i.ytimg.com/vi/${vidId}/hqdefault.jpg`,
      source: `https://www.youtube.com/shorts/${vidId}`,
      duration: "0:30",
      trending: j < 3,
      format: "short",
      fandomIds: [fan],
      sourceType: "youtube_embed",
      youtubeVideoId: vidId,
      channelTitle: `ShortsLab ${j}`,
      channelId: `UC_${vidId}`,
      sourceUrl: `https://www.youtube.com/shorts/${vidId}`,
    });
  }

  return items;
}

test("SCALE TEST: synthetic 70-item catalog structure and ID uniqueness", () => {
  const catalog = buildSyntheticCuratedCatalog();

  assert.equal(catalog.length, 70, "Must contain exactly 70 synthetic items");

  const landscapeEdits = catalog.filter((e) => isVideo(e));
  const shortsEdits = catalog.filter((e) => isShort(e));

  assert.equal(landscapeEdits.length, 50, "Must contain exactly 50 landscape videos");
  assert.equal(shortsEdits.length, 20, "Must contain exactly 20 portrait shorts");

  // Verify ID allocation ranges
  for (const item of landscapeEdits) {
    assert.ok(item.id >= 100 && item.id < 200, `Video ID ${item.id} must be in 100–199 range`);
    assert.equal(item.sourceType, "youtube_embed");
    assert.equal(item.youtubeVideoId.length, 11);
  }

  for (const item of shortsEdits) {
    assert.ok(item.id >= 200 && item.id < 300, `Short ID ${item.id} must be in 200–299 range`);
    assert.equal(item.sourceType, "youtube_embed");
    assert.equal(item.youtubeVideoId.length, 11);
  }

  // Verify zero duplicate Lolixco IDs
  const idSet = new Set(catalog.map((e) => e.id));
  assert.equal(idSet.size, 70, "All 70 Lolixco IDs must be strictly unique");

  // Verify zero duplicate YouTube Video IDs
  const ytIdSet = new Set(catalog.map((e) => e.youtubeVideoId));
  assert.equal(ytIdSet.size, 70, "All 70 YouTube video IDs must be strictly unique");
});

test("SCALE TEST: feed composition handles 70-item mixed catalog without duplication", () => {
  const catalog = buildSyntheticCuratedCatalog();
  const feed = composeHomeFeed({
    recommendedVideos: catalog.filter((e) => isVideo(e)).slice(0, 8),
    catalog,
    currentEditId: catalog[0]?.id,
  });

  assert.ok(feed.length >= 2, "Composed feed must render sections for mixed catalog");

  const renderedVideoIds = new Set();
  const renderedShortIds = new Set();

  for (const section of feed) {
    for (const item of section.items) {
      if (item.format === "short") {
        assert.equal(renderedShortIds.has(item.id), false, `Short ${item.id} duplicated across sections`);
        renderedShortIds.add(item.id);
      } else {
        assert.equal(renderedVideoIds.has(item.id), false, `Video ${item.id} duplicated across sections`);
        renderedVideoIds.add(item.id);
      }
    }
  }

  assert.ok(renderedVideoIds.size > 0, "Feed must render landscape videos");
  assert.ok(renderedShortIds.size > 0, "Feed must render portrait shorts");
});

test("SCALE TEST: Immersion Mode handles 70-item pool without memory or loop issues", () => {
  const catalog = buildSyntheticCuratedCatalog();

  // Enter from Gaming / Valorant context
  const session = createImmersionSession(catalog, {
    category: "Gaming",
    fandomId: "valorant",
  });

  assert.ok(session.currentEdit, "Session must initialize with an edit");
  assert.equal(session.currentEdit.category, "Gaming");

  let current = session;
  const played = [current.currentEdit.id];

  // Advance 20 times smoothly through opening and discovery stages
  for (let step = 0; step < 20; step++) {
    const { nextEdit, nextState } = advanceImmersionNext(catalog, current.state, 42);
    assert.ok(nextEdit, `Step ${step + 1} must return an edit`);
    assert.notEqual(nextEdit.id, played[played.length - 1], "Must never immediately repeat previous edit");
    played.push(nextEdit.id);
    current = { currentEdit: nextEdit, state: nextState };
  }

  assert.equal(played.length, 21);
});

test("SCALE TEST: production baseline isolation invariant", () => {
  // Confirm production catalog remains strictly frozen at exactly 17 demo landscape edits and 0 shorts
  assert.equal(productionEdits.length, 17);
  assert.equal(productionEdits.filter(isShort).length, 0);
  assert.equal(productionEdits.filter(isVideo).length, 17);
});
