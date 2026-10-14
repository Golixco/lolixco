export function matches(edit, query, category) {
  const text = [
    edit.title,
    edit.creator,
    edit.category,
    edit.description,
    ...edit.tags,
  ]
    .join(" ")
    .toLowerCase();
  return (
    query
      .toLowerCase()
      .trim()
      .split(/\s+/)
      .every((term) => text.includes(term)) &&
    (["Featured", "New"].includes(category) ||
      (category === "Trending" ? edit.trending : edit.category === category))
  );
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
