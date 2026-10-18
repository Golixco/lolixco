import { statSync, readFileSync, existsSync } from "node:fs";
import { resolve, relative, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { register } from "node:module";

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

/**
 * Validate asset file headers and magic bytes.
 */
export function verifyAssetBytes(filePath) {
  if (!existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  const info = statSync(filePath);
  if (!info.isFile() || info.size === 0) {
    throw new Error(`Empty file or not a regular file (size: ${info.size})`);
  }

  const data = readFileSync(filePath);
  const ext = extname(filePath).toLowerCase();

  switch (ext) {
    case ".svg":
      if (!data.toString("utf8").includes("<svg")) {
        throw new Error("Invalid SVG: missing <svg element");
      }
      break;

    case ".png":
      if (data.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") {
        throw new Error("Invalid PNG header signature (expected 89504e470d0a1a0a)");
      }
      break;

    case ".jpg":
    case ".jpeg":
      if (data[0] !== 0xff || data[1] !== 0xd8 || data[2] !== 0xff) {
        throw new Error("Invalid JPEG header signature (expected ffd8ff)");
      }
      break;

    case ".webp":
      if (
        data.subarray(0, 4).toString("ascii") !== "RIFF" ||
        data.subarray(8, 12).toString("ascii") !== "WEBP"
      ) {
        throw new Error("Invalid WebP header signature (expected RIFF....WEBP)");
      }
      break;

    case ".webm":
      if (data.subarray(0, 4).toString("hex") !== "1a45dfa3") {
        throw new Error("Invalid WebM header signature (expected 1a45dfa3)");
      }
      break;

    case ".mp4":
    case ".m4v":
      // ISO Base Media File Format: bytes 4..8 must be 'ftyp'
      if (data.length < 12 || data.subarray(4, 8).toString("ascii") !== "ftyp") {
        throw new Error("Invalid MP4 header signature (expected 'ftyp' box at offset 4)");
      }
      break;

    default:
      // Other extensions allowed if non-empty
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
    checkFiles = false,
    publicDir = resolve(projectRoot, "public"),
  } = options;

  const errors = [];
  const warnings = [];

  // 1. Validate ID
  if (typeof record.id !== "number" || !Number.isInteger(record.id) || record.id < 0) {
    errors.push(`Invalid ID: ${JSON.stringify(record.id)} (must be non-negative integer)`);
  } else {
    if (seenIds.has(record.id)) {
      errors.push(`Duplicate ID: ${record.id} is already assigned in this catalog/manifest`);
    } else {
      seenIds.add(record.id);
    }

    if (isNewBatch && record.id >= 0 && record.id < 17) {
      errors.push(
        `Reserved ID conflict: ID ${record.id} is reserved for baseline demo edits. New curated content must use IDs >= 17 (recommended: 100-199 for landscape videos, 200-299 for portrait shorts).`
      );
    }
  }

  // 2. Validate Format
  const format = record.format ?? "video";
  if (format !== "video" && format !== "short") {
    errors.push(`Invalid format: ${record.format} (must be "video" or "short")`);
  }

  // 3. Validate Title
  if (typeof record.title !== "string" || !record.title.trim()) {
    errors.push("Missing or empty title");
  } else if (record.title.trim().length < 3 || record.title.trim().length > 100) {
    errors.push(
      `Title length out of bounds: "${record.title.trim()}" (${record.title.trim().length} chars, expected 3-100)`
    );
  }

  // 4. Validate Description
  if (typeof record.description !== "string" || !record.description.trim()) {
    errors.push("Missing or empty description");
  } else if (record.description.trim().length < 5 || record.description.trim().length > 1000) {
    errors.push(
      `Description length out of bounds (${record.description.trim().length} chars, expected 5-1000)`
    );
  }

  // 5. Validate Category
  if (typeof record.category !== "string" || !record.category.trim()) {
    errors.push("Missing or empty category");
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
          errors.push(`Invalid fandom ID: ${fandomId}`);
          continue;
        }
        const normalized = fandomId.trim().toLowerCase();
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

  // 7. Validate Tags
  if (!Array.isArray(record.tags) || record.tags.length === 0) {
    errors.push("Missing or empty tags array (at least 1 tag required)");
  } else {
    for (const tag of record.tags) {
      if (typeof tag !== "string" || !tag.trim()) {
        errors.push(`Invalid tag: ${tag}`);
      } else {
        const cleanTag = tag.trim().toLowerCase();
        if (cleanTag.startsWith("#")) {
          errors.push(`Tag "${tag}" must not include leading '#' symbol`);
        }
        if (!VALID_TAG_REGEX.test(cleanTag)) {
          errors.push(
            `Tag "${tag}" contains invalid characters (allowed: lowercase alphanumeric, hyphens, underscores)`
          );
        }
      }
    }
  }

  // 8. Validate Duration
  if (typeof record.duration !== "string" || !DURATION_REGEX.test(record.duration.trim())) {
    errors.push(`Invalid duration: "${record.duration}" (expected format M:SS or MM:SS, e.g. "0:24", "1:45")`);
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

  // 9. Validate Media Consistency (16:9 vs 9:16)
  if (record.media) {
    const { aspectRatio, width, height } = record.media;
    if (format === "video") {
      if (aspectRatio === "9:16") {
        errors.push(`Format "video" (landscape) cannot declare vertical aspect ratio "9:16"`);
      }
      if (width && height && height > width) {
        errors.push(`Format "video" (landscape) has portrait dimensions: ${width}x${height}`);
      }
    } else if (format === "short") {
      if (aspectRatio && aspectRatio !== "9:16") {
        errors.push(`Format "short" (vertical) must have aspect ratio "9:16", got "${aspectRatio}"`);
      }
      if (width && height && width > height) {
        errors.push(`Format "short" (vertical) has landscape dimensions: ${width}x${height}`);
      }
    }
  }

  // 10. Validate Asset References
  if (typeof record.poster !== "string" || !record.poster.trim()) {
    errors.push("Missing or empty poster asset reference");
  } else if (checkFiles && record.poster.startsWith("/")) {
    const localFile = resolve(publicDir, record.poster.slice(1));
    try {
      verifyAssetBytes(localFile);
    } catch (err) {
      errors.push(`Poster asset error (${record.poster}): ${err.message}`);
    }
  }

  if (typeof record.source !== "string" || !record.source.trim()) {
    errors.push("Missing or empty source video reference");
  } else if (checkFiles && record.source.startsWith("/")) {
    const localFile = resolve(publicDir, record.source.slice(1));
    try {
      verifyAssetBytes(localFile);
    } catch (err) {
      errors.push(`Source video error (${record.source}): ${err.message}`);
    }
  }

  // 11. Security & Privacy: Verify No Private Editorial Leakage
  const rootKeys = Object.keys(record);
  const prohibitedRootKeys = [
    "curatorNotes",
    "reviewStatus",
    "rightsCleared",
    "sourceAttribution",
    "ownerAssetRef",
    "internalNotes",
  ];
  for (const pKey of prohibitedRootKeys) {
    if (pKey in record) {
      errors.push(
        `Security / Privacy violation: Private editorial field "${pKey}" must be encapsulated in the "editorial" namespace and stripped from public projections.`
      );
    }
  }

  // 12. Editorial Status Warning
  if (record.editorial) {
    if (record.editorial.rightsCleared === false) {
      warnings.push(`Item ${record.id} rightsCleared is false; cannot be published to production.`);
    }
    if (record.editorial.reviewStatus && record.editorial.reviewStatus !== "approved" && record.editorial.reviewStatus !== "published") {
      warnings.push(
        `Item ${record.id} reviewStatus is "${record.editorial.reviewStatus}"; requires approval before production publishing.`
      );
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
  const errors = [];
  const warnings = [];

  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    return {
      valid: false,
      errors: ["Manifest root must be an object"],
      warnings: [],
      summary: { total: 0, videos: 0, shorts: 0 },
    };
  }

  if (typeof manifest.manifestVersion !== "string") {
    errors.push("Manifest missing 'manifestVersion' string");
  }
  if (typeof manifest.catalogVersion !== "string") {
    errors.push("Manifest missing 'catalogVersion' string");
  }
  if (!Array.isArray(manifest.items)) {
    errors.push("Manifest missing 'items' array");
    return {
      valid: false,
      errors,
      warnings,
      summary: { total: 0, videos: 0, shorts: 0 },
    };
  }

  const seenIds = new Set();
  let videoCount = 0;
  let shortCount = 0;

  for (let idx = 0; idx < manifest.items.length; idx++) {
    const item = manifest.items[idx];
    const itemResult = validateContentRecord(item, {
      ...options,
      seenIds,
      isNewBatch: options.isNewBatch ?? true,
    });

    if (item.format === "short") {
      shortCount++;
    } else {
      videoCount++;
    }

    for (const err of itemResult.errors) {
      errors.push(`Item [index ${idx}, id ${item.id}]: ${err}`);
    }
    for (const warn of itemResult.warnings) {
      warnings.push(`Item [index ${idx}, id ${item.id}]: ${warn}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
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
      fandomRegistry,
      checkFiles: true,
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
    errors.push(`Production catalog contains ${shortCount} Shorts. Invariant requires exactly 0 Shorts until owner media is received.`);
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
 */
export function projectToPublicEdit(item) {
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
    tags,
    description,
    creator: "Lolixco curated",
    poster,
    source,
    duration,
    trending,
    format,
  };

  if (fandomIds && fandomIds.length > 0) {
    publicRecord.fandomIds = fandomIds;
  }

  return publicRecord;
}

// CLI Execution entry point
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  let manifestPath = null;
  let checkLive = true;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--manifest" && args[i + 1]) {
      manifestPath = resolve(args[i + 1]);
      checkLive = false;
      i++;
    } else if (args[i].endsWith(".json")) {
      manifestPath = resolve(args[i]);
      checkLive = false;
    }
  }

  async function main() {
    let allValid = true;

    if (manifestPath) {
      console.log(`Validating manifest: ${relative(projectRoot, manifestPath)}...`);
      const rawText = readFileSync(manifestPath, "utf8");
      const manifestData = JSON.parse(rawText);

      const fandomsModule = await import(resolve(projectRoot, "src/data/fandoms.ts"));
      const result = validateContentManifest(manifestData, {
        fandomRegistry: fandomsModule.FANDOM_REGISTRY,
        checkFiles: false, // Manifest may reference staged future files
        isNewBatch: true,
      });

      console.log(`- Total items: ${result.summary.total} (${result.summary.videos} videos, ${result.summary.shorts} shorts)`);
      if (result.warnings.length > 0) {
        console.warn(`\nWarnings (${result.warnings.length}):`);
        for (const w of result.warnings) console.warn(`  ! ${w}`);
      }

      if (!result.valid) {
        console.error(`\nValidation errors (${result.errors.length}):`);
        for (const err of result.errors) console.error(`  x ${err}`);
        allValid = false;
      } else {
        console.log(`OK: Manifest passed all validation checks.`);
      }
    }

    if (checkLive) {
      console.log(`Validating live production catalog (src/data/edits.ts)...`);
      const liveResult = await validateLiveCatalog(projectRoot);
      console.log(`- Verified ${liveResult.summary.total} edits (${liveResult.summary.videos} videos, ${liveResult.summary.shorts} shorts)`);

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
