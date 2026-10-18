/**
 * Public Catalog Compiler for Curated YouTube Edits.
 *
 * Compiles approved YouTube items from the audit trail into src/data/edits.ts.
 * Guarantees:
 * - Preservation of 17 baseline demo edits (IDs 0-16) at the array head
 * - Strict ID ranges: Landscape videos in [100..199], Portrait Shorts in [200..299]
 * - Only items with contentReviewStatus === 'approved' or 'published' are compiled
 * - Zero leakage of private editorial, rights notes, or audit history
 * - Production safety guard against synthetic test data
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { allocateStableId } from "./youtube-editorial.mjs";

export const projectRoot = fileURLToPath(new URL("../", import.meta.url));

/**
 * Projects a validated audit record to a public Edit object.
 */
export function projectToPublicYouTubeEdit(auditItem) {
  const metadata = auditItem.metadata || {};

  return {
    id: auditItem.assignedLolixcoId,
    title: metadata.title || `Curated Edit ${auditItem.assignedLolixcoId}`,
    category: auditItem.ownerCategory,
    tags: Array.from(
      new Set([
        auditItem.ownerCategory.toLowerCase(),
        ...(auditItem.fandomIds || []),
        ...(metadata.tags || []),
        ...(metadata.hashtags || []),
      ])
    ).slice(0, 10), // Bounded tag count
    description: metadata.description?.slice(0, 300) || "Curated cinematic edit.",
    creator: metadata.channelTitle || "YouTube Creator",
    poster: metadata.thumbnailUrl || `https://i.ytimg.com/vi/${auditItem.canonicalVideoId}/hqdefault.jpg`,
    source: auditItem.canonicalUrl || `https://www.youtube.com/watch?v=${auditItem.canonicalVideoId}`,
    duration: metadata.durationFormatted || "0:30",
    trending: !!auditItem.trending,
    format: auditItem.format || "video",
    fandomIds: auditItem.fandomIds || [],
    sourceType: "youtube_embed",
    youtubeVideoId: auditItem.canonicalVideoId,
    channelTitle: metadata.channelTitle || undefined,
    channelId: metadata.channelId || undefined,
  };
}

/**
 * Generates TypeScript code content for src/data/edits.ts.
 */
export function generateYouTubeEditsTs(compiledEdits) {
  const hasDemoHead =
    compiledEdits.length >= 17 &&
    compiledEdits.slice(0, 17).every((e, idx) => e.id === idx && e.creator === "Lolixco demo");

  let code = `import { mediaAssets, assetUrl } from "./media-assets.js";

import type { ContentFormat, VideoSourceType } from "../types/content";
export { type VideoSourceType } from "../types/content";

export type Edit = {
  id: number;
  title: string;
  category: string;
  tags: string[];
  description: string;
  creator: string;
  poster: string;
  source: string;
  duration: string;
  trending: boolean;
  format?: ContentFormat;
  fandomIds?: string[];
  sourceType?: VideoSourceType;
  youtubeVideoId?: string;
  channelTitle?: string;
  channelId?: string;
  sourceUrl?: string;
};

export function isYouTubeEmbed(edit: Edit): boolean {
  return (
    edit.sourceType === "youtube_embed" &&
    typeof edit.youtubeVideoId === "string" &&
    edit.youtubeVideoId.length === 11
  );
}

export function isLocalDemo(edit: Edit): boolean {
  return !edit.sourceType || edit.sourceType === "local_demo";
}

export function getCanonicalSourceUrl(edit: Edit): string {
  if (edit.sourceType === "youtube_embed" && edit.youtubeVideoId) {
    return \`https://www.youtube.com/watch?v=\${edit.youtubeVideoId}\`;
  }
  return edit.source;
}

`;

  if (hasDemoHead) {
    code += `const titles = [
  "Into the Light",
  "Echoes of Tomorrow",
  "Fragments",
  "Red Horizon",
  "Silent World",
  "Neon Soul",
  "Broken Crowns",
  "Liminal",
  "Darkest Days",
  "Reflections",
  "Chasing Heaven",
  "Afterglow",
  "Cold Hearts",
  "Parallel",
  "Lost Signal",
  "Radiant",
  "Midnight City",
];
const categories = [
  "Cinematic",
  "Gaming",
  "Anime",
  "Movies",
  "Series",
  "Phonk",
];
const baseDemoEdits: Edit[] = titles.map((title, id) => ({
  id,
  title,
  category: categories[id % 6],
  tags: [
    categories[id % 6].toLowerCase(),
    "original",
    "demo",
    id % 2 ? "neon" : "landscape",
  ],
  description:
    "Original geometric artwork. Silent motion study for player testing; not finished creator footage.",
  creator: "Lolixco demo",
  poster: assetUrl(mediaAssets.posters[id], import.meta.env?.BASE_URL ?? "/"),
  source: assetUrl(mediaAssets.video, import.meta.env?.BASE_URL ?? "/"),
  duration: "0:12",
  trending: id > 10,
  sourceType: "local_demo",
}));

`;

    const newEdits = compiledEdits.slice(17);
    if (newEdits.length === 0) {
      code += `export const edits: Edit[] = baseDemoEdits;\n`;
    } else {
      code += `const curatedEdits: Edit[] = ${JSON.stringify(newEdits, null, 2)};\n\n`;
      code += `export const edits: Edit[] = [...baseDemoEdits, ...curatedEdits];\n`;
    }
  } else {
    code += `export const edits: Edit[] = ${JSON.stringify(compiledEdits, null, 2)};\n`;
  }

  code += `
export const categoriesList = [
  "Featured",
  "Trending",
  "Anime",
  "Movies",
  "Series",
  "Gaming",
  "Phonk",
  "Cinematic",
  "New",
];
`;

  return code;
}

/**
 * Compiles approved YouTube items into public catalog records.
 */
export async function compileYouTubeCatalog(options = {}) {
  const {
    auditFilePath = resolve(projectRoot, "content/youtube-audit.json"),
    outputPath = resolve(projectRoot, "src/data/edits.ts"),
    dryRun = true,
    allowDraft = false,
    baseCatalog = null,
    forceSynthetic = false,
  } = options;

  const errors = [];
  const warnings = [];

  // 1. Load base catalog
  let currentBaseCatalog = baseCatalog;
  if (!currentBaseCatalog) {
    const editsModule = await import(resolve(projectRoot, "src/data/edits.ts"));
    currentBaseCatalog = editsModule.edits;
  }

  // 2. Load audit trail
  if (!existsSync(auditFilePath)) {
    return {
      success: false,
      errors: [`Audit file not found: ${auditFilePath}`],
      warnings: [],
      compiledCount: 0,
      compiledEdits: currentBaseCatalog,
    };
  }

  let auditData;
  try {
    auditData = JSON.parse(readFileSync(auditFilePath, "utf-8"));
  } catch (err) {
    return {
      success: false,
      errors: [`Failed to parse audit file at ${auditFilePath}: ${err.message}`],
      warnings: [],
      compiledCount: 0,
      compiledEdits: currentBaseCatalog,
    };
  }

  const items = Array.isArray(auditData.items) ? auditData.items : [];
  const approvedItems = [];

  for (const item of items) {
    const status = item.contentReviewStatus;
    if (status === "approved" || status === "published") {
      approvedItems.push(item);
    } else if (allowDraft && (status === "metadata_collected" || status === "embed_eligible")) {
      approvedItems.push(item);
    }
  }

  // 3. Allocate stable IDs and project records
  const newEdits = [];
  const allocatedItems = [];

  for (const item of approvedItems) {
    if (!item.assignedLolixcoId) {
      item.assignedLolixcoId = allocateStableId(item, [
        ...currentBaseCatalog.map((e) => ({ assignedLolixcoId: e.id, format: e.format })),
        ...allocatedItems,
      ]);
    }
    allocatedItems.push(item);

    const projected = projectToPublicYouTubeEdit(item);

    // Range checks
    if (projected.format === "short") {
      if (projected.id < 200 || projected.id > 299) {
        errors.push(`Short ID must be in 200-299 range, got ${projected.id}`);
      }
    } else {
      if (projected.id < 100 || projected.id > 199) {
        errors.push(`Landscape video ID must be in 100-199 range, got ${projected.id}`);
      }
    }

    // Baseline collision check
    if (projected.id <= 16) {
      errors.push(`ID collision with baseline demo edit: ${projected.id}`);
    }

    newEdits.push(projected);
  }

  const finalEdits = [...currentBaseCatalog.slice(0, 17), ...newEdits];

  // 4. Protection Guard: Never write synthetic test items into production
  const isTargetingProduction = outputPath.includes("src/data/edits.ts");
  const hasSyntheticItems = newEdits.some(
    (e) =>
      e.title.includes("Synthetic") ||
      e.title.includes("[TEST]") ||
      e.tags.includes("__test__")
  );

  if (isTargetingProduction && hasSyntheticItems && !forceSynthetic) {
    return {
      success: false,
      errors: [
        "ABORT: Cannot write synthetic/test items into production src/data/edits.ts. Use dryRun: true or a non-production outputPath for testing.",
      ],
      warnings,
      compiledCount: 0,
      compiledEdits: currentBaseCatalog,
    };
  }

  if (errors.length > 0) {
    return {
      success: false,
      errors,
      warnings,
      compiledCount: 0,
      compiledEdits: currentBaseCatalog,
    };
  }

  // 5. Write to output if not dryRun
  let writtenTo = null;
  if (!dryRun) {
    const code = generateYouTubeEditsTs(finalEdits);
    writeFileSync(outputPath, code, "utf-8");
    writtenTo = outputPath;

    // Persist newly assigned IDs back to audit file if updated
    auditData.items = items;
    writeFileSync(auditFilePath, JSON.stringify(auditData, null, 2), "utf-8");
  }

  return {
    success: true,
    errors: [],
    warnings,
    baseCount: currentBaseCatalog.length,
    newCount: newEdits.length,
    totalCount: finalEdits.length,
    compiledEdits: finalEdits,
    dryRun,
    writtenTo,
  };
}
