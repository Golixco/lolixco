import {
  useEffect,
  useRef,
  useState,
  useId,
  forwardRef,
  useImperativeHandle,
} from "react";
import { ExternalLink, AlertTriangle, Play } from "lucide-react";
import { playbackCoordinator } from "../../utils/playbackCoordinator";

// Declare global YT interface for TypeScript
declare global {
  interface Window {
    YT?: {
      Player: new (
        elementId: string | HTMLElement,
        config: Record<string, unknown>
      ) => YouTubePlayerInstance;
      PlayerState: {
        UNSTARTED: number;
        ENDED: number;
        PLAYING: number;
        PAUSED: number;
        BUFFERING: number;
        CUED: number;
      };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

export interface YouTubePlayerInstance {
  playVideo: () => void;
  pauseVideo: () => void;
  stopVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead?: boolean) => void;
  isMuted: () => boolean;
  mute: () => void;
  unMute: () => void;
  destroy: () => void;
}

export interface YouTubePlayerHandle {
  playVideo: () => void;
  pauseVideo: () => void;
  stopVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead?: boolean) => void;
  mute: () => void;
  unMute: () => void;
  isMuted: () => boolean;
  destroy: () => void;
}

export interface YouTubePlayerProps {
  videoId: string;
  title?: string;
  poster?: string;
  aspectRatio?: "16:9" | "9:16";
  autoPlay?: boolean;
  muted?: boolean;
  controls?: boolean;
  coordinatorId?: string;
  onEnded?: () => void;
  onPlay?: () => void;
  onPause?: () => void;
  onError?: (errorCode: number, message: string) => void;
  onAutoplayBlocked?: () => void;
  className?: string;
}

// Global script-loader state to prevent duplicate <script> injection
let isApiLoading = false;
let isApiLoaded = false;
const readyCallbacks: Array<() => void> = [];

export function loadYouTubeIframeApi(callback: () => void) {
  if (typeof window === "undefined") return;

  if (window.YT && window.YT.Player) {
    isApiLoaded = true;
    callback();
    return;
  }

  readyCallbacks.push(callback);

  if (!isApiLoading) {
    isApiLoading = true;
    const previousHandler = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      isApiLoaded = true;
      isApiLoading = false;
      if (previousHandler) previousHandler();
      while (readyCallbacks.length > 0) {
        const cb = readyCallbacks.shift();
        if (cb) cb();
      }
    };

    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    document.head.appendChild(script);
  }
}

export const YouTubePlayer = forwardRef<YouTubePlayerHandle, YouTubePlayerProps>(
  function YouTubePlayer(
    {
      videoId,
      title = "Curated video",
      poster,
      aspectRatio = "16:9",
      autoPlay = false,
      muted = true,
      controls = true,
      coordinatorId,
      onEnded,
      onPlay,
      onPause,
      onError,
      onAutoplayBlocked,
      className = "",
    },
    ref
  ) {
    const reactId = useId().replace(/:/g, "_");
    const containerId = `yt-player-${reactId}`;
    const effectiveCoordinatorId = coordinatorId || containerId;

    const playerRef = useRef<YouTubePlayerInstance | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const [hasError, setHasError] = useState(false);
    const [errorMessage, setErrorMessage] = useState("");
    const [autoplayBlocked, setAutoplayBlocked] = useState(false);
    const [isReady, setIsReady] = useState(false);

    // Keep callback props in stable refs to avoid recreating player when handlers change (FIX G)
    const onEndedRef = useRef(onEnded);
    const onPlayRef = useRef(onPlay);
    const onPauseRef = useRef(onPause);
    const onErrorRef = useRef(onError);
    const onAutoplayBlockedRef = useRef(onAutoplayBlocked);

    useEffect(() => {
      onEndedRef.current = onEnded;
      onPlayRef.current = onPlay;
      onPauseRef.current = onPause;
      onErrorRef.current = onError;
      onAutoplayBlockedRef.current = onAutoplayBlocked;
    });

    // Expose imperative player controls to parent
    useImperativeHandle(
      ref,
      () => ({
        playVideo: () => {
          if (playerRef.current) {
            try {
              playerRef.current.playVideo();
            } catch {
              setAutoplayBlocked(true);
              onAutoplayBlockedRef.current?.();
            }
          }
        },
        pauseVideo: () => {
          if (playerRef.current) {
            try {
              playerRef.current.pauseVideo();
            } catch {
              // Ignore
            }
          }
        },
        stopVideo: () => {
          if (playerRef.current) {
            try {
              playerRef.current.stopVideo();
            } catch {
              // Ignore
            }
          }
        },
        seekTo: (seconds: number, allowSeekAhead?: boolean) => {
          if (playerRef.current) {
            try {
              playerRef.current.seekTo(seconds, allowSeekAhead);
            } catch {
              // Ignore
            }
          }
        },
        mute: () => {
          if (playerRef.current) {
            try {
              playerRef.current.mute();
            } catch {
              // Ignore
            }
          }
        },
        unMute: () => {
          if (playerRef.current) {
            try {
              playerRef.current.unMute();
            } catch {
              // Ignore
            }
          }
        },
        isMuted: () => {
          if (playerRef.current) {
            try {
              return playerRef.current.isMuted();
            } catch {
              return true;
            }
          }
          return true;
        },
        destroy: () => {
          if (playerRef.current) {
            try {
              playerRef.current.destroy();
            } catch {
              // Ignore
            }
            playerRef.current = null;
          }
        },
      }),
      []
    );

    // Register with playbackCoordinator for single-active-player audio exclusivity
    useEffect(() => {
      const unregister = playbackCoordinator.registerPlayer(
        effectiveCoordinatorId,
        () => {
          if (playerRef.current) {
            try {
              playerRef.current.pauseVideo();
            } catch {
              // Guard against dismantled players
            }
          }
        }
      );

      return () => {
        unregister();
      };
    }, [effectiveCoordinatorId]);

    // Stable Player initialization: ONLY dependent on [videoId, containerId, effectiveCoordinatorId]
    // Changing playback props (autoPlay, pause, resume, callbacks) does NOT destroy the iframe! (FIX G)
    useEffect(() => {
      let isMounted = true;
      setHasError(false);
      setErrorMessage("");
      setAutoplayBlocked(false);
      setIsReady(false);

      loadYouTubeIframeApi(() => {
        if (!isMounted || !document.getElementById(containerId)) return;

        // Clean up existing player instance before re-initializing
        if (playerRef.current) {
          try {
            playerRef.current.destroy();
          } catch {
            // Ignore
          }
          playerRef.current = null;
        }

        try {
          const player = new window.YT!.Player(containerId, {
            videoId,
            playerVars: {
              autoplay: autoPlay ? 1 : 0,
              mute: muted ? 1 : 0,
              controls: controls ? 1 : 0,
              rel: 0,
              modestbranding: 1,
              playsinline: 1,
              enablejsapi: 1,
              origin: typeof window !== "undefined" ? window.location.origin : "",
            },
            events: {
              onReady: () => {
                if (!isMounted) return;
                setIsReady(true);
                if (autoPlay) {
                  try {
                    player.playVideo();
                  } catch {
                    setAutoplayBlocked(true);
                    onAutoplayBlockedRef.current?.();
                  }
                }
              },
              onStateChange: (event: { data: number }) => {
                if (!isMounted) return;
                const YTState = window.YT!.PlayerState;

                if (event.data === YTState.PLAYING) {
                  playbackCoordinator.notifyPlaying(effectiveCoordinatorId);
                  setAutoplayBlocked(false);
                  onPlayRef.current?.();
                } else if (event.data === YTState.PAUSED) {
                  onPauseRef.current?.();
                } else if (event.data === YTState.ENDED) {
                  onEndedRef.current?.();
                }
              },
              onError: (event: { data: number }) => {
                if (!isMounted) return;
                const code = event.data;
                let msg = "Playback error occurred.";

                if (code === 100) {
                  msg = "This video has been removed or marked private by its creator.";
                } else if (code === 101 || code === 150) {
                  msg = "The creator of this video does not allow embedded playback outside YouTube.";
                } else if (code === 2) {
                  msg = "Invalid YouTube video ID parameter.";
                }

                setHasError(true);
                setErrorMessage(msg);
                onErrorRef.current?.(code, msg);
              },
              onAutoplayBlocked: () => {
                if (!isMounted) return;
                setAutoplayBlocked(true);
                onAutoplayBlockedRef.current?.();
              },
            },
          });

          playerRef.current = player;
        } catch {
          if (!isMounted) return;
          setHasError(true);
          setErrorMessage("Failed to initialize YouTube embedded player.");
        }
      });

      return () => {
        isMounted = false;
        if (playerRef.current) {
          try {
            playerRef.current.destroy();
          } catch {
            // Ignore
          }
          playerRef.current = null;
        }
      };
    }, [videoId, containerId, effectiveCoordinatorId]);

    // Imperative play / pause sync when autoPlay changes without destroying iframe (FIX G)
    const prevAutoPlay = useRef(autoPlay);
    useEffect(() => {
      if (!isReady || !playerRef.current) return;
      if (prevAutoPlay.current !== autoPlay) {
        prevAutoPlay.current = autoPlay;
        if (autoPlay) {
          try {
            playerRef.current.playVideo();
          } catch {
            setAutoplayBlocked(true);
            onAutoplayBlockedRef.current?.();
          }
        } else {
          try {
            playerRef.current.pauseVideo();
          } catch {
            // Ignore
          }
        }
      }
    }, [autoPlay, isReady]);

    // Imperative mute sync when muted prop changes without destroying iframe
    const prevMuted = useRef(muted);
    useEffect(() => {
      if (!isReady || !playerRef.current) return;
      if (prevMuted.current !== muted) {
        prevMuted.current = muted;
        try {
          if (muted) {
            playerRef.current.mute();
          } else {
            playerRef.current.unMute();
          }
        } catch {
          // Ignore
        }
      }
    }, [muted, isReady]);

    const fallbackThumbnail =
      poster || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
    const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;

    return (
      <div
        ref={containerRef}
        className={`youtube-player-wrapper ${
          aspectRatio === "9:16" ? "aspect-portrait" : "aspect-landscape"
        } ${className}`}
        style={{
          position: "relative",
          width: "100%",
          aspectRatio: aspectRatio === "9:16" ? "9 / 16" : "16 / 9",
          backgroundColor: "#000",
          overflow: "hidden",
        }}
      >
        {/* YouTube IFrame target container */}
        <div
          id={containerId}
          style={{
            width: "100%",
            height: "100%",
            display: hasError ? "none" : "block",
          }}
        />

        {/* Autoplay Blocked Overlay */}
        {autoplayBlocked && !hasError && (
          <div
            className="autoplay-blocked-overlay"
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              background: "rgba(0, 0, 0, 0.75)",
              zIndex: 10,
            }}
          >
            <button
              type="button"
              className="primary watch"
              onClick={() => {
                if (playerRef.current) {
                  try {
                    playerRef.current.unMute();
                    playerRef.current.playVideo();
                  } catch {
                    // Ignore
                  }
                }
                setAutoplayBlocked(false);
              }}
            >
              <Play size={18} /> Resume Playback
            </button>
          </div>
        )}

        {/* Fallback Error Overlay */}
        {hasError && (
          <div
            className="youtube-error-fallback"
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              padding: "1.5rem",
              textAlign: "center",
              color: "#fff",
              backgroundImage: `linear-gradient(rgba(0, 0, 0, 0.8), rgba(0, 0, 0, 0.9)), url(${fallbackThumbnail})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
          >
            <AlertTriangle
              size={32}
              color="#f87171"
              style={{ marginBottom: "0.75rem" }}
            />
            <h3
              style={{
                fontSize: "1.1rem",
                fontWeight: 600,
                marginBottom: "0.5rem",
              }}
            >
              {title}
            </h3>
            <p
              style={{
                fontSize: "0.9rem",
                color: "#d1d5db",
                maxWidth: "420px",
                marginBottom: "1rem",
              }}
            >
              {errorMessage}
            </p>
            <a
              href={watchUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="primary watch"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.5rem",
                textDecoration: "none",
              }}
            >
              Watch on YouTube <ExternalLink size={16} />
            </a>
          </div>
        )}
      </div>
    );
  }
);

export default YouTubePlayer;
