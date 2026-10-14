# Keyboard and touch operation

## Purpose and scope
Semantic buttons and navigation, skip link, visible focus, named controls, category pressed state and active page indication. Native dialog manages modal focus; focus restores to the opener. Player shortcuts only operate on the focused player and ignore nested controls.

## Current status
Reduced-motion disables transitions and autoplay. Reduced-data prevents autoplay when the browser exposes that preference. Offscreen or background playback pauses. Full screen-reader and cross-browser audits remain future work.

## References
Approved supplied references: references/home-feed/guest-desktop-v1.png, references/home-feed/member-desktop-v1.png, references/brand/lolixco-wordmark-reference.png and references/brand/lolixco-icon-reference.png. These are visual targets, not licensed footage or proof of backend functionality. Verification screenshots are implementation captures, not newly approved designs.

## Layout and interaction
Shared tokens and breakpoints live in src/styles/index.css. Inter serves UI labels; Rajdhani serves editorial headings. Category chips scroll horizontally. CSS grids reflow when navigation width changes. Below 1100px Up Next moves below the player; below 768px navigation becomes a drawer and header search occupies its own row.

## States and accessibility
Selected chips expose aria-pressed; navigation exposes aria-current. Empty search results explain how to recover. Player buffering and missing media are visible status messages. Native dialogs explain deferred functionality. Keyboard focus remains visible and reduced motion is respected.

## Constraints and testable acceptance
Frontend-only; no account database, credential storage, uploads, analytics, paid service or deployment. Validate relevant behavior with the unit tests and scripts/verify.mjs. Required sizes: 1672x941, 1440x900, 1280x800, 1024x768, 768x1024, 390x844 and 360x800. No horizontal page overflow is allowed.
