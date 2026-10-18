import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  validateContentRecord,
  validateContentManifest,
  validateLiveCatalog,
  projectToPublicEdit,
  verifyAssetBytesStreaming,
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
