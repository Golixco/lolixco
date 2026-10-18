import type { Edit } from "./edits";
import type { FeedSection } from "../types/content";

export interface CompositionConfig {
  maxRecommendedVideos?: number;
  maxShortsPerShelf?: number;
  maxMoreVideos?: number;
  recommendedTitle?: string;
  shortsTitle?: string;
  moreTitle?: string;
}

const DEFAULT_CONFIG: Required<CompositionConfig> = {
  maxRecommendedVideos: 6,
  maxShortsPerShelf: 10,
  maxMoreVideos: 8,
  recommendedTitle: "Recommended Edits",
  shortsTitle: "Curated Shorts",
  moreTitle: "More to Discover",
};

/**
 * Determines whether an edit is formatted as a vertical short.
 * Missing format or format === "video" defaults to standard video for legacy compatibility.
 * An edit is NEVER classified as a Short merely because of short duration.
 */
export function isShort(edit: Edit | null | undefined): boolean {
  if (!edit) return false;
  return edit.format === "short";
}

/**
 * Determines whether an edit is a standard landscape video edit.
 */
export function isVideo(edit: Edit | null | undefined): boolean {
  if (!edit) return false;
  return !isShort(edit);
}

export interface ComposeHomeFeedOptions {
  recommendedVideos: Edit[];
  catalog: Edit[];
  currentEditId?: number | null;
  config?: CompositionConfig;
}

/**
 * Pure, deterministic feed composition algorithm.
 *
 * Separates recommendation ranking ("what should be recommended")
 * from feed composition ("how content is organized into visible sections").
 *
 * Rules:
 * 1. Preserves recommendation engine ranking for the primary Recommended Edits row.
 * 2. Deduplicates all video IDs across discovery rows (no card appears in both Recommended and More).
 * 3. Completely omits the Shorts shelf if the catalog has 0 Shorts.
 * 4. Never allows a Short to appear in long-form video rows, nor a video in a Shorts shelf.
 * 5. Works deterministically with 0, 1, 3, 17, 50, 70+ catalog items.
 */
export function composeHomeFeed({
  recommendedVideos,
  catalog,
  currentEditId,
  config = {},
}: ComposeHomeFeedOptions): FeedSection[] {
  const mergedConfig: Required<CompositionConfig> = {
    ...DEFAULT_CONFIG,
    ...config,
  };

  const sections: FeedSection[] = [];
  const usedVideoIds = new Set<number>();

  if (typeof currentEditId === "number") {
    usedVideoIds.add(currentEditId);
  }

  // 1. Separate catalog into regular videos and shorts pools
  const videoCatalog = catalog.filter((e) => isVideo(e));
  const shortsCatalog = catalog.filter((e) => isShort(e));

  // 2. Compose Recommended Edits (Long-form Row 1)
  // Priority: Recommendation API output
  const recommendedRowItems: Edit[] = [];
  for (const item of recommendedVideos) {
    if (recommendedRowItems.length >= mergedConfig.maxRecommendedVideos) break;
    if (isVideo(item) && !usedVideoIds.has(item.id)) {
      recommendedRowItems.push(item);
      usedVideoIds.add(item.id);
    }
  }

  // If recommendations pool was empty or smaller than budget, backfill from remaining video catalog
  if (recommendedRowItems.length < mergedConfig.maxRecommendedVideos) {
    for (const item of videoCatalog) {
      if (recommendedRowItems.length >= mergedConfig.maxRecommendedVideos) break;
      if (!usedVideoIds.has(item.id)) {
        recommendedRowItems.push(item);
        usedVideoIds.add(item.id);
      }
    }
  }

  if (recommendedRowItems.length > 0) {
    sections.push({
      type: "video_row",
      id: "recommended-edits",
      title: mergedConfig.recommendedTitle,
      items: recommendedRowItems,
    });
  }

  // 3. Compose Curated Shorts Shelf
  // Invariant: If there are 0 Shorts, the shelf is COMPLETELY OMITTED.
  if (shortsCatalog.length > 0) {
    const shortsShelfItems = shortsCatalog.slice(0, mergedConfig.maxShortsPerShelf);
    if (shortsShelfItems.length > 0) {
      sections.push({
        type: "shorts_shelf",
        id: "curated-shorts",
        title: mergedConfig.shortsTitle,
        items: shortsShelfItems,
      });
    }
  }

  // 4. Compose More to Discover (Long-form Row 2)
  // Backfill with remaining eligible videos without any duplicates from earlier rows
  const moreRowItems: Edit[] = [];
  for (const item of videoCatalog) {
    if (moreRowItems.length >= mergedConfig.maxMoreVideos) break;
    if (!usedVideoIds.has(item.id)) {
      moreRowItems.push(item);
      usedVideoIds.add(item.id);
    }
  }

  if (moreRowItems.length > 0) {
    sections.push({
      type: "video_row",
      id: "more-to-discover",
      title: mergedConfig.moreTitle,
      items: moreRowItems,
    });
  }

  return sections;
}

/**
 * Filter Shorts by category, fandom, and search text while preserving format safety.
 */
export function filterShorts(
  catalog: Edit[],
  options?: { category?: string; fandomId?: string; query?: string }
): Edit[] {
  let list = catalog.filter((e) => isShort(e));

  if (!options) return list;

  const { category, fandomId, query } = options;

  if (category && category !== "All") {
    list = list.filter((e) => e.category === category);
  }

  if (fandomId && fandomId !== "all") {
    list = list.filter((e) => e.fandomIds && e.fandomIds.includes(fandomId));
  }

  if (query && query.trim()) {
    const qLower = query.trim().toLowerCase();
    list = list.filter(
      (e) =>
        e.title.toLowerCase().includes(qLower) ||
        e.tags.some((t) => t.toLowerCase().includes(qLower)) ||
        e.description.toLowerCase().includes(qLower)
    );
  }

  return list;
}

/**
 * Separates mixed search or category results into landscape videos and portrait shorts
 * without altering each group's relative relevance ranking.
 */
export function splitMixedResults(items: Edit[]): { videos: Edit[]; shorts: Edit[] } {
  const videos: Edit[] = [];
  const shorts: Edit[] = [];

  for (const item of items) {
    if (isShort(item)) {
      shorts.push(item);
    } else {
      videos.push(item);
    }
  }

  return { videos, shorts };
}
