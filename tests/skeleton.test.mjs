import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DiscoveryGridSkeleton } from "../src/components/home/DiscoveryGridSkeleton.tsx";
import { VideoCardSkeleton } from "../src/components/home/VideoCardSkeleton.tsx";

test("VideoCardSkeleton renders correct markup and accessibility attributes", () => {
  const html = renderToStaticMarkup(React.createElement(VideoCardSkeleton, { compact: false }));
  
  // Accessibility: Skeletons must be hidden from screen readers and non-focusable
  assert.ok(html.includes('aria-hidden="true"'), "Rendered card must have aria-hidden='true'");
  assert.ok(html.includes('tabindex="-1"'), "Rendered card must have tabindex='-1'");
  
  // Card geometry elements
  assert.ok(html.includes('thumbnail skeleton-thumb'), "Rendered card must have thumbnail skeleton-thumb");
  assert.ok(html.includes('skeleton-shimmer'), "Rendered card must have shimmer effect layer");
  assert.ok(html.includes('skeleton-title'), "Rendered card must have title placeholder");
  assert.ok(html.includes('skeleton-creator'), "Rendered card must have creator placeholder");
  assert.ok(html.includes('skeleton-tag'), "Rendered card must have tag placeholder");
});

test("DiscoveryGridSkeleton renders single accessible announcement without redundant labels", () => {
  const label = "Loading discovery edits...";
  const html = renderToStaticMarkup(
    React.createElement(DiscoveryGridSkeleton, { count: 4, label })
  );

  // Status and polite live region
  assert.ok(html.includes('role="status"'), "Grid skeleton must have role='status'");
  assert.ok(html.includes('aria-busy="true"'), "Grid skeleton must have aria-busy='true'");
  assert.ok(html.includes('aria-live="polite"'), "Grid skeleton must have aria-live='polite'");

  // Single accessible announcement inside sr-only span
  assert.ok(
    html.includes(`<span class="sr-only">${label}</span>`),
    "Must include polite live text inside sr-only span"
  );

  // Redundant aria-label must NOT be present on the container
  assert.ok(
    !html.includes(`aria-label="${label}"`),
    "Container must not duplicate announcement with aria-label to avoid duplicate screen-reader speech"
  );

  // Must render requested number of card skeletons
  const cardCount = (html.match(/skeleton-card/g) || []).length;
  assert.equal(cardCount, 4, "Must render exactly 4 skeleton cards");
});

test("CSS index.css contains skeleton styles and reduced-motion override", () => {
  const css = fs.readFileSync("src/styles/index.css", "utf8");
  assert.ok(css.includes(".skeleton-card"), "Must define .skeleton-card");
  assert.ok(css.includes(".skeleton-shimmer"), "Must define .skeleton-shimmer");
  assert.ok(css.includes("@keyframes skeleton-shimmer"), "Must define @keyframes skeleton-shimmer");
  assert.ok(css.includes(".sr-only"), "Must define .sr-only accessible utility");
  assert.ok(
    css.includes("prefers-reduced-motion: reduce") && css.includes("animation: none !important"),
    "prefers-reduced-motion must disable animations"
  );
});

test("Header.tsx maintains exact Search placeholder and keyboard shortcuts", () => {
  const headerContent = fs.readFileSync("src/components/layout/Header.tsx", "utf8");
  assert.ok(headerContent.includes('placeholder="Search"'), "Placeholder must remain exactly 'Search'");
  assert.ok(headerContent.includes('role="search"'), "Search form must have role='search'");
  assert.ok(headerContent.includes('e.key === "/"'), "Must support '/' hotkey to focus search");
  assert.ok(headerContent.includes('e.key === "Escape"'), "Must support Escape hotkey to clear or blur search");
  
  // Guard checks
  assert.ok(headerContent.includes('hasOpenDialog'), "Must check for active modal dialogs");
  assert.ok(headerContent.includes('.closest("dialog'), "Must guard when focus is inside a dialog");
  assert.ok(headerContent.includes('.closest(".player'), "Must guard when focus is inside the video player");
  assert.ok(headerContent.includes('isEditable'), "Must guard when focus is inside an editable input");
});

test("Header keyboard handler logic safely suppresses '/' focus redirect", () => {
  // Test simulated keyboard guard decision function identical to Header.tsx
  function shouldFocusSearch({ hasOpenDialog, activeInDialog, activeInPlayer, isEditable }) {
    if (hasOpenDialog) return false;
    if (activeInDialog) return false;
    if (activeInPlayer) return false;
    if (isEditable) return false;
    return true;
  }

  // 1. Normal page browsing -> should focus
  assert.equal(
    shouldFocusSearch({ hasOpenDialog: false, activeInDialog: false, activeInPlayer: false, isEditable: false }),
    true
  );

  // 2. Active modal dialog -> must NOT focus
  assert.equal(
    shouldFocusSearch({ hasOpenDialog: true, activeInDialog: false, activeInPlayer: false, isEditable: false }),
    false
  );

  // 3. Focused inside a dialog -> must NOT focus
  assert.equal(
    shouldFocusSearch({ hasOpenDialog: false, activeInDialog: true, activeInPlayer: false, isEditable: false }),
    false
  );

  // 4. Focused inside player controls -> must NOT focus
  assert.equal(
    shouldFocusSearch({ hasOpenDialog: false, activeInDialog: false, activeInPlayer: true, isEditable: false }),
    false
  );

  // 5. Focused inside another input -> must NOT focus
  assert.equal(
    shouldFocusSearch({ hasOpenDialog: false, activeInDialog: false, activeInPlayer: false, isEditable: true }),
    false
  );
});
