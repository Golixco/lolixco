# Lolixco: Complete Current-State Feature Audit (Mission 6A & 6B)

**Date:** 2026-10-18  
**Auditor:** Antigravity (Lead Architecture Reviewer & Integration Architect)  
**Baseline Commit:** `30051c359ae97012c6bfc14d77a183261f0c6bbd` (`origin/main`)  
**Scope:** Missions 1–5 Comprehensive Implementation Review & Mission 6B Foundation Verification  

---

## 1. Feature Status Matrix

| Feature / System | Status | Primary Source Files | Verification Evidence | Current Architecture & Behavior | Regression Risk |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Search Engine & Ranking** | Fully Implemented & Tested | `src/data/searchEngine.ts`<br>`src/hooks/useDiscoveryFeed.ts` | `tests/search.test.mjs`<br>(13 tests passing) | Creator search excluded for anonymity. Structured fandom filtering via canonical slug IDs. Deterministic scoring ($[0, 1]$), exact hashtag matching, tie-breaking by ID. | **Low:** Unit tests lock scoring and tie-breaking. |
| **Topic Navigation (`CategoryBar`)** | Two-Level Implemented | `src/components/home/CategoryBar.tsx`<br>`src/data/fandoms.ts` | `tests/fandoms.test.mjs` | Level 1: Primary categories (`All`, `Anime`, `Movies`, `Series`, `Multifandom`, `Gaming`, `Phonk`, `Cinematic`). Level 2: Fandom sub-chips for categories with registered fandoms (`Gaming -> Valorant, Doom`; `Anime -> JJK, Demon Slayer`). Semantic `<button aria-pressed>` within `<nav>`. | **Low:** Synchronous local filtering; isolated from backend contracts. |
| **Hashtags & Tags** | Fully Implemented & Interactive | `src/data/searchEngine.ts`<br>`src/components/home/Feed.tsx` | `tests/search.test.mjs`<br>`tests/fandoms.test.mjs` | Clickable tag chips on `VideoCard` filter the feed via exact `#tag` query without opening the video. | **Low:** Separate interactive buttons without nested HTML. |
| **Loading Skeletons** | Maintained | `src/components/home/VideoCardSkeleton.tsx`<br>`src/components/home/DiscoveryGridSkeleton.tsx` | `tests/skeleton.test.mjs` | Production search is synchronous (`simulateDelayMs = 0`), so skeletons do not flicker during normal browsing. Retained for tests and async simulation. | **Low:** Skeletons do not interfere with synchronous render. |
| **Video Player & A–B Looping** | Fully Implemented & Tested | `src/components/video/VideoPlayer.tsx`<br>`src/data/logic.js` | `tests/player.test.mjs`<br>`tests/recommendations.test.mjs` | Standard landscape 16:9 player with continuous A–B looping, seeking, keyboard shortcuts, and volume controls. Kept strictly horizontal in 6B. | **Low:** Player state remains isolated from feed changes. |
| **Home Recommendations** | Fully Implemented & Tested | `src/hooks/useRecommendations.ts`<br>`src/api/recommendations.ts`<br>`server/recsys/api.py` | `tests/recommendations.test.mjs`<br>`server/recsys/tests/test_api.py` | Queries fixed `limit=6`. Consumes deterministic Python ranking or local fallback. | **Low:** Contract frozen at `schema_version: "1.0"`. |
| **Up Next Recommendations** | Fully Implemented & Tested | `src/hooks/useRecommendations.ts`<br>`src/api/recommendations.ts`<br>`server/recsys/engine.py` | `tests/recommendations.test.mjs` | Shows 4 compact cards. Strict active video exclusion verified on client and server. | **Low:** Synchronous fallback guarantees 0 stale renders. |
| **Python Recommendation API** | Fully Implemented & Tested | `server/recsys/api.py`<br>`server/recsys/engine.py`<br>`server/recsys/similarity.py` | `server/recsys/tests/` (53 tests passing) | Serves deterministic heuristic scoring based on category match, tag IDF, and diversity reranking. Note: Engine is deterministic Stage 1 rules, not a trained neural model. | **Low:** Strictly typed Pydantic models. |
| **Local Offline Fallback** | Fully Implemented & Tested | `src/api/recommendations.ts` | `tests/recommendations.test.mjs` | Fallback works synchronously when backend is offline. | **Low:** Zero external dependencies. |
| **Catalog Drift Validation** | Fully Implemented & Tested | `server/recsys/export_catalog.py` | `server/recsys/tests/test_drift.py` | Enforces exact match between TypeScript edits and snapshot at `server/recsys/catalog_snapshot.json` (17 edits). | **High:** Modifying catalog requires running export script. |
| **Mobile Navigation & Layout** | Fully Implemented & Tested | `src/App.tsx`<br>`src/components/layout/Sidebar.tsx`<br>`src/styles/index.css` | Manual responsive audit & media queries | Category and fandom bars support touch scrolling; sidebar becomes modal drawer on `<768px`. | **Low:** CSS media queries well-structured. |
| **Account-Free UI Alignment** | Cleaned in Mission 6B | `src/App.tsx`<br>`src/components/layout/Header.tsx`<br>`src/components/layout/Sidebar.tsx` | `tests/fandoms.test.mjs` | Obsolete "Sign In", "Sign Up", member-preview dialogs, and profile avatars removed. Public creator names removed from cards. "Following" and "Library" removed. | **Low:** Honest placeholders maintained for Creator Studio & Immersion. |

---

## 2. In-Depth Subsystem Audits

### A. Search Engine
- **Implementation Status:** Fully production-ready.
- **Weighted Scoring:** `HASHTAG_WEIGHTS` (Hashtag 40%, Title 30%, Category 15%, Description 15%, Creator 0%) and `NON_HASHTAG_WEIGHTS` (Title 50%, Category 25%, Description 25%, Creator 0%).
- **Creator Privacy:** Creator names are excluded from public search evaluation, preventing hidden internal names from matching or leaking.
- **Exact Hashtag Conjunction:** Multiple `#hashtags` require ALL tags to be present in `edit.tags`.
- **Structured Fandom Filter:** Canonical slug IDs (`fandomId`) filter items via structured array check (`edit.fandomIds?.includes(fandomId)`), not loose string search.
- **Malformed Tokens:** Tokens like `##anime` or bare `#` are safely rejected with zero crashes.
- **Immediate Results:** `useDiscoveryFeed` derives results synchronously in `useMemo` with zero artificial latency.
- **Edit ID 0:** Numeric ID 0 is strictly handled as a distinct valid integer, never coerced to falsey.

### B. Category & Fandom Navigation (`CategoryBar.tsx` & `src/data/fandoms.ts`)
- **Primary Taxonomy:** `All`, `Anime`, `Movies`, `Series`, `Multifandom`, `Gaming`, `Phonk`, `Cinematic`.
- **Semantics:**
  1. `All` is an open browsing mode encompassing all catalog items.
  2. `Cinematic` is preserved as a legacy demo category for the initial 17 motion studies. It is **NOT** aliased to `Movies` or `Multifandom`.
  3. `Multifandom` is recognized in the frontend taxonomy for upcoming crossover edits; it is not sent to the current recsys backend which rejects unknown categories.
  4. Fandom sub-chips appear only when the selected category has registered fandoms (e.g. `Gaming -> Valorant, Doom`; `Anime -> Jujutsu Kaisen, Demon Slayer`; `Movies -> Spider-Man`).
  5. Selecting an incompatible category clears active fandom selection automatically.

### C. Hashtags & Interactive Tags
- **Metadata:** Each edit in `src/data/edits.ts` defines `tags: string[]` (e.g. `["cinematic", "original", "demo", "landscape"]`).
- **Interactive Tags:** `VideoCard` renders separate `<button type="button" class="tag-chip">` elements. Clicking a tag triggers catalog filtering (`#tag`) without triggering video playback.
- **HTML Validity:** The card is an `<article>` container containing a `<button class="card-watch-trigger">` and sibling tag buttons, strictly avoiding nested `<button>` elements.

### D. Skeletons & Loading UX
- **Components:** `VideoCardSkeleton.tsx` and `DiscoveryGridSkeleton.tsx`.
- **Geometry Alignment:** Skeletons maintain thumbnail, title, metadata line, and tag line geometry consistent with creator-free cards.
- **No Production Latency:** In `useDiscoveryFeed.ts`, `simulateDelayMs` defaults to `0`, ensuring instant synchronous rendering without skeleton flicker.

### E. Recommendation Engine & API Integration (Mission 5)
- **Serving Capabilities:**
  - `POST /api/v1/recommendations` serves deterministic baseline ranking for `home` and `up_next`.
  - Active video is suppressed on both client and server for `up_next`.
  - API supports `filters.category` and `filters.tags_all`.
  - Note: Backend ranking is deterministic heuristics (IDF tag overlap + category balance + creator diversity), not a trained deep learning model.
- **Safety & Resilience:**
  - 64 KB streaming body size limit protects against memory exhaustion (HTTP 413).
  - Strict RFC3339 validation rejects surrounding whitespace and malformed dates (HTTP 422).
  - Frontend contract strictly validates `has_more: false`, `next_cursor: null`, finite scores, and `mode_used: "baseline"`.

### F. Product Alignment & Account-Free Execution
- **Header:** Zero sign-in or registration controls. Clean search and help shortcut trigger.
- **Sidebar:** Removed account-dependent "Following" and "Library". Maintained honest placeholders for Creator Studio (temporary in-browser AI video analysis) and Immersion Mode.
- **Card Metadata:** `edit.creator` is omitted from public cards.
- **Honest Labels:** Demo collections avoid claiming unverified "Trending" viewer metrics, presenting honest curated demo highlights.

---

## 3. Backward Compatibility & Catalog Drift Constraints

- The current repository enforces zero drift between `server/recsys/catalog_snapshot.json` and `src/data/edits.ts` via `python3 -m server.recsys.export_catalog --check`.
- The 17 demo edits use category `"Cinematic"`.
- **Constraint:** `"Cinematic"` is preserved verbatim in `src/data/edits.ts` and `catalog_snapshot.json` to maintain 100% backward compatibility with Missions 1–5 without drift.
