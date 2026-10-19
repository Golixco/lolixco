import React, { useState, useEffect, useRef, useCallback } from "react";
import type { Edit } from "../../data/edits";
import { isYouTubeEmbed } from "../../data/edits";
import {
  type ImmersionContext,
  type ImmersionQueueState,
  createImmersionSession,
  advanceImmersionNext,
  advanceImmersionPrevious,
  skipUnavailableImmersionEdit,
} from "../../utils/immersionQueue";
import { playbackCoordinator } from "../../utils/playbackCoordinator";
import YouTubePlayer, { type YouTubePlayerHandle } from "../video/YouTubePlayer";
import {
  X,
  Play,
  Pause,
  SkipForward,
  SkipBack,
  Maximize,
  Minimize,
  AlertCircle,
  Volume2,
  VolumeX,
} from "lucide-react";

export interface ImmersionViewerProps {
  catalog: readonly Edit[];
  initialContext?: ImmersionContext;
  onClose: () => void;
  onTagClick?: (tag: string) => void;
}

export default function ImmersionViewer({
  catalog,
  initialContext = {},
  onClose,
  onTagClick,
}: ImmersionViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const nativeVideoRef = useRef<HTMLVideoElement>(null);
  const ytPlayerRef = useRef<YouTubePlayerHandle>(null);

  const [session, setSession] = useState<{
    currentEdit: Edit | null;
    state: ImmersionQueueState;
  }>(() => createImmersionSession(catalog, initialContext));

  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [consecutiveSkips, setConsecutiveSkips] = useState<number>(0);
  const [isExhausted, setIsExhausted] = useState<boolean>(false);
  const [autoplayBlocked, setAutoplayBlocked] = useState<boolean>(false);
  const [resumeError, setResumeError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(true);

  const currentEdit = session.currentEdit;
  const state = session.state;

  // Single-active audio registration with playbackCoordinator
  useEffect(() => {
    const unregister = playbackCoordinator.registerPlayer("immersion-player", () => {
      setIsPlaying(false);
      if (nativeVideoRef.current && !nativeVideoRef.current.paused) {
        nativeVideoRef.current.pause();
      }
      if (ytPlayerRef.current) {
        try {
          ytPlayerRef.current.pauseVideo();
        } catch {
          // Guard against unmounted players
        }
      }
    });

    playbackCoordinator.notifyPlaying("immersion-player");

    return () => {
      unregister();
    };
  }, []);

  // Request fullscreen on start if supported
  useEffect(() => {
    try {
      if (containerRef.current && document.fullscreenEnabled && !document.fullscreenElement) {
        containerRef.current.requestFullscreen().catch(() => {
          // Fullscreen request denied or not allowed by browser policy - graceful fallback
        });
      }
    } catch {
      // Ignored
    }

    function handleFullscreenChange() {
      setIsFullscreen(!!document.fullscreenElement);
    }

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
    };
  }, []);

  // Pause playback when page visibility changes (tab hidden or screen locked)
  useEffect(() => {
    function handleVisibility() {
      if (document.hidden) {
        setIsPlaying(false);
        if (nativeVideoRef.current && !nativeVideoRef.current.paused) {
          nativeVideoRef.current.pause();
        }
        if (ytPlayerRef.current) {
          try {
            ytPlayerRef.current.pauseVideo();
          } catch {
            // Guard against unmounted players
          }
        }
      }
    }

    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  // Navigation: Next
  const handleNext = useCallback(() => {
    setAutoplayBlocked(false);
    setResumeError(null);
    setConsecutiveSkips(0);
    const { nextEdit, nextState } = advanceImmersionNext(catalog, state);
    if (!nextEdit) {
      setIsExhausted(true);
      return;
    }
    setSession({ currentEdit: nextEdit, state: nextState });
    setIsPlaying(true);
  }, [catalog, state]);

  // Navigation: Previous
  const handlePrevious = useCallback(() => {
    setAutoplayBlocked(false);
    setResumeError(null);
    const { prevEdit, nextState } = advanceImmersionPrevious(state);
    if (prevEdit) {
      setSession({ currentEdit: prevEdit, state: nextState });
      setIsPlaying(true);
      setIsExhausted(false);
    }
  }, [state]);

  // Toggle Play / Pause
  const handleTogglePlay = useCallback(() => {
    if (isPlaying) {
      setIsPlaying(false);
      playbackCoordinator.notifyPaused("immersion-player");
      if (nativeVideoRef.current) nativeVideoRef.current.pause();
      if (ytPlayerRef.current) {
        try {
          ytPlayerRef.current.pauseVideo();
        } catch {
          // Ignore
        }
      }
    } else {
      playbackCoordinator.notifyPlaying("immersion-player");
      setIsPlaying(true);
      setAutoplayBlocked(false);
      setResumeError(null);
      if (nativeVideoRef.current) nativeVideoRef.current.play().catch(() => {});
      if (ytPlayerRef.current) {
        try {
          ytPlayerRef.current.playVideo();
        } catch {
          setAutoplayBlocked(true);
        }
      }
    }
  }, [isPlaying]);

  // Dedicated Resume Playback action for explicit user interaction after autoplay blockage (FIX G)
  const handleResumePlayback = useCallback(() => {
    setResumeError(null);
    playbackCoordinator.notifyPlaying("immersion-player");
    setIsPlaying(true);
    setAutoplayBlocked(false);
    setIsMuted(false);

    if (currentEdit && isYouTubeEmbed(currentEdit)) {
      if (ytPlayerRef.current) {
        try {
          ytPlayerRef.current.unMute();
          ytPlayerRef.current.playVideo();
        } catch {
          setAutoplayBlocked(true);
          setResumeError("Playback could not be resumed. Tap or click directly on the video player.");
        }
      }
    } else if (nativeVideoRef.current) {
      nativeVideoRef.current.muted = false;
      nativeVideoRef.current.play().catch(() => {
        setAutoplayBlocked(true);
        setResumeError("Playback could not be resumed. Please interact with the page to allow audio/video.");
      });
    }
  }, [currentEdit]);

  // User-controlled sound and unmute toggle
  const handleToggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      if (nativeVideoRef.current) {
        nativeVideoRef.current.muted = next;
      }
      if (ytPlayerRef.current) {
        try {
          if (next) {
            ytPlayerRef.current.mute();
          } else {
            ytPlayerRef.current.unMute();
          }
        } catch {
          // Guard against unmounted player
        }
      }
      return next;
    });
  }, []);

  // Handle Playback Error with bounded skip retry
  const handlePlaybackError = useCallback(() => {
    const { nextEdit, nextState, exhausted } = skipUnavailableImmersionEdit(
      catalog,
      state,
      consecutiveSkips,
      3
    );

    if (exhausted || !nextEdit) {
      setIsExhausted(true);
    } else {
      setConsecutiveSkips((prev) => prev + 1);
      setSession({ currentEdit: nextEdit, state: nextState });
      setIsPlaying(true);
    }
  }, [catalog, consecutiveSkips, state]);

  // Toggle Fullscreen manually
  const handleToggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }, []);

  // Keyboard navigation
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      switch (e.key) {
        case "Escape":
          e.preventDefault();
          onClose();
          break;
        case " ":
        case "k":
          e.preventDefault();
          handleTogglePlay();
          break;
        case "ArrowRight":
        case "j":
        case "n":
          e.preventDefault();
          handleNext();
          break;
        case "ArrowLeft":
        case "p":
          e.preventDefault();
          handlePrevious();
          break;
        case "f":
          e.preventDefault();
          handleToggleFullscreen();
          break;
        case "m":
          e.preventDefault();
          handleToggleMute();
          break;
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleNext, handlePrevious, handleToggleFullscreen, handleTogglePlay, handleToggleMute, onClose]);

  // Determine stage label
  const stageLabel = state.openingQueue.length > 0 || state.currentIndex < 3
    ? `Opening (${state.currentIndex + 1}/3)`
    : `Discovery (${state.currentIndex + 1})`;

  const isPortrait = currentEdit?.format === "short";
  const isEmbed = currentEdit ? isYouTubeEmbed(currentEdit) : false;

  return (
    <div
      ref={containerRef}
      className="immersion-overlay"
      role="dialog"
      aria-label="Immersion Mode Viewer"
      aria-modal="true"
    >
      {/* Top Bar Navigation */}
      <header className="immersion-topbar">
        <div className="immersion-meta-info">
          <span className="immersion-badge">
            {currentEdit?.category || "IMMERSION"}
          </span>
          <span className="immersion-stage-pill">{stageLabel}</span>
          <div className="immersion-title-group">
            <span className="immersion-title">
              {currentEdit?.title || "Curated Edit"}
            </span>
            {currentEdit?.channelTitle && (
              <span className="immersion-channel">
                by {currentEdit.channelTitle}
              </span>
            )}
          </div>
        </div>

        <div className="immersion-top-actions">
          <button
            type="button"
            className="immersion-btn"
            onClick={handleToggleMute}
            aria-label={isMuted ? "Unmute audio (m)" : "Mute audio (m)"}
            title={isMuted ? "Unmute audio (m)" : "Mute audio (m)"}
          >
            {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
          </button>
          <button
            type="button"
            className="immersion-btn"
            onClick={handleToggleFullscreen}
            aria-label={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
            title={isFullscreen ? "Exit Fullscreen (f)" : "Enter Fullscreen (f)"}
          >
            {isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
          </button>
          <button
            type="button"
            className="immersion-btn"
            onClick={onClose}
            aria-label="Exit Immersion Mode (Esc)"
            title="Exit Immersion Mode (Esc)"
          >
            <X size={20} />
          </button>
        </div>
      </header>

      {/* Main Playback Area */}
      <main className="immersion-main-area">
        {isExhausted || !currentEdit ? (
          <div className="immersion-prompt-overlay">
            <AlertCircle size={44} color="#f87171" />
            <h2 style={{ color: "#fff", margin: "4px 0" }}>
              Queue Playback Complete
            </h2>
            <p style={{ color: "rgba(255, 255, 255, 0.7)", maxWidth: 440 }}>
              No more eligible edits could be loaded. You can restart Immersion Mode
              or return to normal browsing.
            </p>
            <div style={{ display: "flex", gap: 12 }}>
              <button
                type="button"
                className="immersion-prompt-btn"
                onClick={() => {
                  setIsExhausted(false);
                  setSession(createImmersionSession(catalog, initialContext));
                  setIsPlaying(true);
                }}
              >
                Restart Immersion
              </button>
              <button
                type="button"
                className="immersion-btn"
                style={{ width: "auto", borderRadius: 24, padding: "0 18px" }}
                onClick={onClose}
              >
                Exit
              </button>
            </div>
          </div>
        ) : (
          <div
            className={`immersion-video-wrapper ${
              isPortrait ? "portrait" : "landscape"
            }`}
          >
            {isEmbed ? (
              <YouTubePlayer
                ref={ytPlayerRef}
                key={currentEdit.id}
                videoId={currentEdit.youtubeVideoId || ""}
                title={currentEdit.title}
                aspectRatio={isPortrait ? "9:16" : "16:9"}
                autoPlay={isPlaying}
                muted={isMuted}
                controls={true}
                registerWithCoordinator={false}
                onEnded={handleNext}
                onError={() => handlePlaybackError()}
                onPlay={() => {
                  setIsPlaying(true);
                  setAutoplayBlocked(false);
                  playbackCoordinator.notifyPlaying("immersion-player");
                }}
                onPause={() => setIsPlaying(false)}
                onAutoplayBlocked={() => setAutoplayBlocked(true)}
              />
            ) : (
              <video
                ref={nativeVideoRef}
                key={currentEdit.id}
                src={currentEdit.source}
                poster={currentEdit.poster}
                autoPlay={isPlaying}
                muted={isMuted}
                playsInline
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "contain",
                  background: "#000",
                }}
                onEnded={handleNext}
                onError={handlePlaybackError}
                onPlay={() => {
                  setIsPlaying(true);
                  setAutoplayBlocked(false);
                  playbackCoordinator.notifyPlaying("immersion-player");
                }}
                onPause={() => setIsPlaying(false)}
              />
            )}

            {autoplayBlocked && (
              <div className="immersion-prompt-overlay">
                <button
                  type="button"
                  className="immersion-prompt-btn"
                  onClick={handleResumePlayback}
                >
                  Continue Playback
                </button>
                {resumeError && (
                  <p style={{ color: "#f87171", fontSize: "0.85rem", marginTop: 8 }}>
                    {resumeError}
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Bottom Bar Controls & Discovery Tags */}
      <footer className="immersion-bottombar">
        <div className="immersion-controls">
          <button
            type="button"
            className="immersion-btn"
            onClick={handlePrevious}
            disabled={state.currentIndex <= 0}
            aria-label="Previous edit (Left Arrow)"
            title="Previous edit (Left Arrow)"
          >
            <SkipBack size={18} />
          </button>
          <button
            type="button"
            className="immersion-btn"
            onClick={handleTogglePlay}
            aria-label={isPlaying ? "Pause (Space)" : "Play (Space)"}
            title={isPlaying ? "Pause (Space)" : "Play (Space)"}
          >
            {isPlaying ? <Pause size={20} /> : <Play size={20} />}
          </button>
          <button
            type="button"
            className="immersion-btn"
            onClick={handleNext}
            aria-label="Next edit (Right Arrow)"
            title="Next edit (Right Arrow)"
          >
            <SkipForward size={18} />
          </button>
          <button
            type="button"
            className="immersion-btn"
            onClick={handleToggleMute}
            aria-label={isMuted ? "Unmute audio (m)" : "Mute audio (m)"}
            title={isMuted ? "Unmute audio (m)" : "Mute audio (m)"}
          >
            {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
          </button>
        </div>

        {currentEdit?.tags && currentEdit.tags.length > 0 && (
          <div className="immersion-tag-list" aria-label="Edit tags">
            {currentEdit.tags.map((tag) => (
              <button
                key={tag}
                type="button"
                className="immersion-tag"
                onClick={() => {
                  onClose();
                  onTagClick?.(tag);
                }}
              >
                #{tag}
              </button>
            ))}
          </div>
        )}
      </footer>
    </div>
  );
}
