import { useEffect, useState, useCallback } from "react";
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
import { useDiscoveryFeed } from "./hooks/useDiscoveryFeed";
import { useRecommendations } from "./hooks/useRecommendations";

function parseUrlParams(): {
  category: string;
  fandom: string;
  query: string;
  view: string;
} {
  if (typeof window === "undefined") {
    return { category: "All", fandom: "", query: "", view: "Home" };
  }
  const params = new URLSearchParams(window.location.search);
  const rawCat = params.get("category") || params.get("cat") || "";
  const rawFandom = params.get("fandom") || "";
  const rawQ = params.get("q") || params.get("query") || "";
  const rawView = params.get("view") || "";

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

  const normView = rawView.toLowerCase() === "explore" ? "Explore" : "Home";

  return {
    category: normCat,
    fandom: normFandom,
    query: rawQ.trim(),
    view: normView,
  };
}

function syncUrl(
  cat: string,
  fan: string,
  q: string,
  view: string,
  usePush: boolean
) {
  if (typeof window === "undefined") return;

  const params = new URLSearchParams();
  if (view && view.toLowerCase() === "explore") {
    params.set("view", "explore");
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

  // Initialize navigation state from URL query parameters
  const initialParams = parseUrlParams();
  const [query, setQuery] = useState(initialParams.query);
  const [category, setCategory] = useState(initialParams.category);
  const [fandom, setFandom] = useState(initialParams.fandom);
  const [selected, setSelected] = useState(edits[0]);
  const [active, setActive] = useState(initialParams.view);
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

  // Normalize initial URL if it contains direct fandom without category or incompatible params
  useEffect(() => {
    const current = parseUrlParams();
    syncUrl(current.category, current.fandom, current.query, current.view, false);
  }, []);

  // Synchronize browser history navigation (Back / Forward)
  useEffect(() => {
    function handlePopState() {
      const { category: c, fandom: f, query: q, view: v } = parseUrlParams();
      setCategory(c);
      setFandom(f);
      setQuery(q);
      setActive(v);
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
      syncUrl(normCat, newFandom, query, active, true);
    },
    [active, fandom, query]
  );

  const handleFandomChange = useCallback(
    (newFandomId: string) => {
      const cleanFandom =
        newFandomId === "all" ? "" : newFandomId.trim().toLowerCase();
      setFandom(cleanFandom);
      syncUrl(category, cleanFandom, query, active, true);
    },
    [active, category, query]
  );

  const handleQueryChange = useCallback(
    (newQuery: string) => {
      setQuery(newQuery);
      syncUrl(category, fandom, newQuery, active, false);
    },
    [active, category, fandom]
  );

  const handleTagClick = useCallback(
    (tag: string) => {
      const tagQuery = "#" + tag.toLowerCase().trim();
      setQuery(tagQuery);
      syncUrl(category, fandom, tagQuery, active, true);
    },
    [active, category, fandom]
  );

  const handleClearFilters = useCallback(() => {
    setCategory("All");
    setFandom("");
    setQuery("");
    syncUrl("All", "", "", active, true);
  }, [active]);

  const handleClearFandom = useCallback(() => {
    setFandom("");
    syncUrl(category, "", query, active, true);
  }, [active, category, query]);

  function choose(edit: Edit) {
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
      setQuery("");
      setCategory("All");
      setFandom("");
      syncUrl("All", "", "", "Home", true);
    } else if (name === "Explore") {
      setActive("Explore");
      setQuery("");
      setCategory("All");
      setFandom("");
      syncUrl("All", "", "", "Explore", true);
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
    currentEditId: selected.id,
    limit: 4,
  });

  const { edits: homeRecommendedEdits } = useRecommendations({
    surface: "home",
    limit: 6,
  });

  const browsing =
    !!query ||
    (category !== "All" && category !== "Featured") ||
    !!fandom ||
    active === "Explore";

  const messages: Record<string, string> = {
    Immersion:
      "Immersion Mode is planned. Adaptive ambience, continuous playback, and personal playback queue are not implemented in this homepage preview.",
    Shorts:
      "Shorts is planned as a dedicated portrait-video experience with a vertical player. This preview currently supports standard landscape edits.",
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
        {!browsing ? (
          <>
            <div className="featured-row">
              <VideoPlayer key={selected.id} edit={selected} />
              <section className="up-next">
                <h2>Up Next</h2>
                {upNextEdits.map((e) => (
                  <VideoCard
                    key={e.id}
                    compact
                    edit={e}
                    onSelect={choose}
                    onTagClick={handleTagClick}
                  />
                ))}
              </section>
            </div>
            <ContentSection
              title="Recommended Edits"
              items={homeRecommendedEdits}
              onSelect={choose}
              onTagClick={handleTagClick}
            />
            <ImmersionBanner onOpen={() => setModal("Immersion")} />
            <ContentSection
              title="Curated Demo Selection"
              items={edits.slice(11)}
              onSelect={choose}
              onTagClick={handleTagClick}
            />
            <ContentSection
              title="More to Discover"
              items={edits.slice(1, 5)}
              onSelect={choose}
              onTagClick={handleTagClick}
            />
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
              <ContentSection
                title="Discover"
                items={filtered}
                onSelect={(e) => {
                  choose(e);
                  setQuery("");
                  setCategory("All");
                  setFandom("");
                  setActive("Home");
                  syncUrl("All", "", "", "Home", true);
                }}
                onTagClick={handleTagClick}
              />
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
    </div>
  );
}
