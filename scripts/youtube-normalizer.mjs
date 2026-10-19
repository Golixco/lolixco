/**
 * Node ESM export of YouTube URL normalization logic for CLI ingestion scripts.
 */

export const YOUTUBE_VIDEO_ID_REGEX = /^[a-zA-Z0-9_-]{11}$/;

export const ALLOWED_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "youtu.be",
  "www.youtu.be",
]);

/**
 * Validates and normalizes any supported YouTube video or Shorts URL.
 */
export function normalizeYouTubeUrl(rawUrl) {
  if (typeof rawUrl !== "string" || !rawUrl.trim()) {
    return {
      valid: false,
      originalUrl: String(rawUrl ?? ""),
      error: "URL must be a non-empty string",
    };
  }

  const trimmed = rawUrl.trim();

  let parsed;
  try {
    const urlWithProtocol = trimmed.startsWith("http://") || trimmed.startsWith("https://")
      ? trimmed
      : `https://${trimmed}`;
    parsed = new URL(urlWithProtocol);
  } catch {
    return {
      valid: false,
      originalUrl: trimmed,
      error: `Malformed URL string: ${trimmed}`,
    };
  }

  const hostname = parsed.hostname.toLowerCase();
  if (!ALLOWED_HOSTS.has(hostname)) {
    return {
      valid: false,
      originalUrl: trimmed,
      error: `Unsupported or non-YouTube domain: ${hostname}`,
    };
  }

  let extractedId = null;
  let formatHint = "video";

  if (hostname === "youtu.be" || hostname === "www.youtu.be") {
    const pathParts = parsed.pathname.split("/").filter(Boolean);
    if (pathParts.length >= 1) {
      extractedId = pathParts[0];
    }
  } else {
    const pathname = parsed.pathname;

    if (pathname === "/watch") {
      extractedId = parsed.searchParams.get("v");
      formatHint = "video";
    } else if (pathname.startsWith("/shorts/")) {
      const parts = pathname.split("/").filter(Boolean);
      if (parts.length >= 2) {
        extractedId = parts[1];
        formatHint = "short";
      }
    } else if (pathname.startsWith("/embed/")) {
      const parts = pathname.split("/").filter(Boolean);
      if (parts.length >= 2) {
        extractedId = parts[1];
      }
    } else if (pathname.startsWith("/v/")) {
      const parts = pathname.split("/").filter(Boolean);
      if (parts.length >= 2) {
        extractedId = parts[1];
      }
    } else if (pathname.startsWith("/@") || pathname.startsWith("/channel/") || pathname.startsWith("/c/")) {
      return {
        valid: false,
        originalUrl: trimmed,
        error: "Channel URLs are not valid video links",
      };
    } else if (pathname.startsWith("/playlist")) {
      return {
        valid: false,
        originalUrl: trimmed,
        error: "Playlist URLs without individual video ID are not supported",
      };
    } else if (pathname.startsWith("/results")) {
      return {
        valid: false,
        originalUrl: trimmed,
        error: "Search result URLs are not supported",
      };
    }
  }

  if (!extractedId) {
    return {
      valid: false,
      originalUrl: trimmed,
      error: "Could not extract video ID from URL path or parameters",
    };
  }

  if (!YOUTUBE_VIDEO_ID_REGEX.test(extractedId)) {
    return {
      valid: false,
      originalUrl: trimmed,
      error: `Invalid YouTube video ID format: '${extractedId}' (must be 11 base64 characters)`,
    };
  }

  return {
    valid: true,
    videoId: extractedId,
    canonicalUrl: `https://www.youtube.com/watch?v=${extractedId}`,
    urlFormatHint: formatHint,
    originalUrl: trimmed,
  };
}
