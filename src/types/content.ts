/**
 * Content format and taxonomy type definitions for Lolixco.
 * 
 * Separates:
 * - Content format (video vs. short)
 * - Canonical production categories vs. legacy demo categories
 * - Public metadata vs. internal recommendation engine fields
 */

export type ContentFormat = "video" | "short";

/**
 * Distinguishes the underlying playback mechanism:
 * - local_demo: Sample geometric motion study served locally (baseline demos 0-16)
 * - youtube_embed: Curated external YouTube edit played via official IFrame API
 * - licensed_local_media: Future creator-hosted direct video files
 */
export type VideoSourceType =
  | "local_demo"
  | "youtube_embed"
  | "licensed_local_media";

/**
 * Production primary categories for the curated Lolixco catalog.
 */
export type CanonicalCategory =
  | "Anime"
  | "Movies"
  | "Series"
  | "Multifandom"
  | "Gaming"
  | "Phonk";

/**
 * Legacy demo category preserved for backward compatibility with initial sample assets.
 * Cinematic is NOT aliased to Movies or Multifandom.
 */
export type LegacyCategory = "Cinematic";

/**
 * All recognized content categories across canonical and legacy items.
 */
export type ContentCategory = CanonicalCategory | LegacyCategory;

/**
 * Category bar navigation choices: "All" represents global browsing mode,
 * alongside individual content categories.
 */
export type BrowsingCategory = "All" | ContentCategory;

/**
 * Public metadata presented to visitors.
 * Intentionally excludes creator names, private ratings, or platform view metrics.
 */
export interface PublicMediaMetadata {
  id: number;
  format: ContentFormat;
  title: string;
  description: string;
  category: ContentCategory;
  fandomIds?: string[];
  tags: string[];
  poster: string;
  source: string;
  duration: string;
  sourceType?: VideoSourceType;
  youtubeVideoId?: string;
  channelTitle?: string;
  channelId?: string;
  sourceUrl?: string;
}

/**
 * Optional private editorial metadata preserved for administration or curation.
 */
export interface EditorialMetadata {
  curatorNotes?: string;
  reviewStatus?: "draft" | "reviewed" | "published";
  originalAspectRatio?: "16:9" | "9:16" | "4:3" | "2.39:1";
  legacyCreatorId?: string;
}

/**
 * Format-aware feed section model.
 * Distinguishes landscape video rows from portrait shorts shelves.
 */
export type FeedSection<T = import("../data/edits").Edit> =
  | {
      type: "video_row";
      id: string;
      title: string;
      items: T[];
    }
  | {
      type: "shorts_shelf";
      id: string;
      title: string;
      items: T[];
    };

