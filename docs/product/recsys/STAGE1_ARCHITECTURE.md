# Stage 1 Recommendation Engine Architecture

**Author:** Antigravity (Linux) — Lead Recommendation Systems Engineer  
**Date:** 2026-10-16  
**Status:** Approved Design Specification (v2 Post-Review Corrections)  
**Location:** `server/recsys/`  
**Branch:** `feat/recsys-baseline`  
**Base:** `origin/main` at `174d01a89d1f83f47f4279b7e62ca2babdb1f294`

---

## 1. Architectural Principles & Boundaries

The Stage 1 Recommendation Engine provides an independent, deterministic, and explainable recommendation foundation for Lolixco.

### 1.1 Key Invariants
1. **Zero Fabricated Metrics:** No manufactured view counts, fake upload timestamps, synthetic user profiles, or simulated accuracy metrics.
2. **Numeric ID Integrity:** Every catalog edit is identified by a strict integer `id >= 0`. `id = 0` is a valid, distinct identifier. Python booleans (`True`/`False`), which subclass `int`, are strictly rejected by type checking.
3. **Data Grounding & Drift Resistance:** The catalog is derived directly from the canonical frontend fixture in `src/data/edits.ts`. Automated envelope, count, and schema drift checks ensure 100% synchronization and reject unauthorized tampering.
4. **Service Independence:** The recommendation engine is designed as a pure, dependency-free Python library (using Python 3 standard library only). It is decoupled from HTTP servers, databases, and client UI components.
5. **Truth in Telemetry & Explainability:** Reason codes (`cold_start`, `category_balance`, `category_match`, `tag_similarity`, `session_continuity`) reflect the algorithm actually used. Boilerplate fixture tags do not trigger spurious similarity reasons, and empty or skipped histories do not degrade into unexplainable ID-order rankings.

---

## 2. Component Design & Module Boundaries

The implementation in `server/recsys/` is organized into clean, focused modules:

```
server/recsys/
├── __init__.py            # Library exports
├── types.py               # Frozen dataclasses with strict schema validation
├── catalog.py             # Catalog loading, indexing, validation, and duration parsing
├── similarity.py          # IDF tag weighting, boilerplate suppression, and history extraction
├── engine.py              # Pure-function RecommendationEngine (Home and Up Next)
├── export_catalog.py      # Automated snapshot generator and drift detector
├── catalog_snapshot.json  # Synchronized snapshot of the 17-item catalog
└── tests/
    ├── __init__.py
    ├── test_catalog.py    # Duration parsing, ID 0 preservation, strict type & schema validation
    ├── test_similarity.py # IDF weights, boilerplate tags, meaningful tags, history filtering
    ├── test_engine.py     # Home balance, Up Next relevance, diversity (1-6 creators), tie-breaking
    └── test_drift.py      # Automated positive and negative drift integration tests
```

---

## 3. Data Models & Strict Schema Validation (`types.py`, `catalog.py`)

### 3.1 Strict Type Constraints
In Python, `isinstance(True, int)` evaluates to `True`. To prevent type corruption:
- `EditItem.id`: Validated with `type(id) is int and id >= 0`.
- `EditItem.tags`: Must be a `list` or `tuple` of non-empty strings. Bare strings (e.g. `"gaming"`) are explicitly rejected to prevent character-by-character decomposition.
- `EditItem.trending`: Must be a strict `bool` (`type is bool`). String `"false"` is strictly rejected.
- `EditItem.duration`: Missing duration is strictly rejected. Defaulting missing durations to `"0:12"` is prohibited.
- `Catalog.from_dict_list`: Enforces `ALLOWED_FIELDS` and `REQUIRED_FIELDS`. Unexpected extra fields in raw records raise a `ValueError`.
- `RecommendationRequest`: Validates limit ($1 \le \text{limit} \le 50$), `current_edit_id`, `exclude_edit_ids`, and ensures history elements are `WatchHistoryEntry` instances.

---

## 4. Algorithms & Mathematical Specifications

### 4.1 Up Next Scoring (`surface == "up_next"`)

For a candidate edit $i$ given currently watched edit $c$ and validated usable history $H$:

1. **Active Suppression & Eligibility Filter:**
   $$i \in \text{Catalog} \setminus (\{c\} \cup \text{exclude\_edit\_ids})$$

2. **Category Context Score $C(i, c)$:**
   $$C(i, c) = \begin{cases} 1.0 & \text{if } i.\text{category} == c.\text{category} \\ 0.0 & \text{otherwise} \end{cases}$$

3. **IDF-Weighted Tag Similarity $T_{\text{IDF}}(i, c)$ with Boilerplate Suppression:**
   Boilerplate fixture tags (`original`, `demo`) that appear across the catalog receive a fixed minimal weight ($0.01$). Informative topic tags receive full logarithmic IDF weight:
   $$\text{IDF}(t) = \ln\left(1 + \frac{N}{\text{DF}(t)}\right)$$
   Weighted similarity is computed across non-boilerplate tags:
   $$T_{\text{IDF}}(i, c) = \frac{\sum_{t \in i.\text{tags} \cap c.\text{tags}} \text{IDF}(t)}{\sum_{t \in i.\text{tags} \cup c.\text{tags}} \text{IDF}(t)}$$

4. **Meaningful Tag Discrimination for Reason Codes:**
   `tag_similarity` is ONLY emitted if:
   $$\text{MeaningfulSharedTags}(i, c) = \{t \in i.\text{tags} \cap c.\text{tags} : \text{DF}(t) < 0.5 \cdot N \land t \notin \text{BOILERPLATE}\} \neq \emptyset$$
   Cross-category edits that share only boilerplate tags never emit a `tag_similarity` explanation.

5. **Dynamic Renormalized Score:**
   $$\text{Score}(i) = w_C \cdot C(i, c) + w_T \cdot T_{\text{IDF}}(i, c) + w_H \cdot S(i, H)$$
   - With usable history: $w_C = 0.45$, $w_T = 0.35$, $w_H = 0.20$.
   - Without usable history: $w_C = 0.55$, $w_T = 0.45$, $w_H = 0.00$.
   - **Tie-Breaking:** Deterministic sort by `score` DESC, then `id` ASC.

### 4.2 Home Discovery & Usable-History Gating (`surface == "home"`)

1. **Usable-History Extraction (`get_usable_history`):**
   Entries in `request.history` are filtered:
   - Must reference a valid edit present in the catalog.
   - User must have watched at least $2,000\,\text{ms}$ (2 seconds) to distinguish true interest from bounces/skips.
   - If ignored entries exist, emit `"history_items_ignored"`.
2. **Cold-Start Preservation:**
   If `usable_history` is empty (including requests where all entries were quick skips or unknown IDs):
   - The engine **must not** degrade into arbitrary ID-order sorting.
   - It performs **deterministic category round-robin interleaving** across all 6 canonical categories.
   - Emits reason codes `("cold_start", "category_balance")`.
   - If skipped/unknown history was submitted, emits `"history_unusable_or_skipped"`.
3. **History-Aware Ranking:**
   Only executed when genuine, validated watch signals exist. Blends contextual affinity with base discovery.

### 4.3 Creator Diversity Policy & Sliding-Window Reranker

- **Policy:** In any sliding window of length 10 in the returned list, no single creator may appear more than 2 times.
- **Mathematical Feasibility:**
  By the Pigeonhole Principle, to satisfy $\le 2$ items per creator in a window of size 10, the candidate pool must contain at least:
  $$N_{\text{creators}} \ge \lceil 10 / 2 \rceil = 5 \text{ distinct creators}$$
  With 1, 2, 3, or 4 creators, strict enforcement across a 10-item window is mathematically impossible once the window capacity ($2 \times N_{\text{creators}}$) is reached.
- **Deterministic Reranker Algorithm:**
  1. If $N_{\text{unique\_creators}} \le 2$ (e.g. 1-creator demo catalog): Upfront relaxation occurs. Emits `creator_cap_relaxed: true` and `"creator_cap_relaxed"`. All eligible items are preserved without truncation.
  2. If $N_{\text{unique\_creators}} > 2$: Greedy placement with sliding-window lookahead. For each output position, the engine selects the highest-ranked remaining candidate whose creator count in the preceding 9 items is $< 2$.
  3. When candidate diversity is exhausted (e.g. highly skewed creator distributions): The engine detects mathematical impossibility, relaxes the cap, emits `"creator_cap_relaxed_insufficient_diversity"`, and places candidates to minimize creator concentration without dropping content.
  4. **Verification:** `verify_sliding_window_diversity()` inspects every complete sliding window $[i : i + 10]$ in the returned list.

---

## 5. Source-to-Snapshot Synchronization & Drift Prevention

`server/recsys/export_catalog.py` implements a tamper-proof synchronization and drift check:
1. Executes `node --import ./tests/register-ts.mjs` to extract `src/data/edits.ts` with 100% native fidelity.
2. Validates snapshot envelope keys (`catalog_version`, `total_edits`, `edits`).
3. Verifies that `total_edits` strictly matches the actual record count and the live TypeScript edit count.
4. Validates record schemas, rejecting unexpected extra keys or missing required fields.
5. Compares property-level values between live TypeScript source and snapshot.
6. Automated unit tests in `test_drift.py` verify both positive synchronization and negative tamper detection (tampered versions, altered counts, injected fields, and mutated values).
