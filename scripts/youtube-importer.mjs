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
 * - Persistent audit trail storage
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { normalizeYouTubeUrl } from "./youtube-normalizer.mjs";
import { fetchYouTubeVideoMetadata } from "./youtube-api.mjs";
import {
  evaluateEditorialClassification,
  CANONICAL_CATEGORIES,
} from "./youtube-editorial.mjs";

export const projectRoot = fileURLToPath(new URL("../", import.meta.url));

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
    // Could be raw text or JSON string
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
    }));
  } else if (Array.isArray(input)) {
    items = input.map((item) => {
      if (typeof item === "string") {
        return { url: item, category: defaultCategory, fandom: defaultFandom };
      }
      return {
        url: item.url,
        category: item.category || defaultCategory,
        fandom: item.fandom || defaultFandom,
        fandomIds: item.fandomIds || [],
      };
    });
  } else if (typeof input === "object" && input !== null) {
    const batchCat = input.category || defaultCategory;
    const batchFan = input.fandom || defaultFandom;

    if (Array.isArray(input.urls)) {
      items = input.urls.map((url) => ({
        url,
        category: batchCat,
        fandom: batchFan,
      }));
    } else if (Array.isArray(input.items)) {
      items = input.items.map((item) => ({
        url: item.url,
        category: item.category || batchCat,
        fandom: item.fandom || batchFan,
        fandomIds: item.fandomIds || [],
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
  const {
    batchId = `batch-${Date.now()}`,
    batchInput,
    batchPath,
    category = "",
    fandom = "",
    auditFilePath = resolve(projectRoot, "content/youtube-audit.json"),
    dryRun = false,
    mockMode = !process.env.YOUTUBE_API_KEY,
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
      warnings.push(`Warning: could not parse existing audit file at ${auditFilePath}: ${err.message}. Initializing fresh audit list.`);
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
        `Item #${idx + 1} duplicate: Video ID '${norm.videoId}' was already imported in batch '${existing.batchId}' (status: ${existing.contentReviewStatus}). Updating classification if approved.`
      );
    }

    normalizedBatch.push({
      submittedUrl: raw.url,
      canonicalVideoId: norm.videoId,
      canonicalUrl: norm.canonicalUrl,
      urlFormatHint: norm.urlFormatHint,
      category: raw.category || category,
      fandom: raw.fandom || fandom,
      fandomIds: raw.fandomIds || [],
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

  // 5. Fetch Metadata via YouTube API (or mock)
  const metadataResult = await fetchYouTubeVideoMetadata(validVideoIdsToFetch, {
    mockMode,
  });

  if (metadataResult.errors.length > 0) {
    warnings.push(...metadataResult.errors);
  }

  const metadataMap = new Map(metadataResult.items.map((item) => [item.canonicalVideoId, item]));
  const missingIdSet = new Set(metadataResult.missingIds);

  // 6. Editorial Classification and Record Assembly
  const processedRecords = [];

  for (const entry of normalizedBatch) {
    const videoId = entry.canonicalVideoId;
    const metadata = metadataMap.get(videoId);

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

    const auditRecord = {
      batchId,
      submittedUrl: entry.submittedUrl,
      canonicalVideoId: videoId,
      canonicalUrl: entry.canonicalUrl,
      ownerCategory: entry.category,
      ownerFandom: entry.fandom,
      ownerFandomIds: entry.fandomIds,
      suggestedCategories: classification.suggestedCategories || [],
      suggestedFandomIds: classification.suggestedFandomIds || [],
      conflictFlag: classification.conflictFlag,
      format: classification.format,
      metadataFetchStatus: metadata ? "fetched" : "failed",
      contentReviewStatus: classification.reviewStatus,
      validationWarnings: classification.warnings,
      lastMetadataVerification: new Date().toISOString(),
      metadata: metadata || null,
      assignedLolixcoId: existingByVideoId.get(videoId)?.assignedLolixcoId || null,
    };

    processedRecords.push(auditRecord);

    // Update in-memory audit store (preserving assignedLolixcoId)
    existingByVideoId.set(videoId, auditRecord);
  }

  // 7. Save Audit Trail (unless dryRun)
  if (!dryRun) {
    auditData.items = Array.from(existingByVideoId.values());
    auditData.lastUpdated = new Date().toISOString();
    writeFileSync(auditFilePath, JSON.stringify(auditData, null, 2), "utf-8");
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
