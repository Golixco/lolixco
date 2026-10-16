from dataclasses import dataclass, field
from typing import Optional, Sequence


@dataclass(frozen=True)
class EditItem:
    """Canonical representation of an edit in the recommendation engine."""

    id: int
    title: str
    category: str
    tags: tuple[str, ...]
    description: str
    creator: str
    poster: str
    source: str
    duration: str  # e.g. "0:12"
    duration_ms: int  # e.g. 12000
    duration_sec: float  # e.g. 12.0
    trending: bool = False

    def __post_init__(self) -> None:
        if not isinstance(self.id, int) or self.id < 0:
            raise ValueError(f"Edit id must be non-negative integer, got {self.id}")
        if not self.title or not isinstance(self.title, str):
            raise ValueError("Edit title must be non-empty string")
        if not self.category or not isinstance(self.category, str):
            raise ValueError("Edit category must be non-empty string")
        if not isinstance(self.tags, (tuple, list)):
            raise ValueError("Edit tags must be sequence of strings")
        if not isinstance(self.duration_ms, int) or self.duration_ms <= 0:
            raise ValueError(f"duration_ms must be positive integer, got {self.duration_ms}")


@dataclass(frozen=True)
class WatchHistoryEntry:
    """Client session watch event for in-session recommendation context."""

    edit_id: int
    unique_watch_ms: int
    occurred_at: str  # ISO 8601 UTC timestamp

    def __post_init__(self) -> None:
        if not isinstance(self.edit_id, int) or self.edit_id < 0:
            raise ValueError(f"edit_id must be non-negative integer, got {self.edit_id}")
        if not isinstance(self.unique_watch_ms, int) or self.unique_watch_ms < 0:
            raise ValueError(f"unique_watch_ms must be non-negative integer, got {self.unique_watch_ms}")


@dataclass(frozen=True)
class RecommendationRequest:
    """Parameters for a recommendation request."""

    surface: str  # "home" or "up_next"
    current_edit_id: Optional[int] = None
    limit: int = 12
    exclude_edit_ids: tuple[int, ...] = ()
    history: tuple[WatchHistoryEntry, ...] = ()
    category_filter: Optional[str] = None

    def __post_init__(self) -> None:
        if self.surface not in ("home", "up_next"):
            raise ValueError(f"surface must be 'home' or 'up_next', got '{self.surface}'")
        if self.surface == "up_next" and self.current_edit_id is None:
            raise ValueError("current_edit_id is required when surface is 'up_next'")
        if self.current_edit_id is not None and (
            not isinstance(self.current_edit_id, int) or self.current_edit_id < 0
        ):
            raise ValueError(f"current_edit_id must be non-negative integer, got {self.current_edit_id}")
        if not isinstance(self.limit, int) or self.limit < 1:
            raise ValueError(f"limit must be integer >= 1, got {self.limit}")


@dataclass(frozen=True)
class RecommendedItem:
    """Ranked item with score and reason codes."""

    rank: int
    edit: EditItem
    score: float
    reason_codes: tuple[str, ...]


@dataclass(frozen=True)
class RecommendationResponse:
    """Enveloped response from the recommendation engine."""

    surface: str
    mode_used: str  # e.g. "baseline"
    catalog_version: str
    policy_version: str
    items: tuple[RecommendedItem, ...]
    total_eligible: int
    diagnostics: dict = field(default_factory=dict)
