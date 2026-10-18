import { useState } from "react";
import { Film } from "lucide-react";
import type { Edit } from "../../data/edits";
import { CategoryBar } from "./CategoryBar";

export { CategoryBar } from "./CategoryBar";

export interface VideoCardProps {
  edit: Edit;
  onSelect: (e: Edit) => void;
  onTagClick?: (tag: string) => void;
  compact?: boolean;
}

export function VideoCard({
  edit,
  onSelect,
  onTagClick,
  compact = false,
}: VideoCardProps) {
  const [failedPoster, setFailedPoster] = useState<string | null>(null);

  return (
    <article
      className={compact ? "video-card compact" : "video-card"}
      aria-label={edit.title}
    >
      <button
        type="button"
        className="card-watch-trigger"
        onClick={() => onSelect(edit)}
        aria-label={`Watch ${edit.title}`}
      >
        <div className="thumbnail">
          {failedPoster === edit.poster ? (
            <span
              className="thumbnail-fallback"
              role="img"
              aria-label={`Thumbnail unavailable for ${edit.title}`}
            >
              <Film aria-hidden="true" />
              <span>Thumbnail unavailable</span>
            </span>
          ) : (
            <img
              loading="lazy"
              src={edit.poster}
              alt=""
              onError={() => setFailedPoster(edit.poster)}
            />
          )}
          <span className="duration">{edit.duration}</span>
        </div>
        <div className="card-copy">
          <h3>{edit.title}</h3>
          <small>{edit.category} · Sample edit</small>
        </div>
      </button>

      {!compact && edit.tags && edit.tags.length > 0 && (
        <div
          className="card-tags"
          role="group"
          aria-label={`Tags for ${edit.title}`}
        >
          {edit.tags.slice(0, 3).map((tag) => (
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
    </article>
  );
}

export function ContentSection({
  title,
  items,
  onSelect,
  onTagClick,
}: {
  title: string;
  items: Edit[];
  onSelect: (e: Edit) => void;
  onTagClick?: (tag: string) => void;
}) {
  return (
    <section className="content-section">
      <h2>{title}</h2>
      <div className="video-grid">
        {items.map((edit) => (
          <VideoCard
            key={edit.id}
            edit={edit}
            onSelect={onSelect}
            onTagClick={onTagClick}
          />
        ))}
      </div>
    </section>
  );
}

export { VideoCardSkeleton } from "./VideoCardSkeleton";
export { DiscoveryGridSkeleton } from "./DiscoveryGridSkeleton";
