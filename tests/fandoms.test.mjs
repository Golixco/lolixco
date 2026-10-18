import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  FANDOM_REGISTRY,
  PRIMARY_CATEGORIES,
  LEGACY_CATEGORIES,
  NAVIGATION_CATEGORIES,
  getFandomsForCategory,
  getFandomById,
  isFandomCompatibleWithCategory,
  isValidBrowsingCategory,
  normalizeCategoryCase,
} from "../src/data/fandoms.ts";

import {
  searchEdits,
  getRankedEdits,
  matchesCategoryFilter,
  matchesFandomFilter,
  HASHTAG_WEIGHTS,
  NON_HASHTAG_WEIGHTS,
} from "../src/data/searchEngine.ts";

import { edits } from "../src/data/edits.ts";
import { CategoryBar } from "../src/components/home/CategoryBar.tsx";
import { VideoCard } from "../src/components/home/Feed.tsx";
import Header from "../src/components/layout/Header.tsx";
import Sidebar from "../src/components/layout/Sidebar.tsx";

// ---------------------------------------------------------------------------
// 1. Fandom Registry & Category Relationships
// ---------------------------------------------------------------------------

test("Fandom Registry defines stable slugs and correct category relationships", () => {
  assert.ok(FANDOM_REGISTRY.length >= 5);

  const ids = FANDOM_REGISTRY.map((f) => f.id);
  assert.equal(new Set(ids).size, ids.length, "Fandom slugs must be unique");

  // Required future paths verified:
  // Anime -> Jujutsu Kaisen, Demon Slayer
  // Movies -> Spider-Man
  // Gaming -> Valorant, Doom
  const jjk = getFandomById("jujutsu-kaisen");
  assert.ok(jjk);
  assert.equal(jjk.title, "Jujutsu Kaisen");
  assert.deepEqual(jjk.categories, ["Anime"]);

  const ds = getFandomById("demon-slayer");
  assert.ok(ds);
  assert.equal(ds.title, "Demon Slayer");
  assert.deepEqual(ds.categories, ["Anime"]);

  const spidey = getFandomById("spider-man");
  assert.ok(spidey);
  assert.equal(spidey.title, "Spider-Man");
  assert.deepEqual(spidey.categories, ["Movies"]);

  const val = getFandomById("valorant");
  assert.ok(val);
  assert.equal(val.title, "Valorant");
  assert.deepEqual(val.categories, ["Gaming"]);

  const doom = getFandomById("doom");
  assert.ok(doom);
  assert.equal(doom.title, "Doom");
  assert.deepEqual(doom.categories, ["Gaming"]);
});

test("getFandomsForCategory returns only registered fandoms for the category", () => {
  const gamingFandoms = getFandomsForCategory("Gaming");
  assert.equal(gamingFandoms.length, 2);
  const gamingIds = gamingFandoms.map((f) => f.id);
  assert.ok(gamingIds.includes("valorant"));
  assert.ok(gamingIds.includes("doom"));

  const animeFandoms = getFandomsForCategory("Anime");
  assert.equal(animeFandoms.length, 2);
  const animeIds = animeFandoms.map((f) => f.id);
  assert.ok(animeIds.includes("jujutsu-kaisen"));
  assert.ok(animeIds.includes("demon-slayer"));

  const moviesFandoms = getFandomsForCategory("Movies");
  assert.equal(moviesFandoms.length, 1);
  assert.equal(moviesFandoms[0].id, "spider-man");

  // Categories without registered sub-fandoms or 'All' return empty array
  assert.deepEqual(getFandomsForCategory("Series"), []);
  assert.deepEqual(getFandomsForCategory("Multifandom"), []);
  assert.deepEqual(getFandomsForCategory("Phonk"), []);
  assert.deepEqual(getFandomsForCategory("Cinematic"), []);
  assert.deepEqual(getFandomsForCategory("All"), []);
});

test("isFandomCompatibleWithCategory validates category-fandom compatibility", () => {
  // Compatible pairings
  assert.equal(isFandomCompatibleWithCategory("valorant", "Gaming"), true);
  assert.equal(isFandomCompatibleWithCategory("doom", "Gaming"), true);
  assert.equal(isFandomCompatibleWithCategory("jujutsu-kaisen", "Anime"), true);
  assert.equal(isFandomCompatibleWithCategory("spider-man", "Movies"), true);

  // 'All' is compatible with any valid fandom
  assert.equal(isFandomCompatibleWithCategory("valorant", "All"), true);
  assert.equal(isFandomCompatibleWithCategory("jujutsu-kaisen", "All"), true);

  // Incompatible pairings
  assert.equal(isFandomCompatibleWithCategory("valorant", "Anime"), false);
  assert.equal(isFandomCompatibleWithCategory("doom", "Movies"), false);
  assert.equal(isFandomCompatibleWithCategory("jujutsu-kaisen", "Gaming"), false);
  assert.equal(isFandomCompatibleWithCategory("spider-man", "Series"), false);

  // Invalid or unknown fandom slug
  assert.equal(isFandomCompatibleWithCategory("unknown-franchise", "Gaming"), false);
  assert.equal(isFandomCompatibleWithCategory("", "Gaming"), false);
});

test("Taxonomy preservation: Production categories distinguish from legacy demo Cinematic", () => {
  assert.deepEqual(
    [...PRIMARY_CATEGORIES],
    ["Anime", "Movies", "Series", "Multifandom", "Gaming", "Phonk"]
  );
  assert.deepEqual([...LEGACY_CATEGORIES], ["Cinematic"]);

  // 'All' is browsing mode, while Cinematic is legacy demo
  assert.ok(NAVIGATION_CATEGORIES.includes("All"));
  assert.ok(NAVIGATION_CATEGORIES.includes("Cinematic"));

  // Normalization
  assert.equal(normalizeCategoryCase("gaming"), "Gaming");
  assert.equal(normalizeCategoryCase("cinematic"), "Cinematic");
  assert.equal(normalizeCategoryCase("all"), "All");
  assert.equal(normalizeCategoryCase("unknown-cat"), undefined);
});

// ---------------------------------------------------------------------------
// 2. Structured Fandom Filtering in Search & Catalog
// ---------------------------------------------------------------------------

const mockCatalog = [
  {
    id: 0,
    title: "Into the Light",
    category: "Cinematic",
    tags: ["cinematic", "original", "demo"],
    description: "Original motion study.",
    creator: "Internal demo",
    poster: "/p0.webp",
    source: "/v.mp4",
    duration: "0:12",
    trending: false,
  },
  {
    id: 1,
    title: "Viper Pit",
    category: "Gaming",
    fandomIds: ["valorant"],
    tags: ["gaming", "tactical", "neon"],
    description: "High tier clutch moments.",
    creator: "Internal demo",
    poster: "/p1.webp",
    source: "/v.mp4",
    duration: "0:15",
    trending: true,
  },
  {
    id: 2,
    title: "Infinite Void",
    category: "Anime",
    fandomIds: ["jujutsu-kaisen"],
    tags: ["anime", "domain", "purple"],
    description: "Domain expansion sequence.",
    creator: "Internal demo",
    poster: "/p2.webp",
    source: "/v.mp4",
    duration: "0:14",
    trending: false,
  },
  {
    id: 3,
    title: "Crossover Rift",
    category: "Anime",
    fandomIds: ["jujutsu-kaisen", "demon-slayer"], // Multi-fandom
    tags: ["anime", "crossover", "blades"],
    description: "Dual sorcerer breathing combat.",
    creator: "Internal demo",
    poster: "/p3.webp",
    source: "/v.mp4",
    duration: "0:18",
    trending: false,
  },
];

test("Structured fandom filter isolates edits by canonical slug ID", () => {
  // Fandom: valorant
  const valResults = searchEdits(mockCatalog, "", "All", "valorant");
  assert.equal(valResults.length, 1);
  assert.equal(valResults[0].edit.id, 1);

  // Fandom: jujutsu-kaisen
  const jjkResults = searchEdits(mockCatalog, "", "All", "jujutsu-kaisen");
  assert.equal(jjkResults.length, 2);
  const jjkIds = jjkResults.map((r) => r.edit.id);
  assert.ok(jjkIds.includes(2));
  assert.ok(jjkIds.includes(3)); // multi-fandom edit satisfies jujutsu-kaisen

  // Fandom: demon-slayer
  const dsResults = searchEdits(mockCatalog, "", "All", "demon-slayer");
  assert.equal(dsResults.length, 1);
  assert.equal(dsResults[0].edit.id, 3); // multi-fandom edit satisfies demon-slayer
});

test("Empty fandom returns 0 results for honest empty state without fabrication", () => {
  // Fandom: doom has no items in mockCatalog
  const doomResults = searchEdits(mockCatalog, "", "Gaming", "doom");
  assert.equal(doomResults.length, 0);

  // Real production demo catalog has no fabricated Valorant or JJK items
  const prodVal = searchEdits(edits, "", "Gaming", "valorant");
  assert.equal(prodVal.length, 0);

  const prodJJK = searchEdits(edits, "", "Anime", "jujutsu-kaisen");
  assert.equal(prodJJK.length, 0);
});

test("Category + Fandom + Search query intersections operate predictably", () => {
  // Intersection of Category: Anime + Fandom: jujutsu-kaisen + Query: #purple
  const results = searchEdits(mockCatalog, "#purple", "Anime", "jujutsu-kaisen");
  assert.equal(results.length, 1);
  assert.equal(results[0].edit.id, 2);

  // Incompatible intersection: Category: Gaming + Fandom: jujutsu-kaisen -> 0 results
  const incompatible = searchEdits(mockCatalog, "", "Gaming", "jujutsu-kaisen");
  assert.equal(incompatible.length, 0);
});

test("Edit ID 0 is preserved across filtering and category defaults", () => {
  const allResults = searchEdits(mockCatalog, "", "All");
  assert.ok(allResults.some((r) => r.edit.id === 0));

  const cinematicResults = searchEdits(mockCatalog, "", "Cinematic");
  assert.equal(cinematicResults.length, 1);
  assert.equal(cinematicResults[0].edit.id, 0);
});

// ---------------------------------------------------------------------------
// 3. UI Component Structure & Accessibility
// ---------------------------------------------------------------------------

test("CategoryBar renders semantic navigation with accessible pressed states", () => {
  let selectedCategory = "Gaming";
  let selectedFandom = "valorant";

  const html = renderToStaticMarkup(
    React.createElement(CategoryBar, {
      category: selectedCategory,
      onSelectCategory: (c) => { selectedCategory = c; },
      fandomId: selectedFandom,
      onSelectFandom: (f) => { selectedFandom = f; },
    })
  );

  // Level 1: Categories nav
  assert.ok(html.includes('<nav class="categories" aria-label="Content categories">'));
  assert.ok(html.includes('aria-pressed="true"')); // Gaming is selected

  // Level 2: Fandoms nav rendered because Gaming has registered fandoms
  assert.ok(html.includes('<nav class="fandoms-bar" aria-label="Gaming fandoms">'));
  assert.ok(html.includes('All Gaming'));
  assert.ok(html.includes('Valorant'));
  assert.ok(html.includes('Doom'));

  // Valorant button has aria-pressed="true"
  assert.ok(html.includes('class="fandom-chip primary" aria-pressed="true"><span>Valorant</span>'));
});

test("CategoryBar omits Level 2 bar when selected category has no fandoms", () => {
  const html = renderToStaticMarkup(
    React.createElement(CategoryBar, {
      category: "Cinematic",
      onSelectCategory: () => {},
      onSelectFandom: () => {},
    })
  );

  assert.ok(html.includes('aria-label="Content categories"'));
  assert.ok(!html.includes('class="fandoms-bar"'), "Level 2 fandom bar should not render for Cinematic");
});

test("VideoCard has separate interactive controls and NO nested buttons", () => {
  let selectCalled = false;
  let tagClicked = "";

  const edit = {
    id: 1,
    title: "Viper Pit",
    category: "Gaming",
    tags: ["gaming", "neon"],
    description: "Clutch motion.",
    creator: "Hidden Creator Name",
    poster: "/p1.webp",
    source: "/v.mp4",
    duration: "0:15",
    trending: false,
  };

  const html = renderToStaticMarkup(
    React.createElement(VideoCard, {
      edit,
      onSelect: () => { selectCalled = true; },
      onTagClick: (tag) => { tagClicked = tag; },
    })
  );

  // Semantic container: <article class="video-card">
  assert.ok(html.startsWith('<article class="video-card"'));

  // Separate watch trigger button
  assert.ok(html.includes('<button type="button" class="card-watch-trigger"'));

  // Separate tag chips
  assert.ok(html.includes('<div class="card-tags" role="group"'));
  assert.ok(html.includes('<button type="button" class="tag-chip"'));
  assert.ok(html.includes('#gaming'));
  assert.ok(html.includes('#neon'));

  // CRITICAL: Verify NO button is nested inside another button
  // A regex checking for `<button[^>]*>.*?<button`
  const nestedButtonRegex = /<button[^>]*>(?:(?!<\/button>)[\s\S])*?<button/i;
  assert.equal(
    nestedButtonRegex.test(html),
    false,
    "VideoCard must NOT contain nested button elements"
  );

  // CRITICAL: Creator name must NOT be rendered in public markup
  assert.equal(
    html.includes("Hidden Creator Name"),
    false,
    "Public video card must never display creator name"
  );
});

test("Header is account-free: no sign-in, member preview, or user profile controls", () => {
  const html = renderToStaticMarkup(
    React.createElement(Header, {
      expanded: true,
      toggle: () => {},
      query: "",
      setQuery: () => {},
      onHome: () => {},
    })
  );

  // Must NOT include Sign In, Sign Up, Member preview, avatar
  assert.equal(html.includes("Sign In"), false);
  assert.equal(html.includes("Sign Up"), false);
  assert.equal(html.includes("Member preview"), false);
  assert.equal(html.includes('class="avatar"'), false);

  // Must maintain search input and brand toggle
  assert.ok(html.includes('role="search"'));
  assert.ok(html.includes('placeholder="Search"'));
  assert.ok(html.includes('id="nav-toggle"'));
});

test("Sidebar contains no account-dependent Following or Library links", () => {
  const html = renderToStaticMarkup(
    React.createElement(Sidebar, {
      active: "Home",
      onSelect: () => {},
    })
  );

  assert.equal(html.includes("Following"), false);
  assert.equal(html.includes("Library"), false);

  // Retains honest placeholders
  assert.ok(html.includes("Creator Studio"));
  assert.ok(html.includes("Immersion"));
  assert.ok(html.includes("Settings"));
  assert.ok(html.includes("Help"));
});

// ---------------------------------------------------------------------------
// 4. Production Catalog Validation
// ---------------------------------------------------------------------------

test("Production edits preserve stable IDs (0..16) and honest legacy categories", () => {
  assert.equal(edits.length, 17);
  for (let i = 0; i < edits.length; i++) {
    assert.equal(edits[i].id, i);
  }

  // Cinematic edits remain discoverable under Cinematic
  const cinematicEdits = edits.filter((e) => e.category === "Cinematic");
  assert.equal(cinematicEdits.length, 3);
  assert.deepEqual(cinematicEdits.map((e) => e.id), [0, 6, 12]);

  // All edits discoverable under 'All'
  const allEdits = searchEdits(edits, "", "All");
  assert.equal(allEdits.length, 17);
});
