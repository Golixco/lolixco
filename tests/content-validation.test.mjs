import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  validateContentRecord,
  validateContentManifest,
  validateLiveCatalog,
  projectToPublicEdit,
  verifyAssetBytes,
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
  },
  editorial: {
    reviewStatus: "approved",
    rightsCleared: true,
    sourceAttribution: "Verified synthetic source.",
    curatorNotes: "Looks great.",
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
  trending: true,
  media: {
    aspectRatio: "9:16",
    width: 1080,
    height: 1920,
    codec: "h264",
    audioCodec: "aac",
  },
  editorial: {
    reviewStatus: "approved",
    rightsCleared: true,
    sourceAttribution: "Verified synthetic submission.",
    curatorNotes: "High retention short.",
  },
};

test("Live catalog has exactly 17 demo edits, 0 shorts, and valid IDs 0-16", async () => {
  const result = await validateLiveCatalog();
  assert.equal(result.valid, true, `Validation errors: ${result.errors.join("; ")}`);
  assert.equal(result.summary.total, 17);
  assert.equal(result.summary.videos, 17);
  assert.equal(result.summary.shorts, 0);
  assert.equal(edits.length, 17);
  assert.equal(edits.filter((e) => e.format === "short").length, 0);
});

test("Manifest template is 100% valid according to validation engine", async () => {
  const templateModule = await import("../content/manifest.template.json", {
    with: { type: "json" },
  });
  const result = validateContentManifest(templateModule.default, {
    fandomRegistry: FANDOM_REGISTRY,
    isNewBatch: true,
  });
  assert.equal(result.valid, true, `Template errors: ${result.errors.join("; ")}`);
  assert.equal(result.summary.total, 2);
  assert.equal(result.summary.videos, 1);
  assert.equal(result.summary.shorts, 1);
});

test("Validation rejects duplicate IDs within a batch", () => {
  const seenIds = new Set([101]);
  const result = validateContentRecord(MOCK_VALID_VIDEO, {
    seenIds,
    fandomRegistry: FANDOM_REGISTRY,
  });
  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /Duplicate ID: 101/);
});

test("Validation rejects non-integer or negative IDs", () => {
  const r1 = validateContentRecord({ ...MOCK_VALID_VIDEO, id: -1 });
  assert.equal(r1.valid, false);
  assert.match(r1.errors.join(" "), /must be non-negative integer/);

  const r2 = validateContentRecord({ ...MOCK_VALID_VIDEO, id: 10.5 });
  assert.equal(r2.valid, false);
  assert.match(r2.errors.join(" "), /must be non-negative integer/);

  const r3 = validateContentRecord({ ...MOCK_VALID_VIDEO, id: "101" });
  assert.equal(r3.valid, false);
  assert.match(r3.errors.join(" "), /must be non-negative integer/);
});

test("Validation rejects reserved demo IDs (0-16) when ingesting new batches", () => {
  const result = validateContentRecord(
    { ...MOCK_VALID_VIDEO, id: 5 },
    { isNewBatch: true, fandomRegistry: FANDOM_REGISTRY }
  );
  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /Reserved ID conflict: ID 5 is reserved for baseline demo edits/);
});

test("Validation permits reserved demo IDs (0-16) when validating existing catalog", () => {
  const result = validateContentRecord(
    { ...MOCK_VALID_VIDEO, id: 5 },
    { isNewBatch: false, fandomRegistry: FANDOM_REGISTRY }
  );
  assert.equal(result.valid, true);
});

test("Validation rejects legacy 'Cinematic' category for new content batches", () => {
  const result = validateContentRecord(
    { ...MOCK_VALID_VIDEO, id: 102, category: "Cinematic", fandomIds: [] },
    { isNewBatch: true, fandomRegistry: FANDOM_REGISTRY }
  );
  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /Legacy category "Cinematic" is strictly reserved for demo edits/);
});

test("Validation accepts canonical categories for new content batches", () => {
  for (const cat of ["Anime", "Movies", "Series", "Multifandom", "Gaming", "Phonk"]) {
    const res = validateContentRecord(
      { ...MOCK_VALID_VIDEO, id: 105, category: cat, fandomIds: [] },
      { isNewBatch: true, fandomRegistry: FANDOM_REGISTRY }
    );
    assert.equal(res.valid, true, `Category ${cat} failed: ${res.errors.join(", ")}`);
  }
});

test("Validation rejects unrecognized fandom IDs", () => {
  const result = validateContentRecord(
    { ...MOCK_VALID_VIDEO, fandomIds: ["non-existent-fandom"] },
    { fandomRegistry: FANDOM_REGISTRY }
  );
  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /Unrecognized fandom ID: "non-existent-fandom"/);
});

test("Validation enforces category-fandom compatibility", () => {
  // spider-man belongs to Movies, not Anime
  const incompatible = validateContentRecord(
    { ...MOCK_VALID_VIDEO, category: "Anime", fandomIds: ["spider-man"] },
    { fandomRegistry: FANDOM_REGISTRY }
  );
  assert.equal(incompatible.valid, false);
  assert.match(incompatible.errors.join(" "), /incompatible with category "Anime"/);

  // Multifandom allows multiple fandoms across different categories
  const multifandom = validateContentRecord(
    { ...MOCK_VALID_VIDEO, category: "Multifandom", fandomIds: ["spider-man", "jujutsu-kaisen"] },
    { fandomRegistry: FANDOM_REGISTRY }
  );
  assert.equal(multifandom.valid, true);
});

test("Validation rejects malformed or invalid tags", () => {
  const emptyTags = validateContentRecord({ ...MOCK_VALID_VIDEO, tags: [] });
  assert.equal(emptyTags.valid, false);

  const hashTags = validateContentRecord({ ...MOCK_VALID_VIDEO, tags: ["#anime"] });
  assert.equal(hashTags.valid, false);
  assert.match(hashTags.errors.join(" "), /must not include leading '#' symbol/);

  const invalidChars = validateContentRecord({ ...MOCK_VALID_VIDEO, tags: ["anime!edit"] });
  assert.equal(invalidChars.valid, false);
  assert.match(invalidChars.errors.join(" "), /contains invalid characters/);
});

test("Validation enforces format and aspect ratio consistency", () => {
  // Video claiming 9:16 aspect ratio
  const invertedVideo = validateContentRecord({
    ...MOCK_VALID_VIDEO,
    format: "video",
    media: { aspectRatio: "9:16", width: 1080, height: 1920 },
  });
  assert.equal(invertedVideo.valid, false);
  assert.match(invertedVideo.errors.join(" "), /cannot declare vertical aspect ratio "9:16"/);

  // Short claiming 16:9 aspect ratio
  const invertedShort = validateContentRecord({
    ...MOCK_VALID_SHORT,
    format: "short",
    media: { aspectRatio: "16:9", width: 1920, height: 1080 },
  });
  assert.equal(invertedShort.valid, false);
  assert.match(invertedShort.errors.join(" "), /must have aspect ratio "9:16"/);
});

test("Validation rejects missing required strings (title, description, duration)", () => {
  const noTitle = validateContentRecord({ ...MOCK_VALID_VIDEO, title: "" });
  assert.equal(noTitle.valid, false);

  const noDesc = validateContentRecord({ ...MOCK_VALID_VIDEO, description: "" });
  assert.equal(noDesc.valid, false);

  const badDuration = validateContentRecord({ ...MOCK_VALID_VIDEO, duration: "invalid" });
  assert.equal(badDuration.valid, false);
  assert.match(badDuration.errors.join(" "), /Invalid duration/);
});

test("Validation rejects private editorial fields at the public root level", () => {
  const leakedRecord = {
    ...MOCK_VALID_VIDEO,
    curatorNotes: "Secret note that should not be in public JSON",
    rightsCleared: true,
  };
  const result = validateContentRecord(leakedRecord);
  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /Private editorial field "curatorNotes" must be encapsulated/);
});

test("projectToPublicEdit produces clean public object without editorial leaks", () => {
  const publicRecord = projectToPublicEdit(MOCK_VALID_VIDEO);
  assert.equal(publicRecord.id, 101);
  assert.equal(publicRecord.format, "video");
  assert.equal(publicRecord.title, MOCK_VALID_VIDEO.title);
  assert.equal(publicRecord.category, "Anime");
  assert.deepEqual(publicRecord.fandomIds, ["jujutsu-kaisen"]);
  assert.equal("editorial" in publicRecord, false);
  assert.equal("curatorNotes" in publicRecord, false);
  assert.equal("rightsCleared" in publicRecord, false);
  assert.equal("sourceAttribution" in publicRecord, false);
});

test("Asset magic byte validation detects valid and invalid files", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "lolixco-test-assets-"));
  try {
    // 1. Valid SVG
    const svgPath = join(tempDir, "test.svg");
    writeFileSync(svgPath, "<svg xmlns='http://www.w3.org/2000/svg'><circle/></svg>");
    assert.doesNotThrow(() => verifyAssetBytes(svgPath));

    // 2. Corrupt SVG
    const badSvgPath = join(tempDir, "bad.svg");
    writeFileSync(badSvgPath, "plain text not svg");
    assert.throws(() => verifyAssetBytes(badSvgPath), /missing <svg element/);

    // 3. Valid PNG
    const pngPath = join(tempDir, "test.png");
    const pngBuf = Buffer.from("89504e470d0a1a0a0000000d494844520000000100000001", "hex");
    writeFileSync(pngPath, pngBuf);
    assert.doesNotThrow(() => verifyAssetBytes(pngPath));

    // 4. Corrupt PNG
    const badPngPath = join(tempDir, "bad.png");
    writeFileSync(badPngPath, Buffer.from("12345678", "hex"));
    assert.throws(() => verifyAssetBytes(badPngPath), /Invalid PNG header signature/);

    // 5. Valid MP4
    const mp4Path = join(tempDir, "test.mp4");
    // [4 bytes length][ftyp][4 bytes major brand]
    const mp4Buf = Buffer.concat([
      Buffer.from([0, 0, 0, 24]),
      Buffer.from("ftyp", "ascii"),
      Buffer.from("isom0000", "ascii"),
    ]);
    writeFileSync(mp4Path, mp4Buf);
    assert.doesNotThrow(() => verifyAssetBytes(mp4Path));

    // 6. Corrupt MP4
    const badMp4Path = join(tempDir, "bad.mp4");
    writeFileSync(badMp4Path, Buffer.from("00000018moov00000000", "ascii"));
    assert.throws(() => verifyAssetBytes(badMp4Path), /Invalid MP4 header signature/);

    // 7. Valid WebM
    const webmPath = join(tempDir, "test.webm");
    writeFileSync(webmPath, Buffer.from("1a45dfa39f4286810142f7", "hex"));
    assert.doesNotThrow(() => verifyAssetBytes(webmPath));

    // 8. Valid WebP
    const webpPath = join(tempDir, "test.webp");
    const webpBuf = Buffer.concat([
      Buffer.from("RIFF", "ascii"),
      Buffer.from([100, 0, 0, 0]),
      Buffer.from("WEBP", "ascii"),
    ]);
    writeFileSync(webpPath, webpBuf);
    assert.doesNotThrow(() => verifyAssetBytes(webpPath));

    // 9. Valid JPEG
    const jpgPath = join(tempDir, "test.jpg");
    writeFileSync(jpgPath, Buffer.from([0xff, 0xd8, 0xff, 0xe0]));
    assert.doesNotThrow(() => verifyAssetBytes(jpgPath));
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});
