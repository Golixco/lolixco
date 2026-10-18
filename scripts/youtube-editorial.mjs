/**
 * YouTube Editorial and Classification Logic for Lolixco.
 *
 * Implements canonical category checks, fandom registry verification,
 * secondary metadata heuristic checks, conflict detection without silent overrides,
 * format classification (landscape vs portrait shorts), and lifecycle transitions.
 */

export const CANONICAL_CATEGORIES = [
  "Anime",
  "Movies",
  "Series",
  "Multifandom",
  "Gaming",
  "Phonk",
];

export const VALID_REVIEW_STATUSES = [
  "submitted",
  "metadata_collected",
  "needs_review",
  "embed_eligible",
  "approved",
  "published",
  "rejected",
  "unavailable",
  "duplicate",
  "embed_restricted",
  "needs_recheck",
];

/**
 * Heuristically detects likely category and fandom associations from title, tags, and description.
 */
export function analyzeMetadataKeywords(metadata = {}, registeredFandoms = []) {
  const text = [
    metadata.title || "",
    metadata.description || "",
    ...(metadata.tags || []),
    ...(metadata.hashtags || []),
  ].join(" ").toLowerCase();

  const suggestedCategories = [];
  const suggestedFandomIds = [];

  // 1. Category keyword mapping
  if (/phonk|drift|cowbell|bass\s*boost/i.test(text)) {
    suggestedCategories.push("Phonk");
  }
  if (/valorant|gameplay|clutch|gaming|fps|apex|csgo|overwatch|doom/i.test(text)) {
    suggestedCategories.push("Gaming");
  }
  if (/anime|amv|manga|jujutsu|gojo|sukuna|demon\s*slayer|tanjiro|naruto|one\s*piece/i.test(text)) {
    suggestedCategories.push("Anime");
  }
  if (/movie|film|cinema|spiderman|spider-man|marvel|batman|avengers/i.test(text)) {
    suggestedCategories.push("Movies");
  }
  if (/series|tv\s*show|arcane|stranger\s*things|episode|season/i.test(text)) {
    suggestedCategories.push("Series");
  }
  if (/crossover|multifandom|multi\s*fandom|multi-fandom|mashup/i.test(text)) {
    suggestedCategories.push("Multifandom");
  }

  // 2. Fandom slug detection against registered fandoms
  for (const fandom of registeredFandoms) {
    const slug = fandom.id.toLowerCase();
    const titleWords = fandom.title.toLowerCase().split(/\s+/);

    if (text.includes(slug) || titleWords.every((w) => text.includes(w))) {
      suggestedFandomIds.push(fandom.id);
    }
  }

  return {
    suggestedCategories,
    suggestedFandomIds,
  };
}

/**
 * Evaluates an imported item's category, fandom, and metadata.
 * Detects conflicts without overriding the owner's explicit selection.
 */
export function evaluateEditorialClassification(options) {
  const {
    ownerCategory,
    ownerFandom,
    ownerFandomIds = [],
    metadata = {},
    registeredFandoms = [],
    urlFormatHint = "video",
  } = options;

  const warnings = [];
  let conflictFlag = false;

  // 1. Verify owner category is canonical
  const effectiveCategory = ownerCategory?.trim() || "";
  if (!effectiveCategory) {
    warnings.push("Missing owner category. Must be one of: " + CANONICAL_CATEGORIES.join(", "));
  } else if (!CANONICAL_CATEGORIES.includes(effectiveCategory)) {
    warnings.push(`Non-canonical category '${effectiveCategory}'. Must be one of: ${CANONICAL_CATEGORIES.join(", ")}`);
  }

  // 2. Normalize and verify fandom IDs
  const combinedFandoms = new Set();
  if (ownerFandom && typeof ownerFandom === "string" && ownerFandom.trim()) {
    combinedFandoms.add(ownerFandom.trim());
  }
  if (Array.isArray(ownerFandomIds)) {
    for (const f of ownerFandomIds) {
      if (typeof f === "string" && f.trim()) {
        combinedFandoms.add(f.trim());
      }
    }
  }

  const registeredSlugs = new Set(registeredFandoms.map((f) => f.id));
  const validFandomIds = [];

  for (const fId of combinedFandoms) {
    if (registeredSlugs.has(fId)) {
      validFandomIds.push(fId);
    } else {
      warnings.push(`Unregistered fandom ID '${fId}'. Must be registered in FANDOM_REGISTRY or left empty.`);
    }
  }

  // 3. Keyword analysis & conflict detection
  const analysis = analyzeMetadataKeywords(metadata, registeredFandoms);

  if (effectiveCategory && analysis.suggestedCategories.length > 0) {
    if (!analysis.suggestedCategories.includes(effectiveCategory)) {
      conflictFlag = true;
      warnings.push(
        `Owner classified as '${effectiveCategory}', but metadata keywords suggest '${analysis.suggestedCategories.join(", ")}'. Preserving owner classification.`
      );
    }
  }

  // 4. Format determination
  // A YouTube /shorts/ URL is a hint, but duration <= 60s is necessary.
  let determinedFormat = "unknown";
  const durationSec = metadata.durationSec ?? 0;

  if (durationSec > 60) {
    determinedFormat = "video"; // Videos longer than 60s cannot be Shorts
  } else if (urlFormatHint === "short" && durationSec <= 60 && durationSec > 0) {
    determinedFormat = "short";
  } else if (urlFormatHint === "video") {
    determinedFormat = "video";
  }

  // 5. Initial Review Status determination
  let reviewStatus = "metadata_collected";
  if (!metadata.canonicalVideoId) {
    reviewStatus = "submitted";
  } else if (metadata.embeddable === false) {
    reviewStatus = "embed_restricted";
  } else if (metadata.privacyStatus && metadata.privacyStatus !== "public") {
    reviewStatus = "unavailable";
  } else if (warnings.some((w) => w.startsWith("Non-canonical") || w.startsWith("Missing owner"))) {
    reviewStatus = "needs_review";
  } else if (metadata.embeddable === true) {
    reviewStatus = "embed_eligible";
  }

  return {
    category: effectiveCategory,
    fandomIds: validFandomIds,
    format: determinedFormat,
    conflictFlag,
    suggestedCategories: analysis.suggestedCategories,
    suggestedFandomIds: analysis.suggestedFandomIds,
    warnings,
    reviewStatus,
  };
}

/**
 * Allocates stable Lolixco IDs for approved items based on format.
 * - Landscape videos: 100 to 199
 * - Portrait Shorts: 200 to 299
 * Preserves previously assigned IDs to ensure idempotency.
 */
export function allocateStableId(item, existingItems = []) {
  if (typeof item.assignedLolixcoId === "number" && item.assignedLolixcoId >= 100) {
    return item.assignedLolixcoId; // Already assigned
  }

  const format = item.format || "video";
  const usedIds = new Set(
    existingItems
      .map((i) => i.assignedLolixcoId)
      .filter((id) => typeof id === "number")
  );

  if (format === "short") {
    for (let id = 200; id <= 299; id++) {
      if (!usedIds.has(id)) return id;
    }
    throw new Error("Shorts ID range 200-299 exhausted");
  } else {
    for (let id = 100; id <= 199; id++) {
      if (!usedIds.has(id)) return id;
    }
    throw new Error("Curated landscape video ID range 100-199 exhausted");
  }
}
