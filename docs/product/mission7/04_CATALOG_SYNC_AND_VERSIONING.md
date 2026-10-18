# Mission 7A — Catalog Synchronization and Versioning Strategy

## 1. Catalog Evolution Lifecycle

Lolixco's content catalog transitions through clear, deterministic version gates:

```
┌─────────────────────────────────┐
│       demo-catalog-v1           │
│  - 17 landscape demo edits      │
│  - IDs: 0 through 16            │
│  - 0 Shorts                     │
│  - 10 allowed recsys fields     │
└────────────────┬────────────────┘
                 │
                 ▼  (Mission 7A: Foundation Gate)
┌─────────────────────────────────┐
│     Ingestion Foundation        │
│  - Owner Manifest Schema        │
│  - Staged Content Validator     │
│  - Production Invariants Locked │
└────────────────┬────────────────┘
                 │
                 ▼  (Mission 7B: First Real Content Batch)
┌─────────────────────────────────┐
│          catalog-v2             │
│  - 17 baseline demo edits (0-16)│
│  - ~50 curated landscape videos │
│  - ~20 curated portrait Shorts  │
│  - Format & Fandom fields       │
│  - Updated recsys snapshot      │
└─────────────────────────────────┘
```

---

## 2. Decoupled Ingestion Workflow

To protect production stability and prevent corrupted metadata or partial uploads from breaking live users, content ingestion follows a decoupled, three-tier progression:

```
[Owner Staging]                [Validation Gate]              [Production Publication]
Raw Video Files (.mp4)     ──► `scripts/validate-content.mjs` ──► `src/data/edits.ts`
Poster Images (.webp)      ──► Schema & Magic Bytes Check     ──► `export_catalog.py`
`content/manifest.json`    ──► Aspect Ratio & Taxonomy Check  ──► `catalog_snapshot.json`
```

1. **Tier 1 — Owner Manifest Staging:**
   Editors author or edit `content/manifest.json` referencing assets staged in `public/media/`. No application source code is touched at this stage.
2. **Tier 2 — Deterministic Validation Gate:**
   Run `npm run check:content -- --manifest content/manifest.json`.
   If any duplicate ID, missing file, corrupted header, invalid taxonomy, or aspect ratio mismatch occurs, the pipeline halts immediately.
3. **Tier 3 — Controlled Production Compilation:**
   Once validated, records are projected into [`src/data/edits.ts`](file:///home/vuld0/Lolixco/src/data/edits.ts), the Python catalog snapshot is updated via `python3 server/recsys/export_catalog.py`, and the entire verification suite is run.

---

## 3. Python Recommendation System Migration Plan

The Python recommendation service in `server/recsys/` enforces strict snapshot drift checks:

### 3.1 Mission 7A State (Unchanged Baseline)
- `server/recsys/export_catalog.py` enforces:
  ```python
  ALLOWED_RECORD_FIELDS = {
      "id", "title", "category", "tags", "description",
      "creator", "poster", "source", "duration", "trending"
  }
  ```
- `catalog_snapshot.json` has `catalog_version: "demo-catalog-v1"` and `total_edits: 17`.
- **Mission 7A Invariant:** No modifications are made to `server/recsys/catalog_snapshot.json` or `export_catalog.py` in Mission 7A. The baseline contract remains 100% frozen.

### 3.2 Mission 7B Migration Plan (When Real Media is Provided)
When the owner delivers the first content batch, the recommendation engine catalog contract will be upgraded to `catalog-v2` in a single atomic commit:

1. **Update `ALLOWED_RECORD_FIELDS` in `server/recsys/export_catalog.py`:**
   Add `"format"` and `"fandomIds"` to allowed fields:
   ```python
   ALLOWED_RECORD_FIELDS = {
       "id", "title", "category", "tags", "description",
       "creator", "poster", "source", "duration", "trending",
       "format", "fandomIds"
   }
   ```
2. **Update `CANONICAL_CATEGORIES` in `server/recsys/types.py`:**
   Include `"Multifandom"`:
   ```python
   CANONICAL_CATEGORIES: tuple[str, ...] = (
       "Cinematic", "Gaming", "Anime", "Movies", "Series", "Phonk", "Multifandom"
   )
   ```
3. **Regenerate Snapshot:**
   Run `python3 server/recsys/export_catalog.py` to write the new `catalog_snapshot.json` with `catalog_version: "catalog-v2"`.
4. **Format-Aware Up Next Recommendation Guard:**
   Ensure `server/recsys/engine.py` restricts Up Next recommendations to matching formats (long-form videos recommend long-form videos; Shorts recommend Shorts).

---

## 4. ID Allocation Policy

To prevent ID collisions and simplify debugging across logs, metrics, and URLs:

| Range | Content Classification | Current Count | Target Count |
| :--- | :--- | :--- | :--- |
| `0` – `16` | Reserved baseline demo edits (Cinematic & multi-category) | 17 | 17 (frozen) |
| `17` – `99` | Reserved for internal test fixtures and staging harnesses | 0 | 0 in prod |
| `100` – `199` | Curated landscape videos (`format: "video"`) | 0 | ~50 |
| `200` – `299` | Curated portrait Shorts (`format: "short"`) | 0 | ~20 |
| `300+` | Future expansion batches | 0 | TBD |

---

## 5. Catalog Rollback Protocol

If an ingested content batch introduces an asset defect or licensing issue post-deployment:
1. Revert `src/data/edits.ts` to the prior release state.
2. Run `python3 server/recsys/export_catalog.py` to re-synchronize the snapshot.
3. Execute `npm test` and `python3 server/recsys/export_catalog.py --check`.
4. Because catalog compilation is 100% deterministic and reproducible, rollbacks require zero database migrations or cache invalidation scripts.
