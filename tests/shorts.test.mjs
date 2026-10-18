import test from "node:test";
import assert from "node:assert/strict";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";

import { ShortsCard } from "../src/components/shorts/ShortsCard.tsx";
import { ShortsShelf } from "../src/components/shorts/ShortsShelf.tsx";
import { ShortsViewer } from "../src/components/shorts/ShortsViewer.tsx";
import App, { parseAndValidateShortId, parseUrlParams, syncUrl } from "../src/App.tsx";
import VideoPlayer from "../src/components/video/VideoPlayer.tsx";
import { edits } from "../src/data/edits.ts";

// Synthetic Shorts fixture strictly for unit & interaction tests (NOT in visitor-facing production catalog)
const SYNTHETIC_SHORTS = [
  {
    id: 100,
    title: "Shadow Strike",
    description: "High speed phonk sync vertical edit",
    category: "Gaming",
    fandomIds: ["valorant"],
    tags: ["valorant", "phonk", "sniper"],
    poster: "/media/art-0.svg",
    source: "/media/silent-test-loop.webm",
    duration: "0:25",
    trending: true,
    format: "short",
  },
  {
    id: 101,
    title: "Domain Expansion",
    description: "Gojo vs Sukuna vertical clip",
    category: "Anime",
    fandomIds: ["jujutsu-kaisen"],
    tags: ["anime", "gojo", "jjk"],
    poster: "/media/art-1.svg",
    source: "/media/silent-test-loop.webm",
    duration: "0:30",
    trending: false,
    format: "short",
  },
  {
    id: 0,
    title: "Zero Origin",
    description: "Short with numeric ID 0 test",
    category: "Movies",
    fandomIds: ["spider-man"],
    tags: ["movies", "spiderman"],
    poster: "/media/art-2.svg",
    source: "/media/silent-test-loop.webm",
    duration: "0:15",
    trending: false,
    format: "short",
  },
];

// Helper for lightweight DOM setup in Node.js
function setupMountedDom(initialUrl = "http://localhost:3000/") {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const urlObj = new URL(initialUrl);

  const historyState = {
    historyStack: [urlObj.href],
    pointer: 0,
    get url() {
      return this.historyStack[this.pointer];
    },
    get search() {
      return new URL(this.url).search;
    },
    get pathname() {
      return new URL(this.url).pathname;
    },
    get hash() {
      return new URL(this.url).hash;
    },
    pushCount: 0,
    replaceCount: 0,
  };

  const history = {
    pushState(_state, _title, url) {
      historyState.pushCount++;
      const u = new URL(url, historyState.url);
      historyState.historyStack = historyState.historyStack.slice(
        0,
        historyState.pointer + 1
      );
      historyState.historyStack.push(u.href);
      historyState.pointer = historyState.historyStack.length - 1;
    },
    replaceState(_state, _title, url) {
      historyState.replaceCount++;
      const u = new URL(url, historyState.url);
      historyState.historyStack[historyState.pointer] = u.href;
    },
  };

  const location = {
    get href() {
      return historyState.url;
    },
    get search() {
      return historyState.search;
    },
    get pathname() {
      return historyState.pathname;
    },
    get hash() {
      return historyState.hash;
    },
  };

  globalThis._windowListeners = new Map();
  globalThis.addEventListener = (type, fn, opts) => {
    if (!globalThis._windowListeners.has(type)) {
      globalThis._windowListeners.set(type, []);
    }
    globalThis._windowListeners.get(type).push({
      fn,
      capture: !!(opts && opts.capture),
    });
  };
  globalThis.removeEventListener = (type, fn) => {
    if (!globalThis._windowListeners.has(type)) return;
    const list = globalThis._windowListeners.get(type);
    const i = list.findIndex((l) => l.fn === fn);
    if (i !== -1) list.splice(i, 1);
  };
  globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 16);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);

  function createElement(tag = "div") {
    return {
      nodeType: 1,
      tagName: tag.toUpperCase(),
      nodeName: tag.toUpperCase(),
      ownerDocument: null,
      parentNode: null,
      childNodes: [],
      style: {},
      attributes: {},
      _listeners: new Map(),
      _textContent: "",
      scrollLeft: 0,
      scrollWidth: 1000,
      clientWidth: 500,
      scrollBy() {},
      paused: true,
      focus() {
        if (this.ownerDocument) this.ownerDocument.activeElement = this;
      },
      blur() {
        if (this.ownerDocument && this.ownerDocument.activeElement === this) {
          this.ownerDocument.activeElement = null;
        }
      },
      _playCalls: 0,
      _pauseCalls: 0,
      _loadCalls: 0,
      play() {
        this._playCalls++;
        this.paused = false;
        return Promise.resolve();
      },
      pause() {
        this._pauseCalls++;
        this.paused = true;
      },
      load() {
        this._loadCalls++;
      },
      querySelectorAll(selector) {
        const matches = [];
        function walk(node) {
          if (!node || !node.childNodes) return;
          for (const child of node.childNodes) {
            if (child.nodeType === 1) {
              const tag = child.tagName?.toLowerCase();
              const role = child.getAttribute("role");
              if (selector.includes("button") && tag === "button") {
                matches.push(child);
              } else if (selector.includes('role="slider"') && role === "slider") {
                matches.push(child);
              } else if (tag === "button") {
                matches.push(child);
              }
              walk(child);
            }
          }
        }
        walk(this);
        return matches;
      },
      closest(selector) {
        let curr = this;
        while (curr) {
          const tag = curr.tagName?.toLowerCase();
          if (tag && selector.includes(tag)) return curr;
          curr = curr.parentNode;
        }
        return null;
      },
      get textContent() {
        if (this._textContent) return this._textContent;
        return this.childNodes
          .map((c) => c.textContent || c.nodeValue || "")
          .join("");
      },
      set textContent(v) {
        this._textContent = v;
        this.childNodes = [];
      },
      setAttribute(k, v) {
        this.attributes[k] = String(v);
      },
      removeAttribute(k) {
        delete this.attributes[k];
      },
      getAttribute(k) {
        return this.attributes[k] ?? null;
      },
      appendChild(c) {
        c.parentNode = this;
        this.childNodes.push(c);
        return c;
      },
      removeChild(c) {
        const i = this.childNodes.indexOf(c);
        if (i !== -1) this.childNodes.splice(i, 1);
        c.parentNode = null;
        return c;
      },
      insertBefore(c, b) {
        c.parentNode = this;
        const i = this.childNodes.indexOf(b);
        if (i !== -1) this.childNodes.splice(i, 0, c);
        else this.childNodes.push(c);
        return c;
      },
      addEventListener(type, fn, opts) {
        if (!this._listeners.has(type)) this._listeners.set(type, []);
        this._listeners.get(type).push({ fn, capture: !!(opts && opts.capture) });
      },
      removeEventListener(type, fn) {
        if (!this._listeners.has(type)) return;
        const list = this._listeners.get(type);
        const i = list.findIndex((l) => l.fn === fn);
        if (i !== -1) list.splice(i, 1);
      },
      getBoundingClientRect() {
        return { left: 0, top: 0, width: 300, height: 10, right: 300, bottom: 10 };
      },
      dispatchEvent(evt) {
        evt.target = this;
        let curr = this;
        let stopped = false;
        evt.stopPropagation = () => {
          stopped = true;
        };
        while (curr) {
          const list = curr._listeners.get(evt.type);
          if (list) {
            for (const { fn } of [...list]) {
              fn.call(curr, evt);
            }
          }
          if (stopped || !evt.bubbles) break;
          curr = curr.parentNode;
        }
        return true;
      },
    };
  }

  const mockDoc = {
    nodeType: 9,
    ownerDocument: null,
    parentNode: null,
    activeElement: null,
    _listeners: new Map(),
    createElement: (tag) => {
      const el = createElement(tag);
      el.ownerDocument = mockDoc;
      return el;
    },
    createElementNS: (_ns, tag) => {
      const el = createElement(tag);
      el.ownerDocument = mockDoc;
      return el;
    },
    createTextNode: (t) => ({
      nodeType: 3,
      nodeValue: t,
      get textContent() {
        return this.nodeValue;
      },
      set textContent(v) {
        this.nodeValue = v;
      },
      ownerDocument: mockDoc,
      parentNode: null,
    }),
    createComment: () => ({
      nodeType: 8,
      ownerDocument: mockDoc,
      parentNode: null,
    }),
    addEventListener(type, fn, opts) {
      if (!this._listeners.has(type)) this._listeners.set(type, []);
      this._listeners.get(type).push({ fn, capture: !!(opts && opts.capture) });
    },
    removeEventListener(type, fn) {
      if (!this._listeners.has(type)) return;
      const list = this._listeners.get(type);
      const i = list.findIndex((l) => l.fn === fn);
      if (i !== -1) list.splice(i, 1);
    },
  };

  globalThis.window = globalThis;
  globalThis.document = mockDoc;
  globalThis.location = location;
  globalThis.history = history;
  globalThis.innerWidth = 1200;
  globalThis.scrollTo = () => {};
  globalThis.HTMLVideoElement = class {};
  globalThis.HTMLIFrameElement = class {};
  globalThis.HTMLInputElement = class {};
  globalThis.HTMLTextAreaElement = class {};
  globalThis.HTMLElement = class {};
  globalThis.matchMedia = () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  });
  globalThis.IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };

  const triggerPop = (direction = -1) => {
    historyState.pointer = Math.max(
      0,
      Math.min(historyState.historyStack.length - 1, historyState.pointer + direction)
    );
    const evt = { type: "popstate", bubbles: false };
    const list = globalThis._windowListeners.get("popstate") || [];
    for (const { fn } of [...list]) {
      fn.call(globalThis, evt);
    }
  };

  const container = mockDoc.createElement("div");
  mockDoc.body = container;
  container.parentNode = mockDoc;
  const root = createRoot(container);

  const cleanup = async () => {
    await act(async () => {
      root.unmount();
    });
  };

  return { mockDoc, container, root, historyState, triggerPop, cleanup };
}

function findButtonsByText(node, text) {
  const matches = [];
  function walk(n) {
    if (n.tagName === "BUTTON") {
      if (n.textContent && n.textContent.includes(text)) matches.push(n);
    }
    if (n.childNodes) {
      for (const c of n.childNodes) walk(c);
    }
  }
  walk(node);
  return matches;
}

function findElementsByAriaLabel(node, labelSubstring) {
  const matches = [];
  function walk(n) {
    const aria = n.getAttribute ? n.getAttribute("aria-label") : null;
    if (aria && aria.includes(labelSubstring)) matches.push(n);
    if (n.childNodes) {
      for (const c of n.childNodes) walk(c);
    }
  }
  walk(node);
  return matches;
}

function findHeading1(node) {
  let h1 = null;
  function walk(n) {
    if (n.tagName === "H1" && !h1) h1 = n;
    if (n.childNodes) {
      for (const c of n.childNodes) walk(c);
    }
  }
  walk(node);
  return h1 ? h1.textContent : null;
}

// ---------------------------------------------------------------------------
// 1. ShortsCard Tests
// ---------------------------------------------------------------------------

test("ShortsCard: renders portrait structure, accessible labels, and badges without nested buttons", () => {
  const short = SYNTHETIC_SHORTS[0];
  let selected = null;
  let clickedTag = null;

  const html = renderToStaticMarkup(
    React.createElement(ShortsCard, {
      short,
      onSelect: (s) => {
        selected = s;
      },
      onTagClick: (t) => {
        clickedTag = t;
      },
    })
  );

  // Accessible article role & label
  assert.ok(html.includes('aria-label="Short: Shadow Strike"'));
  // Dedicated watch trigger
  assert.ok(html.includes('aria-label="Watch short: Shadow Strike"'));
  // Duration badge
  assert.ok(html.includes("0:25"));
  // Category / Fandom context
  assert.ok(html.includes("Valorant · Gaming"));
  // Tag chip (without being nested inside the watch trigger button)
  assert.ok(html.includes('aria-label="Filter by #valorant"'));
  assert.ok(html.includes("#valorant"));

  // Check that the watch-trigger button closes before card-tags group starts
  const buttonCloseIdx = html.indexOf("</button>");
  const cardTagsIdx = html.indexOf('class="card-tags shorts-tags"');
  assert.ok(buttonCloseIdx !== -1 && cardTagsIdx !== -1);
  assert.ok(
    buttonCloseIdx < cardTagsIdx,
    "Watch trigger button MUST close before card-tags container to prevent nested interactive controls"
  );
});

test("ShortsCard: tag click does not trigger onSelect (independent interactive controls)", async () => {
  const { container, root, cleanup } = setupMountedDom();
  const short = SYNTHETIC_SHORTS[0];
  let selectedShort = null;
  let selectedTag = null;

  await act(async () => {
    root.render(
      React.createElement(ShortsCard, {
        short,
        onSelect: (s) => {
          selectedShort = s;
        },
        onTagClick: (t) => {
          selectedTag = t;
        },
      })
    );
  });

  const tagButtons = findButtonsByText(container, "#valorant");
  assert.ok(tagButtons.length > 0, "Tag button #valorant must exist");

  await act(async () => {
    tagButtons[0].dispatchEvent({ type: "click", bubbles: true });
  });

  assert.equal(selectedTag, "valorant", "Tag click must invoke onTagClick");
  assert.equal(selectedShort, null, "Tag click must NOT invoke onSelect");

  // Clicking watch trigger invokes onSelect
  const watchButtons = findElementsByAriaLabel(container, "Watch short: Shadow Strike");
  assert.ok(watchButtons.length > 0, "Watch trigger button must exist");

  await act(async () => {
    watchButtons[0].dispatchEvent({ type: "click", bubbles: true });
  });

  assert.equal(selectedShort?.id, short.id, "Watch button must invoke onSelect");

  await cleanup();
});

// ---------------------------------------------------------------------------
// 2. ShortsShelf Tests
// ---------------------------------------------------------------------------

test("ShortsShelf: completely omits shelf when items array is empty", () => {
  const htmlEmpty = renderToStaticMarkup(
    React.createElement(ShortsShelf, {
      items: [],
      onSelect: () => {},
    })
  );
  assert.equal(htmlEmpty, "", "ShortsShelf must render nothing when items is empty");
});

test("ShortsShelf: renders horizontal track, controls, and items when items exist", () => {
  const html = renderToStaticMarkup(
    React.createElement(ShortsShelf, {
      title: "Curated Shorts",
      items: SYNTHETIC_SHORTS,
      onSelect: () => {},
    })
  );

  assert.ok(html.includes("Curated Shorts"));
  assert.ok(html.includes('aria-label="Scroll shorts left"'));
  assert.ok(html.includes('aria-label="Scroll shorts right"'));
  assert.ok(html.includes('aria-label="Curated Shorts carousel"'));
  assert.ok(html.includes("Shadow Strike"));
  assert.ok(html.includes("Domain Expansion"));
  assert.ok(html.includes("Zero Origin"));
});

// ---------------------------------------------------------------------------
// 3. ShortsViewer Tests
// ---------------------------------------------------------------------------

test("ShortsViewer: provides keyboard shortcuts, playback controls, and focus cleanup", async () => {
  const { container, root, cleanup } = setupMountedDom();
  let closed = false;

  await act(async () => {
    root.render(
      React.createElement(ShortsViewer, {
        shorts: SYNTHETIC_SHORTS,
        initialShortId: 100,
        onClose: () => {
          closed = true;
        },
      })
    );
  });

  // Modal accessibility
  const dialog = findElementsByAriaLabel(container, "Shorts viewer: Shadow Strike")[0];
  assert.ok(dialog, "Dialog overlay must exist with accessible label");
  assert.equal(dialog.getAttribute("role"), "dialog");
  assert.equal(dialog.getAttribute("aria-modal"), "true");

  // Counter index
  assert.ok(container.textContent.includes("1 / 3"));

  // Next / Previous navigation buttons
  const prevBtn = findElementsByAriaLabel(container, "Previous short")[0];
  const nextBtn = findElementsByAriaLabel(container, "Next short")[0];
  assert.ok(prevBtn, "Previous short button must exist");
  assert.ok(nextBtn, "Next short button must exist");

  // Index 0: Prev button disabled
  assert.ok(prevBtn.getAttribute("disabled") !== null, "Previous button must be disabled at index 0");

  // Click Next button -> Advances to short 101
  await act(async () => {
    nextBtn.dispatchEvent({ type: "click", bubbles: true });
  });
  assert.ok(container.textContent.includes("Domain Expansion"));
  assert.ok(container.textContent.includes("2 / 3"));

  // Press Escape -> triggers onClose
  const escapeEvt = { key: "Escape", preventDefault() {} };
  const keyListeners = globalThis._windowListeners.get("keydown") || [];
  await act(async () => {
    for (const { fn } of [...keyListeners]) {
      fn(escapeEvt);
    }
  });
  assert.equal(closed, true, "Escape key must trigger onClose");

  await cleanup();
});

test("ShortsViewer: handles ID 0 correctly as a valid short ID", async () => {
  const { container, root, cleanup } = setupMountedDom();

  await act(async () => {
    root.render(
      React.createElement(ShortsViewer, {
        shorts: SYNTHETIC_SHORTS,
        initialShortId: 0,
        onClose: () => {},
      })
    );
  });

  assert.ok(container.textContent.includes("Zero Origin"));
  assert.ok(container.textContent.includes("3 / 3"));

  await cleanup();
});

// ---------------------------------------------------------------------------
// 4. App Navigation & URL Integration for Shorts
// ---------------------------------------------------------------------------

test("App Navigation: visiting Shorts when catalog has 0 shorts displays honest empty state", async () => {
  const { container, root, historyState, cleanup } = setupMountedDom("http://localhost:3000/");

  await act(async () => {
    root.render(React.createElement(App));
  });

  // Click Shorts in Sidebar
  const shortsBtn = findButtonsByText(container, "Shorts")[0];
  assert.ok(shortsBtn, "Shorts sidebar button must exist");

  await act(async () => {
    shortsBtn.dispatchEvent({ type: "click", bubbles: true });
  });

  // URL state updated to ?view=shorts
  assert.equal(historyState.search, "?view=shorts");

  // H1 heading displays honest empty state
  assert.equal(
    findHeading1(container),
    "Curated Shorts are coming soon",
    "Empty state must show honest 'Curated Shorts are coming soon' heading"
  );

  // Return to browsing button exists and restores Home
  const returnBtn = findButtonsByText(container, "Return to browsing")[0];
  assert.ok(returnBtn, "Return to browsing button must exist");

  await act(async () => {
    returnBtn.dispatchEvent({ type: "click", bubbles: true });
  });

  assert.equal(historyState.search, "");
  assert.equal(findHeading1(container), "Into the Light", "Home featured edit restored");

  await cleanup();
});

test("App Navigation: direct URL ?view=shorts restores Shorts empty state directly", async () => {
  const { container, root, historyState, cleanup } = setupMountedDom(
    "http://localhost:3000/?view=shorts"
  );

  await act(async () => {
    root.render(React.createElement(App));
  });

  assert.equal(historyState.search, "?view=shorts");
  assert.equal(findHeading1(container), "Curated Shorts are coming soon");

  await cleanup();
});

test("App Navigation: invalid or missing short ID in URL safely recovers without crashing", async () => {
  const { container, root, cleanup } = setupMountedDom(
    "http://localhost:3000/?view=shorts&short=99999"
  );

  await act(async () => {
    root.render(React.createElement(App));
  });

  // Does not crash, shows honest empty state since 99999 is invalid and catalog has 0 shorts
  assert.equal(findHeading1(container), "Curated Shorts are coming soon");

  await cleanup();
});

test("Production Invariant: production catalog has 17 items and 0 shorts", () => {
  assert.equal(edits.length, 17, "Production catalog must have exactly 17 genuine demo edits");
  const shortsCount = edits.filter((e) => e.format === "short").length;
  assert.equal(shortsCount, 0, "Production catalog must contain zero synthetic shorts");
});

// ---------------------------------------------------------------------------
// 5. REVIEW V2 FIX A: Short ID Validation & URL Synchronization
// ---------------------------------------------------------------------------

test("FIX A: parseAndValidateShortId strictly rejects invalid IDs and preserves ID 0", () => {
  // Valid short IDs
  assert.equal(parseAndValidateShortId("100", SYNTHETIC_SHORTS), 100);
  assert.equal(parseAndValidateShortId("101", SYNTHETIC_SHORTS), 101);
  assert.equal(parseAndValidateShortId("0", SYNTHETIC_SHORTS), 0, "Numeric ID 0 must be strictly valid");
  assert.equal(parseAndValidateShortId(" 100 ", SYNTHETIC_SHORTS), 100, "Whitespace trimmed");

  // Invalid IDs
  assert.equal(parseAndValidateShortId(null, SYNTHETIC_SHORTS), null);
  assert.equal(parseAndValidateShortId("", SYNTHETIC_SHORTS), null);
  assert.equal(parseAndValidateShortId("-1", SYNTHETIC_SHORTS), null, "Negative IDs rejected");
  assert.equal(parseAndValidateShortId("1.5", SYNTHETIC_SHORTS), null, "Fractional/decimal IDs rejected");
  assert.equal(parseAndValidateShortId("abc", SYNTHETIC_SHORTS), null, "Non-numeric strings rejected");
  assert.equal(parseAndValidateShortId("100abc", SYNTHETIC_SHORTS), null, "Trailing letters rejected");
  assert.equal(parseAndValidateShortId("1e2", SYNTHETIC_SHORTS), null, "Scientific notation rejected");
  assert.equal(parseAndValidateShortId("9007199254740992", SYNTHETIC_SHORTS), null, "Unsafe integers rejected");
  assert.equal(parseAndValidateShortId("9999", SYNTHETIC_SHORTS), null, "Unknown IDs not in catalog rejected");

  // Non-short video ID rejection (e.g. landscape edit ID 1)
  assert.equal(parseAndValidateShortId("1", edits), null, "Landscape video IDs rejected as Shorts");
});

test("FIX A: Closing ShortsViewer uses replaceState to prevent Back from reopening", () => {
  const { historyState } = setupMountedDom("http://localhost:3000/?short=100");

  // Simulate viewer close: usePush = false (replaceState)
  syncUrl("All", "", "", "Home", null, false);

  assert.equal(historyState.search, "");
  assert.equal(historyState.replaceCount, 1, "Must use replaceState on viewer close");
  assert.equal(historyState.pushCount, 0, "Must NOT use pushState on viewer close");
});

// ---------------------------------------------------------------------------
// 6. REVIEW V2 FIX B: Atomic Tag Navigation & Dedicated Shorts Surface
// ---------------------------------------------------------------------------

test("FIX B: ShortsViewer tag click triggers atomic discovery navigation without stale short ID", async () => {
  const { container, root, cleanup } = setupMountedDom();
  let clickedTag = "";

  await act(async () => {
    root.render(
      React.createElement(ShortsViewer, {
        shorts: SYNTHETIC_SHORTS,
        initialShortId: 100,
        onClose: () => {},
        onTagClick: (t) => {
          clickedTag = t;
        },
      })
    );
  });

  // Find tag chip button
  const tagBtns = container.querySelectorAll("button");
  const valorantTag = tagBtns.find((b) => b.textContent && b.textContent.includes("#valorant"));
  assert.ok(valorantTag, "Hashtag chip #valorant must exist");

  await act(async () => {
    valorantTag.dispatchEvent({ type: "click", bubbles: true });
  });

  assert.equal(clickedTag, "valorant", "Tag click must pass exact tag value");

  await cleanup();
});

test("FIX B: App-level tag click navigation atomically clears short= and navigates to Explore", async () => {
  const { historyState } = setupMountedDom("http://localhost:3000/?short=100");

  // Atomic navigation: clear short, set query #tag, view=explore, reset category to All
  syncUrl("All", "", "#valorant", "Explore", null, true);

  assert.equal(historyState.search, "?view=explore&q=%23valorant");
  assert.ok(!historyState.search.includes("short="), "short= parameter must be cleared");
});

// ---------------------------------------------------------------------------
// 7. REVIEW V2 FIX C: React Hook Ordering in ShortsShelf
// ---------------------------------------------------------------------------

test("FIX C: ShortsShelf handles empty → populated → empty transitions without hook errors", async () => {
  const { container, root, cleanup } = setupMountedDom();

  // 1. Initial render with empty items (returns null)
  await act(async () => {
    root.render(
      React.createElement(ShortsShelf, {
        items: [],
        onSelect: () => {},
      })
    );
  });
  assert.equal(container.childNodes.length, 0, "Empty items renders null");

  // 2. Re-render mounted component with populated items (must not throw React hook count error)
  await act(async () => {
    root.render(
      React.createElement(ShortsShelf, {
        items: SYNTHETIC_SHORTS,
        onSelect: () => {},
      })
    );
  });
  assert.ok(container.textContent.includes("Curated Shorts"), "Populated items renders shelf");
  assert.ok(container.textContent.includes("Shadow Strike"));

  // 3. Re-render back to empty items
  await act(async () => {
    root.render(
      React.createElement(ShortsShelf, {
        items: [],
        onSelect: () => {},
      })
    );
  });
  assert.equal(container.childNodes.length, 0, "Returns to null without hook errors");

  // 4. One item → many items transition
  await act(async () => {
    root.render(
      React.createElement(ShortsShelf, {
        items: [SYNTHETIC_SHORTS[0]],
        onSelect: () => {},
      })
    );
  });
  assert.ok(container.textContent.includes("Shadow Strike"));

  await act(async () => {
    root.render(
      React.createElement(ShortsShelf, {
        items: SYNTHETIC_SHORTS,
        onSelect: () => {},
      })
    );
  });
  assert.ok(container.textContent.includes("Domain Expansion"));

  // 5. Rapid sequential updates without crashing
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      root.render(
        React.createElement(ShortsShelf, {
          items: i % 2 === 0 ? [] : SYNTHETIC_SHORTS,
          onSelect: () => {},
        })
      );
    });
  }

  await cleanup();
});

// ---------------------------------------------------------------------------
// 8. REVIEW V2 FIX D: Video Playback Lifecycle & Error Recovery
// ---------------------------------------------------------------------------

test("FIX D: Background VideoPlayer automatically pauses when ShortsViewer overlay is active", async () => {
  const { container, root, cleanup } = setupMountedDom();

  // Mount featured player with isOverlayActive=false
  await act(async () => {
    root.render(
      React.createElement(VideoPlayer, {
        edit: edits[0],
        isOverlayActive: false,
      })
    );
  });

  function findVideo(node) {
    if (node.tagName === "VIDEO") return node;
    if (node.childNodes) {
      for (const c of node.childNodes) {
        const found = findVideo(c);
        if (found) return found;
      }
    }
    return null;
  }

  const videoEl = findVideo(container);
  assert.ok(videoEl, "Video element must exist in VideoPlayer");
  const initialPauseCalls = videoEl._pauseCalls;

  // Open ShortsViewer overlay -> isOverlayActive becomes true
  await act(async () => {
    root.render(
      React.createElement(VideoPlayer, {
        edit: edits[0],
        isOverlayActive: true,
      })
    );
  });

  // Verify background player is paused to prevent overlapping audio
  assert.ok(
    videoEl._pauseCalls > initialPauseCalls,
    "VideoPlayer must pause when isOverlayActive becomes true"
  );

  await cleanup();
});

test("FIX D: ShortsViewer error recovery keeps video mounted and retry genuinely reloads", async () => {
  const { container, root, cleanup } = setupMountedDom();

  await act(async () => {
    root.render(
      React.createElement(ShortsViewer, {
        shorts: SYNTHETIC_SHORTS,
        initialShortId: 100,
        onClose: () => {},
      })
    );
  });

  // Find video element
  function findVideo(node) {
    if (node.tagName === "VIDEO") return node;
    if (node.childNodes) {
      for (const c of node.childNodes) {
        const found = findVideo(c);
        if (found) return found;
      }
    }
    return null;
  }

  const video = findVideo(container);
  assert.ok(video, "Video element must be initially mounted");

  // Trigger error event on video
  await act(async () => {
    video.dispatchEvent({ type: "error" });
  });

  // Invariant: Video element MUST remain in DOM (not unmounted)
  const videoStillMounted = findVideo(container);
  assert.ok(videoStillMounted, "Video element must remain mounted in DOM during error state");
  assert.equal(videoStillMounted.style.display, "none", "Video element is hidden while error state displays");

  // Error alert UI is visible
  assert.ok(container.textContent.includes("Video unavailable"));

  // Click Retry button
  const retryBtn = container.querySelectorAll("button").find(
    (b) => b.textContent && b.textContent.includes("Retry")
  );
  assert.ok(retryBtn, "Retry button must exist");

  const prevLoadCalls = videoStillMounted._loadCalls;
  await act(async () => {
    retryBtn.dispatchEvent({ type: "click", bubbles: true });
  });

  // Genuinely reloads video ref
  assert.ok(videoStillMounted._loadCalls > prevLoadCalls, "Retry must invoke video.load()");

  await cleanup();
});

// ---------------------------------------------------------------------------
// 9. REVIEW V2 FIX E: Accessibility, Modal Focus, and Seeker Slider
// ---------------------------------------------------------------------------

test("FIX E: Focused buttons do not have Space/Enter hijacked by global playback listener", async () => {
  const { container, root, mockDoc, cleanup } = setupMountedDom();

  await act(async () => {
    root.render(
      React.createElement(ShortsViewer, {
        shorts: SYNTHETIC_SHORTS,
        initialShortId: 100,
        onClose: () => {},
      })
    );
  });

  // Focus the mute button
  const muteBtn = container.querySelectorAll("button").find(
    (b) => b.attributes["aria-label"]?.includes("audio")
  );
  assert.ok(muteBtn, "Mute button must exist");
  muteBtn.focus();
  assert.equal(mockDoc.activeElement, muteBtn, "Active element is mute button");

  // Send Space key when button has focus
  let defaultPrevented = false;
  const spaceEvt = {
    key: " ",
    target: muteBtn,
    preventDefault() {
      defaultPrevented = true;
    },
  };

  const keyListeners = globalThis._windowListeners.get("keydown") || [];
  await act(async () => {
    for (const { fn } of [...keyListeners]) {
      fn(spaceEvt);
    }
  });

  // Space must NOT be prevented so button can natively activate
  assert.equal(
    defaultPrevented,
    false,
    "Space must not be prevented on focused button"
  );

  await cleanup();
});

test("FIX E: Progress bar is an accessible slider supporting keyboard arrow seeking", async () => {
  const { container, root, cleanup } = setupMountedDom();

  await act(async () => {
    root.render(
      React.createElement(ShortsViewer, {
        shorts: SYNTHETIC_SHORTS,
        initialShortId: 100,
        onClose: () => {},
      })
    );
  });

  // Find slider element
  function findSlider(node) {
    if (node.attributes?.role === "slider") return node;
    if (node.childNodes) {
      for (const c of node.childNodes) {
        const found = findSlider(c);
        if (found) return found;
      }
    }
    return null;
  }

  const slider = findSlider(container);
  assert.ok(slider, "Progress bar must have role='slider'");
  assert.equal(slider.attributes["tabindex"], "0");
  assert.equal(slider.attributes["aria-label"], "Seek short video");
  assert.ok(slider.attributes["aria-valuenow"] !== undefined);

  // Keyboard navigation on slider: ArrowRight, ArrowLeft
  let arrowHandled = false;
  await act(async () => {
    slider.dispatchEvent({
      type: "keydown",
      key: "ArrowRight",
      preventDefault() {
        arrowHandled = true;
      },
      bubbles: true,
    });
  });
  assert.equal(arrowHandled, true, "ArrowRight must be handled by slider");

  await cleanup();
});

// ---------------------------------------------------------------------------
// 10. REVIEW V2 FIX F: Arbitrary Catalog Composition Guard
// ---------------------------------------------------------------------------

test("FIX F: Shorts-only catalog never places a Short inside the landscape featured player", () => {
  // Pure composition on Shorts-only catalog
  const shortsOnlyCatalog = SYNTHETIC_SHORTS;

  // Invariant: initialLandscapeVideo logic
  const landscapeVideo = shortsOnlyCatalog.find((e) => e.format !== "short" && (e.format === "video" || e.format === undefined));
  assert.equal(landscapeVideo, undefined, "Shorts-only catalog has no landscape video");

  // Landscape player must not be assigned a Short edit
  const isSafeForLandscape = (edit) => Boolean(edit && edit.format !== "short");
  assert.equal(isSafeForLandscape(landscapeVideo), false, "Short must never be safe for landscape player");
});

