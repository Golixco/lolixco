"""
Lolixco Recommendation System - Stage 1 Deterministic Baseline
"""

from .catalog import Catalog, load_catalog_from_json, parse_duration_to_ms
from .engine import RecommendationEngine
from .types import (
    EditItem,
    RecommendationRequest,
    RecommendationResponse,
    RecommendedItem,
    WatchHistoryEntry,
)

__all__ = [
    "Catalog",
    "load_catalog_from_json",
    "parse_duration_to_ms",
    "RecommendationEngine",
    "EditItem",
    "RecommendationRequest",
    "RecommendationResponse",
    "RecommendedItem",
    "WatchHistoryEntry",
]
