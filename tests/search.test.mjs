import test from "node:test";
import assert from "node:assert/strict";
import {
  searchEdits,
  getRankedEdits,
  parseQuery,
  matchQuality,
  scoreTerm,
  HASHTAG_WEIGHTS,
  NON_HASHTAG_WEIGHTS,
} from "../src/data/searchEngine.ts";

const sampleEdits = [
  {
    id: 0,
    title: "Into the Light",
    category: "Cinematic",
    tags: ["cinematic", "original", "demo", "landscape"],
    description: "Original geometric artwork. Silent motion study.",
    creator: "Lolixco demo",
    poster: "/posters/0.webp",
    source: "/videos/sample.mp4",
    duration: "0:12",
    trending: false,
  },
  {
    id: 1,
    title: "Echoes of Tomorrow",
    category: "Gaming",
    tags: ["gaming", "original", "demo", "neon"],
    description: "Cyber city high speed motion study.",
    creator: "Astra visual",
    poster: "/posters/1.webp",
    source: "/videos/sample.mp4",
    duration: "0:14",
    trending: false,
  },
  {
    id: 2,
    title: "Neon Soul",
    category: "Phonk",
    tags: ["phonk", "original", "demo", "neon"],
    description: "Drift rhythms and glowing streets.",
    creator: "Lolixco demo",
    poster: "/posters/2.webp",
    source: "/videos/sample.mp4",
    duration: "0:10",
    trending: true,
  },
  {
    id: 3,
    title: "Red Horizon",
    category: "Movies",
    tags: ["movies", "original", "demo", "landscape"],
    description: "Desert vistas under blazing skies.",
    creator: "Vuld0 studio",
    poster: "/posters/3.webp",
    source: "/videos/sample.mp4",
    duration: "0:15",
    trending: true,
  },
];

test("parseQuery correctly distinguishes hashtags, normal text, and bare hashes", () => {
  const terms = parseQuery("neon #gaming ## # Blazing");
  assert.equal(terms.length, 5);
  assert.deepEqual(terms[0], { raw: "neon", clean: "neon", isHashtag: false });
  assert.deepEqual(terms[1], { raw: "#gaming", clean: "gaming", isHashtag: true });
  assert.deepEqual(terms[2], { raw: "##", clean: "", isHashtag: true });
  assert.deepEqual(terms[3], { raw: "#", clean: "", isHashtag: true });
  assert.deepEqual(terms[4], { raw: "Blazing", clean: "blazing", isHashtag: false });
});

test("Bare and malformed hashtags safely return 0 results", () => {
  assert.equal(searchEdits(sampleEdits, "#").length, 0);
  assert.equal(searchEdits(sampleEdits, "##").length, 0);
  assert.equal(searchEdits(sampleEdits, "   #   ").length, 0);
  assert.equal(searchEdits(sampleEdits, "neon #").length, 0);
});

test("Exact normalized tag matching for hashtag tokens", () => {
  const results = searchEdits(sampleEdits, "#neon");
  assert.equal(results.length, 2);
  const ids = results.map((r) => r.edit.id);
  assert.ok(ids.includes(1));
  assert.ok(ids.includes(2));
  assert.ok(!ids.includes(0)); // 0 does not have neon tag

  // Substring should not match hashtag token
  const noSubstrings = searchEdits(sampleEdits, "#neo");
  assert.equal(noSubstrings.length, 0);
});

test("Normal text queries match video tags even without a #", () => {
  // 'landscape' appears ONLY in tags for edit 0, not in its title
  const results = searchEdits(sampleEdits, "landscape");
  assert.ok(results.length >= 2);
  const ids = results.map((r) => r.edit.id);
  assert.ok(ids.includes(0));
  assert.ok(ids.includes(3));
});

test("Multiple hashtags require all tags (AND conjunction)", () => {
  // Both neon AND gaming
  const results = searchEdits(sampleEdits, "#neon #gaming");
  assert.equal(results.length, 1);
  assert.equal(results[0].edit.id, 1);

  // neon AND movies
  const none = searchEdits(sampleEdits, "#neon #movies");
  assert.equal(none.length, 0);
});

test("Mixed queries require all meaningful terms (AND conjunction)", () => {
  // 'Astra' (creator) + '#gaming' (tag)
  const results = searchEdits(sampleEdits, "Astra #gaming");
  assert.equal(results.length, 1);
  assert.equal(results[0].edit.id, 1);

  // 'Lolixco' + '#gaming' -> Lolixco is not creator of edit 1
  const none = searchEdits(sampleEdits, "Lolixco #gaming");
  assert.equal(none.length, 0);
});

test("Relevance scoring and weight redistribution", () => {
  // Non-hashtag weights sum to 1.0
  const nonHashSum =
    NON_HASHTAG_WEIGHTS.title +
    NON_HASHTAG_WEIGHTS.category +
    NON_HASHTAG_WEIGHTS.description +
    NON_HASHTAG_WEIGHTS.creator;
  assert.ok(Math.abs(nonHashSum - 1.0) < 0.001);

  // Hashtag weights sum to 1.0
  const hashSum =
    HASHTAG_WEIGHTS.hashtag +
    HASHTAG_WEIGHTS.title +
    HASHTAG_WEIGHTS.category +
    HASHTAG_WEIGHTS.description +
    HASHTAG_WEIGHTS.creator;
  assert.ok(Math.abs(hashSum - 1.0) < 0.001);

  // Exact title match gets highest score
  const searchTitle = searchEdits(sampleEdits, "Red Horizon");
  assert.equal(searchTitle[0].edit.id, 3);
  assert.ok(searchTitle[0].score > 0.4);
});

test("Normalized scores are in [0, 1] across variable query lengths", () => {
  const q1 = searchEdits(sampleEdits, "Neon");
  for (const r of q1) {
    assert.ok(r.score >= 0 && r.score <= 1.0);
  }

  const q3 = searchEdits(sampleEdits, "Cyber city #neon");
  for (const r of q3) {
    assert.ok(r.score >= 0 && r.score <= 1.0);
  }
});

test("Deterministic tie-breaking sorts by score DESC, then numeric Edit.id ASC (preserving ID 0)", () => {
  // Query 'original' matches tag 'original' equally for all sampleEdits (IDs 0, 1, 2, 3)
  const results = searchEdits(sampleEdits, "original");
  assert.ok(results.length >= 4);

  // Find edits with identical scores and check that their relative order is ascending by ID
  for (let i = 0; i < results.length - 1; i++) {
    if (results[i].score === results[i + 1].score) {
      assert.ok(
        results[i].edit.id < results[i + 1].edit.id,
        `Expected ID ${results[i].edit.id} < ${results[i + 1].edit.id} on tie`
      );
    }
  }

  // Edit with ID 0 is preserved
  assert.ok(results.some((r) => r.edit.id === 0));
});

test("Category and Trending filters operate correctly with search", () => {
  // Filter by category 'Gaming' with query 'neon'
  const gamingNeon = searchEdits(sampleEdits, "neon", "Gaming");
  assert.equal(gamingNeon.length, 1);
  assert.equal(gamingNeon[0].edit.id, 1);

  // Filter by 'Trending' with query 'neon'
  const trendingNeon = searchEdits(sampleEdits, "neon", "Trending");
  assert.equal(trendingNeon.length, 1);
  assert.equal(trendingNeon[0].edit.id, 2); // Edit 2 is trending, edit 1 is not

  // Empty query with category filter
  const allTrending = searchEdits(sampleEdits, "", "Trending");
  assert.equal(allTrending.length, 2);
  assert.ok(allTrending.every((r) => r.edit.trending));

  // 'New' reverses order when query is empty
  const newEdits = searchEdits(sampleEdits, "", "New");
  assert.equal(newEdits[0].edit.id, 3);
  assert.equal(newEdits[newEdits.length - 1].edit.id, 0);
});

test("Production edits search against real dataset", async () => {
  const { edits } = await import("../src/data/edits.ts");
  assert.equal(edits.length, 17);

  // Exact hashtag #phonk
  const phonkEdits = searchEdits(edits, "#phonk");
  assert.ok(phonkEdits.length > 0);
  assert.ok(phonkEdits.every((r) => r.edit.tags.includes("phonk")));

  // Normal text 'neon' matches title OR tag
  const neonEdits = searchEdits(edits, "neon");
  assert.ok(neonEdits.length > 0);
  assert.ok(
    neonEdits.every(
      (r) =>
        r.edit.title.toLowerCase().includes("neon") ||
        r.edit.tags.includes("neon")
    )
  );

  // Bare hashtag yields 0
  assert.equal(searchEdits(edits, "#").length, 0);

  // Edit 0 (Into the Light) is preserved
  assert.equal(edits[0].id, 0);
  assert.equal(edits[0].title, "Into the Light");
});

