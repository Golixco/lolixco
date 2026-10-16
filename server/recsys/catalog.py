from collections import Counter, defaultdict
import json
from pathlib import Path
import re
from typing import Any, Dict, List, Optional, Sequence, Set, Tuple

from .types import EditItem


def parse_duration_to_ms(duration_str: str) -> Tuple[int, float]:
    """
    Parse a duration string into (duration_ms, duration_sec).
    Supports:
      - "M:SS" (e.g. "0:12" -> (12000, 12.0), "1:05" -> (65000, 65.0))
      - "H:MM:SS" (e.g. "1:02:03" -> (3723000, 3723.0))
      - Pure seconds as string or float (e.g. "12" -> (12000, 12.0))
    """
    if not duration_str or not isinstance(duration_str, str):
        raise ValueError(f"Invalid duration string: {duration_str!r}")

    cleaned = duration_str.strip()
    if "-" in cleaned:
        raise ValueError(f"Duration cannot be negative: {duration_str}")

    parts = cleaned.split(":")

    try:
        if len(parts) == 1:
            seconds = float(parts[0])
        elif len(parts) == 2:
            minutes = int(parts[0])
            seconds = minutes * 60 + float(parts[1])
        elif len(parts) == 3:
            hours = int(parts[0])
            minutes = int(parts[1])
            seconds = hours * 3600 + minutes * 60 + float(parts[2])
        else:
            raise ValueError(f"Too many colon segments in duration: {duration_str}")

        if seconds <= 0:
            raise ValueError(f"Parsed duration must be > 0 seconds, got {seconds}")

        duration_ms = int(round(seconds * 1000))
        duration_sec = float(round(seconds, 3))
        return duration_ms, duration_sec
    except ValueError as e:
        raise ValueError(f"Could not parse duration '{duration_str}': {e}") from e


class Catalog:
    """Validated, immutable catalog repository with fast index lookups."""

    def __init__(self, items: Sequence[EditItem], catalog_version: str = "demo-catalog-v1"):
        if not items:
            raise ValueError("Catalog cannot be empty")

        self.catalog_version = catalog_version
        self._items_by_id: Dict[int, EditItem] = {}
        self._items_ordered: List[EditItem] = []
        self._by_category: Dict[str, List[EditItem]] = defaultdict(list)
        self._by_creator: Dict[str, List[EditItem]] = defaultdict(list)
        self._tag_doc_freq: Counter[str] = Counter()

        seen_ids: Set[int] = set()

        for item in items:
            if not isinstance(item, EditItem):
                raise TypeError(f"Expected EditItem instance, got {type(item)}")

            # Invariant: ID must be a non-negative integer. Crucially ID 0 is valid.
            if item.id in seen_ids:
                raise ValueError(f"Duplicate edit ID detected: {item.id}")

            seen_ids.add(item.id)
            self._items_by_id[item.id] = item
            self._items_ordered.append(item)
            self._by_category[item.category].append(item)
            self._by_creator[item.creator].append(item)

            for tag in set(item.tags):
                self._tag_doc_freq[tag.lower()] += 1

        self._all_categories: Tuple[str, ...] = tuple(sorted(self._by_category.keys()))
        self._all_creators: Tuple[str, ...] = tuple(sorted(self._by_creator.keys()))

    def __len__(self) -> int:
        return len(self._items_by_id)

    def __contains__(self, edit_id: Any) -> bool:
        if not isinstance(edit_id, int):
            return False
        return edit_id in self._items_by_id

    def get(self, edit_id: int) -> Optional[EditItem]:
        """Safely fetch an edit by ID. Preserves ID 0."""
        if not isinstance(edit_id, int):
            return None
        return self._items_by_id.get(edit_id)

    @property
    def all_items(self) -> Tuple[EditItem, ...]:
        return tuple(self._items_ordered)

    @property
    def categories(self) -> Tuple[str, ...]:
        return self._all_categories

    @property
    def creators(self) -> Tuple[str, ...]:
        return self._all_creators

    def get_by_category(self, category: str) -> Tuple[EditItem, ...]:
        return tuple(self._by_category.get(category, []))

    def get_tag_doc_freq(self, tag: str) -> int:
        return self._tag_doc_freq.get(tag.lower(), 0)

    @classmethod
    def from_dict_list(
        cls, raw_list: Sequence[Dict[str, Any]], catalog_version: str = "demo-catalog-v1"
    ) -> "Catalog":
        """Construct catalog from raw dictionaries (e.g. deserialized JSON)."""
        items: List[EditItem] = []
        for raw in raw_list:
            raw_id = raw.get("id")
            if raw_id is None or not isinstance(raw_id, int) or raw_id < 0:
                raise ValueError(f"Invalid or missing id in raw record: {raw}")

            duration_raw = raw.get("duration", "0:12")
            dur_ms, dur_sec = parse_duration_to_ms(duration_raw)

            tags = tuple(str(t).strip().lower() for t in raw.get("tags", []))

            item = EditItem(
                id=raw_id,
                title=str(raw.get("title", "")),
                category=str(raw.get("category", "")),
                tags=tags,
                description=str(raw.get("description", "")),
                creator=str(raw.get("creator", "")),
                poster=str(raw.get("poster", "")),
                source=str(raw.get("source", "")),
                duration=str(duration_raw),
                duration_ms=dur_ms,
                duration_sec=dur_sec,
                trending=bool(raw.get("trending", False)),
            )
            items.append(item)

        return cls(items, catalog_version=catalog_version)


def load_catalog_from_json(json_path: Path | str) -> Catalog:
    """Load and validate catalog from a JSON snapshot file."""
    path = Path(json_path)
    if not path.is_file():
        raise FileNotFoundError(f"Catalog file not found: {path}")

    with path.open("r", encoding="utf-8") as f:
        data = json.load(f)

    if isinstance(data, list):
        return Catalog.from_dict_list(data)
    elif isinstance(data, dict):
        version = data.get("catalog_version", "demo-catalog-v1")
        records = data.get("edits") or data.get("records") or data.get("items")
        if not isinstance(records, list):
            raise ValueError(f"JSON catalog dictionary missing records list: {data.keys()}")
        return Catalog.from_dict_list(records, catalog_version=version)
    else:
        raise ValueError(f"Unsupported JSON root type: {type(data)}")
