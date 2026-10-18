# YouTube Integration Architecture & Source-Aware System

## 1. Executive Summary

Mission 7B implements YouTube-powered content discovery, curation, embedded playback, and Immersion Mode for Lolixco while strictly protecting all previously merged missions (5, 6B, 6C, 7A). The platform operates on official Google YouTube APIs without downloading, re-encoding, stripping ads, or re-hosting third-party media.

## 2. Core Architecture Components

```
                   ┌──────────────────────────────────────────────┐
                   │             Owner Batch Intake               │
                   │ (CLI batch-of-10 URL ingestion + audit log)  │
                   └──────────────────────┬───────────────────────┘
                                          │
                                          ▼
                   ┌──────────────────────────────────────────────┐
                   │          YouTube Data API v3 Client          │
                   │ (videos.list: snippet, contentDetails, status│
                   │  batched up to 50 IDs, quota-safe, mockable) │
                   └──────────────────────┬───────────────────────┘
                                          │
                                          ▼
                   ┌──────────────────────────────────────────────┐
                   │         Editorial Review & Validation        │
                   │ (Owner category/fandom check, keyword hints, │
                   │  format verification, stable ID allocation)  │
                   └──────────────────────┬───────────────────────┘
                                          │
                                          ▼
                   ┌──────────────────────────────────────────────┐
                   │       Sanitized Catalog Compiler             │
                   │ (Strips private notes, preserves 17 baseline │
                   │  demo edits, outputs typed src/data/edits.ts)│
                   └──────────────────────┬───────────────────────┘
                                          │
                 ┌────────────────────────┴────────────────────────┐
                 ▼                                                 ▼
┌─────────────────────────────────┐               ┌─────────────────────────────────┐
│     Source-Aware Discovery      │               │     Embedded Playback Engine    │
│  - Home mixed-format feed       │               │  - YouTubePlayer (IFrame API)   │
│  - Dedicated Shorts viewer      │               │  - PlaybackCoordinator (solo)   │
│  - Edit of the Moment (daily)   │               │  - Immersion Mode Queue & Viewer│
│  - Python RecSys (zero-drift)   │               │  - Responsive 16:9 / 9:16       │
└─────────────────────────────────┘               └─────────────────────────────────┘
```

## 3. Source-Aware Data Model

To support both baseline demo videos, future licensed media, and YouTube embeds without architectural breakage, a discriminated union `VideoSourceType` is established across frontend and backend:

```typescript
export type VideoSourceType = "local_demo" | "youtube_embed" | "licensed_local_media";

export interface Edit {
  id: number;                          // 0–16: demo, 100–199: video, 200–299: short
  title: string;                       // Public title (YouTube or editorial)
  category: string;                    // Canonical Lolixco category
  tags: string[];                      // Discovery tags (exact lowercase)
  description: string;
  creator: string;                     // Attributed creator or channel
  poster: string;                      // Highest official YouTube thumbnail or local poster
  source: string;                      // Canonical YouTube URL or local file path
  duration: string;                    // mm:ss format
  trending: boolean;
  format?: "video" | "short";          // Explicit aspect ratio classification
  fandomIds?: string[];                // Registered fandom IDs (e.g., valorant)
  sourceType?: VideoSourceType;        // Discriminant: "local_demo" | "youtube_embed"
  youtubeVideoId?: string;             // Canonical 11-char ID
  channelTitle?: string;               // Original uploader channel name
  channelId?: string;                  // UC... ID
  sourceUrl?: string;                  // Canonical watch link
}
```

### Safety Guard
A YouTube watch URL is **never** passed into an HTML5 `<video>` source tag. The frontend uses `isYouTubeEmbed(edit)` and `isLocalDemo(edit)` to select the proper player adapter.

## 4. Playback Coordinator & Audio Isolation

To prevent competing audio when navigating between the Featured player, Shorts viewer, and Immersion Mode, `playbackCoordinator` enforces single-active audio:
- `registerPlayer(id, pauseCallback)`: registers player instance.
- `notifyPlaying(id)`: immediately pauses any other playing instance.
- `pauseAll()`: pauses all players upon modal dialog open or tab invisibility (`visibilitychange`).

## 5. Edit of the Moment

- **Rule**: Deterministic daily selection grounded in the UTC day (`YYYYMMDD` seed).
- **Stability**: Returns the exact same featured item for all visitors worldwide throughout the same UTC day, avoiding React render flashes.
- **Consecutive Avoidance**: Compares today's hash with yesterday's hash to prevent back-to-back repetitions when catalog pool size $\ge 2$.
- **Shuffle Action**: An accessible manual Shuffle button increments `shuffleOffset` to explore other items.
- **Baseline Invariant**: Until genuine YouTube items are approved, `initialLandscapeVideo` strictly defaults to baseline demo Edit 0 ("Into the Light"), preserving merged test baselines.

## 6. Immersion Mode Algorithm

Immersion Mode provides a continuous viewing flow starting from any category or fandom:
1. **Opening Stage**: Up to 3 distinct items matching the visitor's entry context (e.g., Gaming $\to$ Valorant). If fewer match, only available items play. No forced artificial duplicates.
2. **Discovery Stage**: Seamless transition into a global shuffled discovery pool across all eligible categories.
3. **Reshuffling**: When the pool is exhausted, the entire catalog is reshuffled without repeating the immediately preceding video.
4. **Auto-Advance**: Transitions to the next item when YouTube reports state `ENDED`.
5. **Bounded Error Recovery**: Automatically skips unplayable or restricted items up to 3 consecutive times before presenting an honest recovery prompt.
6. **Visibility Awareness**: Automatically pauses when the browser tab is hidden or minimized.
