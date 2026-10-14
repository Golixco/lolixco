import assert from "node:assert/strict";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, relative } from "node:path";
import { createHash } from "node:crypto";
const root = resolve(process.argv[2] || "dist");
const base = process.env.ASSET_BASE_URL || "http://127.0.0.1:5173/";
const output =
  process.env.VERIFY_OUTPUT_DIR || "docs/product/verification/asset-fix";
function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? files(resolve(directory, entry.name))
      : [resolve(directory, entry.name)],
  );
}
const report = [];
for (const file of files(root)) {
  const path = relative(root, file).replaceAll("\\", "/");
  const url = new URL(path, base).href;
  const response = await fetch(url);
  assert.equal(response.status, 200, url);
  const actual = Buffer.from(await response.arrayBuffer()),
    expected = readFileSync(file);
  assert.ok(actual.equals(expected), `${url} bytes differ from build`);
  report.push({
    path,
    status: response.status,
    bytes: actual.length,
    sha256: createHash("sha256").update(actual).digest("hex"),
  });
}
writeFileSync(
  `${output}/build-files.json`,
  JSON.stringify({ base, files: report }, null, 2),
);
console.log(
  `PASS: all ${report.length} production files, including every emitted font, script and stylesheet, load with HTTP 200 and match local file bytes.`,
);
