# YouTube Topic Discovery & Feed Composition Research (REA Investigation)

**Date:** 2026-10-17  
**Observer:** Antigravity (Lead Product Researcher & Full-Stack Architect)  
**Investigation Target:** [YouTube](https://www.youtube.com/) via Reverse-Engineering Anything (REA) / Browser Subagent  
**Authentication Context:** Authenticated Session Verified (Manual Sign-in completed by Owner; account avatar active)  
**Document Status:** Grounded Observation & Architectural Synthesis (Mission 6A)

---

## 1. Executive Summary

This investigation explores YouTube's observable discovery interface to inform Lolixco's upcoming category, fandom, and mixed-format (Long-form + Shorts) discovery system. The analysis separates **directly observable UI behaviors** from **officially documented platform rules** and **Lolixco-specific architectural hypotheses**.

> **Note on Research Scope:** These observations document surface-level user-interface behavioral patterns observed during interactive browser testing, not fixed platform rules or private backend ranking logic. YouTube's proprietary shelf-positioning, ranking models, and candidate generation are private server-side systems and cannot be recovered through client-side inspection.

### Key Behavioral Discoveries
1. **Topic Chips are Client-Side Viewport Filters:** Topic chips (`ytd-feed-filter-chip-bar-renderer`) sit directly below the fixed header. Selecting a chip does not cause a browser full-page reload or URL pathname change; it dynamically dispatches client-side feed updates, instantly repopulating the feed with topic-relevant shelves while maintaining scroll position and UI state.
2. **Dynamic Section-Based Feed Composition:** YouTube does not present a uniform infinite list. The feed is composed of distinct heterogeneous shelves:
   - Primary horizontal rows of regular 16:9 video cards (2 to 4 columns depending on viewport width).
   - A dedicated vertical **Shorts shelf** (typically 6–8 vertical 9:16 cards in a horizontal swipe/scroll container) positioned after the first 1–2 video rows.
   - Subsequent rows of long-form videos interspersed with further thematic or algorithmic shelves.
3. **Hashtag Pages vs. Search vs. Topic Chips:**
   - **Topic Chips:** Filter the Home recommendation pool into a broader topic without leaving Home (`/`).
   - **Hashtags:** Display a dedicated `#tag` channel/landing banner (`/results?search_query=%23...` or `/hashtag/...`) showing aggregate platform counts (`185M videos • 16M channels`) and a vertical list of items matching the tag.
   - **Search:** Full-text fuzzy query over titles, descriptions, and transcripts with optional filter chips.
4. **Shorts Player Experience:** Selecting a Short transitions into a full-height vertical player (`/shorts/...`) with right-rail engagement actions (Like, Dislike, Comments, Share, Remix, Audio attribution), single-stroke vertical snap navigation (mouse wheel or down arrow), and effortless return to Home.

---

## 2. YouTube Observation Matrix

| Feature / Area | Directly Observed Behavior | URL & Navigation State | Layout & Rendering Mechanics | Lolixco Applicability |
| :--- | :--- | :--- | :--- | :--- |
| **Topic Chip Bar** | Horizontal pill buttons (`All`, `Gaming`, `Music`, `AI`, `Podcasts`, etc.) fixed beneath masthead. Left/right scroll fade arrows when overflowing. | Does not change base URL (`/`). Query params occasionally appended for tracking (`?bp=...`). | Selected chip highlighted with high-contrast background (black in light mode, white in dark mode). Unselected chips use subtle muted gray background. | **High:** Directly inspires Lolixco's Category & Fandom bar (`CategoryBar`). |
| **Topic Switching** | Instantaneous feed transition. Feed container refreshes client-side with topic-specific candidate pool. | In-place client update; zero full-page reload. | Smooth DOM replacement. Brief shimmer/skeleton only on cold network requests. | **High:** Lolixco will execute instant client-side memoized category/fandom filtering without network delay. |
| **Feed Composition (Home)** | Mixed section sequence: 1–2 rows of long-form videos $\rightarrow$ 1 horizontal Shorts shelf $\rightarrow$ subsequent long-form rows $\rightarrow$ occasional topic breakout shelves. | Standard `/` Home feed. | Modular CSS Grid/Flexbox with `ytd-rich-grid-row` and `ytd-rich-section-renderer`. | **High:** Solves Lolixco's requirement to mix 50 curated edits and 20 Shorts cleanly on Home. |
| **Shorts Shelf** | 6 to 8 portrait cards visible on desktop. Horizontal scroll with circular next/previous arrow buttons. | Embedded on Home feed without route change. | Aspect ratio **9:16 vertical**. Overlay title at card bottom, view count badge, 3-dot context menu. | **High:** Dedicated `ShortsShelf` component for 20 planned portrait edits. |
| **Regular Video Cards** | 16:9 thumbnail, rounded corners (12px), duration badge bottom-right (`MM:SS`), circular channel avatar, 2-line title clamp, view count + age. | Clicking navigates to `/watch?v=...`. | Hovering over thumbnail triggers silent animated preview with scrub bar and quick action buttons ("Watch Later", "Queue"). | **Moderate:** Lolixco adopts 16:9 thumbnails, duration badges, and title clamps, but rejects view counts, channels, and social metrics. |
| **Watch Page (Up Next)** | Right-hand secondary column on desktop. Topic chips at top (`All`, `Related`, `From this channel`). Active video strictly suppressed. | `/watch?v=...` | Compact cards: horizontal thumbnail on left, title + metadata stacked on right. | **High:** Identical to Lolixco's verified Mission 5 Up Next recommendation column. |
| **Hashtags (`#gaming`)** | Clickable blue links in descriptions and dedicated search header banner with `#` icon and video/channel stats. | `/results?search_query=%23...` | Vertical list of video cards with full metadata snippet. | **High:** Informs Lolixco's clickable tags and exact `#fandom` filter routing. |
| **Shorts Player** | Dedicated vertical full-screen viewport. Right rail: Like, Dislike, Comments, Share, Remix, Sound disc. Vertical snap scrolling. | `/shorts/<id>` | 9:16 video centered in dark ambient container. Arrow down or wheel scrolls to next Short. | **High:** Blueprint for Lolixco's upcoming Shorts portrait viewer. |

---

## 3. Deep Investigation: Mixed Long-Form & Shorts Composition

### A. Layout Structure & Grid Topology
1. **Multi-Column Long-Form Grid:**
   - On desktop ($\ge 1440$px): 4 cards per row.
   - On medium desktop / laptop ($1024$px–$1439$px): 3 cards per row.
   - On tablet ($768$px–$1023$px): 2 cards per row.
   - On mobile ($<768$px): 1 card per row (full-width stacked).
2. **Aspect Ratios:**
   - Long-form thumbnails strictly adhere to **16:9** landscape orientation.
   - Shorts cards strictly adhere to **9:16** vertical portrait orientation.
3. **The Shorts Shelf Interspersion:**
   - In observed sessions, the Shorts shelf was consistently injected after **Row 1** or **Row 2** of regular videos.
   - The shelf is introduced with a distinct header: Red Shorts icon + **Shorts** title, accompanied by a right-aligned overflow menu (`Not interested` / `Feedback`).
   - Cards inside the shelf do not use channel avatars; instead, title text and view counts are directly overlaid on top of the vertical poster.
   - Desktop displays 6 to 8 cards simultaneously with carousel pagination controls (left/right floating chevron buttons).
   - Below the Shorts shelf, regular 16:9 video rows resume seamlessly.

### B. Infinite Scroll & Incremental Loading
- When scrolling past 2–3 viewports, YouTube appends new row batches via `IntersectionObserver`.
- The feed appends `ytd-rich-grid-row` containers incrementally without re-rendering previously displayed rows.
- No full-screen blocking spinner is shown; small circular spinners or lightweight shimmer blocks appear only at the bottom boundary if network latency exceeds frame budget.
- After page refresh (`F5`), the seed and candidate ordering change slightly, and active topic selection always resets to `All`.

---

## 4. Video & Shorts Card Anatomy

```
+----------------------------------------+       +-------------------+
|               16:9 VIDEO               |       |    9:16 SHORTS    |
|               THUMBNAIL                |       |     THUMBNAIL     |
|                                        |       |                   |
|                        +-------------+ |       |                   |
|                        | DURATION    | |       |                   |
|                        +-------------+ |       |                   |
+----------------------------------------+       |                   |
| (O)  Video Title Clamped to Two Lines  |       | Title Overlaid... |
|      Channel Name • Verified Tick      |       | 2.4M views        |
|      1.2M views • 3 days ago           |       +-------------------+
+----------------------------------------+       Shorts Portrait Card
       Standard Long-Form Card
```

### Element Breakdown & Lolixco Alignment

| Element | YouTube Implementation | Lolixco Philosophy & Adaptation |
| :--- | :--- | :--- |
| **Duration Badge** | Overlay bottom-right of thumbnail (`0:12`, `14:20`). | **Keep:** Essential for video edits; already implemented in `VideoCard.tsx`. |
| **Channel Avatar & Name** | Prominent circle avatar + channel name + checkmark. | **Reject:** Lolixco is a curated platform without public creator names or profiles. |
| **View Counts & Age** | Social validation metrics (`1.2M views`, `2 days ago`). | **Reject:** Lolixco avoids deceptive engagement numbers, follower counts, and vanity metrics. |
| **Title Presentation** | Clamped to 2 lines (`line-clamp: 2`), `title` attribute for tooltip. | **Keep:** Clean typography, 2-line maximum clamp to prevent layout shifts. |
| **Hover Scrubber** | Hovering plays silent video preview with seek scrub bar. | **Adapt:** Video player already supports continuous A–B looping; card hover can preview loop GIF/webp. |
| **Vertical Shorts Card** | 9:16 portrait card, rounded corners, dark ambient gradient. | **Adopt for Mission 6:** Implement `ShortsCard` with 9:16 aspect ratio for the 20 planned portrait edits. |

---

## 5. Hashtags, Search & Topic Discovery Mechanics

### Observed Differentiation
1. **Hashtag Search (`#gaming` / `#anime`):**
   - Entering `#tag` in the search bar triggers hashtag-specific suggestions.
   - The results page presents a specialized `#tag` hub with total video/channel aggregates.
   - Result cards are arranged vertically, highlighting description snippets where the hashtag was placed.
   - In video descriptions, hashtags are automatically tokenized into blue clickable hyperlinks (`<a href="/hashtag/...">`).
2. **Topic Chips (`Gaming`, `Anime`):**
   - Topic chips represent curated/algorithmic umbrellas rather than raw string matches.
   - Selecting a chip maintains the Home grid layout rather than switching to search-result list view.
   - Topic chips allow rapid horizontal switching with keyboard tab/arrow support.
3. **Lolixco Synergy:**
   - Lolixco's `searchEngine.ts` already enforces strict `#tag` exact matching with weighted relevance.
   - Lolixco's category bar already provides top-level filtering.
   - To match YouTube's power, Lolixco needs a **two-tier hierarchy**: Top-Level Category (`Anime`, `Gaming`) $\rightarrow$ Sub-Topic Fandom Chips (`Jujutsu Kaisen`, `Demon Slayer`, `Valorant`).

---

## 6. Research Limitations & Ethical Safeguards

1. **Proprietary Algorithms:** YouTube's neural candidate generation, two-tower embeddings, and real-time transformer ranking cannot be observed from DOM inspection. No claims are made regarding private YouTube backend logic.
2. **Private Account Data:** Zero personal watch history, account identifiers, subscriptions, or private cookies were exported or committed to the repository.
3. **No Automation Workarounds:** All authentication was performed manually by the owner. Only standard visible browser interactions were utilized.
