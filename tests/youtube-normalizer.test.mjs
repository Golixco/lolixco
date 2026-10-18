import test from "node:test";
import assert from "node:assert/strict";

import { normalizeYouTubeUrl } from "../scripts/youtube-normalizer.mjs";
import { normalizeYouTubeUrl as normalizeTs } from "../src/utils/youtube.ts";

test("YOUTUBE NORMALIZER: extracts canonical 11-char ID from standard watch URLs", () => {
  const cases = [
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://youtube.com/watch?v=dQw4w9WgXcQ",
    "https://m.youtube.com/watch?v=dQw4w9WgXcQ",
    "http://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "youtube.com/watch?v=dQw4w9WgXcQ",
  ];

  for (const url of cases) {
    const res = normalizeYouTubeUrl(url);
    assert.equal(res.valid, true, `Should accept: ${url}`);
    assert.equal(res.videoId, "dQw4w9WgXcQ");
    assert.equal(res.canonicalUrl, "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    assert.equal(res.urlFormatHint, "video");

    const tsRes = normalizeTs(url);
    assert.equal(tsRes.valid, true);
    assert.equal(tsRes.videoId, "dQw4w9WgXcQ");
  }
});

test("YOUTUBE NORMALIZER: strips tracking parameters and extracts clean ID", () => {
  const url = "https://www.youtube.com/watch?v=dQw4w9WgXcQ&si=tracking123&feature=share&t=30s&utm_source=test";
  const res = normalizeYouTubeUrl(url);
  assert.equal(res.valid, true);
  assert.equal(res.videoId, "dQw4w9WgXcQ");
  assert.equal(res.canonicalUrl, "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
});

test("YOUTUBE NORMALIZER: extracts canonical ID from youtu.be shortlinks", () => {
  const cases = [
    "https://youtu.be/dQw4w9WgXcQ",
    "http://youtu.be/dQw4w9WgXcQ",
    "https://youtu.be/dQw4w9WgXcQ?t=15&feature=shared",
    "youtu.be/dQw4w9WgXcQ",
  ];

  for (const url of cases) {
    const res = normalizeYouTubeUrl(url);
    assert.equal(res.valid, true, `Should accept shortlink: ${url}`);
    assert.equal(res.videoId, "dQw4w9WgXcQ");
    assert.equal(res.canonicalUrl, "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  }
});

test("YOUTUBE NORMALIZER: handles /shorts/ URLs and reports short format hint", () => {
  const shortsUrl = "https://www.youtube.com/shorts/sH0FfH6_yQI?feature=share";
  const res = normalizeYouTubeUrl(shortsUrl);
  assert.equal(res.valid, true);
  assert.equal(res.videoId, "sH0FfH6_yQI");
  assert.equal(res.canonicalUrl, "https://www.youtube.com/watch?v=sH0FfH6_yQI");
  assert.equal(res.urlFormatHint, "short");
});

test("YOUTUBE NORMALIZER: handles /embed/ URLs", () => {
  const embedUrl = "https://www.youtube.com/embed/dQw4w9WgXcQ?enablejsapi=1";
  const res = normalizeYouTubeUrl(embedUrl);
  assert.equal(res.valid, true);
  assert.equal(res.videoId, "dQw4w9WgXcQ");
  assert.equal(res.canonicalUrl, "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
});

test("YOUTUBE NORMALIZER: cross-batch identity test: watch and shorts links produce identical canonical ID", () => {
  const watchUrl = "https://www.youtube.com/watch?v=abc123DEF_-";
  const shortsUrl = "https://www.youtube.com/shorts/abc123DEF_-";
  const youtuUrl = "https://youtu.be/abc123DEF_-";

  const res1 = normalizeYouTubeUrl(watchUrl);
  const res2 = normalizeYouTubeUrl(shortsUrl);
  const res3 = normalizeYouTubeUrl(youtuUrl);

  assert.equal(res1.videoId, "abc123DEF_-");
  assert.equal(res2.videoId, "abc123DEF_-");
  assert.equal(res3.videoId, "abc123DEF_-");
  assert.equal(res1.canonicalUrl, res2.canonicalUrl);
  assert.equal(res2.canonicalUrl, res3.canonicalUrl);
});

test("YOUTUBE NORMALIZER: strictly rejects non-YouTube and malicious domains", () => {
  const maliciousUrls = [
    "https://vimeo.com/123456789",
    "https://fakeyoutube.com/watch?v=dQw4w9WgXcQ",
    "https://youtube.com.attacker.com/watch?v=dQw4w9WgXcQ",
    "https://google.com/search?q=youtube",
    "https://dailymotion.com/video/x12345",
  ];

  for (const url of maliciousUrls) {
    const res = normalizeYouTubeUrl(url);
    assert.equal(res.valid, false, `Should reject domain: ${url}`);
    assert.match(res.error, /Unsupported or non-YouTube domain/);
  }
});

test("YOUTUBE NORMALIZER: strictly rejects malformed, too short, or too long video IDs", () => {
  const invalidIdUrls = [
    "https://www.youtube.com/watch?v=shortId", // 7 chars
    "https://www.youtube.com/watch?v=tooLongVideoId123", // 17 chars
    "https://www.youtube.com/watch?v=invalid!@#$%^", // invalid chars
    "https://www.youtube.com/watch?v=", // empty v
    "https://www.youtube.com/watch", // missing query
    "https://youtu.be/", // missing path
  ];

  for (const url of invalidIdUrls) {
    const res = normalizeYouTubeUrl(url);
    assert.equal(res.valid, false, `Should reject malformed ID in: ${url}`);
  }
});

test("YOUTUBE NORMALIZER: strictly rejects channel, playlist, and search URLs", () => {
  const nonVideoUrls = [
    "https://www.youtube.com/@LofiGirl",
    "https://www.youtube.com/channel/UC123456789",
    "https://www.youtube.com/c/CreatorName",
    "https://www.youtube.com/playlist?list=PL123456789",
    "https://www.youtube.com/results?search_query=anime+edits",
  ];

  for (const url of nonVideoUrls) {
    const res = normalizeYouTubeUrl(url);
    assert.equal(res.valid, false, `Should reject non-video link: ${url}`);
  }
});

test("YOUTUBE NORMALIZER: handles empty, null, or whitespace inputs safely", () => {
  assert.equal(normalizeYouTubeUrl("").valid, false);
  assert.equal(normalizeYouTubeUrl("   ").valid, false);
  assert.equal(normalizeYouTubeUrl(null).valid, false);
  assert.equal(normalizeYouTubeUrl(undefined).valid, false);
});
