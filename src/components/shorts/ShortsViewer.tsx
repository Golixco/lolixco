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
  onClose: () => void;
  onTagClick?: (tag: string) => void;
}

export function ShortsViewer({
  shorts,
  initialShortId,
  onClose,
  onTagClick,
}: ShortsViewerProps) {
  const initialIndex = Math.max(
    0,
    shorts.findIndex((s) => s.id === initialShortId)
  );

  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [hasError, setHasError] = useState(false);
  const [touchStartY, setTouchStartY] = useState<number | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const viewerRef = useRef<HTMLDivElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);

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

  // Update currentIndex if initialShortId changes
  useEffect(() => {
    if (typeof initialShortId === "number") {
      const idx = shorts.findIndex((s) => s.id === initialShortId);
      if (idx !== -1) {
        setCurrentIndex(idx);
      }
    }
  }, [initialShortId, shorts]);

  // Handle video playback when currentIndex changes
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    setHasError(false);
    setCurrentTime(0);

    const playPromise = video.play();
    if (playPromise !== undefined) {
      playPromise
        .then(() => setIsPlaying(true))
        .catch(() => {
          // Autoplay blocked by browser policy; pause and await user gesture
          setIsPlaying(false);
        });
    }
  }, [currentIndex]);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    if (video.paused) {
      video.play().then(() => setIsPlaying(true)).catch(() => {});
    } else {
      video.pause();
      setIsPlaying(false);
    }
  }, []);

  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    video.muted = !video.muted;
    setIsMuted(video.muted);
  }, []);

  const handleNext = useCallback(() => {
    if (currentIndex < shorts.length - 1) {
      setCurrentIndex((prev) => prev + 1);
    }
  }, [currentIndex, shorts.length]);

  const handlePrev = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1);
    }
  }, [currentIndex]);

  // Keyboard navigation & accessibility controls
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Do not intercept if user is typing in an input
      const activeEl = document.activeElement;
      if (
        activeEl instanceof HTMLInputElement ||
        activeEl instanceof HTMLTextAreaElement ||
        (activeEl instanceof HTMLElement && activeEl.isContentEditable)
      ) {
        return;
      }

      switch (e.key) {
        case "Escape":
          e.preventDefault();
          onClose();
          break;
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

  // Touch swipe support for vertical mobile navigation
  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStartY(e.touches[0].clientY);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartY === null) return;
    const touchEndY = e.changedTouches[0].clientY;
    const diff = touchStartY - touchEndY;

    // Threshold of 50px for swipe gesture
    if (diff > 50) {
      handleNext(); // Swiped up -> Next short
    } else if (diff < -50) {
      handlePrev(); // Swiped down -> Previous short
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
          {hasError ? (
            <div className="shorts-error-state" role="alert">
              <Film size={40} className="error-icon" aria-hidden="true" />
              <h3>Video unavailable</h3>
              <p>Could not load the video for {currentShort.title}.</p>
              <button
                type="button"
                className="retry-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  setHasError(false);
                  videoRef.current?.load();
                }}
              >
                <RotateCcw size={16} /> Retry
              </button>
            </div>
          ) : (
            <video
              ref={videoRef}
              src={currentShort.source}
              poster={currentShort.poster}
              className="shorts-video-element"
              loop
              playsInline
              muted={isMuted}
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
              onError={() => setHasError(true)}
            />
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
                    onClick={() => {
                      onClose();
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

          {/* Scrubbing progress bar */}
          <div
            className="shorts-progress-bar"
            role="progressbar"
            aria-valuenow={Math.round(progressPercent)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Short progress"
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
