import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDeck,
  createSession,
  currentCard,
  flip,
  answer,
  isDone,
  progress,
  summarize,
} from '../js/lib/flashcard-logic.js';
import { XP_KNOWN, XP_LEARNING } from '../js/store.js';
import * as flashcard from '../js/games/flashcard.js';
import { games, findGame } from '../js/games/index.js';

const words = [
  { word: 'alpha', vi: 'a' },
  { word: 'bravo', vi: 'b' },
  { word: 'charlie', vi: 'c' },
  { word: 'delta', vi: 'd' },
];
const statuses = { bravo: 'known', delta: 'learning' };
const getStatus = (w) => statuses[w] ?? 'new';

test('buildDeck: learning first, then new, then known (stable within groups)', () => {
  const deck = buildDeck(words, getStatus);
  assert.deepEqual(deck.map((c) => c.word), ['delta', 'alpha', 'charlie', 'bravo']);
  assert.deepEqual(deck.map((c) => c.status), ['learning', 'new', 'new', 'known']);
});

test('buildDeck: skips invalid entries, removes duplicates, applies limit', () => {
  const deck = buildDeck([{ word: 'Hi' }, { word: 'hi' }, { word: '' }, null, { vi: 'x' }, { word: 'yo' }], () => 'new');
  assert.deepEqual(deck.map((c) => c.word), ['Hi', 'yo']);
  assert.equal(buildDeck(words, getStatus, { limit: 2 }).length, 2);
});

test('session: flip toggles, answer advances and resets flip', () => {
  let s = createSession(buildDeck(words, () => 'new'));
  assert.equal(currentCard(s).word, 'alpha');
  assert.equal(s.flipped, false);
  s = flip(s);
  assert.equal(s.flipped, true);
  s = flip(s);
  assert.equal(s.flipped, false);
  s = flip(answer(flip(s), true));
  assert.equal(currentCard(s).word, 'bravo');
  assert.equal(s.flipped, true);
  s = answer(s, false);
  assert.equal(s.flipped, false);
  assert.deepEqual(s.results, [{ word: 'alpha', known: true }, { word: 'bravo', known: false }]);
});

test('session functions do not mutate their input', () => {
  const s = createSession(buildDeck(words, () => 'new'));
  const snapshot = structuredClone(s);
  flip(s);
  answer(s, true);
  assert.deepEqual(s, snapshot);
});

test('progress and completion', () => {
  let s = createSession(buildDeck(words, () => 'new'));
  assert.deepEqual(progress(s), { current: 1, total: 4, percent: 0 });
  s = answer(answer(s, true), true);
  assert.deepEqual(progress(s), { current: 3, total: 4, percent: 50 });
  s = answer(answer(s, false), true);
  assert.equal(isDone(s), true);
  assert.equal(currentCard(s), null);
  assert.deepEqual(progress(s), { current: 4, total: 4, percent: 100 });
  assert.equal(answer(s, true), s, 'answering after the end is a no-op');
  assert.equal(flip(s), s);
  assert.deepEqual(progress(createSession([])), { current: 0, total: 0, percent: 100 });
});

test('summarize counts results and XP', () => {
  let s = createSession(buildDeck(words, () => 'new'));
  s = answer(s, true);
  s = answer(s, false);
  s = answer(s, true);
  s = answer(s, false);
  assert.deepEqual(summarize(s), {
    total: 4,
    known: 2,
    learning: 2,
    xp: 2 * XP_KNOWN + 2 * XP_LEARNING,
    learningWords: ['bravo', 'delta'],
  });
});

test('flashcard module follows the game contract and is registered', () => {
  assert.equal(flashcard.id, 'flashcard');
  assert.equal(typeof flashcard.title, 'string');
  assert.equal(typeof flashcard.description, 'string');
  assert.equal(typeof flashcard.start, 'function');
  assert.equal(findGame('flashcard'), games.find((g) => g.id === 'flashcard'));
  assert.equal(findGame('nope'), null);
});

test('every registered game has a unique id and the required exports', () => {
  const ids = new Set();
  for (const g of games) {
    assert.match(g.id, /^[a-z0-9-]+$/, `invalid id: ${g.id}`);
    assert.ok(!ids.has(g.id), `duplicate id: ${g.id}`);
    ids.add(g.id);
    assert.ok(g.title && g.description, `${g.id} needs title and description`);
    assert.equal(typeof g.start, 'function', `${g.id} needs start()`);
  }
});
