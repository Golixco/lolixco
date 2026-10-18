import { useState, useRef, useEffect, useCallback } from "react";
import {
  X,
  Play,
  Pause,
  Volume2,
  VolumeX,
  ChevronUp,
  ChevronDown,
  RotateCcw,
  Film,
} from "lucide-react";
import type { Edit } from "../../data/edits";
import { getFandomById } from "../../data/fandoms";

export interface ShortsViewerProps {
  shorts: Edit[];
  initialShortId?: number;
  activeShortId?: number;
  onShortChange?: (short: Edit) => void;
  onClose: () => void;
  onTagClick?: (tag: string) => void;
}

const formatTime = (n: number) =>
  `${Math.floor(n / 60)}:${Math.floor(n % 60)
    .toString()
    .padStart(2, "0")}`;

export function ShortsViewer({
  shorts,
  initialShortId,
  activeShortId,
  onShortChange,
  onClose,
  onTagClick,
}: ShortsViewerProps) {
  const effectiveInitialId = activeShortId ?? initialShortId;
  const initialIndex = Math.max(
    0,
    shorts.findIndex((s) => s.id === effectiveInitialId)
  );

  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [hasError, setHasError] = useState(false);
  const [, setIsWaiting] = useState(false);
  const [touchStartY, setTouchStartY] = useState<number | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const viewerRef = useRef<HTMLDivElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);
  const playRequestId = useRef(0);
  const lastNavTime = useRef(0);

  const currentShort = shorts[currentIndex];

  // Store active element for focus restoration on exit
  useEffect(() => {
    if (typeof document !== "undefined") {
      previousActiveElement.current = document.activeElement as HTMLElement;
    }
    // Auto-focus viewer container on mount
    viewerRef.current?.focus();

    return () => {
      previousActiveElement.current?.focus?.();
    };
  }, []);

  const prevActiveShortId = useRef(activeShortId);
  const prevInitialShortId = useRef(initialShortId);

  // Update currentIndex only when activeShortId or initialShortId prop actually changes from parent
  useEffect(() => {
    if (
      typeof activeShortId === "number" &&
      activeShortId !== prevActiveShortId.current
    ) {
      prevActiveShortId.current = activeShortId;
      const idx = shorts.findIndex((s) => s.id === activeShortId);
      if (idx !== -1) {
        setCurrentIndex(idx);
      }
    } else if (
      activeShortId === undefined &&
      typeof initialShortId === "number" &&
      initialShortId !== prevInitialShortId.current
    ) {
      prevInitialShortId.current = initialShortId;
      const idx = shorts.findIndex((s) => s.id === initialShortId);
      if (idx !== -1) {
        setCurrentIndex(idx);
      }
    }
  }, [activeShortId, initialShortId, shorts]);

  // Video playback lifecycle when currentIndex changes
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    setHasError(false);
    setIsWaiting(false);
    setCurrentTime(0);
    setDuration(0);

    video.pause();

    const prefersReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const saveData =
      typeof navigator !== "undefined" &&
      (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;

    const currentReq = ++playRequestId.current;

    // Respect reduced-motion and reduced-data preferences
    if (!prefersReducedMotion && !saveData) {
      const playPromise = video.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            if (playRequestId.current === currentReq) {
              setIsPlaying(true);
            }
          })
          .catch(() => {
            // Autoplay rejected or waiting for user gesture
            if (playRequestId.current === currentReq) {
              setIsPlaying(false);
            }
          });
      }
    } else {
      setIsPlaying(false);
    }

    return () => {
      video.pause();
    };
  }, [currentIndex]);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video || hasError) return;

    const currentReq = ++playRequestId.current;

    if (video.paused) {
      video
        .play()
        .then(() => {
          if (playRequestId.current === currentReq) {
            setIsPlaying(true);
          }
        })
        .catch(() => {
          if (playRequestId.current === currentReq) {
            setIsPlaying(false);
          }
        });
    } else {
      video.pause();
      setIsPlaying(false);
    }
  }, [hasError]);

  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    video.muted = !video.muted;
    setIsMuted(video.muted);
  }, []);

  const handleNext = useCallback(() => {
    if (currentIndex < shorts.length - 1) {
      const nextIndex = currentIndex + 1;
      setCurrentIndex(nextIndex);
      const nextShort = shorts[nextIndex];
      if (nextShort) {
        onShortChange?.(nextShort);
      }
    }
  }, [currentIndex, onShortChange, shorts]);

  const handlePrev = useCallback(() => {
    if (currentIndex > 0) {
      const prevIndex = currentIndex - 1;
      setCurrentIndex(prevIndex);
      const prevShort = shorts[prevIndex];
      if (prevShort) {
        onShortChange?.(prevShort);
      }
    }
  }, [currentIndex, onShortChange, shorts]);

  const handleRetry = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setHasError(false);
      setIsWaiting(true);
      const video = videoRef.current;
      if (video) {
        video.load();
        const currentReq = ++playRequestId.current;
        video
          .play()
          .then(() => {
            if (playRequestId.current === currentReq) {
              setIsPlaying(true);
              setIsWaiting(false);
            }
          })
          .catch(() => {
            if (playRequestId.current === currentReq) {
              setIsPlaying(false);
              setIsWaiting(false);
            }
          });
      }
    },
    []
  );

  // Keyboard navigation & accessibility focus handling
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const activeEl = document.activeElement as HTMLElement | null;

      // Trap Tab within viewer dialog
      if (e.key === "Tab" && viewerRef.current) {
        const focusable = viewerRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [role="slider"], [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length > 0) {
          const firstEl = focusable[0];
          const lastEl = focusable[focusable.length - 1];

          if (e.shiftKey) {
            if (
              document.activeElement === firstEl ||
              document.activeElement === viewerRef.current
            ) {
              e.preventDefault();
              lastEl.focus();
              return;
            }
          } else {
            if (document.activeElement === lastEl) {
              e.preventDefault();
              firstEl.focus();
              return;
            }
          }
        }
      }

      // Escape always closes the viewer
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }

      // If active element or event target is a button, link, or text input, let them handle Space / Enter natively
      const isInteractive = Boolean(
        activeEl?.closest?.("button, a, input, textarea, select") ||
          (e.target as HTMLElement)?.closest?.(
            "button, a, input, textarea, select"
          )
      );

      if (isInteractive) {
        return;
      }

      switch (e.key) {
        case " ":
        case "k":
        case "K":
          e.preventDefault();
          togglePlay();
          break;
        case "m":
        case "M":
          e.preventDefault();
          toggleMute();
          break;
        case "ArrowUp":
          e.preventDefault();
          handlePrev();
          break;
        case "ArrowDown":
          e.preventDefault();
          handleNext();
          break;
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleNext, handlePrev, onClose, toggleMute, togglePlay]);

  // Touch swipe support with 400ms debounce
  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStartY(e.touches[0].clientY);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartY === null) return;
    const touchEndY = e.changedTouches[0].clientY;
    const diff = touchStartY - touchEndY;
    const now = Date.now();

    if (now - lastNavTime.current > 400) {
      if (diff > 50) {
        lastNavTime.current = now;
        handleNext();
      } else if (diff < -50) {
        lastNavTime.current = now;
        handlePrev();
      }
    }
    setTouchStartY(null);
  };

  if (!currentShort) {
    return null;
  }

  const fandomTitle = currentShort.fandomIds?.[0]
    ? getFandomById(currentShort.fandomIds[0])?.title
    : null;

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div
      ref={viewerRef}
      className="shorts-viewer-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={`Shorts viewer: ${currentShort.title}`}
      tabIndex={-1}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <div className="shorts-viewer-backdrop" onClick={onClose} />

      <div className="shorts-viewer-container">
        {/* Top Header Controls */}
        <div className="shorts-viewer-header">
          <span className="shorts-viewer-index">
            {currentIndex + 1} / {shorts.length}
          </span>
          <div className="shorts-viewer-actions">
            <button
              type="button"
              className="icon-button shorts-control-btn"
              onClick={toggleMute}
              aria-label={isMuted ? "Unmute audio" : "Mute audio"}
            >
              {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
            </button>
            <button
              type="button"
              className="icon-button shorts-control-btn"
              onClick={onClose}
              aria-label="Close shorts viewer"
            >
              <X size={22} />
            </button>
          </div>
        </div>

        {/* Vertical Viewport Frame */}
        <div className="shorts-viewer-frame" onClick={togglePlay}>
          {/* Always keep video element mounted in DOM to guarantee ref and retry reliability */}
          <video
            ref={videoRef}
            src={currentShort.source}
            poster={currentShort.poster}
            className="shorts-video-element"
            style={{ display: hasError ? "none" : "block" }}
            loop
            playsInline
            muted={isMuted}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onWaiting={() => setIsWaiting(true)}
            onPlaying={() => {
              setIsWaiting(false);
              setIsPlaying(true);
            }}
            onTimeUpdate={() => {
              if (videoRef.current) {
                setCurrentTime(videoRef.current.currentTime);
              }
            }}
            onLoadedMetadata={() => {
              if (videoRef.current) {
                setDuration(videoRef.current.duration);
              }
            }}
            onError={() => {
              setHasError(true);
              setIsPlaying(false);
              setIsWaiting(false);
            }}
          />

          {hasError && (
            <div className="shorts-error-state" role="alert">
              <Film size={40} className="error-icon" aria-hidden="true" />
              <h3>Video unavailable</h3>
              <p>Could not load the video for {currentShort.title}.</p>
              <button
                type="button"
                className="retry-btn"
                onClick={handleRetry}
              >
                <RotateCcw size={16} /> Retry
              </button>
            </div>
          )}

          {/* Pause overlay watermark */}
          {!isPlaying && !hasError && (
            <div className="shorts-pause-badge" aria-hidden="true">
              <Play size={44} />
            </div>
          )}

          {/* Bottom metadata and controls */}
          <div
            className="shorts-viewer-meta"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="shorts-meta-badges">
              <span className="shorts-badge">Short</span>
              <span className="shorts-cat-badge">{currentShort.category}</span>
              {fandomTitle && (
                <span className="shorts-fandom-badge">{fandomTitle}</span>
              )}
            </div>

            <h1 className="shorts-viewer-title">{currentShort.title}</h1>
            <p className="shorts-viewer-desc">{currentShort.description}</p>

            {currentShort.tags && currentShort.tags.length > 0 && (
              <div className="card-tags shorts-tags">
                {currentShort.tags.slice(0, 3).map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    className="tag-chip"
                    onClick={(e) => {
                      e.stopPropagation();
                      onTagClick?.(tag);
                    }}
                    aria-label={`Filter by #${tag}`}
                  >
                    #{tag}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Accessible Scrubbing progress slider */}
          <div
            className="shorts-progress-bar"
            role="slider"
            tabIndex={0}
            aria-label="Seek short video"
            aria-valuenow={Math.round(currentTime)}
            aria-valuemin={0}
            aria-valuemax={Math.round(duration || 100)}
            aria-valuetext={`${formatTime(currentTime)} of ${formatTime(
              duration
            )}`}
            onClick={(e) => {
              e.stopPropagation();
              const rect = e.currentTarget.getBoundingClientRect();
              const clickX = e.clientX - rect.left;
              const newTime = (clickX / rect.width) * duration;
              if (videoRef.current && isFinite(newTime)) {
                videoRef.current.currentTime = newTime;
                setCurrentTime(newTime);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowLeft") {
                e.preventDefault();
                e.stopPropagation();
                const nextTime = Math.max(0, currentTime - 5);
                if (videoRef.current) videoRef.current.currentTime = nextTime;
                setCurrentTime(nextTime);
              } else if (e.key === "ArrowRight") {
                e.preventDefault();
                e.stopPropagation();
                const nextTime = Math.min(duration, currentTime + 5);
                if (videoRef.current) videoRef.current.currentTime = nextTime;
                setCurrentTime(nextTime);
              } else if (e.key === "Home") {
                e.preventDefault();
                e.stopPropagation();
                if (videoRef.current) videoRef.current.currentTime = 0;
                setCurrentTime(0);
              } else if (e.key === "End") {
                e.preventDefault();
                e.stopPropagation();
                if (videoRef.current) videoRef.current.currentTime = duration;
                setCurrentTime(duration);
              }
            }}
          >
            <div
              className="shorts-progress-fill"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {/* Vertical Previous / Next Navigation Arrows */}
        <div className="shorts-vertical-nav">
          <button
            type="button"
            className="icon-button shorts-nav-arrow"
            onClick={handlePrev}
            disabled={currentIndex === 0}
            aria-label="Previous short"
          >
            <ChevronUp size={24} />
          </button>
          <button
            type="button"
            className="icon-button shorts-nav-arrow"
            onClick={handleNext}
            disabled={currentIndex === shorts.length - 1}
            aria-label="Next short"
          >
            <ChevronDown size={24} />
          </button>
        </div>
      </div>
    </div>
  );
}
