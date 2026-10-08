// Pure flashcard logic (no DOM) so it can be unit-tested with node:test.
// Sessions are immutable: every function returns a new session object.

import { XP_KNOWN, XP_LEARNING } from '../store.js';

/** Words still being learned come first, then new words, then words already known. */
export const STATUS_ORDER = { learning: 0, new: 1, known: 2 };

/**
 * @param {{ word: string }[]} words
 * @param {(word: string) => 'new'|'learning'|'known'} getStatus
 * @param {{ limit?: number }} [options]
 */
export function buildDeck(words, getStatus, { limit } = {}) {
  const seen = new Set();
  const cards = [];
  for (const w of words) {
    if (!w || typeof w.word !== 'string' || !w.word.trim()) continue;
    const key = w.word.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    cards.push({ ...w, status: getStatus(w.word) ?? 'new' });
  }
  // Array.prototype.sort is stable, so the original order is kept within a group.
  cards.sort((a, b) => (STATUS_ORDER[a.status] ?? 1) - (STATUS_ORDER[b.status] ?? 1));
  return Number.isInteger(limit) && limit > 0 ? cards.slice(0, limit) : cards;
}

export function createSession(cards) {
  return { cards: [...cards], index: 0, flipped: false, results: [] };
}

export function isDone(session) {
  return session.index >= session.cards.length;
}

export function currentCard(session) {
  return isDone(session) ? null : session.cards[session.index];
}

export function flip(session) {
  if (isDone(session)) return session;
  return { ...session, flipped: !session.flipped };
}

/** Mark the current card as known / not known and move to the next one. */
export function answer(session, known) {
  const card = currentCard(session);
  if (!card) return session;
  return {
    ...session,
    index: session.index + 1,
    flipped: false,
    results: [...session.results, { word: card.word, known: Boolean(known) }],
  };
}

/** For the progress bar: "Thẻ current/total". */
export function progress(session) {
  const total = session.cards.length;
  const current = Math.min(session.index + 1, total);
  const percent = total === 0 ? 100 : Math.round((session.index / total) * 100);
  return { current, total, percent };
}

export function xpFor(known) {
  return known ? XP_KNOWN : XP_LEARNING;
}

export function summarize(session) {
  const known = session.results.filter((r) => r.known);
  const learning = session.results.filter((r) => !r.known);
  return {
    total: session.results.length,
    known: known.length,
    learning: learning.length,
    xp: session.results.reduce((sum, r) => sum + xpFor(r.known), 0),
    learningWords: learning.map((r) => r.word),
  };
}
