# Lolixco Stage 1 — Network Isolation Test Runner (v5)

## 1. Overview and Architecture

Lolixco Stage 1 enforces multi-layered, fail-closed test isolation to ensure that test execution cannot perform outbound network connections, inspect or exfiltrate workstation secrets, or modify production catalogs and private audit databases.

The isolation model operates at three independent boundaries:
1. **Initial Trusted Launch Boundary (`scripts/run-isolated-tests.sh`):** Establishes the clean execution boundary *before* any Node.js or npm process is invoked. It strips all inherited workstation startup hooks (`NODE_OPTIONS`, `NODE_PATH`), tokens, and credentials using an explicit allowlist and `env -i`, enforces Linux OS requirements, and spawns the network namespace via `unshare -rn`.
2. **Operating System / Kernel Network Namespace Boundary:** Network egress is denied at the Linux kernel boundary (`unshare -rn` or Docker `--network none`). The network namespace possesses only the loopback interface `lo` with zero routing table entries.
3. **Process and Application Layer Boundary:** In-process interceptors (`tests/register-ts.mjs`, `tests/isolated-child-process.mjs`, and `scripts/youtube-api.mjs`) sanitize process environment variables, strip credentials (`YOUTUBE_DATA_API_KEY`, `AWS_SECRET_ACCESS_KEY`, `NODE_OPTIONS`, `NODE_PATH`), and intercept runtime networking (`fetch`, `http.request`, `https.request`, `net.connect`, `tls.connect`).

---

## 2. Threat Model: Pre-Startup Execution and Preload Elimination

### Problem:
In Node.js, `NODE_OPTIONS` and `NODE_PATH` environment variables are evaluated by the Node runtime C++ initialization layer *before* any userland JavaScript, package script, or module executes. Therefore, if `npm test` runs directly in a dirty workstation environment where `NODE_OPTIONS="--require malicious-preload.js"` is set:
1. The host Node.js / npm process executes `malicious-preload.js` during runtime initialization.
2. An internal JavaScript runner cannot undo or prevent this earlier execution, even if it later deletes `process.env.NODE_OPTIONS`.

### Solution (v5 Trusted Entry Point):
1. The supported entry point is `./scripts/run-isolated-tests.sh` (which `npm test` and `npm run test:offline` wrap).
2. The launcher is a pure POSIX Bash script with `set -euo pipefail`.
3. It sanitizes the environment using `env -i` and an explicit allowlist (`PATH`, `HOME`, `USER`, `LOGNAME`, `SHELL`, `LANG`, `LC_ALL`, `TERM`, `TMPDIR`, `CI`, `GITHUB_*`).
4. It purges `NODE_OPTIONS`, `NODE_PATH`, credentials, and tokens.
5. It launches `unshare -rn` with mandatory loopback configuration (`ip link set lo up`) before invoking `node scripts/run-isolated-tests.mjs`.
6. Node.js only ever starts *inside* the verified, sanitized, and isolated network namespace.

---

## 3. Supported Test Environments

### Primary Supported Environment: Linux Host or GitHub Actions Runner
- **OS:** Linux (Ubuntu 22.04 LTS / Ubuntu 24.04 LTS or compatible Debian-based distribution, kernel >= 3.8).
- **Permissions:** Unprivileged user namespaces (`kernel.unprivileged_userns_clone=1` / Ubuntu standard). On Ubuntu 24.04, `kernel.apparmor_restrict_unprivileged_userns=0` may be set in CI environments.
- **Tools:** `unshare` (from `util-linux`) and `ip` (from `iproute2`).

### Container Environment (Alternative / CI):
- **Runtime:** Docker or Podman.
- **Flags:** `--network none --read-only=false`.
- **User:** Non-root user with no access to workstation secrets or Docker socket.

---

## 4. Preparation vs. Isolated Execution Workflow

Dependency installation and test execution are strictly separated:

```bash
# Phase 1: Preparation (External network permitted)
pnpm install --frozen-lockfile
pip install -r server/recsys/requirements.txt "jsonschema[format-nongpl]"

# Phase 2: Test Execution (External network DENIED at kernel boundary)
pnpm test
```

`pnpm test` invokes `./scripts/run-isolated-tests.sh`.

---

## 5. Strict Kernel Evidence Verification

`scripts/run-isolated-tests.mjs` inspects Linux kernel networking tables and rejects missing, empty, or malformed evidence:
1. **/proc/net/dev:**
   - Validates 2-line header structure.
   - Enforces exactly 16 numeric counter columns per interface.
   - Verifies that only the `lo` loopback interface exists. Any non-loopback device causes immediate abort.
2. **/proc/net/route:**
   - Validates all 11 column names (`Iface`, `Destination`, `Gateway`, `Flags`, `RefCnt`, `Use`, `Metric`, `Mask`, `MTU`, `Window`, `IRTT`).
   - Verifies 0 non-header route lines exist.
3. **/proc/net/ipv6_route:**
   - Validates 10 hex fields per line.
   - Verifies that only entries ending with interface `lo` or device `*` are present.
   - If missing or empty, requires explicit platform evidence that IPv6 is disabled on the host (`/proc/sys/net/ipv6/conf/all/disable_ipv6 == 1` or absence of `/proc/net/if_inet6`).

---

## 6. Empirical Network Probes

The runner executes active socket probes:
1. **Loopback Probe:** Successfully binds a server on `127.0.0.1` and establishes a client TCP connection.
2. **Outbound Probes:**
   - Attempts IPv4 TCP connection to `198.51.100.1:443`.
   - Attempts IPv6 TCP connection to `[2001:db8::1]:443` (or confirms explicit platform disabled status).
   - Only genuine kernel route denial (`ENETUNREACH`) is accepted as proof of network isolation.
   - Synchronous exceptions (`ERR_SOCKET_SYNC`), unexpected errors (`ECONNREFUSED`, `EHOSTUNREACH`), ambiguous codes (`EINVAL`, `EADDRNOTAVAIL`), timeouts (`ETIMEOUT`), and successful connections (`CONNECTED`) all fail verification immediately.

---

## 7. Protected-Audit Fixture Seams

To prevent regression tests from touching canonical workstation audit databases (`content/audit/*`) or metadata:
- Path protection helpers in `scripts/youtube-importer.mjs` support an injectable test seam `setProtectedRootsForTest()`.
- Tests create disposable protected directories (`tempProtectedDir`) and synthetic audit files.
- The path guard denies access before any filesystem metadata or read calls (`readerSpy` call count remains 0).
- Canonical production paths (`content/audit/`) remain permanently protected and cannot be weakened by test seams.

---

## 8. GitHub Actions CI Configuration

In `.github/workflows/frontend-ci.yml`, the runner is pinned to `ubuntu-24.04`:

```yaml
runs-on: ubuntu-24.04
steps:
  - name: Configure Linux user namespace permissions for isolation runner
    run: sudo sysctl -w kernel.apparmor_restrict_unprivileged_userns=0 || true

  - name: Verify kernel network namespace isolation pre-flight
    run: ./scripts/run-isolated-tests.sh --print-args "ci-preflight"

  - name: Run unit and regression tests (network isolated)
    run: pnpm test
```

---

## 9. Known Limitations

- **Native Windows / macOS:** Neither OS natively provides Linux network namespaces without a virtualization layer. On Windows or macOS, developers must execute tests inside Docker (`docker run --network none ...`) or inside WSL2 with unprivileged user namespaces enabled.

