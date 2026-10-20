#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __projectRoot = fileURLToPath(new URL("../", import.meta.url));

/**
 * Checks whether the current process is running inside a verified isolated network namespace
 * or container with no external network interfaces or routes (only loopback).
 */
export function isKernelNetworkIsolated() {
  try {
    // 1. Check network interfaces via /proc/net/dev
    if (existsSync("/proc/net/dev")) {
      const devContent = readFileSync("/proc/net/dev", "utf-8");
      const lines = devContent.split("\n").filter((l) => l.includes(":"));
      const interfaces = lines.map((l) => l.split(":")[0].trim());
      // Isolated environment must have ONLY "lo" (or no interfaces)
      const nonLoopback = interfaces.filter((iface) => iface !== "lo");
      if (nonLoopback.length > 0) {
        return false;
      }
    }

    // 2. Check routing table via /proc/net/route
    if (existsSync("/proc/net/route")) {
      const routeContent = readFileSync("/proc/net/route", "utf-8").trim();
      const routeLines = routeContent.split("\n");
      // Header line only means zero routes exist. If more than 1 line, external routes exist.
      if (routeLines.length > 1) {
        return false;
      }
    }

    return true;
  } catch {
    return false;
  }
}

async function main() {
  const args = process.argv.slice(2);

  // Check if we are already inside verified kernel network isolation
  if (isKernelNetworkIsolated() || process.env.LOLIXCO_KERNEL_ISOLATED === "1") {
    // Double check: if env var was claimed, verify via routing table that external routes are truly empty
    if (!isKernelNetworkIsolated()) {
      console.error(
        "[LOLIXCO SECURITY FATAL] LOLIXCO_KERNEL_ISOLATED was claimed, but external network interfaces or routes were detected in the process namespace."
      );
      process.exit(1);
    }

    // Execute tests with register-ts.mjs inside the verified isolated boundary
    const testFiles = args.length > 0 ? args : ["tests/*.test.mjs"];
    const nodeArgs = ["--import", "./tests/register-ts.mjs", "--test", ...testFiles];

    const child = spawnSync("node", nodeArgs, {
      cwd: __projectRoot,
      stdio: "inherit",
      env: {
        ...process.env,
        NODE_ENV: "test",
        LOLIXCO_TEST_MODE: "1",
        LOLIXCO_TEST_ISOLATION: "1",
        LOLIXCO_KERNEL_ISOLATED: "1",
      },
    });

    process.exit(child.status ?? (child.signal ? 1 : 0));
  }

  // Not yet in an isolated network namespace: attempt to establish isolation via unshare -rn
  const scriptPath = fileURLToPath(import.meta.url);
  const unshareCmd = `ip link set lo up 2>/dev/null; node "${scriptPath}" ${args.map((a) => `"${a}"`).join(" ")}`;

  const unshareResult = spawnSync(
    "unshare",
    ["-rn", "sh", "-c", unshareCmd],
    {
      cwd: __projectRoot,
      stdio: "inherit",
      env: {
        ...process.env,
        LOLIXCO_TEST_MODE: "1",
        LOLIXCO_TEST_ISOLATION: "1",
      },
    }
  );

  if (unshareResult.error) {
    if (unshareResult.error.code === "ENOENT") {
      console.error(
        "[LOLIXCO SECURITY FATAL] Linux 'unshare' utility is not installed. Kernel network isolation cannot be established."
      );
    } else {
      console.error(
        `[LOLIXCO SECURITY FATAL] Failed to spawn unshare network namespace: ${unshareResult.error.message}`
      );
    }
    console.error(
      "Unisolated test execution is strictly prohibited. Tests require kernel network namespace or container isolation."
    );
    process.exit(1);
  }

  if (unshareResult.status !== 0 && !isKernelNetworkIsolated()) {
    // If unshare exited with failure and was not inside the isolation
    process.exit(unshareResult.status ?? 1);
  }

  process.exit(unshareResult.status ?? 0);
}

main();
