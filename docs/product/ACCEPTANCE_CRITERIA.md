# Verification and acceptance

## Purpose and scope
Build and TypeScript must pass. Search and loop boundary tests must pass. Browser checks must cover all seven specified sizes, guest/member state, sidebar, search, filters, actual playback, quality, loop repeats and mobile dismissal.

## Current status
See verification/results.json and screenshots. Pixel-identical visual acceptance is not claimed: imagery is placeholder, member avatar is an initial, and 16:9 cards make rows taller than the mockup.

## References
Approved supplied references: references/home-feed/guest-desktop-v1.png, references/home-feed/member-desktop-v1.png, references/brand/lolixco-wordmark-reference.png and references/brand/lolixco-icon-reference.png. These are visual targets, not licensed footage or proof of backend functionality. Verification screenshots are implementation captures, not newly approved designs.

## Layout and interaction
Shared tokens and breakpoints live in src/styles/index.css. Inter serves UI labels; Rajdhani serves editorial headings. Category chips scroll horizontally. CSS grids reflow when navigation width changes. Below 1100px Up Next moves below the player; below 768px navigation becomes a drawer and header search occupies its own row.

## States and accessibility
Selected chips expose aria-pressed; navigation exposes aria-current. Empty search results explain how to recover. Player buffering and missing media are visible status messages. Native dialogs explain deferred functionality. Keyboard focus remains visible and reduced motion is respected.

## Constraints and testable acceptance
Frontend-only; no account database, credential storage, uploads, analytics, paid service or deployment. Validate relevant behavior with the unit tests and scripts/verify.mjs. Required sizes: 1672x941, 1440x900, 1280x800, 1024x768, 768x1024, 390x844 and 360x800. No horizontal page overflow is allowed.
