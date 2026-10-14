import { writeFileSync } from "node:fs";
const specs = {
  README: [
    "Product specification index",
    "Read MASTER_BRIEF.md as the supplied source of truth. PRODUCT_VISION, UI, NAVIGATION, HOME_FEED, SEARCH_AND_TAGS, VIDEO_PLAYER, ACCESSIBILITY and ACCEPTANCE_CRITERIA describe the implemented local prototype. DELIVERY.md records evidence and remaining work.",
    "All four supplied references were inspected. No prior implementation or product documentation existed.",
  ],
  PRODUCT_VISION: [
    "Creative edit discovery",
    "Provide unlimited guest discovery and playback, compact editorial feed sections, and a clearly separated member layout preview. AI analysis, uploads, accounts and advanced Immersion behavior are excluded.",
    "Implemented homepage foundation; product backend remains deferred.",
  ],
  UI: [
    "Dark cinematic interface",
    "Use #050505 background, #0B0D10 surfaces, #FFF000 highlights, Inter UI text and Rajdhani editorial titles. Rounded native components, thin borders, restrained hover and focus emphasis. Supplied wordmark is displayed with outer black margins trimmed by CSS; source pixels are unchanged.",
    "Original geometric artwork replaces screenshot artwork. Fixed header, 164px expanded or 72px collapsed navigation. 875px maximum featured player and 335px Up Next preserve right-side empty space.",
  ],
  NAVIGATION: [
    "Responsive application navigation",
    "Home and Explore show actual local feeds. Shorts, Immersion, Settings and Help open explanatory dialogs. Guest Following, Library and Creator Studio open member-preview entry. Member personal destinations explain missing account services.",
    "Hamburger expands desktop sidebar. Below 768px it opens a native modal navigation drawer with Escape, dismissal, focus containment and restoration. Member actions appear only after explicit preview entry.",
  ],
  HOME_FEED: [
    "Homepage composition",
    "Categories, featured player, four Up Next recommendations, Popular Right Now, Immersion banner, Trending Edits, and More to Discover. All cards select the featured video and reset its loop state.",
    "17 clearly labeled sample edits. No fabricated views, verification badges, guest limits, signup promotion panels, user summary cards or View All controls. Mobile shows two Up Next cards to keep the section compact.",
  ],
  SEARCH_AND_TAGS: [
    "Local metadata discovery",
    "Search title, description, category, creator and tags case-insensitively. All typed words must match metadata. Category and query filters combine. Trending filters the explicit trending flag; New reverses the sample order.",
    "Immediate results, clear action, accessible field with exact Search placeholder, result count, and purposeful empty state. No search backend or AI claims.",
  ],
  VIDEO_PLAYER: [
    "Native playback and segment looping",
    "Native HTML5 WebM source, muted autoplay where permitted, play/pause, mute, seek, buffer track, fullscreen, supported picture-in-picture, original source resolution, and A–B loop. No fake quality options or captions.",
    "Original silent 960x540 motion study, approximately 12 seconds. Set A and B from current position or numeric inputs; require at least 0.5 seconds, A before B, and bounds within duration. Enable, exit, adjust, clear. Seeking outside an active loop clamps to it. Markers provide labeled seek buttons. Frame-perfect looping is not promised.",
  ],
  ACCESSIBILITY: [
    "Keyboard and touch operation",
    "Semantic buttons and navigation, skip link, visible focus, named controls, category pressed state and active page indication. Native dialog manages modal focus; focus restores to the opener. Player shortcuts only operate on the focused player and ignore nested controls.",
    "Reduced-motion disables transitions and autoplay. Reduced-data prevents autoplay when the browser exposes that preference. Offscreen or background playback pauses. Full screen-reader and cross-browser audits remain future work.",
  ],
  ACCEPTANCE_CRITERIA: [
    "Verification and acceptance",
    "Build and TypeScript must pass. Search and loop boundary tests must pass. Browser checks must cover all seven specified sizes, guest/member state, sidebar, search, filters, actual playback, quality, loop repeats and mobile dismissal.",
    "See verification/results.json and screenshots. Pixel-identical visual acceptance is not claimed: imagery is placeholder, member avatar is an initial, and 16:9 cards make rows taller than the mockup.",
  ],
};
for (const [name, [purpose, scope, status]] of Object.entries(specs))
  writeFileSync(
    `docs/product/${name}.md`,
    `# ${purpose}\n\n## Purpose and scope\n${scope}\n\n## Current status\n${status}\n\n## References\nApproved supplied references: references/home-feed/guest-desktop-v1.png, references/home-feed/member-desktop-v1.png, references/brand/lolixco-wordmark-reference.png and references/brand/lolixco-icon-reference.png. These are visual targets, not licensed footage or proof of backend functionality. Verification screenshots are implementation captures, not newly approved designs.\n\n## Layout and interaction\nShared tokens and breakpoints live in src/styles/index.css. Inter serves UI labels; Rajdhani serves editorial headings. Category chips scroll horizontally. CSS grids reflow when navigation width changes. Below 1100px Up Next moves below the player; below 768px navigation becomes a drawer and header search occupies its own row.\n\n## States and accessibility\nSelected chips expose aria-pressed; navigation exposes aria-current. Empty search results explain how to recover. Player buffering and missing media are visible status messages. Native dialogs explain deferred functionality. Keyboard focus remains visible and reduced motion is respected.\n\n## Constraints and testable acceptance\nFrontend-only; no account database, credential storage, uploads, analytics, paid service or deployment. Validate relevant behavior with the unit tests and scripts/verify.mjs. Required sizes: 1672x941, 1440x900, 1280x800, 1024x768, 768x1024, 390x844 and 360x800. No horizontal page overflow is allowed.\n`,
  );
