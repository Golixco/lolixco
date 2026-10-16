import math
from typing import Dict, List, Optional, Sequence, Set, Tuple

from .catalog import Catalog
from .types import EditItem, WatchHistoryEntry

# Canonical boilerplate fixture tags that appear across the vast majority of demo items
BOILERPLATE_TAGS: Set[str] = {"original", "demo"}


def is_distinctive_tag(tag: str, catalog: Catalog, max_df_ratio: float = 0.50) -> bool:
    """
    Determine if a tag is informative/distinctive.
    A tag is non-distinctive if it appears in >= max_df_ratio of the catalog
    or is explicitly in BOILERPLATE_TAGS.
    """
    clean_tag = tag.lower().strip()
    if clean_tag in BOILERPLATE_TAGS:
        return False
    df = catalog.get_tag_doc_freq(clean_tag)
    return df < (len(catalog) * max_df_ratio)


def get_meaningful_shared_tags(
    tags_a: Sequence[str],
    tags_b: Sequence[str],
    catalog: Catalog,
    max_df_ratio: float = 0.50,
) -> Set[str]:
    """
    Return the subset of overlapping tags between A and B that are genuinely
    informative and non-boilerplate (e.g. specific genre or theme tags).
    """
    set_a = {t.lower().strip() for t in tags_a if t.strip()}
    set_b = {t.lower().strip() for t in tags_b if t.strip()}
    shared = set_a & set_b
    return {t for t in shared if is_distinctive_tag(t, catalog, max_df_ratio)}


def compute_tag_idf(catalog: Catalog) -> Dict[str, float]:
    """
    Compute Inverse Document Frequency (IDF) for all unique tags in the catalog.
    IDF(t) = ln(1.0 + N / DF(t))
    Boilerplate tags ('original', 'demo') receive a fixed zero weight (0.0)
    to completely prevent boilerplate overlap from inflating similarity scores.
    """
    n = len(catalog)
    idf_table: Dict[str, float] = {}

    for item in catalog.all_items:
        for tag in item.tags:
            tag_clean = tag.lower().strip()
            if tag_clean and tag_clean not in idf_table:
                if tag_clean in BOILERPLATE_TAGS:
                    idf_table[tag_clean] = 0.0
                else:
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
    Boilerplate tags ('original', 'demo') are filtered out so that boilerplate-only
    overlap has zero thematic similarity regardless of how many other tags exist.
    """
    set_a = {t.lower().strip() for t in tags_a if t.strip()}
    set_b = {t.lower().strip() for t in tags_b if t.strip()}

    if not set_a and not set_b:
        return 0.0

    intersection_tags = set_a & set_b
    if not intersection_tags:
        return 0.0

    # Only informative (non-boilerplate) tags contribute to similarity
    informative_intersection = {t for t in intersection_tags if t not in BOILERPLATE_TAGS}
    if not informative_intersection:
        return 0.0

    union_tags = set_a | set_b
    informative_union = {t for t in union_tags if t not in BOILERPLATE_TAGS}
    if not informative_union:
        return 0.0

    intersection_weight = sum(idf_table.get(t, default_idf) for t in informative_intersection)
    union_weight = sum(idf_table.get(t, default_idf) for t in informative_union)

    if union_weight <= 0.0:
        return 0.0

    return min(1.0, max(0.0, intersection_weight / union_weight))


def category_match_score(cat_a: str, cat_b: str) -> float:
    """Category identity match in [0.0, 1.0]."""
    if not cat_a or not cat_b:
        return 0.0
    return 1.0 if cat_a.strip().lower() == cat_b.strip().lower() else 0.0


def get_usable_history(
    history: Sequence[WatchHistoryEntry],
    catalog: Catalog,
    min_watch_ms: int = 2000,
) -> Tuple[List[WatchHistoryEntry], int]:
    """
    Validate and extract usable session history entries:
    - Entry must reference a known edit in the catalog.
    - User must have watched at least min_watch_ms (default 2000ms) to avoid bounces/skips.
    Returns (usable_entries, ignored_count).
    """
    usable: List[WatchHistoryEntry] = []
    ignored = 0
    for entry in history:
        item = catalog.get(entry.edit_id)
        if item is None or entry.unique_watch_ms < min_watch_ms:
            ignored += 1
        else:
            usable.append(entry)
    return usable, ignored


def compute_session_history_affinity(
    candidate: EditItem,
    usable_history: Sequence[WatchHistoryEntry],
    catalog: Catalog,
    idf_table: Dict[str, float],
) -> float:
    """
    Calculate contextual affinity between a candidate edit and validated usable watch history.
    - Clamps watch time to candidate/history duration and the 60s budget cap.
    - Applies gentle recency decay (0.90^k from newest to oldest).
    Returns a normalized affinity score in [0.0, 1.0].
    """
    if not usable_history:
        return 0.0

    total_weight = 0.0
    weighted_similarity = 0.0

    # Traverse in reverse (newest first)
    for idx, entry in enumerate(reversed(usable_history)):
        hist_item = catalog.get(entry.edit_id)
        if not hist_item:
            continue

        raw_watch_sec = entry.unique_watch_ms / 1000.0
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
