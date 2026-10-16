import type { Edit } from "./edits";

export interface ParsedTerm {
  raw: string;
  clean: string;
  isHashtag: boolean;
}

export interface SearchResult {
  edit: Edit;
  score: number;
  matchReasons: string[];
}

/**
 * Weights when query contains at least one hashtag (Sum = 100%)
 */
export const HASHTAG_WEIGHTS = {
  hashtag: 0.40,
  title: 0.30,
  category: 0.15, // Category / Topic (incorporates tags for topic relevance)
  description: 0.10,
  creator: 0.05,
} as const;

/**
 * Weights redistributed proportionally for queries without hashtags (Sum = 100%)
 * hashtag weight (0.40) redistributed across remaining 0.60 base:
 * title: 0.30 / 0.60 = 50%
 * category: 0.15 / 0.60 = 25%
 * description: 0.10 / 0.60 = 16.67%
 * creator: 0.05 / 0.60 = 8.33%
 */
export const NON_HASHTAG_WEIGHTS = {
  hashtag: 0.00,
  title: 0.30 / 0.60, // 0.50
  category: 0.15 / 0.60, // 0.25
  description: 0.10 / 0.60, // ~0.16667
  creator: 0.05 / 0.60, // ~0.08333
} as const;

/**
 * Parse raw query string into structured terms.
 * Distinguishes hashtags (#tag) from normal text tokens.
 */
export function parseQuery(query: string): ParsedTerm[] {
  if (!query) return [];
  return query
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((term) => {
      const isHashtag = term.startsWith("#");
      const clean = isHashtag
        ? term.replace(/^#+/, "").toLowerCase()
        : term.toLowerCase();
      return { raw: term, clean, isHashtag };
    });
}

/**
 * Normalized match quality between a field value and a query token.
 * Returns a value in [0.0, 1.0].
 */
export function matchQuality(source: string, token: string): number {
  if (!source || !token) return 0.0;
  const s = source.toLowerCase().trim();
  const t = token.toLowerCase().trim();
  if (s === t) return 1.0;
  const words = s.split(/\s+/);
  if (words.some((w) => w === t)) return 0.9;
  if (words.some((w) => w.startsWith(t)) || s.startsWith(t)) return 0.7;
  if (s.includes(t)) return 0.4;
  return 0.0;
}

/**
 * Determine if an edit satisfies the active category / trending filter.
 */
export function matchesCategoryFilter(edit: Edit, category: string): boolean {
  if (!category || category === "Featured" || category === "New") {
    return true;
  }
  if (category === "Trending") {
    return !!edit.trending;
  }
  return edit.category === category;
}

/**
 * Evaluate score and match status for a single query term against an edit.
 */
export function scoreTerm(
  edit: Edit,
  term: ParsedTerm,
  hasHashtagsInQuery: boolean
): { matched: boolean; score: number; reasons: string[] } {
  const weights = hasHashtagsInQuery ? HASHTAG_WEIGHTS : NON_HASHTAG_WEIGHTS;
  const reasons: string[] = [];

  // Bare hashtag check: if a token starts with # but has no clean text (e.g. "#", "##")
  if (term.isHashtag && !term.clean) {
    return { matched: false, score: 0, reasons: [] };
  }

  if (term.isHashtag) {
    // Exact normalized tag matching is required for hashtag tokens
    const hasExactTag = edit.tags.some(
      (tag) => tag.toLowerCase() === term.clean
    );
    if (!hasExactTag) {
      return { matched: false, score: 0, reasons: [] };
    }
    reasons.push(`Exact tag #${term.clean}`);

    // Secondary matches across other fields contribute secondary weights
    const qTitle = matchQuality(edit.title, term.clean);
    const qCat = matchQuality(edit.category, term.clean);
    const qDesc = matchQuality(edit.description, term.clean);
    const qCreator = matchQuality(edit.creator, term.clean);

    if (qTitle > 0) reasons.push(`Title match (${term.clean})`);
    if (qCat > 0) reasons.push(`Category match (${term.clean})`);
    if (qDesc > 0) reasons.push(`Description match (${term.clean})`);
    if (qCreator > 0) reasons.push(`Creator match (${term.clean})`);

    const score =
      weights.hashtag * 1.0 +
      weights.title * qTitle +
      weights.category * qCat +
      weights.description * qDesc +
      weights.creator * qCreator;

    return { matched: true, score: Math.min(score, 1.0), reasons };
  } else {
    // Normal text query: can match Title, Description, Creator, and Category/Topic
    // Crucially: ordinary tag relevance is incorporated into the category/topic signal
    const qTitle = matchQuality(edit.title, term.clean);
    const qCat = matchQuality(edit.category, term.clean);
    const qDesc = matchQuality(edit.description, term.clean);
    const qCreator = matchQuality(edit.creator, term.clean);

    // Evaluate tag matches as part of category/topic relevance
    let qTagMax = 0;
    for (const tag of edit.tags) {
      const q = matchQuality(tag, term.clean);
      if (q > qTagMax) qTagMax = q;
    }

    // Category / topic signal uses the strongest match between category name and tags
    const qTopic = Math.max(qCat, qTagMax);

    if (qTitle > 0) reasons.push(`Title match (${term.clean})`);
    if (qTopic > 0) {
      if (qCat >= qTagMax) reasons.push(`Category match (${term.clean})`);
      else reasons.push(`Tag topic match (${term.clean})`);
    }
    if (qDesc > 0) reasons.push(`Description match (${term.clean})`);
    if (qCreator > 0) reasons.push(`Creator match (${term.clean})`);

    const bestQuality = Math.max(qTitle, qTopic, qDesc, qCreator);
    if (bestQuality === 0) {
      return { matched: false, score: 0, reasons: [] };
    }

    const score =
      weights.title * qTitle +
      weights.category * qTopic +
      weights.description * qDesc +
      weights.creator * qCreator;

    return { matched: true, score: Math.min(score, 1.0), reasons };
  }
}

/**
 * Execute deterministic search and ranking across all edits.
 *
 * Requirements satisfied:
 * - Conjunction (AND): Every meaningful term must match.
 * - Exact normalized tag matching for hashtags.
 * - Normal text matching tags (via category/topic signal).
 * - Safe rejection of bare/malformed hashtags.
 * - Score normalization to [0, 1] across variable query lengths.
 * - Deterministic sorting: score DESC, then numeric Edit.id ASC (preserving ID 0).
 * - Category and Trending filtering.
 */
export function searchEdits(
  allEdits: Edit[],
  query: string,
  category: string = "Featured"
): SearchResult[] {
  const terms = parseQuery(query);

  // Fast path: Empty query returns category-filtered edits
  if (terms.length === 0) {
    const base = allEdits.filter((edit) => matchesCategoryFilter(edit, category));
    const sorted = category === "New" ? [...base].reverse() : base;
    return sorted.map((edit) => ({
      edit,
      score: 1.0,
      matchReasons: ["Category default"],
    }));
  }

  // If any term is a bare hashtag (e.g. "#", "##"), it cannot match any edit safely
  if (terms.some((t) => t.isHashtag && !t.clean)) {
    return [];
  }

  const hasHashtagsInQuery = terms.some((t) => t.isHashtag);
  const results: SearchResult[] = [];

  for (const edit of allEdits) {
    // 1. Check category filter
    if (!matchesCategoryFilter(edit, category)) {
      continue;
    }

    let allTermsMatched = true;
    let sumScore = 0;
    const allReasons: string[] = [];

    // 2. Conjunction (AND): Every term must match
    for (const term of terms) {
      const { matched, score, reasons } = scoreTerm(
        edit,
        term,
        hasHashtagsInQuery
      );
      if (!matched) {
        allTermsMatched = false;
        break;
      }
      sumScore += score;
      allReasons.push(...reasons);
    }

    if (allTermsMatched) {
      // Normalize aggregate score to [0, 1] regardless of query length
      const normalizedScore = Number((sumScore / terms.length).toFixed(4));
      results.push({
        edit,
        score: normalizedScore,
        matchReasons: Array.from(new Set(allReasons)),
      });
    }
  }

  // 3. Deterministic Sort:
  // Primary: Score DESC
  // Secondary: numeric Edit.id ASC (preserving ID 0 and stable ordering)
  results.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return a.edit.id - b.edit.id;
  });

  return results;
}

/**
 * Convenience helper returning ranked Edit array directly.
 */
export function getRankedEdits(
  allEdits: Edit[],
  query: string,
  category: string = "Featured"
): Edit[] {
  return searchEdits(allEdits, query, category).map((r) => r.edit);
}
