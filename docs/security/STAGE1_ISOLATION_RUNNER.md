# Lolixco Stage 1 — Network Isolation Test Runner

## 1. Overview and Architecture

Lolixco Stage 1 enforces multi-layered fail-closed test isolation to ensure that test execution cannot perform outbound network connections, inspect or exfiltrate workstation secrets, or modify production catalogs and private audit databases.

The isolation model operates at two independent boundaries:
1. **Operating System / Kernel Network Namespace Boundary:** Network egress is denied at the Linux kernel boundary (`unshare -rn` or Docker `--network none`). The network namespace possesses only the loopback interface `lo` with zero routing table entries.
2. **Process and Application Layer Boundary:** In-process interceptors (`tests/register-ts.mjs`, `tests/isolated-child-process.mjs`, and `scripts/youtube-api.mjs`) sanitize process environment variables, strip credentials (`YOUTUBE_DATA_API_KEY`, `AWS_SECRET_ACCESS_KEY`, `NODE_OPTIONS`, `NODE_PATH`), and intercept runtime networking (`fetch`, `http.request`, `https.request`, `net.connect`, `tls.connect`).

---

## 2. Supported Test Environments

### Primary Supported Environment: Linux Host or GitHub Actions Runner
- **OS:** Linux (Ubuntu 22.04 LTS / 24.04 LTS or compatible Debian-based distribution, kernel >= 3.8).
- **Permissions:** Unprivileged user namespaces (`kernel.unprivileged_userns_clone=1` / standard Ubuntu default). No root or sudo privileges required.
- **Tools:** `unshare` (from `util-linux`) and `ip` (from `iproute2`).

### Container Environment (Alternative / CI):
- **Runtime:** Docker or Podman.
- **Flags:** `--network none --read-only=false`.
- **User:** Non-root user with no access to workstation secrets or Docker socket.

---

## 3. Preparation vs. Isolated Execution Workflow

Dependency installation and test execution are strictly separated:

```bash
# Phase 1: Preparation (External network permitted)
pnpm install --frozen-lockfile
pip install -r server/recsys/requirements.txt "jsonschema[format-nongpl]"

# Phase 2: Test Execution (External network DENIED at kernel boundary)
npm test
```

`npm test` invokes `node scripts/run-isolated-tests.mjs`.

---

## 4. Isolation Runner Mechanics (`scripts/run-isolated-tests.mjs`)

When `npm test` runs:
1. **Platform Validation:** The runner immediately verifies `process.platform === "linux"`. Unsupported platforms fail closed.
2. **Environment Sanitization:** An explicit allowlisted environment (`buildSanitizedEnvironment()`) is constructed before launching child processes. `NODE_OPTIONS`, `NODE_PATH`, `npm_*`, and any credentials matching `/KEY|SECRET|TOKEN|AUTH|PASS|CRED/i` are strictly stripped.
3. **OS Boundary Self-Inspection:** The runner inspects `/proc/net/dev`, `/proc/net/route`, and `/proc/net/ipv6_route`. If `/proc` evidence is missing, unreadable, empty, malformed, or if any non-loopback interfaces or routes exist, it fails closed.
4. **Empirical Network Probes:** Inside the isolated boundary, the runner verifies:
   - Loopback communication on `127.0.0.1` binds and connects successfully.
   - Outbound IPv4 socket connect to documentation address `198.51.100.1` immediately produces `ENETUNREACH` or `EHOSTUNREACH` from the kernel.
   - Outbound IPv6 socket connect to documentation address `2001:db8::1` immediately produces `ENETUNREACH`.
5. **Namespace Launch with Mandatory Loopback:** If not yet isolated, the runner spawns:
   ```bash
   unshare -rn sh -c 'ip link set lo up || { echo "[LOLIXCO SECURITY FATAL] Failed to configure loopback interface in isolated network namespace" >&2; exit 1; }; exec "$@"' -- "$NODE_EXEC" "$RUNNER_SCRIPT" "$@"
   ```
   Positional arguments are passed after `--` to prevent any shell metacharacter expansion or argument injection.
6. **Mandatory Loopback Setup:** If `ip link set lo up` fails, execution halts immediately with a non-zero exit code. Tests are never started after a failed loopback initialization.
7. **Anti-Tampering:** If `LOLIXCO_KERNEL_ISOLATED=1` is asserted in an unisolated environment, the runner detects route presence and halts immediately with exit code 1.
8. **No Silent Fallback:** If `unshare` is missing or unprivileged user namespaces are disabled, the runner exits with code 1. It never falls back to unisolated execution.

---

## 5. Descendant and Subprocess Isolation

Because network namespace isolation is enforced at the kernel boundary:
- All child processes spawned by Node.js (`execSync`, `spawn`, `fork`, `execFileSync`) inherit the same isolated network namespace.
- Descendants, grandchildren, and external executables (such as `curl`, `git`, or `python3`) are physically unable to send packets outside the machine.
- Local loopback connections (such as mock HTTP test servers on `127.0.0.1`) remain fully functional.

---

## 6. GitHub Actions CI Configuration

In `.github/workflows/frontend-ci.yml`, tests run on `ubuntu-latest`:

```yaml
- name: Run unit and regression tests
  run: pnpm test
```

Because GitHub Actions `ubuntu-latest` has unprivileged user namespaces enabled by default, `node scripts/run-isolated-tests.mjs` automatically and transparently establishes the kernel network namespace, validates loopback operation, and executes the complete test suite under verified kernel network isolation.

---

## 7. Known Limitations

- **Native Windows / macOS:** Neither OS natively provides Linux network namespaces without a virtualization layer. On Windows or macOS, developers must execute tests inside Docker (`docker run --network none ...`) or inside WSL2 with unprivileged user namespaces enabled.
