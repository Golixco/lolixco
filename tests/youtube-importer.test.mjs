import test from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { existsSync, unlinkSync, readFileSync, writeFileSync } from "node:fs";

import {
  ingestYouTubeBatch,
  parseBatchInput,
} from "../scripts/youtube-importer.mjs";
import {
  evaluateEditorialClassification,
  allocateStableId,
} from "../scripts/youtube-editorial.mjs";
import {
  compileYouTubeCatalog,
  projectToPublicYouTubeEdit,
} from "../scripts/compile-youtube-catalog.mjs";
import { registerMockVideo, clearMockVideos } from "../scripts/youtube-api.mjs";
import { edits as baseEdits } from "../src/data/edits.ts";

const FAKE_AUDIT_PATH = resolve("tests/scratch-youtube-audit.json");

function cleanupFakeAudit() {
  if (existsSync(FAKE_AUDIT_PATH)) {
    try {
      unlinkSync(FAKE_AUDIT_PATH);
    } catch {
      // Ignore
    }
  }
}

test("YOUTUBE IMPORTER: batch input parser supports text, json string, and array inputs", () => {
  const textInput = `
    https://www.youtube.com/watch?v=11111111111
    # Comment line
    https://youtu.be/22222222222
  `;
  const parsedText = parseBatchInput(textInput, "Gaming", "valorant");
  assert.equal(parsedText.length, 2);
  assert.equal(parsedText[0].category, "Gaming");
  assert.equal(parsedText[0].fandom, "valorant");

  const jsonInput = JSON.stringify({
    category: "Anime",
    fandom: "jujutsu-kaisen",
    urls: [
      "https://www.youtube.com/watch?v=33333333333",
      "https://youtube.com/shorts/44444444444",
    ],
  });
  const parsedJson = parseBatchInput(jsonInput);
  assert.equal(parsedJson.length, 2);
  assert.equal(parsedJson[0].category, "Anime");
  assert.equal(parsedJson[1].category, "Anime");
});

test("YOUTUBE IMPORTER: strictly rejects batches with more than 10 URLs", async () => {
  cleanupFakeAudit();
  const elevenUrls = Array.from(
    { length: 11 },
    (_, i) => `https://www.youtube.com/watch?v=vidId${i.toString().padStart(5, "0")}`
  );

  const res = await ingestYouTubeBatch({
    batchId: "batch-overflow",
    batchInput: elevenUrls,
    auditFilePath: FAKE_AUDIT_PATH,
    dryRun: true,
  });

  assert.equal(res.success, false);
  assert.match(res.errors[0], /Batch exceeds maximum allowed size of 10 items/);
  cleanupFakeAudit();
});

test("YOUTUBE IMPORTER: rejects empty batches", async () => {
  cleanupFakeAudit();
  const res = await ingestYouTubeBatch({
    batchId: "batch-empty",
    batchInput: [],
    auditFilePath: FAKE_AUDIT_PATH,
    dryRun: true,
  });

  assert.equal(res.success, false);
  assert.match(res.errors[0], /Batch is empty/);
  cleanupFakeAudit();
});

test("YOUTUBE IMPORTER: rejects intra-batch duplicates and invalid domains", async () => {
  cleanupFakeAudit();
  const res = await ingestYouTubeBatch({
    batchId: "batch-dupes-and-invalid",
    batchInput: [
      "https://www.youtube.com/watch?v=dupId123456",
      "https://youtu.be/dupId123456", // duplicate of 1
      "https://vimeo.com/123456789", // invalid domain
      "https://www.youtube.com/watch?v=validId1234",
    ],
    auditFilePath: FAKE_AUDIT_PATH,
    dryRun: true,
    mockMode: true,
  });

  assert.equal(res.success, false);
  assert.equal(res.errors.length, 2); // 1 duplicate, 1 invalid domain
  assert.equal(res.processed.length, 2); // 1st duplicate + valid item
  cleanupFakeAudit();
});

test("YOUTUBE IMPORTER: idempotent cross-batch imports do not duplicate records", async () => {
  cleanupFakeAudit();
  try {
    // 1st batch
    const res1 = await ingestYouTubeBatch({
      batchId: "batch-01",
      batchInput: ["https://www.youtube.com/watch?v=idemId12345"],
      category: "Gaming",
      fandom: "valorant",
      auditFilePath: FAKE_AUDIT_PATH,
      dryRun: false,
      mockMode: true,
    });
    assert.equal(res1.success, true);
    assert.equal(res1.processedCount, 1);

    // 2nd batch containing the same URL
    const res2 = await ingestYouTubeBatch({
      batchId: "batch-02",
      batchInput: ["https://youtu.be/idemId12345"],
      category: "Gaming",
      fandom: "valorant",
      auditFilePath: FAKE_AUDIT_PATH,
      dryRun: false,
      mockMode: true,
    });
    assert.equal(res2.success, true);
    assert.equal(res2.warnings.some((w) => w.includes("duplicate")), true);

    // Check disk audit trail
    const audit = JSON.parse(readFileSync(FAKE_AUDIT_PATH, "utf-8"));
    const matching = audit.items.filter((i) => i.canonicalVideoId === "idemId12345");
    assert.equal(matching.length, 1, "Must contain exactly 1 entry for idemId12345");
  } finally {
    cleanupFakeAudit();
  }
});

test("YOUTUBE IMPORTER: handles deleted/unavailable and embed-restricted videos safely", async () => {
  cleanupFakeAudit();
  clearMockVideos();

  // Register deleted video (null) and embed-restricted video
  registerMockVideo("deletedVid1", null);
  registerMockVideo("restricted1", {
    canonicalVideoId: "restricted1",
    title: "Restricted Video",
    description: "Not embeddable",
    channelId: "UC_mock",
    channelTitle: "Creator",
    publishedAt: "2026-01-01T00:00:00Z",
    tags: [],
    hashtags: [],
    durationIso: "PT30S",
    durationSec: 30,
    durationFormatted: "0:30",
    thumbnailUrl: "https://i.ytimg.com/vi/restricted1/hqdefault.jpg",
    embeddable: false,
    privacyStatus: "public",
  });

  try {
    const res = await ingestYouTubeBatch({
      batchId: "batch-special-statuses",
      batchInput: [
        "https://www.youtube.com/watch?v=deletedVid1",
        "https://www.youtube.com/watch?v=restricted1",
      ],
      auditFilePath: FAKE_AUDIT_PATH,
      dryRun: true,
      mockMode: true,
    });

    assert.equal(res.processed.length, 2);
    const deletedRecord = res.processed.find((p) => p.canonicalVideoId === "deletedVid1");
    const restrictedRecord = res.processed.find((p) => p.canonicalVideoId === "restricted1");

    assert.equal(deletedRecord.contentReviewStatus, "unavailable");
    assert.equal(restrictedRecord.contentReviewStatus, "embed_restricted");
  } finally {
    clearMockVideos();
    cleanupFakeAudit();
  }
});

test("YOUTUBE EDITORIAL: preserves owner category while flagging conflicting metadata", () => {
  const result = evaluateEditorialClassification({
    ownerCategory: "Anime", // Owner chose Anime
    ownerFandom: "valorant", // Contradiction: valorant is Gaming
    metadata: {
      canonicalVideoId: "testVid1234",
      title: "Insane Valorant Clutch Ace Montage",
      tags: ["gaming", "valorant", "clutch"],
      embeddable: true,
      privacyStatus: "public",
      durationSec: 45,
    },
    registeredFandoms: [
      { id: "valorant", title: "Valorant" },
      { id: "jujutsu-kaisen", title: "Jujutsu Kaisen" },
    ],
    urlFormatHint: "video",
  });

  // Must preserve owner category!
  assert.equal(result.category, "Anime");
  assert.equal(result.conflictFlag, true);
  assert.equal(
    result.warnings.some((w) => w.includes("suggest 'Gaming'")),
    true
  );
  assert.equal(result.format, "video");
  assert.equal(result.reviewStatus, "embed_eligible");
});

test("YOUTUBE EDITORIAL: allocates stable IDs in designated ranges without shifting", () => {
  const itemVideo1 = { canonicalVideoId: "v1", format: "video" };
  const itemVideo2 = { canonicalVideoId: "v2", format: "video" };
  const itemShort1 = { canonicalVideoId: "s1", format: "short" };
  const itemShort2 = { canonicalVideoId: "s2", format: "short" };

  const idV1 = allocateStableId(itemVideo1, []);
  assert.equal(idV1, 100);
  itemVideo1.assignedLolixcoId = idV1;

  const idV2 = allocateStableId(itemVideo2, [itemVideo1]);
  assert.equal(idV2, 101);

  const idS1 = allocateStableId(itemShort1, [itemVideo1, itemVideo2]);
  assert.equal(idS1, 200);
  itemShort1.assignedLolixcoId = idS1;

  const idS2 = allocateStableId(itemShort2, [itemVideo1, itemVideo2, itemShort1]);
  assert.equal(idS2, 201);

  // Calling again on itemVideo1 returns previously allocated 100
  assert.equal(allocateStableId(itemVideo1, [itemVideo1]), 100);
});

test("YOUTUBE COMPILER: strictly preserves 17 baseline demo edits and strips private audit fields", async () => {
  cleanupFakeAudit();
  try {
    const fakeAudit = {
      version: "1.0.0",
      items: [
        {
          canonicalVideoId: "approved123",
          canonicalUrl: "https://www.youtube.com/watch?v=approved123",
          ownerCategory: "Gaming",
          fandomIds: ["valorant"],
          format: "video",
          contentReviewStatus: "approved",
          assignedLolixcoId: 100,
          metadata: {
            title: "Approved Valorant Edit",
            description: "Public description",
            channelTitle: "Pro Gamer",
            channelId: "UC_gamer",
            durationFormatted: "0:45",
            thumbnailUrl: "https://i.ytimg.com/vi/approved123/hqdefault.jpg",
          },
          privateCuratorNotes: "Internal note that must NOT leak",
        },
        {
          canonicalVideoId: "draftVid123",
          ownerCategory: "Anime",
          format: "video",
          contentReviewStatus: "needs_review", // Unapproved item
          assignedLolixcoId: 101,
        },
      ],
    };
    writeFileSync(FAKE_AUDIT_PATH, JSON.stringify(fakeAudit, null, 2), "utf-8");

    const result = await compileYouTubeCatalog({
      auditFilePath: FAKE_AUDIT_PATH,
      dryRun: true,
      baseCatalog: baseEdits,
    });

    assert.equal(result.success, true);
    assert.equal(result.newCount, 1, "Only 1 approved item should be compiled");
    assert.equal(result.totalCount, 18, "17 base demo + 1 approved = 18");

    // First 17 must match base demo edits
    for (let i = 0; i < 17; i++) {
      assert.equal(result.compiledEdits[i].id, i);
      assert.equal(result.compiledEdits[i].creator, "Lolixco demo");
    }

    // 18th item is compiled YouTube edit
    const ytEdit = result.compiledEdits[17];
    assert.equal(ytEdit.id, 100);
    assert.equal(ytEdit.sourceType, "youtube_embed");
    assert.equal(ytEdit.youtubeVideoId, "approved123");
    assert.equal(ytEdit.creator, "Pro Gamer");
    assert.equal(ytEdit.source, "https://www.youtube.com/watch?v=approved123");

    // Private fields must be stripped
    assert.equal("privateCuratorNotes" in ytEdit, false);
    assert.equal("contentReviewStatus" in ytEdit, false);
  } finally {
    cleanupFakeAudit();
  }
});
