# REA Independent Research Findings: Video Recommendation Systems

**Author:** Antigravity (Linux) — Lead Recommendation Systems Engineer  
**Date:** 2026-10-16  
**Status:** Completed Independent Investigation  
**Branch:** `feat/recsys-baseline`  
**Base:** `origin/main` at `174d01a89d1f83f47f4279b7e62ca2babdb1f294`

---

## 1. Research Protocol & Evidence Standards

In accordance with rigorous empirical engineering standards, every assertion in this document is tagged with one of four explicit evidence classifications:

- **[OBSERVED]:** Directly inspected and verified through live browser inspection via REA / DevTools automation. Steps, dates, URLs, and observable states are recorded.
- **[DOCUMENTED]:** Supported by peer-reviewed published academic literature, industry engineering papers, or official API/platform documentation.
- **[INFERRED]:** Logical deduction and engineering interpretation derived from observed UI states, system behavior, and domain theory.
- **[UNKNOWN]:** Proprietary internal systems, server-side weights, private user embeddings, or runtime heuristics that cannot be verified externally.

---

## 2. Research 1: YouTube Home & Guest Cold-Start

### 2.1 Live Observation Protocol
- **Observation Date:** 2026-10-16
- **Environment:** Clean incognito/guest browser context, zero local storage, zero cookies, no account sign-in.
- **URL:** `https://www.youtube.com/`

### 2.2 Findings
1. **Zero-History Guest Home State [OBSERVED]:**
   - In a completely clean guest session without search or watch history, YouTube displays a centered onboarding card:
     > *"Try searching to get started. Start watching videos to help us build a feed of videos that you'll love."*
   - YouTube no longer displays an unseeded default matrix of trending videos on the root home URL for unauthenticated users with zero cookies.
   - The primary navigation sidebar displays Explore category anchors: *Trending*, *Music*, *Movies & TV*, *Live*, *Gaming*, *News*, *Sports*.

2. **Topic Seeding Mechanism [INFERRED]:**
   - Once a single video or search interaction occurs within the session, the home feed transitions immediately from the empty onboarding state into a topic-seeded feed.
   - The first interaction sets the dominant category and semantic cluster for subsequent home page renders.

3. **Relevance for Lolixco [INFERRED]:**
   - While YouTube can afford to present a search prompt to new visitors because of its massive search utility, Lolixco is a focused 17-item creative motion study showcase. Presenting an empty home screen or search-only prompt on first visit would severely degrade user engagement.
   - **Lolixco Adaptation:** In cold-start (zero session history, no active video), Lolixco must generate a **deterministic, category-balanced discovery feed** spanning all six canonical categories (*Cinematic*, *Gaming*, *Anime*, *Movies*, *Series*, *Phonk*), ensuring equal representation across the initial viewport.

---

## 3. Research 2: Watch Next / Up Next Recommendations

### 3.1 Live Observation Protocol
- **Observation Date:** 2026-10-16
- **Environment:** Public watch page, guest session.
- **URL Inspected:** `https://www.youtube.com/watch?v=Lsg83Sv88VM` (*"Spring - Blender Open Movie"*, Creator: *Blender Studio*, Duration: 7:44, Topic: 3D Open Source Computer Animation).

### 3.2 Findings
1. **Candidate Relationship Breakdown [OBSERVED]:**
   The secondary sidebar contained the following top recommended items:
   1. *The Great Cotton Swab Battle* (Minuscule) — 3D/CGI animated short film.
   2. *Le Gouffre* (CGMeetup) — 3D animated CGI drama short.
   3. *CHARGE - Blender Open Movie* (Blender Studio) — Exact same creator, same open-movie pipeline.
   4. *FOREVERGREEN* (Evergreen Film) — 3D animated fantasy short.
   5. *SNOW BEAR* (The Art of Aaron Blaise) — Hand-drawn animation short.
   6. *Treehouse* (Tongji D&I) — Student animated graduation film.
   7. *Overwatch Animated Short | "The Last Bastion"* (PlayOverwatch) — Cinematic game CGI.

2. **Structural & Diversity Patterns [OBSERVED]:**
   - **Strict Active-Video Suppression [OBSERVED]:** The currently playing video (*Spring*) was strictly absent from the recommendation sidebar.
   - **Thematic Coherence [OBSERVED]:** 100% of the top 7 suggestions belonged to the broader creative genre of *Animated Short Films / CGI Cinematics*.
   - **Creator Diversity Mix [OBSERVED]:** The current creator (*Blender Studio*) appeared exactly once in the top 7 (at position #3), while the remaining 6 items were from distinct creative studios. YouTube did not monopolize the sidebar with Blender Studio videos despite high channel affinity.
   - **Topic Filter Chips [OBSERVED]:** Horizontal chips above the related video column allowed user-driven pivots: *"All"*, *"From Blender Studio"*, *"Related"*, *"Recently uploaded"*.

3. **Relevance for Lolixco [INFERRED]:**
   - Up Next must be anchored strongly by **category match** and **semantic tag similarity**.
   - Active video suppression is mandatory.
   - In Lolixco's production scenario, creator throttling (max 2 consecutive items per creator) is vital to prevent feed capture. However, because the current fixture catalog has only *one* creator (`"Lolixco demo"`), the engine must gracefully relax this constraint and emit diagnostic telemetry rather than truncating the feed.

---

## 4. Research 3: Recommendation Systems Engineering Literature

### 4.1 Foundational Literature Citations
1. **Covington, Adams, Sargin (Google / YouTube, RecSys 2016) [DOCUMENTED]:**
   - *Architecture:* Deep neural candidate generation (extreme multiclass classification via negative sampling) followed by a deep ranking network.
   - *Objective:* Optimizing expected watch time rather than Click-Through Rate (CTR). Click-through rate optimization produces clickbait traps where users bounce after seconds. By weighting positive examples by continuous watch time in a weighted logistic regression formulation, the model learns to prioritize high-engagement content.
   - *Freshness:* Age of video continuously injected as an explicit feature during training and fixed to zero at inference to counteract historical recency bias.
2. **Yi et al. (Google, RecSys 2019) [DOCUMENTED]:**
   - Two-tower neural architectures for industrial retrieval: user tower $\mathbf{u}(x)$ and candidate tower $\mathbf{v}(y)$ combined via dot product $\langle \mathbf{u}, \mathbf{v} \rangle$.
3. **Zhao et al. (Google / YouTube, RecSys 2019) [DOCUMENTED]:**
   - Multi-gate Mixture-of-Experts (MMoE) to balance competing objectives (engagement: clicks, watch time vs. satisfaction: likes, survey responses, shares).
4. **Krichene et al. (Google, 2020) [DOCUMENTED]:**
   - Evaluation methodologies under selection bias and position bias.
5. **Steck (Netflix, 2018) [DOCUMENTED]:**
   - Calibrated recommendations: balancing user preference distribution across genres against item relevance.

### 4.2 Proprietary / Non-Verifiable Mechanics [UNKNOWN]
- YouTube's exact multi-task utility function weights.
- Internal user embedding dimensions and vector quantization indexes.
- Proprietary real-time abuse / clickbait classifiers.
- Dynamic exploration bandit exploitation rates.

---

## 5. Critical Review & Refinement of Codex's Proposed Architecture

Codex's handoff documents ([`RECOMMENDATION_RESEARCH.md`](RECOMMENDATION_RESEARCH.md) and [`API_PROPOSAL.md`](API_PROPOSAL.md)) provide a solid theoretical overview of the YouTube two-tower paradigm. However, when evaluated against Lolixco's actual repository constraints, several critical assumptions fail and require redesign:

### 5.1 Agreement Areas
1. **Two-Stage Mental Model:** Separating candidate eligibility / filtering from scoring and diversity reranking.
2. **Watch-Time Optimization vs. Clickbait:** Rejecting pure CTR in favor of expected watch time.
3. **Strict Invariant Preservation:** Maintaining numeric `Edit.id` integer preservation, specifically ensuring ID `0` is never lost to truthiness checks.
4. **Explicit Reason Codes:** Returning structured diagnostic codes (`category_match`, `tag_similarity`, `category_balance`, `cold_start`) instead of opaque scores.

### 5.2 Disagreements & Engineering Redesigns

#### Issue A: Stopword & Generic Tag Inflation
- **Codex Assumption:** Raw Jaccard tag similarity $T(i, c) = \frac{|\text{tags}(i) \cap \text{tags}(c)|}{|\text{tags}(i) \cup \text{tags}(c)|}$.
- **Flaw in Real Catalog:** In [`src/data/edits.ts`](file:///home/vuld0/Lolixco/src/data/edits.ts), *every single edit* contains the tags `["original", "demo"]` and one of `["neon", "landscape"]`. Under standard Jaccard, two completely unrelated edits (e.g. an Anime edit and a Phonk edit) share 2 or 3 common tags, resulting in artificially high similarity ($2/6 \approx 0.33$).
- **Lolixco Stage 1 Redesign:** Implement **IDF-weighted (Inverse Document Frequency) tag similarity** or explicit **stopword tag discounting**. Tags appearing across $\ge 50\%$ of the catalog (such as `demo` and `original`) have their weights discounted, giving decisive weight to distinctive tags (e.g. `anime`, `phonk`, `cinematic`).

#### Issue B: Phantom Freshness and Quality Signals
- **Codex Assumption:** Scoring formula $\text{Score} = 0.40 C + 0.30 T + 0.15 F + 0.15 Q$, where $F = \exp(-\lambda \cdot \text{age})$ and $Q = \text{historical completion}$.
- **Flaw in Real Catalog:** The 17 edits in [`src/data/edits.ts`](file:///home/vuld0/Lolixco/src/data/edits.ts) have no publication timestamps (`published_at` is non-existent) and zero historical telemetry. Fabricating upload dates or view counts is forbidden. Including fixed zero or dummy values for $F$ and $Q$ artificially compresses the score range into $[0, 0.70]$.
- **Lolixco Stage 1 Redesign:** Dynamic weight renormalization. In the absence of verifiable publication dates and quality priors, the available verified signals ($C$ and $T$) are renormalized across the 100% budget:
  $$\text{Score}_{\text{UpNext}} = 0.55 \cdot C(i, c) + 0.45 \cdot T_{\text{IDF}}(i, c)$$
  When session watch history is present, session affinity contributes to the contextual vector. The system emits `publication_time_missing` and `quality_prior_uninformative` in diagnostics warnings.

#### Issue C: Single-Creator Diversity Deadlock
- **Codex Assumption:** Strict maximum 2 items per creator per 10 positions.
- **Flaw in Real Catalog:** 100% of the 17 items share `creator: "Lolixco demo"`. A hard 2-per-10 rule would output 2 items and drop the remaining 15 eligible items.
- **Lolixco Stage 1 Redesign:** Check distinct eligible creator count. If $N_{\text{creators}} \le 2$, automatically relax the creator cap, rank by relevance and category diversity, and set `creator_cap_relaxed: true` in diagnostics warnings.

#### Issue D: Home Feed Cold-Start Strategy
- **Codex Assumption:** Emulate YouTube's empty state or undefined fallback.
- **Lolixco Stage 1 Redesign:** Provide a **deterministic category-balanced round-robin feed**. Group items by their canonical category, sort deterministically by ID within each category, and interleave:
  $$\text{Order} = [\text{Cat}_1[0], \text{Cat}_2[0], \dots, \text{Cat}_6[0], \text{Cat}_1[1], \dots]$$
  This guarantees that the user sees all 6 categories in the top 6 positions, delivering high immediate discovery value.

#### Issue E: Watch Duration Units & Budget Normalization
- **Codex Formulation:** $y = \min(w, d, 60)$, $f = y / 60$.
- **Lolixco Stage 1 Redesign:** Explicitly distinguish between:
  1. `duration_ms`: Authoritative integer duration parsed from `"0:12"` $\rightarrow 12,000\,\text{ms}$.
  2. `completion_ratio`: $w / d \in [0.0, 1.0]$.
  3. `budget_watch_fraction`: $\min(w, d, 60) / 60.0 \in [0.0, 1.0]$. For Lolixco's 12-second clip, a full watch yields $12/60 = 0.20$.
  The system supports session history weights computed from `budget_watch_fraction` to discount quick skips ($w < 2\text{s}$) while bounding long-watch rewards.

---

## 6. Implementation Decisions Summary

| Component | Codex Proposal | Lolixco Stage 1 Implementation Decision | Rationale |
| :--- | :--- | :--- | :--- |
| **Catalog Snapshot** | Static proposal | Real JSON export directly from `src/data/edits.ts` with automated drift detection | Guarantees 100% fidelity with UI assets, zero brittle regex |
| **Home Ranking** | Generic score | Deterministic category round-robin interleaving with ID tie-break | Perfect category diversity in cold-start; non-empty showcase |
| **Up Next Ranking** | $0.40C + 0.30T + 0.15F + 0.15Q$ | Dynamic renormalization: $0.55C + 0.45 T_{\text{IDF}}$ (or with session history) | Avoids dummy zero weights for unavailable timestamps and fake CTR |
| **Tag Similarity** | Unweighted Jaccard | IDF-discounted tag overlap | Suppresses generic fixture tags (`original`, `demo`, `landscape`) |
| **Creator Cap** | Hard 2/10 cap | Adaptive relaxation with warning flag when $\le 2$ creators exist | Prevents catalog truncation on demo fixtures |
| **Duration Parsing** | Proposed nullable string | Strict parsing into integer milliseconds (`duration_ms`) and seconds | Guarantees numeric integrity for watch-time arithmetic |
| **Testing** | Suggested | Comprehensive standard library test suite covering 100% of invariants | Ensures determinism, error handling, and zero regression |
