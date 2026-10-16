# Lolixco Discovery UI, Skeleton Loading & Search UX — Implementation Plan

**Document Status**: COMPLETED PLAN (Revised following review; awaiting final authorization prior to frontend coding)  
**Branch**: `research/discovery-ui-search`  
**Author**: Antigravity Linux Agent (Senior Frontend Specialist)  
**Collaborator Role**: Codex GPT-6 Astra (Windows) — Recommendation Research & Future Backend Integration  
**Date**: October 16, 2026  

---

## 1. Architectural Guardrails & Principles

1. **Strict Review Boundary**: No application source code is committed, pushed, or deployed until this plan is formally approved.
2. **Numeric ID Model & Data Preservation**: 
   - The `Edit.id: number` contract (including ID `0`) must remain completely intact.
   - All existing `Edit` fields (`id`, `title`, `category`, `tags`, `description`, `creator`, `poster`, `source`, `duration`, `trending`) are strictly preserved.
   - All local media fixtures and Vite base-path asset handling must remain intact.
3. **Lolixco Design Identity & Layout Integrity**: 
   - Preserve Lolixco's unique sidebar geometry: **164px expanded** (`:root { --side: 164px; }`) and **72px collapsed** (`.collapsed { --side: 72px; }`). Under no circumstances copy YouTube's 240px sidebar width.
   - Preserve search placeholder string exactly as `"Search"`.
   - Preserve Featured video, Up Next, category chips, Immersion banner, and guest/member preview behavior.
   - Retain Lolixco's futuristic dark aesthetic: base `#050505`, card background `#10151e`, borders `#282f3a`, brand yellow `var(--yellow)` (`#fff000`).
   - Video playback, mute, seeking, and A–B loop functionality must remain completely regression-free. Sidebar reflow must not trigger video element restarts.
   - **No Band-Aid Overflows**: Do not globally apply `overflow-x: hidden` to root/body as a substitute for fixing layout defects. Every viewport must be intrinsically defect-free.
   - Do not add TailwindCSS or modify backend files.
4. **Zero Artificial Latency in Production**:
   - Local in-memory edits and synchronous filtering must display immediately without manufactured delays or unnecessary debounces.
   - Skeleton loading components are designed for genuine future asynchronous requests and media asset loading.
   - Artificial latency may be injected only through clearly isolated tests or development demonstrations via optional configuration parameters (`simulateDelayMs?: number`, defaulted to 0).
5. **Zero Cumulative Layout Shift (CLS Goal = 0) [PROPOSED]**:
   - Skeletons must closely mirror the final rendered card dimensions (16:9 thumbnail ratio, exact title/creator line heights, identical grid gap). Zero CLS is an explicit engineering design goal.
6. **Parallel Recommendation System Compatibility**:
   - Codex's proposed recommendation service operates via versioned `/api/v1` endpoints utilizing the existing numeric `Edit.id`.
   - No backend integration is authorized during this frontend mission.
   - Local frontend discovery and search must function 100% independently of any external API or backend service.

---

## 2. Component Specifications

### 2.1 `VideoCardSkeleton` [PROPOSED]
- **Location**: `src/components/home/VideoCardSkeleton.tsx`
- **Props**:
  - `compact?: boolean` (matches `VideoCard` compact mode in Up Next)
- **DOM Structure**:
  ```tsx
  <div 
    className={`video-card skeleton-card ${compact ? "compact" : ""}`} 
    aria-hidden="true"
    tabIndex={-1}
  >
    <div className="thumbnail skeleton-thumb">
      <div className="skeleton-shimmer" />
    </div>
    <div className="card-copy skeleton-copy">
      <div className="skeleton-line skeleton-title" />
      <div className="skeleton-line skeleton-creator" />
      <div className="skeleton-line skeleton-tag" />
    </div>
  </div>
  ```
- **CSS Styling (`src/styles/index.css`) [PROPOSED]**:
  - Base placeholder color: `#131822`
  - Shimmer highlight: `#1f2837`
  - Linear gradient background animation: `translateX(-100%)` to `translateX(100%)` over 1.4s infinite ease-in-out.
  - `@media (prefers-reduced-motion: reduce)`: Shimmer animation completely removed; renders static `#141924` placeholder with static opacity 0.75.
  - `pointer-events: none; user-select: none;`

### 2.2 `DiscoveryGridSkeleton` [PROPOSED]
- **Location**: `src/components/home/DiscoveryGridSkeleton.tsx`
- **Props**:
  - `count?: number` (defaults to 8 cards, dynamically matching viewport capacity)
  - `compact?: boolean`
- **Accessibility**:
  ```tsx
  <div 
    className="video-grid" 
    role="status" 
    aria-busy="true" 
    aria-label="Loading video edits"
  >
    <span className="sr-only">Loading discovery edits...</span>
    {Array.from({ length: count }).map((_, i) => (
      <VideoCardSkeleton key={`skeleton-${i}`} compact={compact} />
    ))}
  </div>
  ```
  - *Accessibility Note*: Uses a single polite live announcement without duplicate status messages.

### 2.3 `SearchResultsSection` [PROPOSED]
- **Location**: `src/components/search/SearchResultsSection.tsx`
- **States**:
  - **Loading**: Renders `DiscoveryGridSkeleton` with active `aria-busy="true"`.
  - **Results Present**: Renders search results title, result count badge (`<span>{count} sample edits</span>`), and `VideoCard` grid sorted by deterministic score.
  - **Empty State**: Renders accessible empty state with:
    - Title: "No matching edits found"
    - Explanatory copy: "We couldn't find any edits matching '{query}'. Try searching by category, creator, or tags like #neon, #anime, or #cinematic."
    - "Clear filters" primary button (resets query and returns to Featured).
    - Suggested quick-tag filter chips.

---

## 3. Search Engine & Relevance Algorithm Specification

### 3.1 Architecture: Standalone `src/data/searchEngine.ts`
- Implementation lives in a standalone TypeScript module: `src/data/searchEngine.ts`.
- `src/data/logic.js` maintains its existing `matches()` export to ensure backwards compatibility with legacy callers.
- Unit tests will directly exercise `src/data/searchEngine.ts`.

### 3.2 Approved Relevance Weights & Dynamic Redistribution [PROPOSED]
1. **Base Weights (Query Contains One or More Hashtags)**:
   - **Hashtags (`w_hashtag`)**: **40%** (0.40)
   - **Title (`w_title`)**: **30%** (0.30)
   - **Category/Topic (`w_category`)**: **15%** (0.15)
   - **Description (`w_description`)**: **10%** (0.10)
   - **Creator (`w_creator`)**: **5%** (0.05)
   - *Sum*: `0.40 + 0.30 + 0.15 + 0.10 + 0.05 = 1.00 (100%)`

2. **Proportional Weight Redistribution (Query Contains No Hashtags)**:
   When no hashtags are present in the query, the 40% hashtag weight is redistributed proportionally across the remaining signals (base sum = 60%):
   - `w_title = 0.30 / 0.60 = 50.00%` (0.50)
   - `w_category = 0.15 / 0.60 = 25.00%` (0.25)
   - `w_description = 0.10 / 0.60 = 16.67%` (~0.1667)
   - `w_creator = 0.05 / 0.60 = 8.33%` (~0.0833)
   - *Sum*: `50% + 25% + 16.67% + 8.33% = 100.00%`

3. **Query Parsing & Conjunction (AND) Rules**:
   - Query is split on whitespace into meaningful tokens: `rawTerms = query.trim().split(/\s+/).filter(Boolean)`.
   - **Bare / Malformed Hashtags**: A bare `#`, `##`, or token containing only hashes and whitespace has no clean tag characters (`cleanTag === ""`). It is rejected and **must not** match every edit (e.g. querying `#` yields 0 results).
   - **Hashtag Tokens (`#tag`)**: Requires an **exact normalized tag match** against `edit.tags` (`edit.tags.some(t => t.toLowerCase() === cleanTag)`). Arbitrary substring matches are rejected for hashtag tokens.
   - **Normal Text Tokens (`word`)**: Can match Title, Category, Description, Creator, **and Edit Tags**. If a term appears only in `tags`, the edit matches that text token (`q_tags > 0`).
   - **Conjunction**: For an edit to match, **every** meaningful term in the query must match the edit (e.g., `neon #gaming` requires exact tag `gaming` AND that `neon` matches at least one field).
   - **Multiple Hashtags**: Fully supported (e.g. `#neon #gaming` requires both `neon` and `gaming` in `edit.tags`).

4. **Score Normalization Across Query Lengths**:
   - For each term `k ∈ {1..M}`, compute term score `S_k(edit) ∈ [0.0, 1.0]`.
   - Aggregate score is normalized by dividing by the number of meaningful terms:
     `AggregateScore = (∑ S_k) / M`
   - Guarantees `AggregateScore ∈ [0.0, 1.0]` regardless of whether the query contains 1 term, 2 terms, or 5 terms.

5. **Deterministic Tie-Breaking**:
   - Primary sort: `AggregateScore DESC`
   - Secondary tie-breaker: `Edit.id ASC` (numeric identifier ascending, preserving IDs including 0).

### 3.3 Implementation Blueprint (`src/data/searchEngine.ts`) [PROPOSED]
```typescript
import type { Edit } from "./edits";

export interface ParsedTerm {
  raw: string;
  clean: string;
  isHashtag: boolean;
}

export function parseQuery(query: string): ParsedTerm[] {
  return query
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(term => {
      const isHashtag = term.startsWith("#");
      const clean = isHashtag ? term.replace(/^#+/, "").toLowerCase() : term.toLowerCase();
      return { raw: term, clean, isHashtag };
    });
}

function matchQuality(source: string, token: string): number {
  const s = source.toLowerCase();
  if (s === token) return 1.0;
  if (s.split(/\s+/).some(w => w === token)) return 0.9;
  if (s.startsWith(token)) return 0.7;
  if (s.includes(token)) return 0.4;
  return 0.0;
}

export function searchEdits(
  allEdits: Edit[],
  query: string,
  category: string
): Edit[] {
  const terms = parseQuery(query);

  // Fast path: Empty query returns category-filtered edits
  if (terms.length === 0) {
    const base = ["Featured", "New"].includes(category)
      ? allEdits
      : category === "Trending"
        ? allEdits.filter(e => e.trending)
        : allEdits.filter(e => e.category === category);
    return category === "New" ? [...base].reverse() : base;
  }

  // Bare / malformed hashtag check: if all terms were bare hashes, return 0 results
  if (terms.some(t => t.clean === "")) {
    return [];
  }

  const hasHashtags = terms.some(t => t.isHashtag);
  const weights = hasHashtags
    ? { hashtag: 0.40, title: 0.30, category: 0.15, description: 0.10, creator: 0.05 }
    : { hashtag: 0.00, title: 0.50, category: 0.25, description: 0.1667, creator: 0.0833 };

  const matched: { edit: Edit; score: number }[] = [];

  for (const edit of allEdits) {
    // 1. Category Filter Intersection
    const passesCategory =
      ["Featured", "New"].includes(category) ||
      (category === "Trending" ? edit.trending : edit.category === category);
    if (!passesCategory) continue;

    let termScoresSum = 0;
    let matchesAllTerms = true;

    for (const { clean, isHashtag } of terms) {
      if (isHashtag) {
        // Exact tag match required for hashtag tokens
        const hasExactTag = edit.tags.some(t => t.toLowerCase() === clean);
        if (!hasExactTag) {
          matchesAllTerms = false;
          break;
        }
        // Score for hashtag token
        const qTitle = matchQuality(edit.title, clean);
        const qCat = matchQuality(edit.category, clean);
        const qDesc = matchQuality(edit.description, clean);
        const qCreator = matchQuality(edit.creator, clean);
        const tokenScore =
          weights.hashtag * 1.0 +
          weights.title * qTitle +
          weights.category * qCat +
          weights.description * qDesc +
          weights.creator * qCreator;
        termScoresSum += tokenScore;
      } else {
        // Normal text search: checks Title, Category, Desc, Creator, AND Tags
        const qTitle = matchQuality(edit.title, clean);
        const qCat = matchQuality(edit.category, clean);
        const qDesc = matchQuality(edit.description, clean);
        const qCreator = matchQuality(edit.creator, clean);
        
        // Tag match quality for normal text search
        let qTag = 0;
        for (const tag of edit.tags) {
          const q = matchQuality(tag, clean);
          if (q > qTag) qTag = q;
        }

        const maxFieldQuality = Math.max(qTitle, qCat, qDesc, qCreator, qTag);
        if (maxFieldQuality === 0) {
          matchesAllTerms = false;
          break;
        }

        const tokenScore = hasHashtags
          ? weights.hashtag * qTag +
            weights.title * qTitle +
            weights.category * qCat +
            weights.description * qDesc +
            weights.creator * qCreator
          : weights.title * qTitle +
            weights.category * qCat +
            weights.description * qDesc +
            weights.creator * qCreator +
            0.15 * qTag; // Normal text matching tags receives tag signal
        termScoresSum += Math.min(tokenScore, 1.0);
      }
    }

    if (matchesAllTerms) {
      const normalizedScore = termScoresSum / terms.length;
      matched.push({ edit, score: normalizedScore });
    }
  }

  // Deterministic Sort: Primary = Score DESC, Secondary = Edit.id ASC
  matched.sort((a, b) => b.score - a.score || a.edit.id - b.edit.id);

  return matched.map(m => m.edit);
}
```

---

## 4. Phase-by-Phase Implementation Plan

### Phase 1: Search & Logic Layer Implementation
- **Files**: Create `src/data/searchEngine.ts`; preserve and re-export compatibility helper from `src/data/logic.js`.
- **Unit Tests**: Create `tests/search.test.mjs` exercising `src/data/searchEngine.ts` directly:
  - Exact hashtag match: `#neon` matches only edits containing exact tag `"neon"`.
  - Non-hashtag text matching tags: Term `"neon"` matches edits tagged with `"neon"`, even if not in title.
  - Multiple hashtags: `#neon #gaming` requires both tags.
  - Bare hashtag safety: `#`, `##` returns 0 results.
  - Mixed query: `neon #gaming` requires both the tag and the text term.
  - Score normalization: 1-term vs 3-term queries both yield aggregate scores in `[0.0, 1.0]`.
  - Deterministic tie-breaking: Identically scored edits sort by `id ASC`.
  - Category filters: Category selection properly intersects with search.

### Phase 2: Skeleton Placeholder Components & Styling
- **Files**: Create `src/components/home/VideoCardSkeleton.tsx` and `src/components/home/DiscoveryGridSkeleton.tsx`.
- **CSS**: Add `.skeleton-card`, `.skeleton-thumb`, `.skeleton-shimmer`, `.skeleton-line` to `src/styles/index.css`.
- **Validation**: Verify 16:9 thumbnail ratio, card height matching (148px at 360px up to 221px at 1920px), and `@media (prefers-reduced-motion: reduce)` static fallback.

### Phase 3: Feed Integration & Asynchronous State Hook
- **Files**: Create `src/hooks/useDiscoveryFeed.ts`.
- **Rules**:
  - Immediate synchronous rendering for production in-memory edits (zero artificial delay).
  - Out-of-order request protection: Uses an internal `requestId` sequence to discard stale responses.
  - Development demonstration mode: Optional `simulateDelayMs?: number` (default 0) strictly isolated from production.

### Phase 4: Header Search UX & Keyboard Interaction
- **Files**: Update `src/components/layout/Header.tsx`.
- **Rules**:
  - Search placeholder string exactly `"Search"`.
  - Add `/` global hotkey to focus search field (ignoring when already inside an input/textarea).
  - Add `Esc` hotkey to clear query or unfocus.
  - Form semantics: Wrap input in `<form role="search">` preventing accidental page reloads.

### Phase 5: Multi-Viewport Responsive Alignment
- **Targets**: 360x800, 390x844, 768x1024, 1024x768, 1280x800, 1440x900, 1672x941, 1920x1080.
- **Rules**:
  - Preserve 164px expanded and 72px collapsed sidebar.
  - Mobile: 2-column grid, 108px wrapped header, sidebar inside modal drawer.
  - Verify zero horizontal page overflow without global `overflow-x: hidden`.
  - Verify that sidebar collapse/expand reflow does not restart active video playback.

### Phase 6: Accessibility Auditing
- **Rules**:
  - All skeleton placeholders marked `aria-hidden="true"` and `tabIndex={-1}`.
  - Single polite live region announcement when loading: `<div role="status" aria-live="polite" className="sr-only">`.
  - Card focus rings use high-contrast yellow outline (`outline: 2px solid var(--yellow); outline-offset: 2px;`).

### Phase 7: Comprehensive Verification Suite
- **Commands**:
  1. `npm run check:assets` (or `pnpm check:assets`)
  2. `npm run typecheck` (or `pnpm typecheck`)
  3. `npm test` (or `pnpm test`)
  4. `npm run build` (or `pnpm build`)
  5. Multi-viewport browser screenshot checks at 360, 390, 768, 1024, 1280, 1440, 1672, and 1920px.

---

## 5. Parallel Recommendation System Adapter Interface [FUTURE]
Codex's recommendation service will expose versioned `/api/v1` recommendations utilizing the existing numeric `Edit.id`. When backend integration is authorized in a future task, `src/data/searchEngine.ts` will provide an adapter interface:
```typescript
export interface RecommendationAdapter {
  fetchRecommendedEdits(editId: number): Promise<Edit[]>;
}
```
No backend integration or contract changes will occur during this frontend discovery mission.
