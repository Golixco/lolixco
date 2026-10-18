# LOLIXCO — MISSION 6C: FEED COMPOSITION SPECIFICATION

**Status:** IMPLEMENTED & VERIFIED  
**Component:** `src/data/feedComposition.ts` & `src/App.tsx`  
**Author:** Lead Frontend Architect & Video Experience Engineer  
**Date:** October 2026

---

## 1. Architectural Philosophy: Engine vs. Composition

Mission 6A research established a crucial separation of concerns:

- **Recommendation Engine (`server/recsys/` & `useRecommendations.ts`):**  
  *Which content should be recommended?*  
  Calculates cold-start balance, tag/thematic relevance, and sequence freshness based on user playback context and diversity constraints.
- **Feed Composition Layer (`src/data/feedComposition.ts`):**  
  *How should that content be organized into visible sections?*  
  Takes ranked items and the broader catalog, enforces format separation (landscape 16:9 vs portrait 9:16), handles section budget sizing, eliminates cross-row duplication, and adapts structure to catalog availability.

The feed compositor is implemented as a pure, deterministic function independent of React, browser DOM, and network state.

---

## 2. Format Separation & Classification Rules

1. **Explicit Format Recognition:**
   - Items with `format === "short"` are classified as Shorts (`isShort(edit)` returns `true`).
   - Items with missing `format` or `format === "video"` default to standard landscape videos (`isVideo(edit)` returns `true`).
   - **Never infer format from duration:** Brief duration (e.g., 12 seconds) does NOT make an edit a Short. Format is an editorial media presentation property, not a length threshold.
2. **Strict Cross-Format Isolation:**
   - Shorts are NEVER permitted to appear in landscape video rows (`Recommended Edits`, `More to Discover`).
   - Landscape videos are NEVER permitted to appear in portrait Shorts shelves (`Curated Shorts`).

---

## 3. Feed Composition Algorithm (`composeHomeFeed`)

### Section Model

```typescript
export type FeedSection =
  | {
      type: "video_row";
      id: string;
      title: string;
      items: Edit[];
    }
  | {
      type: "shorts_shelf";
      id: string;
      title: string;
      items: Edit[];
    };
```

### Composition Pipeline

```text
[Input Catalog] + [Recommendation API / Fallback Output]
                      │
                      ▼
            Format Partitioning
            ├── Video Pool (16:9)
            └── Shorts Pool (9:16)
                      │
                      ▼
         Row 1: Recommended Edits
         (Priority: RecSys output; backfill from Video Pool)
         (Records used video IDs to prevent duplicates)
                      │
                      ▼
         Shelf: Curated Shorts
         (IF Shorts Pool > 0: Take up to maxShortsPerShelf)
         (IF Shorts Pool === 0: COMPLETELY OMITTED)
                      │
                      ▼
         Row 2: More to Discover
         (Remaining unused items from Video Pool)
```

### Deterministic Rules:

1. **Preserve Recommendation Ranking:**  
   The primary row (`Recommended Edits`) accepts items directly from the Python recsys API (or offline fallback) in their exact ranked order.
2. **Zero Cross-Row Duplicate IDs:**  
   A tracking set `usedVideoIds` prevents any video featured in the hero player or `Recommended Edits` from repeating in `More to Discover`.
3. **Completely Omit Shorts Shelf on Zero Shorts:**  
   When the Shorts catalog has 0 items (as in the current 17-item demo catalog), `composeHomeFeed` returns ONLY video rows. No empty carousels, placeholder cards, or fake content are rendered.
4. **Resilience to Catalog Sizing:**  
   Tested and proven on 0, 1, 2, 3, 17, 50, 70+ catalog items without layout collapse or index errors.

---

## 4. Discovery & Search Composition (`splitMixedResults`)

For Explore and Search views:

- `splitMixedResults(filtered)` partitions matching results into `{ videos, shorts }` preserving each group's relative relevance score without ranking corruption.
- When both formats match:
  - Renders a `ShortsShelf` for matching portrait Shorts (`Matching Shorts` / `Curated Shorts`).
  - Renders a `ContentSection` for landscape edits (`Matching Edits` / `Landscape Edits`).
- When only videos match: renders only the video grid.
- When only shorts match: renders only the shorts shelf.
- When neither matches: renders the honest empty state.

---

## 5. Content Ingestion Readiness & Future Catalog Additions

When authentic portrait Shorts are curated by the owner:

1. Add items to `src/data/edits.ts` with `format: "short"`.
2. Re-export the catalog snapshot: `python3 -m server.recsys.export_catalog`.
3. The Home page will automatically detect `shortsCatalog.length > 0` and compose the `Curated Shorts` shelf without any frontend code modifications.
