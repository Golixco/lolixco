import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, rmSync, mkdtempSync, readdirSync } from "node:fs";
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
  isYouTubeEmbed,
  isLocalDemo,
  getCanonicalSourceUrl,
} from "../src/data/edits.ts";
import {
  ingestYouTubeBatch,
  validateAuditDocument,
  createAuditBackup,
  restoreAuditBackup,
  safeAtomicWriteFileSync,
} from "../scripts/youtube-importer.mjs";
import {
  listPendingReviewItems,
  approveReviewItem,
  rejectReviewItem,
  approveBatch,
} from "../scripts/review-youtube-batch.mjs";
import {
  validateLiveCatalog,
  validateContentRecord,
  projectToPublicEdit,
} from "../scripts/validate-content.mjs";
import { playbackCoordinator } from "../src/utils/playbackCoordinator.ts";
import { FANDOM_REGISTRY } from "../src/data/fandoms.ts";

function createTempDir() {
  return mkdtempSync(join(tmpdir(), "lolixco-v4-test-"));
}

function makeValidAuditItem(canonicalVideoId, overrides = {}) {
  const now = new Date().toISOString();
  const format = overrides.format || "video";
  const isShort = format === "short";
  return {
    canonicalVideoId,
    canonicalUrl: `https://www.youtube.com/watch?v=${canonicalVideoId}`,
    submittedUrl: `https://youtu.be/${canonicalVideoId}`,
    ownerCategory: "Gaming",
    fandomIds: ["valorant"],
    format,
    formatConfirmed: overrides.formatConfirmed !== undefined ? overrides.formatConfirmed : (isShort ? true : false),
    confirmedFormat: overrides.confirmedFormat !== undefined ? overrides.confirmedFormat : (isShort ? "short" : "video"),
    contentReviewStatus: "embed_eligible",
    assignedLolixcoId: null,
    provenance: "youtube_data_api_v3",
    metadataFetchStatus: "fetched",
    lastMetadataVerification: now,
    auditHistory: [
      {
        timestamp: now,
        action: "import",
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
      licensedContent: true,
      madeForKids: false,
    },
    ...overrides,
  };
}

// ===========================================================================
// FIX A: PRESERVE ALREADY-PUBLISHED CONTENT DURING RE-IMPORT
// ===========================================================================
test("V4 FIX A1: Refreshing an unchanged published item preserves published status and stable ID", async () => {
  const tempDir = createTempDir();
  const testAuditPath = join(tempDir, "audit-published-unchanged.json");

  const originalPublishedItem = makeValidAuditItem("pubItem0001", {
    contentReviewStatus: "published",
    assignedLolixcoId: 101,
  });

  const auditDoc = {
    version: "1.0.0",
    lastUpdated: new Date().toISOString(),
    items: [originalPublishedItem],
  };
  writeFileSync(testAuditPath, JSON.stringify(auditDoc, null, 2), "utf8");

  // Re-import the exact same URL with unchanged valid metadata
  const mockFetcher = async (vid) => ({
    success: true,
    data: {
      ...originalPublishedItem.metadata,
      title: "Valid Title for pubItem0001", // unchanged
    },
  });

  const result = await ingestYouTubeBatch(
    [{ url: "https://www.youtube.com/watch?v=pubItem0001", ownerCategory: "Gaming", fandom: "valorant" }],
    {
      auditFilePath: testAuditPath,
      metadataFetcher: mockFetcher,
      dryRun: false,
      allowMocks: false,
    }
  );

  assert.equal(result.success, true);
  const updatedDoc = JSON.parse(readFileSync(testAuditPath, "utf8"));
  const item = updatedDoc.items.find((i) => i.canonicalVideoId === "pubItem0001");

  assert.ok(item, "Item must exist in audit");
  assert.equal(item.contentReviewStatus, "published", "Published status MUST be preserved on unchanged refresh");
  assert.equal(item.assignedLolixcoId, 101, "Stable ID must be preserved");
  assert.ok(item.auditHistory.length >= 2, "Audit history must record refresh event");
});

test("V4 FIX A2: Refreshing a published item with restricted metadata transitions to embed_restricted", async () => {
  const tempDir = createTempDir();
  const testAuditPath = join(tempDir, "audit-published-restricted.json");

  const originalPublishedItem = makeValidAuditItem("pubItem0002", {
    contentReviewStatus: "published",
    assignedLolixcoId: 102,
  });

  const auditDoc = {
    version: "1.0.0",
    lastUpdated: new Date().toISOString(),
    items: [originalPublishedItem],
  };
  writeFileSync(testAuditPath, JSON.stringify(auditDoc, null, 2), "utf8");

  // Re-import where video is now embed-restricted (embeddable: false)
  const mockFetcher = async (vid) => ({
    success: true,
    data: {
      ...originalPublishedItem.metadata,
      embeddable: false,
    },
  });

  const result = await ingestYouTubeBatch(
    [{ url: "https://www.youtube.com/watch?v=pubItem0002", ownerCategory: "Gaming", fandom: "valorant" }],
    {
      auditFilePath: testAuditPath,
      metadataFetcher: mockFetcher,
      dryRun: false,
      allowMocks: false,
    }
  );

  assert.equal(result.success, true);
  const updatedDoc = JSON.parse(readFileSync(testAuditPath, "utf8"));
  const item = updatedDoc.items.find((i) => i.canonicalVideoId === "pubItem0002");

  assert.ok(item);
  assert.equal(item.contentReviewStatus, "embed_restricted", "Must transition published item to embed_restricted");
  assert.equal(item.assignedLolixcoId, 102, "Preserves ID ownership even when restricted");
});

test("V4 FIX A3: Refreshing a published item that becomes private/unavailable transitions to unavailable", async () => {
  const tempDir = createTempDir();
  const testAuditPath = join(tempDir, "audit-published-private.json");

  const originalPublishedItem = makeValidAuditItem("pubItem0003", {
    contentReviewStatus: "published",
    assignedLolixcoId: 103,
  });

  const auditDoc = {
    version: "1.0.0",
    lastUpdated: new Date().toISOString(),
    items: [originalPublishedItem],
  };
  writeFileSync(testAuditPath, JSON.stringify(auditDoc, null, 2), "utf8");

  // Re-import where video became private
  const mockFetcher = async (vid) => ({
    success: true,
    data: {
      ...originalPublishedItem.metadata,
      privacyStatus: "private",
    },
  });

  const result = await ingestYouTubeBatch(
    [{ url: "https://www.youtube.com/watch?v=pubItem0003", ownerCategory: "Gaming", fandom: "valorant" }],
    {
      auditFilePath: testAuditPath,
      metadataFetcher: mockFetcher,
      dryRun: false,
      allowMocks: false,
    }
  );

  assert.equal(result.success, true);
  const updatedDoc = JSON.parse(readFileSync(testAuditPath, "utf8"));
  const item = updatedDoc.items.find((i) => i.canonicalVideoId === "pubItem0003");

  assert.equal(item.contentReviewStatus, "unavailable", "Must transition to unavailable when private");
});

test("V4 FIX A4: Material changes to a published item trigger needs_recheck", async () => {
  const tempDir = createTempDir();
  const testAuditPath = join(tempDir, "audit-published-material-change.json");

  const originalPublishedItem = makeValidAuditItem("pubItem0004", {
    contentReviewStatus: "published",
    assignedLolixcoId: 104,
  });

  const auditDoc = {
    version: "1.0.0",
    lastUpdated: new Date().toISOString(),
    items: [originalPublishedItem],
  };
  writeFileSync(testAuditPath, JSON.stringify(auditDoc, null, 2), "utf8");

  // Re-import with changed ownerCategory from Gaming to Phonk (material editorial change)
  const mockFetcher = async (vid) => ({
    success: true,
    data: originalPublishedItem.metadata,
  });

  const result = await ingestYouTubeBatch(
    [{ url: "https://www.youtube.com/watch?v=pubItem0004", ownerCategory: "Phonk", fandom: "valorant" }],
    {
      auditFilePath: testAuditPath,
      metadataFetcher: mockFetcher,
      dryRun: false,
      allowMocks: false,
    }
  );

  assert.equal(result.success, true);
  const updatedDoc = JSON.parse(readFileSync(testAuditPath, "utf8"));
  const item = updatedDoc.items.find((i) => i.canonicalVideoId === "pubItem0004");

  assert.equal(item.contentReviewStatus, "needs_recheck", "Material change must transition published item to needs_recheck");
});

// ===========================================================================
// FIX B: REJECT STRUCTURALLY MALFORMED AUDIT RECORDS
// ===========================================================================
test("V4 FIX B1: Rejects audit document when items property is not an array and preserves file byte-for-byte", async () => {
  const tempDir = createTempDir();
  const testAuditPath = join(tempDir, "malformed-items.json");

  const corruptContent = JSON.stringify({
    version: "1.0.0",
    items: { some: "corrupted structure" },
  }, null, 2);

  writeFileSync(testAuditPath, corruptContent, "utf8");
  const originalBytes = readFileSync(testAuditPath);

  // Ingestion must fail closed and reject the malformed audit
  const result = await ingestYouTubeBatch(
    [{ url: "https://www.youtube.com/watch?v=abc12345678", ownerCategory: "Gaming" }],
    { auditFilePath: testAuditPath, dryRun: false }
  );

  assert.equal(result.success, false);
  assert.ok(result.errors.some((e) => e.includes("'items' property must be an array")));

  // Verify byte-for-byte preservation
  const currentBytes = readFileSync(testAuditPath);
  assert.deepEqual(currentBytes, originalBytes, "Original file must be preserved byte-for-byte on validation error");
});

test("V4 FIX B2: Rejects audit document when top-level is not an object", () => {
  const malformedArray = [1, 2, 3];
  const validation = validateAuditDocument(malformedArray);
  assert.equal(validation.valid, false);
  assert.ok(validation.errors.some((e) => e.toLowerCase().includes("top-level json object")));

  const validationNull = validateAuditDocument(null);
  assert.equal(validationNull.valid, false);
  assert.ok(validationNull.errors.some((e) => e.toLowerCase().includes("top-level json object")));
});

test("V4 FIX B3: Rejects audit document containing duplicate canonicalVideoIds", () => {
  const duplicateAudit = {
    version: "1.0.0",
    items: [
      makeValidAuditItem("duplicat001"),
      makeValidAuditItem("duplicat001"),
    ],
  };

  const validation = validateAuditDocument(duplicateAudit);
  assert.equal(validation.valid, false);
  assert.ok(validation.errors.some((e) => e.toLowerCase().includes("duplicate canonicalvideoid 'duplicat001'")));
});

test("V4 FIX B4: Accepts valid empty audit document", () => {
  const emptyAudit = {
    version: "1.0.0",
    lastUpdated: new Date().toISOString(),
    items: [],
  };

  const validation = validateAuditDocument(emptyAudit);
  assert.equal(validation.valid, true);
  assert.equal(validation.errors.length, 0);
});

// ===========================================================================
// FIX C: STRICTLY VERIFY SUCCESSFUL METADATA RETRIEVAL (POSITIVE ALLOWLISTING)
// ===========================================================================
test("V4 FIX C1: Compiler rejects metadataFetchStatus: 'not_fetched'", async () => {
  const tempDir = createTempDir();
  const testAuditPath = join(tempDir, "audit-not-fetched.json");

  const unobtainedItem = makeValidAuditItem("unfetch0001", {
    contentReviewStatus: "approved",
    metadataFetchStatus: "not_fetched",
  });

  writeFileSync(testAuditPath, JSON.stringify({ version: "1.0.0", items: [unobtainedItem] }, null, 2), "utf8");

  const result = await compileYouTubeCatalog({
    auditFilePath: testAuditPath,
    outputPath: resolve(projectRoot, "src/data/edits.ts"),
    dryRun: true,
  });

  assert.equal(result.success, false);
  assert.ok(
    result.errors.some((e) => e.includes("not_fetched")),
    "Must fail closed on not_fetched state"
  );
});

test("V4 FIX C2: Compiler rejects missing, unknown, or failed metadata fetch status", async () => {
  const tempDir = createTempDir();
  const testAuditPath = join(tempDir, "audit-invalid-fetch-status.json");

  const failedItem = makeValidAuditItem("failedFetc1", {
    contentReviewStatus: "approved",
    metadataFetchStatus: "failed",
  });
  const unknownItem = makeValidAuditItem("unknownFtc1", {
    contentReviewStatus: "approved",
    metadataFetchStatus: "unknown_status",
  });

  writeFileSync(testAuditPath, JSON.stringify({ version: "1.0.0", items: [failedItem, unknownItem] }, null, 2), "utf8");

  const result = await compileYouTubeCatalog({
    auditFilePath: testAuditPath,
    outputPath: resolve(projectRoot, "src/data/edits.ts"),
    dryRun: true,
  });

  assert.equal(result.success, false);
  assert.ok(result.errors.some((e) => e.includes("failedFetc1")));
  assert.ok(result.errors.some((e) => e.includes("unknownFtc1")));
});

test("V4 FIX C3: Compiler requires matching provenance and canonical video ID consistency", async () => {
  const tempDir = createTempDir();
  const testAuditPath = join(tempDir, "audit-provenance-mismatch.json");

  const mismatchItem = makeValidAuditItem("vidMismat01", {
    contentReviewStatus: "approved",
    metadataFetchStatus: "fetched",
    provenance: "youtube_data_api_v3",
    metadata: {
      ...makeValidAuditItem("vidMismat01").metadata,
      canonicalVideoId: "differen001", // mismatch with outer canonicalVideoId
    },
  });

  writeFileSync(testAuditPath, JSON.stringify({ version: "1.0.0", items: [mismatchItem] }, null, 2), "utf8");

  const result = await compileYouTubeCatalog({
    auditFilePath: testAuditPath,
    outputPath: resolve(projectRoot, "src/data/edits.ts"),
    dryRun: true,
  });

  assert.equal(result.success, false);
  assert.ok(result.errors.some((e) => e.toLowerCase().includes("mismatch")));
});

// ===========================================================================
// FIX D: ELIMINATE IMMERSION PLAYBACK REGISTRATION COLLISIONS
// ===========================================================================
test("V4 FIX D: ImmersionViewer owns coordinator registration without child player collision", () => {
  // 1. Reset coordinator
  playbackCoordinator.reset();

  let immersionPausedCount = 0;
  const immersionCoordinatorId = "immersion-player";

  // 2. ImmersionViewer mounts: registers once with coordinator
  const unregisterImmersion = playbackCoordinator.registerPlayer(
    immersionCoordinatorId,
    () => {
      immersionPausedCount++;
    }
  );

  // Verify initial state
  assert.equal(playbackCoordinator.getActivePlayerId(), null);

  // 3. Start a YouTube video inside Immersion.
  // With registerWithCoordinator={false}, child YouTubePlayer does NOT register its own callback,
  // but ImmersionViewer notifies playback using its registered ID.
  playbackCoordinator.notifyPlaying(immersionCoordinatorId);
  assert.equal(playbackCoordinator.getActivePlayerId(), immersionCoordinatorId);
  assert.equal(immersionPausedCount, 0, "Self playing does not trigger self pause");

  // 4. Advance to another YouTube video:
  // Child unmounts/mounts with registerWithCoordinator={false}.
  // ImmersionViewer registration is untouched and pause callback remains registered.
  playbackCoordinator.notifyPlaying(immersionCoordinatorId);
  assert.equal(playbackCoordinator.getActivePlayerId(), immersionCoordinatorId);
  assert.equal(immersionPausedCount, 0);

  // 5. Start playback on another surface (e.g., Featured player "featured-hero")
  let featuredPausedCount = 0;
  const unregisterFeatured = playbackCoordinator.registerPlayer("featured-hero", () => {
    featuredPausedCount++;
  });
  playbackCoordinator.notifyPlaying("featured-hero");

  // 6. Verify Immersion audio is paused when external player starts
  assert.equal(playbackCoordinator.getActivePlayerId(), "featured-hero");
  assert.equal(immersionPausedCount, 1, "Immersion player must be paused when external player starts");

  // 7. Exit Immersion: unregister and verify cleanup
  unregisterImmersion();
  unregisterFeatured();
  playbackCoordinator.reset();
  assert.equal(playbackCoordinator.getActivePlayerId(), null);
});

// ===========================================================================
// FIX E: OWNER APPROVAL WORKFLOW UTILITY
// ===========================================================================
test("V4 FIX E1: Owner review utility lists pending items and enforces strict approval gating", async () => {
  const tempDir = createTempDir();
  const testAuditPath = join(tempDir, "audit-review-e1.json");

  const pendingItem = makeValidAuditItem("pendItem001", {
    contentReviewStatus: "embed_eligible",
  });
  const auditDoc = {
    version: "1.0.0",
    items: [pendingItem],
  };
  writeFileSync(testAuditPath, JSON.stringify(auditDoc, null, 2), "utf8");

  const pendingListRes = await listPendingReviewItems(testAuditPath);
  assert.equal(pendingListRes.success, true);
  assert.equal(pendingListRes.items.length, 1);
  assert.equal(pendingListRes.items[0].canonicalVideoId, "pendItem001");

  // Approval transitions status to 'approved'
  const approvalResult = await approveReviewItem("pendItem001", {
    format: "video",
    notes: "Approved by owner for Batch 01",
    auditFilePath: testAuditPath,
  });
  assert.equal(approvalResult.success, true);
  assert.equal(approvalResult.newStatus, "approved");

  const updatedDoc = JSON.parse(readFileSync(testAuditPath, "utf8"));
  const updatedItem = updatedDoc.items.find((i) => i.canonicalVideoId === "pendItem001");
  assert.equal(updatedItem.contentReviewStatus, "approved");
  assert.equal(updatedItem.format, "video");
  assert.ok(updatedItem.auditHistory.some((h) => h.event === "owner_approval" || h.action === "approved"));
});

test("V4 FIX E2: Owner review utility rejects approving mock or unfetched records", async () => {
  const tempDir = createTempDir();
  const testAuditPath = join(tempDir, "audit-review-e2.json");

  const mockItem = makeValidAuditItem("mockItem001", {
    contentReviewStatus: "embed_eligible",
    provenance: "synthetic_mock",
    isMock: true,
  });
  const unfetchedItem = makeValidAuditItem("unftItem001", {
    contentReviewStatus: "embed_eligible",
    metadataFetchStatus: "not_fetched",
  });
  const auditDoc = {
    version: "1.0.0",
    items: [mockItem, unfetchedItem],
  };
  writeFileSync(testAuditPath, JSON.stringify(auditDoc, null, 2), "utf8");

  const mockApprove = await approveReviewItem("mockItem001", { auditFilePath: testAuditPath, format: "video" });
  assert.equal(mockApprove.success, false);
  assert.ok(mockApprove.errors.some((e) => e.toLowerCase().includes("mock")));

  const unfetchedApprove = await approveReviewItem("unftItem001", { auditFilePath: testAuditPath, format: "video" });
  assert.equal(unfetchedApprove.success, false);
  assert.ok(unfetchedApprove.errors.some((e) => e.toLowerCase().includes("fetched")));
});

test("V4 FIX E3: Owner review utility rejects approving private or non-embeddable videos", async () => {
  const tempDir = createTempDir();
  const testAuditPath = join(tempDir, "audit-review-e3.json");

  const privateItem = makeValidAuditItem("privItem001", {
    contentReviewStatus: "embed_eligible",
    metadata: {
      ...makeValidAuditItem("privItem001").metadata,
      privacyStatus: "private",
    },
  });
  const auditDoc = {
    version: "1.0.0",
    items: [privateItem],
  };
  writeFileSync(testAuditPath, JSON.stringify(auditDoc, null, 2), "utf8");

  const approveRes = await approveReviewItem("privItem001", { auditFilePath: testAuditPath, format: "video" });
  assert.equal(approveRes.success, false);
  assert.ok(approveRes.errors.some((e) => e.toLowerCase().includes("not public") || e.toLowerCase().includes("cannot be approved")));
});

test("V4 FIX E4: Owner review utility batch approval of 10 items", async () => {
  const tempDir = createTempDir();
  const testAuditPath = join(tempDir, "audit-review-e4.json");

  const items = [];
  for (let i = 0; i < 10; i++) {
    const id = `btchItem${String(i).padStart(3, "0")}`;
    items.push(makeValidAuditItem(id));
  }
  const auditDoc = { version: "1.0.0", items };
  writeFileSync(testAuditPath, JSON.stringify(auditDoc, null, 2), "utf8");

  const batchResult = await approveBatch(items.map((i) => i.canonicalVideoId), {
    auditFilePath: testAuditPath,
    format: "video",
    reviewerNotes: "Approved Batch 01",
  });

  assert.equal(batchResult.success, true);
  assert.equal(batchResult.approvedCount, 10);
  const updatedDoc = JSON.parse(readFileSync(testAuditPath, "utf8"));
  assert.ok(updatedDoc.items.every((i) => i.contentReviewStatus === "approved"));
});

// ===========================================================================
// FIX F: SAFE AUDIT RECOVERY & COMPILATION ROLLBACK
// ===========================================================================
test("V4 FIX F1: Audit backup creation and restoration", () => {
  const tempDir = createTempDir();
  const testAuditPath = join(tempDir, "audit-source.json");
  const testAuditContent = JSON.stringify({ version: "1.0.0", items: [makeValidAuditItem("backItem001")] }, null, 2);
  writeFileSync(testAuditPath, testAuditContent, "utf8");

  // Create backup
  const backupPath = createAuditBackup(testAuditPath);
  assert.ok(backupPath && existsSync(backupPath), "Backup file must exist");
  assert.equal(readFileSync(backupPath, "utf8"), testAuditContent);

  // Modify source
  writeFileSync(testAuditPath, JSON.stringify({ version: "1.0.0", items: [] }), "utf8");

  // Restore backup
  const restored = restoreAuditBackup(backupPath, testAuditPath);
  assert.equal(restored, true);
  assert.equal(readFileSync(testAuditPath, "utf8"), testAuditContent);
});

test("V4 FIX F2: Dry-run compilation is genuinely non-mutating", async () => {
  const tempDir = createTempDir();
  const testAuditPath = join(tempDir, "audit-dryrun.json");
  const testOutPath = join(tempDir, "edits-dryrun.ts");

  const approvedItem = makeValidAuditItem("dryrItem001", {
    contentReviewStatus: "approved",
  });
  const auditContent = JSON.stringify({ version: "1.0.0", items: [approvedItem] }, null, 2);
  writeFileSync(testAuditPath, auditContent, "utf8");

  const compileResult = await compileYouTubeCatalog({
    auditFilePath: testAuditPath,
    outputPath: testOutPath,
    dryRun: true,
  });

  assert.equal(compileResult.success, true);
  assert.equal(existsSync(testOutPath), false, "Dry run must never write catalog file");
  assert.equal(readFileSync(testAuditPath, "utf8"), auditContent, "Dry run must never mutate audit file");
});

// ===========================================================================
// FIX G: FIRST REAL BATCH INTEGRATION READINESS (22-ITEM ISOLATED TEST)
// ===========================================================================
test("V4 FIX G: First real batch integration readiness (17 demo items + 3 landscape + 2 portrait fixtures)", async () => {
  const tempDir = createTempDir();
  const testAuditPath = join(tempDir, "audit-batch-readiness.json");
  const testOutPath = join(tempDir, "edits-batch-readiness.ts");

  // 3 Approved synthetic landscape fixtures with genuine canonical categories and registered fandoms
  const landscapeFixtures = [
    makeValidAuditItem("landItem001", {
      contentReviewStatus: "approved",
      format: "video",
      ownerCategory: "Gaming",
      fandomIds: ["valorant"],
    }),
    makeValidAuditItem("landItem002", {
      contentReviewStatus: "approved",
      format: "video",
      ownerCategory: "Anime",
      fandomIds: ["demon-slayer"],
    }),
    makeValidAuditItem("landItem003", {
      contentReviewStatus: "approved",
      format: "video",
      ownerCategory: "Movies",
      fandomIds: ["spider-man"],
    }),
  ];

  // 2 Approved synthetic portrait fixtures with genuine canonical categories and registered fandoms
  const portraitFixtures = [
    makeValidAuditItem("portItem001", {
      contentReviewStatus: "approved",
      format: "short",
      ownerCategory: "Anime",
      fandomIds: ["jujutsu-kaisen"],
    }),
    makeValidAuditItem("portItem002", {
      contentReviewStatus: "approved",
      format: "short",
      ownerCategory: "Gaming",
      fandomIds: ["doom"],
    }),
  ];

  const auditDoc = {
    version: "1.0.0",
    lastUpdated: new Date().toISOString(),
    items: [...landscapeFixtures, ...portraitFixtures],
  };
  writeFileSync(testAuditPath, JSON.stringify(auditDoc, null, 2), "utf8");

  // Compile isolated catalog
  const compileRes = await compileYouTubeCatalog({
    auditFilePath: testAuditPath,
    outputPath: testOutPath,
    dryRun: false,
    allowMocks: false,
  });

  assert.equal(compileRes.success, true);
  assert.equal(existsSync(testOutPath), true);

  // Verify compiled edits structure
  const compiledEdits = compileRes.compiledEdits;
  assert.equal(compiledEdits.length, 22, "Must contain exactly 17 demo edits + 5 new curated edits = 22 total");

  // 1. Verify demo edits (0-16)
  for (let i = 0; i < 17; i++) {
    const edit = compiledEdits[i];
    assert.equal(edit.id, i, `Demo edit ${i} must preserve ID`);
    assert.equal(edit.creator, "Lolixco demo");
    assert.equal(isLocalDemo(edit), true, `Edit ${i} must be identified as local demo`);
    assert.equal(isYouTubeEmbed(edit), false);
  }

  // 2. Verify landscape items (IDs 100..102)
  const compiledLandscape = compiledEdits.filter((e) => e.format === "video" && e.id >= 100);
  assert.equal(compiledLandscape.length, 3);
  assert.deepEqual(
    compiledLandscape.map((e) => e.id),
    [100, 101, 102],
    "Landscape items must be allocated IDs in [100..199]"
  );
  for (const edit of compiledLandscape) {
    assert.equal(isYouTubeEmbed(edit), true);
    assert.equal(isLocalDemo(edit), false);
    assert.ok(getCanonicalSourceUrl(edit).startsWith("https://www.youtube.com/watch?v="));
  }

  // 3. Verify portrait shorts (IDs 200..201)
  const compiledShorts = compiledEdits.filter((e) => e.format === "short");
  assert.equal(compiledShorts.length, 2);
  assert.deepEqual(
    compiledShorts.map((e) => e.id),
    [200, 201],
    "Shorts must be allocated IDs in [200..299]"
  );
  for (const edit of compiledShorts) {
    assert.equal(isYouTubeEmbed(edit), true);
    assert.equal(edit.format, "short");
  }

  // 4. Validate all 22 edits through validateContentRecord (simulating validateLiveCatalog with expanded support)
  const seenIds = new Set();
  for (const edit of compiledEdits) {
    const valRes = validateContentRecord(edit, {
      seenIds,
      isNewBatch: false,
      isLiveCatalog: true,
      fandomRegistry: FANDOM_REGISTRY,
      mode: "assets",
      publicDir: resolve(projectRoot, "public"),
    });
    assert.equal(valRes.valid, true, `Edit ${edit.id} (${edit.title}) must pass live catalog validation: ${valRes.errors.join(", ")}`);
  }

  // 5. Verify no private editorial metadata leaked into public records
  for (const edit of compiledEdits) {
    assert.equal(edit.editorial, undefined, "No private editorial block in public edit");
    assert.equal(edit.auditHistory, undefined, "No auditHistory in public edit");
    assert.equal(edit.lastMetadataVerification, undefined, "No verification timestamps in public edit");
    assert.equal(edit.contentReviewStatus, undefined, "No review status in public edit");
  }

  // 6. Verify audit records transitioned to 'published'
  const updatedAudit = JSON.parse(readFileSync(testAuditPath, "utf8"));
  assert.ok(
    updatedAudit.items.every((i) => i.contentReviewStatus === "published"),
    "All successfully compiled items must be transitioned to 'published'"
  );
});

// ===========================================================================
// PRODUCTION INVARIANTS: LIVE REPOSITORY REMAINING INVARIANTS
// ===========================================================================
test("PRODUCTION INVARIANTS: Live production catalog strictly preserves 17 demo edits, 0 shorts, 0 drift", async () => {
  const liveResult = await validateLiveCatalog(projectRoot);
  assert.equal(liveResult.valid, true, `Live catalog must be valid: ${liveResult.errors.join(", ")}`);
  assert.equal(liveResult.summary.total, 17, "Production catalog must have exactly 17 edits");
  assert.equal(liveResult.summary.videos, 17, "Production catalog must have exactly 17 videos");
  assert.equal(liveResult.summary.shorts, 0, "Production catalog must have exactly 0 Shorts");
});
