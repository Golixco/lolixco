# Lolixco homepage

Local React + TypeScript + Vite frontend prototype. No deployment or backend.

## Run

Use Node.js 22+ and pnpm:

```sh
pnpm install
pnpm dev
pnpm build
pnpm typecheck
pnpm test
```

If a host's pnpm wrapper interferes, equivalent checks are `node node_modules/typescript/bin/tsc --noEmit`, `node node_modules/vite/bin/vite.js build`, and `node --test tests/*.test.mjs`.

## Structure

- `src/components/layout`: header, sidebar, replaceable supplied brand assets.
- `src/components/home`: categories, cards, sections, Immersion preview.
- `src/components/video`: native player, timeline, A–B loop UI.
- `src/components/ui`: native modal dialog with focus restoration.
- `src/data`: typed sample metadata and pure search/loop rules.
- `src/styles`: tokens, layout, responsive and motion rules.
- `public/media`: original SVG artwork and silent local test video.
- `scripts`: reproducible artwork, test fixture, browser verification.
- `tests`: search and loop edge cases.
- `docs/product`: product specs, references, verification evidence.

## Preview behavior

Sign In / Sign Up opens a clearly labeled local member preview. No credentials are requested, persisted, or sent. Refresh resets the preview. Every edit uses the same original 12-second silent motion study, with distinct demo posters. No creator uploads, commercial audio, or third-party footage is included.

Browser tests use Playwright and installed Microsoft Edge. Set `RUNTIME_MODULES` to a directory containing Playwright, start the Vite server, and run `node scripts/verify.mjs`. The media fixture is already included; regeneration is optional using `scripts/create-test-media.mjs` with the same environment and server.

See `docs/product/DELIVERY.md` for tested behavior and limitations.

## Original repository introduction

# lolixco
An immersive platform for discovering creative edits, exploring fandoms, and empowering editors with AI-powered insights.

## Asset validation

`pnpm check:assets` verifies all referenced local media and brand assets; Vite also runs this check before serving/building. Public asset URLs respect Vite's base path. See `docs/product/ASSET_REPAIR.md` for the fix, reproducible audit commands and fresh browser evidence.
