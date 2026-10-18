# Mission 7A — Content Ingestion Runbook

This runbook describes the step-by-step operational procedure for ingesting the first batch of owner-provided landscape videos and portrait Shorts into Lolixco.

---

## Prerequisites

1. Working branch created from verified `main`.
2. Clean working tree (`git status` is clean).
3. Owner media assets received (video files in `.mp4` or `.webm`, posters in `.webp` or `.png`).
4. Metadata completed in a working copy of [`content/manifest.template.json`](file:///home/vuld0/Lolixco/content/manifest.template.json).

---

## Phase 1 — Asset Staging

### Step 1.1: Organize Asset Files
Place incoming media assets in the following designated directories:
```
public/
  media/
    videos/
      video-100-<slug>.mp4
      short-200-<slug>.mp4
    posters/
      video-100-<slug>.webp
      short-200-<slug>.webp
```

*File naming convention:* Lowercase alphanumeric slugs prefixed with format and ID (e.g. `video-100-gojo-domain.mp4`, `short-200-jett-ace.mp4`).

### Step 1.2: Check Asset Headers and Dimensions
Verify that video and poster files have valid headers and proper aspect ratios:
```bash
# Check video streams
ffprobe -v error -select_streams v:0 \
  -show_entries stream=width,height,codec_name,duration \
  public/media/videos/*.mp4

# Verify landscape video dimensions (must be 16:9, e.g. 1920x1080)
# Verify portrait short dimensions (must be 9:16, e.g. 1080x1920)
```

---

## Phase 2 — Manifest Authoring

### Step 2.1: Populate Manifest File
Copy the template to `content/manifest.json`:
```bash
cp content/manifest.template.json content/manifest.json
```

### Step 2.2: Fill in Record Details
For each new item:
1. Assign unique integer ID:
   - Landscape videos: `100` to `199`.
   - Portrait shorts: `200` to `299`.
2. Specify format: `"video"` or `"short"`.
3. Choose canonical category: `"Anime" | "Movies" | "Series" | "Multifandom" | "Gaming" | "Phonk"`.
4. Associate registered fandom slug IDs (e.g. `["jujutsu-kaisen"]`, `["valorant"]`). If introducing a new fandom, first declare it in `src/data/fandoms.ts`.
5. Add search tags (lowercase alphanumeric, no `#`).
6. Specify asset paths: `/media/videos/...` and `/media/posters/...`.
7. Fill in duration (`"0:32"`).
8. Record rights clearance and curator notes under the `editorial` block.

---

## Phase 3 — Validation Gate

### Step 3.1: Run Manifest and Asset Validation
Run the content validation tool against the new manifest:
```bash
npm run check:content -- --manifest content/manifest.json
```

Verify that:
- Zero errors are reported.
- IDs are unique and do not collide with demo IDs `0-16`.
- Fandom associations match `FANDOM_REGISTRY`.
- Aspect ratios match formats (16:9 for videos, 9:16 for shorts).
- Asset files exist on disk and possess valid magic bytes.

### Step 3.2: Verify Local Asset Registry
Run the core asset validator:
```bash
npm run check:assets
```

---

## Phase 4 — Catalog Compilation & Recsys Sync

### Step 4.1: Project Public Metadata into `src/data/edits.ts`
Append the validated public records (using `projectToPublicEdit` or structured export) to `src/data/edits.ts`.

*Invariant check:* Verify that no private editorial metadata (`curatorNotes`, `reviewStatus`, `rightsCleared`, `sourceAttribution`) is present in `src/data/edits.ts`.

### Step 4.2: Update Recommendation Engine Snapshot
When transitioning to `catalog-v2`:
```bash
python3 server/recsys/export_catalog.py
```
Confirm the output:
```
Catalog synced successfully to server/recsys/catalog_snapshot.json
```

Verify zero drift:
```bash
python3 server/recsys/export_catalog.py --check
```

---

## Phase 5 — Full Verification Suite

Execute the six mandatory quality gates:

```bash
# 1. Frontend unit and navigation tests
npm test

# 2. TypeScript compilation check
npm run typecheck

# 3. Python recommendation test suite
python3 -m unittest discover -s server/recsys/tests -v

# 4. Catalog snapshot drift check
python3 server/recsys/export_catalog.py --check

# 5. Asset integrity check
npm run check:assets

# 6. Content catalog validation
npm run check:content

# 7. Production bundle build
npm run build
```

All 7 gates must pass with exit code `0`.

---

## Phase 6 — Browser Smoke Testing

Start the local development server:
```bash
npm run dev
```

Inspect in the browser:
1. **Home Feed:** Confirm Recommended Edits row contains landscape videos. Confirm Curated Shorts shelf appears (since Shorts count > 0) with vertical cards.
2. **Shorts Shelf:** Click a Short card. Confirm `ShortsViewer` opens in portrait mode with the correct short active.
3. **Shorts Navigation:** Test swipe / arrow down to next Short. Confirm seamless looping and audio mute/unmute.
4. **Hashtag Navigation:** Click a hashtag chip on a Short card. Confirm viewer closes and navigates to Explore search for that tag.
5. **Video Playback:** Open a landscape video. Confirm VideoPlayer plays smoothly, pauses when Shorts overlay opens, and resumes without audio collision.
6. **Search:** Search for a title, fandom, and tag. Confirm results show appropriate format badges.
