# Add homepage prototype and fix local media loading under base paths

The repository currently contains only its initial README and ignore rules. This adds the existing React/Vite homepage prototype and fixes its root-relative media paths, which returned 404 when the app was served under `/lolixco/`.

Posters, video and brand images now resolve against Vite's configured base. A build-time audit rejects missing or invalid local media. Failed thumbnails get an accessible fallback; failed video loads can be retried without replacing the existing A–B loop implementation. All original media and reference files are included, and the existing README/ignore contents are retained.

Validation:
- TypeScript and production build passed.
- 7 unit tests passed.
- All 20 media/brand assets returned HTTP 200 with correct bytes/MIME and decoded successfully at root and `/lolixco/`; video playback and 206 byte ranges passed.
- All 77 production files, including fonts, scripts and styles, returned HTTP 200 and matched local bytes.
- A–B looping, playback controls, search, filters, member preview, keyboard focus and seven responsive viewport checks passed.
- Injected thumbnail/video failures recover through fallback/retry.

This remains a frontend prototype using original geometric posters and a shared silent test clip. Authentication, uploads and advanced Immersion remain deferred. No deployment is included. See `docs/product/ASSET_REPAIR.md` and `docs/product/verification/asset-fix/` for evidence.
