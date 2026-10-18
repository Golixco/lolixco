# LOLIXCO — MISSION 6C: SHORTS VIEWER & COMPONENT ARCHITECTURE

**Status:** IMPLEMENTED, CORRECTED (V2), & VERIFIED  
**Components:** `src/components/shorts/` & `src/App.tsx`  
**Author:** Lead Frontend Architect & Video Experience Engineer  
**Date:** October 2026

---

## 1. Architectural Overview

The format-aware discovery experience is structured across four key modules:

1. `ShortsCard.tsx`: Reusable 9:16 portrait card tile with separated watch and tag controls.
2. `ShortsShelf.tsx`: Horizontally scrollable carousel shelf for Home and Explore feeds with unconditional React hook lifecycle.
3. `ShortsViewer.tsx`: Dedicated full-viewport vertical portrait video player with focus trap, slider scrubbing, error recovery, and debounced touch navigation.
4. `feedComposition.ts`: Pure catalog composition and format partitioning logic.

---

## 2. Component Design & V2 Corrections

### `ShortsCard.tsx`
- **Aspect Ratio:** Fixed 9:16 portrait presentation (`.shorts-thumbnail`).
- **Interactive Controls Separation:**
  - The main card body is an accessible `<button>` watch trigger (`aria-label="Watch short: {title}"`).
  - Tag chips (`.tag-chip`) are positioned outside the watch trigger button, preventing invalid HTML nested button warnings and allowing users to filter by hashtag without inadvertently launching video playback.
- **Visual Presentation:**
  - Dark gradient overlay for title readability.
  - Duration badge top-right.
  - Category and fandom badges bottom-left.
  - Graceful fallback icon and message if poster fails to load.

### `ShortsShelf.tsx` (Corrected in V2)
- **Unconditional Hook Lifecycle (Fix C):**
  - All hooks (`useRef`, `useState`, `useCallback`, `useEffect`) execute unconditionally before empty checks.
  - The check `if (!items || items.length === 0) return null;` occurs after hook declarations.
  - Tested and verified across all dynamic transitions:
    - Empty (`[]`) → Populated (`[items]`)
    - Populated → Empty
    - 1 item → Many items
    - Rapid sequential updates without memory leaks or stale listeners.
- **Smooth & Accessible Scrolling:**
  - Native CSS scroll-snap (`scroll-snap-type: x mandatory`).
  - Left / Right chevron scroll buttons with `aria-label="Scroll shorts left/right"`.
  - Accessible region role (`role="region" aria-label="{title} carousel"`).
  - Responsive card budgeting: dynamically scales card widths to show 5 cards at 1440px, 4 at 1024px, and swipeable native cards on mobile (390px).

### `ShortsViewer.tsx` (Corrected in V2)
- **Parent-Controlled State & URL Synchronization (Fix A):**
  - Controlled via `activeShortId` and `onShortChange` callback.
  - Next / Previous button actions and Up / Down arrow shortcuts advance the active short and invoke `onShortChange` to immediately update parent state and URL (`?short=<id>`).
  - Direct links restore the target Short on load and refresh.
  - Browser Back / Forward pops history and restores the previous short.
- **Strict Short ID Validation (`parseAndValidateShortId`):**
  - Numeric ID `0` is strictly valid and preserved (`Number("0") === 0`).
  - Rejects negative numbers (`-1`), decimals (`1.5`), non-digits (`abc`), unsafe integers, unknown IDs not in the catalog, and non-Short landscape video IDs.
- **Clean History on Close (Fix A):**
  - Closing the viewer uses `replaceState` (`usePush: false`) without `short=` parameter, ensuring Back does not reopen the viewer unexpectedly.
- **Video Playback Lifecycle & Error Recovery (Fix D):**
  - Pauses background featured `VideoPlayer` whenever viewer overlay is active (`isOverlayActive` prop).
  - Outgoing video is paused immediately upon item change and component unmount.
  - Sequence token (`playRequestId`) prevents stale async `play()` promise races from updating playback state for an old item.
  - Video element remains mounted in the DOM at all times (styled `display: none` during error state) to preserve video ref integrity.
  - Retry button invokes `video.load()` and initiates playback recovery reliably.
  - Native HTML5 `loop` attribute preserves short looping at end.
  - Autoplay respects `prefers-reduced-motion` and `saveData` (never autoplays if enabled).
  - Never forces unmuted autoplay (defaults to muted).
- **Accessibility & Focus Management (Fix E):**
  - Modal dialog semantics: `role="dialog" aria-modal="true" aria-label="Shorts viewer: {title}"`.
  - Focus trap: Tab and Shift+Tab wrap focus strictly within the dialog.
  - Focus restoration: Automatically returns focus to the previously active element on close.
  - Keyboard shortcut scoping: Focused buttons, links, and inputs are excluded from space/enter hijacking, allowing buttons to activate natively.
  - Progress Seeker Slider: Features `role="slider"`, `tabindex="0"`, `aria-label="Seek short video"`, `aria-valuenow`, `aria-valuemin`, `aria-valuemax`, and handles ArrowLeft (-5s), ArrowRight (+5s), Home (0), and End (duration).
  - Touch Navigation: Debounced with 400ms threshold to prevent rapid accidental skips.

---

## 3. Navigation & Filtering Semantics (Fix B)

1. **Atomic Viewer Hashtag Navigation:**
   - Clicking a hashtag chip inside the viewer:
     1. Closes the viewer (`activeShort` becomes null).
     2. Clears the `short=` URL parameter.
     3. Sets the exact `#tag` query.
     4. Resets category to `"All"` and clears fandom to avoid incompatible or hidden filters.
     5. Navigates to `Explore` discovery surface.
     6. Updates URL to `?view=explore&q=%23tag`.
2. **Dedicated Shorts Surface Filtering:**
   - When visiting `?view=shorts` with 0 catalog shorts:
     - Selecting a category, fandom, or typing a query immediately transitions to `Explore` with that filter active, ensuring no dead filter chips remain displayed on an empty state.
   - When visiting `?view=shorts` with populated shorts:
     - Categories, fandoms, and query filters filter the visible shorts via `useDiscoveryFeed` (maintaining Mission 6B's weighted search and exact tag semantics).

---

## 4. Arbitrary Catalog Composition Robustness (Fix F)

- In `App.tsx`:
  - `initialLandscapeVideo` is resolved via `edits.find((e) => isVideo(e)) || null`.
  - The landscape `featured-row` is only rendered if `selected && isVideo(selected)`.
  - In a Shorts-only catalog, `initialLandscapeVideo` evaluates to `null`, completely omitting the landscape featured player and guaranteeing that a vertical Short is never placed into the landscape hero player.
- All 17 production edits retain distinct numeric IDs (0..16) and match the recommendation catalog snapshot with 0 drift.
