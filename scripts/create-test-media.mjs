import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
const require = createRequire(process.env.RUNTIME_MODULES + "/package.json");
const { chromium } = require("playwright");
const browser = await chromium.launch({ headless: true, channel: "msedge" });
const page = await browser.newPage();
await page.goto("http://127.0.0.1:5173", { waitUntil: "networkidle" });
const bytes = await page.evaluate(async () => {
  const c = document.createElement("canvas");
  c.width = 960;
  c.height = 540;
  const ctx = c.getContext("2d");
  const img = new Image();
  img.src = "/media/art-0.svg";
  await img.decode();
  const stream = c.captureStream(24);
  const recorder = new MediaRecorder(stream, {
    mimeType: "video/webm;codecs=vp8",
    videoBitsPerSecond: 600000,
  });
  const chunks = [];
  recorder.ondataavailable = (e) => chunks.push(e.data);
  const done = new Promise(
    (resolve) =>
      (recorder.onstop = async () =>
        resolve(
          Array.from(
            new Uint8Array(
              await new Blob(chunks, { type: "video/webm" }).arrayBuffer(),
            ),
          ),
        )),
  );
  recorder.start();
  let start = performance.now();
  await new Promise((resolve) => {
    const draw = () => {
      const t = (performance.now() - start) / 1000;
      ctx.drawImage(img, 0, 0, 960, 540);
      ctx.fillStyle = "#ffed9c";
      for (let i = 0; i < 14; i++) {
        ctx.globalAlpha = 0.2 + 0.4 * Math.sin(t + i) ** 2;
        ctx.beginPath();
        ctx.arc(
          (i * 71 + t * 12) % 960,
          80 + ((i * 37) % 300),
          1.5,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      if (t < 12) requestAnimationFrame(draw);
      else resolve();
    };
    draw();
  });
  recorder.stop();
  const result = await done;
  stream.getTracks().forEach((t) => t.stop());
  return result;
});
writeFileSync("public/media/motion-study.webm", Buffer.from(bytes));
await browser.close();
console.log("Original silent 12-second browser test fixture created.");
