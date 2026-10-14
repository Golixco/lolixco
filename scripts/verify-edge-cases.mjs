import { createRequire } from "node:module";
import assert from "node:assert/strict";
const require = createRequire(process.env.RUNTIME_MODULES + "/package.json");
const { chromium } = require("playwright");
const browser = await chromium.launch({ headless: true, channel: "msedge" });
const page = await browser.newPage({
  viewport: { width: 360, height: 800 },
  reducedMotion: "reduce",
});
await page.goto("http://127.0.0.1:5173", { waitUntil: "networkidle" });
assert.equal(await page.locator("video").evaluate((v) => v.paused), true);
await page.locator(".player").focus();
await page.keyboard.press("k");
await page.waitForFunction(() => !document.querySelector("video").paused);
await page.keyboard.press("k");
assert.equal(await page.locator("video").evaluate((v) => v.paused), true);
await page.getByRole("button", { name: "A–B Loop", exact: true }).click();
await page.getByRole("spinbutton", { name: "Loop start seconds" }).fill("3");
await page.getByRole("spinbutton", { name: "Loop end seconds" }).fill("2");
assert.ok(
  await page
    .getByRole("button", { name: "Loop Segment", exact: true })
    .isDisabled(),
);
await page.getByRole("button", { name: "A–B Loop", exact: true }).click();
await page
  .getByRole("button", { name: "Watch Echoes of Tomorrow" })
  .first()
  .click();
await page.getByRole("button", { name: "A–B Loop", exact: true }).click();
assert.equal(
  await page
    .getByRole("spinbutton", { name: "Loop start seconds" })
    .inputValue(),
  "",
);
await page.getByRole("button", { name: "Toggle navigation" }).click();
await page.keyboard.press("Escape");
assert.equal(
  await page.evaluate(() => document.activeElement.id),
  "nav-toggle",
);
await page
  .getByRole("textbox", { name: "Search", exact: true })
  .fill("nonsense");
await page.getByRole("link", { name: "Lolixco home" }).click();
assert.ok(await page.locator("video").isVisible());
await page.route("**/media/motion-study.webm", (r) => r.abort());
await page.reload({ waitUntil: "networkidle" });
assert.ok(
  await page.getByText("Demo video unavailable.", { exact: false }).isVisible(),
);
console.log(
  "Reduced motion, keyboard playback, invalid loop, reset, focus return, brand navigation and missing-media checks passed",
);
await browser.close();
