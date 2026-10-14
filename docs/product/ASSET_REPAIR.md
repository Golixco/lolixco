# Media asset repair and Git proposal

## Findings

At the root local URL, all original media files existed and loaded: 17 SVG thumbnails, two PNG brand images, and one WebM clip. The previous turn had stopped its local server. No missing or corrupt source file was reproduced at the root URL.

A separate reproducible path bug was found: building with `--base /lolixco/` left JavaScript media/brand references pointing at `/media/` and `/brand/`. The preview server returned 404 for `/media/art-0.svg` and `/media/motion-study.webm`, while `/lolixco/media/art-0.svg` returned 200. This is a confirmed failure mode, not a claim about the unavailable original browser session.

## Changes

- Central media manifest and Vite BASE_URL-aware source URLs for all feed posters, video sources, and brand images.
- Build-time asset validation: missing, empty or incorrectly typed local assets fail before output is shipped. Literal media/brand references in CSS/components are also inspected.
- Accessible thumbnail fallback that keeps the card usable if a future request fails.
- Video retry button and stale error clearing after successful reload. Existing A–B logic is unchanged.
- Local-file/HTTP/decode/range audit, production-output byte audit, regression tests and fresh screenshots.
- Connected this directory to `https://github.com/GolixcoAI/lolixco.git` on `codex/homepage-media-assets`, based on the existing `origin/main` commit. No checkout copied over local work. Original local README and ignore files were preserved inside `.git/local-originals/`; upstream contents are retained in the proposed files.

## Evidence

- All 20 media/brand files: nonempty, valid signatures, HTTP 200, correct MIME types, exact byte counts, and browser decoding at root and `/lolixco/`.
- Video: actual playback advancement, finite duration, 960x540 decoded dimensions, HTTP 206 range response.
- All 77 built files (including every emitted font, CSS and JavaScript file): HTTP 200 and bytes identical to local production output.
- Thumbnail failure injection and video failure/retry: passed.
- 7 unit tests: passed, including missing-asset rejection and base URL handling.
- TypeScript and production build: passed.
- Existing browser interactions and all seven responsive sizes: passed. A–B repeating playback, invalid segment handling, reset, seeking, pause/mute, search, categories, member preview and mobile focus behavior remain working.

Evidence is in `verification/asset-fix/`, with subpath tests in its `subpath/` folder and interaction captures in `regression/`. Earlier verification captures were retained.

## Proposed PR scope

The remote repository has only a README and ignore file. Consequently this PR adds the existing homepage foundation as well as this asset repair; it is not a two-file patch against an already-published frontend. No existing remote source code is replaced. There are no deletions, force pushes, deployments, credentials, or backend changes.

## Run and audit

The development server is running at http://127.0.0.1:5173/ and is to remain running until the user requests a stop.

```sh
pnpm dev
pnpm check:assets
pnpm typecheck
pnpm test
pnpm build
```

Browser audits require Playwright (use RUNTIME_MODULES for the bundled installation) and installed Microsoft Edge:

```sh
node scripts/verify-assets.mjs
node scripts/verify.mjs
node scripts/verify-edge-cases.mjs
```

Set ASSET_BASE_URL for a subpath preview and VERIFY_OUTPUT_DIR to retain separate results. `node scripts/verify-build-assets.mjs .verification-dist` verifies every emitted production file against that preview.
