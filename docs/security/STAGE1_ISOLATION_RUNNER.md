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
1. **Self-Inspection:** The runner inspects `/proc/net/dev`, `/proc/net/route`, and probes outbound UDP/TCP sockets to determine if the process is already executing inside an isolated network namespace.
2. **Namespace Launch:** If not isolated, the runner re-executes under:
   ```bash
   unshare -rn sh -c "ip link set lo up 2>/dev/null; node --import ./tests/register-ts.mjs --test tests/*.test.mjs"
   ```
3. **Fail-Closed Verification:** Inside the child process, the runner verifies:
   - Only `lo` exists in `/proc/net/dev`.
   - `/proc/net/route` contains 0 routes.
   - Outbound socket attempts immediately produce `ENETUNREACH` (errno 101).
   - Local loopback (`127.0.0.1`, `::1`) operates normally for deterministic test fixtures and mock servers.
4. **Anti-Tampering:** If `LOLIXCO_KERNEL_ISOLATED=1` is passed in an unisolated environment, the runner detects route presence and fails closed immediately with exit code 1.
5. **No Silent Fallback:** If `unshare` is missing or unprivileged user namespaces are disabled, the runner exits with code 1 and prints remediation instructions. It never runs unisolated.

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
