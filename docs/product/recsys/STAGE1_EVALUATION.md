# Stage 1 Recommendation Evaluation: Measurable Properties & Boundaries

**Author:** Antigravity (Linux) — Lead Recommendation Systems Engineer  
**Date:** 2026-10-16  
**Status:** Evaluation Report (v3 Post-Review Corrections)  
**Location:** `docs/product/recsys/STAGE1_EVALUATION.md`  
**Branch:** `feat/recsys-baseline`  
**Base:** `origin/main` at `174d01a89d1f83f47f4279b7e62ca2babdb1f294`

---

## 1. Executive Summary

In adherence to the core engineering directive — **"Never fabricate engagement metrics, user histories, real creators, upload dates, popularity, model accuracy, or behavioral predictions"** — this evaluation document explicitly delineates what has been empirically verified and benchmarked in Stage 1 versus what cannot be measured until real user telemetry is available.

---

## 2. What Can Be Measured With the Present Catalog

All properties below are verified via 34 deterministic unit and integration tests in `server/recsys/tests/`:

| Dimension / Metric | Measured Value | Verification Method | Status |
| :--- | :--- | :--- | :--- |
| **Catalog ID Integrity** | 17 / 17 edits preserved (100%) | `test_catalog.py` | **VERIFIED** |
| **ID 0 Preservation** | Retained with `title: "Into the Light"` | `test_catalog.py` | **VERIFIED** |
| **Strict Schema Typing** | Bools as IDs, string tags, string trending, missing durations rejected | `test_catalog.py` | **VERIFIED** |
| **Strict Catalog Lookup IDs**| `Catalog.get()` and `__contains__()` reject booleans (`True`/`False`), preserving ID 0/1 | `test_catalog.py` | **VERIFIED** |
| **Strict Envelope Loading** | List root, wrong version, extra keys, and count mismatches rejected | `test_catalog.py` | **VERIFIED** |
| **Canonical Category Contract** | Rejects unknown category filters; handles zero-result valid filters cleanly | `test_catalog.py`, `test_engine.py` | **VERIFIED** |
| **Duration Parsing Fidelity** | `0:12` $\rightarrow 12,000\,\text{ms}$ (12.0s); negative durations rejected | `test_catalog.py` | **VERIFIED** |
| **Cold-Start Category Balance** | 6 / 6 categories in top 6 positions (100%) | `test_engine.py` | **VERIFIED** |
| **Usable History Detection** | Skips (<2s) and unknown IDs filtered; cold start preserved | `test_engine.py` | **VERIFIED** |
| **Honest Reason Telemetry** | No `category_balance` in history Home; `fallback_exploration` in Up Next | `test_engine.py` | **VERIFIED** |
| **Active Video Suppression** | 0% recurrence of active video in Up Next | `test_engine.py` | **VERIFIED** |
| **Generic-Tag-Only Similarity**| Boilerplate-only overlap yields strictly 0.0; no false `thematic_relation` | `test_engine.py`, `test_similarity.py` | **VERIFIED** |
| **Meaningful Tag Discrimination** | Generic tags do not emit `tag_similarity`; topic tags do | `test_engine.py`, `test_similarity.py` | **VERIFIED** |
| **Adversarial Diversity Feasibility**| Solves adversarial `DDACBEECEABDABC` permutation with 0 window violations | `test_engine.py` (`verify_sliding_window_diversity`) | **VERIFIED** |
| **Feed-Length Diversity Diagnostics**| Short (<10) feeds emit no false relaxation; long single-creator feeds flag relaxation | `test_engine.py` | **VERIFIED** |
| **Infeasibility vs Budget Exhaustion**| Explicitly distinguishes proven mathematical infeasibility from step limit | `test_engine.py` | **VERIFIED** |
| **Diversity Cap Relaxation** | Explicit warnings on 1-2 creators and pool exhaustion | `test_engine.py` | **VERIFIED** |
| **Deterministic Tie-Breaking** | Identical scores break ties by `edit.id` ASC | `test_engine.py` | **VERIFIED** |
| **Source-to-Snapshot Drift** | Positive sync passes; tampered count, version, & fields fail | `test_drift.py` (positive & negative tests) | **VERIFIED** |
| **Strict Drift Type Resistance**| Rejects `trending: 0` vs `false` and `total_edits: 17.0` vs `17` | `test_drift.py` (type bypass tests) | **VERIFIED** |
| **Execution Performance** | 34 unit tests execute in ~6.1 seconds | `python3 -m unittest` | **VERIFIED** |

---

## 3. Adversarial Creator Diversity Analysis (1 to 6 Creators)

Independent mathematical verification establishes:
1. **Pigeonhole Principle Constraint:** In any sliding window of length 10 with a maximum of 2 items per creator, the maximum capacity that $N$ creators can provide is $2 \times N$.
   - For $N = 1$: Maximum 2 items.
   - For $N = 2$: Maximum 4 items.
   - For $N = 3$: Maximum 6 items.
   - For $N = 4$: Maximum 8 items.
   - For $N \ge 5$: $2 \times 5 = 10$ items.
   Therefore, strict enforcement across a 10-item window mathematically requires **at least 5 distinct creators**.
2. **Feed Length & Sliding Window Policy:**
   Under the complete 10-item sliding-window policy, sequences with length $< 10$ (such as 1-edit feeds, short feeds, or filtered sub-feeds) contain zero complete 10-item windows. They require no relaxation and emit `creator_cap_relaxed: False` with zero warnings.
3. **Adversarial Test Results:**
   - **Adversarial Permutation `DDACBEECEABDABC` (5 creators, 3 items each):** The bounded backtracking scheduler overcomes greedy local starvation to produce `DACBEDECABDACBE`. Every 10-item sliding window $[i : i + 10]$ satisfies $\le 2$ items per creator. No relaxation is triggered (`creator_cap_relaxed == False`).
   - **1 Creator (Demo Catalog, $\ge 10$ items):** When delivering $\ge 10$ items, automatically relaxes cap, emits `creator_cap_relaxed: true` and `"creator_cap_relaxed_proven_infeasible"`, preserving all items without truncation. Short feeds (<10 items) emit no warnings.
   - **2 Creators:** Relaxes cap, emits diagnostic warning, avoids dropping eligible content.
   - **3 & 4 Creators:** Places items without concentration until window capacity saturates; detects mathematical impossibility, relaxes gracefully with `"creator_cap_relaxed_proven_infeasible"`, and retains all items.
   - **5 & 6 Creators (Balanced):** Strict enforcement succeeds across the entire returned list. `verify_sliding_window_diversity()` verifies **every complete sliding window** $[i : i + 10]$ has 0 violations.
   - **5 Creators (Extreme Skew):** When minority creator candidates are exhausted, detects exhaustion, relaxes gracefully, and minimizes concentration.
   - **Search Budget Exhaustion:** When bounded search budget is exhausted before finding a completion, explicitly reports `"creator_cap_relaxed_search_budget_exhausted"` with feasibility undetermined, rather than claiming proven infeasibility or conflating it with insufficient diversity.

---

## 4. What Cannot Be Measured With the Present Catalog

The following metrics are fundamentally unmeasurable at this stage without manufacturing synthetic fiction:

1. **Click-Through Rate (CTR) and Conversion:**
   - *Why:* There are no live users, impressions, clicks, or client-side telemetry collectors deployed. Any reported CTR improvement at this stage would be fabricated.
2. **True Watch-Time Optimization:**
   - *Why:* The catalog consists of a single 12-second silent motion study video fixture shared across all 17 edits. Real user completion curves and session drop-off dynamics do not exist.
3. **Neural Two-Tower Retrieval Accuracy (Recall@K / NDCG@K):**
   - *Why:* Training a collaborative filtering or two-tower deep retrieval network requires diverse user interaction graphs. Evaluating neural accuracy on 17 items with 1 creator would represent severe overfitting to synthetic noise.
4. **Production Server Concurrency & P99 Latency:**
   - *Why:* Stage 1 is an in-memory Python library core. Benchmarks under network concurrency (e.g. 10,000 RPS) require the future serving tier and real hardware profiling.
5. **Freshness Decay Dynamics:**
   - *Why:* All 17 demo edits are static fixtures without publication dates. Freshness half-life curves cannot be tuned until content is published on a continuous timeline.

---

## 5. Conclusion

The Stage 1 v3 implementation resolves all code review findings:
- Bounded backtracking creator diversity scheduling solves adversarial feasibility (e.g. `DDACBEECEABDABC`).
- Proven mathematical infeasibility is explicitly distinguished from search budget exhaustion.
- Snapshot loading strictly validates envelope schema and version integrity.
- Source-to-snapshot drift check enforces strict type matching (closing `trending: 0` and `total_edits: 17.0` loopholes).
- Canonical category contracts explicitly reject unknown filters while cleanly handling zero-result valid queries.
- Reason codes are strictly honest across Up Next and history-aware feeds.

