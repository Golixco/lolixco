# Mission 7A — Decision Log and Owner Requirements

## 1. Architectural Decisions Log (V1, V2 & V3)

| ID | Topic | Decision | Rationale |
| :--- | :--- | :--- | :--- |
| **DEC-701** | Content Manifest Format | JSON manifest backed by strict JSON Schema (`content/manifest.schema.json`) with `additionalProperties: false`. | Avoids manual TypeScript edits. Authoritative schema validation eliminates ambiguity. |
| **DEC-702** | ID Allocation Strategy | Retain IDs `0–16` for legacy demo edits; reserve `17–99` for internal test harnesses; enforce `100–199` for landscape videos and `200–299` for portrait Shorts. | Eliminates collision risks. Makes content format identifiable by ID prefix across logs, analytics, and URLs. |
| **DEC-703** | Public vs. Private Separation | Private curation data (`reviewStatus`, `rightsCleared`, `sourceAttribution`, `curatorNotes`) is isolated in an `editorial` namespace. | Strictly prevents creator identities, license terms, or internal notes from leaking into client-side bundles or search indexes. |
| **DEC-704** | Python Recsys Stability | Freeze `server/recsys/catalog_snapshot.json` and `export_catalog.py` during Mission 7A. Document the migration path to `catalog-v2` for Mission 7B. | Prevents premature breaking changes to production recommendation contracts while no real media is yet present. |
| **DEC-705** | Production Shorts Zero-State | Production catalog retains exactly 0 Shorts. No synthetic or placeholder Shorts are placed in `src/data/edits.ts`. | Preserves integrity of feed composition tests and avoids shipping fabricated content to production. |
| **DEC-706** | 3-Tier Validation Workflows | Implemented 3 distinct modes in `scripts/validate-content.mjs`: `metadata` (preparation), `assets` (staged files), and `publish` (pre-flight). | Enables editors to validate manifests before media arrives while ensuring production releases are fully verified. |
| **DEC-707** | Streaming Asset Inspection | Validator reads fixed-size header buffers (up to 64KB) via file descriptors, never reading entire video files into memory. | Eliminates memory exhaustion risks when inspecting multi-gigabyte video files. |
| **DEC-708** | Directory Traversal Containment | Enforces that all local asset paths resolve strictly inside `public/media/` or `public/brand/`, rejecting `../` traversal attacks. | Prevents arbitrary file reads or inclusion of unauthorized system files in the catalog. |
| **DEC-709** | Safe Compilation Boundary | `projectToPublicEdit({ strict: true })` throws if an item lacks approved review or documented rights clearance. | Provides programmatic enforcement against deploying unreviewed or uncleared content. |
| **DEC-710** | Private Manifest Protection | Added `content/manifest.json`, `content/*.private.json`, and `content/staging/` to `.gitignore`. | Guarantees that working manifests containing private licensing notes cannot be accidentally pushed to GitHub. |
| **DEC-711** | CI Integration Gate | Wired `pnpm check:content` directly into `.github/workflows/frontend-ci.yml`. | Automatically validates live catalog invariants (17 items, 0 shorts, 0 drift) on every pull request and push to main. |
| **DEC-712** | Fail-Closed Publication Readiness | Publication readiness requires successful media stream inspection. Corrupted, undecodable, or missing streams fail closed. Missing ffprobe in publish mode strictly fails closed. | Prevents header-only stubs or unplayable media from entering production catalogs. |
| **DEC-713** | Authoritative Schema Reconciliation | JSON schema (`content/manifest.schema.json`) constraints are fully reconciled at runtime via `validateJsonSchema`. String `trending`, explicit `null` values, and invalid `generatedAt` timestamps are strictly rejected. | Guarantees zero discrepancy between declared JSON Schema and validation runtime. |
| **DEC-714** | Resolved Realpath Containment | Asset containment checks resolve real filesystem targets (`realpathSync`) to block symlinks inside `public/media/` from escaping permitted directories. | Eliminates symlink escape bypasses while preserving valid local media paths. |
| **DEC-715** | Safe-by-Default Projection | `projectToPublicEdit(item)` defaults to strict publication clearance without requiring optional safety flags. Separate `projectToPreviewEdit(item)` is provided for non-public preview. | Eliminates risk of developers omitting safety flags and projecting unapproved records to public bundles. |
| **DEC-716** | Strict CLI Mode Validation | Validator CLI and programmatic API strictly validate `--mode` (accepting only `metadata`, `assets`, `publish`). Unsupported modes exit with non-zero code. | Prevents misconfigured CI scripts or typoed flags from skipping critical quality checks. |

---

## 2. Intentional Limitations and Tool Dependencies

1. **FFprobe Dependency for Physical Stream Certification:**
   - In publication mode (`--mode publish`), `ffprobe` is **mandatory**. If ffprobe is unavailable or fails on an undecodable stream, publication validation fails closed with a fatal error.
   - In asset staging mode (`--mode assets`), missing ffprobe reports `streamInspection: "INCOMPLETE (ffprobe unavailable; technical stream inspection incomplete)"` without claiming publication readiness.
   - In metadata preparation mode (`--mode metadata`), physical stream checks are skipped, keeping metadata linting 100% usable without ffprobe.
2. **Offline-Only Media Validation:**
   - External URLs (`https://...`) are permitted during metadata intake but flagged during asset verification because remote files cannot be verified offline. Production content is required to be staged in local `/media/` directories.

---

## 3. Information Required from Owner Before Batch 1 Ingestion

To begin ingesting the target ~50 landscape videos and ~20 portrait Shorts, the engineering team requires the following specifics from the content owner:

### 3.1 Media Asset Package
1. **Landscape Video Files:** Up to 50 `.mp4` files (1080p `16:9`, H.264/AAC, constant framerate, audio normalized to `-14 LKFS`).
2. **Portrait Short Files:** Up to 20 `.mp4` files (1080x1920 `9:16`, 60fps, clean audio loop).
3. **Poster Cards:** Matching `.webp` or `.png` card images (`1920x1080` for videos, `1080x1920` for shorts).
4. **Staging Location:** Staged directly in `public/media/videos/` and `public/media/posters/`.

### 3.2 Content Metadata Sheet / Manifest
For each edit, the owner must provide:
- **Title** (concise, 3–70 characters).
- **Description** (1–2 sentences summarizing the edit scene or style).
- **Category** (`Anime`, `Gaming`, `Movies`, `Series`, `Phonk`, or `Multifandom`).
- **Fandom Association** (e.g. *Jujutsu Kaisen*, *Demon Slayer*, *Spider-Man*, *Valorant*, *Doom*, or new fandom names).
- **3 to 6 Search Hashtags** (e.g. `#jjk`, `#gojo`, `#domain`, `#phonk`).
- **Initial Trending Selection** (which 5–10 edits should be featured on the Trending shelf).
- **Rights Clearance & Attribution:** Confirmed rights clearance (`rightsCleared: true`) and internal attribution notes.

---

## 4. Test Results and Verification Summary

All verification gates have been executed on branch `feat/mission7a-content-ingestion`:

1. **Frontend Unit & Integration Tests:**
   - Command: `npm test`
   - Result: **161 passed (0 failed)** across 10 test files.
   - Includes 34 comprehensive tests in [`tests/content-validation.test.mjs`](file:///home/vuld0/Lolixco/tests/content-validation.test.mjs) verifying schema validation, malformed types, fail-closed stream inspection, MP4 header-stub rejection, symlink escape prevention, safe-by-default projection, CLI mode rejection, ID allocation, and live catalog invariants.
2. **TypeScript Compilation:**
   - Command: `npm run typecheck`
   - Result: **0 type errors**.
3. **Python Recommendation Test Suite:**
   - Command: `python3 -m unittest discover -s server/recsys/tests -v`
   - Result: **53 passed (0 failed)**.
4. **Catalog Snapshot Drift Check:**
   - Command: `python3 -m server.recsys.export_catalog --check`
   - Result: **0 drift**. Live catalog matches `catalog_snapshot.json` exactly.
5. **Asset Integrity Check:**
   - Command: `npm run check:assets`
   - Result: **20 referenced assets verified (2,904,955 bytes)**.
6. **Content Validation Foundation Check:**
   - Command: `npm run check:content`
   - Result: **Live catalog verified (17 demo edits, 0 shorts, 0 drift)**.
   - Command: `node scripts/validate-content.mjs --manifest content/manifest.template.json --mode metadata`
   - Result: **Template verified in metadata mode (1 video, 1 short, 0 errors)**.
   - Command: `node scripts/validate-content.mjs --manifest content/manifest.template.json --mode publish`
   - Result: **Correctly rejected publication readiness due to draft status, unverified rights, and missing ffprobe**.
7. **Production Build:**
   - Command: `npm run build`
   - Result: **Vite production bundle built successfully (0 errors, 0 warnings)**.
