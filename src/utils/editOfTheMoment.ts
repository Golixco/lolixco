import type { Edit } from "../data/edits";

/**
 * Returns a deterministic integer representation of a UTC date: YYYYMMDD.
 */
export function getUtcDaySeed(date: Date = new Date()): number {
  return (
    date.getUTCFullYear() * 10000 +
    (date.getUTCMonth() + 1) * 100 +
    date.getUTCDate()
  );
}

/**
 * Deterministic integer hash function (Knuth's multiplicative hash).
 */
function hashInt(seed: number): number {
  let h = (seed ^ 0x5bf03635) * 2654435761;
  return Math.abs(h ^ (h >>> 16));
}

/**
 * Selects the featured Edit of the Moment according to strict editorial rules:
 * 1. Prioritizes approved curated YouTube landscape edits if available.
 * 2. Falls back to baseline demo landscape edits when no curated YouTube content is approved yet.
 * 3. Stable for all visitors across a single UTC day (no random render flashes).
 * 4. Avoids selecting the exact same item on consecutive UTC days (when pool size >= 2).
 * 5. Supports an optional manual shuffle offset for session exploration.
 */
export function selectEditOfTheMoment(
  catalog: Edit[],
  date: Date = new Date(),
  shuffleOffset: number = 0
): Edit | null {
  if (!catalog || catalog.length === 0) return null;

  // Filter landscape edits (exclude portrait shorts from the landscape hero banner)
  const isLandscape = (e: Edit) => e.format === "video" || !e.format;

  const curatedLandscape = catalog.filter(
    (e) => isLandscape(e) && e.sourceType === "youtube_embed"
  );

  // Priority 1: Genuine curated YouTube edits
  // Priority 2: Fallback to baseline landscape demo edits
  const pool =
    curatedLandscape.length > 0
      ? curatedLandscape
      : catalog.filter(isLandscape);

  if (pool.length === 0) {
    return catalog[0] || null;
  }

  const daySeed = getUtcDaySeed(date);
  const primaryIndex = hashInt(daySeed) % pool.length;

  let chosenIndex = primaryIndex;

  // Avoid consecutive days having the exact same featured item if pool >= 2
  if (pool.length >= 2) {
    const prevDate = new Date(date.getTime() - 86400000);
    const prevDaySeed = getUtcDaySeed(prevDate);
    const prevIndex = hashInt(prevDaySeed) % pool.length;

    if (chosenIndex === prevIndex) {
      chosenIndex = (chosenIndex + 1) % pool.length;
    }
  }

  // Apply manual shuffle offset (wrapped within pool)
  if (typeof shuffleOffset === "number" && shuffleOffset > 0) {
    chosenIndex = (chosenIndex + shuffleOffset) % pool.length;
  }

  return pool[chosenIndex];
}
