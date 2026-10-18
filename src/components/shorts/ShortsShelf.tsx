import { useRef, useState, useEffect, useCallback } from "react";
import { ChevronLeft, ChevronRight, Clapperboard } from "lucide-react";
import type { Edit } from "../../data/edits";
import { ShortsCard } from "./ShortsCard";

export interface ShortsShelfProps {
  title?: string;
  items: Edit[];
  onSelect: (short: Edit) => void;
  onTagClick?: (tag: string) => void;
}

export function ShortsShelf({
  title = "Curated Shorts",
  items,
  onSelect,
  onTagClick,
}: ShortsShelfProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) {
      setCanScrollLeft(false);
      setCanScrollRight(false);
      return;
    }
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setCanScrollLeft(scrollLeft > 2);
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 2);
  }, []);

  useEffect(() => {
    if (!items || items.length === 0) {
      setCanScrollLeft(false);
      setCanScrollRight(false);
      return;
    }

    checkScroll();
    const el = scrollRef.current;
    if (!el) return;

    el.addEventListener("scroll", checkScroll, { passive: true });
    window.addEventListener("resize", checkScroll);

    return () => {
      el.removeEventListener("scroll", checkScroll);
      window.removeEventListener("resize", checkScroll);
    };
  }, [checkScroll, items?.length]);

  const scrollByAmount = useCallback((offset: number) => {
    const el = scrollRef.current;
    if (!el) return;
    const prefersReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    el.scrollBy({
      left: offset,
      behavior: prefersReducedMotion ? "instant" : "smooth",
    });
  }, []);

  // Omit rendering entirely when items are empty
  if (!items || items.length === 0) {
    return null;
  }

  return (
    <section className="shorts-shelf" aria-label={title}>
      <div className="shorts-shelf-header">
        <div className="shorts-shelf-title">
          <Clapperboard size={20} className="shorts-icon" aria-hidden="true" />
          <h2>{title}</h2>
        </div>
        <div className="shorts-shelf-controls">
          <button
            type="button"
            className="icon-button shelf-arrow"
            onClick={() => scrollByAmount(-320)}
            disabled={!canScrollLeft}
            aria-label="Scroll shorts left"
          >
            <ChevronLeft size={20} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="icon-button shelf-arrow"
            onClick={() => scrollByAmount(320)}
            disabled={!canScrollRight}
            aria-label="Scroll shorts right"
          >
            <ChevronRight size={20} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="shorts-shelf-track"
        tabIndex={0}
        role="region"
        aria-label={`${title} carousel`}
      >
        {items.map((short) => (
          <div key={short.id} className="shorts-shelf-item">
            <ShortsCard
              short={short}
              onSelect={onSelect}
              onTagClick={onTagClick}
            />
          </div>
        ))}
      </div>
    </section>
  );
}
