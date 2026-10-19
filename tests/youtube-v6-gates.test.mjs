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
} from "../scripts/youtube-importer.mjs";
import {
  approveReviewItem,
  approveBatch,
  confirmItemFormat,
} from "../scripts/review-youtube-batch.mjs";
import {
  createImmersionSession,
  advanceImmersionNext,
  advanceImmersionPrevious,
} from "../src/utils/immersionQueue.ts";
import { playbackCoordinator } from "../src/utils/playbackCoordinator.ts";

function createTempDir() {
  return mkdtempSync(join(tmpdir(), "lolixco-v6-test-"));
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
    category: "Gaming",
    fandomIds: ["valorant"],
    ownerFandomIds: ["valorant"],
    format,
    inferredFormat: format,
    confirmedFormat: overrides.confirmedFormat !== undefined ? overrides.confirmedFormat : (isShort ? "short" : "video"),
    formatConfirmed: overrides.formatConfirmed !== undefined ? overrides.formatConfirmed : (isShort ? true : false),
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
      description: "A valid high-energy gaming edit #valorant #action",
      channelTitle: "Test Creator",
      channelId: "UCtestChannel1234567890",
      publishedAt: "2026-01-01T00:00:00Z",
      durationFormatted: "1:30",
      durationSec: 90,
      durationIso: "PT1M30S",
      thumbnailUrl: `https://i.ytimg.com/vi/${canonicalVideoId}/hqdefault.jpg`,
      embeddable: true,
      privacyStatus: "public",
      isMock: false,
    },
    ...overrides,
  };
}

// =========================================================================
// FIX A: Mock metadata must never impersonate genuine API retrieval
// =========================================================================

test("V6 FIX A1: Ingesting customMockMetadata forces isMock: true and synthetic_mock provenance even if caller passes fake genuine markers", async () => {
  const tempDir = createTempDir();
  const testAuditPath = join(tempDir, "audit-v6-fix-a1.json");

  // Caller attempts to pass fictional metadata with fake genuine API markers
  const fakeMetadata = {
    synVideo001: {
      title: "Fictional Edit Title",
      channelTitle: "Fictional Creator",
      durationSec: 45,
      durationFormatted: "0:45",
      embeddable: true,
      privacyStatus: "public",
      // Caller explicitly tries to spoof real API provenance
      isMock: false,
      provenance: "youtube_data_api_v3",
    },
  };

  const importResult = await ingestYouTubeBatch(
    ["https://www.youtube.com/watch?v=synVideo001"],
    {
      customMockMetadata: fakeMetadata,
      auditFilePath: testAuditPath,
      dryRun: false,
    }
  );

  assert.equal(importResult.success, true);
  assert.equal(importResult.processed.length, 1);

  const doc = JSON.parse(readFileSync(testAuditPath, "utf8"));
  const item = doc.items.find((i) => i.canonicalVideoId === "synVideo001");

  // Ingestion pathway MUST forcibly stamp synthetic markers
  assert.equal(item.isMock, true, "Audit record isMock must be true");
  assert.equal(item.provenance, "synthetic_mock", "Audit record provenance must be synthetic_mock");
  assert.equal(item.metadata?.isMock, true, "Metadata isMock must be true");
  assert.equal(item.metadata?.provenance, "synthetic_mock", "Metadata provenance must be synthetic_mock");
  assert.ok(item.syntheticOrigin, "Audit record must include syntheticOrigin marker");
});

test("V6 FIX A2: End-to-end regression: Mock ingestion -> attempted owner approval -> attempted production compilation", async () => {
  const tempDir = createTempDir();
  const testAuditPath = join(tempDir, "audit-v6-fix-a2.json");
  const testCatalogPath = join(tempDir, "edits-v6-fix-a2.ts");

  // 1. Mock Ingestion with fake genuine claims
  const fakeMetadata = {
    synVideo002: {
      title: "Fictional Valorant Edit",
      channelTitle: "Fictional Creator",
      durationSec: 50,
      durationFormatted: "0:50",
      embeddable: true,
      privacyStatus: "public",
      isMock: false,
      provenance: "youtube_data_api_v3",
    },
  };

  const importResult = await ingestYouTubeBatch(
    ["https://www.youtube.com/watch?v=synVideo002"],
    {
      customMockMetadata: fakeMetadata,
      auditFilePath: testAuditPath,
      category: "Gaming",
      fandom: "valorant",
      dryRun: false,
    }
  );
  assert.equal(importResult.success, true);

  // 2. Attempted Owner Approval MUST fail closed
  const approveRes = await approveReviewItem("synVideo002", {
    auditFilePath: testAuditPath,
  });
  assert.equal(approveRes.success, false, "Owner approval must reject synthetic mock metadata");
  assert.ok(
    approveRes.errors.some((e) => e.includes("synthetic mock metadata")),
    "Error must cite synthetic mock metadata rejection"
  );

  // 3. Even if someone tampers with the audit file to set contentReviewStatus: 'approved'
  const doc = JSON.parse(readFileSync(testAuditPath, "utf8"));
  const item = doc.items.find((i) => i.canonicalVideoId === "synVideo002");
  item.contentReviewStatus = "approved";
  writeFileSync(testAuditPath, JSON.stringify(doc, null, 2), "utf8");

  // 4. Attempted Production Compilation MUST fail closed
  const compileRes = await compileYouTubeCatalog({
    auditFilePath: testAuditPath,
    outputPath: testCatalogPath,
    dryRun: false,
  });

  assert.equal(compileRes.success, false, "Production compilation must reject synthetic mock metadata");
  assert.ok(
    compileRes.errors.some((e) => e.includes("synthetic mock metadata is prohibited from production")),
    "Compiler error must prohibit synthetic mock metadata from production"
  );
  assert.equal(compileRes.compiledCount, 0, "No Lolixco ID must be allocated");
  assert.equal(existsSync(testCatalogPath), false, "Output catalog file must not be created");
});

// =========================================================================
// FIX B: Short confirmation must be positively required
// =========================================================================

test("V6 FIX B1: Compiler rejects approved Short with formatConfirmed missing (undefined)", async () => {
  const tempDir = createTempDir();
  const testAuditPath = join(tempDir, "audit-v6-fix-b1.json");
  const testCatalogPath = join(tempDir, "edits-v6-fix-b1.ts");

  // Otherwise valid approved Short but with formatConfirmed completely missing
  const unconfirmedShort = makeValidAuditItem("missConf001", {
    contentReviewStatus: "approved",
    format: "short",
    // formatConfirmed is deliberately missing / undefined
    formatConfirmed: undefined,
    confirmedFormat: "short",
  });
  delete unconfirmedShort.formatConfirmed;

  const auditDoc = {
    version: "1.0.0",
    lastUpdated: new Date().toISOString(),
    items: [unconfirmedShort],
  };
  writeFileSync(testAuditPath, JSON.stringify(auditDoc, null, 2), "utf8");

  const compileRes = await compileYouTubeCatalog({
    auditFilePath: testAuditPath,
    outputPath: testCatalogPath,
    dryRun: false,
  });

  assert.equal(compileRes.success, false, "Compilation must reject Short with missing formatConfirmed");
  assert.ok(
    compileRes.errors.some((e) => e.includes("requires positive format confirmation (formatConfirmed: true)")),
    "Compiler must demand positive format confirmation"
  );
});

test("V6 FIX B2: Compiler rejects approved Short with formatConfirmed: null and formatConfirmed: false", async () => {
  const tempDir = createTempDir();
  const testCatalogPath = join(tempDir, "edits-v6-fix-b2.ts");

  // Null formatConfirmed
  const nullAuditPath = join(tempDir, "audit-null.json");
  const nullShort = makeValidAuditItem("nullConf001", {
    contentReviewStatus: "approved",
    format: "short",
    formatConfirmed: null,
    confirmedFormat: "short",
  });
  writeFileSync(nullAuditPath, JSON.stringify({ version: "1.0.0", items: [nullShort] }, null, 2), "utf8");

  const nullCompile = await compileYouTubeCatalog({
    auditFilePath: nullAuditPath,
    outputPath: testCatalogPath,
    dryRun: false,
  });
  assert.equal(nullCompile.success, false);
  assert.ok(nullCompile.errors.some((e) => e.includes("requires positive format confirmation")));

  // False formatConfirmed
  const falseAuditPath = join(tempDir, "audit-false.json");
  const falseShort = makeValidAuditItem("falsConf001", {
    contentReviewStatus: "approved",
    format: "short",
    formatConfirmed: false,
    confirmedFormat: "short",
  });
  writeFileSync(falseAuditPath, JSON.stringify({ version: "1.0.0", items: [falseShort] }, null, 2), "utf8");

  const falseCompile = await compileYouTubeCatalog({
    auditFilePath: falseAuditPath,
    outputPath: testCatalogPath,
    dryRun: false,
  });
  assert.equal(falseCompile.success, false);
  assert.ok(falseCompile.errors.some((e) => e.includes("requires positive format confirmation")));
});

test("V6 FIX B3: Compiler rejects contradictory format-confirmation fields", async () => {
  const tempDir = createTempDir();
  const testCatalogPath = join(tempDir, "edits-v6-fix-b3.ts");

  // Contradiction 1: format is 'short' but confirmedFormat is 'video'
  const contra1Path = join(tempDir, "audit-contra-1.json");
  const contra1 = makeValidAuditItem("contra00001", {
    contentReviewStatus: "approved",
    format: "short",
    formatConfirmed: true,
    confirmedFormat: "video",
  });
  writeFileSync(contra1Path, JSON.stringify({ version: "1.0.0", items: [contra1] }, null, 2), "utf8");

  const contra1Res = await compileYouTubeCatalog({
    auditFilePath: contra1Path,
    outputPath: testCatalogPath,
    dryRun: false,
  });
  assert.equal(contra1Res.success, false);
  assert.ok(contra1Res.errors.some((e) => e.includes("requires confirmedFormat: 'short'")));

  // Contradiction 2: format is 'video' but confirmedFormat is 'short'
  const contra2Path = join(tempDir, "audit-contra-2.json");
  const contra2 = makeValidAuditItem("contra00002", {
    contentReviewStatus: "approved",
    format: "video",
    formatConfirmed: true,
    confirmedFormat: "short",
  });
  writeFileSync(contra2Path, JSON.stringify({ version: "1.0.0", items: [contra2] }, null, 2), "utf8");

  const contra2Res = await compileYouTubeCatalog({
    auditFilePath: contra2Path,
    outputPath: testCatalogPath,
    dryRun: false,
  });
  assert.equal(contra2Res.success, false);
  assert.ok(contra2Res.errors.some((e) => e.includes("contradictory format confirmation")));
});

test("V6 FIX B4: Review approval requires recorded format confirmation rather than accepting unverified hint", async () => {
  const tempDir = createTempDir();
  const testAuditPath = join(tempDir, "audit-v6-fix-b4.json");

  // Item with intake hint format: 'short', but formatConfirmed: false and confirmedFormat: null
  const candidateShort = makeValidAuditItem("candShort01", {
    contentReviewStatus: "needs_review",
    format: "short",
    inferredFormat: "short",
    formatConfirmed: false,
    confirmedFormat: null,
  });
  writeFileSync(testAuditPath, JSON.stringify({ version: "1.0.0", items: [candidateShort] }, null, 2), "utf8");

  // Calling approveReviewItem with format: 'short' without recorded confirmation action must be rejected
  const unverifiedApprove = await approveReviewItem("candShort01", {
    auditFilePath: testAuditPath,
    format: "short",
  });
  assert.equal(unverifiedApprove.success, false, "Must reject approving Short without recorded confirmation");
  assert.ok(
    unverifiedApprove.errors.some((e) => e.includes("Candidate portrait Short requires recorded manual format confirmation")),
    "Must explain that unverified format hint does not prove portrait dimensions"
  );

  // Calling approveBatch must also reject the unconfirmed short
  const batchApprove = await approveBatch(["candShort01"], {
    auditFilePath: testAuditPath,
  });
  assert.equal(batchApprove.success, false, "Batch approval must enforce identical checks");

  // With explicit confirmFormat: 'short', approval succeeds and records event
  const confirmedApprove = await approveReviewItem("candShort01", {
    auditFilePath: testAuditPath,
    confirmFormat: "short",
  });
  assert.equal(confirmedApprove.success, true);
  assert.equal(confirmedApprove.item.formatConfirmed, true);
  assert.equal(confirmedApprove.item.confirmedFormat, "short");
  assert.ok(confirmedApprove.item.auditHistory.some((h) => h.event === "format_confirmation"));
});

test("V6 FIX B5: Positively confirmed Short compiles and receives ID in [200..299] range", async () => {
  const tempDir = createTempDir();
  const testAuditPath = join(tempDir, "audit-v6-fix-b5.json");
  const testCatalogPath = join(tempDir, "edits-v6-fix-b5.ts");

  const validShort = makeValidAuditItem("validSho001", {
    contentReviewStatus: "approved",
    format: "short",
    inferredFormat: "short",
    formatConfirmed: true,
    confirmedFormat: "short",
    ownerCategory: "Anime",
    category: "Anime",
    fandomIds: ["jujutsu-kaisen"],
  });

  writeFileSync(testAuditPath, JSON.stringify({ version: "1.0.0", items: [validShort] }, null, 2), "utf8");

  const compileRes = await compileYouTubeCatalog({
    auditFilePath: testAuditPath,
    outputPath: testCatalogPath,
    dryRun: false,
  });

  assert.equal(compileRes.success, true, "Positively confirmed Short must compile successfully");
  assert.equal(compileRes.newCount, 1);
  const assigned = compileRes.compiledEdits.find((e) => e.youtubeVideoId === "validSho001");
  assert.ok(assigned);
  assert.equal(assigned.format, "short");
  assert.ok(assigned.id >= 200 && assigned.id <= 299, `Assigned ID ${assigned.id} must be in [200..299]`);
});

// =========================================================================
// FIX C: Immersion browser acceptance and audio/playback verification
// =========================================================================

test("V6 FIX C1: Immersion queue starts with matching category/fandom edits and shuffles subsequent discovery edits", () => {
  const MOCK_CATALOG = [
    { id: 100, title: "Valorant Ace 1", category: "Gaming", fandomIds: ["valorant"], tags: ["gaming"], format: "video", source: "v1.mp4", poster: "p1.jpg" },
    { id: 101, title: "Valorant Ace 2", category: "Gaming", fandomIds: ["valorant"], tags: ["gaming"], format: "video", source: "v2.mp4", poster: "p2.jpg" },
    { id: 102, title: "Valorant Ace 3", category: "Gaming", fandomIds: ["valorant"], tags: ["gaming"], format: "video", source: "v3.mp4", poster: "p3.jpg" },
    { id: 103, title: "Jujutsu Kaisen Fight", category: "Anime", fandomIds: ["jujutsu-kaisen"], tags: ["anime"], format: "video", source: "v4.mp4", poster: "p4.jpg" },
    { id: 104, title: "Spider-Man Web", category: "Movies", fandomIds: ["spider-man"], tags: ["movies"], format: "video", source: "v5.mp4", poster: "p5.jpg" },
  ];

  // Enter from Gaming / valorant
  const session = createImmersionSession(MOCK_CATALOG, { category: "Gaming", fandomId: "valorant" }, 42);

  // First 3 edits must match entry context
  assert.equal(session.currentEdit?.id, 100);
  assert.equal(session.currentEdit?.category, "Gaming");

  const step2 = advanceImmersionNext(MOCK_CATALOG, session.state, 42);
  assert.equal(step2.nextEdit?.id, 101);
  assert.equal(step2.nextEdit?.category, "Gaming");

  const step3 = advanceImmersionNext(MOCK_CATALOG, step2.nextState, 42);
  assert.equal(step3.nextEdit?.id, 102);
  assert.equal(step3.nextEdit?.category, "Gaming");

  // Subsequent edit (edit 4) transitions to Discovery Stage and shuffles across remaining categories
  const step4 = advanceImmersionNext(MOCK_CATALOG, step3.nextState, 42);
  assert.ok(step4.nextEdit);
  assert.notEqual(step4.nextEdit.id, 100);
  assert.notEqual(step4.nextEdit.id, 101);
  assert.notEqual(step4.nextEdit.id, 102);
});

test("V6 FIX C2: Immersion player audio exclusivity via playbackCoordinator", () => {
  let backgroundPlayerPaused = false;
  const unregisterBg = playbackCoordinator.registerPlayer("grid-video-player", () => {
    backgroundPlayerPaused = true;
  });

  playbackCoordinator.notifyPlaying("grid-video-player");
  assert.equal(playbackCoordinator.getActivePlayerId(), "grid-video-player");

  // Immersion Mode opens and starts playing
  let immersionPlayerPaused = false;
  const unregisterImmersion = playbackCoordinator.registerPlayer("immersion-player", () => {
    immersionPlayerPaused = true;
  });

  playbackCoordinator.notifyPlaying("immersion-player");

  // Background player MUST be immediately paused
  assert.equal(playbackCoordinator.getActivePlayerId(), "immersion-player");
  assert.equal(backgroundPlayerPaused, true, "Background video must pause when Immersion plays");
  assert.equal(immersionPlayerPaused, false);

  unregisterBg();
  unregisterImmersion();
});

test("V6 FIX C3: Navigation (Next, Previous, and auto-advance) preserves queue state", () => {
  const MOCK_CATALOG = [
    { id: 1, title: "Item 1", category: "Anime", fandomIds: ["jjk"], tags: [], format: "video", source: "1.mp4", poster: "1.jpg" },
    { id: 2, title: "Item 2", category: "Anime", fandomIds: ["jjk"], tags: [], format: "video", source: "2.mp4", poster: "2.jpg" },
    { id: 3, title: "Item 3", category: "Anime", fandomIds: ["jjk"], tags: [], format: "video", source: "3.mp4", poster: "3.jpg" },
  ];

  const session = createImmersionSession(MOCK_CATALOG, { category: "Anime" }, 1);
  assert.equal(session.currentEdit?.id, 1);

  // ENDED or Next button advances
  const nextRes = advanceImmersionNext(MOCK_CATALOG, session.state, 1);
  assert.equal(nextRes.nextEdit?.id, 2);

  // Previous button returns to item 1
  const prevRes = advanceImmersionPrevious(nextRes.nextState);
  assert.equal(prevRes.prevEdit?.id, 1);
});
