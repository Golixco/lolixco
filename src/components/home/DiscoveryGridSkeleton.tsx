import { VideoCardSkeleton } from "./VideoCardSkeleton";

export function DiscoveryGridSkeleton({
  count = 8,
  compact = false,
  label = "Loading discovery edits...",
}: {
  count?: number;
  compact?: boolean;
  label?: string;
}) {
  return (
    <div
      className="video-grid"
      role="status"
      aria-busy="true"
      aria-label={label}
    >
      <span className="sr-only">{label}</span>
      {Array.from({ length: count }).map((_, i) => (
        <VideoCardSkeleton key={`skeleton-${i}`} compact={compact} />
      ))}
    </div>
  );
}
