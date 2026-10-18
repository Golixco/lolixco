# Mission 7A — Media Validation and Quality Standards

## 1. Overview

Lolixco delivers a high-impact, audio-visual showcase for curated anime, gaming, and cinematic edits. To maintain instantaneous playback, crisp rendering across mobile and desktop displays, and consistent sound levels, all owner-supplied media must conform to standard technical quality guidelines.

This document outlines:
1. Video encoding standards for landscape videos (`16:9`) and vertical Shorts (`9:16`).
2. Audio standards (loudness normalization, sample rate, peak control).
3. Poster artwork guidelines.
4. Deterministic asset validation procedures (streaming magic byte checks, containment rules, and ffprobe inspection recipes).

---

## 2. Video Encoding Specifications

### 2.1 Standard Landscape Videos (`format: "video"`)

Landscape videos render in the primary Video Player and discovery grids across desktop and tablet viewports.

| Attribute | Specification | Minimum Acceptable |
| :--- | :--- | :--- |
| **Aspect Ratio** | `16:9` (1.777:1) | `16:9` strict (no letterboxing / pillarboxing) |
| **Target Resolution** | `1920x1080` (1080p) or `2560x1440` (1440p) | `1280x720` (720p) |
| **Container** | MP4 (`.mp4`) or WebM (`.webm`) | MP4 (`.mp4`) |
| **Video Codec** | H.264 / AVC (High Profile, Level 4.2) or AV1 | H.264 (Main Profile) |
| **Pixel Format** | YUV 4:2:0 (`yuv420p`), 8-bit | YUV 4:2:0 |
| **Frame Rate** | Constant Frame Rate (CFR): 30 fps or 60 fps | 23.976 fps to 60 fps |
| **Video Bitrate** | 6,000 to 10,000 kbps (1080p60) | 3,500 kbps (1080p30) |
| **GOP / Keyframe Interval** | 2 seconds (e.g. 120 frames at 60 fps) | Max 4 seconds |
| **Faststart Optimization** | `+faststart` (moov atom placed at start of file) | Mandatory for web streaming |

---

### 2.2 Curated Vertical Shorts (`format: "short"`)

Shorts render in the vertical modal viewer (`ShortsViewer`) optimized for mobile portrait screens and focused desktop vertical frames.

| Attribute | Specification | Minimum Acceptable |
| :--- | :--- | :--- |
| **Aspect Ratio** | `9:16` (0.5625:1) | `9:16` strict |
| **Target Resolution** | `1080x1920` (1080p vertical) | `720x1280` (720p vertical) |
| **Container** | MP4 (`.mp4`) or WebM (`.webm`) | MP4 (`.mp4`) |
| **Video Codec** | H.264 / AVC (High Profile) or AV1 | H.264 |
| **Pixel Format** | YUV 4:2:0 (`yuv420p`), 8-bit | YUV 4:2:0 |
| **Frame Rate** | Constant Frame Rate (CFR): 60 fps | 30 fps |
| **Video Bitrate** | 4,500 to 7,500 kbps (1080p60 vertical) | 2,500 kbps |
| **GOP / Keyframe Interval** | 1 to 2 seconds | Max 2 seconds |
| **Loop Seamlessness** | Audio and video cut points aligned for seamless looping | Clean end frame |
| **Faststart Optimization** | `+faststart` enabled | Mandatory |

---

## 3. Audio Normalization Standards

To prevent jarring volume jumps between adjacent edits (e.g. phonk edits vs. dialogue-driven series edits), all incoming media must conform to standard broadcast and streaming loudness targets:

| Metric | Target Standard | Tolerance |
| :--- | :--- | :--- |
| **Integrated Loudness** | `-14.0 LKFS / LUFS` (EBU R128 / ITU-R BS.1770-4) | ± 1.0 LUFS |
| **Maximum True Peak** | `-1.0 dBFS True Peak` | Strict ceiling (prevents inter-sample clipping) |
| **Audio Codec** | AAC-LC (MP4) or Opus (WebM) | AAC-LC |
| **Audio Bitrate** | 192 kbps (AAC) or 160 kbps (Opus) | Min 128 kbps |
| **Channels** | Stereo (2.0 channels) | Stereo |
| **Sample Rate** | 48,000 Hz (48 kHz) | 44,100 Hz (44.1 kHz) |

---

## 4. Poster Artwork Guidelines

Posters serve as preview cards on discovery feeds, search results, and video player pre-load screens.

| Format | Specification | Dimensions | Compression |
| :--- | :--- | :--- | :--- |
| **Landscape Poster** (`16:9`) | WebP or PNG | `1920x1080` (or `1280x720`) | WebP quality 85, `< 250 KB` |
| **Portrait Short Poster** (`9:16`) | WebP or PNG | `1080x1920` | WebP quality 85, `< 300 KB` |
| **Demo Posters** (Legacy) | SVG | Vector `viewBox="0 0 1600 900"` | Scalable, `< 20 KB` |

---

## 5. Media Validation Protocols

When owner media assets are staged, they are subject to automated verification across three distinct tiers:

### 5.1 Local Deterministic Validation (`scripts/validate-content.mjs`)
Implemented in Node.js with zero external runtime dependencies:
- **Streaming Header Inspection:** Rather than reading multi-megabyte video files into memory, the validator opens the file descriptor and reads only the initial header bytes (up to 64KB) to verify signatures.
- **Safe Directory Containment (`realpathSync`):** All local paths starting with `/media/` or `/brand/` are strictly verified using resolved real filesystem paths (`fs.realpathSync`). Any directory traversal (`../`) or symlinks inside `public/media` pointing to files outside permitted directories are immediately caught and rejected.
- **External URL Policy:** External URLs (`http://`, `https://`) are permitted during metadata preparation with a notice, but are strictly prohibited for production publication readiness (staged local assets are required).
- **Header & Magic Bytes Signatures:**
  - `.svg`: Root `<svg` element signature.
  - `.png`: Header signature `89504e470d0a1a0a`.
  - `.jpg` / `.jpeg`: SOI marker `ffd8ff`.
  - `.webp`: RIFF container with `WEBP` fourcc (`RIFF....WEBP`).
  - `.webm`: EBML header ID `1a45dfa3`.
  - `.mp4` / `.m4v`: ISO Base Media File Format `ftyp` box at byte offset 4 (`66747970`).

### 5.2 Technical Stream Metadata Inspection (`ffprobe`)
Queries stream metadata and container format descriptors to reconcile declared metadata with physical stream properties:
- **Container Duration Fallback:** Formats such as WebM/Matroska store media duration in EBML Segment information (`format.duration`) rather than in elementary stream packets. The inspector automatically falls back to container format duration when stream duration is absent, preventing duration checks from being bypassed.
- **Aspect Ratio & Resolution Reconciliation:**
  - Actual stream width and height are cross-checked against declared `media.aspectRatio` (`16:9`, `4:3`, `9:16`, `2.39:1`). Actual 16:9 footage declared as 4:3 (or vice versa) is strictly rejected.
  - Declared `media.width` and `media.height` are cross-checked against declared `media.aspectRatio` even during metadata intake.
  - Vertical Shorts (`format: "short"`) enforce a genuine `9:16` ratio (target `height / width` ~ 1.777, tolerance `1.70` to `1.86`).
- **Audio Stream & Codec Verification:**
  - When `media.audioCodec` is declared as `"aac"`, `"opus"`, or `"mp3"`, the validator confirms the physical presence of an audio stream and verifies that its normalized codec matches the declared codec.
  - If a file has no audio stream, declaring an audio codec is rejected.
  - If a file contains audio, declaring `media.audioCodec: "none"` is rejected.
- **Duration Cross-Checks & Tolerances:**
  - `record.duration` (display string, M:SS) is cross-checked against `record.durationMs` within ±1.0s tolerance. Contradictory values (e.g. `0:01` with `durationMs: 175000`) are rejected immediately.
  - Measured stream duration is cross-checked against declared `duration` and `durationMs` within ±3.0s tolerance.
  - **No Silent Certification:** If a required physical measurement cannot be obtained during publication mode, validation fails closed with a fatal error rather than silently certifying the file.

### 5.3 Full Playback Decode Integrity Verification (`ffmpeg`)
Crucially distinguished from stream metadata inspection: a truncated or partially written media file may retain sufficient container and track headers for `ffprobe` to report stream codecs and dimensions, yet fail completely when a video decoder attempts to render frames.
- **Full Bitstream Decode to Null Sink:** Publication readiness (`--mode publish`) executes an FFmpeg decode pass across the entire file (`ffmpeg -v error -xerror -i <file> -f null -`). Any non-zero exit code or decode error output is treated as a fatal publication failure.
- **Fail-Closed Tool Availability:** If `ffmpeg` or `ffprobe` is not installed or available in the environment during publication validation, the validator reports `decodeVerification: "INCOMPLETE (ffmpeg unavailable in environment; publication blocked)"` and `streamInspection: "INCOMPLETE (ffprobe unavailable in environment; publication blocked)"`, failing closed (`valid: false`). Incomplete verification is never approved for publication.
- **Preservation of Fast Intake Modes:** Faster metadata preparation (`--mode metadata`) and asset staging (`--mode assets`) modes remain fast and unblocked by decode verification, allowing offline metadata authoring and asset file staging without requiring full-length bitstream decoding.

