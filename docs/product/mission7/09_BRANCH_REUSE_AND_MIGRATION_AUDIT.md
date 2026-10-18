# Branch Reuse & Migration Audit

## 1. Context & Baseline Audit

- **Baseline SHA**: `acbfda0cd86611aa94ada622e75204fd81f931a3` (merged upstream main).
- **Unmerged Branch**: `feat/mission7b-first-real-batch` (Commit: `c1880c361e28b2d560cc94e440a07cf1ea2bc2ec`).
- **Feature Branch**: `feat/mission7b-youtube-embeds`.

## 2. Classification of Changes

### Category A: Reusable Without Modification
- **Python Recommendation System Schema Extensions**:
  - `server/recsys/types.py`: Added `format: str = "video"`, `fandom_ids: tuple[str, ...] = ()`, and `"Multifandom"` to `CANONICAL_CATEGORIES`.
  - `server/recsys/catalog.py`: Added `format` and `fandomIds` to `ALLOWED_FIELDS` and dictionary parsing.
  - `server/recsys/export_catalog.py`: Added `format` and `fandomIds` to allowed fields.
  - `src/api/recommendations.ts`: Added version tolerance `EXPECTED_CATALOG_VERSIONS: readonly string[] = [EXPECTED_CATALOG_VERSION, "catalog-v2"]`.

### Category B: Reusable After Adaptation for YouTube Embeds
- **Catalog Compilation**:
  - Original `scripts/compile-catalog.mjs` assumed local MP4 files with FFprobe validation.
  - Adapted into `scripts/compile-youtube-catalog.mjs`, which ingests approved YouTube audit trail entries, verifies official 11-char IDs, strips private audit fields, and preserves the 17 baseline demo edits (IDs 0–16).
- **RecSys API Models**:
  - Expanded `server/recsys/types.py` and `server/recsys/api.py` to also support `source_type: str = "local_demo"` and `youtube_video_id: str = ""` so the recommendation engine returns typed source descriptors.
- **Content Metadata Model**:
  - Added `VideoSourceType` union (`local_demo | youtube_embed | licensed_local_media`) to `src/types/content.ts` and `src/data/edits.ts`.

### Category C: Local-Media-Specific Features Retained for Future Creator Uploads
- **FFmpeg/FFprobe Decode Certification**:
  - Kept in `scripts/validate-media.mjs` for future independently hosted creator media (Mission 7A baseline).
  - Deliberately bypassed for YouTube embeds, which stream directly from YouTube's infrastructure and do not have local file streams.
- **Local Asset Hashing & Byte-Size Verification**:
  - Retained in `scripts/check-assets.mjs` for local poster artwork and brand assets.

### Category D: Deliberately Excluded Changes
- **Premature Production Catalog Mutation**:
  - Did not replace `src/data/edits.ts` with unverified placeholder content.
  - Preserved exactly 17 demo edits (IDs 0–16) and 0 shorts.
- **Wholesale Git Cherry-Picking**:
  - Rejected full branch cherry-pick to prevent bringing in obsolete local-storage assumptions.
- **Local Video `<video>` Source Injection for YouTube URLs**:
  - Rejected passing `youtube.com/watch` or `youtu.be` into native HTML5 `<video>` tags.
