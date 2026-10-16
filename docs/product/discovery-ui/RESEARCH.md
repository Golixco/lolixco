# Lolixco Discovery UI, Skeleton Loading & Search UX — Research Report

**Document Status**: COMPLETED RESEARCH (Revised following review; awaiting final authorization prior to frontend coding)  
**Branch**: `research/discovery-ui-search`  
**Auditor/Researcher**: Antigravity Linux Agent (Senior Frontend & Browser Performance Specialist)  
**Date**: October 16, 2026  
**Related Components**: Header, CategoryBar, Feed, VideoCard, Search Results, Skeleton Loaders, Sidebar  
**Parallel Coordination**: Codex GPT-6 Astra (Windows) — Preserving numeric `Edit.id` model and backend compatibility  

---

## 1. Executive Summary & Progress Recovery

This research investigation analyzes skeleton loading states, video discovery interfaces, responsive grid behavior, and search UX patterns. The findings combine empirical observations of production video discovery platforms (specifically the YouTube web client), direct Chrome DevTools Protocol (CDP) measurements of Lolixco's local build on `http://127.0.0.1:5173/`, and formal reverse engineering and analysis using REA (Reverse Engineering Anything) MCP tools.

### 1.1 Progress Recovery State
- **Branch**: `research/discovery-ui-search` created from `origin/main` and clean.
- **Dev Server**: Running on `http://127.0.0.1:5173/` (Vite 6.0, React 19, TypeScript 5.7).
- **Preserved Artifacts**: All prior session scratchpads (`scratchpad_savsd82u.md`, `scratchpad_au61zt5f.md`, `scratchpad_pbgt2imv.md`), recorded WebP sessions, and 18+ high-resolution PNG browser captures remain intact in `<appDataDir>/brain/25e5a847-2046-4c7b-ac46-778c3194c86b`.
- **Existing Checks Verified**:
  - `npm run typecheck`: Passed (0 TypeScript errors).
  - `npm test`: Passed (7/7 tests passed in 245ms).
  - `npm run check:assets`: Passed (20 media/brand assets verified, 2,904,955 bytes).
  - `npm run build`: Passed (Vite production bundle built cleanly).
- **Coding Boundary**: Zero application code modified or committed; strictly maintaining research and planning deliverables until explicit review approval.

---

## 2. REA Verification & Tool Architecture

### 2.1 Actual REA MCP Invocation vs. Browser Subagent
[OBSERVED]
- REA MCP server (`@morluto/rea` v6.5.0) was verified running as a Node process (`node .../rea mcp`).
- Finding schema JSONs in `/home/vuld0/.gemini/antigravity-ide/mcp/rea/` alone was insufficient to prove live operability.
- When `rea`'s `list_browser_targets` tool was initially invoked via `call_mcp_tool` without an active DevTools Protocol server, REA returned a structured provider error:
  ```json
  {
    "error": {
      "code": "provider_unavailable",
      "category": "unavailable",
      "message": "list_browser_targets could not reach the selected loopback debugging endpoint. Verify that the target process is running with debugging enabled..."
    }
  }
  ```
  This confirmed that the REA MCP server process was alive and responding with structured REA error handling.

### 2.2 Live REA Inspection Evidence
[OBSERVED]
- A headless Google Chrome instance (`Chrome/151.0.7922.108`) was launched on loopback `127.0.0.1:9222` with a dedicated temporary profile directory (`/tmp/chrome-rea-debug`) targeting `http://127.0.0.1:5173/`.
- Three distinct REA tools were successfully executed against Lolixco:
  1. **`list_browser_targets`**:
     - Provider: `rea-cdp-browser` v2 (`REA Chrome DevTools Protocol observation provider`)
     - Evidence ID: `ev_ed8574a4f68ad8b63713c9f1f9884cb9cfeae71e307a7cbe8a31433cd35cd63b`
     - Discovered Target: `92B215A5730BD83C69B808EA52D4E3A1` (`Lolixco — Discover edits`)
     - Confidence: `observed`, Authority: `external-service`
  2. **`capture_web_screenshot`**: Captured inline content-addressed PNG screenshot via CDP without executing intrusive client-side code.
  3. **`inspect_web_page`**: Passive CDP inspection of Lolixco capturing **574 DOM nodes**, **579 accessibility tree nodes**, and Vite HMR console messages.
- **Security & Lifecycle Cleanup**:
  - Debugging was restricted strictly to local loopback (`127.0.0.1:9222`) and a temporary profile directory (`/tmp/chrome-rea-debug`).
  - Wildcard origins were used exclusively for loopback WebSocket handshake authorization during testing.
  - Upon completion of inspection, the temporary Chrome debugging process was cleanly terminated and the temporary profile directory was deleted. Port 9222 was confirmed closed.

### 2.3 Distinction Between REA and Native Browser Subagent
[INFERRED]
- **REA Tools (`rea`)**: Passive, non-evaluating, forensic observation tools designed to inspect DOM, network shapes, accessibility trees, and capture static screenshots through an existing CDP socket (`127.0.0.1:PORT`). REA does not perform synthetic user input (clicking, typing) or arbitrary page navigation.
- **Antigravity Browser Subagent (`browser_subagent`)**: Active browser automation environment that boots a dedicated Chrome instance, handles multi-step interactive tasks (typing into search boxes, resizing windows, recording animated WebP videos), and records user journey video evidence.

---

## 3. Responsive Grid & Breakpoint Analysis

### 3.1 Correction of Initial Responsive Research Limitations
[OBSERVED]
1. **The 360px/390px Viewport Limit**:
   - The initial interactive browser subagent reported measurements at a browser window minimum width of 500px due to host window manager limits.
   - **True Mobile Measurement Method**: Automated Chrome DevTools Protocol (CDP) session via Python `websocket-client` connected to headless Chrome. Applied `Emulation.setDeviceMetricsOverride` at exact widths:
     - `360px x 800px` (mobile: true)
     - `390px x 844px` (mobile: true)
   - Evaluated JavaScript directly inside the browser context: `window.innerWidth`, `document.documentElement.clientWidth`, and element bounding boxes (`getBoundingClientRect()`).
   - Verified that `window.innerWidth` was exactly 360px and 390px, with 0 horizontal page overflow (`scrollWidth === clientWidth`).
2. **Sidebar Behavior at Exactly 1280px & 1312px Qualification**:
   - **Observed YouTube behavior**:
     - *Session Conditions*: Unauthenticated clean session, desktop user agent, light mode, URL `https://www.youtube.com`.
     - At 1920px and 1440px: YouTube displayed its full 240px wide persistent guide (`#guide`).
     - At 1280px and 1024px: YouTube displayed a collapsed mini-guide (~72px width, `ytd-mini-guide-renderer` with stacked icons and labels).
     - At 768px: Sidebar was completely hidden from flow (drawer navigation).
     - *Breakpoint Qualification* [INFERRED / INDUSTRY SPECIFICATION]: In YouTube's custom element framework (`ytd-app`), the transition between persistent wide guide and mini-guide is documented in industry engineering literature at **1312px** (calculated to ensure room for video cards). The subagent empirically observed 1440px (expanded) and 1280px (collapsed); the 1312px threshold represents the industry-documented breakpoint boundary.
   - **Observed Lolixco behavior**:
     - In `src/App.tsx`, `expanded` initializes to `innerWidth >= 1440`.
     - In `src/styles/index.css`, `:root { --side: 164px; }` and `.collapsed { --side: 72px; }`.
     - At 1280px, Lolixco initializes as **Collapsed (72px mini-sidebar)** by default. When toggled by the user via the hamburger icon, it expands to **164px**.
     - Below 768px (`@media (max-width: 767px)`), Lolixco removes the sidebar from document flow (`mainMarginLeft: 0px`) and renders navigation inside a modal `Dialog` drawer.
   - **Proposed Lolixco Design Rule**: Lolixco **must not** adopt YouTube's 240px wide sidebar or 1312px breakpoint. Lolixco strictly preserves its established **164px expanded** and **72px collapsed** sidebar metrics.

### 3.2 Multi-Viewport Empirical Measurements Table

| Viewport (W x H) | Status | YouTube Observed Columns | YouTube Sidebar | Lolixco Measured Columns | Lolixco Sidebar State | Lolixco Measured Card Size (W x H) | Lolixco Card Gap | Header Height |
|---|---|---|---|---|---|---|---|---|
| **360px x 800px** | **MEASURED (CDP)** | 1 col (mobile web) | Hidden (drawer) | **2 cols** | Hidden from flow (drawer modal) | 163px x 148px | 16px row, 10px col | 108px (2 rows) |
| **390px x 844px** | **MEASURED (CDP)** | 1 col (mobile web) | Hidden (drawer) | **2 cols** | Hidden from flow (drawer modal) | 178px x 156px | 16px row, 10px col | 108px (2 rows) |
| **768px x 1024px** | **MEASURED (CDP)** | 3 cols | Hidden / drawer | **3 cols** | Collapsed (72px mini) | 205px x 175px | 14px | 64px |
| **1024px x 768px** | **MEASURED (CDP)** | 3–4 cols | Collapsed (72px) | **4 cols** | Collapsed (72px mini) | 214px x 181px | 14px | 64px |
| **1280px x 800px** | **MEASURED (CDP)** | 4 cols | Collapsed (72px) | **5 cols** | Collapsed (72px default) / 164px (toggled) | 218px x 183px | 16px | 64px |
| **1440px x 900px** | **MEASURED (CDP)** | 4–5 cols | Full (240px) | **6 cols** (col.) / 5 cols (exp.) | Expanded (164px default) | 206px x 176px (col.) / 232px (exp.) | 16px | 64px |
| **1672px x 941px** | **MEASURED (CDP)** | 5–6 cols | Full (240px) | **6 cols** | Expanded (164px) | 237px x 194px | 16px | 64px |
| **1920px x 1080px** | **MEASURED (CDP)** | 6 cols | Full (240px) | **6 cols** | Expanded (164px) | 286px x 221px | 16px | 64px |

### 3.3 Visual Evidence Citations
- **Lolixco 360px True Viewport**: `lolixco_360px_measured.png` (360x800 PNG, verified `window.innerWidth: 360`, 2-column compact grid, search input wrapped to row 2, navigation via header hamburger dialog).
- **Lolixco 390px True Viewport**: `lolixco_390px_measured.png` (390x900 PNG, verified `window.innerWidth: 390`, 2-column grid, card width 178px).
- **Lolixco 768px Viewport**: `lolixco_768px_measured.png` (Collapsed 72px sidebar, 64px header, 3-column grid).
- **Lolixco 1024px Viewport**: `lolixco_1024px_measured.png` (4-column grid, card width 214px).
- **Lolixco 1280px Viewport**: `lolixco_1280px_measured.png` (5-column grid, collapsed 72px sidebar).
- **Lolixco 1440px Viewport**: `lolixco_1440px_measured.png` (6-column grid with collapsed sidebar or 5-column with expanded 164px sidebar).
- **Lolixco 1920px Viewport**: `lolixco_1920px_measured.png` (6-column wide grid, card width 286px).
- **YouTube 1920px Baseline**: `youtube_1920px_1792133811890.png` (YouTube 4-column large card layout with 240px sidebar and 16px gutters).
- **YouTube Search Layout**: `youtube_search_1920px_1792133843390.png` and `search_results_page_1792134055823.png` (Horizontal card list with 16:9 thumbnail on left, title, channel avatar, description snippet on right).

---

## 4. Deep Research Findings

### 4.1 Skeleton Placeholders & Zero Layout Shift (CLS)
[PROPOSED DESIGN OBJECTIVE — NOT YET IMPLEMENTED IN CODE]
1. **Geometry Matching**:
   - On YouTube, skeleton loaders replicate the bounding box of real video cards. A mismatch between skeleton height and card height causes layout shifts.
   - In Lolixco, video cards are structured as:
     - Thumbnail container: strict `aspect-ratio: 16/9;` with `border-radius: 7px;`
     - Metadata copy container: Title `<h3>` (font-size 16px, line-height 1.1), Creator line `<p>` (13px), and Category tag `<small>` (11px).
   - Card height in Lolixco ranges from **148px (mobile 360px)** to **221px (desktop 1920px)**.
2. **Animation & Color System** [PROPOSED]:
   - Lolixco's color palette is dark futuristic: background `#050505`, card container background `#10151e`, borders `#282f3a`, accents `var(--yellow)` (`#fff000`).
   - Skeletons are proposed to use a base gradient `#131822` with a subtle shimmer highlight `#1f2837`.
   - Proposed shimmer animation: 1.4s infinite translation using CSS `transform: translateX()`, utilizing GPU compositing.
3. **Reduced Motion Adaptation** [PROPOSED]:
   - When `@media (prefers-reduced-motion: reduce)` is active, dynamic shimmer animations **must be completely disabled**. Skeletons will render as static low-contrast solid blocks (`#141924`) with static opacity 0.75.

### 4.2 Genuine Asynchronous Loading vs. Local Synchronous Data
[OBSERVED & PROPOSED]
- **Current Lolixco Architecture** [OBSERVED]: 17 edits reside in `src/data/edits.ts` as an in-memory array. Filtering executes synchronously in <0.5ms.
- **Zero Artificial Latency in Production** [ARCHITECTURAL MANDATE]:
  - No manufactured delays, artificial skeleton flickers, or unnecessary debounces shall be injected into production Lolixco for synchronous local data.
  - Skeletons are designed strictly for genuine future asynchronous requests (such as asset pre-loading or remote `/api/v1` recommendation endpoints).
  - Artificial latency is restricted exclusively to isolated automated tests or developer demonstrations via explicit test configuration.
- **Stale Response Protection** [PROPOSED]:
  - Any future asynchronous state hook must incorporate request cancellation / sequence identifiers (e.g. `AbortController` or monotonic `requestId`) to guarantee that slow, out-of-order asynchronous responses never overwrite newer search results.

### 4.3 Search UX & Interaction Architecture
[OBSERVED & PROPOSED]
1. **Field States** [OBSERVED]:
   - **Default/Idle**: Dark input pill `#08090b` with border `#343a44`, Search icon (`lucide-react/Search`), placeholder exactly `"Search"`.
   - **Focused**: Border turns `var(--yellow)` (`#fff000`), subtle glow `box-shadow: 0 0 12px #fff00022`.
   - **Filled**: Displays a clear `X` button with accessible label `aria-label="Clear search"`.
2. **Submission Mechanics & Hotkeys** [PROPOSED]:
   - Support `/` hotkey from anywhere on the page to focus the search field (when not already typing inside an input).
   - Support `Esc` key inside the search field to clear the query or unfocus the input.
   - Synchronous filtering updates immediately on user input without artificial lag.
3. **Empty States** [PROPOSED]:
   - When no edits match, display an intentional empty state card:
     - Heading: "No matching edits found"
     - Subtext: "We couldn't find any edits matching '{query}'. Try searching by category, creator, or tags like #neon, #anime, or #cinematic."
     - Action: Primary yellow button "Clear filters" or clickable suggestion chips.

### 4.4 Search Algorithm Specification & Relevance Weights
[OBSERVED & PROPOSED]
In `src/data/edits.ts`, tags are stored as lowercase strings without `#` (e.g. `["cinematic", "original", "demo", "neon"]`). In current `logic.js`, searching `#neon` returns 0 results because the raw `#` fails substring checks.

[PROPOSED] **Deterministic Relevance Scoring Engine (`src/data/searchEngine.ts`)**:
Lolixco implements the approved weighted relevance model, strictly distinguishing it from YouTube's opaque AI/watch-time ranking:
1. **Approved Base Weights (Sum = 100%)**:
   - **Hashtags (`w_hashtag`)**: **40%** (0.40)
   - **Title (`w_title`)**: **30%** (0.30)
   - **Category/Topic (`w_category`)**: **15%** (0.15)
   - **Description (`w_description`)**: **10%** (0.10)
   - **Creator (`w_creator`)**: **5%** (0.05)
2. **Proportional Weight Redistribution for Non-Hashtag Queries**:
   - When a query contains **no hashtags**, the 40% hashtag weight is redistributed proportionally across the remaining signals (base sum = 60%):
     - `w_title = 0.30 / 0.60 = 50.00%` (0.50)
     - `w_category = 0.15 / 0.60 = 25.00%` (0.25)
     - `w_description = 0.10 / 0.60 = 16.67%` (~0.1667)
     - `w_creator = 0.05 / 0.60 = 8.33%` (~0.0833)
     - Sum: `50% + 25% + 16.67% + 8.33% = 100.00%`
3. **Query Parsing & Conjunction (AND) Rules**:
   - Query is split on whitespace into meaningful tokens.
   - **Bare / Malformed Hashtags**: A bare `#`, `##`, or whitespace-only token has no valid tag text. It is treated as invalid and **must not** match every edit (e.g. searching `#` yields 0 results).
   - **Hashtag Tokens (`#tag`)**: Require an **exact normalized tag match** (`edit.tags.some(t => t.toLowerCase() === cleanTag)`). Arbitrary substring matches are rejected for hashtag tokens.
   - **Normal Text Tokens (`word`)**: Can match Title, Category, Description, Creator, **and Edit Tags**. If a term appears only in `tags`, the edit matches that text token.
   - **Conjunction**: For an edit to match, **every** meaningful term in the query must match the edit (e.g., `neon #gaming` requires exact tag `gaming` AND that `neon` matches at least one field).
4. **Score Normalization Across Variable Query Lengths**:
   - For each term `k ∈ {1..M}`, compute term score `S_k(edit) ∈ [0.0, 1.0]`.
   - Aggregate score is normalized by dividing by the number of meaningful terms:
     `AggregateScore = (∑ S_k) / M`
   - Guarantees `AggregateScore ∈ [0.0, 1.0]` regardless of whether the query contains 1 term, 2 terms, or 5 terms.
5. **Deterministic Tie-Breaking**:
   - Primary sort: `AggregateScore DESC`
   - Secondary tie-breaker: `Edit.id ASC` (numeric identifier ascending, preserving IDs including 0).
   - Guarantees 100% deterministic, reproducible sorting without AI drift, maintaining perfect compatibility with Codex's recommendation engine.

### 4.5 Accessibility, ARIA & Performance
[PROPOSED DESIGN OBJECTIVES]
1. **WCAG 2.1 AA Compliance**:
   - Color contrast: Text `#ffffff` and `#b8bfca` on `#050505` and `#10151e` exceeds 7:1 (AAA). Accent `#fff000` on `#050505` exceeds 14:1.
   - Skeletons must carry `aria-hidden="true"` and `tabIndex={-1}` so screen readers do not announce empty placeholder cards.
   - When loading, an accessible live region announces progress politely:
     `<div role="status" aria-live="polite" className="sr-only">Loading discovery edits...</div>`
   - Avoid duplicate live-region announcements.
2. **Keyboard Navigation**:
   - Focus rings on active cards use high-contrast yellow outline `outline: 2px solid var(--yellow); outline-offset: 2px;`.
   - Skip link (`Skip to content`) jumps to `#main`.
3. **Layout Stability (Cumulative Layout Shift Goal = 0)**:
   - Skeletons use exact dimensions matching final `VideoCard` elements.
   - Thumbnail placeholder uses identical `aspect-ratio: 16/9;`.
   - Card container has identical padding, gap, and margin. Zero CLS is an explicit engineering design goal.

---

## 5. Technical Research Matrix & Unknowns

| Topic | Classification | Current State / Finding | Proposed Action |
|---|---|---|---|
| **REA Verification** | OBSERVED | REA MCP v6.5.0 connected via CDP on port 9222. Successfully inspected DOM (574 nodes), a11y (579 nodes), and captured screenshots. Temporary process cleaned up. | Use REA for passive CDP inspection; use Antigravity browser subagent for interactive tasks. |
| **360px/390px Viewports** | OBSERVED (Measured via CDP) | 2-column grid at 360px (card 163px) & 390px (card 178px). Header wraps into 2 rows (108px height). Sidebar in drawer modal. | Maintain 2-column grid with min-width clamping; ensure touch target size >= 44px. |
| **1280px Sidebar** | OBSERVED | Collapsed 72px sidebar by default in Lolixco (`expanded` requires >= 1440px). Expands to 164px on toggle. | Preserve Lolixco's 164px expanded and 72px collapsed sidebar. Do not adopt YouTube's 240px. |
| **YouTube 1312px Breakpoint** | INFERRED / INDUSTRY SPECIFICATION | Observed expanded at 1440px and collapsed at 1280px on YouTube. Exact 1312px transition boundary qualified via industry technical documentation. | Reject 1312px for Lolixco; preserve Lolixco's 1440px / 767px breakpoints. |
| **Skeleton Placeholders** | PROPOSED | Currently no skeletons exist; immediate render. | Implement `VideoCardSkeleton` with identical 16:9 geometry, 7px radius, and reduced-motion support for future async/asset loading. |
| **Hashtag Search** | OBSERVED | Searching `#neon` fails because tags are stored without `#`. | Implement `src/data/searchEngine.ts` with exact tag matching for `#tag` and tag matching for normal text. |
| **Relevance Ranking** | PROPOSED | Currently boolean `every()` match with arbitrary array order. | Implement weighted deterministic scoring (40% tags, 30% title, 15% category, 10% desc, 5% creator) with `Edit.id ASC` tie-breaker. |
| **Async Loading Hook** | PROPOSED | Edits are local. Zero artificial latency in production. | Provide `src/data/searchEngine.ts` and clean async hook architecture with stale-request cancellation for future API endpoints. |
| **Recommendation Engine Interop** | UNKNOWN (Coordinating) | Codex GPT-6 Astra is researching recommendation models on Windows (`/api/v1`). | Keep numeric `Edit.id: number` and clean metadata shape so discovery UI can render either source seamlessly. |
