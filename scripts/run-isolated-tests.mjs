#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import net from "node:net";
import os from "node:os";

export const __projectRoot = fileURLToPath(new URL("../", import.meta.url));

/**
 * Explicit allowlist of environment variables permitted into isolated test processes.
 * Workstation secrets, credentials, tokens, npm variables, NODE_OPTIONS, and NODE_PATH
 * are strictly excluded.
 */
export const ALLOWED_ENV_VARS = new Set([
  "PATH",
  "HOME",
  "USER",
  "LOGNAME",
  "SHELL",
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
  "TERM",
  "TMPDIR",
  "CI",
  "GITHUB_ACTIONS",
  "GITHUB_WORKSPACE",
]);

/**
 * Constructs an explicit, sanitized environment dictionary for test execution.
 * Completely strips all startup preload hooks (NODE_OPTIONS, NODE_PATH), credentials,
 * and workstation secrets.
 */
export function buildSanitizedEnvironment(sourceEnv = process.env, overrides = {}) {
  const sanitized = {};

  for (const [key, value] of Object.entries(sourceEnv)) {
    if (typeof value !== "string") continue;
    // Strictly skip NODE_OPTIONS, NODE_PATH, and npm internals
    if (key === "NODE_OPTIONS" || key === "NODE_PATH" || key.startsWith("npm_")) {
      continue;
    }
    // Strictly skip any variable matching secret or credential patterns
    if (/KEY|SECRET|TOKEN|AUTH|PASS|CRED/i.test(key)) {
      continue;
    }
    // Include only explicitly allowed environment variables
    if (ALLOWED_ENV_VARS.has(key)) {
      sanitized[key] = value;
    }
  }

  // Enforce deterministic test isolation flags
  sanitized.NODE_ENV = "test";
  sanitized.LOLIXCO_TEST_MODE = "1";
  sanitized.LOLIXCO_TEST_ISOLATION = "1";

  // Apply explicit overrides
  for (const [k, v] of Object.entries(overrides)) {
    if (v === undefined || v === null) {
      delete sanitized[k];
    } else {
      sanitized[k] = String(v);
    }
  }

  return sanitized;
}

/**
 * Validates operating system evidence of network isolation via Linux /proc filesystem.
 * Strictly fails closed if the platform is not Linux, if /proc evidence is missing,
 * unreadable, empty, malformed, or if any non-loopback network interfaces or routes exist.
 *
 * @param {string} [procDir="/proc"] - Custom proc directory for testing mock inputs
 * @returns {{ isolated: boolean, reason?: string, details?: any }}
 */
export function checkProcNetworkIsolation(procDir = "/proc") {
  // 1. Explicitly reject unsupported non-Linux platforms
  if (process.platform !== "linux" && procDir === "/proc") {
    return {
      isolated: false,
      reason: `unsupported_platform: kernel network isolation requires Linux (detected: ${process.platform})`,
    };
  }

  const devPath = resolve(procDir, "net/dev");
  const routePath = resolve(procDir, "net/route");
  const ipv6RoutePath = resolve(procDir, "net/ipv6_route");

  // 2. /proc/net/dev MUST exist and be readable
  if (!existsSync(devPath)) {
    return {
      isolated: false,
      reason: "missing_proc_net_dev: /proc/net/dev is absent or unreadable",
    };
  }

  let devContent;
  try {
    devContent = readFileSync(devPath, "utf-8");
  } catch (err) {
    return {
      isolated: false,
      reason: `unreadable_proc_net_dev: ${err.message}`,
    };
  }

  if (!devContent || typeof devContent !== "string" || !devContent.includes(":")) {
    return {
      isolated: false,
      reason: "malformed_proc_net_dev: /proc/net/dev is empty or missing interface header",
    };
  }

  const lines = devContent.split("\n").filter((l) => l.includes(":"));
  const interfaces = lines.map((l) => l.split(":")[0].trim()).filter(Boolean);

  if (interfaces.length === 0) {
    return {
      isolated: false,
      reason: "malformed_proc_net_dev: zero network interfaces parsed from /proc/net/dev",
    };
  }

  // In an isolated network namespace, ONLY 'lo' may exist
  const nonLoopback = interfaces.filter((iface) => iface !== "lo");
  if (nonLoopback.length > 0) {
    return {
      isolated: false,
      reason: `non_loopback_interfaces_detected: [${nonLoopback.join(", ")}]`,
      details: { interfaces, nonLoopback },
    };
  }

  if (!interfaces.includes("lo")) {
    return {
      isolated: false,
      reason: "missing_loopback_interface: 'lo' interface is missing from /proc/net/dev",
    };
  }

  // 3. /proc/net/route (IPv4) MUST exist and indicate zero external routes
  if (!existsSync(routePath)) {
    return {
      isolated: false,
      reason: "missing_proc_net_route: /proc/net/route is absent or unreadable",
    };
  }

  let routeContent;
  try {
    routeContent = readFileSync(routePath, "utf-8");
  } catch (err) {
    return {
      isolated: false,
      reason: `unreadable_proc_net_route: ${err.message}`,
    };
  }

  const routeLines = routeContent.trim().split("\n").filter(Boolean);
  if (routeLines.length === 0 || !routeLines[0].includes("Iface")) {
    return {
      isolated: false,
      reason: "malformed_proc_net_route: /proc/net/route is empty or missing header",
    };
  }

  // An isolated network namespace with zero external interfaces has ONLY the header line
  if (routeLines.length > 1) {
    return {
      isolated: false,
      reason: `ipv4_routes_detected: ${routeLines.length - 1} route entries present in /proc/net/route`,
      details: { routeCount: routeLines.length - 1 },
    };
  }

  // 4. /proc/net/ipv6_route (IPv6) check if present
  if (existsSync(ipv6RoutePath)) {
    try {
      const v6Content = readFileSync(ipv6RoutePath, "utf-8").trim();
      const v6Lines = v6Content.split("\n").filter(Boolean);
      for (const line of v6Lines) {
        const parts = line.trim().split(/\s+/);
        // The last field in /proc/net/ipv6_route is the interface name
        const iface = parts[parts.length - 1];
        if (iface && iface !== "lo" && iface !== "*") {
          return {
            isolated: false,
            reason: `ipv6_routes_detected: route via non-loopback interface '${iface}' present`,
          };
        }
      }
    } catch {
      // If unreadable, fail closed
      return {
        isolated: false,
        reason: "unreadable_proc_net_ipv6_route",
      };
    }
  }

  return { isolated: true };
}

/**
 * Performs empirical socket-level negative and positive network probes.
 * Verifies at the OS socket boundary that:
 * 1. Loopback communication on 127.0.0.1 is fully functional.
 * 2. External IPv4 egress (e.g. to RFC 5737 TEST-NET-2 198.51.100.1) is blocked with ENETUNREACH / EHOSTUNREACH.
 * 3. External IPv6 egress (e.g. to RFC 3849 2001:db8::1) is blocked with ENETUNREACH.
 *
 * @returns {Promise<{ verified: boolean, reason?: string, details?: any }>}
 */
export async function verifyNetworkIsolationProbes() {
  // 1. Positive loopback test: verify we can bind and connect on 127.0.0.1
  const loopbackOk = await new Promise((resolve) => {
    let server;
    try {
      server = net.createServer();
      server.listen(0, "127.0.0.1", () => {
        const port = server.address().port;
        const client = net.connect(port, "127.0.0.1");
        client.on("connect", () => {
          client.destroy();
          server.close(() => resolve({ ok: true }));
        });
        client.on("error", (err) => {
          server.close(() => resolve({ ok: false, error: err.message, code: err.code }));
        });
      });
      server.on("error", (err) => {
        resolve({ ok: false, error: err.message, code: err.code });
      });
    } catch (err) {
      resolve({ ok: false, error: err.message });
    }
  });

  if (!loopbackOk.ok) {
    return {
      verified: false,
      reason: `loopback_verification_failed: ${loopbackOk.error || "cannot establish loopback connection"} (code: ${loopbackOk.code || "unknown"})`,
    };
  }

  // 2. Negative external IPv4 egress probe to non-routable documentation address 198.51.100.1
  const ipv4Probe = await new Promise((resolve) => {
    let socket;
    const timer = setTimeout(() => {
      if (socket) socket.destroy();
      resolve({ blocked: false, code: "ETIMEOUT" });
    }, 500);

    try {
      socket = net.connect(80, "198.51.100.1");
      socket.on("connect", () => {
        clearTimeout(timer);
        socket.destroy();
        resolve({ blocked: false, code: "CONNECTED" });
      });
      socket.on("error", (err) => {
        clearTimeout(timer);
        // Under true OS kernel network isolation with no route, kernel immediately returns ENETUNREACH or EHOSTUNREACH
        if (err.code === "ENETUNREACH" || err.code === "EHOSTUNREACH" || err.code === "EADDRNOTAVAIL") {
          resolve({ blocked: true, code: err.code });
        } else {
          resolve({ blocked: false, code: err.code, message: err.message });
        }
      });
    } catch (err) {
      clearTimeout(timer);
      resolve({ blocked: true, code: err.code || "ERR_SOCKET_SYNC" });
    }
  });

  if (!ipv4Probe.blocked) {
    return {
      verified: false,
      reason: `negative_ipv4_probe_failed: outbound socket was not denied by kernel (result: ${ipv4Probe.code})`,
      details: ipv4Probe,
    };
  }

  // 3. Negative external IPv6 egress probe to documentation address 2001:db8::1
  const ipv6Probe = await new Promise((resolve) => {
    let socket;
    const timer = setTimeout(() => {
      if (socket) socket.destroy();
      resolve({ blocked: false, code: "ETIMEOUT" });
    }, 500);

    try {
      socket = net.connect(80, "2001:db8::1");
      socket.on("connect", () => {
        clearTimeout(timer);
        socket.destroy();
        resolve({ blocked: false, code: "CONNECTED" });
      });
      socket.on("error", (err) => {
        clearTimeout(timer);
        if (err.code === "ENETUNREACH" || err.code === "EHOSTUNREACH" || err.code === "EADDRNOTAVAIL" || err.code === "EINVAL") {
          resolve({ blocked: true, code: err.code });
        } else {
          resolve({ blocked: false, code: err.code, message: err.message });
        }
      });
    } catch (err) {
      clearTimeout(timer);
      resolve({ blocked: true, code: err.code || "ERR_SOCKET_SYNC" });
    }
  });

  if (!ipv6Probe.blocked) {
    return {
      verified: false,
      reason: `negative_ipv6_probe_failed: outbound IPv6 socket was not denied by kernel (result: ${ipv6Probe.code})`,
      details: ipv6Probe,
    };
  }

  return { verified: true };
}

/**
 * Synchronously checks whether the current process is running inside a verified
 * isolated network namespace via /proc evidence.
 */
export function isKernelNetworkIsolated() {
  const procCheck = checkProcNetworkIsolation();
  return procCheck.isolated;
}

/**
 * Main runner entry point.
 */
async function main() {
  const rawArgs = process.argv.slice(2);

  // Validate arguments: reject dangerous characters or injection attempts
  for (const arg of rawArgs) {
    if (typeof arg !== "string" || arg.includes("\0")) {
      console.error("[LOLIXCO SECURITY FATAL] Invalid argument containing null byte detected.");
      process.exit(1);
    }
  }

  // Check if we are already inside a verified isolated network boundary
  const procCheck = checkProcNetworkIsolation();

  if (procCheck.isolated) {
    // Perform live empirical network verification probes
    const probeCheck = await verifyNetworkIsolationProbes();
    if (!probeCheck.verified) {
      console.error(
        `[LOLIXCO SECURITY FATAL] Empirical network isolation probe failed: ${probeCheck.reason}`
      );
      process.exit(1);
    }

    // Inside verified kernel boundary: construct sanitized environment
    const testEnv = buildSanitizedEnvironment(process.env, {
      LOLIXCO_KERNEL_ISOLATED: "1",
    });

    const testFiles = rawArgs.length > 0 ? rawArgs : ["tests/*.test.mjs"];
    const nodeArgs = ["--import", "./tests/register-ts.mjs", "--test", ...testFiles];

    // Spawn test suite using process.execPath with explicit sanitized environment and positional args
    const child = spawnSync(process.execPath, nodeArgs, {
      cwd: __projectRoot,
      stdio: "inherit",
      env: testEnv,
    });

    process.exit(child.status ?? (child.signal ? 1 : 0));
  }

  // If LOLIXCO_KERNEL_ISOLATED was claimed by caller, but /proc check failed, reject fail-closed!
  if (process.env.LOLIXCO_KERNEL_ISOLATED === "1") {
    console.error(
      `[LOLIXCO SECURITY FATAL] LOLIXCO_KERNEL_ISOLATED=1 was claimed, but operating system isolation check failed: ${procCheck.reason}`
    );
    process.exit(1);
  }

  // Check platform support before attempting unshare
  if (process.platform !== "linux") {
    console.error(
      `[LOLIXCO SECURITY FATAL] Linux operating system required for kernel network isolation (detected: ${process.platform}). Unisolated execution is prohibited.`
    );
    process.exit(1);
  }

  // Attempt to establish isolation via unshare -rn with explicit loopback initialization
  const scriptPath = fileURLToPath(import.meta.url);
  const sanitizedHostEnv = buildSanitizedEnvironment(process.env);

  // Use positional parameters to avoid any shell interpolation or metacharacter expansion
  const unshareCmd =
    'ip link set lo up || { echo "[LOLIXCO SECURITY FATAL] Failed to configure loopback interface in isolated network namespace" >&2; exit 1; }; exec "$@"';

  const unshareArgs = [
    "-rn",
    "sh",
    "-c",
    unshareCmd,
    "--",
    process.execPath,
    scriptPath,
    ...rawArgs,
  ];

  const unshareResult = spawnSync("unshare", unshareArgs, {
    cwd: __projectRoot,
    stdio: "inherit",
    env: sanitizedHostEnv,
  });

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
      "Unisolated test execution is strictly prohibited. Tests require verified OS network namespace or container isolation."
    );
    process.exit(1);
  }

  process.exit(unshareResult.status ?? (unshareResult.signal ? 1 : 0));
}

// Only run main if executed directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}

