import argparse
import json
from pathlib import Path
import subprocess
import sys
from typing import Any, Dict, List, Tuple


def get_repo_root() -> Path:
    """Find repository root by walking up from this file's location."""
    current = Path(__file__).resolve().parent
    for parent in [current] + list(current.parents):
        if (parent / "package.json").is_file() and (parent / "src" / "data" / "edits.ts").is_file():
            return parent
    return Path.cwd()


def fetch_edits_from_source(repo_root: Path) -> List[Dict[str, Any]]:
    """
    Execute Node with the repository's native TypeScript loader
    to extract the authoritative edits array directly from src/data/edits.ts.
    Avoids brittle regex parsing and guarantees 100% property fidelity.
    """
    edits_ts = repo_root / "src" / "data" / "edits.ts"
    loader_mjs = repo_root / "tests" / "register-ts.mjs"

    if not edits_ts.is_file():
        raise FileNotFoundError(f"Missing edits source file: {edits_ts}")
    if not loader_mjs.is_file():
        raise FileNotFoundError(f"Missing Node TypeScript loader: {loader_mjs}")

    rel_loader = loader_mjs.relative_to(repo_root)
    node_cmd = [
        "node",
        "--import",
        f"./{rel_loader}",
        "-e",
        'import { edits } from "./src/data/edits.ts"; console.log(JSON.stringify(edits));',
    ]

    try:
        proc = subprocess.run(
            node_cmd,
            cwd=str(repo_root),
            capture_output=True,
            text=True,
            check=True,
        )
        data = json.loads(proc.stdout)
        if not isinstance(data, list):
            raise ValueError(f"Expected list of edits from Node, got {type(data)}")
        return data
    except subprocess.CalledProcessError as e:
        raise RuntimeError(
            f"Node execution failed with exit code {e.returncode}: {e.stderr}"
        ) from e
    except json.JSONDecodeError as e:
        raise RuntimeError(f"Failed to decode Node JSON output: {e}") from e


def generate_snapshot_payload(edits: List[Dict[str, Any]], version: str = "demo-catalog-v1") -> Dict[str, Any]:
    """Wrap edits in a versioned snapshot envelope."""
    return {
        "catalog_version": version,
        "total_edits": len(edits),
        "edits": edits,
    }


def sync_catalog(repo_root: Path, output_file: Path) -> Dict[str, Any]:
    """Fetch live edits from TypeScript source and write snapshot JSON."""
    edits = fetch_edits_from_source(repo_root)
    payload = generate_snapshot_payload(edits)

    output_file.parent.mkdir(parents=True, exist_ok=True)
    with output_file.open("w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, ensure_ascii=False)
        f.write("\n")

    return payload


def check_catalog_drift(repo_root: Path, snapshot_path: Path) -> Tuple[bool, List[str]]:
    """
    Compare snapshot file against active TypeScript source.
    Returns (is_synced, diff_reasons).
    """
    if not snapshot_path.is_file():
        return False, [f"Snapshot file not found: {snapshot_path}"]

    with snapshot_path.open("r", encoding="utf-8") as f:
        try:
            snapshot_data = json.load(f)
        except Exception as e:
            return False, [f"Corrupt snapshot JSON: {e}"]

    snapshot_edits = snapshot_data.get("edits")
    if not isinstance(snapshot_edits, list):
        return False, ["Snapshot missing 'edits' list"]

    try:
        live_edits = fetch_edits_from_source(repo_root)
    except Exception as e:
        return False, [f"Failed to fetch live edits: {e}"]

    diffs: List[str] = []
    if len(live_edits) != len(snapshot_edits):
        diffs.append(
            f"Count mismatch: live has {len(live_edits)} edits, snapshot has {len(snapshot_edits)}"
        )

    # Key comparison per item
    snap_by_id = {e.get("id"): e for e in snapshot_edits if isinstance(e, dict)}
    live_by_id = {e.get("id"): e for e in live_edits if isinstance(e, dict)}

    missing_in_snap = set(live_by_id.keys()) - set(snap_by_id.keys())
    missing_in_live = set(snap_by_id.keys()) - set(live_by_id.keys())

    if missing_in_snap:
        diffs.append(f"IDs in live but missing in snapshot: {sorted(missing_in_snap)}")
    if missing_in_live:
        diffs.append(f"IDs in snapshot but missing in live: {sorted(missing_in_live)}")

    # Property-level check
    for item_id, live_item in live_by_id.items():
        if item_id in snap_by_id:
            snap_item = snap_by_id[item_id]
            for field in [
                "title",
                "category",
                "tags",
                "description",
                "creator",
                "poster",
                "source",
                "duration",
                "trending",
            ]:
                if live_item.get(field) != snap_item.get(field):
                    diffs.append(
                        f"Item {item_id} field '{field}' drifted: live={live_item.get(field)!r} vs snapshot={snap_item.get(field)!r}"
                    )

    return (len(diffs) == 0), diffs


def main() -> None:
    parser = argparse.ArgumentParser(description="Synchronize and drift-check recsys catalog.")
    parser.add_argument("--check", action="store_true", help="Check for drift without modifying snapshot")
    parser.add_argument(
        "--output",
        type=Path,
        default=None,
        help="Path to snapshot file (default: server/recsys/catalog_snapshot.json)",
    )
    args = parser.parse_args()

    repo_root = get_repo_root()
    snapshot_path = (
        args.output
        if args.output
        else repo_root / "server" / "recsys" / "catalog_snapshot.json"
    )

    if args.check:
        synced, diffs = check_catalog_drift(repo_root, snapshot_path)
        if synced:
            print("OK: Catalog snapshot matches src/data/edits.ts with 0 drift.")
            sys.exit(0)
        else:
            print("ERROR: Catalog drift detected between src/data/edits.ts and snapshot:")
            for d in diffs:
                print(f"  - {d}")
            sys.exit(1)
    else:
        sync_catalog(repo_root, snapshot_path)
        print(f"Catalog synced successfully to {snapshot_path}")


if __name__ == "__main__":
    main()
