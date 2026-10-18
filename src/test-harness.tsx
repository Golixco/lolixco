import { useState, useCallback, useEffect } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/rajdhani/600.css";
import "@fontsource/rajdhani/700.css";
import "./styles/index.css";
import type { Edit } from "./data/edits";
import { ShortsViewer } from "./components/shorts/ShortsViewer";
import { ShortsShelf } from "./components/shorts/ShortsShelf";

// Strictly development-isolated test fixture with multiple Shorts
export const TEST_FIXTURE_SHORTS: Edit[] = [
  {
    id: 100,
    title: "Shadow Strike",
    creator: "Internal Studio Test",
    description: "High speed phonk sync vertical edit with aggressive kinetic typography.",
    category: "Gaming",
    fandomIds: ["valorant"],
    tags: ["valorant", "phonk", "sniper"],
    poster: "/media/art-0.svg",
    source: "/media/motion-study.webm",
    duration: "0:25",
    trending: true,
    format: "short",
  },
  {
    id: 101,
    title: "Domain Expansion",
    creator: "Internal Studio Test",
    description: "Gojo vs Sukuna vertical clip isolated from Jujutsu Kaisen.",
    category: "Anime",
    fandomIds: ["jujutsu-kaisen"],
    tags: ["anime", "gojo", "jjk"],
    poster: "/media/art-1.svg",
    source: "/media/motion-study.webm",
    duration: "0:30",
    trending: false,
    format: "short",
  },
  {
    id: 0,
    title: "Zero Origin",
    creator: "Internal Studio Test",
    description: "Short with numeric ID 0 verification test fixture.",
    category: "Movies",
    fandomIds: ["spider-man"],
    tags: ["movies", "spiderman"],
    poster: "/media/art-2.svg",
    source: "/media/motion-study.webm",
    duration: "0:15",
    trending: false,
    format: "short",
  },
  {
    id: 102,
    title: "Corrupted Media Short",
    creator: "Internal Studio Test",
    description: "Short with an invalid source to test error & retry lifecycle recovery.",
    category: "Gaming",
    fandomIds: ["valorant"],
    tags: ["valorant", "glitch"],
    poster: "/media/art-3.svg",
    source: "/test-error-assets/missing-video.webm",
    duration: "0:20",
    trending: false,
    format: "short",
  },
];

function TestHarness() {
  const [activeShortId, setActiveShortId] = useState<number | null>(() => {
    const params = new URLSearchParams(window.location.search);
    const s = params.get("short");
    return s !== null && !isNaN(Number(s)) ? Number(s) : null;
  });
  const [logs, setLogs] = useState<string[]>([]);
  const [shelfItems, setShelfItems] = useState<Edit[]>(TEST_FIXTURE_SHORTS);

  const addLog = useCallback((msg: string) => {
    setLogs((prev) => [`[${new Date().toISOString().slice(11, 19)}] ${msg}`, ...prev.slice(0, 19)]);
  }, []);

  const syncTestUrl = (id: number | null) => {
    const params = new URLSearchParams(window.location.search);
    if (typeof id === "number") {
      params.set("short", String(id));
    } else {
      params.delete("short");
    }
    const newSearch = params.toString() ? `?${params.toString()}` : window.location.pathname;
    window.history.replaceState(null, "", newSearch);
  };

  const handleSelectShort = useCallback(
    (short: Edit) => {
      setActiveShortId(short.id);
      syncTestUrl(short.id);
      addLog(`Selected short ID: ${short.id} ("${short.title}")`);
    },
    [addLog]
  );

  const handleShortChange = useCallback(
    (short: Edit) => {
      setActiveShortId(short.id);
      syncTestUrl(short.id);
      addLog(`Navigated to short ID: ${short.id} ("${short.title}")`);
    },
    [addLog]
  );

  const handleClose = useCallback(() => {
    setActiveShortId(null);
    syncTestUrl(null);
    addLog("Closed ShortsViewer overlay");
  }, [addLog]);

  const handleTagClick = useCallback(
    (tag: string) => {
      addLog(`Hashtag clicked inside viewer: #${tag} (Triggered atomic navigation)`);
      handleClose();
    },
    [addLog, handleClose]
  );

  // Popstate history listener
  useEffect(() => {
    const onPop = () => {
      const params = new URLSearchParams(window.location.search);
      const s = params.get("short");
      const id = s !== null && !isNaN(Number(s)) ? Number(s) : null;
      setActiveShortId(id);
      addLog(`Browser popstate -> short ID: ${id}`);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [addLog]);

  const activeShort = TEST_FIXTURE_SHORTS.find((s) => s.id === activeShortId) || null;

  return (
    <div style={{ padding: "32px", maxWidth: "1200px", margin: "0 auto", color: "#f8fafc" }}>
      <header style={{ marginBottom: "24px" }}>
        <h1 style={{ fontSize: "28px", fontFamily: "Rajdhani, sans-serif", color: "#fff" }}>
          Lolixco Mission 6C — Isolated Shorts Test Harness
        </h1>
        <p style={{ color: "#94a3b8", fontSize: "14px" }}>
          Strictly development-isolated environment with synthetic Shorts fixture.
        </p>
      </header>

      <section style={{ display: "flex", gap: "12px", marginBottom: "24px", flexWrap: "wrap" }}>
        <button
          id="btn-open-100"
          type="button"
          className="primary"
          style={{ padding: "8px 16px", borderRadius: "6px", cursor: "pointer" }}
          onClick={() => handleSelectShort(TEST_FIXTURE_SHORTS[0])}
        >
          Open Short #100 (Shadow Strike)
        </button>
        <button
          id="btn-open-0"
          type="button"
          className="primary"
          style={{ padding: "8px 16px", borderRadius: "6px", cursor: "pointer" }}
          onClick={() => handleSelectShort(TEST_FIXTURE_SHORTS[2])}
        >
          Open Short #0 (Numeric ID 0)
        </button>
        <button
          id="btn-open-error"
          type="button"
          style={{ padding: "8px 16px", borderRadius: "6px", cursor: "pointer", background: "#ef4444", color: "#fff", border: "none" }}
          onClick={() => handleSelectShort(TEST_FIXTURE_SHORTS[3])}
        >
          Open Corrupted Short (Test Error & Retry)
        </button>
        <button
          id="btn-toggle-shelf"
          type="button"
          style={{ padding: "8px 16px", borderRadius: "6px", cursor: "pointer", background: "#334155", color: "#fff", border: "1px solid #475569" }}
          onClick={() => {
            const next = shelfItems.length === 0 ? TEST_FIXTURE_SHORTS : [];
            setShelfItems(next);
            addLog(`Toggled shelf items: now ${next.length} items (Testing hook ordering)`);
          }}
        >
          Toggle Shelf: {shelfItems.length > 0 ? "Empty Shelf" : "Populate Shelf"}
        </button>
      </section>

      {/* Render Shelf */}
      <div style={{ marginBottom: "32px", border: "1px solid #1e293b", padding: "16px", borderRadius: "8px" }}>
        <h3 style={{ fontSize: "16px", marginBottom: "12px", color: "#e2e8f0" }}>
          ShortsShelf Component Preview (Hook Stability Test)
        </h3>
        <ShortsShelf
          title="Test Harness Shelf"
          items={shelfItems}
          onSelect={handleSelectShort}
          onTagClick={handleTagClick}
        />
        {shelfItems.length === 0 && (
          <p style={{ color: "#64748b", fontStyle: "italic" }}>Shelf returned null (0 items).</p>
        )}
      </div>

      {/* Status & Event Log Output */}
      <div style={{ border: "1px solid #1e293b", padding: "16px", borderRadius: "8px", background: "#0b0f17" }}>
        <h3 style={{ fontSize: "16px", marginBottom: "8px", color: "#38bdf8" }}>
          Interactive Diagnostics & State Log
        </h3>
        <p style={{ fontSize: "13px", color: "#94a3b8" }}>
          Active Short ID: <strong id="debug-active-id" style={{ color: "#facc15" }}>{String(activeShortId)}</strong> | URL Search: <strong id="debug-url-search" style={{ color: "#38bdf8" }}>{window.location.search || "none"}</strong>
        </p>
        <ul id="debug-log-list" style={{ marginTop: "12px", fontSize: "12px", fontFamily: "monospace", color: "#cbd5e1", listStyle: "none", padding: 0 }}>
          {logs.map((log, i) => (
            <li key={i} style={{ padding: "2px 0" }}>{log}</li>
          ))}
        </ul>
      </div>

      {/* Active Viewer Overlay */}
      {activeShort && (
        <ShortsViewer
          shorts={TEST_FIXTURE_SHORTS}
          initialShortId={activeShort.id}
          activeShortId={activeShort.id}
          onShortChange={handleShortChange}
          onClose={handleClose}
          onTagClick={handleTagClick}
        />
      )}
    </div>
  );
}

const rootEl = document.getElementById("root");
if (rootEl) {
  createRoot(rootEl).render(<TestHarness />);
}
