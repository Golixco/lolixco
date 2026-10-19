/**
 * YouTube URL parser and normalizer for Lolixco.
 *
 * Implements strict domain validation, URL path parsing, tracking parameter
 * stripping, and extraction of canonical 11-character YouTube video IDs.
 */

export interface NormalizedYouTubeUrl {
  valid: boolean;
  videoId?: string;
  canonicalUrl?: string;
  urlFormatHint?: "video" | "short";
  error?: string;
  originalUrl: string;
}

const YOUTUBE_VIDEO_ID_REGEX = /^[a-zA-Z0-9_-]{11}$/;

const ALLOWED_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "youtu.be",
  "www.youtu.be",
]);

/**
 * Validates and normalizes any supported YouTube video or Shorts URL.
 * Extracts the canonical 11-character video ID and formats standard watch URL.
 */
export function normalizeYouTubeUrl(rawUrl: string): NormalizedYouTubeUrl {
  if (typeof rawUrl !== "string" || !rawUrl.trim()) {
    return {
      valid: false,
      originalUrl: String(rawUrl ?? ""),
      error: "URL must be a non-empty string",
    };
  }

  const trimmed = rawUrl.trim();

  let parsed: URL;
  try {
    // If protocol missing, assume https://
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

  // 1. Strict hostname validation
  const hostname = parsed.hostname.toLowerCase();
  if (!ALLOWED_HOSTS.has(hostname)) {
    return {
      valid: false,
      originalUrl: trimmed,
      error: `Unsupported or non-YouTube domain: ${hostname}`,
    };
  }

  let extractedId: string | null = null;
  let formatHint: "video" | "short" = "video";

  // 2. youtu.be shortlinks
  if (hostname === "youtu.be" || hostname === "www.youtu.be") {
    // Path format: /<videoId>
    const pathParts = parsed.pathname.split("/").filter(Boolean);
    if (pathParts.length >= 1) {
      extractedId = pathParts[0];
    }
  } else {
    // 3. youtube.com variations
    const pathname = parsed.pathname;

    if (pathname === "/watch") {
      extractedId = parsed.searchParams.get("v");
      formatHint = "video";
    } else if (pathname.startsWith("/shorts/")) {
      const parts = pathname.split("/").filter(Boolean);
      // /shorts/<videoId>
      if (parts.length >= 2) {
        extractedId = parts[1];
        formatHint = "short";
      }
    } else if (pathname.startsWith("/embed/")) {
      const parts = pathname.split("/").filter(Boolean);
      // /embed/<videoId>
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

  // 4. Validate exact 11-char ID
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

/**
 * Returns standard YouTube embed URL with privacy-preserving parameters.
 */
export function getYouTubeEmbedUrl(videoId: string, options: {
  autoplay?: boolean;
  mute?: boolean;
  loop?: boolean;
  controls?: boolean;
  start?: number;
} = {}): string {
  if (!YOUTUBE_VIDEO_ID_REGEX.test(videoId)) {
    throw new Error(`Invalid YouTube video ID: ${videoId}`);
  }

  const params = new URLSearchParams();
  params.set("enablejsapi", "1");
  params.set("modestbranding", "1");
  params.set("rel", "0");
  params.set("playsinline", "1");

  if (typeof window !== "undefined" && window.location.origin) {
    params.set("origin", window.location.origin);
  }

  if (options.autoplay) params.set("autoplay", "1");
  if (options.mute) params.set("mute", "1");
  if (options.loop) {
    params.set("loop", "1");
    params.set("playlist", videoId);
  }
  if (options.controls === false) params.set("controls", "0");
  if (typeof options.start === "number" && options.start > 0) {
    params.set("start", Math.floor(options.start).toString());
  }

  return `https://www.youtube.com/embed/${videoId}?${params.toString()}`;
}

/**
 * Returns standard YouTube high-resolution thumbnail URL with fallback.
 */
export function getYouTubeThumbnailUrl(
  videoId: string,
  quality: "maxresdefault" | "hqdefault" | "mqdefault" | "default" = "hqdefault"
): string {
  return `https://i.ytimg.com/vi/${videoId}/${quality}.jpg`;
}
