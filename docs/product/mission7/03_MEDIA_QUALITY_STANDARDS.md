# Mission 7A — Media Validation and Quality Standards

## 1. Overview

Lolixco delivers a high-impact, audio-visual showcase for curated anime, gaming, and cinematic edits. To maintain instantaneous playback, crisp rendering across mobile and desktop displays, and consistent sound levels, all owner-supplied media must conform to standard technical quality guidelines.

This document outlines:
1. Video encoding standards for landscape videos (`16:9`) and vertical Shorts (`9:16`).
2. Audio standards (loudness normalization, sample rate, peak control).
3. Poster artwork guidelines.
4. Deterministic asset validation procedures (magic byte checks and ffprobe verification recipes).

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

When owner media assets are staged, they are subject to automated verification at two levels:

### 5.1 Local Deterministic Validation (`scripts/validate-content.mjs`)
Implemented in Node.js with zero external dependencies:
- **File Existence:** File must exist at the referenced path in `public/media/`.
- **Non-Zero Size:** Files with 0 bytes are rejected.
- **Header & Magic Bytes Verification:**
  - `.svg`: Root `<svg` element signature.
  - `.png`: Header signature `89504e470d0a1a0a`.
  - `.jpg` / `.jpeg`: SOI marker `ffd8ff`.
  - `.webp`: RIFF container with `WEBP` fourcc (`RIFF....WEBP`).
  - `.webm`: EBML header ID `1a45dfa3`.
  - `.mp4` / `.m4v`: ISO Base Media File Format `ftyp` box at byte offset 4 (`66747970`).

### 5.2 Deep Media Inspection Recipes (FFprobe / FFMpeg)
When incoming media batches are staged, operators execute the following verification recipes:

#### Check Video Dimensions, Aspect Ratio, and Codec:
```bash
ffprobe -v error -select_streams v:0 \
  -show_entries stream=width,height,codec_name,r_frame_rate,duration \
  -of default=noprint_wrappers=1:nokey=1 input.mp4
```

#### Check Integrated Loudness (LUFS / LKFS):
```bash
ffmpeg -i input.mp4 -af ebur128=framelog=verbose -f null - 2>&1 | grep "I:"
```

#### Standard Encoding Recipe for Landscape Videos (`16:9`):
```bash
ffmpeg -i raw_input.mov -c:v libx264 -preset slow -crf 19 \
  -vf "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2" \
  -pix_fmt yuv420p -c:a aac -b:a 192k -ar 48000 \
  -af "loudnorm=I=-14:LRA=7:tp=-1.0" \
  -movflags +faststart output_1080p.mp4
```

#### Standard Encoding Recipe for Vertical Shorts (`9:16`):
```bash
ffmpeg -i raw_short.mov -c:v libx264 -preset slow -crf 19 \
  -vf "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2" \
  -pix_fmt yuv420p -c:a aac -b:a 192k -ar 48000 \
  -af "loudnorm=I=-14:LRA=7:tp=-1.0" \
  -movflags +faststart output_short.mp4
```
