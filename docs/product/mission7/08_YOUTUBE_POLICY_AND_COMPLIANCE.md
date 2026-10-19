# YouTube Developer Policy & Compliance Analysis

## 1. Statutory Context & Principles

Lolixco uses the official Google YouTube Data API v3 and YouTube IFrame Player API. This mission adheres to YouTube API Developer Policies, Terms of Service, and Required Minimum Functionality guidelines.

## 2. Policy Enforcement Matrix

| Policy Area | YouTube Mandate | Lolixco Implementation |
| :--- | :--- | :--- |
| **Media Hosting** | Do not download, rip, or re-host video streams. | All embedded playback streams directly from YouTube servers via the official IFrame Player API. Zero video downloads or FFmpeg stream capturing. |
| **Player Integrity** | Do not hide, obstruct, or modify player branding, ads, or controls. | Player wrapper applies standard 16:9 / 9:16 responsive sizing without overlays covering controls. Native YouTube UI and watermarks remain completely unobstructed. |
| **Referrer & Origin** | Pass valid domain origin to IFrame API. | Player config sets `origin: window.location.origin` and `enablejsapi: 1`. |
| **API Secret Protection** | Do not expose API keys in client-side bundles. | Metadata fetching is executed strictly in server-side/owner CLI tools (`scripts/youtube-api.mjs`). The Vite frontend bundle contains zero API keys. |
| **Attribution** | Maintain original creator and channel attribution. | Channel name, channel ID, and original source URLs are preserved. If Lolixco assigns an editorial category, it is marked as Lolixco curation and not as YouTube's taxonomy. |
| **External Navigation** | Provide clear navigation to original YouTube content. | Error states and external links provide direct links to `https://www.youtube.com/watch?v=VIDEO_ID`. |
| **Metrics & Analytics** | Do not fabricate or misrepresent viewer counts or rankings. | Lolixco displays zero fake view counters, subscriber metrics, or artificial trending ranks. Edit of the Moment is labeled as editorial curation, not YouTube trending. |
| **Data Retention & Refresh**| Do not store API data indefinitely without refresh mechanisms. | Stored audit records track `lastMetadataVerification`. Revalidation workflows check video availability, embed eligibility, and status updates. |

## 3. Quota Management & Caching

1. **Request Batching**: Video metadata requests use `videos.list` with comma-delimited ID lists (up to 50 IDs per request), consuming 1 quota unit for up to 50 items instead of 50 units.
2. **Search Minimization**: No programmatic `search.list` calls (which cost 100 units each). Owner provides direct video URLs which are normalized to IDs.
3. **Local Audit Cache**: Fetched metadata is persisted in `content/audit/youtube-intake-audit.json`, eliminating redundant API calls.
4. **Mock Mode for CI**: All automated tests run against mocked API responses without consuming real quota or requiring live credentials.
