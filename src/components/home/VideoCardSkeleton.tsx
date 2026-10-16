export function VideoCardSkeleton({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={`video-card skeleton-card ${compact ? "compact" : ""}`}
      aria-hidden="true"
      tabIndex={-1}
    >
      <div className="thumbnail skeleton-thumb">
        <div className="skeleton-shimmer" />
      </div>
      <div className="card-copy skeleton-copy">
        <div className="skeleton-line skeleton-title" />
        <div className="skeleton-line skeleton-creator" />
        <div className="skeleton-line skeleton-tag" />
      </div>
    </div>
  );
}
