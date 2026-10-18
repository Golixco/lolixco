# LOLIXCO — MISSION 6C: SHORTS VIEWER & COMPONENT ARCHITECTURE

**Status:** IMPLEMENTED & VERIFIED  
**Components:** `src/components/shorts/` & `src/App.tsx`  
**Author:** Lead Frontend Architect & Video Experience Engineer  
**Date:** October 2026

---

## 1. Architectural Overview

The Shorts experience is divided into three focused components:

1. `ShortsCard.tsx`: Reusable 9:16 portrait card tile.
2. `ShortsShelf.tsx`: Horizontally scrollable carousel shelf for Home and Explore.
3. `ShortsViewer.tsx`: Dedicated full-viewport vertical portrait video player.

---

## 2. Component Design & Capabilities

### `ShortsCard.tsx`
- **Aspect Ratio:** Fixed 9:16 portrait presentation (`.shorts-thumbnail`).
- **Interactive Controls Separation:**
  - The main card body is an accessible `<button>` watch trigger (`aria-label="Watch short: {title}"`).
  - Tag chips (`.tag-chip`) are positioned OUTSIDE the watch trigger button, preventing invalid HTML nested button warnings and allowing users to filter by hashtag without inadvertently launching video playback.
- **Visual Presentation:**
  - Dark gradient overlay for title readability.
  - Duration badge top-right.
  - Category and fandom badges bottom-left.
  - Graceful fallback icon and message if poster fails to load.

### `ShortsShelf.tsx`
- **Omission Invariant:** Returns `null` when `items` is empty (no empty shelves or layout jumps).
- **Smooth & Accessible Scrolling:**
  - Native CSS scroll-snap (`scroll-snap-type: x mandatory`).
  - Left / Right chevron scroll buttons with `aria-label="Scroll shorts left/right"`.
  - Accessible region role (`role="region" aria-label="{title} carousel"`).
  - Responsive card budgeting: dynamically scales card widths to show 5 cards at 1440px, 4 at 1024px, and swipeable native cards on mobile (390px).

### `ShortsViewer.tsx`
- **Presentation:**
  - Desktop: Centered 9:16 frame inside a dark backdrop blur (`rgba(0,0,0,0.9)`).
  - Mobile: Fullscreen viewport height (`100dvh`).
- **Playback Controls:**
  - Click frame or Space/K: Play / Pause toggle.
  - Volume button or M key: Mute / Unmute toggle.
  - Up / Down chevron buttons or Up/Down arrow keys: Navigate Previous / Next short.
  - Mobile vertical touch swipe: Swipe up advances to next short; swipe down restores previous short.
  - Video looping: Native HTML5 `loop` attribute repeats the current short rather than aggressively forcing auto-advance.
  - Scrubbing progress bar: Displays playback progress and allows seeking without intrusive playback rails.
- **Resource Cleanup & Focus Restoration:**
  - Saves `document.activeElement` on open.
  - Focuses viewer dialog (`role="dialog" aria-modal="true"`).
  - Pauses previous video and restores focus on exit.
  - Escape key or Close button (`X`) triggers exit.
  - Video error state with retry button for missing or unavailable sources.

---

## 3. Navigation & URL Synchronization

1. **URL Schema:**
   - Browsing Shorts: `?view=shorts`
   - Watching specific Short: `?view=shorts&short=<id>` (or `?short=<id>` when opened from Home/Explore).
2. **Numeric ID 0 Preservation:**
   - Short ID `0` is explicitly parsed and supported (`0 !== null && !isNaN(0)`).
3. **Invalid ID Recovery:**
   - Unknown or malformed IDs (e.g. `?short=99999`) safely fall back without crashing or breaking page layout.
4. **History & Back/Forward:**
   - Navigating between Home and Shorts pushes clean history entries.
   - Browser Back / Forward smoothly restores view state and opens/closes the viewer.
5. **Honest Empty State:**
   - When visiting `?view=shorts` on a catalog with 0 shorts:
     - Heading: `<h1>Curated Shorts are coming soon</h1>`
     - Descriptive message: "We are currently curating genuine vertical edits across our fandoms. In the meantime, explore our cinematic landscape edits."
     - Action: `Return to browsing` button restores Home.
     - Never fabricates placeholder shorts or substitutes unrelated landscape edits.
