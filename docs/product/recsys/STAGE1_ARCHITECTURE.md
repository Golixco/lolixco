# Stage 1 Recommendation Engine Architecture

**Author:** Antigravity (Linux) — Lead Recommendation Systems Engineer  
**Date:** 2026-10-16  
**Status:** Approved Design Specification  
**Location:** `server/recsys/`  
**Branch:** `feat/recsys-baseline`  
**Base:** `origin/main` at `174d01a89d1f83f47f4279b7e62ca2babdb1f294`

---

## 1. Architectural Principles & Boundaries

The Stage 1 Recommendation Engine provides an independent, deterministic, and explainable recommendation foundation for Lolixco.

### 1.1 Key Invariants
1. **Zero Fabricated Metrics:** No manufactured view counts, fake upload timestamps, synthetic user profiles, or simulated accuracy metrics.
2. **Numeric ID Integrity:** Every catalog edit is identified by a strict integer `id >= 0`. `id = 0` is a valid, distinct identifier and must never be treated as falsy or dropped.
3. **Data Grounding:** The catalog is derived directly from the canonical frontend fixture in `src/data/edits.ts`. Automated drift checks ensure 100% synchronization.
4. **Service Independence:** The recommendation engine is designed as a pure, dependency-free Python library (using Python 3 standard library only). It is decoupled from HTTP servers, databases, and client UI components.
5. **Explainability:** All recommendation decisions return structured, unambiguous reason codes (`cold_start`, `category_balance`, `category_match`, `tag_similarity`, `session_continuity`) alongside diagnostic warnings.

---

## 2. Component Design & Module Boundaries

The implementation in `server/recsys/` is organized into clean, focused modules:

```
server/recsys/
├── __init__.py
├── types.py            # Strongly typed dataclasses for Edits, Requests, Responses, and Diagnostics
├── catalog.py          # Catalog loading, validation, duration parsing, indexing
├── export_catalog.py   # Synchronizer and drift detector between src/data/edits.ts and JSON snapshot
├── similarity.py       # IDF-weighted tag similarity and category affinity calculations
├── engine.py           # Core deterministic recommendation engine (Home and Up Next)
└── tests/
    ├── __init__.py
    ├── test_catalog.py # Tests for catalog validation, ID 0, duration parsing, error handling
    ├── test_drift.py   # Tests for source-to-snapshot integrity and drift detection
    └── test_engine.py  # Tests for Home round-robin, Up Next relevance, exclusions, relaxation
```

---

## 3. Data Models & Normalization (`types.py`)

### 3.1 Item Representation
```python
@dataclass(frozen=True)
class EditItem:
    id: int
    title: string
    category: string
    tags: tuple[str, ...]
    description: str
    creator: str
    poster: str
    source: str
    duration: str          # Raw string, e.g. "0:12"
    duration_ms: int       # Normalized milliseconds, e.g. 12000
    duration_sec: float    # Normalized seconds, e.g. 12.0
    trending: bool
```

### 3.2 Request & Session Context
```python
@dataclass(frozen=True)
class WatchHistoryEntry:
    edit_id: int
    unique_watch_ms: int   # Bounded non-negative watch duration
    occurred_at: str       # ISO 8601 string

@dataclass(frozen=True)
class RecommendationRequest:
    surface: str                      # "home" or "up_next"
    current_edit_id: Optional[int]    # Required for "up_next", None for "home"
    limit: int = 12                   # Bounded 1..50
    exclude_edit_ids: tuple[int, ...] = ()
    history: tuple[WatchHistoryEntry, ...] = ()
    category_filter: Optional[str] = None
```

### 3.3 Recommendation Result Envelope
```python
@dataclass(frozen=True)
class RecommendedItem:
    rank: int              # 1-based index
    edit: EditItem
    score: float           # Normalized score in [0.0, 1.0]
    reason_codes: tuple[str, ...]

@dataclass(frozen=True)
class RecommendationResponse:
    surface: str
    mode_used: str         # "baseline"
    catalog_version: str
    policy_version: str
    items: tuple[RecommendedItem, ...]
    total_eligible: int
    diagnostics: dict
```

---

## 4. Algorithms & Mathematical Specifications

### 4.1 Up Next Scoring (`surface == "up_next"`)

For a candidate edit $i$ given currently watched edit $c$ and optional session history $H$:

1. **Eligibility Filter:**
   $$i \in \text{Catalog} \setminus (\{c\} \cup \text{exclude\_edit\_ids})$$

2. **Category Context Score $C(i, c)$:**
   $$C(i, c) = \begin{cases} 1.0 & \text{if } i.\text{category} == c.\text{category} \\ 0.0 & \text{otherwise} \end{cases}$$

3. **IDF-Weighted Tag Similarity $T_{\text{IDF}}(i, c)$:**
   To prevent high false-positive similarity from ubiquitous demo tags (`original`, `demo`, `landscape`, `neon`), each tag $t$ has an inverse document frequency weight:
   $$\text{IDF}(t) = \ln\left(1 + \frac{N}{|\{e \in \text{Catalog} : t \in e.\text{tags}\}|}\right)$$
   The weighted similarity is:
   $$T_{\text{IDF}}(i, c) = \frac{\sum_{t \in i.\text{tags} \cap c.\text{tags}} \text{IDF}(t)}{\sum_{t \in i.\text{tags} \cup c.\text{tags}} \text{IDF}(t)}$$
   If both sets have zero weighted tags, $T_{\text{IDF}} = 0.0$.

4. **Dynamic Renormalized Score:**
   Because publication timestamps and historical quality telemetry are absent from the 17-item demo catalog, available signals are dynamically renormalized to span the full $[0.0, 1.0]$ range:
   $$\text{Score}(i) = w_C \cdot C(i, c) + w_T \cdot T_{\text{IDF}}(i, c) + w_H \cdot S(i, H)$$
   - Without history: $w_C = 0.55$, $w_T = 0.45$, $w_H = 0.00$.
   - With session history: $w_C = 0.45$, $w_T = 0.35$, $w_H = 0.20$.
   - **Tie-Breaking:** Deterministic sort by `score` DESC, then `id` ASC.

### 4.2 Home Discovery Cold-Start (`surface == "home"`)

When a user visits the home feed without session history:
1. Candidate pool is filtered by `exclude_edit_ids` and optional `category_filter`.
2. Edits are partitioned into lists by canonical category:
   $$\text{Buckets} = \{\text{Cat}_1: [e_{1,1}, e_{1,2}, \dots], \dots, \text{Cat}_6: [e_{6,1}, e_{6,2}, \dots]\}$$
   Each bucket is sorted by `id` ASC.
3. Items are interleaved across categories using round-robin selection:
   $$\text{Interleaved} = [\text{Cat}_1[0], \text{Cat}_2[0], \dots, \text{Cat}_6[0], \text{Cat}_1[1], \dots]$$
4. This guarantees that the top 6 positions display all 6 canonical categories (*Cinematic*, *Gaming*, *Anime*, *Movies*, *Series*, *Phonk*), providing diverse discovery without bias.
5. Reason codes emitted: `["cold_start", "category_balance"]`.

### 4.3 Creator Diversity Policy & Adaptive Relaxation

- **Standard Rule:** No more than 2 items from the same creator in any consecutive window of 10 recommendations.
- **Adaptive Relaxation:** If the total number of distinct creators in the eligible candidate pool is $\le 2$ (e.g. all 17 items from `"Lolixco demo"`), applying the rule would cause catalog collapse.
- The engine checks:
  $$\text{if } |\text{UniqueCreators}(\text{Eligible})| \le 2: \quad \text{Relax Rule} \land \text{Emit Warning } \text{"creator_cap_relaxed"}$$

---

## 5. Source-to-Snapshot Synchronization & Drift Prevention

To guarantee that the recommendation engine reflects active product data:
1. `server/recsys/export_catalog.py` executes a validated Node export script (`node --import ./tests/register-ts.mjs ...`) that imports `src/data/edits.ts` directly.
2. The export writes an authoritative snapshot to `server/recsys/catalog_snapshot.json`.
3. A `--check` mode compares the active TypeScript fixture output with the saved snapshot.
4. If any title, duration, category, or tag diverges, the check exits with code 1 and outputs a granular diff. This check runs in automated tests to prevent silent data drift.
