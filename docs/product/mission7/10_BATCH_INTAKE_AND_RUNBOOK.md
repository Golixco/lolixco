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
[5. Owner Review & Approval: scripts/review-youtube-batch.mjs]
       │
       ▼
[6. Public Catalog Compilation: scripts/compile-youtube-catalog.mjs]
       │
       ▼
[7. Full Quality Verification Suite]
```

### Step 5: Owner Review & Approval Workflow

Every imported video enters the audit trail as `embed_eligible`, `needs_review`, or `needs_recheck`. Real YouTube items are **never** automatically approved for public catalog compilation merely because they are embeddable. The owner inspects and confirms items explicitly.

#### A. List Pending Records
```bash
node scripts/review-youtube-batch.mjs --list
```

#### B. Inspect Individual YouTube Record
```bash
node scripts/review-youtube-batch.mjs --show <videoId>
```
Displays title, channel creator, duration, privacy status, embeddability, category, fandoms, format hint, conflict warnings, and audit history.

#### C. Approve Individual Items or Entire Batch
```bash
# Approve single item as landscape video:
node scripts/review-youtube-batch.mjs --approve <videoId> --format video

# Approve single item as portrait Short:
node scripts/review-youtube-batch.mjs --approve <videoId> --format short

# Approve all eligible verified items in an entire batch:
node scripts/review-youtube-batch.mjs --approve-batch 01
```

#### D. Reject an Unsuitable Item
```bash
node scripts/review-youtube-batch.mjs --reject <videoId> --reason "Low audio quality / watermark"
```

### Step 6: Review & Compile Approved Items into Catalog

To inspect the status breakdown of the intake audit log:
```bash
node scripts/compile-youtube-catalog.mjs --review
```

To validate and preview catalog generation in memory without modifying production files:
```bash
node scripts/compile-youtube-catalog.mjs
# or explicitly: node scripts/compile-youtube-catalog.mjs --preview
```

To publish approved items to the live production catalog (`src/data/edits.ts`):
```bash
node scripts/compile-youtube-catalog.mjs --publish
```

This updates `src/data/edits.ts` deterministically:
- IDs 0–16: Baseline original demo edits (strictly preserved).
- IDs 100–199: Curated landscape YouTube edits.
- IDs 200–299: Curated portrait YouTube Shorts.
- Fail-closed validation against mocks, private/unembeddable videos, duplicate IDs, unregistered fandoms, and incomplete metadata.
- All internal audit notes and secrets are completely stripped.
- Two-file write sequence is transactional: if catalog write or audit persistence fails, automatic rollback restores prior state.

### Step 7: Verify Catalog & System Integrity
```bash
npm test
npm run typecheck
python3 -m unittest discover -s server/recsys/tests -v
python3 -m server.recsys.export_catalog --check
npm run check:assets
npm run check:content
npm run build
```

## 5. Local Backup & Rollback Procedure

Because `content/audit/youtube-intake-audit.json` contains private ingestion records and is gitignored, rollback does **not** rely on Git history. A local automated backup mechanism is built into the workflow.

1. **Automatic Timestamped Backups**: Every write to the audit trail creates a timestamped snapshot in `content/audit/backups/`, e.g.:
   `content/audit/backups/youtube-intake-audit.2026-10-19T12-30-00-000Z.bak.json`
2. **Restoring a Previous Audit Snapshot**:
   ```bash
   node scripts/review-youtube-batch.mjs --restore content/audit/backups/<backup-file>.json
   ```
3. **Re-compiling Live Catalog**:
   ```bash
   node scripts/compile-youtube-catalog.mjs --publish
   ```
4. Verify system integrity:
   ```bash
   npm run check:content
   npm test
   ```
