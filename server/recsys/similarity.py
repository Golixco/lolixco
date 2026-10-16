import math
from typing import Dict, List, Optional, Sequence, Set

from .catalog import Catalog
from .types import EditItem, WatchHistoryEntry


def compute_tag_idf(catalog: Catalog) -> Dict[str, float]:
    """
    Compute Inverse Document Frequency (IDF) for all unique tags in the catalog.
    IDF(t) = ln(1.0 + N / DF(t))
    This naturally downweights ubiquitous demo tags (e.g. 'original', 'demo')
    relative to highly specific topic tags.
    """
    n = len(catalog)
    idf_table: Dict[str, float] = {}

    for item in catalog.all_items:
        for tag in item.tags:
            tag_clean = tag.lower().strip()
            if tag_clean and tag_clean not in idf_table:
                df = catalog.get_tag_doc_freq(tag_clean)
                idf_table[tag_clean] = math.log(1.0 + (n / max(df, 1)))

    return idf_table


def tag_idf_similarity(
    tags_a: Sequence[str],
    tags_b: Sequence[str],
    idf_table: Dict[str, float],
    default_idf: float = 1.0,
) -> float:
    """
    Weighted Jaccard similarity using tag IDF weights:
    Sim(A, B) = sum_{t in A n B} IDF(t) / sum_{t in A u B} IDF(t)
    Returns a score strictly in [0.0, 1.0].
    """
    set_a = {t.lower().strip() for t in tags_a if t.strip()}
    set_b = {t.lower().strip() for t in tags_b if t.strip()}

    if not set_a and not set_b:
        return 0.0

    union_tags = set_a | set_b
    intersection_tags = set_a & set_b

    if not intersection_tags:
        return 0.0

    intersection_weight = sum(idf_table.get(t, default_idf) for t in intersection_tags)
    union_weight = sum(idf_table.get(t, default_idf) for t in union_tags)

    if union_weight <= 0.0:
        return 0.0

    return min(1.0, max(0.0, intersection_weight / union_weight))


def category_match_score(cat_a: str, cat_b: str) -> float:
    """Category identity match in [0.0, 1.0]."""
    if not cat_a or not cat_b:
        return 0.0
    return 1.0 if cat_a.strip().lower() == cat_b.strip().lower() else 0.0


def compute_session_history_affinity(
    candidate: EditItem,
    history: Sequence[WatchHistoryEntry],
    catalog: Catalog,
    idf_table: Dict[str, float],
) -> float:
    """
    Calculate contextual affinity between a candidate edit and recent watch history.
    - Clamps watch time to candidate/history duration and the 60s budget cap.
    - Treats watches < 2s as quick skips (zero weight).
    - Applies gentle recency decay (0.90^k from newest to oldest).
    Returns a normalized affinity score in [0.0, 1.0].
    """
    if not history:
        return 0.0

    total_weight = 0.0
    weighted_similarity = 0.0

    # History ordered oldest to newest; traverse in reverse (newest first)
    for idx, entry in enumerate(reversed(history)):
        hist_item = catalog.get(entry.edit_id)
        if not hist_item:
            continue

        raw_watch_sec = entry.unique_watch_ms / 1000.0
        # If user watched less than 2 seconds, treat as bounce / non-positive signal
        if raw_watch_sec < 2.0:
            continue

        # Budget-capped watch time fraction: min(w, d, 60) / 60
        capped_sec = min(raw_watch_sec, hist_item.duration_sec, 60.0)
        watch_budget_fraction = capped_sec / 60.0

        recency_factor = 0.90 ** min(idx, 10)
        sample_weight = watch_budget_fraction * recency_factor

        cat_sim = category_match_score(candidate.category, hist_item.category)
        tag_sim = tag_idf_similarity(candidate.tags, hist_item.tags, idf_table)
        item_sim = 0.60 * cat_sim + 0.40 * tag_sim

        weighted_similarity += sample_weight * item_sim
        total_weight += sample_weight

    if total_weight <= 0.0:
        return 0.0

    return min(1.0, max(0.0, weighted_similarity / total_weight))
