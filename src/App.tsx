import { useEffect, useState } from "react";
import Header from "./components/layout/Header";
import Sidebar from "./components/layout/Sidebar";
import Dialog from "./components/ui/Dialog";
import { CategoryBar, ContentSection, VideoCard, DiscoveryGridSkeleton } from "./components/home/Feed";
import ImmersionBanner from "./components/home/ImmersionBanner";
import VideoPlayer from "./components/video/VideoPlayer";
import { edits, type Edit } from "./data/edits";
import { useDiscoveryFeed } from "./hooks/useDiscoveryFeed";
import { useRecommendations } from "./hooks/useRecommendations";
export default function App() {
  const [expanded, setExpanded] = useState(() => innerWidth >= 1440),
    [mobile, setMobile] = useState(() => innerWidth < 768),
    [drawer, setDrawer] = useState(false),
    [member, setMember] = useState(false),
    [query, setQuery] = useState(""),
    [category, setCategory] = useState("Featured"),
    [selected, setSelected] = useState(edits[0]),
    [active, setActive] = useState("Home"),
    [modal, setModal] = useState("");
  useEffect(() => {
    const mq = matchMedia("(max-width:767px)");
    const change = () => {
      setMobile(mq.matches);
      setDrawer(false);
    };
    mq.addEventListener("change", change);
    return () => mq.removeEventListener("change", change);
  }, []);
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
    if (name === "Home" || name === "Explore") {
      setActive(name);
      setQuery("");
      setCategory("Featured");
    } else if (
      ["Following", "Library", "Creator Studio"].includes(name) &&
      !member
    )
      setModal("Sign In");
    else setModal(name);
  }
  const { edits: filtered, loading } = useDiscoveryFeed(edits, query, category);
  const { edits: upNextEdits } = useRecommendations({
    surface: "up_next",
    currentEditId: selected.id,
    limit: 4,
  });
  const { edits: homeRecommendedEdits } = useRecommendations({
    surface: "home",
    limit: 6,
  });
  const browsing = !!query || category !== "Featured" || active === "Explore";
  const auth = ["Sign In", "Sign Up"].includes(modal);
  const messages: Record<string, string> = {
    Immersion:
      "Immersion Mode is planned. Adaptive ambience, continuous playback, and a personal queue are not implemented in this homepage preview.",
    Shorts:
      "Shorts is planned as a separate portrait-video experience. This preview currently supports the homepage player.",
    Create:
      "Creator uploads are not connected. This is a local member layout preview.",
    Notifications: "No notification service is connected to this preview.",
    Following: "Following creators requires a future account service.",
    Library:
      "Your saved edits will appear here when account storage is connected.",
    "Creator Studio":
      "Creator Studio is planned. Uploads and analytics are outside this homepage prototype.",
    Settings:
      "This preview follows your device’s reduced-motion and reduced-data preferences. Player settings are available inside the video.",
    Help: "Browse and watch without signing in. Select a card to change videos. Focus the player and use K or Space to play, M to mute, F for fullscreen, and arrow keys to seek. Open A–B Loop to choose and repeat a segment.",
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
        setQuery={setQuery}
        member={member}
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
        <CategoryBar value={category} onChange={setCategory} />
        {!browsing ? (
          <>
            <div className="featured-row">
              <VideoPlayer key={selected.id} edit={selected} />
              <section className="up-next">
                <h2>Up Next</h2>
                {upNextEdits.map((e) => (
                  <VideoCard key={e.id} compact edit={e} onSelect={choose} />
                ))}
              </section>
            </div>
            <ContentSection
              title="Recommended Edits"
              items={homeRecommendedEdits}
              onSelect={choose}
            />
            <ImmersionBanner onOpen={() => setModal("Immersion")} />
            <ContentSection
              title="Trending Edits"
              items={edits.slice(11)}
              onSelect={choose}
            />
            <ContentSection
              title="More to Discover"
              items={edits.slice(1, 5)}
              onSelect={choose}
            />
          </>
        ) : (
          <>
            <div className="results-title">
              <h1>
                {query
                  ? `Search results for “${query}”`
                  : active === "Explore" && category === "Featured"
                    ? "Explore edits"
                    : category}
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
                  setCategory("Featured");
                  setActive("Home");
                }}
              />
            ) : (
              <div className="empty">
                <h2>No matching edits</h2>
                <p>Try another title, category, or tag.</p>
                <button
                  onClick={() => {
                    setQuery("");
                    setCategory("Featured");
                  }}
                >
                  Clear filters
                </button>
              </div>
            )}
          </>
        )}
        <footer>
          LOCAL FRONTEND PREVIEW{" "}
          <span>
            Original demo artwork & silent test footage. No real accounts or
            platform statistics.
          </span>
        </footer>
      </main>
      {modal && (
        <Dialog
          title={modal === "Profile" ? "Member preview" : modal}
          onClose={() => setModal("")}
        >
          {auth ? (
            <>
              <p>
                Authentication is not connected. You can preview the member
                layout locally without creating an account or entering personal
                information.
              </p>
              <button
                className="primary"
                onClick={() => {
                  setMember(true);
                  setModal("");
                }}
              >
                Enter member preview
              </button>
              <p className="fine-print">
                Watching and discovery are always available to guests.
              </p>
            </>
          ) : modal === "Profile" ? (
            <>
              <p>
                You are using a local layout preview, not an authenticated
                account.
              </p>
              <button onClick={() => setModal("Settings")}>Settings</button>
              <button
                className="primary"
                onClick={() => {
                  setMember(false);
                  setModal("");
                }}
              >
                Sign Out of preview
              </button>
            </>
          ) : (
            <>
              <p>
                {messages[modal] ||
                  "This feature is planned for a future release."}
              </p>
              <button className="primary" onClick={() => setModal("")}>
                Back to browsing
              </button>
            </>
          )}
        </Dialog>
      )}
    </div>
  );
}
