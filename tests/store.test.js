import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createStore,
  migrate,
  normalize,
  updateStreak,
  currentStreak,
  toDateKey,
  defaultState,
  StoreError,
  STORAGE_KEY,
  BACKUP_KEY,
  SCHEMA_VERSION,
  XP_KNOWN,
  XP_LEARNING,
} from '../js/store.js';

function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    map,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

const at = (iso) => () => new Date(iso);

test('fresh store starts with defaults', () => {
  const store = createStore({ storage: fakeStorage() });
  assert.deepEqual(store.getState(), defaultState());
  assert.deepEqual(store.getStats(), { xp: 0, streak: 0, wordsLearned: 0 });
  assert.equal(store.persistent, true);
});

test('migrate: unversioned data is upgraded to the current schema', () => {
  const legacy = { settings: { domain: 'it', theme: 'dark' }, stats: { xp: 40 } };
  const out = migrate(legacy);
  assert.equal(out.schemaVersion, SCHEMA_VERSION);
  assert.equal(out.settings.domain, 'it');
  assert.equal(out.stats.xp, 40);
});

test('migrate: runs every step in order', () => {
  const calls = [];
  const migrations = {
    0: (d) => (calls.push(0), { ...d, a: 1 }),
    1: (d) => (calls.push(1), { ...d, b: d.a + 1 }),
    2: (d) => (calls.push(2), { ...d, c: d.b + 1 }),
  };
  const out = migrate({}, migrations, 3);
  assert.deepEqual(calls, [0, 1, 2]);
  assert.deepEqual(out, { a: 1, b: 2, c: 3, schemaVersion: 3 });

  calls.length = 0;
  migrate({ schemaVersion: 2, b: 5 }, migrations, 3);
  assert.deepEqual(calls, [2]);
});

test('migrate: rejects data from a newer version and non-objects', () => {
  assert.throws(() => migrate({ schemaVersion: SCHEMA_VERSION + 1 }), StoreError);
  assert.throws(() => migrate(null), StoreError);
  assert.throws(() => migrate([]), StoreError);
  assert.throws(() => migrate({}, {}, 1), /Thiếu bước nâng cấp/);
});

test('normalize: fills defaults and drops invalid fields', () => {
  const out = normalize({
    settings: { theme: 'neon', speechRate: 9, domain: '' },
    stats: { xp: -5, streak: { count: 'x', lastDate: 'yesterday' } },
    words: { 'it:bug': { status: 'known' }, 'it:x': { status: 'weird' }, bad: 3 },
  });
  assert.equal(out.settings.theme, 'auto');
  assert.equal(out.settings.speechRate, 1.5);
  assert.equal(out.settings.domain, 'general');
  assert.equal(out.stats.xp, 0);
  assert.deepEqual(out.stats.streak, { count: 0, lastDate: null });
  assert.deepEqual(Object.keys(out.words), ['it:bug']);
  assert.equal(out.words['it:bug'].seen, 1);
});

test('loads and migrates unversioned data from storage', () => {
  const storage = fakeStorage({
    [STORAGE_KEY]: JSON.stringify({ settings: { domain: 'medical' }, stats: { xp: 12 } }),
  });
  const store = createStore({ storage });
  assert.equal(store.getSettings().domain, 'medical');
  assert.equal(store.getStats().xp, 12);
  assert.equal(store.getState().schemaVersion, SCHEMA_VERSION);
});

test('corrupt or newer data is backed up, not lost', () => {
  const newer = JSON.stringify({ schemaVersion: 99, stats: { xp: 1000 } });
  const storage = fakeStorage({ [STORAGE_KEY]: newer });
  const store = createStore({ storage });
  assert.equal(store.getStats().xp, 0);
  assert.equal(storage.map.get(BACKUP_KEY), newer);

  const storage2 = fakeStorage({ [STORAGE_KEY]: '{not json' });
  createStore({ storage: storage2 });
  assert.equal(storage2.map.get(BACKUP_KEY), '{not json');
});

test('settings persist', () => {
  const storage = fakeStorage();
  const store = createStore({ storage });
  store.setSetting('domain', 'business');
  store.setSetting('theme', 'dark');
  store.setSetting('speechRate', 1.2);
  const reloaded = createStore({ storage });
  assert.deepEqual(reloaded.getSettings(), { domain: 'business', theme: 'dark', speechRate: 1.2 });
  assert.throws(() => store.setSetting('nope', 1), StoreError);
});

test('recordAnswer updates XP, word status and words learned', () => {
  const store = createStore({ storage: fakeStorage(), now: at('2026-10-08T09:00:00') });
  assert.equal(store.getWordStatus('it', 'Bug'), 'new');
  assert.equal(store.recordAnswer('it', 'bug', false), XP_LEARNING);
  assert.equal(store.getWordStatus('it', 'bug'), 'learning');
  assert.equal(store.recordAnswer('it', 'Bug', true), XP_KNOWN);
  assert.equal(store.getWordStatus('it', 'bug'), 'known');
  assert.equal(store.getState().words['it:bug'].seen, 2);
  assert.deepEqual(store.getStats(), { xp: XP_KNOWN + XP_LEARNING, streak: 1, wordsLearned: 1 });
});

test('streak: same day, next day, gap', () => {
  const d = (s) => new Date(`${s}T10:00:00`);
  let s = { count: 0, lastDate: null };
  s = updateStreak(s, d('2026-10-08'));
  assert.deepEqual(s, { count: 1, lastDate: '2026-10-08' });
  s = updateStreak(s, d('2026-10-08'));
  assert.equal(s.count, 1);
  s = updateStreak(s, d('2026-10-09'));
  assert.equal(s.count, 2);
  // across a month boundary
  s = updateStreak({ count: 4, lastDate: '2026-10-31' }, d('2026-11-01'));
  assert.equal(s.count, 5);
  s = updateStreak(s, d('2026-11-03'));
  assert.deepEqual(s, { count: 1, lastDate: '2026-11-03' });

  assert.equal(currentStreak({ count: 5, lastDate: '2026-11-02' }, d('2026-11-03')), 5);
  assert.equal(currentStreak({ count: 5, lastDate: '2026-11-01' }, d('2026-11-03')), 0);
  assert.equal(toDateKey(d('2026-01-05')), '2026-01-05');
});

test('export → import round-trips progress', () => {
  const a = createStore({ storage: fakeStorage(), now: at('2026-10-08T09:00:00') });
  a.setSetting('domain', 'it');
  a.recordAnswer('it', 'server', true);
  const json = a.exportJSON();
  const parsed = JSON.parse(json);
  assert.equal(parsed.app, 'enjoy');
  assert.equal(parsed.data.schemaVersion, SCHEMA_VERSION);

  const storage = fakeStorage();
  const b = createStore({ storage, now: at('2026-10-08T12:00:00') });
  b.importJSON(json);
  assert.deepEqual(b.getState(), a.getState());
  assert.deepEqual(createStore({ storage }).getState(), a.getState(), 'import is persisted');
});

test('import accepts older exports and migrates them', () => {
  const store = createStore({ storage: fakeStorage() });
  store.importJSON(JSON.stringify({ app: 'enjoy', data: { stats: { xp: 7 } } }));
  assert.equal(store.getStats().xp, 7);
  assert.equal(store.getState().schemaVersion, SCHEMA_VERSION);
});

test('import rejects invalid files and keeps current progress', () => {
  const store = createStore({ storage: fakeStorage() });
  store.recordAnswer('general', 'hello', true);
  const before = store.getState();
  assert.throws(() => store.importJSON('not json'), /JSON/);
  assert.throws(() => store.importJSON('[1,2]'), StoreError);
  assert.throws(() => store.importJSON(JSON.stringify({ app: 'other', data: {} })), StoreError);
  assert.throws(() => store.importJSON(JSON.stringify({ app: 'enjoy', data: { schemaVersion: 99 } })), StoreError);
  assert.deepEqual(store.getState(), before);
});

test('reset clears progress but keeps settings', () => {
  const store = createStore({ storage: fakeStorage() });
  store.setSetting('theme', 'dark');
  store.recordAnswer('general', 'hello', true);
  store.reset();
  assert.deepEqual(store.getStats(), { xp: 0, streak: 0, wordsLearned: 0 });
  assert.equal(store.getSettings().theme, 'dark');
});

test('keeps working in memory when storage throws', () => {
  const broken = {
    getItem() {
      throw new Error('SecurityError');
    },
    setItem() {
      throw new Error('QuotaExceededError');
    },
  };
  const store = createStore({ storage: broken });
  store.recordAnswer('general', 'hello', true);
  assert.equal(store.getStats().xp, XP_KNOWN);
  assert.equal(store.persistent, false);
});

test('subscribers are notified on change', () => {
  const store = createStore({ storage: fakeStorage() });
  let calls = 0;
  const off = store.subscribe(() => calls++);
  store.recordAnswer('general', 'hello', true);
  off();
  store.recordAnswer('general', 'world', true);
  assert.equal(calls, 1);
});
