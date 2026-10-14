import { useState } from "react";
import {
  Star,
  Flame,
  Cat,
  Clapperboard,
  Tv,
  Gamepad2,
  Music,
  Film,
  Sparkles,
} from "lucide-react";
import { categoriesList, type Edit } from "../../data/edits";
const icons = [
  Star,
  Flame,
  Cat,
  Clapperboard,
  Tv,
  Gamepad2,
  Music,
  Film,
  Sparkles,
];
export function CategoryBar({
  value,
  onChange,
}: {
  value: string;
  onChange: (s: string) => void;
}) {
  return (
    <nav className="categories" aria-label="Video categories">
      {categoriesList.map((name, i) => {
        const Icon = icons[i];
        return (
          <button
            key={name}
            className={value === name ? "primary" : ""}
            aria-pressed={value === name}
            onClick={() => onChange(name)}
          >
            <Icon size={16} />
            {name}
          </button>
        );
      })}
    </nav>
  );
}
export function VideoCard({
  edit,
  onSelect,
  compact = false,
}: {
  edit: Edit;
  onSelect: (e: Edit) => void;
  compact?: boolean;
}) {
  const [failedPoster, setFailedPoster] = useState<string | null>(null);
  return (
    <button
      className={`video-card ${compact ? "compact" : ""}`}
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
        <p>{edit.creator}</p>
        <small>{edit.category} · Sample edit</small>
      </div>
    </button>
  );
}
export function ContentSection({
  title,
  items,
  onSelect,
}: {
  title: string;
  items: Edit[];
  onSelect: (e: Edit) => void;
}) {
  return (
    <section className="content-section">
      <h2>{title}</h2>
      <div className="video-grid">
        {items.map((edit) => (
          <VideoCard key={edit.id} edit={edit} onSelect={onSelect} />
        ))}
      </div>
    </section>
  );
}
