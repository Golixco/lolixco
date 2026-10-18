# Mission 7A — Decision Log and Owner Requirements

## 1. Architectural Decisions Made in Mission 7A

| ID | Topic | Decision | Rationale |
| :--- | :--- | :--- | :--- |
| **DEC-701** | Content Manifest Format | JSON manifest with strict JSON Schema (`content/manifest.schema.json`) and sample template (`content/manifest.template.json`). | Avoids having non-engineers write raw TypeScript. Enables automated schema validation before code generation. |
| **DEC-702** | ID Allocation Strategy | Retain IDs `0–16` for legacy demo edits. Allocate `100–199` for curated landscape videos and `200–299` for portrait Shorts. | Eliminates collision risks. Makes content format identifiable by ID prefix across logs, analytics, and URLs. |
| **DEC-703** | Public vs. Private Separation | Private curation data (`reviewStatus`, `rightsCleared`, `sourceAttribution`, `curatorNotes`) is isolated in an `editorial` namespace. | Strictly prevents creator identities, license terms, or internal notes from leaking into client-side bundles or search indexes. |
| **DEC-704** | Python Recsys Stability | Freeze `server/recsys/catalog_snapshot.json` and `export_catalog.py` during Mission 7A. Document the migration path to `catalog-v2` for Mission 7B. | Prevents premature breaking changes to production recommendation contracts while no real media is yet present. |
| **DEC-705** | Production Shorts Zero-State | Production catalog retains exactly 0 Shorts. No synthetic or placeholder Shorts are placed in `src/data/edits.ts`. | Preserves integrity of feed composition tests and avoids shipping fabricated content to production. |
| **DEC-706** | Validation Utility | Lightweight, zero-dependency Node script (`scripts/validate-content.mjs`) checking IDs, format, taxonomy, asset magic bytes, and aspect ratios. | Provides deterministic, instant validation in CI (`npm run check:content`) without external binary dependencies. |

---

## 2. Risk Assessment and Mitigation

| Risk | Impact | Likelihood | Mitigation |
| :--- | :--- | :--- | :--- |
| **Asset Corruption / Unplayable Codec** | Video fails to play; error overlay shown in player. | Medium | Validation utility inspects MP4 `ftyp` / WebM magic bytes; runbook mandates ffprobe codec inspection and H.264/AAC baseline. |
| **Audio Loudness Imbalance** | Jarring volume spikes between phonk and dialogue edits. | High | Audio specification mandates `-14 LKFS / LUFS` integrated loudness and `-1.0 dBFS` true peak with ffmpeg loudnorm recipe. |
| **Recsys Snapshot Drift** | CI failure on push due to Python drift detection. | High | Strict two-step migration documented in `04_CATALOG_SYNC_AND_VERSIONING.md`; `export_catalog.py` runs before PR creation. |
| **Creator Identity Leakage** | Platform privacy violation if uncredited/private creators are indexed. | Medium | Automated validation test verifies that `projectToPublicEdit` strips all editorial keys and sets `creator: "Lolixco curated"`. |
| **Fandom Taxonomy Disconnect** | Owner submits edits for anime/games not in `FANDOM_REGISTRY`. | Low | Runbook instructs registering new fandom slugs in `src/data/fandoms.ts` prior to catalog compilation. |

---

## 3. Information Required from Owner Before Batch 1 Ingestion

To begin ingesting the target ~50 landscape videos and ~20 portrait Shorts, the engineering team requires the following specifics from the content owner:

### 3.1 Media Asset Package
1. **Landscape Video Files:** Up to 50 `.mp4` or `.webm` files (1080p, 16:9, H.264/AAC, `-14 LKFS`).
2. **Portrait Short Files:** Up to 20 `.mp4` or `.webm` files (1080x1920, 9:16, 60fps, `-14 LKFS`).
3. **Poster Cards:** Matching `.webp` or `.png` card images (16:9 for videos, 9:16 for shorts).
4. **Delivery Location:** Secure shared folder, Cloud Storage bucket, or local transfer path.

### 3.2 Content Metadata Sheet / Manifest
For each edit, the owner must provide:
- **Title** (concise, 3–70 characters).
- **Description** (1–2 sentences summarizing the edit scene or style).
- **Category** (`Anime`, `Gaming`, `Movies`, `Series`, `Phonk`, or `Multifandom`).
- **Fandom Association** (e.g. *Jujutsu Kaisen*, *Demon Slayer*, *Spider-Man*, *Valorant*, *Doom*, or new fandom names).
- **3 to 6 Search Hashtags** (e.g. `#jjk`, `#gojo`, `#domain`, `#phonk`).
- **Initial Trending Selection** (which 5–10 edits should be featured on the Trending shelf).

### 3.3 Editorial and Rights Clarifications
1. **Fandom Expansion Approval:**
   Does the owner wish to expand beyond the initial 5 registered fandoms (*Jujutsu Kaisen*, *Demon Slayer*, *Spider-Man*, *Valorant*, *Doom*)? If so, what are the initial display names and descriptions?
2. **Public Creator Display Policy:**
   Confirm whether all public cards should display `"Lolixco curated"` (current default), or if specific approved creator handles should appear in the future once creator account systems exist.
3. **Shorts Launch Composition:**
   Confirm whether all 20 Shorts should launch simultaneously, or if a staged rollout (e.g. 10 at launch, 10 in follow-up updates) is preferred.

---

## 4. Test Results and Verification Summary

All verification gates have been executed on branch `feat/mission7a-content-ingestion`:

1. **Frontend Unit & Integration Tests:**
   - Command: `npm test`
   - Result: **144 tests passed (0 failures, 0 skipped)** across 10 test files.
   - Includes 17 new tests in [`tests/content-validation.test.mjs`](file:///home/vuld0/Lolixco/tests/content-validation.test.mjs) verifying ID validation, format consistency, taxonomy compatibility, asset magic bytes, and privacy protection.
2. **TypeScript Compilation:**
   - Command: `npm run typecheck`
   - Result: **0 type errors**.
3. **Python Recommendation Test Suite:**
   - Command: `python3 -m unittest discover -s server/recsys/tests -v`
   - Result: **53 tests passed in 6.5s**.
4. **Catalog Snapshot Drift Check:**
   - Command: `python3 server/recsys/export_catalog.py --check`
   - Result: **0 drift**. Live catalog matches `catalog_snapshot.json` exactly.
5. **Asset Integrity Check:**
   - Command: `npm run check:assets`
   - Result: **20 referenced assets verified (2,904,955 bytes)**.
6. **Content Validation Foundation Check:**
   - Command: `npm run check:content`
   - Result: **Live catalog verified (17 demo edits, 0 shorts, 0 errors)**.
   - Command: `node scripts/validate-content.mjs --manifest content/manifest.template.json`
   - Result: **Template verified (1 video, 1 short, 0 errors)**.
7. **Production Build:**
   - Command: `npm run build`
   - Result: **Vite production bundle built successfully (0 errors, 0 warnings)**.
