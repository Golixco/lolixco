import test from "node:test";
import assert from "node:assert/strict";
import { matches, validLoop, loopSeek } from "../src/data/logic.js";
const edit = {
  title: "Red Horizon",
  creator: "Lolixco demo",
  category: "Movies",
  description: "Original motion study",
  tags: ["neon", "landscape"],
  trending: true,
};
test("Search covers metadata and requires all search words", () => {
  assert.ok(matches(edit, "NEON movies", "Featured"));
  assert.ok(matches(edit, "motion", "Movies"));
  assert.ok(!matches(edit, "unknown", "Featured"));
  assert.ok(!matches(edit, "neon", "Anime"));
});
test("Trending excludes non-trending items", () => {
  assert.ok(matches(edit, "", "Trending"));
  assert.ok(!matches({ ...edit, trending: false }, "", "Trending"));
});
test("Loops reject invalid, zero-length and out-of-bounds segments", () => {
  for (const args of [
    [0, 0, 12],
    [5, 4, 12],
    [-1, 2, 12],
    [0, 13, 12],
    [0, 0.4, 12],
    [NaN, 2, 12],
  ])
    assert.equal(validLoop(...args), false);
  assert.ok(validLoop(1, 1.5, 12));
});
test("Active loop resets at end and clamps seeks outside segment", () => {
  assert.equal(loopSeek(4, 1, 4, true), 1);
  assert.equal(loopSeek(0.5, 1, 4, true), 1);
  assert.equal(loopSeek(3, 1, 4, true), 3);
  assert.equal(loopSeek(6, 1, 4, false), 6);
});
