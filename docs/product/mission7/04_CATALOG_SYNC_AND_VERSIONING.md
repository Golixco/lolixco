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
│  - Strict ID Allocation Policy  │
│  - 3-Tier Validation Workflows  │
│  - Private Manifest Protection  │
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

## 2. Decoupled Ingestion Workflow & Modes

To protect production stability and prevent corrupted metadata or partial uploads from breaking live users, content ingestion follows a decoupled progression:

```
[Metadata Preparation Mode]    ──► Validates manifest schema, IDs, taxonomy (files not needed)
[Asset Verification Mode]      ──► Validates staged files, magic bytes, safe path containment
[Publication Readiness Mode]   ──► Validates approval, rights clearance, assets, and streams
```

1. **Tier 1 — Metadata Preparation Mode (`--mode metadata`):**
   Editors author `content/manifest.json` before media files arrive. Validates schema, data types, string constraints, and ID range compliance. Asset verification and stream inspection are marked as `SKIPPED`. Runs 100% offline without requiring media files or ffprobe.
2. **Tier 2 — Asset Verification Mode (`--mode assets`):**
   Requires staged media files to exist in `public/media/`. Checks magic bytes via streaming header reads (max 64KB) and verifies safe path containment (`realpathSync`). Stream inspection is reported separately as `INCOMPLETE` if ffprobe is unavailable, without claiming publication readiness.
3. **Tier 3 — Publication Readiness Mode (`--mode publish`):**
   Requires approved review (`reviewStatus: "approved" | "published"`), documented rights clearance (`rightsCleared: true`), verified staged assets, and certified decodable media streams. Fails closed with fatal errors if ffprobe is unavailable, if streams cannot be decoded, or if dimensions/codecs/tolerances mismatch declared metadata.
4. **Tier 4 — Controlled Production Compilation:**
   Once publication-ready, records are projected into [`src/data/edits.ts`](file:///home/vuld0/Lolixco/src/data/edits.ts) via `projectToPublicEdit(item)`. Safe by default: throws immediately if unapproved or uncleared records are passed. Non-public staging workflows must explicitly call `projectToPreviewEdit(item)`.

*Strict Mode Validation:* Only `metadata`, `assets`, and `publish` modes are accepted. Any unknown or unsupported mode is rejected immediately with a structured error and a non-zero exit code.

---

## 3. Private Manifest Protection (`.gitignore`)

Working manifests contain private editorial provenance, rights records, and curator notes. To prevent accidental leakage to the public GitHub repository:
- `content/manifest.json` is added to `.gitignore`.
- `content/*.private.json` and `content/staging/` are added to `.gitignore`.
- Only the hypothetical schema template [`content/manifest.template.json`](file:///home/vuld0/Lolixco/content/manifest.template.json) and [`content/manifest.schema.json`](file:///home/vuld0/Lolixco/content/manifest.schema.json) are committed to version control.
- Sanitized public catalogs in `src/data/edits.ts` contain strictly public projection fields.

---

## 4. ID Allocation Policy

Enforced deterministically by [`scripts/validate-content.mjs`](file:///home/vuld0/Lolixco/scripts/validate-content.mjs):

| Range | Content Classification | Current Count | Target Count | Enforcement Rule |
| :--- | :--- | :--- | :--- | :--- |
| `0` – `16` | Reserved baseline demo edits | 17 | 17 (frozen) | Rejected for new content batches. |
| `17` – `99` | Reserved for internal test harnesses | 0 | 0 in prod | Rejected for new content batches. |
| `100` – `199` | Curated landscape videos (`format: "video"`) | 0 | ~50 | Mandatory for landscape videos. |
| `200` – `299` | Curated portrait Shorts (`format: "short"`) | 0 | ~20 | Mandatory for vertical Shorts. |
| `300+` | Future expansion batches | 0 | TBD | Reserved for subsequent content drops. |

---

## 5. Python Recommendation System Migration Plan (Mission 7B)

The Python recommendation service in `server/recsys/` enforces strict snapshot drift checks:
- **Mission 7A Baseline:** `server/recsys/catalog_snapshot.json` and `export_catalog.py` remain completely untouched in Mission 7A.
- **Mission 7B Migration Plan:**
  1. Add `"format"` and `"fandomIds"` to `ALLOWED_RECORD_FIELDS` in `server/recsys/export_catalog.py`.
  2. Add `"Multifandom"` to `CANONICAL_CATEGORIES` in `server/recsys/types.py`.
  3. Re-export snapshot using `python3 server/recsys/export_catalog.py` to write `catalog_version: "catalog-v2"`.
  4. Run `python3 server/recsys/export_catalog.py --check` and Python recsys test suite to confirm 0 drift.
