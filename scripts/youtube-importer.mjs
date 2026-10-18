/**
 * YouTube Batch-of-10 URL Ingestion and Audit Tool for Lolixco.
 *
 * Enforces:
 * - At most 10 URLs per batch
 * - Normalization to canonical 11-char YouTube video ID
 * - Domain security and malformed ID rejection
 * - Duplicate detection within batch and across audit history (idempotency)
 * - Metadata retrieval with quota protection and offline mock support
 * - Editorial classification and conflict detection
 * - Preservation of approved review decisions across re-imports
 * - Preservation of owner category and fandom assignments
 * - Persistent audit trail storage at canonical path
 * - Executable CLI entrypoint with exit codes
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync, unlinkSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { register } from "node:module";

export const projectRoot = fileURLToPath(new URL("../", import.meta.url));

// Register TypeScript loader for on-the-fly TS transpilation
try {
  register("./tests/ts-hooks.mjs", new URL("../", import.meta.url));
} catch {
  // If already registered or unavailable, proceed
}

/**
 * Safely writes a file using a sibling temporary file and atomic rename.
 */
export function safeAtomicWriteFileSync(filePath, content) {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  const tempPath = `${filePath}.tmp.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`;
  try {
    writeFileSync(tempPath, content, "utf-8");
    renameSync(tempPath, filePath);
  } catch (err) {
    if (existsSync(tempPath)) {
      try {
        unlinkSync(tempPath);
      } catch {
        // Ignore unlink error
      }
    }
    throw err;
  }
}

import { normalizeYouTubeUrl } from "./youtube-normalizer.mjs";
import { fetchYouTubeVideoMetadata, loadEnvConfig } from "./youtube-api.mjs";
import {
  evaluateEditorialClassification,
  CANONICAL_CATEGORIES,
} from "./youtube-editorial.mjs";

export const CANONICAL_AUDIT_PATH = resolve(projectRoot, "content/audit/youtube-intake-audit.json");

/**
 * Loads registered fandoms from src/data/fandoms.ts dynamically.
 */
export async function loadFandomRegistry() {
  try {
    const fandomsModule = await import(resolve(projectRoot, "src/data/fandoms.ts"));
    return fandomsModule.FANDOM_REGISTRY || [];
  } catch {
    return [
      { id: "jujutsu-kaisen", title: "Jujutsu Kaisen" },
      { id: "demon-slayer", title: "Demon Slayer" },
      { id: "spider-man", title: "Spider-Man" },
      { id: "valorant", title: "Valorant" },
      { id: "doom", title: "Doom" },
    ];
  }
}

/**
 * Parses batch input from string, array, or object.
 * Returns array of normalized entries: { url, category, fandom, fandomIds }.
 */
export function parseBatchInput(input, defaultCategory = "", defaultFandom = "") {
  let items = [];

  if (typeof input === "string") {
    const trimmed = input.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        const parsed = JSON.parse(trimmed);
        return parseBatchInput(parsed, defaultCategory, defaultFandom);
      } catch {
        // Fall back to line-by-line parsing
      }
    }

    // Line-by-line text parsing
    const lines = trimmed.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
    items = lines.map((url) => ({
      url,
      category: defaultCategory,
      fandom: defaultFandom,
      fandomIds: defaultFandom ? [defaultFandom] : [],
    }));
  } else if (Array.isArray(input)) {
    items = input.map((item) => {
      if (typeof item === "string") {
        return {
          url: item,
          category: defaultCategory,
          fandom: defaultFandom,
          fandomIds: defaultFandom ? [defaultFandom] : [],
        };
      }
      return {
        url: item.url,
        category: item.category || defaultCategory,
        fandom: item.fandom || defaultFandom,
        fandomIds: Array.isArray(item.fandomIds)
          ? item.fandomIds
          : (item.fandom ? [item.fandom] : (defaultFandom ? [defaultFandom] : [])),
      };
    });
  } else if (typeof input === "object" && input !== null) {
    const batchCat = input.category || defaultCategory;
    const batchFan = input.fandom || defaultFandom;
    const batchFandomIds = Array.isArray(input.fandomIds)
      ? input.fandomIds
      : (batchFan ? [batchFan] : []);

    if (Array.isArray(input.urls)) {
      items = input.urls.map((url) => ({
        url,
        category: batchCat,
        fandom: batchFan,
        fandomIds: batchFandomIds,
      }));
    } else if (Array.isArray(input.items)) {
      items = input.items.map((item) => ({
        url: item.url,
        category: item.category || batchCat,
        fandom: item.fandom || batchFan,
        fandomIds: Array.isArray(item.fandomIds)
          ? item.fandomIds
          : (item.fandom ? [item.fandom] : batchFandomIds),
      }));
    }
  }

  return items;
}

/**
 * Ingests a batch of up to 10 YouTube URLs.
 *
 * @param {object} options
 * @returns {Promise<object>} Ingestion report
 */
export async function ingestYouTubeBatch(options = {}) {
  loadEnvConfig();

  const {
    batchId = `batch-${Date.now()}`,
    batchInput,
    batchPath,
    category = "",
    fandom = "",
    auditFilePath = CANONICAL_AUDIT_PATH,
    dryRun = false,
    mockMode = false,
  } = options;

  const errors = [];
  const warnings = [];

  // 1. Load batch items
  let rawItems = [];
  if (batchInput) {
    rawItems = parseBatchInput(batchInput, category, fandom);
  } else if (batchPath) {
    const resolvedPath = resolve(batchPath);
    if (!existsSync(resolvedPath)) {
      return {
        success: false,
        errors: [`Batch file not found: ${resolvedPath}`],
        warnings: [],
        processed: [],
      };
    }
    const content = readFileSync(resolvedPath, "utf-8");
    rawItems = parseBatchInput(content, category, fandom);
  }

  // 2. Strict Limit: At most 10 URLs per batch
  if (rawItems.length === 0) {
    return {
      success: false,
      errors: ["Batch is empty. Please provide between 1 and 10 URLs."],
      warnings: [],
      processed: [],
    };
  }

  if (rawItems.length > 10) {
    return {
      success: false,
      errors: [
        `Batch exceeds maximum allowed size of 10 items (got ${rawItems.length} items). Please submit in batches of 10 or fewer.`,
      ],
      warnings: [],
      processed: [],
    };
  }

  // 3. Load existing audit history
  let auditData = { version: "1.0.0", items: [] };
  if (existsSync(auditFilePath)) {
    try {
      auditData = JSON.parse(readFileSync(auditFilePath, "utf-8"));
      if (!Array.isArray(auditData.items)) auditData.items = [];
    } catch (err) {
      return {
        success: false,
        errors: [`Failed to parse existing audit file at ${auditFilePath}: ${err.message}. Preserving original file without modification.`],
        warnings,
        processed: [],
      };
    }
  }

  const existingByVideoId = new Map(auditData.items.map((i) => [i.canonicalVideoId, i]));
  const registeredFandoms = await loadFandomRegistry();

  // 4. Normalize URLs and detect duplicate URLs within the batch
  const normalizedBatch = [];
  const seenBatchVideoIds = new Set();
  const validVideoIdsToFetch = [];

  for (let idx = 0; idx < rawItems.length; idx++) {
    const raw = rawItems[idx];
    const norm = normalizeYouTubeUrl(raw.url);

    if (!norm.valid) {
      errors.push(`Item #${idx + 1} rejected: ${norm.error} (Input: '${raw.url}')`);
      continue;
    }

    if (seenBatchVideoIds.has(norm.videoId)) {
      errors.push(`Item #${idx + 1} duplicate: Video ID '${norm.videoId}' was submitted multiple times in this batch.`);
      continue;
    }
    seenBatchVideoIds.add(norm.videoId);

    // Cross-batch duplicate check
    if (existingByVideoId.has(norm.videoId)) {
      const existing = existingByVideoId.get(norm.videoId);
      warnings.push(
        `Item #${idx + 1} duplicate: Video ID '${norm.videoId}' was already imported in batch '${existing.batchId}' (status: ${existing.contentReviewStatus}). Updating metadata & preserving review decision.`
      );
    }

    normalizedBatch.push({
      submittedUrl: raw.url,
      canonicalVideoId: norm.videoId,
      canonicalUrl: norm.canonicalUrl,
      urlFormatHint: norm.urlFormatHint,
      category: raw.category || category,
      fandom: raw.fandom || fandom,
      fandomIds: raw.fandomIds || (raw.fandom ? [raw.fandom] : (fandom ? [fandom] : [])),
    });

    validVideoIdsToFetch.push(norm.videoId);
  }

  if (errors.length > 0 && normalizedBatch.length === 0) {
    return {
      success: false,
      errors,
      warnings,
      processed: [],
    };
  }

  // 5. Fetch Metadata via YouTube API (or injected mock client / fetchMetadata)
  let metadataResult;
  if (typeof options.fetchMetadata === "function") {
    metadataResult = await options.fetchMetadata(validVideoIdsToFetch);
  } else if (options.apiClient?.fetchMetadata) {
    const fetchedItems = [];
    const missing = [];
    const fetchErrors = [];
    for (const vid of validVideoIdsToFetch) {
      const res = await options.apiClient.fetchMetadata(vid);
      if (res && res.success && res.metadata) {
        fetchedItems.push(res.metadata);
      } else {
        missing.push(vid);
        if (res?.errors) fetchErrors.push(...res.errors);
      }
    }
    metadataResult = { items: fetchedItems, missingIds: missing, errors: fetchErrors };
  } else {
    metadataResult = await fetchYouTubeVideoMetadata(validVideoIdsToFetch, {
      mockMode,
    });
  }

  if (metadataResult.errors.length > 0) {
    if (metadataResult.items.length === 0) {
      // Entire batch failed (e.g. missing API key, network failure, quota exceeded)
      return {
        success: false,
        errors: metadataResult.errors,
        warnings,
        processed: [],
      };
    }
    warnings.push(...metadataResult.errors);
  }

  const metadataMap = new Map(metadataResult.items.map((item) => [item.canonicalVideoId, item]));
  const missingIdSet = new Set(metadataResult.missingIds);

  // 6. Editorial Classification and Record Assembly
  const processedRecords = [];

  for (const entry of normalizedBatch) {
    const videoId = entry.canonicalVideoId;
    const metadata = metadataMap.get(videoId);
    const existing = existingByVideoId.get(videoId);

    let classification;
    if (metadata) {
      classification = evaluateEditorialClassification({
        ownerCategory: entry.category,
        ownerFandom: entry.fandom,
        ownerFandomIds: entry.fandomIds,
        metadata,
        registeredFandoms,
        urlFormatHint: entry.urlFormatHint,
      });
    } else {
      classification = {
        category: entry.category,
        fandomIds: [],
        format: entry.urlFormatHint || "unknown",
        conflictFlag: false,
        warnings: missingIdSet.has(videoId)
          ? [`Video ID '${videoId}' not found or private on YouTube`]
          : ["Metadata could not be retrieved"],
        reviewStatus: "unavailable",
      };
    }

    // Preserve editorial review decision across re-imports (FIX C)
    let finalReviewStatus = classification.reviewStatus;
    const auditHistory = Array.isArray(existing?.auditHistory) ? [...existing.auditHistory] : [];

    if (existing) {
      if (existing.contentReviewStatus === "approved") {
        if (!metadata || missingIdSet.has(videoId)) {
          finalReviewStatus = "unavailable";
          classification.warnings.push("Previously approved item is now unavailable or removed on YouTube.");
          auditHistory.push({
            date: new Date().toISOString(),
            event: "status_transition",
            from: "approved",
            to: "unavailable",
            reason: "video_unavailable_or_removed",
          });
        } else if (metadata.embeddable === false) {
          finalReviewStatus = "embed_restricted";
          classification.warnings.push("Previously approved item embedding has been restricted.");
          auditHistory.push({
            date: new Date().toISOString(),
            event: "status_transition",
            from: "approved",
            to: "embed_restricted",
            reason: "embedding_disabled",
          });
        } else if (metadata.privacyStatus && metadata.privacyStatus !== "public") {
          finalReviewStatus = "unavailable";
          classification.warnings.push(`Previously approved item privacyStatus changed to '${metadata.privacyStatus}'.`);
          auditHistory.push({
            date: new Date().toISOString(),
            event: "status_transition",
            from: "approved",
            to: "unavailable",
            reason: `privacy_status_${metadata.privacyStatus}`,
          });
        } else {
          const prevCat = existing.category || existing.ownerCategory || "";
          const newCat = classification.category || entry.category || "";
          const prevFandoms = (existing.fandomIds || existing.ownerFandomIds || []).slice().sort().join(",");
          const newFandoms = (classification.fandomIds || entry.fandomIds || []).slice().sort().join(",");
          const prevFormat = existing.format || "video";
          const newFormat = classification.format || "video";

          const isClassificationChanged =
            (Boolean(prevCat) && Boolean(newCat) && prevCat !== newCat) ||
            prevFandoms !== newFandoms ||
            prevFormat !== newFormat;

          if (isClassificationChanged) {
            finalReviewStatus = "needs_recheck";
            classification.warnings.push(
              `Editorial classification changed on re-import (category: '${prevCat}' -> '${newCat}', fandoms: '${prevFandoms}' -> '${newFandoms}', format: '${prevFormat}' -> '${newFormat}'). Transitioned to 'needs_recheck'. Requires explicit owner review.`
            );
            auditHistory.push({
              date: new Date().toISOString(),
              event: "status_transition",
              from: "approved",
              to: "needs_recheck",
              reason: "editorial_classification_change",
              previousClassification: {
                category: prevCat,
                fandomIds: existing.fandomIds || existing.ownerFandomIds || [],
                format: prevFormat,
              },
              newClassification: {
                category: newCat,
                fandomIds: classification.fandomIds || entry.fandomIds || [],
                format: newFormat,
              },
            });
          } else if (
            existing.metadata &&
            (existing.metadata.title !== metadata.title ||
              Math.abs((existing.metadata.durationSec || 0) - (metadata.durationSec || 0)) > 5)
          ) {
            finalReviewStatus = "needs_recheck";
            classification.warnings.push("Material changes detected in video metadata since approval. Transitioned to needs_recheck.");
            auditHistory.push({
              date: new Date().toISOString(),
              event: "status_transition",
              from: "approved",
              to: "needs_recheck",
              reason: "material_metadata_change",
            });
          } else {
            // Metadata and classifications are valid and unchanged: preserve approved status!
            finalReviewStatus = "approved";
            auditHistory.push({
              date: new Date().toISOString(),
              event: "reimport_verification",
              status: "approved",
              note: "Metadata and classifications verified unchanged",
            });
          }
        }
      } else if (existing.contentReviewStatus === "rejected") {
        // Never automatically re-approve a rejected item
        finalReviewStatus = "rejected";
      }
    }

    let finalAssignedId = existing?.assignedLolixcoId || null;
    if (existing?.assignedLolixcoId && existing.format && classification.format && existing.format !== classification.format) {
      finalAssignedId = null;
      classification.warnings.push(
        `Format changed from '${existing.format}' to '${classification.format}'. Previously assigned ID ${existing.assignedLolixcoId} requires deliberate migration and review.`
      );
    }

    const auditRecord = {
      batchId,
      submittedUrl: entry.submittedUrl,
      canonicalVideoId: videoId,
      canonicalUrl: entry.canonicalUrl,
      ownerCategory: entry.category,
      ownerFandom: entry.fandom,
      ownerFandomIds: entry.fandomIds,
      category: classification.category || entry.category,
      fandomIds: classification.fandomIds,
      suggestedCategories: classification.suggestedCategories || [],
      suggestedFandomIds: classification.suggestedFandomIds || [],
      conflictFlag: classification.conflictFlag,
      format: classification.format,
      metadataFetchStatus: metadata ? "fetched" : "failed",
      contentReviewStatus: finalReviewStatus,
      validationWarnings: classification.warnings,
      lastMetadataVerification: new Date().toISOString(),
      metadata: metadata || null,
      isMock: metadata?.isMock === true,
      provenance: metadata?.provenance || "unfetched",
      assignedLolixcoId: finalAssignedId,
      auditHistory,
    };

    processedRecords.push(auditRecord);

    // Update in-memory audit store (preserving assignedLolixcoId)
    existingByVideoId.set(videoId, auditRecord);
  }

  // 7. Save Audit Trail (unless dryRun)
  if (!dryRun) {
    auditData.items = Array.from(existingByVideoId.values());
    auditData.lastUpdated = new Date().toISOString();
    safeAtomicWriteFileSync(auditFilePath, JSON.stringify(auditData, null, 2));
  }

  return {
    success: errors.length === 0,
    errors,
    warnings,
    processedCount: processedRecords.length,
    processed: processedRecords,
    dryRun,
    auditFilePath,
  };
}

/**
 * CLI Runner with explicit argument parsing, error handling, and exit codes.
 */
export async function runImporterCli(args = process.argv.slice(2)) {
  loadEnvConfig();

  const options = {
    batchId: `batch-${Date.now()}`,
    category: "",
    fandom: "",
    batchPath: "",
    urls: [],
    dryRun: false,
    mockMode: false,
    auditFilePath: CANONICAL_AUDIT_PATH,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--help" || arg === "-h") {
      console.log(`
Lolixco YouTube Importer CLI

Usage:
  node scripts/youtube-importer.mjs [options]

Options:
  --batch <id>          Batch identifier (e.g. 01, batch-01)
  --category <name>     Category (Anime, Gaming, Movies, Series, Phonk, Multifandom)
  --fandom <slug>       Fandom slug (e.g. valorant, jujutsu-kaisen)
  --input <file>        Input file (.txt with 1 URL per line or .json)
  --urls <u1,u2>        Comma-separated list of YouTube URLs
  --dry-run             Simulate import without writing to audit file
  --mock                Enable offline mock mode for testing
  --audit-file <path>   Audit file path (default: content/audit/youtube-intake-audit.json)
  -h, --help            Show this help message
`);
      return 0;
    } else if (arg === "--batch" && args[i + 1]) {
      options.batchId = args[++i];
    } else if (arg === "--category" && args[i + 1]) {
      options.category = args[++i];
    } else if (arg === "--fandom" && args[i + 1]) {
      options.fandom = args[++i];
    } else if (arg === "--input" && args[i + 1]) {
      options.batchPath = args[++i];
    } else if (arg === "--urls" && args[i + 1]) {
      options.urls = args[++i].split(",").map((u) => u.trim()).filter(Boolean);
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--mock") {
      options.mockMode = true;
    } else if (arg === "--audit-file" && args[i + 1]) {
      options.auditFilePath = resolve(args[++i]);
    }
  }

  if (!options.batchPath && options.urls.length === 0) {
    console.error("Error: Must specify --input <file> or --urls <url1,url2,...>");
    return 1;
  }

  const batchInput = options.urls.length > 0 ? options.urls : undefined;

  console.log(`Starting YouTube batch import [${options.batchId}]...`);
  if (options.dryRun) console.log("Mode: DRY-RUN (no files will be written)");
  if (options.mockMode) console.log("Mode: MOCK (synthetic offline test mode)");

  const result = await ingestYouTubeBatch({
    batchId: options.batchId,
    category: options.category,
    fandom: options.fandom,
    batchPath: options.batchPath || undefined,
    batchInput,
    dryRun: options.dryRun,
    mockMode: options.mockMode,
    auditFilePath: options.auditFilePath,
  });

  if (!result.success) {
    console.error("\n❌ Import failed with errors:");
    for (const err of result.errors) {
      console.error(`  - ${err}`);
    }
    if (result.warnings.length > 0) {
      console.warn("\nWarnings:");
      for (const w of result.warnings) {
        console.warn(`  - ${w}`);
      }
    }
    return 1;
  }

  console.log(`\n✔ Ingestion successful!`);
  console.log(`  Processed: ${result.processedCount} items`);
  console.log(`  Audit file: ${result.auditFilePath}`);
  if (result.warnings.length > 0) {
    console.log(`  Warnings (${result.warnings.length}):`);
    for (const w of result.warnings) {
      console.log(`    - ${w}`);
    }
  }
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runImporterCli().then((code) => {
    process.exit(code);
  });
}
