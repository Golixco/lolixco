import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __projectRoot = fileURLToPath(new URL("../", import.meta.url));

/**
 * Loads .env and .env.local if present in project root.
 */
export function loadEnvConfig(rootDir = __projectRoot) {
  // Try Node.js built-in process.loadEnvFile first
  if (typeof process.loadEnvFile === "function") {
    const envPath = resolve(rootDir, ".env");
    if (existsSync(envPath)) {
      try {
        process.loadEnvFile(envPath);
      } catch {
        // Fallback below
      }
    }
    const envLocalPath = resolve(rootDir, ".env.local");
    if (existsSync(envLocalPath)) {
      try {
        process.loadEnvFile(envLocalPath);
      } catch {
        // Ignore
      }
    }
  }

  // Fallback manual parser to ensure .env loading across platforms
  const targetFiles = [".env", ".env.local"];
  for (const file of targetFiles) {
    const fullPath = resolve(rootDir, file);
    if (existsSync(fullPath)) {
      try {
        const content = readFileSync(fullPath, "utf-8");
        for (const line of content.split(/\r?\n/)) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith("#")) continue;
          const eqIdx = trimmed.indexOf("=");
          if (eqIdx !== -1) {
            const key = trimmed.slice(0, eqIdx).trim();
            let val = trimmed.slice(eqIdx + 1).trim();
            if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
              val = val.slice(1, -1);
            }
            if (key && !(key in process.env)) {
              process.env[key] = val;
            }
          }
        }
      } catch {
        // Ignore
      }
    }
  }
}

// Auto-load on import
loadEnvConfig();

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
  loadEnvConfig();

  const {
    apiKey = process.env.YOUTUBE_API_KEY,
    mockMode = false,
    customMockMetadata = null,
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

  const isMock = Boolean(mockMode || options.useMock || options.isMock || customMockMetadata);

  // FAIL CLOSED: Require a real API key for normal ingestion
  if (!isMock && (!apiKey || typeof apiKey !== "string" || !apiKey.trim())) {
    return {
      items: [],
      missingIds: batch,
      errors: [
        "YouTube API key is missing. Set YOUTUBE_API_KEY in .env or pass --mock for offline testing.",
      ],
    };
  }

  // MOCK MODE (For automated tests only via explicit switch or injected mock database)
  if (isMock) {
    const items = [];
    const missingIds = [];
    const incompleteIds = [];
    const confirmedUnavailableIds = [];
    const retryableIds = [];
    const errors = [];

    for (const id of batch) {
      let mock = undefined;
      if (customMockMetadata && id in customMockMetadata) {
        mock = customMockMetadata[id];
      } else if (MOCK_YOUTUBE_DATABASE.has(id)) {
        mock = MOCK_YOUTUBE_DATABASE.get(id);
      }

      if (mock !== undefined) {
        if (mock === null) {
          // Explicitly simulated 404/deleted
          missingIds.push(id);
          confirmedUnavailableIds.push(id);
        } else if (mock && mock.quotaExceeded === true) {
          missingIds.push(id);
          retryableIds.push(id);
          errors.push(`Video '${id}': YouTube API quota exceeded (retryable).`);
        } else if (mock && mock.incomplete === true) {
          missingIds.push(id);
          incompleteIds.push(id);
          errors.push(`Video '${id}': incomplete YouTube API response - missing required metadata fields.`);
        } else if (mock && mock.retryable === true) {
          missingIds.push(id);
          retryableIds.push(id);
          errors.push(`Video '${id}': transient YouTube API failure (retryable).`);
        } else {
          items.push({
            canonicalVideoId: id,
            ...mock,
            // Guaranteed synthetic markers: caller-supplied fields can NEVER override synthetic mode
            isMock: true,
            provenance: "synthetic_mock",
            syntheticOrigin: customMockMetadata && id in customMockMetadata ? "custom_mock_metadata" : "mock_database",
          });
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
          isMock: true,
          provenance: "synthetic_mock",
          syntheticOrigin: "default_mock",
        });
      }
    }

    return { items, missingIds, incompleteIds, confirmedUnavailableIds, retryableIds, errors };
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
            incompleteIds: batch,
            confirmedUnavailableIds: [],
            retryableIds: batch,
            isQuotaExceeded: true,
            retryable: true,
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
          incompleteIds: batch,
          confirmedUnavailableIds: [],
          retryableIds: batch,
          retryable: true,
          errors: [`YouTube Data API error HTTP ${response.status}: ${masked}`],
        };
      }

      const json = await response.json();
      const rawItems = Array.isArray(json.items) ? json.items : [];
      const foundIds = new Set();
      const mappedItems = [];
      const incompleteIds = [];
      const itemErrors = [];

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

        const rawTitle = typeof snippet.title === "string" ? snippet.title.trim() : "";
        const rawChannelTitle = typeof snippet.channelTitle === "string" ? snippet.channelTitle.trim() : "";

        // Reject incomplete records without fabricating titles or creator attribution
        if (!rawTitle) {
          incompleteIds.push(id);
          itemErrors.push(`Video '${id}': incomplete YouTube API response - missing title in snippet.`);
          continue;
        }

        if (!rawChannelTitle) {
          incompleteIds.push(id);
          itemErrors.push(`Video '${id}': incomplete YouTube API response - missing channelTitle in snippet.`);
          continue;
        }

        mappedItems.push({
          canonicalVideoId: id,
          title: rawTitle,
          description,
          channelId: snippet.channelId || "",
          channelTitle: rawChannelTitle,
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
          isMock: false,
          provenance: "youtube_data_api_v3",
          fetchStatus: "success",
        });
      }

      const notFoundIds = batch.filter((id) => !foundIds.has(id));
      const allMissingIds = [...notFoundIds, ...incompleteIds];

      return {
        items: mappedItems,
        missingIds: allMissingIds,
        incompleteIds,
        confirmedUnavailableIds: notFoundIds,
        retryableIds: [],
        errors: itemErrors,
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
    incompleteIds: batch,
    confirmedUnavailableIds: [],
    retryableIds: batch,
    retryable: true,
    errors: [`Failed to query YouTube API after ${attempt} attempts: ${errorMsg}`],
  };
}
