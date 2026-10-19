import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, existsSync, rmSync, mkdtempSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, "..");

import {
  compileYouTubeCatalog,
  CANONICAL_OUTPUT_PATH,
} from "../scripts/compile-youtube-catalog.mjs";
import {
  ingestYouTubeBatch,
  createAuditBackup,
  safeAtomicWriteFileSync,
} from "../scripts/youtube-importer.mjs";
import {
  approveReviewItem,
  rejectReviewItem,
  approveBatch,
  confirmItemFormat,
  runReviewCli,
} from "../scripts/review-youtube-batch.mjs";
import { isYouTubeEmbed, isLocalDemo } from "../src/data/edits.ts";

function createTempDir() {
  return mkdtempSync(join(tmpdir(), "lolixco-v5-test-"));
}

function makeValidAuditItem(canonicalVideoId, overrides = {}) {
  const now = new Date().toISOString();
  return {
    canonicalVideoId,
    canonicalUrl: `https://www.youtube.com/watch?v=${canonicalVideoId}`,
    submittedUrl: `https://youtu.be/${canonicalVideoId}`,
    ownerCategory: "Gaming",
    category: "Gaming",
    fandomIds: ["valorant"],
    ownerFandomIds: ["valorant"],
    format: "video",
    inferredFormat: "video",
    confirmedFormat: "video",
    formatConfirmed: true,
    contentReviewStatus: "embed_eligible",
    assignedLolixcoId: null,
    provenance: "youtube_data_api_v3",
    metadataFetchStatus: "fetched",
    lastMetadataVerification: now,
    auditHistory: [
      {
        date: now,
        event: "import",
        notes: "Initial import",
      },
    ],
    metadata: {
      canonicalVideoId,
      provenance: "youtube_data_api_v3",
      title: `Valid Title for ${canonicalVideoId}`,
      description: "A valid cinematic gaming edit.",
      channelTitle: "Test Creator",
      channelId: "UCtestChannel1234567890",
      publishedAt: "2024-01-01T00:00:00Z",
      durationFormatted: "1:30",
      durationSec: 90,
      durationSeconds: 90,
      thumbnailUrl: `https://i.ytimg.com/vi/${canonicalVideoId}/hqdefault.jpg`,
      embeddable: true,
      privacyStatus: "public",
      tags: ["gaming", "valorant"],
      hashtags: [],
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// FIX A: Distinguish incomplete API responses from deleted videos
// ---------------------------------------------------------------------------

test("V5 FIX A1: Incomplete API response preserves published item and last verified metadata", async () => {
  const tempDir = createTempDir();
  const testAuditPath = join(tempDir, "audit-fix-a1.json");

  const originalVerification = "2026-10-01T12:00:00.000Z";
  const publishedItem = makeValidAuditItem("pubItemA111", {
    contentReviewStatus: "published",
    assignedLolixcoId: 100,
    lastMetadataVerification: originalVerification,
    metadata: {
      canonicalVideoId: "pubItemA111",
      provenance: "youtube_data_api_v3",
      title: "Original Verified Published Title",
      channelTitle: "Original Creator",
      durationFormatted: "2:00",
      durationSec: 120,
      embeddable: true,
      privacyStatus: "public",
    },
  });

  const auditDoc = {
    version: "1.0.0",
    lastUpdated: new Date().toISOString(),
    items: [publishedItem],
  };
  writeFileSync(testAuditPath, JSON.stringify(auditDoc, null, 2), "utf8");

  // Ingest batch with published item (returns incomplete) + new valid item (returns full metadata)
  const result = await ingestYouTubeBatch({
    batchInput: [
      "https://www.youtube.com/watch?v=pubItemA111",
      "https://www.youtube.com/watch?v=newItemA222",
    ],
    batchId: "v5-test-a1",
    category: "Gaming",
    fandom: "valorant",
    auditFilePath: testAuditPath,
    customMockMetadata: {
      pubItemA111: {
        incomplete: true, // Inconclusive / incomplete API response
      },
      newItemA222: {
        canonicalVideoId: "newItemA222",
        provenance: "youtube_data_api_v3",
        title: "Brand New Video Title",
        channelTitle: "New Creator",
        durationFormatted: "1:45",
        durationSec: 105,
        embeddable: true,
        privacyStatus: "public",
      },
    },
  });

  assert.equal(result.success, true);
  const updatedDoc = JSON.parse(readFileSync(testAuditPath, "utf8"));
  const updatedPublished = updatedDoc.items.find((i) => i.canonicalVideoId === "pubItemA111");
  const newlyAdded = updatedDoc.items.find((i) => i.canonicalVideoId === "newItemA222");

  // 1. Published item is NOT marked unavailable
  assert.equal(updatedPublished.contentReviewStatus, "published");
  // 2. Last verified metadata preserved
  assert.equal(updatedPublished.metadata.title, "Original Verified Published Title");
  // 3. lastMetadataVerification NOT updated
  assert.equal(updatedPublished.lastMetadataVerification, originalVerification);
  // 4. Retry scheduled and warning recorded
  assert.equal(updatedPublished.retryRequired, true);
  assert.ok(
    updatedPublished.validationWarnings.some((w) => w.includes("Inconclusive metadata")),
    "Must record warning about inconclusive refresh"
  );
  // 5. Other item in batch processed successfully
  assert.ok(newlyAdded);
  assert.equal(newlyAdded.contentReviewStatus, "embed_eligible");
  assert.equal(newlyAdded.metadata.title, "Brand New Video Title");
});

test("V5 FIX A2: Confirmed unavailable video correctly transitions to unavailable", async () => {
  const tempDir = createTempDir();
  const testAuditPath = join(tempDir, "audit-fix-a2.json");

  const publishedItem = makeValidAuditItem("pubGone0001", {
    contentReviewStatus: "published",
    assignedLolixcoId: 100,
  });

  const auditDoc = {
    version: "1.0.0",
    lastUpdated: new Date().toISOString(),
    items: [publishedItem],
  };
  writeFileSync(testAuditPath, JSON.stringify(auditDoc, null, 2), "utf8");

  const result = await ingestYouTubeBatch({
    batchInput: ["https://www.youtube.com/watch?v=pubGone0001"],
    batchId: "v5-test-a2",
    category: "Gaming",
    fandom: "valorant",
    auditFilePath: testAuditPath,
    customMockMetadata: {
      pubGone0001: null, // Confirmed 404 / deleted / not found
    },
  });

  assert.equal(result.success, true);
  const updatedDoc = JSON.parse(readFileSync(testAuditPath, "utf8"));
  const updatedItem = updatedDoc.items.find((i) => i.canonicalVideoId === "pubGone0001");
  assert.equal(updatedItem.contentReviewStatus, "unavailable");
});

test("V5 FIX A3: Quota exceeded failure is retryable and does not mark published item unavailable", async () => {
  const tempDir = createTempDir();
  const testAuditPath = join(tempDir, "audit-fix-a3.json");

  const publishedItem = makeValidAuditItem("pubQuota001", {
    contentReviewStatus: "published",
    assignedLolixcoId: 100,
  });

  const auditDoc = {
    version: "1.0.0",
    lastUpdated: new Date().toISOString(),
    items: [publishedItem],
  };
  writeFileSync(testAuditPath, JSON.stringify(auditDoc, null, 2), "utf8");

  const result = await ingestYouTubeBatch({
    batchInput: ["https://www.youtube.com/watch?v=pubQuota001"],
    batchId: "v5-test-a3",
    auditFilePath: testAuditPath,
    customMockMetadata: {
      pubQuota001: {
        quotaExceeded: true, // Quota error
      },
    },
  });

  assert.equal(result.success, true);
  const updatedDoc = JSON.parse(readFileSync(testAuditPath, "utf8"));
  const updatedItem = updatedDoc.items.find((i) => i.canonicalVideoId === "pubQuota001");
  assert.equal(updatedItem.contentReviewStatus, "published");
  assert.equal(updatedItem.retryRequired, true);
});

// ---------------------------------------------------------------------------
// FIX B: Never reuse previously allocated Lolixco IDs
// ---------------------------------------------------------------------------

test("V5 FIX B1: Unavailable, rejected, or needs_recheck items retain reserved IDs; new items do not steal them", async () => {
  const tempDir = createTempDir();
  const testAuditPath = join(tempDir, "audit-fix-b1.json");
  const testOutPath = join(tempDir, "edits-fix-b1.ts");

  // Video A: historically assigned ID 100, now unavailable
  const itemA = makeValidAuditItem("vidA_unav01", {
    assignedLolixcoId: 100,
    contentReviewStatus: "unavailable",
    format: "video",
  });

  // Video B: historically assigned ID 101, now rejected
  const itemB = makeValidAuditItem("vidB_reje01", {
    assignedLolixcoId: 101,
    contentReviewStatus: "rejected",
    format: "video",
  });

  // Video C: newly approved landscape video without assignedLolixcoId
  const itemC = makeValidAuditItem("vidC_appr01", {
    assignedLolixcoId: null,
    contentReviewStatus: "approved",
    format: "video",
    ownerCategory: "Gaming",
    fandomIds: ["valorant"],
  });

  const auditDoc = {
    version: "1.0.0",
    lastUpdated: new Date().toISOString(),
    items: [itemA, itemB, itemC],
  };
  writeFileSync(testAuditPath, JSON.stringify(auditDoc, null, 2), "utf8");

  const compileRes = await compileYouTubeCatalog({
    auditFilePath: testAuditPath,
    outputPath: testOutPath,
    dryRun: false,
    allowMocks: false,
  });

  assert.equal(compileRes.success, true);
  // Video C must NOT steal ID 100 or ID 101! It must receive ID 102
  const compiledEdits = compileRes.compiledEdits;
  const editC = compiledEdits.find((e) => e.youtubeVideoId === "vidC_appr01");
  assert.ok(editC);
  assert.equal(editC.id, 102, "Video C must receive next available unreserved ID (102), not 100 or 101");
});

test("V5 FIX B2: Recovered video reclaims its original stable ID", async () => {
  const tempDir = createTempDir();
  const testAuditPath = join(tempDir, "audit-fix-b2.json");
  const testOutPath = join(tempDir, "edits-fix-b2.ts");

  // Video A was previously assigned ID 100, recovered and approved
  const itemA = makeValidAuditItem("vidA_reco01", {
    assignedLolixcoId: 100,
    contentReviewStatus: "approved",
    format: "video",
  });

  // Video B newly approved
  const itemB = makeValidAuditItem("vidB_newi01", {
    assignedLolixcoId: null,
    contentReviewStatus: "approved",
    format: "video",
  });

  const auditDoc = {
    version: "1.0.0",
    lastUpdated: new Date().toISOString(),
    items: [itemA, itemB],
  };
  writeFileSync(testAuditPath, JSON.stringify(auditDoc, null, 2), "utf8");

  const compileRes = await compileYouTubeCatalog({
    auditFilePath: testAuditPath,
    outputPath: testOutPath,
    dryRun: false,
  });

  assert.equal(compileRes.success, true);
  const editA = compileRes.compiledEdits.find((e) => e.youtubeVideoId === "vidA_reco01");
  const editB = compileRes.compiledEdits.find((e) => e.youtubeVideoId === "vidB_newi01");

  assert.equal(editA.id, 100, "Recovered video must reclaim original ID 100");
  assert.equal(editB.id, 101, "New video must receive ID 101");
});

test("V5 FIX B3: Detects historical duplicate ID ownership and fails closed", async () => {
  const tempDir = createTempDir();
  const testAuditPath = join(tempDir, "audit-fix-b3.json");
  const testOutPath = join(tempDir, "edits-fix-b3.ts");

  // Two different videos fraudulently having the same assignedLolixcoId 100
  const item1 = makeValidAuditItem("video_dup_1", {
    assignedLolixcoId: 100,
    contentReviewStatus: "approved",
  });
  const item2 = makeValidAuditItem("video_dup_2", {
    assignedLolixcoId: 100,
    contentReviewStatus: "approved",
  });

  const auditDoc = {
    version: "1.0.0",
    lastUpdated: new Date().toISOString(),
    items: [item1, item2],
  };
  writeFileSync(testAuditPath, JSON.stringify(auditDoc, null, 2), "utf8");

  const compileRes = await compileYouTubeCatalog({
    auditFilePath: testAuditPath,
    outputPath: testOutPath,
    dryRun: false,
  });

  assert.equal(compileRes.success, false);
  assert.ok(
    compileRes.errors.some((e) => e.includes("Historical duplicate Lolixco ID")),
    "Must fail closed on duplicate historical ID ownership"
  );
});

// ---------------------------------------------------------------------------
// FIX C: Require explicit Shorts format confirmation
// ---------------------------------------------------------------------------

test("V5 FIX C1: Candidate portrait Short cannot be approved without recorded manual confirmation", async () => {
  const tempDir = createTempDir();
  const testAuditPath = join(tempDir, "audit-fix-c1.json");

  // Candidate short in needs_review with format: short, but formatConfirmed: false
  const unconfirmedShort = makeValidAuditItem("unconfSho01", {
    contentReviewStatus: "needs_review",
    format: "short",
    inferredFormat: "short",
    formatConfirmed: false,
    confirmedFormat: null,
    metadata: {
      canonicalVideoId: "unconfSho01",
      provenance: "youtube_data_api_v3",
      title: "Candidate Short Edit",
      channelTitle: "Shorts Creator",
      durationFormatted: "0:45",
      durationSec: 45,
      embeddable: true,
      privacyStatus: "public",
    },
  });

  const auditDoc = {
    version: "1.0.0",
    lastUpdated: new Date().toISOString(),
    items: [unconfirmedShort],
  };
  writeFileSync(testAuditPath, JSON.stringify(auditDoc, null, 2), "utf8");

  // 1. approveReviewItem without format confirmation must fail
  const singleApprove = await approveReviewItem("unconfSho01", { auditFilePath: testAuditPath });
  assert.equal(singleApprove.success, false);
  assert.ok(
    singleApprove.errors.some((e) => e.includes("Candidate portrait Short requires recorded manual format confirmation")),
    "Must block approval of unconfirmed portrait Short"
  );

  // 2. approveBatch must also block unconfirmed portrait Short
  const batchApprove = await approveBatch([ "unconfSho01" ], { auditFilePath: testAuditPath });
  assert.equal(batchApprove.success, false);
});

test("V5 FIX C2: Explicit confirmation permits approval and records format confirmation audit event", async () => {
  const tempDir = createTempDir();
  const testAuditPath = join(tempDir, "audit-fix-c2.json");

  const unconfirmedShort = makeValidAuditItem("confShort01", {
    contentReviewStatus: "needs_review",
    format: "short",
    inferredFormat: "short",
    formatConfirmed: false,
    metadata: {
      canonicalVideoId: "confShort01",
      provenance: "youtube_data_api_v3",
      title: "Confirmed Short Title",
      channelTitle: "Creator",
      durationFormatted: "0:30",
      durationSec: 30,
      embeddable: true,
      privacyStatus: "public",
    },
  });

  const auditDoc = {
    version: "1.0.0",
    lastUpdated: new Date().toISOString(),
    items: [unconfirmedShort],
  };
  writeFileSync(testAuditPath, JSON.stringify(auditDoc, null, 2), "utf8");

  // 1. Explicitly confirm format
  const confRes = await confirmItemFormat("confShort01", "short", {
    auditFilePath: testAuditPath,
    notes: "Confirmed 9:16 portrait on mobile device",
  });
  assert.equal(confRes.success, true);
  assert.equal(confRes.confirmedFormat, "short");
  assert.equal(confRes.formatConfirmed, true);

  // 2. Now approveReviewItem succeeds
  const approveRes = await approveReviewItem("confShort01", { auditFilePath: testAuditPath });
  assert.equal(approveRes.success, true);
  assert.equal(approveRes.newStatus, "approved");

  // 3. Check audit history contains format_confirmation event
  const updatedDoc = JSON.parse(readFileSync(testAuditPath, "utf8"));
  const item = updatedDoc.items.find((i) => i.canonicalVideoId === "confShort01");
  assert.ok(item.auditHistory.some((h) => h.event === "format_confirmation"));
});

test("V5 FIX C3: Rejects format changes conflicting with existing stable ID ranges", async () => {
  const tempDir = createTempDir();
  const testAuditPath = join(tempDir, "audit-fix-c3.json");

  // Landscape video with assignedLolixcoId 100
  const landscapeItem = makeValidAuditItem("landRang100", {
    assignedLolixcoId: 100,
    format: "video",
    confirmedFormat: "video",
    formatConfirmed: true,
  });

  const auditDoc = {
    version: "1.0.0",
    lastUpdated: new Date().toISOString(),
    items: [landscapeItem],
  };
  writeFileSync(testAuditPath, JSON.stringify(auditDoc, null, 2), "utf8");

  // Attempt to confirm format as short on an ID 100 item
  const confRes = await confirmItemFormat("landRang100", "short", { auditFilePath: testAuditPath });
  assert.equal(confRes.success, false);
  assert.ok(
    confRes.errors.some((e) => e.includes("Format changes conflicting with stable ID ranges are prohibited")),
    "Must reject format change to short for ID in landscape range [100..199]"
  );

  // Attempt to approve as short
  const appRes = await approveReviewItem("landRang100", { format: "short", auditFilePath: testAuditPath });
  assert.equal(appRes.success, false);
  assert.ok(
    appRes.errors.some((e) => e.includes("Format changes conflicting with stable ID ranges are prohibited")),
    "Must reject approval as short for ID in landscape range [100..199]"
  );
});

// ---------------------------------------------------------------------------
// FIX D: Preserve editorial classifications when refreshing URLs
// ---------------------------------------------------------------------------

test("V5 FIX D1: Refreshing published video by URL alone preserves stored taxonomy and status", async () => {
  const tempDir = createTempDir();
  const testAuditPath = join(tempDir, "audit-fix-d1.json");

  const publishedItem = makeValidAuditItem("pubTaxon001", {
    contentReviewStatus: "published",
    category: "Movies",
    ownerCategory: "Movies",
    fandomIds: ["spider-man"],
    ownerFandomIds: ["spider-man"],
    format: "video",
    assignedLolixcoId: 105,
  });

  const auditDoc = {
    version: "1.0.0",
    lastUpdated: new Date().toISOString(),
    items: [publishedItem],
  };
  writeFileSync(testAuditPath, JSON.stringify(auditDoc, null, 2), "utf8");

  // Re-import with URL only (no category, no fandom passed)
  const result = await ingestYouTubeBatch({
    batchInput: ["https://www.youtube.com/watch?v=pubTaxon001"],
    batchId: "v5-refresh-d1",
    auditFilePath: testAuditPath,
    customMockMetadata: {
      pubTaxon001: {
        canonicalVideoId: "pubTaxon001",
        provenance: "youtube_data_api_v3",
        title: publishedItem.metadata.title,
        channelTitle: publishedItem.metadata.channelTitle,
        durationFormatted: publishedItem.metadata.durationFormatted,
        durationSec: publishedItem.metadata.durationSec,
        embeddable: true,
        privacyStatus: "public",
      },
    },
  });

  assert.equal(result.success, true);
  const updatedDoc = JSON.parse(readFileSync(testAuditPath, "utf8"));
  const item = updatedDoc.items.find((i) => i.canonicalVideoId === "pubTaxon001");

  // Stored category and fandom are preserved!
  assert.equal(item.category, "Movies");
  assert.deepEqual(item.fandomIds, ["spider-man"]);
  // Review status is preserved as published (NOT erased or degraded to needs_recheck)
  assert.equal(item.contentReviewStatus, "published");
});

test("V5 FIX D2: Explicit category change transitions approved item to needs_recheck", async () => {
  const tempDir = createTempDir();
  const testAuditPath = join(tempDir, "audit-fix-d2.json");

  const approvedItem = makeValidAuditItem("appTaxon002", {
    contentReviewStatus: "approved",
    category: "Gaming",
    ownerCategory: "Gaming",
    fandomIds: ["valorant"],
  });

  const auditDoc = {
    version: "1.0.0",
    lastUpdated: new Date().toISOString(),
    items: [approvedItem],
  };
  writeFileSync(testAuditPath, JSON.stringify(auditDoc, null, 2), "utf8");

  // Explicitly pass category: "Anime"
  const result = await ingestYouTubeBatch({
    batchInput: [
      {
        url: "https://www.youtube.com/watch?v=appTaxon002",
        category: "Anime",
        fandom: "demon-slayer",
      },
    ],
    batchId: "v5-override-d2",
    auditFilePath: testAuditPath,
    customMockMetadata: {
      appTaxon002: {
        canonicalVideoId: "appTaxon002",
        provenance: "youtube_data_api_v3",
        title: "Reclassified Edit",
        channelTitle: "Creator",
        durationFormatted: "1:30",
        durationSec: 90,
        embeddable: true,
        privacyStatus: "public",
      },
    },
  });

  assert.equal(result.success, true);
  const updatedDoc = JSON.parse(readFileSync(testAuditPath, "utf8"));
  const item = updatedDoc.items.find((i) => i.canonicalVideoId === "appTaxon002");

  // Explicit reclassification triggers needs_recheck
  assert.equal(item.contentReviewStatus, "needs_recheck");
  assert.equal(item.category, "Anime");
  assert.deepEqual(item.fandomIds, ["demon-slayer"]);
});

// ---------------------------------------------------------------------------
// FIX E: CLI Aliases & Consistency
// ---------------------------------------------------------------------------

test("V5 FIX E1: Importer supports --batch-id and --batch-file aliases", async () => {
  const tempDir = createTempDir();
  const testAuditPath = join(tempDir, "audit-fix-e1.json");
  const testBatchFile = join(tempDir, "urls.txt");

  writeFileSync(testBatchFile, "https://www.youtube.com/watch?v=batchAlia01\n", "utf8");
  const auditDoc = { version: "1.0.0", lastUpdated: new Date().toISOString(), items: [] };
  writeFileSync(testAuditPath, JSON.stringify(auditDoc, null, 2), "utf8");

  // Run importer using aliases
  const result = await ingestYouTubeBatch({
    "batch-file": testBatchFile,
    "batch-id": "alias-batch-01",
    auditFilePath: testAuditPath,
    category: "Gaming",
    fandom: "valorant",
    customMockMetadata: {
      batchAlia01: {
        canonicalVideoId: "batchAlia01",
        provenance: "youtube_data_api_v3",
        title: "Alias Test Title",
        channelTitle: "Alias Creator",
        durationFormatted: "1:00",
        durationSec: 60,
        embeddable: true,
        privacyStatus: "public",
      },
    },
  });

  assert.equal(result.success, true);
  const updatedDoc = JSON.parse(readFileSync(testAuditPath, "utf8"));
  assert.equal(updatedDoc.items.length, 1);
  assert.equal(updatedDoc.items[0].canonicalVideoId, "batchAlia01");
});

// ---------------------------------------------------------------------------
// FIX F: Backup failure visibility
// ---------------------------------------------------------------------------

test("V5 FIX F1: createAuditBackup throws actionable error when backup target path is invalid", () => {
  const tempDir = createTempDir();
  const testAuditPath = join(tempDir, "audit-fix-f1.json");
  writeFileSync(testAuditPath, JSON.stringify({ version: "1.0.0", lastUpdated: new Date().toISOString(), items: [] }), "utf8");
  
  // Create 'backups' as a regular file so mkdirSync(backupDir) fails
  writeFileSync(join(tempDir, "backups"), "blocking file", "utf8");

  assert.throws(
    () => {
      createAuditBackup(testAuditPath);
    },
    (err) => {
      return err.message.includes("Failed to create audit backup");
    }
  );
});

test("V5 FIX F2: Operations fail closed without mutating files when audit backup throws", async () => {
  const tempDir = createTempDir();
  const testAuditPath = join(tempDir, "audit-fix-f2.json");

  const originalDoc = {
    version: "1.0.0",
    lastUpdated: "2026-10-01T00:00:00.000Z",
    items: [
      makeValidAuditItem("origItemF22", {
        contentReviewStatus: "needs_review",
      }),
    ],
  };
  writeFileSync(testAuditPath, JSON.stringify(originalDoc, null, 2), "utf8");

  // Create backups directory as a file to force backup failure
  writeFileSync(join(tempDir, "backups"), "not a directory", "utf8");

  // Attempting to approve must fail closed and NOT mutate the file
  const approveRes = await approveReviewItem("origItemF22", {
    auditFilePath: testAuditPath,
    format: "video",
  });

  assert.equal(approveRes.success, false);
  assert.ok(
    approveRes.errors.some((e) => e.includes("Audit backup failure")),
    "Must report actionable backup error"
  );

  // Audit file must remain unchanged
  const readBack = JSON.parse(readFileSync(testAuditPath, "utf8"));
  assert.equal(readBack.items[0].contentReviewStatus, "needs_review");
});
