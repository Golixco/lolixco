# Owner Batch Intake & Operator Runbook

## 1. Overview

This runbook guides the owner through submitting batches of up to 10 curated YouTube video and Shorts URLs, reviewing metadata, and publishing them to Lolixco without service disruption or manual coding.

## 2. Environment Configuration

Ensure a valid Google YouTube Data API v3 key is configured in your local environment or `.env`:

```bash
# Copy template
cp .env.example .env

# Set your API key in .env
YOUTUBE_API_KEY=AIzaSy...your_real_key_here
```

> **Security Note**: Never commit `.env` or paste the key into git-tracked files. Metadata retrieval occurs solely via Node.js CLI tools and is never bundled into client Vite code.

## 3. Preparing a Batch

Batches are limited to **at most 10 URLs** per submission.

### Option A: Uniform Domain Batch (Text File)
Create a text file, e.g., `batch-01.txt`:
```text
https://www.youtube.com/watch?v=dQw4w9WgXcQ
https://youtu.be/7wtfhZwyrcc
https://www.youtube.com/shorts/3JZ_D3ELwOQ
```

Run the intake tool specifying the batch category and fandom:
```bash
node scripts/youtube-importer.mjs \
  --batch 01 \
  --category Gaming \
  --fandom valorant \
  --input batch-01.txt
```

### Option B: Mixed Batch (JSON File)
Create a JSON file, e.g., `batch-01-mixed.json`:
```json
[
  {
    "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "category": "Gaming",
    "fandom": "valorant"
  },
  {
    "url": "https://www.youtube.com/shorts/7wtfhZwyrcc",
    "category": "Anime",
    "fandom": "jujutsu-kaisen"
  }
]
```

Run the intake tool:
```bash
node scripts/youtube-importer.mjs \
  --batch 01 \
  --input batch-01-mixed.json
```

## 4. Execution Workflow

```
[1. URL Intake & Canonicalization]
       │
       ▼
[2. API Metadata Fetch (videos.list)]
       │
       ▼
[3. Editorial Classification & Conflict Check]
       │
       ▼
[4. Audit Trail Log: content/audit/youtube-intake-audit.json]
       │
       ▼
[5. Public Catalog Compilation: scripts/compile-youtube-catalog.mjs]
       │
       ▼
[6. Full Quality Verification Suite]
```

### Step 5: Compile Approved Items into Catalog
Once items in the audit log have status `approved`:
```bash
node scripts/compile-youtube-catalog.mjs
```
This updates `src/data/edits.ts` deterministically:
- IDs 0–16: Baseline original demo edits (preserved).
- IDs 100–199: Curated landscape YouTube edits.
- IDs 200–299: Curated portrait YouTube Shorts.
- All internal audit notes and secrets are completely stripped.

### Step 6: Verify Catalog & System Integrity
```bash
npm test
npm run typecheck
python3 -m unittest discover -s server/recsys/tests -v
python3 -m server.recsys.export_catalog --check
npm run check:assets
npm run check:content
npm run build
```

## 5. Rollback Procedure

If a batch needs to be revoked or re-processed:
1. Revert `content/audit/youtube-intake-audit.json` to the previous git commit.
2. Re-run `node scripts/compile-youtube-catalog.mjs`.
3. Verify that the production catalog cleanly returns to the expected state.
