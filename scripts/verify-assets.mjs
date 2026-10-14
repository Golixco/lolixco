import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { assetPaths } from "../src/data/media-assets.js";
import { checkAssets } from "./check-assets.mjs";
const require = createRequire(
  process.env.RUNTIME_MODULES
    ? `${process.env.RUNTIME_MODULES}/package.json`
    : import.meta.url,
);
const { chromium } = require("playwright");
const base = new URL(process.env.ASSET_BASE_URL || "http://127.0.0.1:5173/");
const output =
  process.env.VERIFY_OUTPUT_DIR || "docs/product/verification/asset-fix";
await mkdir(output, { recursive: true });
const files = checkAssets();
const browser = await chromium.launch({ headless: true, channel: "msedge" });
try {
  const page = await browser.newPage({
    viewport: { width: 1672, height: 941 },
    reducedMotion: "reduce",
  });
  const failures = [],
    pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("response", (response) => {
    if (response.status() >= 400)
      failures.push({ url: response.url(), status: response.status() });
  });
  await page.goto(base.href, { waitUntil: "networkidle" });
  await page
    .locator("img")
    .evaluateAll((images) =>
      images.forEach((image) => (image.loading = "eager")),
    );
  await page.waitForFunction(() =>
    [...document.images].every(
      (image) => image.complete && image.naturalWidth > 0,
    ),
  );
  await page.evaluate(() => document.fonts.ready);
  const report = [];
  for (const asset of assetPaths) {
    const url = new URL(asset, base).href;
    const response = await page.request.get(url);
    assert.equal(response.status(), 200, url);
    assert.equal(
      (await response.body()).length,
      files.find((file) => file.path === asset).bytes,
      `${asset} must not return an HTML fallback`,
    );
    const type = response.headers()["content-type"];
    assert.match(
      type,
      asset.endsWith(".svg")
        ? /image\/svg\+xml/
        : asset.endsWith(".png")
          ? /image\/png/
          : /video\/webm/,
    );
    const decoded = await page.evaluate(
      async ({ url, video }) => {
        if (video) {
          const element = document.createElement("video");
          element.muted = true;
          element.preload = "auto";
          element.src = url;
          await new Promise((resolve, reject) => {
            const timer = setTimeout(
              () => reject(new Error("video load timeout")),
              10000,
            );
            element.onloadeddata = () => {
              clearTimeout(timer);
              resolve();
            };
            element.onerror = () => {
              clearTimeout(timer);
              reject(new Error("video decode failed"));
            };
          });
          await element.play();
          await new Promise((resolve) => setTimeout(resolve, 250));
          const result = {
            width: element.videoWidth,
            height: element.videoHeight,
            duration: element.duration,
            advanced: element.currentTime > 0,
          };
          element.pause();
          return result;
        }
        const image = new Image();
        image.src = url;
        await image.decode();
        return { width: image.naturalWidth, height: image.naturalHeight };
      },
      { url, video: asset.endsWith(".webm") },
    );
    assert.ok(decoded.width > 0 && decoded.height > 0);
    if (asset.endsWith(".webm")) {
      assert.ok(decoded.advanced);
      assert.ok(Number.isFinite(decoded.duration));
    }
    report.push({
      asset,
      status: response.status(),
      type,
      bytes: files.find((file) => file.path === asset).bytes,
      decoded,
    });
  }
  const range = await page.request.get(
    new URL("media/motion-study.webm", base).href,
    { headers: { Range: "bytes=0-1023" } },
  );
  assert.equal(range.status(), 206);
  assert.equal((await range.body()).length, 1024);
  assert.match(range.headers()["content-range"], /^bytes 0-1023\//);
  const references = await page
    .locator("img,video")
    .evaluateAll((elements) =>
      elements.flatMap((element) =>
        [element.getAttribute("src"), element.getAttribute("poster")].filter(
          Boolean,
        ),
      ),
    );
  for (const reference of references)
    assert.ok(new URL(reference, base).pathname.startsWith(base.pathname));
  assert.deepEqual(failures, []);
  assert.deepEqual(pageErrors, []);
  await page.screenshot({ path: `${output}/desktop.png`, fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `${output}/mobile.png`, fullPage: true });
  // Failures are deliberately injected only after the clean-load audit.
  await page.route("**/media/art-5.svg", (route) => route.abort());
  await page.reload({ waitUntil: "networkidle" });
  const card = page.getByRole("button", {
    name: "Watch Neon Soul",
    exact: true,
  });
  await card.scrollIntoViewIfNeeded();
  await card.getByText("Thumbnail unavailable").waitFor();
  await card.click();
  assert.equal(await page.locator(".hero-info h1").textContent(), "Neon Soul");
  await page.unroute("**/media/art-5.svg");
  await page.route("**/media/motion-study.webm", (route) => route.abort());
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Retry video" }).waitFor();
  await page.unroute("**/media/motion-study.webm");
  await page.getByRole("button", { name: "Retry video" }).click();
  await page.waitForFunction(
    () => document.querySelector("video").readyState >= 2,
  );
  assert.equal(
    await page.getByRole("button", { name: "Retry video" }).count(),
    0,
  );
  await writeFile(
    `${output}/assets.json`,
    JSON.stringify(
      {
        base: base.href,
        assets: report,
        byteRangeStatus: 206,
        renderedReferences: references,
        cleanLoadHttpErrors: [],
        pageErrors,
        fallbackAndRetry: "passed",
      },
      null,
      2,
    ),
  );
  console.log(
    `PASS: ${report.length} assets exist, HTTP 200, correct MIME/bytes, browser decoding; video plays and range request returns 206. Thumbnail fallback and video retry pass at ${base.href}`,
  );
} finally {
  await browser.close();
}
