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
import YouTubePlayer from "../video/YouTubePlayer";
import {
  X,
  Play,
  Pause,
  SkipForward,
  SkipBack,
  Maximize,
  Minimize,
  AlertCircle,
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

  const [session, setSession] = useState<{
    currentEdit: Edit | null;
    state: ImmersionQueueState;
  }>(() => createImmersionSession(catalog, initialContext));

  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [consecutiveSkips, setConsecutiveSkips] = useState<number>(0);
  const [isExhausted, setIsExhausted] = useState<boolean>(false);
  const [autoplayBlocked, setAutoplayBlocked] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  const currentEdit = session.currentEdit;
  const state = session.state;

  // Single-active audio registration with playbackCoordinator
  useEffect(() => {
    const unregister = playbackCoordinator.registerPlayer("immersion-player", () => {
      setIsPlaying(false);
      if (nativeVideoRef.current && !nativeVideoRef.current.paused) {
        nativeVideoRef.current.pause();
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
      }
    }

    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  // Navigation: Next
  const handleNext = useCallback(() => {
    setAutoplayBlocked(false);
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
    } else {
      playbackCoordinator.notifyPlaying("immersion-player");
      setIsPlaying(true);
      setAutoplayBlocked(false);
      if (nativeVideoRef.current) nativeVideoRef.current.play().catch(() => {});
    }
  }, [isPlaying]);

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
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleNext, handlePrevious, handleToggleFullscreen, handleTogglePlay, onClose]);

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
                key={currentEdit.id}
                videoId={currentEdit.youtubeVideoId || ""}
                title={currentEdit.title}
                aspectRatio={isPortrait ? "9:16" : "16:9"}
                autoPlay={isPlaying}
                onEnded={handleNext}
                onError={() => handlePlaybackError()}
                onPlay={() => {
                  setIsPlaying(true);
                  setAutoplayBlocked(false);
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
                }}
                onPause={() => setIsPlaying(false)}
              />
            )}

            {autoplayBlocked && (
              <div className="immersion-prompt-overlay">
                <button
                  type="button"
                  className="immersion-prompt-btn"
                  onClick={handleTogglePlay}
                >
                  Click to Resume Playback
                </button>
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
