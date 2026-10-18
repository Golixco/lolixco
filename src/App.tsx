import { useEffect, useState, useCallback, useMemo } from "react";
import Header from "./components/layout/Header";
import Sidebar from "./components/layout/Sidebar";
import Dialog from "./components/ui/Dialog";
import {
  CategoryBar,
  ContentSection,
  VideoCard,
  DiscoveryGridSkeleton,
} from "./components/home/Feed";
import ImmersionBanner from "./components/home/ImmersionBanner";
import VideoPlayer from "./components/video/VideoPlayer";
import { edits, type Edit } from "./data/edits";
import {
  normalizeCategoryCase,
  isFandomCompatibleWithCategory,
  getFandomById,
} from "./data/fandoms";
import {
  composeHomeFeed,
  splitMixedResults,
  isShort,
  isVideo,
} from "./data/feedComposition";
import { ShortsShelf } from "./components/shorts/ShortsShelf";
import { ShortsViewer } from "./components/shorts/ShortsViewer";
import { useDiscoveryFeed } from "./hooks/useDiscoveryFeed";
import { useRecommendations } from "./hooks/useRecommendations";
import { Clapperboard } from "lucide-react";

/**
 * Validates and safely parses short ID from URL query parameters.
 * Rejects negative, fractional, unsafe, unknown, or non-short IDs.
 * Preserves ID 0 as valid.
 */
export function parseAndValidateShortId(
  rawShort: string | null,
  catalog: Edit[]
): number | null {
  if (rawShort === null) return null;
  const trimmed = rawShort.trim();
  // Strictly reject negative, fractional, hex/scientific strings, or non-digits
  if (!/^\d+$/.test(trimmed)) return null;

  const num = Number(trimmed);
  if (!Number.isSafeInteger(num)) return null;

  // Must exist in catalog and be a Short format
  const found = catalog.find((e) => e.id === num && isShort(e));
  return found ? num : null;
}

export function parseUrlParams(catalog: Edit[] = edits): {
  category: string;
  fandom: string;
  query: string;
  view: string;
  shortId: number | null;
} {
  if (typeof window === "undefined") {
    return { category: "All", fandom: "", query: "", view: "Home", shortId: null };
  }
  const params = new URLSearchParams(window.location.search);
  const rawCat = params.get("category") || params.get("cat") || "";
  const rawFandom = params.get("fandom") || "";
  const rawQ = params.get("q") || params.get("query") || "";
  const rawView = params.get("view") || "";
  const rawShort = params.get("short");

  let normCat = normalizeCategoryCase(rawCat);
  const fandomMeta = rawFandom ? getFandomById(rawFandom.trim()) : undefined;

  let normFandom = "";
  if (fandomMeta) {
    if (!normCat) {
      // Direct URL ?fandom=valorant without category: resolve to primary category
      normCat = fandomMeta.categories[0] || "All";
      normFandom = fandomMeta.id;
    } else if (normCat === "All") {
      // Top-level 'All' does not allow active fandom filter (avoids hidden filter states)
      normFandom = "";
    } else if (isFandomCompatibleWithCategory(fandomMeta.id, normCat)) {
      normFandom = fandomMeta.id;
    } else {
      // Incompatible fandom with specified category: clear fandom
      normFandom = "";
    }
  }

  if (!normCat) {
    normCat = "All";
  }

  let normView = "Home";
  if (rawView.toLowerCase() === "explore") {
    normView = "Explore";
  } else if (rawView.toLowerCase() === "shorts") {
    normView = "Shorts";
  }

  const shortId = parseAndValidateShortId(rawShort, catalog);

  return {
    category: normCat,
    fandom: normFandom,
    query: rawQ.trim(),
    view: normView,
    shortId,
  };
}

export function syncUrl(
  cat: string,
  fan: string,
  q: string,
  view: string,
  shortId: number | null | undefined,
  usePush: boolean
) {
  if (typeof window === "undefined") return;

  const params = new URLSearchParams();
  if (view && view.toLowerCase() === "explore") {
    params.set("view", "explore");
  } else if (view && view.toLowerCase() === "shorts") {
    params.set("view", "shorts");
  }
  if (typeof shortId === "number") {
    params.set("short", String(shortId));
  }
  if (cat && cat !== "All" && cat !== "Featured") {
    params.set("category", cat);
  }
  if (fan && fan !== "all") {
    params.set("fandom", fan);
  }
  if (q && q.trim()) {
    params.set("q", q.trim());
  }

  const newSearch = params.toString() ? `?${params.toString()}` : "";
  const currentSearch = window.location.search;

  if (newSearch === currentSearch) return;

  const targetUrl = window.location.pathname + newSearch + window.location.hash;
  if (usePush) {
    window.history.pushState(null, "", targetUrl);
  } else {
    window.history.replaceState(null, "", targetUrl);
  }
}

export default function App() {
  const [expanded, setExpanded] = useState(() => innerWidth >= 1440);
  const [mobile, setMobile] = useState(() => innerWidth < 768);
  const [drawer, setDrawer] = useState(false);

  // Curated Shorts in the catalog
  const catalogShorts = useMemo(() => edits.filter((e) => isShort(e)), []);

  // Guarantee that Shorts-only catalogs never place a Short into the landscape player
  const initialLandscapeVideo = useMemo(
    () => edits.find((e) => isVideo(e)) || null,
    []
  );

  // Initialize navigation state from URL query parameters
  const initialParams = parseUrlParams(edits);
  const [query, setQuery] = useState(initialParams.query);
  const [category, setCategory] = useState(initialParams.category);
  const [fandom, setFandom] = useState(initialParams.fandom);
  const [selected, setSelected] = useState<Edit | null>(initialLandscapeVideo);
  const [active, setActive] = useState(initialParams.view);
  const [activeShort, setActiveShort] = useState<Edit | null>(() => {
    if (typeof initialParams.shortId === "number") {
      return (
        edits.find((e) => e.id === initialParams.shortId && isShort(e)) || null
      );
    }
    return null;
  });
  const [modal, setModal] = useState("");

  useEffect(() => {
    const mq = matchMedia("(max-width:767px)");
    const change = () => {
      setMobile(mq.matches);
      setDrawer(false);
    };
    mq.addEventListener("change", change);
    return () => mq.removeEventListener("change", change);
  }, []);

  // Normalize initial URL if it contains direct fandom without category or invalid short IDs
  useEffect(() => {
    const current = parseUrlParams(edits);
    syncUrl(
      current.category,
      current.fandom,
      current.query,
      current.view,
      current.shortId,
      false
    );
  }, []);

  // Synchronize browser history navigation (Back / Forward)
  useEffect(() => {
    function handlePopState() {
      const {
        category: c,
        fandom: f,
        query: q,
        view: v,
        shortId: sId,
      } = parseUrlParams(edits);
      setCategory(c);
      setFandom(f);
      setQuery(q);
      setActive(v);
      if (typeof sId === "number") {
        const matchingShort =
          edits.find((e) => e.id === sId && isShort(e)) || null;
        setActiveShort(matchingShort);
      } else {
        setActiveShort(null);
      }
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const handleCategoryChange = useCallback(
    (newCat: string) => {
      const normCat = normalizeCategoryCase(newCat) || "All";
      const newFandom = isFandomCompatibleWithCategory(fandom, normCat)
        ? fandom
        : "";
      setCategory(normCat);
      setFandom(newFandom);

      // On dedicated Shorts page with 0 shorts, user action navigates to Explore
      const nextView =
        active === "Shorts" && catalogShorts.length === 0 ? "Explore" : active;
      if (nextView !== active) {
        setActive(nextView);
      }

      syncUrl(normCat, newFandom, query, nextView, activeShort?.id, true);
    },
    [active, activeShort?.id, catalogShorts.length, fandom, query]
  );

  const handleFandomChange = useCallback(
    (newFandomId: string) => {
      const cleanFandom =
        newFandomId === "all" ? "" : newFandomId.trim().toLowerCase();
      setFandom(cleanFandom);

      // On dedicated Shorts page with 0 shorts, user action navigates to Explore
      const nextView =
        active === "Shorts" && catalogShorts.length === 0 ? "Explore" : active;
      if (nextView !== active) {
        setActive(nextView);
      }

      syncUrl(category, cleanFandom, query, nextView, activeShort?.id, true);
    },
    [active, activeShort?.id, category, catalogShorts.length, query]
  );

  const handleQueryChange = useCallback(
    (newQuery: string) => {
      setQuery(newQuery);

      // On dedicated Shorts page with 0 shorts, searching navigates to Explore
      const nextView =
        active === "Shorts" && catalogShorts.length === 0 && newQuery.trim()
          ? "Explore"
          : active;
      if (nextView !== active) {
        setActive(nextView);
      }

      syncUrl(category, fandom, newQuery, nextView, activeShort?.id, false);
    },
    [active, activeShort?.id, category, catalogShorts.length, fandom]
  );

  const handleTagClick = useCallback(
    (tag: string) => {
      const tagQuery = "#" + tag.toLowerCase().trim();
      setQuery(tagQuery);
      syncUrl(category, fandom, tagQuery, active, activeShort?.id, true);
    },
    [active, activeShort?.id, category, fandom]
  );

  // Atomic hashtag navigation from within Shorts viewer
  const handleShortsViewerTagClick = useCallback(
    (tag: string) => {
      // 1. Close the viewer
      setActiveShort(null);
      // 2. Prepare exact hashtag query: #tag
      const tagQuery = "#" + tag.toLowerCase().trim();
      setQuery(tagQuery);
      // 3. Reset filters to avoid incompatible category/fandom
      setCategory("All");
      setFandom("");
      // 4. Navigate to Explore surface
      setActive("Explore");
      // 5. Update URL clearing short= and syncing discovery query
      syncUrl("All", "", tagQuery, "Explore", null, true);
    },
    []
  );

  const handleClearFilters = useCallback(() => {
    setCategory("All");
    setFandom("");
    setQuery("");
    syncUrl("All", "", "", active, null, true);
  }, [active]);

  const handleClearFandom = useCallback(() => {
    setFandom("");
    syncUrl(category, "", query, active, activeShort?.id, true);
  }, [active, activeShort?.id, category, query]);

  const handleSelectShort = useCallback(
    (short: Edit) => {
      setActiveShort(short);
      syncUrl(category, fandom, query, active, short.id, true);
    },
    [active, category, fandom, query]
  );

  // Synchronize Next / Previous inside ShortsViewer with URL and activeShort
  const handleShortChange = useCallback(
    (newShort: Edit) => {
      setActiveShort(newShort);
      syncUrl(category, fandom, query, active, newShort.id, true);
    },
    [active, category, fandom, query]
  );

  const handleCloseShort = useCallback(() => {
    setActiveShort(null);
    const nextView =
      active === "Shorts" && catalogShorts.length === 0 ? "Home" : active;
    if (active === "Shorts" && catalogShorts.length === 0) {
      setActive("Home");
    }
    // Use replaceState (usePush: false) on close so Back does not reopen viewer
    syncUrl(category, fandom, query, nextView, null, false);
  }, [active, category, catalogShorts.length, fandom, query]);

  function choose(edit: Edit) {
    if (!isVideo(edit)) return;
    setSelected(edit);
    window.scrollTo({
      top: 0,
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
  }

  function navigate(name: string) {
    setDrawer(false);
    if (name === "Home") {
      setActive("Home");
      setActiveShort(null);
      setQuery("");
      setCategory("All");
      setFandom("");
      syncUrl("All", "", "", "Home", null, true);
    } else if (name === "Explore") {
      setActive("Explore");
      setActiveShort(null);
      setQuery("");
      setCategory("All");
      setFandom("");
      syncUrl("All", "", "", "Explore", null, true);
    } else if (name === "Shorts") {
      setActive("Shorts");
      setQuery("");
      setCategory("All");
      setFandom("");
      if (catalogShorts.length > 0) {
        const firstShort = catalogShorts[0];
        setActiveShort(firstShort);
        syncUrl("All", "", "", "Shorts", firstShort.id, true);
      } else {
        setActiveShort(null);
        syncUrl("All", "", "", "Shorts", null, true);
      }
    } else {
      setModal(name);
    }
  }

  const { edits: filtered, loading } = useDiscoveryFeed(
    edits,
    query,
    category,
    fandom
  );

  const { edits: upNextEdits } = useRecommendations({
    surface: "up_next",
    currentEditId: selected?.id ?? edits[0]?.id ?? 0,
    limit: 4,
  });

  const { edits: homeRecommendedEdits } = useRecommendations({
    surface: "home",
    limit: 6,
  });

  const homeSections = useMemo(
    () =>
      composeHomeFeed({
        recommendedVideos: homeRecommendedEdits,
        catalog: edits,
        currentEditId: selected?.id ?? edits[0]?.id ?? 0,
      }),
    [homeRecommendedEdits, selected?.id]
  );

  const { videos: searchVideos, shorts: searchShorts } = useMemo(
    () => splitMixedResults(filtered),
    [filtered]
  );

  const browsing =
    !!query ||
    (category !== "All" && category !== "Featured") ||
    !!fandom ||
    active === "Explore";

  const messages: Record<string, string> = {
    Immersion:
      "Immersion Mode is planned. Adaptive ambience, continuous playback, and personal playback queue are not implemented in this homepage preview.",
    Shorts:
      "Curated Shorts is planned as a dedicated portrait-video experience with a vertical player. This preview currently supports standard landscape edits.",
    "Creator Studio":
      "Creator Studio is planned for temporary in-browser AI video analysis. No uploads, login, or public analytics are active in this demo.",
    Settings:
      "This preview follows your device's reduced-motion and reduced-data preferences. Player controls and A–B loop settings are available inside the video.",
    Help:
      "Browse and watch freely without creating an account. Select a card to play. Focus the player and use K or Space to play/pause, M to mute, F for fullscreen, and arrow keys to seek. Use A–B Loop to isolate and repeat any segment.",
  };

  return (
    <div className={`app ${expanded ? "expanded" : "collapsed"}`}>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <Header
        expanded={mobile ? drawer : expanded}
        toggle={() => (mobile ? setDrawer(!drawer) : setExpanded(!expanded))}
        query={query}
        setQuery={handleQueryChange}
        open={setModal}
        onHome={() => navigate("Home")}
      />
      {!mobile && (
        <aside id="sidebar">
          <Sidebar active={active} onSelect={navigate} />
        </aside>
      )}
      {mobile && drawer && (
        <Dialog title="Navigation" onClose={() => setDrawer(false)}>
          <div id="sidebar" className="mobile-nav">
            <Sidebar active={active} onSelect={navigate} />
          </div>
        </Dialog>
      )}
      <main id="main">
        <CategoryBar
          category={category}
          onSelectCategory={handleCategoryChange}
          fandomId={fandom}
          onSelectFandom={handleFandomChange}
        />
        {active === "Shorts" ? (
          catalogShorts.length === 0 ? (
            <div
              className="shorts-empty-state"
              role="region"
              aria-label="Curated Shorts"
            >
              <div className="shorts-empty-icon-wrap">
                <Clapperboard
                  size={44}
                  className="shorts-empty-icon"
                  aria-hidden="true"
                />
              </div>
              <h1>Curated Shorts are coming soon</h1>
              <p>
                We are currently curating genuine vertical edits across our
                fandoms. In the meantime, explore our cinematic landscape
                edits.
              </p>
              <button
                type="button"
                className="return-browsing-btn"
                onClick={() => navigate("Home")}
              >
                Return to browsing
              </button>
            </div>
          ) : (
            <div className="shorts-catalog-view">
              <div className="results-title">
                <h1>
                  {query
                    ? `Shorts matching “${query}”`
                    : fandom
                      ? `${getFandomById(fandom)?.title || fandom} Shorts`
                      : category !== "All"
                        ? `${category} Shorts`
                        : "Curated Shorts"}
                </h1>
                <span>{searchShorts.length} curated shorts</span>
              </div>
              {searchShorts.length > 0 ? (
                <ShortsShelf
                  title={category !== "All" ? `${category} Shorts` : "Curated Shorts"}
                  items={searchShorts}
                  onSelect={handleSelectShort}
                  onTagClick={handleTagClick}
                />
              ) : (
                <div className="empty">
                  <h2>No matching shorts</h2>
                  <p>
                    No shorts match your current category, fandom, or search
                    filters.
                  </p>
                  <button type="button" onClick={handleClearFilters}>
                    Clear filters
                  </button>
                </div>
              )}
            </div>
          )
        ) : !browsing ? (
          <>
            {selected && isVideo(selected) && (
              <div className="featured-row">
                <VideoPlayer
                  key={selected.id}
                  edit={selected}
                  isOverlayActive={!!activeShort}
                />
                <section className="up-next">
                  <h2>Up Next</h2>
                  {upNextEdits.filter(isVideo).map((e) => (
                    <VideoCard
                      key={e.id}
                      compact
                      edit={e}
                      onSelect={choose}
                      onSelectShort={handleSelectShort}
                      onTagClick={handleTagClick}
                    />
                  ))}
                </section>
              </div>
            )}

            {homeSections.map((section, idx) => {
              if (section.type === "video_row") {
                return (
                  <div key={section.id}>
                    <ContentSection
                      title={section.title}
                      items={section.items}
                      onSelect={choose}
                      onSelectShort={handleSelectShort}
                      onTagClick={handleTagClick}
                    />
                    {idx === 0 && (
                      <ImmersionBanner onOpen={() => setModal("Immersion")} />
                    )}
                  </div>
                );
              }
              if (section.type === "shorts_shelf") {
                return (
                  <ShortsShelf
                    key={section.id}
                    title={section.title}
                    items={section.items}
                    onSelect={handleSelectShort}
                    onTagClick={handleTagClick}
                  />
                );
              }
              return null;
            })}
          </>
        ) : (
          <>
            <div className="results-title">
              <h1>
                {query
                  ? `Search results for “${query}”`
                  : fandom
                    ? `${getFandomById(fandom)?.title || fandom} edits`
                    : active === "Explore" && category === "All"
                      ? "Explore edits"
                      : `${category} edits`}
              </h1>
              <span>{filtered.length} sample edits</span>
            </div>
            {loading ? (
              <DiscoveryGridSkeleton
                count={8}
                label="Loading discovery edits..."
              />
            ) : filtered.length ? (
              <>
                {searchShorts.length > 0 && (
                  <ShortsShelf
                    title={query ? "Matching Shorts" : "Curated Shorts"}
                    items={searchShorts}
                    onSelect={handleSelectShort}
                    onTagClick={handleTagClick}
                  />
                )}
                {searchVideos.length > 0 && (
                  <ContentSection
                    title={
                      searchShorts.length > 0 ? "Landscape Edits" : "Discover"
                    }
                    items={searchVideos}
                    onSelect={(e) => {
                      choose(e);
                      setQuery("");
                      setCategory("All");
                      setFandom("");
                      setActive("Home");
                      syncUrl("All", "", "", "Home", null, true);
                    }}
                    onSelectShort={handleSelectShort}
                    onTagClick={handleTagClick}
                  />
                )}
              </>
            ) : (
              <div className="empty">
                {fandom ? (
                  <>
                    <h2>
                      No edits found for{" "}
                      {getFandomById(fandom)?.title || fandom}
                    </h2>
                    <p>
                      Our demo catalog does not yet include edits for this
                      fandom. You can browse other {category} edits or clear
                      the fandom filter.
                    </p>
                    <button type="button" onClick={handleClearFandom}>
                      Clear fandom filter
                    </button>
                  </>
                ) : category === "Multifandom" ? (
                  <>
                    <h2>No multifandom edits yet</h2>
                    <p>
                      Multifandom crossover edits are planned for our curated
                      library.
                    </p>
                    <button type="button" onClick={handleClearFilters}>
                      Browse all edits
                    </button>
                  </>
                ) : (
                  <>
                    <h2>No matching edits</h2>
                    <p>Try another title, category, or tag.</p>
                    <button type="button" onClick={handleClearFilters}>
                      Clear filters
                    </button>
                  </>
                )}
              </div>
            )}
          </>
        )}
        <footer>
          LOCAL FRONTEND PREVIEW{" "}
          <span>
            Original demo artwork & silent test footage. Account-free browsing.
            No personal data or platform statistics.
          </span>
        </footer>
      </main>
      {modal && (
        <Dialog title={modal} onClose={() => setModal("")}>
          <p>
            {messages[modal] || "This feature is planned for a future release."}
          </p>
          <button
            type="button"
            className="primary"
            onClick={() => setModal("")}
          >
            Back to browsing
          </button>
        </Dialog>
      )}
      {activeShort && (
        <ShortsViewer
          shorts={
            catalogShorts.some((s) => s.id === activeShort.id)
              ? catalogShorts
              : [activeShort, ...catalogShorts]
          }
          initialShortId={activeShort.id}
          activeShortId={activeShort.id}
          onShortChange={handleShortChange}
          onClose={handleCloseShort}
          onTagClick={handleShortsViewerTagClick}
        />
      )}
    </div>
  );
}
