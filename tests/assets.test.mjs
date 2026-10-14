import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assetPaths, assetUrl } from "../src/data/media-assets.js";
import { checkAssets } from "../scripts/check-assets.mjs";

test("all referenced local assets exist and have valid format signatures", () => {
  assert.equal(checkAssets().length, 20);
  assert.equal(new Set(assetPaths).size, assetPaths.length);
});

test("asset URLs respect root, subpath and relative Vite bases", () => {
  assert.equal(assetUrl("media/art-0.svg", "/"), "/media/art-0.svg");
  assert.equal(
    assetUrl("/media/art-0.svg", "/lolixco/"),
    "/lolixco/media/art-0.svg",
  );
  assert.equal(
    assetUrl("media/motion-study.webm", "./"),
    "./media/motion-study.webm",
  );
});

test("asset checks fail before a build ships missing files", () => {
  const root = mkdtempSync(join(tmpdir(), "lolixco-asset-check-"));
  try {
    mkdirSync(join(root, "src"));
    writeFileSync(
      join(root, "src", "example.css"),
      "a {background:url('/media/missing.svg')}",
    );
    assert.throws(() => checkAssets(root), /media[\\/]missing.svg/);
  } finally {
    // This exact path was created by mkdtempSync above, outside the project.
    rmSync(root, { recursive: true });
  }
});
