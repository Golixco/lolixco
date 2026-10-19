import test from "node:test";
import assert from "node:assert/strict";

import {
  createImmersionSession,
  advanceImmersionNext,
  advanceImmersionPrevious,
  skipUnavailableImmersionEdit,
} from "../src/utils/immersionQueue.ts";

const MOCK_CATALOG = [
  // 3 Valorant Gaming edits
  { id: 100, title: "Valorant Ace 1", category: "Gaming", fandomIds: ["valorant"], tags: ["gaming"] },
  { id: 101, title: "Valorant Ace 2", category: "Gaming", fandomIds: ["valorant"], tags: ["gaming"] },
  { id: 102, title: "Valorant Ace 3", category: "Gaming", fandomIds: ["valorant"], tags: ["gaming"] },
  // 1 Doom Gaming edit
  { id: 103, title: "Doom Slayer", category: "Gaming", fandomIds: ["doom"], tags: ["gaming"] },
  // 2 Anime Jujutsu edits
  { id: 104, title: "Jujutsu Combat 1", category: "Anime", fandomIds: ["jujutsu-kaisen"], tags: ["anime"] },
  { id: 105, title: "Jujutsu Combat 2", category: "Anime", fandomIds: ["jujutsu-kaisen"], tags: ["anime"] },
  // 1 Phonk edit
  { id: 106, title: "Phonk Drift", category: "Phonk", fandomIds: [], tags: ["phonk"] },
  // 1 Movies edit
  { id: 107, title: "Spider-Man Web", category: "Movies", fandomIds: ["spider-man"], tags: ["movies"] },
];

test("IMMERSION QUEUE: 3 matching opening edits when 3+ exist in entry context", () => {
  // Enter from Gaming -> Valorant
  const session = createImmersionSession(
    MOCK_CATALOG,
    { category: "Gaming", fandomId: "valorant" },
    42
  );

  // Edit 1: Valorant
  assert.equal(session.currentEdit?.id, 100);
  assert.equal(session.currentEdit?.fandomIds?.[0], "valorant");

  // Edit 2: Valorant
  const step2 = advanceImmersionNext(MOCK_CATALOG, session.state, 42);
  assert.equal(step2.nextEdit?.id, 101);
  assert.equal(step2.nextEdit?.fandomIds?.[0], "valorant");

  // Edit 3: Valorant
  const step3 = advanceImmersionNext(MOCK_CATALOG, step2.nextState, 42);
  assert.equal(step3.nextEdit?.id, 102);
  assert.equal(step3.nextEdit?.fandomIds?.[0], "valorant");

  // Edit 4: Transitions to Discovery Stage!
  const step4 = advanceImmersionNext(MOCK_CATALOG, step3.nextState, 42);
  assert.ok(step4.nextEdit);
  // Must NOT be an immediate duplicate of 100, 101, or 102
  assert.equal([100, 101, 102].includes(step4.nextEdit.id), false);
});

test("IMMERSION QUEUE: 2 matching opening edits when only 2 exist in entry context", () => {
  // Enter from Anime -> Jujutsu Kaisen (catalog has only 2: 104 and 105)
  const session = createImmersionSession(
    MOCK_CATALOG,
    { category: "Anime", fandomId: "jujutsu-kaisen" },
    123
  );

  // Edit 1: Jujutsu (104)
  assert.equal(session.currentEdit?.id, 104);

  // Edit 2: Jujutsu (105)
  const step2 = advanceImmersionNext(MOCK_CATALOG, session.state, 123);
  assert.equal(step2.nextEdit?.id, 105);

  // Edit 3: Discovery Stage begins immediately! (Does NOT duplicate)
  const step3 = advanceImmersionNext(MOCK_CATALOG, step2.nextState, 123);
  assert.ok(step3.nextEdit);
  assert.equal([104, 105].includes(step3.nextEdit.id), false);
});

test("IMMERSION QUEUE: 1 matching opening edit when only 1 exists in entry context", () => {
  // Enter from Phonk (catalog has only 1: 106)
  const session = createImmersionSession(
    MOCK_CATALOG,
    { category: "Phonk" },
    99
  );

  // Edit 1: Phonk (106)
  assert.equal(session.currentEdit?.id, 106);

  // Edit 2: Discovery Stage begins immediately!
  const step2 = advanceImmersionNext(MOCK_CATALOG, session.state, 99);
  assert.ok(step2.nextEdit);
  assert.notEqual(step2.nextEdit.id, 106);
});

test("IMMERSION QUEUE: previous and next navigate history correctly", () => {
  const session = createImmersionSession(
    MOCK_CATALOG,
    { category: "Gaming" },
    77
  );
  const step2 = advanceImmersionNext(MOCK_CATALOG, session.state, 77);
  const step3 = advanceImmersionNext(MOCK_CATALOG, step2.nextState, 77);

  assert.equal(step3.nextState.history.length, 3);
  assert.equal(step3.nextState.currentIndex, 2);

  // Navigate back to item 2
  const prev1 = advanceImmersionPrevious(step3.nextState);
  assert.equal(prev1.prevEdit?.id, step2.nextEdit?.id);
  assert.equal(prev1.nextState.currentIndex, 1);

  // Navigate back to item 1
  const prev2 = advanceImmersionPrevious(prev1.nextState);
  assert.equal(prev2.prevEdit?.id, session.currentEdit?.id);
  assert.equal(prev2.nextState.currentIndex, 0);

  // Navigating back when at index 0 stays at index 0
  const prev3 = advanceImmersionPrevious(prev2.nextState);
  assert.equal(prev3.prevEdit?.id, session.currentEdit?.id);
  assert.equal(prev3.nextState.currentIndex, 0);

  // Navigate forward again along history
  const fwd1 = advanceImmersionNext(MOCK_CATALOG, prev3.nextState, 77);
  assert.equal(fwd1.nextEdit?.id, step2.nextEdit?.id);
  assert.equal(fwd1.nextState.currentIndex, 1);
});

test("IMMERSION QUEUE: pool exhaustion reshuffles without immediate repeat of previous item", () => {
  const tinyCatalog = [
    { id: 1, title: "Item 1", category: "Anime", tags: [] },
    { id: 2, title: "Item 2", category: "Anime", tags: [] },
    { id: 3, title: "Item 3", category: "Anime", tags: [] },
  ];

  let current = createImmersionSession(tinyCatalog, { category: "Anime" }, 1);
  const playedSequence = [current.currentEdit.id];

  // Play through all 3 items and then 3 more after reshuffle
  for (let i = 0; i < 5; i++) {
    const next = advanceImmersionNext(tinyCatalog, current.state, 1);
    assert.ok(next.nextEdit);
    // Never immediate consecutive duplicate
    assert.notEqual(next.nextEdit.id, playedSequence[playedSequence.length - 1]);
    playedSequence.push(next.nextEdit.id);
    current = { currentEdit: next.nextEdit, state: next.nextState };
  }

  assert.equal(playedSequence.length, 6);
  assert.equal(current.state.exhaustedPoolsCount > 0, true);
});

test("IMMERSION QUEUE: skipUnavailableImmersionEdit bounds consecutive retries to maxSkips", () => {
  const session = createImmersionSession(MOCK_CATALOG, { category: "Gaming" });

  const skip1 = skipUnavailableImmersionEdit(MOCK_CATALOG, session.state, 0, 3);
  assert.equal(skip1.exhausted, false);
  assert.ok(skip1.nextEdit);

  const skip2 = skipUnavailableImmersionEdit(MOCK_CATALOG, skip1.nextState, 1, 3);
  assert.equal(skip2.exhausted, false);

  const skip3 = skipUnavailableImmersionEdit(MOCK_CATALOG, skip2.nextState, 2, 3);
  assert.equal(skip3.exhausted, false);

  // 4th skip hits limit (consecutiveSkips >= 3)
  const skip4 = skipUnavailableImmersionEdit(MOCK_CATALOG, skip3.nextState, 3, 3);
  assert.equal(skip4.exhausted, true);
  assert.equal(skip4.nextEdit, null);
});
