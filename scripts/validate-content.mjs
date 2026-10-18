import { statSync, openSync, readSync, closeSync, existsSync, readFileSync } from "node:fs";
import { resolve, relative, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { register } from "node:module";
import { spawnSync } from "node:child_process";

export const projectRoot = fileURLToPath(new URL("../", import.meta.url));

// Register TypeScript loader for on-the-fly TS transpilation
try {
  register("./tests/ts-hooks.mjs", new URL("../", import.meta.url));
} catch {
  // If already registered or unavailable, proceed
}

export const PRIMARY_CATEGORIES = [
  "Anime",
  "Movies",
  "Series",
  "Multifandom",
  "Gaming",
  "Phonk",
];

export const LEGACY_CATEGORIES = ["Cinematic"];
export const ALL_CATEGORIES = [...PRIMARY_CATEGORIES, ...LEGACY_CATEGORIES];

export const VALID_TAG_REGEX = /^[a-z0-9_-]+$/;
export const DURATION_REGEX = /^[0-9]+:[0-5][0-9]$/;
export const FANDOM_SLUG_REGEX = /^[a-z0-9_-]+$/;
export const POSTER_PATH_REGEX = /^(\/|https?:\/\/|\.\/).+\.(svg|png|jpg|jpeg|webp)$/;
export const VIDEO_PATH_REGEX = /^(\/|https?:\/\/|\.\/).+\.(mp4|webm|m4v)$/;

export const ALLOWED_ROOT_KEYS = [
  "$schema",
  "manifestVersion",
  "catalogVersion",
  "generatedAt",
  "description",
  "items",
];

export const REQUIRED_RECORD_KEYS = [
  "id",
  "format",
  "title",
  "description",
  "category",
  "tags",
  "poster",
  "source",
  "duration",
];

export const ALLOWED_RECORD_KEYS = [
  "id",
  "format",
  "title",
  "description",
  "category",
  "fandomIds",
  "tags",
  "poster",
  "source",
  "duration",
  "durationMs",
  "trending",
  "media",
  "editorial",
];

export const ALLOWED_MEDIA_KEYS = [
  "aspectRatio",
  "width",
  "height",
  "codec",
  "audioCodec",
  "frameRate",
  "bitrateKbps",
  "loudnessLkfs",
];

export const ALLOWED_EDITORIAL_KEYS = [
  "reviewStatus",
  "rightsCleared",
  "sourceAttribution",
  "curatorNotes",
  "ownerAssetRef",
];

export const ALLOWED_CODECS = ["h264", "hevc", "av1", "vp9", "vp8"];
export const ALLOWED_AUDIO_CODECS = ["aac", "opus", "mp3", "none"];
export const ALLOWED_ASPECT_RATIOS = ["16:9", "9:16", "4:3", "2.39:1"];
export const ALLOWED_REVIEW_STATUSES = ["draft", "reviewed", "approved", "rejected", "published"];

/**
 * Check if ffprobe is installed and executable in PATH.
 */
export function isFFprobeAvailable() {
  try {
    const res = spawnSync("ffprobe", ["-version"], { stdio: "ignore" });
    return res.status === 0;
  } catch {
    return false;
  }
}

/**
 * Inspect actual video streams using ffprobe when available.
 */
export function inspectVideoWithFFprobe(filePath) {
  if (!isFFprobeAvailable()) {
    return { available: false, error: "ffprobe not installed" };
  }
  try {
    const res = spawnSync(
      "ffprobe",
      [
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=width,height,codec_name,r_frame_rate,duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        filePath,
      ],
      { encoding: "utf8" }
    );
    if (res.status !== 0 || !res.stdout) {
      return { available: true, error: res.stderr || "ffprobe inspection failed" };
    }
    const lines = res.stdout.trim().split("\n");
    const codec = lines[0] || null;
    const width = parseInt(lines[1], 10) || null;
    const height = parseInt(lines[2], 10) || null;
    return { available: true, width, height, codec };
  } catch (err) {
    return { available: true, error: err.message };
  }
}

/**
 * Verify asset file headers and magic bytes without reading entire file into memory.
 * Reads a fixed-size header buffer (up to 4KB).
 */
export function verifyAssetBytesStreaming(filePath) {
  if (!existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  const info = statSync(filePath);
  if (!info.isFile() || info.size === 0) {
    throw new Error(`Empty file or not a regular file (size: ${info.size})`);
  }

  const fd = openSync(filePath, "r");
  const buffer = Buffer.alloc(Math.min(65536, info.size));
  try {
    const bytesRead = readSync(fd, buffer, 0, buffer.length, 0);
    if (bytesRead === 0) {
      throw new Error("Unable to read file header (0 bytes read)");
    }
  } finally {
    closeSync(fd);
  }

  const ext = extname(filePath).toLowerCase();

  switch (ext) {
    case ".svg":
      if (!buffer.toString("utf8").includes("<svg")) {
        throw new Error("Invalid SVG: missing <svg element");
      }
      break;

    case ".png":
      if (buffer.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") {
        throw new Error("Invalid PNG header signature (expected 89504e470d0a1a0a)");
      }
      break;

    case ".jpg":
    case ".jpeg":
      if (buffer[0] !== 0xff || buffer[1] !== 0xd8 || buffer[2] !== 0xff) {
        throw new Error("Invalid JPEG header signature (expected ffd8ff)");
      }
      break;

    case ".webp":
      if (
        buffer.subarray(0, 4).toString("ascii") !== "RIFF" ||
        buffer.subarray(8, 12).toString("ascii") !== "WEBP"
      ) {
        throw new Error("Invalid WebP header signature (expected RIFF....WEBP)");
      }
      break;

    case ".webm":
      if (buffer.subarray(0, 4).toString("hex") !== "1a45dfa3") {
        throw new Error("Invalid WebM header signature (expected 1a45dfa3)");
      }
      break;

    case ".mp4":
    case ".m4v":
      if (buffer.length < 12 || buffer.subarray(4, 8).toString("ascii") !== "ftyp") {
        throw new Error("Invalid MP4 header signature (expected 'ftyp' box at offset 4)");
      }
      break;

    default:
      break;
  }

  return { bytes: info.size, extension: ext };
}

/**
 * Validate an individual content record.
 */
export function validateContentRecord(record, options = {}) {
  const {
    seenIds = new Set(),
    isNewBatch = false,
    fandomRegistry = [],
    mode = "metadata", // "metadata" | "assets" | "publish"
    publicDir = resolve(projectRoot, "public"),
  } = options;

  const errors = [];
  const warnings = [];

  // Handle malformed item root types
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    return {
      valid: false,
      errors: [
        `Record must be a JSON object, got ${record === null ? "null" : Array.isArray(record) ? "array" : typeof record}`,
      ],
      warnings: [],
    };
  }

  const isLiveCatalog = options.isLiveCatalog ?? (!isNewBatch);

  // Schema Rule: Check unexpected properties (additionalProperties: false)
  const allowedKeys = isLiveCatalog ? [...ALLOWED_RECORD_KEYS, "creator"] : ALLOWED_RECORD_KEYS;
  for (const key of Object.keys(record)) {
    if (!allowedKeys.includes(key)) {
      errors.push(`Unexpected record property '${key}' (schema forbids additionalProperties)`);
    }
  }

  // Schema Rule: Check required fields
  const requiredKeys = isLiveCatalog
    ? REQUIRED_RECORD_KEYS.filter((k) => k !== "format")
    : REQUIRED_RECORD_KEYS;
  for (const reqKey of requiredKeys) {
    if (!(reqKey in record) || record[reqKey] === undefined) {
      errors.push(`Missing required property '${reqKey}'`);
    }
  }

  // 1. Validate ID
  const id = record.id;
  if (typeof id !== "number" || !Number.isInteger(id) || id < 0) {
    errors.push(`Invalid ID: ${JSON.stringify(id)} (must be non-negative integer)`);
  } else {
    if (seenIds.has(id)) {
      errors.push(`Duplicate ID: ${id} is already assigned in this catalog/manifest`);
    } else {
      seenIds.add(id);
    }

    if (isNewBatch) {
      if (id >= 0 && id <= 16) {
        errors.push(
          `Reserved ID conflict: ID ${id} is reserved for baseline demo edits (0-16). New curated content must use IDs >= 100.`
        );
      } else if (id >= 17 && id <= 99) {
        errors.push(
          `Reserved ID conflict: ID ${id} is reserved for internal test harnesses (17-99). Use 100-199 for landscape videos or 200-299 for portrait shorts.`
        );
      } else {
        // Enforce documented ID range policy
        const format = record.format;
        if (format === "video" && (id < 100 || id > 199)) {
          errors.push(
            `ID range mismatch: Landscape video ID ${id} must be in range 100-199 according to documented allocation policy.`
          );
        } else if (format === "short" && (id < 200 || id > 299)) {
          errors.push(
            `ID range mismatch: Curated Short ID ${id} must be in range 200-299 according to documented allocation policy.`
          );
        }
      }
    }
  }

  // 2. Validate Format
  const format = record.format;
  if (format !== undefined) {
    if (format !== "video" && format !== "short") {
      errors.push(`Invalid format: ${JSON.stringify(format)} (must be "video" or "short")`);
    }
  }

  // 3. Validate Title
  if (typeof record.title !== "string" || !record.title.trim()) {
    if ("title" in record) errors.push("Title must be a non-empty string");
  } else if (record.title.trim().length < 3 || record.title.trim().length > 100) {
    errors.push(
      `Title length out of bounds: "${record.title.trim()}" (${record.title.trim().length} chars, expected 3-100)`
    );
  }

  // 4. Validate Description
  if (typeof record.description !== "string" || !record.description.trim()) {
    if ("description" in record) errors.push("Description must be a non-empty string");
  } else if (record.description.trim().length < 5 || record.description.trim().length > 1000) {
    errors.push(
      `Description length out of bounds (${record.description.trim().length} chars, expected 5-1000)`
    );
  }

  // 5. Validate Category
  if (typeof record.category !== "string" || !record.category.trim()) {
    if ("category" in record) errors.push("Category must be a non-empty string");
  } else {
    const trimmedCat = record.category.trim();
    if (!ALL_CATEGORIES.includes(trimmedCat)) {
      errors.push(
        `Invalid category: "${trimmedCat}". Allowed categories: ${ALL_CATEGORIES.join(", ")}`
      );
    } else if (isNewBatch && trimmedCat === "Cinematic") {
      errors.push(
        `Legacy category "Cinematic" is strictly reserved for demo edits (IDs 0-16). New content must use canonical categories: ${PRIMARY_CATEGORIES.join(", ")}`
      );
    }
  }

  // 6. Validate Fandom Associations
  if (record.fandomIds !== undefined && record.fandomIds !== null) {
    if (!Array.isArray(record.fandomIds)) {
      errors.push("fandomIds must be an array of string slugs");
    } else {
      const registryMap = new Map(fandomRegistry.map((f) => [f.id.toLowerCase(), f]));
      for (const fandomId of record.fandomIds) {
        if (typeof fandomId !== "string" || !fandomId.trim()) {
          errors.push(`Invalid fandom ID: ${JSON.stringify(fandomId)}`);
          continue;
        }
        const normalized = fandomId.trim().toLowerCase();
        if (!FANDOM_SLUG_REGEX.test(normalized)) {
          errors.push(`Fandom slug "${fandomId}" contains invalid characters (allowed: /^[a-z0-9_-]+$/)`);
        }
        const fandom = registryMap.get(normalized);
        if (!fandom) {
          errors.push(
            `Unrecognized fandom ID: "${fandomId}". Must be registered in FANDOM_REGISTRY.`
          );
        } else if (record.category && record.category !== "Multifandom") {
          const compatible = fandom.categories.some(
            (c) => c.toLowerCase() === record.category.toLowerCase()
          );
          if (!compatible) {
            errors.push(
              `Fandom "${fandom.title}" (${fandom.id}) is associated with [${fandom.categories.join(", ")}], incompatible with category "${record.category}"`
            );
          }
        }
      }
    }
  }

  // 7. Validate Tags (Strict lower-case regex match)
  if (!Array.isArray(record.tags) || record.tags.length === 0) {
    if ("tags" in record) errors.push("Missing or empty tags array (at least 1 tag required)");
  } else {
    for (const tag of record.tags) {
      if (typeof tag !== "string" || !tag.trim()) {
        errors.push(`Invalid tag: ${JSON.stringify(tag)}`);
      } else {
        const trimmedTag = tag.trim();
        if (trimmedTag.startsWith("#")) {
          errors.push(`Tag "${tag}" must not include leading '#' symbol`);
        }
        if (!VALID_TAG_REGEX.test(trimmedTag)) {
          errors.push(
            `Tag "${tag}" contains invalid characters or uppercase letters (must match /^[a-z0-9_-]+$/)`
          );
        }
      }
    }
  }

  // 8. Validate Duration
  if (typeof record.duration !== "string" || !DURATION_REGEX.test(record.duration.trim())) {
    if ("duration" in record) {
      errors.push(
        `Invalid duration: "${record.duration}" (expected format M:SS or MM:SS, e.g. "0:24", "1:45")`
      );
    }
  }

  if (record.durationMs !== undefined && record.durationMs !== null) {
    if (
      typeof record.durationMs !== "number" ||
      !Number.isInteger(record.durationMs) ||
      record.durationMs <= 0 ||
      record.durationMs > 3600000
    ) {
      errors.push(`Invalid durationMs: ${record.durationMs} (must be positive integer <= 3600000)`);
    }
  }

  // 9. Validate Media Details & Consistency (Schema & Aspect Ratio)
  if (record.media !== undefined && record.media !== null) {
    if (typeof record.media !== "object" || Array.isArray(record.media)) {
      errors.push("media property must be an object");
    } else {
      // Check additionalProperties: false on media
      for (const mKey of Object.keys(record.media)) {
        if (!ALLOWED_MEDIA_KEYS.includes(mKey)) {
          errors.push(`Unexpected media property '${mKey}' (schema forbids additionalProperties)`);
        }
      }

      const { aspectRatio, width, height, codec, audioCodec, frameRate, bitrateKbps, loudnessLkfs } =
        record.media;

      if (aspectRatio !== undefined) {
        if (!ALLOWED_ASPECT_RATIOS.includes(aspectRatio)) {
          errors.push(
            `Invalid aspectRatio '${aspectRatio}'. Allowed: ${ALLOWED_ASPECT_RATIOS.join(", ")}`
          );
        }
      }

      if (codec !== undefined && !ALLOWED_CODECS.includes(codec)) {
        errors.push(`Unsupported codec '${codec}'. Allowed: ${ALLOWED_CODECS.join(", ")}`);
      }

      if (audioCodec !== undefined && !ALLOWED_AUDIO_CODECS.includes(audioCodec)) {
        errors.push(
          `Unsupported audioCodec '${audioCodec}'. Allowed: ${ALLOWED_AUDIO_CODECS.join(", ")}`
        );
      }

      if (width !== undefined) {
        if (typeof width !== "number" || !Number.isInteger(width) || width < 320 || width > 7680) {
          errors.push(`media.width must be an integer between 320 and 7680, got ${width}`);
        }
      }

      if (height !== undefined) {
        if (typeof height !== "number" || !Number.isInteger(height) || height < 320 || height > 4320) {
          errors.push(`media.height must be an integer between 320 and 4320, got ${height}`);
        }
      }

      if (frameRate !== undefined) {
        if (typeof frameRate !== "number" || frameRate < 23.976 || frameRate > 120) {
          errors.push(`media.frameRate must be a number between 23.976 and 120, got ${frameRate}`);
        }
      }

      if (bitrateKbps !== undefined) {
        if (
          typeof bitrateKbps !== "number" ||
          !Number.isInteger(bitrateKbps) ||
          bitrateKbps < 100 ||
          bitrateKbps > 100000
        ) {
          errors.push(
            `media.bitrateKbps must be an integer between 100 and 100000, got ${bitrateKbps}`
          );
        }
      }

      if (loudnessLkfs !== undefined) {
        if (typeof loudnessLkfs !== "number" || loudnessLkfs < -30 || loudnessLkfs > -5) {
          errors.push(
            `media.loudnessLkfs must be a number between -30 and -5, got ${loudnessLkfs}`
          );
        }
      }

      // Aspect ratio consistency
      if (format === "video") {
        if (aspectRatio === "9:16") {
          errors.push(`Format "video" (landscape) cannot declare vertical aspect ratio "9:16"`);
        }
        if (width && height && height > width) {
          errors.push(`Format "video" (landscape) has portrait dimensions: ${width}x${height}`);
        }
      } else if (format === "short") {
        if (aspectRatio && aspectRatio !== "9:16") {
          errors.push(
            `Format "short" (vertical) must have aspect ratio "9:16", got "${aspectRatio}"`
          );
        }
        if (width && height && width > height) {
          errors.push(`Format "short" (vertical) has landscape dimensions: ${width}x${height}`);
        }
      }
    }
  }

  // 10. Validate Asset References & Staged Files
  const checkAssetFiles = mode === "assets" || mode === "publish";

  if (typeof record.poster !== "string" || !record.poster.trim()) {
    if ("poster" in record) errors.push("Missing or empty poster asset reference");
  } else if (!POSTER_PATH_REGEX.test(record.poster.trim())) {
    errors.push(
      `Poster path '${record.poster}' does not match required pattern (must end in .svg, .png, .jpg, .jpeg, or .webp)`
    );
  } else if (checkAssetFiles) {
    if (record.poster.startsWith("http://") || record.poster.startsWith("https://")) {
      errors.push(
        `Remote poster reference '${record.poster}' cannot be verified offline. Staged local media is required for production publication.`
      );
    } else {
      const normalized = record.poster.startsWith("/") ? record.poster.slice(1) : record.poster;
      const targetFile = resolve(publicDir, normalized);
      // Containment check
      const mediaDir = resolve(publicDir, "media");
      const brandDir = resolve(publicDir, "brand");
      if (
        !targetFile.startsWith(mediaDir + sep) &&
        !targetFile.startsWith(brandDir + sep) &&
        targetFile !== publicDir
      ) {
        errors.push(
          `Unsafe asset path: "${record.poster}" resolves outside public/media or public/brand directory`
        );
      } else {
        try {
          verifyAssetBytesStreaming(targetFile);
        } catch (err) {
          errors.push(`Poster asset verification failed (${record.poster}): ${err.message}`);
        }
      }
    }
  }

  if (typeof record.source !== "string" || !record.source.trim()) {
    if ("source" in record) errors.push("Missing or empty source video reference");
  } else if (!VIDEO_PATH_REGEX.test(record.source.trim())) {
    errors.push(
      `Source video path '${record.source}' does not match required pattern (must end in .mp4, .webm, or .m4v)`
    );
  } else if (checkAssetFiles) {
    if (record.source.startsWith("http://") || record.source.startsWith("https://")) {
      errors.push(
        `Remote video reference '${record.source}' cannot be verified offline. Staged local media is required for production publication.`
      );
    } else {
      const normalized = record.source.startsWith("/") ? record.source.slice(1) : record.source;
      const targetFile = resolve(publicDir, normalized);
      // Containment check
      const mediaDir = resolve(publicDir, "media");
      const brandDir = resolve(publicDir, "brand");
      if (
        !targetFile.startsWith(mediaDir + sep) &&
        !targetFile.startsWith(brandDir + sep) &&
        targetFile !== publicDir
      ) {
        errors.push(
          `Unsafe asset path: "${record.source}" resolves outside public/media or public/brand directory`
        );
      } else {
        try {
          verifyAssetBytesStreaming(targetFile);
          // If ffprobe is available, check streams
          if (isFFprobeAvailable()) {
            const probeResult = inspectVideoWithFFprobe(targetFile);
            if (probeResult.available && probeResult.width && probeResult.height) {
              if (format === "video" && probeResult.height > probeResult.width) {
                errors.push(
                  `Actual media stream is portrait (${probeResult.width}x${probeResult.height}), incompatible with format "video"`
                );
              } else if (format === "short" && probeResult.width > probeResult.height) {
                errors.push(
                  `Actual media stream is landscape (${probeResult.width}x${probeResult.height}), incompatible with format "short"`
                );
              }
            }
          }
        } catch (err) {
          errors.push(`Source video verification failed (${record.source}): ${err.message}`);
        }
      }
    }
  }

  // 11. Validate Editorial & Publication Requirements (FIX C)
  if (record.editorial !== undefined && record.editorial !== null) {
    if (typeof record.editorial !== "object" || Array.isArray(record.editorial)) {
      errors.push("editorial property must be an object");
    } else {
      // Check additionalProperties: false on editorial
      for (const eKey of Object.keys(record.editorial)) {
        if (!ALLOWED_EDITORIAL_KEYS.includes(eKey)) {
          errors.push(
            `Unexpected editorial property '${eKey}' (schema forbids additionalProperties)`
          );
        }
      }

      const { reviewStatus, rightsCleared, sourceAttribution, curatorNotes, ownerAssetRef } =
        record.editorial;

      if (reviewStatus !== undefined && !ALLOWED_REVIEW_STATUSES.includes(reviewStatus)) {
        errors.push(
          `Invalid editorial.reviewStatus '${reviewStatus}'. Allowed: ${ALLOWED_REVIEW_STATUSES.join(", ")}`
        );
      }

      if (rightsCleared !== undefined && typeof rightsCleared !== "boolean") {
        errors.push("editorial.rightsCleared must be a boolean");
      }

      if (sourceAttribution !== undefined) {
        if (typeof sourceAttribution !== "string" || sourceAttribution.length > 500) {
          errors.push("editorial.sourceAttribution must be a string up to 500 characters");
        }
      }

      if (curatorNotes !== undefined) {
        if (typeof curatorNotes !== "string" || curatorNotes.length > 1000) {
          errors.push("editorial.curatorNotes must be a string up to 1000 characters");
        }
      }

      if (ownerAssetRef !== undefined) {
        if (typeof ownerAssetRef !== "string" || ownerAssetRef.length > 100) {
          errors.push("editorial.ownerAssetRef must be a string up to 100 characters");
        }
      }
    }
  }

  // Publication Readiness Enforcement (FIX C)
  if (mode === "publish") {
    if (!record.editorial) {
      errors.push(
        `Publication requirement failed for ID ${id}: Missing editorial review block. Approved review and documented rights clearance are mandatory for publication.`
      );
    } else {
      const status = record.editorial.reviewStatus;
      if (status !== "approved" && status !== "published") {
        errors.push(
          `Publication requirement failed for ID ${id}: reviewStatus is "${status}". Only "approved" or "published" records may be published.`
        );
      }
      if (record.editorial.rightsCleared !== true) {
        errors.push(
          `Publication requirement failed for ID ${id}: rightsCleared is not true. Documented rights clearance is mandatory for publication.`
        );
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate a full content manifest.
 */
export function validateContentManifest(manifest, options = {}) {
  const {
    mode = "metadata",
    isNewBatch = true,
    existingCatalog = [],
    existingCatalogIds = [],
  } = options;
  const errors = [];
  const warnings = [];

  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    return {
      valid: false,
      errors: ["Manifest root must be a JSON object"],
      warnings: [],
      mode,
      summary: { total: 0, videos: 0, shorts: 0 },
    };
  }

  // Check unexpected root keys
  for (const rKey of Object.keys(manifest)) {
    if (!ALLOWED_ROOT_KEYS.includes(rKey)) {
      errors.push(`Unexpected root property '${rKey}' (schema forbids additionalProperties)`);
    }
  }

  if (typeof manifest.manifestVersion !== "string" || !/^[0-9]+\.[0-9]+\.[0-9]+$/.test(manifest.manifestVersion)) {
    errors.push("Manifest missing valid 'manifestVersion' semantic version string (e.g. '1.0.0')");
  }
  if (typeof manifest.catalogVersion !== "string" || !/^[a-zA-Z0-9_-]+$/.test(manifest.catalogVersion)) {
    errors.push("Manifest missing valid 'catalogVersion' string (e.g. 'catalog-v2')");
  }
  if (!Array.isArray(manifest.items)) {
    errors.push("Manifest missing 'items' array");
    return {
      valid: false,
      errors,
      warnings,
      mode,
      summary: { total: 0, videos: 0, shorts: 0 },
    };
  }

  const seenIds = new Set([
    ...existingCatalogIds,
    ...existingCatalog.map((item) => item?.id).filter((id) => typeof id === "number"),
  ]);
  let videoCount = 0;
  let shortCount = 0;

  for (let idx = 0; idx < manifest.items.length; idx++) {
    const item = manifest.items[idx];
    const itemResult = validateContentRecord(item, {
      ...options,
      seenIds,
      isNewBatch,
      mode,
    });

    if (item && typeof item === "object" && !Array.isArray(item)) {
      if (item.format === "short") {
        shortCount++;
      } else {
        videoCount++;
      }
    }

    for (const err of itemResult.errors) {
      errors.push(`Item [index ${idx}${item?.id !== undefined ? `, id ${item.id}` : ""}]: ${err}`);
    }
    for (const warn of itemResult.warnings) {
      warnings.push(`Item [index ${idx}${item?.id !== undefined ? `, id ${item.id}` : ""}]: ${warn}`);
    }
  }

  // Inspection tool reporting for publication mode
  let inspectionStatus = "OK";
  if (mode === "publish" && !isFFprobeAvailable()) {
    inspectionStatus = "INCOMPLETE (ffprobe unavailable in environment; physical stream properties cannot be certified)";
    warnings.push(
      "Notice: ffprobe is not installed in the local environment. While file headers and magic bytes were verified, physical video stream inspection (actual dimensions, CFR, audio channels) requires ffprobe before production release."
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    mode,
    assetVerification:
      mode === "metadata"
        ? "SKIPPED (Metadata preparation mode)"
        : "PERFORMED (Staged local assets verified)",
    streamInspection: inspectionStatus,
    summary: {
      total: manifest.items.length,
      videos: videoCount,
      shorts: shortCount,
    },
  };
}

/**
 * Validate the live TypeScript production catalog in src/data/edits.ts
 */
export async function validateLiveCatalog(root = projectRoot) {
  const editsModule = await import(resolve(root, "src/data/edits.ts"));
  const fandomsModule = await import(resolve(root, "src/data/fandoms.ts"));

  const edits = editsModule.edits;
  const fandomRegistry = fandomsModule.FANDOM_REGISTRY;

  const errors = [];
  const warnings = [];

  // Invariant 1: Exactly 17 demo edits
  if (!Array.isArray(edits) || edits.length !== 17) {
    errors.push(`Live catalog edit count violation: expected exactly 17 edits, got ${edits?.length}`);
  }

  const seenIds = new Set();
  let shortCount = 0;
  let videoCount = 0;

  for (let i = 0; i < (edits || []).length; i++) {
    const edit = edits[i];
    if (edit.format === "short") {
      shortCount++;
    } else {
      videoCount++;
    }

    const itemResult = validateContentRecord(edit, {
      seenIds,
      isNewBatch: false,
      isLiveCatalog: true,
      fandomRegistry,
      mode: "assets",
      publicDir: resolve(root, "public"),
    });

    for (const err of itemResult.errors) {
      errors.push(`Live Edit ID ${edit.id}: ${err}`);
    }
    for (const warn of itemResult.warnings) {
      warnings.push(`Live Edit ID ${edit.id}: ${warn}`);
    }
  }

  // Invariant 2: Production contains zero fabricated Shorts
  if (shortCount !== 0) {
    errors.push(
      `Production catalog contains ${shortCount} Shorts. Invariant requires exactly 0 Shorts until owner media is received.`
    );
  }

  // Invariant 3: IDs must be exactly 0 to 16
  for (let expectedId = 0; expectedId < 17; expectedId++) {
    if (!seenIds.has(expectedId)) {
      errors.push(`Missing expected demo edit ID: ${expectedId}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    summary: {
      total: edits.length,
      videos: videoCount,
      shorts: shortCount,
    },
  };
}

/**
 * Strip private editorial metadata for public client projection.
 * Enforces safe compilation boundary when strict: true.
 */
export function projectToPublicEdit(item, { strict = false } = {}) {
  if (!item || typeof item !== "object") {
    throw new Error("Cannot project non-object to public edit");
  }

  if (strict) {
    const reviewStatus = item.editorial?.reviewStatus;
    const rightsCleared = item.editorial?.rightsCleared;
    if (reviewStatus !== "approved" && reviewStatus !== "published") {
      throw new Error(
        `Cannot project item ${item.id} to public catalog: editorial reviewStatus must be 'approved' or 'published', got '${reviewStatus}'`
      );
    }
    if (rightsCleared !== true) {
      throw new Error(
        `Cannot project item ${item.id} to public catalog: editorial rightsCleared must be true`
      );
    }
  }

  const {
    id,
    format = "video",
    title,
    description,
    category,
    fandomIds,
    tags,
    poster,
    source,
    duration,
    trending = false,
  } = item;

  const publicRecord = {
    id,
    title,
    category,
    tags: Array.isArray(tags) ? [...tags] : [],
    description,
    creator: "Lolixco curated",
    poster,
    source,
    duration,
    trending: !!trending,
    format,
  };

  if (fandomIds && Array.isArray(fandomIds) && fandomIds.length > 0) {
    publicRecord.fandomIds = [...fandomIds];
  }

  return publicRecord;
}

// CLI Execution entry point
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  let manifestPath = null;
  let mode = "metadata";
  let checkLive = true;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--manifest" && args[i + 1]) {
      manifestPath = resolve(args[i + 1]);
      checkLive = false;
      i++;
    } else if (args[i] === "--mode" && args[i + 1]) {
      mode = args[i + 1];
      i++;
    } else if (args[i] === "--publish" || args[i] === "--publication-ready") {
      mode = "publish";
    } else if (args[i] === "--verify-assets" || args[i] === "--assets") {
      mode = "assets";
    } else if (args[i].endsWith(".json")) {
      manifestPath = resolve(args[i]);
      checkLive = false;
    }
  }

  async function main() {
    let allValid = true;

    if (manifestPath) {
      console.log(`Validating manifest (${mode} mode): ${relative(projectRoot, manifestPath)}...`);
      const rawText = readFileSync(manifestPath, "utf8");
      const manifestData = JSON.parse(rawText);

      const fandomsModule = await import(resolve(projectRoot, "src/data/fandoms.ts"));
      const editsModule = await import(resolve(projectRoot, "src/data/edits.ts"));
      const result = validateContentManifest(manifestData, {
        fandomRegistry: fandomsModule.FANDOM_REGISTRY,
        existingCatalog: editsModule.edits,
        mode,
        isNewBatch: true,
      });

      console.log(`- Mode: ${result.mode}`);
      console.log(`- Asset verification: ${result.assetVerification}`);
      console.log(`- Stream inspection: ${result.streamInspection}`);
      console.log(
        `- Total items: ${result.summary.total} (${result.summary.videos} videos, ${result.summary.shorts} shorts)`
      );

      if (result.warnings.length > 0) {
        console.warn(`\nWarnings (${result.warnings.length}):`);
        for (const w of result.warnings) console.warn(`  ! ${w}`);
      }

      if (!result.valid) {
        console.error(`\nValidation errors (${result.errors.length}):`);
        for (const err of result.errors) console.error(`  x ${err}`);
        allValid = false;
      } else {
        console.log(`OK: Manifest passed all validation checks for mode '${mode}'.`);
      }
    }

    if (checkLive) {
      console.log(`Validating live production catalog (src/data/edits.ts)...`);
      const liveResult = await validateLiveCatalog(projectRoot);
      console.log(
        `- Verified ${liveResult.summary.total} edits (${liveResult.summary.videos} videos, ${liveResult.summary.shorts} shorts)`
      );

      if (!liveResult.valid) {
        console.error(`\nLive catalog errors (${liveResult.errors.length}):`);
        for (const err of liveResult.errors) console.error(`  x ${err}`);
        allValid = false;
      } else {
        console.log(`OK: Live catalog verified (17 demo landscape edits, 0 shorts, 0 drift).`);
      }
    }

    if (!allValid) {
      process.exit(1);
    }
  }

  main().catch((err) => {
    console.error("Fatal error during validation:", err);
    process.exit(1);
  });
}
