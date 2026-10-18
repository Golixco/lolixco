import { useState, useCallback, useEffect } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/rajdhani/600.css";
import "@fontsource/rajdhani/700.css";
import "./styles/index.css";
import type { Edit } from "./data/edits";
import { edits } from "./data/edits";
import App from "./App";
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
    id: 103,
    title: "Cyber Rush",
    creator: "Internal Studio Test",
    description: "Futuristic neon drift vertical edit.",
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

  const [corruptedRecovered, setCorruptedRecovered] = useState(false);

  const fixtureShorts: Edit[] = TEST_FIXTURE_SHORTS.map((s) => {
    if (s.id === 102) {
      return {
        ...s,
        source: corruptedRecovered
          ? "/media/motion-study.webm"
          : "/test-error-assets/missing-video.webm",
      };
    }
    return s;
  });

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

  const activeShort = fixtureShorts.find((s) => s.id === activeShortId) || null;

  return (
    <div style={{ padding: "32px", maxWidth: "1200px", margin: "0 auto", color: "#f8fafc" }}>
      <header style={{ marginBottom: "24px" }}>
        <h1 style={{ fontSize: "28px", fontFamily: "Rajdhani, sans-serif", color: "#fff" }}>
          Lolixco Mission 6C — Isolated Shorts Test Harness
        </h1>
        <p style={{ color: "#94a3b8", fontSize: "14px" }}>
          Strictly development-isolated environment with synthetic Shorts fixture.
        </p>
        <div style={{ marginTop: "12px", padding: "12px 16px", borderRadius: "6px", background: "rgba(56, 189, 248, 0.1)", border: "1px solid rgba(56, 189, 248, 0.25)", fontSize: "13px", color: "#e0f2fe", lineHeight: "1.5" }}>
          <strong>Evidence Note:</strong> Layout tests verify the portrait viewer container (fixed 9:16 aspect ratio, responsive bounds, and controls). The synthetic test fixture renders repository-local test footage (<code>/media/motion-study.webm</code>) cropped via CSS <code>object-fit: cover</code>. Genuine 9:16 vertical encoding verification will occur when production vertical assets are ingested.
        </div>
      </header>

      <section style={{ display: "flex", gap: "12px", marginBottom: "24px", flexWrap: "wrap" }}>
        <button
          id="btn-open-100"
          type="button"
          className="primary"
          style={{ padding: "8px 16px", borderRadius: "6px", cursor: "pointer" }}
          onClick={() => handleSelectShort(fixtureShorts[0])}
        >
          Open Short #100 (Shadow Strike)
        </button>
        <button
          id="btn-open-103"
          type="button"
          className="primary"
          style={{ padding: "8px 16px", borderRadius: "6px", cursor: "pointer" }}
          onClick={() => handleSelectShort(fixtureShorts[2])}
        >
          Open Short #103 (Cyber Rush)
        </button>
        <button
          id="btn-open-error"
          type="button"
          style={{ padding: "8px 16px", borderRadius: "6px", cursor: "pointer", background: "#ef4444", color: "#fff", border: "none" }}
          onClick={() => handleSelectShort(fixtureShorts[3])}
        >
          Open Corrupted Short (Test Error & Retry)
        </button>
        <button
          id="btn-recover-error"
          type="button"
          style={{ padding: "8px 16px", borderRadius: "6px", cursor: "pointer", background: corruptedRecovered ? "#10b981" : "#d97706", color: "#fff", border: "none" }}
          onClick={() => {
            const next = !corruptedRecovered;
            setCorruptedRecovered(next);
            addLog(`Toggled media availability for Short #102: now ${next ? "VALID (/media/motion-study.webm)" : "CORRUPTED (missing-video.webm)"}`);
          }}
        >
          {corruptedRecovered ? "Restore Error Media (Corrupt #102)" : "Simulate Media Recovery for #102"}
        </button>
        <button
          id="btn-toggle-shelf"
          type="button"
          style={{ padding: "8px 16px", borderRadius: "6px", cursor: "pointer", background: "#334155", color: "#fff", border: "1px solid #475569" }}
          onClick={() => {
            const next = shelfItems.length === 0 ? fixtureShorts : [];
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
          shorts={fixtureShorts}
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

function TestHarnessRoot() {
  const [viewMode, setViewMode] = useState<"app" | "diagnostics">(() => {
    const p = new URLSearchParams(window.location.search);
    return p.get("mode") === "diagnostics" ? "diagnostics" : "app";
  });

  return (
    <>
      <div
        id="harness-bar"
        style={{
          background: "#0f172a",
          borderBottom: "1px solid #334155",
          padding: "8px 16px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: "12px",
          color: "#94a3b8",
          position: "sticky",
          top: 0,
          zIndex: 99999,
        }}
      >
        <span>
          <strong style={{ color: "#38bdf8" }}>Lolixco Test Environment:</strong>{" "}
          Active: <strong style={{ color: "#facc15" }}>{viewMode === "app" ? "Live App Mode (Synthetic Shorts)" : "Component Diagnostics"}</strong>
        </span>
        <div style={{ display: "flex", gap: "8px" }}>
          <button
            id="btn-switch-app"
            type="button"
            style={{
              padding: "4px 8px",
              background: viewMode === "app" ? "#0284c7" : "#1e293b",
              color: "#fff",
              border: "1px solid #475569",
              borderRadius: "4px",
              cursor: "pointer",
            }}
            onClick={() => setViewMode("app")}
          >
            Live App Mode
          </button>
          <button
            id="btn-switch-diagnostics"
            type="button"
            style={{
              padding: "4px 8px",
              background: viewMode === "diagnostics" ? "#0284c7" : "#1e293b",
              color: "#fff",
              border: "1px solid #475569",
              borderRadius: "4px",
              cursor: "pointer",
            }}
            onClick={() => setViewMode("diagnostics")}
          >
            Component Diagnostics
          </button>
        </div>
      </div>
      {viewMode === "app" ? (
        <App initialEdits={[...edits, ...TEST_FIXTURE_SHORTS]} />
      ) : (
        <TestHarness />
      )}
    </>
  );
}

const rootEl = document.getElementById("root");
if (rootEl) {
  createRoot(rootEl).render(<TestHarnessRoot />);
}
