export function matches(edit, query, category) {
  const trimmed = (query || "").toLowerCase().trim();
  const passesCategory =
    ["Featured", "New"].includes(category) ||
    (category === "Trending" ? edit.trending : edit.category === category);

  if (!trimmed) {
    return passesCategory;
  }

  const terms = trimmed.split(/\s+/).filter(Boolean);
  const text = [
    edit.title,
    edit.creator,
    edit.category,
    edit.description,
    ...edit.tags,
  ]
    .join(" ")
    .toLowerCase();

  const passesQuery = terms.every((term) => {
    if (term.startsWith("#")) {
      // Reject malformed prefixes such as ##anime, #, ##
      if (
        term.startsWith("##") ||
        term.length === 1 ||
        !/^#[a-zA-Z0-9_\-]+$/.test(term)
      ) {
        return false;
      }
      const clean = term.slice(1).toLowerCase();
      return edit.tags.some((t) => t.toLowerCase() === clean);
    }
    return text.includes(term);
  });

  return passesCategory && passesQuery;
}

export function validLoop(a, b, duration) {
  return (
    Number.isFinite(a) &&
    Number.isFinite(b) &&
    a >= 0 &&
    b <= duration &&
    b - a >= 0.5
  );
}

export function loopSeek(time, a, b, enabled) {
  return enabled && a !== null && b !== null && (time >= b || time < a)
    ? a
    : time;
}
