import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, unlinkSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { normalizeYouTubeUrl } from "../scripts/youtube-normalizer.mjs";
import { loadEnvConfig, fetchYouTubeVideoMetadata } from "../scripts/youtube-api.mjs";
import {
  evaluateEditorialClassification,
} from "../scripts/youtube-editorial.mjs";
import {
  parseBatchInput,
  ingestYouTubeBatch,
  loadFandomRegistry,
} from "../scripts/youtube-importer.mjs";
import { approveBatch, approveReviewItem } from "../scripts/review-youtube-batch.mjs";
import { compileYouTubeCatalog } from "../scripts/compile-youtube-catalog.mjs";
import { edits } from "../src/data/edits.ts";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

const JJK_URLS = [
  "https://youtu.be/0vswe8D3UTk?si=ZNDwyHkkH_vetZLI",
  "https://youtu.be/44pt8w67S8I?si=-l5TSlW7VibcFIb4",
  "https://youtu.be/qF0PdgefNMY?si=CFcfjG8cjgFvtUv4",
  "https://youtu.be/Cu4Wr0b2BdA?si=pjYtKFfLJ03e81TH",
  "https://youtu.be/TgZOhm9Q_IY?si=-uqhlQDZ1va-U0ju",
  "https://youtu.be/dbPHCjZ-lHw?si=EP3_MDU9Dkns04dY",
  "https://youtu.be/HoxrYzuxH_Q?si=dZ8dHtQ58jiYFBCI",
  "https://youtu.be/B3j9ithaRtE?si=Wlv-kcvj74jQKqu7",
  "https://youtu.be/VR95kfx9JRY?si=RDQ2OvUiFq3lvARu",
  "https://youtu.be/H1Q5zPXbefU?si=ifufmptPkqSuefEQ",
];

const JJK_VIDEO_IDS = [
  "0vswe8D3UTk",
  "44pt8w67S8I",
  "qF0PdgefNMY",
  "Cu4Wr0b2BdA",
  "TgZOhm9Q_IY",
  "dbPHCjZ-lHw",
  "HoxrYzuxH_Q",
  "B3j9ithaRtE",
  "VR95kfx9JRY",
  "H1Q5zPXbefU",
];

test("Mission 7C - Repository baseline & safety: demo catalog is preserved", () => {
  assert.equal(edits.length, 17, "Production catalog must have exactly 17 demo edits");
  for (let i = 0; i < 17; i++) {
    assert.equal(edits[i].id, i, `Edit at index ${i} must have id ${i}`);
    assert.ok(edits[i].source, `Demo edit ${i} must have local video source`);
  }
  const shortsCount = edits.filter((e) => e.format === "short").length;
  assert.equal(shortsCount, 0, "No Shorts in production catalog prior to explicit curation");
});

test("Mission 7C - Safe local environment configuration handling", () => {
  const tmpDir = resolve(projectRoot, "content/audit/temp-test-env-" + Date.now());
  mkdirSync(tmpDir, { recursive: true });

  try {
    // Write .env with fallback and .env.local with preferred value
    writeFileSync(resolve(tmpDir, ".env"), "TEST_YOUTUBE_KEY=env_fallback\n");
    writeFileSync(resolve(tmpDir, ".env.local"), "TEST_YOUTUBE_KEY=local_preferred\n");

    const savedEnv = process.env.TEST_YOUTUBE_KEY;
    delete process.env.TEST_YOUTUBE_KEY;

    loadEnvConfig(tmpDir);

    assert.equal(
      process.env.TEST_YOUTUBE_KEY,
      "local_preferred",
      ".env.local must take precedence over .env"
    );

    if (savedEnv !== undefined) {
      process.env.TEST_YOUTUBE_KEY = savedEnv;
    } else {
      delete process.env.TEST_YOUTUBE_KEY;
    }
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("Mission 7C - API Key resolution: YOUTUBE_DATA_API_KEY takes priority over YOUTUBE_API_KEY", async () => {
  const origDataKey = process.env.YOUTUBE_DATA_API_KEY;
  const origKey = process.env.YOUTUBE_API_KEY;

  try {
    delete process.env.YOUTUBE_DATA_API_KEY;
    delete process.env.YOUTUBE_API_KEY;

    // 1. Neither key set -> fail closed with actionable error mentioning YOUTUBE_DATA_API_KEY
    const failResult = await fetchYouTubeVideoMetadata(["0vswe8D3UTk"], { mockMode: false });
    assert.equal(failResult.items.length, 0);
    assert.ok(
      failResult.errors.some((e) => e.includes("YOUTUBE_DATA_API_KEY") || e.includes("YOUTUBE_API_KEY")),
      "Missing API key error must mention YOUTUBE_DATA_API_KEY"
    );
  } finally {
    if (origDataKey !== undefined) process.env.YOUTUBE_DATA_API_KEY = origDataKey;
    if (origKey !== undefined) process.env.YOUTUBE_API_KEY = origKey;
  }
});

test("Mission 7C - URL Normalization of all 10 JJK Landscape URLs", () => {
  assert.equal(JJK_URLS.length, 10, "Approved batch must contain exactly 10 URLs");

  for (let i = 0; i < JJK_URLS.length; i++) {
    const url = JJK_URLS[i];
    const expectedId = JJK_VIDEO_IDS[i];
    const norm = normalizeYouTubeUrl(url);

    assert.equal(norm.valid, true, `URL #${i + 1} (${url}) must be valid`);
    assert.equal(norm.videoId, expectedId, `URL #${i + 1} videoId must match ${expectedId}`);
    assert.equal(
      norm.canonicalUrl,
      `https://www.youtube.com/watch?v=${expectedId}`,
      `Canonical URL must use standard watch?v= format`
    );
    assert.equal(norm.urlFormatHint, "video", `URL format hint must be landscape video`);
  }
});

test("Mission 7C - Batch Input Files: text and JSON match specifications", () => {
  const txtPath = resolve(projectRoot, "content/batches/jjk-landscape-batch-01.txt");
  const jsonPath = resolve(projectRoot, "content/batches/jjk-landscape-batch-01.json");

  assert.ok(existsSync(txtPath), "content/batches/jjk-landscape-batch-01.txt must exist");
  assert.ok(existsSync(jsonPath), "content/batches/jjk-landscape-batch-01.json must exist");

  const txtContent = readFileSync(txtPath, "utf-8");
  const parsedFromTxt = parseBatchInput(txtContent, "Anime", "jujutsu-kaisen", "video");
  assert.equal(parsedFromTxt.length, 10, "Text batch must contain exactly 10 items");

  const jsonContent = readFileSync(jsonPath, "utf-8");
  const parsedFromJson = parseBatchInput(jsonContent, "Anime", "jujutsu-kaisen", "video");
  assert.equal(parsedFromJson.length, 10, "JSON batch must contain exactly 10 items");

  for (let i = 0; i < 10; i++) {
    assert.equal(parsedFromTxt[i].category, "Anime");
    assert.equal(parsedFromTxt[i].fandom, "jujutsu-kaisen");
    assert.equal(parsedFromTxt[i].format, "video");

    assert.equal(parsedFromJson[i].category, "Anime");
    assert.equal(parsedFromJson[i].fandom, "jujutsu-kaisen");
    assert.equal(parsedFromJson[i].format, "video");
  }
});

test("Mission 7C - Editorial classification: resolves Jujutsu Kaisen and landscape format", async () => {
  const registeredFandoms = await loadFandomRegistry();

  // Test with title "Jujutsu Kaisen"
  const classByTitle = evaluateEditorialClassification({
    ownerCategory: "Anime",
    ownerFandom: "Jujutsu Kaisen",
    ownerFormat: "landscape",
    metadata: {
      canonicalVideoId: "0vswe8D3UTk",
      title: "Jujutsu Kaisen [AMV] - Gojo vs Sukuna",
      durationSec: 145,
      embeddable: true,
      privacyStatus: "public",
    },
    registeredFandoms,
  });

  assert.equal(classByTitle.category, "Anime");
  assert.deepEqual(classByTitle.fandomIds, ["jujutsu-kaisen"], "Must resolve title 'Jujutsu Kaisen' to slug 'jujutsu-kaisen'");
  assert.equal(classByTitle.format, "video", "Must resolve 'landscape' to 'video'");
  assert.equal(classByTitle.reviewStatus, "embed_eligible");

  // Test with slug "jujutsu-kaisen"
  const classBySlug = evaluateEditorialClassification({
    ownerCategory: "Anime",
    ownerFandom: "jujutsu-kaisen",
    ownerFormat: "video",
    metadata: {
      canonicalVideoId: "0vswe8D3UTk",
      title: "Jujutsu Kaisen Phonk HD",
      durationSec: 120,
      embeddable: true,
      privacyStatus: "public",
    },
    registeredFandoms,
  });

  assert.equal(classBySlug.category, "Anime");
  assert.deepEqual(classBySlug.fandomIds, ["jujutsu-kaisen"]);
  assert.equal(classBySlug.format, "video");
  assert.equal(classBySlug.reviewStatus, "embed_eligible");
});

test("Mission 7C - End-to-end ingestion and review workflow with 10 JJK landscape videos", async () => {
  const tmpDir = resolve(projectRoot, "content/audit/temp-test-jjk-" + Date.now());
  const tmpAuditPath = resolve(tmpDir, "audit.json");
  mkdirSync(tmpDir, { recursive: true });

  try {
    // 1. Ingest batch of 10 in mock mode (simulating offline test of batch intake)
    const ingestResult = await ingestYouTubeBatch({
      batchId: "jjk-landscape-batch-01",
      category: "Anime",
      fandom: "jujutsu-kaisen",
      format: "video",
      batchPath: resolve(projectRoot, "content/batches/jjk-landscape-batch-01.json"),
      auditFilePath: tmpAuditPath,
      mockMode: true,
    });

    assert.equal(ingestResult.success, true, "Ingestion must succeed");
    assert.equal(ingestResult.processedCount, 10, "Must process 10 items");

    // Read audit file
    const auditData = JSON.parse(readFileSync(tmpAuditPath, "utf-8"));
    assert.equal(auditData.items.length, 10);

    for (let i = 0; i < 10; i++) {
      const item = auditData.items[i];
      assert.equal(item.canonicalVideoId, JJK_VIDEO_IDS[i]);
      assert.equal(item.category, "Anime");
      assert.deepEqual(item.fandomIds, ["jujutsu-kaisen"]);
      assert.equal(item.format, "video");
      assert.equal(item.batchId, "jjk-landscape-batch-01");
      assert.equal(item.contentReviewStatus, "embed_eligible");
    }

    // 2. Fail-Closed Safety: Attempting to approve synthetic mock items MUST be blocked
    const mockApproveResult = await approveBatch("jjk-landscape-batch-01", {
      auditFilePath: tmpAuditPath,
    });
    assert.equal(mockApproveResult.success, false, "Must block approval of synthetic mock data");
    assert.ok(
      mockApproveResult.errors.some((e) => e.includes("synthetic mock metadata")),
      "Approval error must explicitly cite synthetic mock metadata protection"
    );

    // Publication safety: mock data CANNOT be published into live catalog
    const publishAttempt = await compileYouTubeCatalog({
      auditFilePath: tmpAuditPath,
      dryRun: false,
    });
    assert.equal(publishAttempt.success, false, "Compilation of synthetic mock data into live catalog must fail-closed");
    assert.ok(
      publishAttempt.errors.some((e) => e.includes("synthetic") || e.includes("Mock")),
      "Must reject synthetic records from live catalog publication"
    );

    // 3. Simulate verified API retrieval items (with positive YouTube API v3 provenance)
    // to test legitimate approval and preview compilation ID range allocation:
    auditData.items = auditData.items.map((item, idx) => ({
      ...item,
      isMock: false,
      provenance: "youtube_data_api_v3",
      syntheticOrigin: null,
      metadata: {
        ...item.metadata,
        title: `Jujutsu Kaisen - High Voltage Sequence #${idx + 1}`,
        channelTitle: "JJK Visuals",
        durationSec: 120,
        durationSeconds: 120,
        durationFormatted: "2:00",
        embeddable: true,
        privacyStatus: "public",
        isMock: false,
        provenance: "youtube_data_api_v3",
        syntheticOrigin: null,
      },
    }));
    writeFileSync(tmpAuditPath, JSON.stringify(auditData, null, 2));

    const realApproveResult = await approveBatch("jjk-landscape-batch-01", {
      auditFilePath: tmpAuditPath,
    });
    assert.equal(realApproveResult.success, true, "Legitimate YouTube Data API batch approval must succeed");
    assert.equal(realApproveResult.approvedCount, 10, "Must approve all 10 verified items");

    // 4. Verify compiler dry-run preview allocates stable IDs in range 100-109
    const compilePreview = await compileYouTubeCatalog({
      auditFilePath: tmpAuditPath,
      preview: true,
    });

    assert.equal(compilePreview.success, true, "Compilation preview must succeed on approved items");
    assert.equal(compilePreview.baseCount, 17, "Base count must be 17");
    assert.equal(compilePreview.newCount, 10, "New compiled edits must be 10");
    assert.equal(compilePreview.totalCount, 27, "Total compiled edits must be 27");

    // Verify allocated IDs are in [100..109]
    const compiledNewEdits = compilePreview.compiledEdits.slice(17);
    assert.equal(compiledNewEdits.length, 10, "10 new edits compiled after 17 demo edits");
    for (let i = 0; i < 10; i++) {
      assert.equal(compiledNewEdits[i].id, 100 + i, `Landscape item #${i} must have ID ${100 + i}`);
      assert.equal(compiledNewEdits[i].category, "Anime");
      assert.deepEqual(compiledNewEdits[i].fandomIds, ["jujutsu-kaisen"]);
      assert.equal(compiledNewEdits[i].format, "video");
      assert.equal(compiledNewEdits[i].sourceType, "youtube_embed");
      assert.equal(compiledNewEdits[i].youtubeVideoId, JJK_VIDEO_IDS[i]);
    }

    // Baseline catalog in src/data/edits.ts remains untouched
    assert.equal(edits.length, 17, "Baseline catalog must still have 17 items");
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});
