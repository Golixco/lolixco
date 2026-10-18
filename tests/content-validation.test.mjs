import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync, symlinkSync, unlinkSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import {
  validateContentRecord,
  validateContentManifest,
  validateLiveCatalog,
  projectToPublicEdit,
  projectToPreviewEdit,
  verifyAssetBytesStreaming,
  verifyAssetPathContainment,
  validateJsonSchema,
  manifestSchema,
  contentRecordSchema,
  VALID_MODES,
  projectRoot,
} from "../scripts/validate-content.mjs";
import { FANDOM_REGISTRY } from "../src/data/fandoms.ts";
import { edits } from "../src/data/edits.ts";

const MOCK_VALID_VIDEO = {
  id: 101,
  format: "video",
  title: "Synthetic Test Video",
  description: "A valid landscape video for testing validation logic.",
  category: "Anime",
  fandomIds: ["jujutsu-kaisen"],
  tags: ["anime", "action", "fight"],
  poster: "/media/art-0.svg",
  source: "/media/motion-study.webm",
  duration: "0:25",
  durationMs: 25000,
  trending: false,
  media: {
    aspectRatio: "16:9",
    width: 1920,
    height: 1080,
    codec: "h264",
    audioCodec: "aac",
    frameRate: 60,
    bitrateKbps: 8000,
    loudnessLkfs: -14,
  },
  editorial: {
    reviewStatus: "approved",
    rightsCleared: true,
    sourceAttribution: "Verified synthetic source.",
    curatorNotes: "Approved synthetic record.",
    ownerAssetRef: "SYNTH_01",
  },
};

const MOCK_VALID_SHORT = {
  id: 201,
  format: "short",
  title: "Synthetic Test Short",
  description: "A valid vertical short for testing validation logic.",
  category: "Gaming",
  fandomIds: ["valorant"],
  tags: ["gaming", "valorant", "short"],
  poster: "/media/art-1.svg",
  source: "/media/motion-study.webm",
  duration: "0:15",
  durationMs: 15000,
  trending: false,
  media: {
    aspectRatio: "9:16",
    width: 1080,
    height: 1920,
    codec: "h264",
    audioCodec: "aac",
    frameRate: 60,
    bitrateKbps: 6000,
    loudnessLkfs: -14,
  },
  editorial: {
    reviewStatus: "approved",
    rightsCleared: true,
    sourceAttribution: "Verified synthetic submission.",
    curatorNotes: "Approved synthetic short.",
    ownerAssetRef: "SYNTH_SHORT_01",
  },
};

// -------------------------------------------------------------
// FIX A: Authoritative Schema Validation & Malformed Types
// -------------------------------------------------------------

test("Schema validation rejects non-object or null records cleanly", () => {
  const rNull = validateContentRecord(null);
  assert.equal(rNull.valid, false);
  assert.match(rNull.errors[0], /must be a JSON object, got null/);

  const rArray = validateContentRecord([]);
  assert.equal(rArray.valid, false);
  assert.match(rArray.errors[0], /must be a JSON object, got array/);

  const rNumber = validateContentRecord(42);
  assert.equal(rNumber.valid, false);
  assert.match(rNumber.errors[0], /must be a JSON object, got number/);

  const rString = validateContentRecord("malformed");
  assert.equal(rString.valid, false);
  assert.match(rString.errors[0], /must be a JSON object, got string/);
});

test("Schema validation rejects missing required properties including format", () => {
  const withoutFormat = { ...MOCK_VALID_VIDEO };
  delete withoutFormat.format;
  const rFormat = validateContentRecord(withoutFormat, { isNewBatch: true });
  assert.equal(rFormat.valid, false);
  assert.match(rFormat.errors.join("; "), /Missing required property 'format'/);

  const withoutTitle = { ...MOCK_VALID_VIDEO };
  delete withoutTitle.title;
  const rTitle = validateContentRecord(withoutTitle, { isNewBatch: true });
  assert.equal(rTitle.valid, false);
  assert.match(rTitle.errors.join("; "), /Missing required property 'title'/);

  const withoutPoster = { ...MOCK_VALID_VIDEO };
  delete withoutPoster.poster;
  const rPoster = validateContentRecord(withoutPoster, { isNewBatch: true });
  assert.equal(rPoster.valid, false);
  assert.match(rPoster.errors.join("; "), /Missing required property 'poster'/);
});

test("Schema validation rejects unexpected properties across record, media, and editorial", () => {
  const extraRecordKey = { ...MOCK_VALID_VIDEO, unexpectedField: "hack" };
  const r1 = validateContentRecord(extraRecordKey);
  assert.equal(r1.valid, false);
  assert.match(r1.errors.join("; "), /Unexpected record property 'unexpectedField'/);

  const extraMediaKey = {
    ...MOCK_VALID_VIDEO,
    media: { ...MOCK_VALID_VIDEO.media, unsupportedMediaProp: 123 },
  };
  const r2 = validateContentRecord(extraMediaKey);
  assert.equal(r2.valid, false);
  assert.match(r2.errors.join("; "), /Unexpected media property 'unsupportedMediaProp'/);

  const extraEditorialKey = {
    ...MOCK_VALID_VIDEO,
    editorial: { ...MOCK_VALID_VIDEO.editorial, unsupportedEditorialProp: "note" },
  };
  const r3 = validateContentRecord(extraEditorialKey);
  assert.equal(r3.valid, false);
  assert.match(r3.errors.join("; "), /Unexpected editorial property 'unsupportedEditorialProp'/);
});

test("Schema validation rejects unsupported codecs and out-of-range media properties", () => {
  const badVideoCodec = {
    ...MOCK_VALID_VIDEO,
    media: { ...MOCK_VALID_VIDEO.media, codec: "prores" },
  };
  const rCodec = validateContentRecord(badVideoCodec);
  assert.equal(rCodec.valid, false);
  assert.match(rCodec.errors.join("; "), /Unsupported codec 'prores'/);

  const badAudioCodec = {
    ...MOCK_VALID_VIDEO,
    media: { ...MOCK_VALID_VIDEO.media, audioCodec: "flac" },
  };
  const rAudio = validateContentRecord(badAudioCodec);
  assert.equal(rAudio.valid, false);
  assert.match(rAudio.errors.join("; "), /Unsupported audioCodec 'flac'/);

  const badWidth = {
    ...MOCK_VALID_VIDEO,
    media: { ...MOCK_VALID_VIDEO.media, width: 200 }, // minimum 320
  };
  const rWidth = validateContentRecord(badWidth);
  assert.equal(rWidth.valid, false);
  assert.match(rWidth.errors.join("; "), /media\.width must be an integer between 320 and 7680/);
});

test("Schema validation strictly rejects uppercase or malformed tags", () => {
  const upperTag = validateContentRecord({ ...MOCK_VALID_VIDEO, tags: ["Anime", "Action"] });
  assert.equal(upperTag.valid, false);
  assert.match(upperTag.errors.join("; "), /Tag "Anime" contains invalid characters or uppercase letters/);

  const spaceTag = validateContentRecord({ ...MOCK_VALID_VIDEO, tags: ["phonk music"] });
  assert.equal(spaceTag.valid, false);
  assert.match(spaceTag.errors.join("; "), /Tag "phonk music" contains invalid characters/);

  const leadingHash = validateContentRecord({ ...MOCK_VALID_VIDEO, tags: ["#anime"] });
  assert.equal(leadingHash.valid, false);
  assert.match(leadingHash.errors.join("; "), /must not include leading '#' symbol/);
});

// -------------------------------------------------------------
// FIX B: Separate Metadata Preparation from Asset Verification
// -------------------------------------------------------------

test("Metadata mode skips physical asset checks and reports status clearly", () => {
  const manifest = {
    manifestVersion: "1.0.0",
    catalogVersion: "catalog-v2",
    items: [
      {
        ...MOCK_VALID_VIDEO,
        poster: "/media/nonexistent/future-poster.webp",
        source: "/media/nonexistent/future-video.mp4",
      },
    ],
  };

  const result = validateContentManifest(manifest, {
    fandomRegistry: FANDOM_REGISTRY,
    mode: "metadata",
    isNewBatch: true,
  });

  assert.equal(result.valid, true, `Metadata check failed: ${result.errors.join("; ")}`);
  assert.equal(result.assetVerification, "SKIPPED (Metadata preparation mode)");
});

test("Asset verification mode requires staged files to exist and checks signatures", () => {
  const manifest = {
    manifestVersion: "1.0.0",
    catalogVersion: "catalog-v2",
    items: [
      {
        ...MOCK_VALID_VIDEO,
        poster: "/media/nonexistent/future-poster.webp",
        source: "/media/nonexistent/future-video.mp4",
      },
    ],
  };

  const result = validateContentManifest(manifest, {
    fandomRegistry: FANDOM_REGISTRY,
    mode: "assets",
    isNewBatch: true,
  });

  assert.equal(result.valid, false);
  assert.equal(result.assetVerification, "PERFORMED (Staged local assets verified)");
  assert.match(result.errors.join("; "), /Poster asset verification failed/);
  assert.match(result.errors.join("; "), /Source video verification failed/);
});

test("Asset verification prevents directory traversal outside public media/brand", () => {
  const traversalRecord = {
    ...MOCK_VALID_VIDEO,
    poster: "/media/../../secret.png",
  };
  const result = validateContentRecord(traversalRecord, {
    mode: "assets",
    fandomRegistry: FANDOM_REGISTRY,
  });
  assert.equal(result.valid, false);
  assert.match(result.errors.join("; "), /resolves outside public\/media or public\/brand directory/);
});

test("Asset verification flags remote URLs requiring local staging", () => {
  const remoteRecord = {
    ...MOCK_VALID_VIDEO,
    poster: "https://example.com/poster.webp",
    source: "https://example.com/video.mp4",
  };
  const result = validateContentRecord(remoteRecord, { mode: "assets" });
  assert.equal(result.valid, false);
  assert.match(result.errors.join("; "), /Remote poster reference '.*' cannot be verified offline/);
});

test("Streaming asset inspection reads fixed-size header without reading entire file", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "lolixco-stream-test-"));
  try {
    const pngPath = join(tempDir, "stream-test.png");
    // Write valid PNG header + 1MB of zeroes
    const header = Buffer.from("89504e470d0a1a0a0000000d494844520000000100000001", "hex");
    const zeroes = Buffer.alloc(1024 * 1024);
    writeFileSync(pngPath, Buffer.concat([header, zeroes]));

    const res = verifyAssetBytesStreaming(pngPath);
    assert.equal(res.extension, ".png");
    assert.equal(res.bytes > 1000000, true);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

// -------------------------------------------------------------
// FIX C: Enforce Editorial Publication Requirements
// -------------------------------------------------------------

test("Draft records are accepted in metadata mode but strictly rejected in publish mode", () => {
  const draftRecord = {
    ...MOCK_VALID_VIDEO,
    editorial: {
      reviewStatus: "draft",
      rightsCleared: false,
    },
  };

  // Accepted during metadata intake
  const metaRes = validateContentRecord(draftRecord, { mode: "metadata", fandomRegistry: FANDOM_REGISTRY });
  assert.equal(metaRes.valid, true);

  // Rejected for publication readiness
  const pubRes = validateContentRecord(draftRecord, { mode: "publish", fandomRegistry: FANDOM_REGISTRY });
  assert.equal(pubRes.valid, false);
  assert.match(pubRes.errors.join("; "), /reviewStatus is "draft"\. Only "approved" or "published"/);
  assert.match(pubRes.errors.join("; "), /rightsCleared is not true/);
});

test("Missing editorial review block prevents publication", () => {
  const unreviewed = { ...MOCK_VALID_VIDEO };
  delete unreviewed.editorial;

  const pubRes = validateContentRecord(unreviewed, { mode: "publish", fandomRegistry: FANDOM_REGISTRY });
  assert.equal(pubRes.valid, false);
  assert.match(pubRes.errors.join("; "), /Missing editorial review block/);
});

test("projectToPublicEdit enforces strict publication clearance boundary", () => {
  const draftRecord = {
    ...MOCK_VALID_VIDEO,
    editorial: {
      reviewStatus: "draft",
      rightsCleared: false,
    },
  };

  // Strict projection throws on unapproved record
  assert.throws(
    () => projectToPublicEdit(draftRecord, { strict: true }),
    /Cannot project item 101 to public catalog: editorial reviewStatus must be 'approved' or 'published'/
  );

  // Approved record projects safely and completely strips private editorial data
  const approvedRecord = {
    ...MOCK_VALID_VIDEO,
    editorial: {
      reviewStatus: "approved",
      rightsCleared: true,
      sourceAttribution: "Private Creator Info",
      curatorNotes: "Private Notes",
      ownerAssetRef: "REF123",
    },
  };

  const publicEdit = projectToPublicEdit(approvedRecord, { strict: true });
  assert.equal(publicEdit.id, 101);
  assert.equal(publicEdit.creator, "Lolixco curated");
  assert.equal("editorial" in publicEdit, false);
  assert.equal("sourceAttribution" in publicEdit, false);
  assert.equal("curatorNotes" in publicEdit, false);
  assert.equal("rightsCleared" in publicEdit, false);
});

// -------------------------------------------------------------
// FIX D: Hypothetical Sample Manifest Template
// -------------------------------------------------------------

test("Manifest template passes metadata check but correctly fails publish mode due to draft status", async () => {
  const templateModule = await import("../content/manifest.template.json", {
    with: { type: "json" },
  });

  const metaRes = validateContentManifest(templateModule.default, {
    fandomRegistry: FANDOM_REGISTRY,
    mode: "metadata",
    isNewBatch: true,
  });
  assert.equal(metaRes.valid, true, `Template failed metadata mode: ${metaRes.errors.join("; ")}`);

  const pubRes = validateContentManifest(templateModule.default, {
    fandomRegistry: FANDOM_REGISTRY,
    mode: "publish",
    isNewBatch: true,
  });
  assert.equal(pubRes.valid, false);
  assert.match(pubRes.errors.join("; "), /reviewStatus is "draft"/);
  assert.match(pubRes.errors.join("; "), /rightsCleared is not true/);
});

// -------------------------------------------------------------
// FIX E: Enforce ID Allocation Policy & Conflicts
// -------------------------------------------------------------

test("ID allocation enforces 100-199 for landscape videos and 200-299 for Shorts", () => {
  // Video with short ID 205
  const videoInShortRange = validateContentRecord(
    { ...MOCK_VALID_VIDEO, id: 205, format: "video" },
    { isNewBatch: true, fandomRegistry: FANDOM_REGISTRY }
  );
  assert.equal(videoInShortRange.valid, false);
  assert.match(videoInShortRange.errors.join("; "), /Landscape video ID 205 must be in range 100-199/);

  // Short with video ID 105
  const shortInVideoRange = validateContentRecord(
    { ...MOCK_VALID_SHORT, id: 105, format: "short" },
    { isNewBatch: true, fandomRegistry: FANDOM_REGISTRY }
  );
  assert.equal(shortInVideoRange.valid, false);
  assert.match(shortInVideoRange.errors.join("; "), /Curated Short ID 105 must be in range 200-299/);

  // New item with demo ID 5
  const demoCollision = validateContentRecord(
    { ...MOCK_VALID_VIDEO, id: 5 },
    { isNewBatch: true, fandomRegistry: FANDOM_REGISTRY }
  );
  assert.equal(demoCollision.valid, false);
  assert.match(demoCollision.errors.join("; "), /ID 5 is reserved for baseline demo edits/);

  // New item with internal test harness ID 50
  const reservedCollision = validateContentRecord(
    { ...MOCK_VALID_VIDEO, id: 50 },
    { isNewBatch: true, fandomRegistry: FANDOM_REGISTRY }
  );
  assert.equal(reservedCollision.valid, false);
  assert.match(reservedCollision.errors.join("; "), /ID 50 is reserved for internal test harnesses/);
});

test("Manifest validation checks duplicate IDs against incoming items and existing catalog", () => {
  const manifest = {
    manifestVersion: "1.0.0",
    catalogVersion: "catalog-v2",
    items: [
      { ...MOCK_VALID_VIDEO, id: 101 },
      { ...MOCK_VALID_VIDEO, id: 101 }, // duplicate
    ],
  };

  const res = validateContentManifest(manifest, {
    fandomRegistry: FANDOM_REGISTRY,
    mode: "metadata",
    isNewBatch: true,
  });
  assert.equal(res.valid, false);
  assert.match(res.errors.join("; "), /Duplicate ID: 101/);

  // Collision against existing catalog IDs (0-16)
  const manifestCollidingWithLive = {
    manifestVersion: "1.0.0",
    catalogVersion: "catalog-v2",
    items: [
      { ...MOCK_VALID_VIDEO, id: 0 }, // Collides with demo edit 0
    ],
  };
  const liveCollisionRes = validateContentManifest(manifestCollidingWithLive, {
    fandomRegistry: FANDOM_REGISTRY,
    existingCatalog: edits,
    mode: "metadata",
    isNewBatch: true,
  });
  assert.equal(liveCollisionRes.valid, false);
  assert.match(liveCollisionRes.errors.join("; "), /Duplicate ID: 0/);
});

// -------------------------------------------------------------
// FIX F: Production Baseline Invariants
// -------------------------------------------------------------

test("Live production catalog retains exactly 17 demo edits and zero Shorts", async () => {
  const result = await validateLiveCatalog();
  assert.equal(result.valid, true, `Live catalog errors: ${result.errors.join("; ")}`);
  assert.equal(result.summary.total, 17);
  assert.equal(result.summary.videos, 17);
  assert.equal(result.summary.shorts, 0);
  assert.equal(edits.length, 17);
  assert.equal(edits.filter((e) => e.format === "short").length, 0);
});

// =============================================================
// MISSION 7A V3 RELIABILITY REGRESSIONS
// =============================================================

// -------------------------------------------------------------
// FIX A: Publication Readiness Fail-Closed & Stream Inspection
// -------------------------------------------------------------

test("FIX A: Publication readiness fails closed on MP4 header-only stub with undecodable stream", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "lolixco-v3-stub-"));
  const mediaSubdir = join(tempDir, "media");
  mkdirSync(mediaSubdir, { recursive: true });

  try {
    // Write an MP4 header stub (ftyp box + brand + 16 bytes of padding, no video stream)
    const stubVideoPath = join(mediaSubdir, "stub-header.mp4");
    const ftypHeader = Buffer.from([
      0x00, 0x00, 0x00, 0x18, // box size 24
      0x66, 0x74, 0x79, 0x70, // 'ftyp'
      0x69, 0x73, 0x6f, 0x6d, // major brand 'isom'
      0x00, 0x00, 0x02, 0x00, // minor version
      0x69, 0x73, 0x6f, 0x6d, // compatible brand 1
      0x6d, 0x70, 0x34, 0x31, // compatible brand 2
    ]);
    writeFileSync(stubVideoPath, ftypHeader);

    // Also write a valid SVG poster in the temp directory
    const stubPosterPath = join(mediaSubdir, "stub-poster.svg");
    writeFileSync(stubPosterPath, '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>');

    // 1. Streaming byte inspection passes on the header magic bytes
    const byteRes = verifyAssetBytesStreaming(stubVideoPath);
    assert.equal(byteRes.extension, ".mp4");

    const stubRecord = {
      ...MOCK_VALID_VIDEO,
      poster: "/media/stub-poster.svg",
      source: "/media/stub-header.mp4",
    };

    // 2. Publication readiness FAILS CLOSED when video stream inspection fails or detects undecodable stream
    const mockUndecodableInspector = () => ({
      available: true,
      ok: false,
      error: "Stream inspection failed: Invalid data found when processing input (missing video stream)",
    });

    const pubRes = validateContentRecord(stubRecord, {
      mode: "publish",
      publicDir: tempDir,
      videoInspector: mockUndecodableInspector,
      fandomRegistry: FANDOM_REGISTRY,
    });

    assert.equal(pubRes.valid, false, "Publication readiness must fail closed on undecodable video stream");
    assert.match(
      pubRes.errors.join("; "),
      /Source video stream inspection failed \(\/media\/stub-header\.mp4\): Stream inspection failed/
    );
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("FIX A: Publication mode fails closed if ffprobe is unavailable in environment", () => {
  const missingFfprobeInspector = () => ({
    available: false,
    ok: false,
    error: "ffprobe is not installed in the execution environment",
  });

  const record = { ...MOCK_VALID_VIDEO };

  // In publish mode: missing ffprobe is a FATAL ERROR
  const pubRes = validateContentRecord(record, {
    mode: "publish",
    videoInspector: missingFfprobeInspector,
    fandomRegistry: FANDOM_REGISTRY,
  });
  assert.equal(pubRes.valid, false);
  assert.match(
    pubRes.errors.join("; "),
    /Publication readiness requirement failed.*ffprobe is required for physical media stream certification/
  );

  const manifest = {
    manifestVersion: "1.0.0",
    catalogVersion: "catalog-v2",
    items: [record],
  };

  const manifestPubRes = validateContentManifest(manifest, {
    mode: "publish",
    videoInspector: missingFfprobeInspector,
    fandomRegistry: FANDOM_REGISTRY,
    isNewBatch: true,
  });
  assert.equal(manifestPubRes.valid, false);
  assert.match(manifestPubRes.streamInspection, /FAILED/);
});

test("FIX A: Asset-staging mode reports incomplete stream inspection without claiming publication readiness", () => {
  const missingFfprobeInspector = () => ({
    available: false,
    ok: false,
    error: "ffprobe is not installed in the execution environment",
  });

  const record = { ...MOCK_VALID_VIDEO };

  // In assets mode: missing ffprobe issues a warning, not fatal error
  const assetRes = validateContentRecord(record, {
    mode: "assets",
    videoInspector: missingFfprobeInspector,
    fandomRegistry: FANDOM_REGISTRY,
  });
  assert.equal(assetRes.valid, true);
  assert.match(assetRes.warnings.join("; "), /Technical stream inspection incomplete.*ffprobe unavailable/);

  const manifest = {
    manifestVersion: "1.0.0",
    catalogVersion: "catalog-v2",
    items: [record],
  };

  const manifestAssetRes = validateContentManifest(manifest, {
    mode: "assets",
    videoInspector: missingFfprobeInspector,
    fandomRegistry: FANDOM_REGISTRY,
    isNewBatch: true,
  });
  assert.equal(manifestAssetRes.valid, true);
  assert.equal(manifestAssetRes.streamInspection, "INCOMPLETE (ffprobe unavailable; technical stream inspection incomplete)");
  assert.notEqual(manifestAssetRes.streamInspection, "OK");
});

test("FIX A: Positive test: certified landscape video and genuine 9:16 portrait Short streams pass publication", () => {
  const certifiedVideoInspector = () => ({
    available: true,
    ok: true,
    width: 1920,
    height: 1080,
    codec: "h264",
    frameRate: 60,
    durationSec: 25.0,
  });

  const pubVideo = validateContentRecord(MOCK_VALID_VIDEO, {
    mode: "publish",
    videoInspector: certifiedVideoInspector,
    fandomRegistry: FANDOM_REGISTRY,
  });
  assert.equal(pubVideo.valid, true, `Certified video failed publication: ${pubVideo.errors.join("; ")}`);

  const certifiedShortInspector = () => ({
    available: true,
    ok: true,
    width: 1080,
    height: 1920,
    codec: "h264",
    frameRate: 60,
    durationSec: 15.0,
  });

  const pubShort = validateContentRecord(MOCK_VALID_SHORT, {
    mode: "publish",
    videoInspector: certifiedShortInspector,
    fandomRegistry: FANDOM_REGISTRY,
  });
  assert.equal(pubShort.valid, true, `Certified short failed publication: ${pubShort.errors.join("; ")}`);
});

test("FIX A: Rejects Shorts with non-genuine 9:16 aspect ratios (e.g. nearly square or widescreen)", () => {
  // 1080x1081 is height > width, but ratio is ~1.0009 (not genuine 9:16 portrait)
  const nonGenuineShortInspector = () => ({
    available: true,
    ok: true,
    width: 1080,
    height: 1081,
    codec: "h264",
    frameRate: 60,
    durationSec: 15.0,
  });

  const res = validateContentRecord(MOCK_VALID_SHORT, {
    mode: "publish",
    videoInspector: nonGenuineShortInspector,
    fandomRegistry: FANDOM_REGISTRY,
  });
  assert.equal(res.valid, false);
  assert.match(res.errors.join("; "), /is not a genuine portrait 9:16 Short/);
});

test("FIX A: Rejects stream inspection discrepancies in dimensions, codec, frameRate, and duration", () => {
  // Dimension mismatch
  const dimMismatchInspector = () => ({
    available: true,
    ok: true,
    width: 1280,
    height: 720,
    codec: "h264",
    frameRate: 60,
    durationSec: 25.0,
  });
  const rDim = validateContentRecord(MOCK_VALID_VIDEO, {
    mode: "publish",
    videoInspector: dimMismatchInspector,
    fandomRegistry: FANDOM_REGISTRY,
  });
  assert.equal(rDim.valid, false);
  assert.match(rDim.errors.join("; "), /Actual stream width \(1280px\) does not match declared media\.width \(1920px\)/);
  assert.match(rDim.errors.join("; "), /Actual stream height \(720px\) does not match declared media\.height \(1080px\)/);

  // Codec mismatch
  const codecMismatchInspector = () => ({
    available: true,
    ok: true,
    width: 1920,
    height: 1080,
    codec: "hevc",
    frameRate: 60,
    durationSec: 25.0,
  });
  const rCodec = validateContentRecord(MOCK_VALID_VIDEO, {
    mode: "publish",
    videoInspector: codecMismatchInspector,
    fandomRegistry: FANDOM_REGISTRY,
  });
  assert.equal(rCodec.valid, false);
  assert.match(rCodec.errors.join("; "), /Actual video codec 'hevc' does not match declared media\.codec 'h264'/);

  // Frame rate tolerance (> 0.5 fps deviation)
  const fpsMismatchInspector = () => ({
    available: true,
    ok: true,
    width: 1920,
    height: 1080,
    codec: "h264",
    frameRate: 24.0, // declared: 60
    durationSec: 25.0,
  });
  const rFps = validateContentRecord(MOCK_VALID_VIDEO, {
    mode: "publish",
    videoInspector: fpsMismatchInspector,
    fandomRegistry: FANDOM_REGISTRY,
  });
  assert.equal(rFps.valid, false);
  assert.match(rFps.errors.join("; "), /Actual frame rate \(24\.00 fps\) deviates from declared frameRate \(60 fps\)/);

  // Duration tolerance (> 3.0s deviation)
  const durationMismatchInspector = () => ({
    available: true,
    ok: true,
    width: 1920,
    height: 1080,
    codec: "h264",
    frameRate: 60,
    durationSec: 40.0, // declared: 0:25 (25s)
  });
  const rDur = validateContentRecord(MOCK_VALID_VIDEO, {
    mode: "publish",
    videoInspector: durationMismatchInspector,
    fandomRegistry: FANDOM_REGISTRY,
  });
  assert.equal(rDur.valid, false);
  assert.match(rDur.errors.join("; "), /Actual stream duration \(40\.0s\) deviates from declared duration '0:25' \(25s\)/);
});

// -------------------------------------------------------------
// FIX B: JSON Schema and Runtime Validation Concordance
// -------------------------------------------------------------

test("FIX B: Reconciles JSON Schema constraints: rejects invalid generatedAt timestamps", () => {
  const badDateManifest = {
    manifestVersion: "1.0.0",
    catalogVersion: "catalog-v2",
    generatedAt: "2026-99-99T99:99:99Z", // Invalid date
    items: [],
  };

  const res = validateContentManifest(badDateManifest, { mode: "metadata" });
  assert.equal(res.valid, false);
  assert.match(res.errors.join("; "), /must be a valid RFC 3339 \/ ISO 8601 date-time string/);

  // Concordance with validateJsonSchema
  const schemaErrors = validateJsonSchema(badDateManifest, manifestSchema);
  assert.equal(schemaErrors.length > 0, true);
  assert.match(schemaErrors.join("; "), /must be a valid RFC 3339 \/ ISO 8601 date-time string/);
});

test("FIX B: Reconciles JSON Schema constraints: rejects string values for boolean trending", () => {
  const stringTrendingRecord = {
    ...MOCK_VALID_VIDEO,
    trending: "true", // Forbidden string for boolean
  };

  const res = validateContentRecord(stringTrendingRecord, { mode: "metadata" });
  assert.equal(res.valid, false);
  assert.match(res.errors.join("; "), /Property 'trending' must be a boolean, got string/);

  // Concordance with validateJsonSchema
  const schemaErrors = validateJsonSchema(stringTrendingRecord, contentRecordSchema, manifestSchema);
  assert.equal(schemaErrors.length > 0, true);
  assert.match(schemaErrors.join("; "), /must be of type boolean, got string/);
});

test("FIX B: Reconciles JSON Schema constraints: rejects explicit nulls across object, array, and primitive fields", () => {
  const nullCases = [
    { field: "trending", val: null, regex: /Property 'trending' cannot be null/ },
    { field: "media", val: null, regex: /Property 'media' cannot be null/ },
    { field: "tags", val: null, regex: /Property 'tags' cannot be null/ },
    { field: "title", val: null, regex: /Property 'title' cannot be null/ },
    { field: "durationMs", val: null, regex: /Property 'durationMs' cannot be null/ },
    { field: "editorial", val: null, regex: /Property 'editorial' cannot be null/ },
  ];

  for (const { field, val, regex } of nullCases) {
    const record = { ...MOCK_VALID_VIDEO, [field]: val };
    const res = validateContentRecord(record, { mode: "metadata" });
    assert.equal(res.valid, false, `Field '${field}: null' should be rejected`);
    assert.match(res.errors.join("; "), regex);

    // Concordance with validateJsonSchema
    const schemaErrors = validateJsonSchema(record, contentRecordSchema, manifestSchema);
    assert.equal(schemaErrors.length > 0, true);
    assert.match(schemaErrors.join("; "), /cannot be null/);
  }
});

test("FIX B: Malformed records return structured errors rather than uncaught exceptions", () => {
  const malformedInputs = [null, undefined, [], "invalid-string", 12345, true];
  for (const input of malformedInputs) {
    assert.doesNotThrow(() => {
      const res = validateContentRecord(input, { mode: "metadata" });
      assert.equal(res.valid, false);
      assert.equal(Array.isArray(res.errors), true);
      assert.equal(res.errors.length > 0, true);
    });
  }
});

test("FIX B: Comprehensive regression test comparing representative invalid documents against Python jsonschema", () => {
  const invalidDocuments = [
    { name: "invalid-generatedAt", data: { manifestVersion: "1.0.0", catalogVersion: "v1", generatedAt: "bad-date", items: [] }, isManifest: true },
    { name: "string-trending", data: { ...MOCK_VALID_VIDEO, trending: "false" }, isManifest: false },
    { name: "null-trending", data: { ...MOCK_VALID_VIDEO, trending: null }, isManifest: false },
    { name: "null-media", data: { ...MOCK_VALID_VIDEO, media: null }, isManifest: false },
    { name: "null-tags", data: { ...MOCK_VALID_VIDEO, tags: null }, isManifest: false },
    { name: "width-below-min", data: { ...MOCK_VALID_VIDEO, media: { ...MOCK_VALID_VIDEO.media, width: 100 } }, isManifest: false },
    { name: "uppercase-tags", data: { ...MOCK_VALID_VIDEO, tags: ["UPPERCASE"] }, isManifest: false },
    { name: "empty-tags", data: { ...MOCK_VALID_VIDEO, tags: [] }, isManifest: false },
    { name: "unexpected-prop", data: { ...MOCK_VALID_VIDEO, illegalProperty: 123 }, isManifest: false },
  ];

  for (const doc of invalidDocuments) {
    // 1. Validator outcome
    let validatorValid = false;
    let validatorErrors = [];
    if (doc.isManifest) {
      const res = validateContentManifest(doc.data, { mode: "metadata" });
      validatorValid = res.valid;
      validatorErrors = res.errors;
    } else {
      const res = validateContentRecord(doc.data, { mode: "metadata" });
      validatorValid = res.valid;
      validatorErrors = res.errors;
    }
    assert.equal(validatorValid, false, `Doc ${doc.name} should fail validator`);
    assert.equal(validatorErrors.length > 0, true);

    // 2. Python jsonschema outcome
    const pythonCheck = spawnSync(
      "python3",
      [
        "-c",
        `
import json, jsonschema, sys
with open('content/manifest.schema.json') as f:
    schema = json.load(f)
validator = jsonschema.Draft7Validator(schema, format_checker=jsonschema.FormatChecker())
doc = json.loads(sys.argv[1])
is_manifest = sys.argv[2] == 'true'
if not is_manifest:
    doc = {'manifestVersion': '1.0.0', 'catalogVersion': 'v1', 'items': [doc]}
errors = [e.message for e in validator.iter_errors(doc)]
print(len(errors))
`,
        JSON.stringify(doc.data),
        String(doc.isManifest),
      ],
      { encoding: "utf8" }
    );

    assert.equal(pythonCheck.status, 0);
    const pythonErrorCount = parseInt(pythonCheck.stdout.trim(), 10);
    assert.equal(
      pythonErrorCount > 0,
      true,
      `Python jsonschema must agree with validator that ${doc.name} is invalid (python reported ${pythonErrorCount} errors)`
    );
  }
});

// -------------------------------------------------------------
// FIX C: Safe Path Containment and Symlink Escape Prevention
// -------------------------------------------------------------

test("FIX C: verifyAssetPathContainment resolves real filesystem paths and blocks symlink escapes", () => {
  const publicDir = resolve(projectRoot, "public");
  const mediaDir = resolve(publicDir, "media");

  // 1. Valid local path passes and returns realpath
  const validSvg = resolve(mediaDir, "art-0.svg");
  const resolvedReal = verifyAssetPathContainment(validSvg, publicDir);
  assert.equal(existsSync(resolvedReal), true);

  // 2. Traversal attempt throws Unsafe path traversal
  const traversalTarget = resolve(publicDir, "media/../../secret.png");
  assert.throws(
    () => verifyAssetPathContainment(traversalTarget, publicDir),
    /Unsafe path traversal: ".*" resolves outside public\/media or public\/brand directory/
  );

  // 3. Symlink inside public/media escaping to outside directory is blocked
  const tempDir = mkdtempSync(join(tmpdir(), "lolixco-symlink-escape-"));
  const outsideSecretFile = join(tempDir, "secret-outside.svg");
  writeFileSync(outsideSecretFile, '<svg xmlns="http://www.w3.org/2000/svg"></svg>');

  const symlinkInMedia = join(mediaDir, "test-v3-symlink-escape.svg");
  try {
    symlinkSync(outsideSecretFile, symlinkInMedia);

    assert.throws(
      () => verifyAssetPathContainment(symlinkInMedia, publicDir),
      /Unsafe symlink escape: ".*" resolves outside public\/media or public\/brand directory/
    );
  } finally {
    if (existsSync(symlinkInMedia)) {
      unlinkSync(symlinkInMedia);
    }
    rmSync(tempDir, { recursive: true, force: true });
  }

  // 4. Missing file throws File not found
  const missingFile = resolve(mediaDir, "nonexistent-test-file-12345.mp4");
  assert.throws(
    () => verifyAssetPathContainment(missingFile, publicDir),
    /File not found:/
  );

  // 5. Invalid file signature throws invalid header error
  const tempCorruptDir = mkdtempSync(join(tmpdir(), "lolixco-corrupt-"));
  try {
    const corruptPng = join(tempCorruptDir, "corrupt.png");
    writeFileSync(corruptPng, "NOT A REAL PNG FILE CONTENT");
    assert.throws(
      () => verifyAssetBytesStreaming(corruptPng),
      /Invalid PNG header signature/
    );
  } finally {
    rmSync(tempCorruptDir, { recursive: true, force: true });
  }
});

// -------------------------------------------------------------
// FIX D: Safe-by-Default Publication Projection
// -------------------------------------------------------------

test("FIX D: projectToPublicEdit is safe by default without requiring optional safety flags", () => {
  const draftRecord = {
    ...MOCK_VALID_VIDEO,
    editorial: {
      reviewStatus: "draft",
      rightsCleared: false,
    },
  };

  // Called with NO options: throws by default!
  assert.throws(
    () => projectToPublicEdit(draftRecord),
    /Cannot project item 101 to public catalog: editorial reviewStatus must be 'approved' or 'published'/
  );

  // Uncleared rights record throws by default
  const unclearedRecord = {
    ...MOCK_VALID_VIDEO,
    editorial: {
      reviewStatus: "approved",
      rightsCleared: false,
    },
  };
  assert.throws(
    () => projectToPublicEdit(unclearedRecord),
    /Cannot project item 101 to public catalog: editorial rightsCleared must be true/
  );

  // projectToPreviewEdit allows non-public preview explicitly
  const previewRecord = projectToPreviewEdit(draftRecord);
  assert.equal(previewRecord.id, 101);
  assert.equal(previewRecord.title, "Synthetic Test Video");

  // Approved and cleared record projects successfully and strips all private editorial fields
  const approvedRecord = {
    ...MOCK_VALID_VIDEO,
    editorial: {
      reviewStatus: "approved",
      rightsCleared: true,
      sourceAttribution: "Private Attribution",
      curatorNotes: "Private Notes",
      ownerAssetRef: "REF-101",
    },
  };
  const publicRecord = projectToPublicEdit(approvedRecord);
  assert.equal(publicRecord.id, 101);
  assert.equal("editorial" in publicRecord, false);
  assert.equal("sourceAttribution" in publicRecord, false);
  assert.equal("curatorNotes" in publicRecord, false);
  assert.equal("ownerAssetRef" in publicRecord, false);
  assert.equal("rightsCleared" in publicRecord, false);
});

// -------------------------------------------------------------
// FIX E: Validate CLI Modes and Reject Unsupported Options
// -------------------------------------------------------------

test("FIX E: Programmatic validation strictly rejects unsupported modes", () => {
  const invalidModes = ["invalid", "verify", "staging", "all", ""];
  for (const badMode of invalidModes) {
    const res = validateContentManifest(
      { manifestVersion: "1.0.0", catalogVersion: "v1", items: [] },
      { mode: badMode }
    );
    assert.equal(res.valid, false);
    assert.match(res.errors[0], /Invalid validation mode/);
    assert.match(res.errors[0], /Allowed modes: metadata, assets, publish/);
  }
});

test("FIX E: CLI execution strictly rejects unsupported modes with non-zero exit code", () => {
  const cliBadMode = spawnSync("node", ["scripts/validate-content.mjs", "--mode", "unknown-mode"], {
    encoding: "utf8",
  });
  assert.notEqual(cliBadMode.status, 0, "CLI with bad mode must exit non-zero");
  assert.match(cliBadMode.stderr, /Invalid validation mode 'unknown-mode'/);

  const cliBadFlag = spawnSync("node", ["scripts/validate-content.mjs", "--unsupported-flag"], {
    encoding: "utf8",
  });
  assert.notEqual(cliBadFlag.status, 0, "CLI with unrecognized flag must exit non-zero");
  assert.match(cliBadFlag.stderr, /Unrecognized option '--unsupported-flag'/);
});

test("FIX E: CLI execution accepts all valid modes (metadata, assets, publish)", () => {
  for (const validMode of VALID_MODES) {
    const cliRes = spawnSync(
      "node",
      ["scripts/validate-content.mjs", "--manifest", "content/manifest.template.json", "--mode", validMode],
      { encoding: "utf8" }
    );
    // In publish mode with draft template it returns code 1 because draft items fail publication, but DOES NOT fail on mode validation
    assert.doesNotMatch(cliRes.stderr, /Invalid validation mode/);
  }
});
