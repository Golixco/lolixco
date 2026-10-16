import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("VideoCardSkeleton component structure and accessibility", () => {
  const content = fs.readFileSync("src/components/home/VideoCardSkeleton.tsx", "utf8");
  assert.ok(content.includes('aria-hidden="true"'), "Skeleton card must have aria-hidden='true'");
  assert.ok(content.includes('tabIndex={-1}'), "Skeleton card must have tabIndex={-1}");
  assert.ok(content.includes('skeleton-thumb'), "Skeleton card must contain skeleton thumbnail");
  assert.ok(content.includes('skeleton-shimmer'), "Skeleton card must contain shimmer layer");
  assert.ok(content.includes('skeleton-title'), "Skeleton card must contain skeleton title line");
  assert.ok(content.includes('skeleton-creator'), "Skeleton card must contain skeleton creator line");
  assert.ok(content.includes('skeleton-tag'), "Skeleton card must contain skeleton tag line");
});

test("DiscoveryGridSkeleton component structure and accessibility", () => {
  const content = fs.readFileSync("src/components/home/DiscoveryGridSkeleton.tsx", "utf8");
  assert.ok(content.includes('role="status"'), "Grid skeleton container must have role='status'");
  assert.ok(content.includes('aria-busy="true"'), "Grid skeleton container must have aria-busy='true'");
  assert.ok(content.includes('className="sr-only"'), "Must provide accessible screen-reader live region");
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
});
