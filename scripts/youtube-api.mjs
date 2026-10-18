/**
 * YouTube Data API v3 Client and Mock Service for Lolixco.
 *
 * Implements batched video metadata retrieval (up to 50 items per call),
 * thumbnail resolution selection, ISO 8601 duration conversion, hashtag extraction,
 * embeddability verification, quota protection, and offline mock support.
 */

/**
 * Parses ISO 8601 duration (e.g., "PT30S", "PT1M15S", "PT1H2M3S") into seconds and formatted string.
 */
export function parseIsoDuration(isoDuration) {
  if (typeof isoDuration !== "string" || !isoDuration.startsWith("P")) {
    return { seconds: 0, formatted: "0:00" };
  }

  const regex = /P(?:([0-9]+)D)?T?(?:([0-9]+)H)?(?:([0-9]+)M)?(?:([0-9]+)S)?/;
  const match = isoDuration.match(regex);
  if (!match) {
    return { seconds: 0, formatted: "0:00" };
  }

  const days = parseInt(match[1] || "0", 10);
  const hours = parseInt(match[2] || "0", 10);
  const minutes = parseInt(match[3] || "0", 10);
  const seconds = parseInt(match[4] || "0", 10);

  const totalSeconds = days * 86400 + hours * 3600 + minutes * 60 + seconds;

  let formatted;
  if (hours > 0) {
    const minsStr = minutes.toString().padStart(2, "0");
    const secsStr = seconds.toString().padStart(2, "0");
    formatted = `${hours}:${minsStr}:${secsStr}`;
  } else {
    const secsStr = seconds.toString().padStart(2, "0");
    formatted = `${minutes}:${secsStr}`;
  }

  return { seconds: totalSeconds, formatted };
}

/**
 * Extracts hashtags from description text.
 */
export function extractHashtags(text) {
  if (typeof text !== "string") return [];
  const hashtagRegex = /#([a-zA-Z0-9_-]+)/g;
  const tags = [];
  let match;
  while ((match = hashtagRegex.exec(text)) !== null) {
    const tag = match[1].toLowerCase().trim();
    if (tag && !tags.includes(tag)) {
      tags.push(tag);
    }
  }
  return tags;
}

/**
 * Selects highest quality official thumbnail URL from snippet.thumbnails object.
 */
export function selectBestThumbnail(thumbnails = {}, fallbackVideoId = "") {
  if (thumbnails.maxres?.url) return thumbnails.maxres.url;
  if (thumbnails.standard?.url) return thumbnails.standard.url;
  if (thumbnails.high?.url) return thumbnails.high.url;
  if (thumbnails.medium?.url) return thumbnails.medium.url;
  if (thumbnails.default?.url) return thumbnails.default.url;

  if (fallbackVideoId) {
    return `https://i.ytimg.com/vi/${fallbackVideoId}/hqdefault.jpg`;
  }
  return "";
}

/**
 * Mask API key in error messages.
 */
export function maskApiKey(str, apiKey) {
  if (!str || !apiKey) return str;
  return str.replaceAll(apiKey, "YOUTUBE_API_KEY_HIDDEN");
}

/**
 * In-memory mock response registry for automated tests.
 */
export const MOCK_YOUTUBE_DATABASE = new Map();

/**
 * Helper to register a mock video record for testing.
 */
export function registerMockVideo(videoId, data) {
  MOCK_YOUTUBE_DATABASE.set(videoId, data);
}

/**
 * Clear mock registry.
 */
export function clearMockVideos() {
  MOCK_YOUTUBE_DATABASE.clear();
}

/**
 * Fetches metadata for a batch of up to 50 YouTube video IDs.
 *
 * @param {string[]} videoIds Array of 11-char YouTube video IDs
 * @param {object} options Configuration options
 * @returns {Promise<{ items: object[]; missingIds: string[]; errors: string[] }>}
 */
export async function fetchYouTubeVideoMetadata(videoIds, options = {}) {
  const {
    apiKey = process.env.YOUTUBE_API_KEY,
    mockMode = !apiKey,
    timeoutMs = 10000,
    maxRetries = 2,
  } = options;

  if (!Array.isArray(videoIds) || videoIds.length === 0) {
    return { items: [], missingIds: [], errors: [] };
  }

  // Deduplicate video IDs
  const uniqueIds = Array.from(new Set(videoIds.filter((id) => typeof id === "string" && id.length === 11)));
  if (uniqueIds.length === 0) {
    return { items: [], missingIds: videoIds, errors: ["No valid 11-char video IDs provided"] };
  }

  // Limit to 50 items per request
  const batch = uniqueIds.slice(0, 50);

  // MOCK MODE (For automated tests and CI environments)
  if (mockMode) {
    const items = [];
    const missingIds = [];

    for (const id of batch) {
      if (MOCK_YOUTUBE_DATABASE.has(id)) {
        const mock = MOCK_YOUTUBE_DATABASE.get(id);
        if (mock === null) {
          // Explicitly simulated 404/deleted
          missingIds.push(id);
        } else {
          items.push(mock);
        }
      } else {
        // Default deterministic synthetic response for testing
        const durSeconds = 25;
        items.push({
          canonicalVideoId: id,
          title: `Curated Edit ${id}`,
          description: `High-fidelity edit for #action #anime testing.`,
          channelId: "UC_mock_channel_id",
          channelTitle: "Lolixco Creator",
          publishedAt: "2026-01-15T12:00:00Z",
          tags: ["anime", "action", "edit"],
          hashtags: ["action", "anime"],
          durationIso: "PT25S",
          durationSec: durSeconds,
          durationFormatted: "0:25",
          thumbnailUrl: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
          embeddable: true,
          privacyStatus: "public",
          regionRestriction: null,
        });
      }
    }

    return { items, missingIds, errors: [] };
  }

  // REAL API CALL (When YOUTUBE_API_KEY is available)
  const endpoint = new URL("https://www.googleapis.com/youtube/v3/videos");
  endpoint.searchParams.set("part", "snippet,contentDetails,status");
  endpoint.searchParams.set("id", batch.join(","));
  endpoint.searchParams.set("key", apiKey);

  let attempt = 0;
  let lastError = null;

  while (attempt <= maxRetries) {
    attempt++;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(endpoint.toString(), {
        signal: controller.signal,
        headers: { Accept: "application/json" },
      });
      clearTimeout(timeout);

      if (!response.ok) {
        let errBody = "";
        try {
          errBody = await response.text();
        } catch {
          // Ignore
        }
        const masked = maskApiKey(errBody, apiKey);

        if (response.status === 403 && masked.includes("quotaExceeded")) {
          return {
            items: [],
            missingIds: batch,
            errors: ["YouTube Data API quota exceeded (quotaExceeded). Please wait or use cached metadata."],
          };
        }

        if (response.status >= 500 && attempt <= maxRetries) {
          // Transient server error: retry
          await new Promise((r) => setTimeout(r, 500 * attempt));
          continue;
        }

        return {
          items: [],
          missingIds: batch,
          errors: [`YouTube Data API error HTTP ${response.status}: ${masked}`],
        };
      }

      const json = await response.json();
      const rawItems = Array.isArray(json.items) ? json.items : [];
      const foundIds = new Set();
      const mappedItems = [];

      for (const item of rawItems) {
        const id = item.id;
        foundIds.add(id);

        const snippet = item.snippet || {};
        const contentDetails = item.contentDetails || {};
        const status = item.status || {};

        const durationInfo = parseIsoDuration(contentDetails.duration || "PT0S");
        const description = snippet.description || "";
        const tags = Array.isArray(snippet.tags) ? snippet.tags.map((t) => t.toLowerCase()) : [];
        const hashtags = extractHashtags(description);

        mappedItems.push({
          canonicalVideoId: id,
          title: snippet.title || `YouTube Video ${id}`,
          description,
          channelId: snippet.channelId || "",
          channelTitle: snippet.channelTitle || "Unknown Creator",
          publishedAt: snippet.publishedAt || "",
          tags,
          hashtags,
          durationIso: contentDetails.duration || "",
          durationSec: durationInfo.seconds,
          durationFormatted: durationInfo.formatted,
          thumbnailUrl: selectBestThumbnail(snippet.thumbnails, id),
          embeddable: status.embeddable === true,
          privacyStatus: status.privacyStatus || "unknown",
          regionRestriction: contentDetails.regionRestriction || null,
        });
      }

      const missingIds = batch.filter((id) => !foundIds.has(id));

      return {
        items: mappedItems,
        missingIds,
        errors: [],
      };
    } catch (err) {
      clearTimeout(timeout);
      lastError = err;
      if (attempt <= maxRetries) {
        await new Promise((r) => setTimeout(r, 500 * attempt));
      }
    }
  }

  const errorMsg = lastError ? maskApiKey(lastError.message, apiKey) : "Network timeout or connection error";
  return {
    items: [],
    missingIds: batch,
    errors: [`Failed to query YouTube API after ${attempt} attempts: ${errorMsg}`],
  };
}
