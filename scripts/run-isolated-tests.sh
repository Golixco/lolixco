#!/usr/bin/env bash
# ==============================================================================
# Lolixco Trusted Security Test Launcher (v5)
# ==============================================================================
# This shell script establishes the trusted security-test execution boundary
# BEFORE any Node.js or npm process starts.
#
# Trust Boundary & Threat Model:
# 1. Any host Node.js / npm invocation in an untrusted workstation environment
#    evaluates inherited NODE_OPTIONS / NODE_PATH startup hooks before any
#    application JavaScript or package.json script executes.
# 2. To prevent execution of inherited workstation startup hooks, this launcher
#    runs outside Node's startup lifecycle.
# 3. It strips all inherited startup hooks (NODE_OPTIONS, NODE_PATH), credentials,
#    tokens, and workstation secrets using an explicit environment allowlist.
# 4. It enforces operating system platform verification (Linux required).
# 5. It establishes an isolated Linux network namespace (unshare -rn) or verifies
#    an existing container/namespace isolation boundary with loopback interface up.
# 6. Inside the isolated, sanitized environment, it spawns Node to run the test suite.
# ==============================================================================

set -euo pipefail

# 1. Operating system platform check: Linux required
CURRENT_OS="$(uname -s)"
if [ "$CURRENT_OS" != "Linux" ]; then
  echo "[LOLIXCO SECURITY FATAL] Kernel network isolation requires Linux (detected: $CURRENT_OS)." >&2
  echo "[LOLIXCO SECURITY FATAL] Unisolated test execution is strictly prohibited." >&2
  exit 1
fi

# 2. Sanitize environment before any Node/npm/Python process starts
# Explicit allowlist of permissible environment variables:
ALLOWED_PATH="${PATH:-/usr/local/bin:/usr/bin:/bin}"
ALLOWED_HOME="${HOME:-/tmp}"
ALLOWED_USER="${USER:-nobody}"
ALLOWED_LOGNAME="${LOGNAME:-nobody}"
ALLOWED_SHELL="${SHELL:-/bin/bash}"
ALLOWED_LANG="${LANG:-en_US.UTF-8}"
ALLOWED_LC_ALL="${LC_ALL:-C.UTF-8}"
ALLOWED_TERM="${TERM:-dumb}"
ALLOWED_TMPDIR="${TMPDIR:-/tmp}"
ALLOWED_CI="${CI:-}"
ALLOWED_GITHUB_ACTIONS="${GITHUB_ACTIONS:-}"
ALLOWED_GITHUB_WORKSPACE="${GITHUB_WORKSPACE:-}"

# Explicitly purge NODE_OPTIONS, NODE_PATH, and any credential/secret variables
unset NODE_OPTIONS NODE_PATH npm_config_token AWS_SECRET_ACCESS_KEY SECRET_API_KEY || true

# Find repository root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Function to check whether current shell is already inside a verified isolated network namespace
is_already_isolated() {
  # In an isolated network namespace, /proc/net/dev must only list lo and /proc/net/route has 0 routes
  if [ -r "/proc/net/dev" ] && [ -r "/proc/net/route" ]; then
    local non_lo_devs
    non_lo_devs=$(awk -F: '/:/{gsub(/^[ \t]+/, "", $1); if ($1 != "lo") print $1}' /proc/net/dev)
    local route_count
    route_count=$(grep -vc '^[[:space:]]*$' /proc/net/route || true)
    # Header is 1 line. If route_count == 1 (header only) and non_lo_devs is empty, we are in isolated namespace
    if [ -z "$non_lo_devs" ] && [ "$route_count" -le 1 ]; then
      return 0
    fi
  fi
  return 1
}

# 3. Check if already inside verified isolation
if is_already_isolated; then
  # Already in isolated namespace: configure loopback if down
  ip link set lo up 2>/dev/null || true

  # Launch Node with pristine allowlisted environment using env -i
  exec env -i \
    PATH="$ALLOWED_PATH" \
    HOME="$ALLOWED_HOME" \
    USER="$ALLOWED_USER" \
    LOGNAME="$ALLOWED_LOGNAME" \
    SHELL="$ALLOWED_SHELL" \
    LANG="$ALLOWED_LANG" \
    LC_ALL="$ALLOWED_LC_ALL" \
    TERM="$ALLOWED_TERM" \
    TMPDIR="$ALLOWED_TMPDIR" \
    CI="$ALLOWED_CI" \
    GITHUB_ACTIONS="$ALLOWED_GITHUB_ACTIONS" \
    GITHUB_WORKSPACE="$ALLOWED_GITHUB_WORKSPACE" \
    NODE_ENV="test" \
    LOLIXCO_TEST_MODE="1" \
    LOLIXCO_TEST_ISOLATION="1" \
    LOLIXCO_KERNEL_ISOLATED="1" \
    node "$REPO_ROOT/scripts/run-isolated-tests.mjs" "$@"
fi

# 4. Not yet isolated: verify required tools
if ! command -v unshare >/dev/null 2>&1; then
  echo "[LOLIXCO SECURITY FATAL] Linux 'unshare' utility is not installed. Kernel network isolation cannot be established." >&2
  exit 1
fi

if ! command -v ip >/dev/null 2>&1; then
  echo "[LOLIXCO SECURITY FATAL] Linux 'ip' utility is not installed. Loopback cannot be configured." >&2
  exit 1
fi

# 5. Launch unshare with isolated network and user namespace (-rn),
# configure loopback, and invoke this script inside the isolated namespace with sanitized env
LOOPBACK_CMD='ip link set lo up || { echo "[LOLIXCO SECURITY FATAL] Failed to configure loopback in isolated network namespace" >&2; exit 1; }; exec "$@"'

exec env -i \
  PATH="$ALLOWED_PATH" \
  HOME="$ALLOWED_HOME" \
  USER="$ALLOWED_USER" \
  LOGNAME="$ALLOWED_LOGNAME" \
  SHELL="$ALLOWED_SHELL" \
  LANG="$ALLOWED_LANG" \
  LC_ALL="$ALLOWED_LC_ALL" \
  TERM="$ALLOWED_TERM" \
  TMPDIR="$ALLOWED_TMPDIR" \
  CI="$ALLOWED_CI" \
  GITHUB_ACTIONS="$ALLOWED_GITHUB_ACTIONS" \
  GITHUB_WORKSPACE="$ALLOWED_GITHUB_WORKSPACE" \
  unshare -rn sh -c "$LOOPBACK_CMD" -- "$0" "$@"
