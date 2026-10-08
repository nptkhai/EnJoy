// Progress & settings storage (localStorage) with a versioned schema.
// Pure module: nothing touches localStorage at import time, so it also runs under node:test.

export const STORAGE_KEY = 'enjoy:state';
export const BACKUP_KEY = 'enjoy:state:backup';
export const SCHEMA_VERSION = 1;
export const EXPORT_APP_ID = 'enjoy';

export const XP_KNOWN = 10;
export const XP_LEARNING = 2;

export const THEMES = ['auto', 'light', 'dark'];
export const SPEECH_RATE_MIN = 0.5;
export const SPEECH_RATE_MAX = 1.5;

export function defaultState() {
  return {
    schemaVersion: SCHEMA_VERSION,
    settings: { domain: 'general', theme: 'auto', speechRate: 0.9 },
    stats: { xp: 0, streak: { count: 0, lastDate: null } },
    words: {},
  };
}

/**
 * Migration steps: MIGRATIONS[n] turns a version-n object into version n+1.
 * Version 0 = data saved without a schemaVersion field.
 * To change the schema: bump SCHEMA_VERSION and add a step here (never edit old steps).
 */
export const MIGRATIONS = {
  0: (data) => ({ ...data, schemaVersion: 1 }),
};

export class StoreError extends Error {}

function isObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/** Run migration steps until `target`. Throws StoreError for data from a newer version. */
export function migrate(data, migrations = MIGRATIONS, target = SCHEMA_VERSION) {
  if (!isObject(data)) throw new StoreError('Dữ liệu không hợp lệ.');
  let current = { ...data };
  let version = Number.isInteger(current.schemaVersion) ? current.schemaVersion : 0;
  if (version > target) {
    throw new StoreError('Dữ liệu được tạo bởi phiên bản EnJoy mới hơn. Hãy cập nhật ứng dụng.');
  }
  while (version < target) {
    const step = migrations[version];
    if (typeof step !== 'function') throw new StoreError(`Thiếu bước nâng cấp dữ liệu từ phiên bản ${version}.`);
    current = step(current);
    version += 1;
    current.schemaVersion = version;
  }
  return current;
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

/** Fill in defaults and drop malformed fields so the rest of the app can trust the shape. */
export function normalize(data) {
  const base = defaultState();
  const src = isObject(data) ? data : {};
  const settings = isObject(src.settings) ? src.settings : {};
  const stats = isObject(src.stats) ? src.stats : {};
  const streak = isObject(stats.streak) ? stats.streak : {};
  const words = isObject(src.words) ? src.words : {};

  const out = base;
  if (typeof settings.domain === 'string' && settings.domain) out.settings.domain = settings.domain;
  if (THEMES.includes(settings.theme)) out.settings.theme = settings.theme;
  if (Number.isFinite(settings.speechRate)) {
    out.settings.speechRate = clamp(settings.speechRate, SPEECH_RATE_MIN, SPEECH_RATE_MAX);
  }
  if (Number.isFinite(stats.xp) && stats.xp >= 0) out.stats.xp = Math.floor(stats.xp);
  if (Number.isInteger(streak.count) && streak.count >= 0) out.stats.streak.count = streak.count;
  if (typeof streak.lastDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(streak.lastDate)) {
    out.stats.streak.lastDate = streak.lastDate;
  }
  for (const [key, entry] of Object.entries(words)) {
    if (!isObject(entry) || !['known', 'learning'].includes(entry.status)) continue;
    out.words[key] = {
      status: entry.status,
      seen: Number.isInteger(entry.seen) && entry.seen > 0 ? entry.seen : 1,
      lastSeen: typeof entry.lastSeen === 'string' ? entry.lastSeen : null,
    };
  }
  return out;
}

/** Local calendar date as YYYY-MM-DD. */
export function toDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function previousDateKey(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate() - 1);
  return toDateKey(d);
}

/** Streak after studying on `now`: same day = unchanged, next day = +1, otherwise restart at 1. */
export function updateStreak(streak, now) {
  const today = toDateKey(now);
  if (streak.lastDate === today) return { ...streak };
  if (streak.lastDate === previousDateKey(now)) return { count: streak.count + 1, lastDate: today };
  return { count: 1, lastDate: today };
}

/** Streak to display: it is broken (0) if the last study day was before yesterday. */
export function currentStreak(streak, now) {
  if (streak.lastDate === toDateKey(now) || streak.lastDate === previousDateKey(now)) return streak.count;
  return 0;
}

export function wordKey(domain, word) {
  return `${domain}:${word.toLowerCase()}`;
}

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

/**
 * @param {object} [options]
 * @param {Storage} [options.storage] defaults to window.localStorage, falls back to memory
 * @param {() => Date} [options.now]
 */
export function createStore({ storage, now = () => new Date() } = {}) {
  let backend = storage;
  if (!backend) {
    try {
      backend = globalThis.localStorage;
      backend.getItem(STORAGE_KEY); // throws when storage is blocked
    } catch {
      backend = null;
    }
  }
  let persistent = Boolean(backend);
  if (!backend) backend = memoryStorage();

  const listeners = new Set();
  let state = load();

  function load() {
    let raw = null;
    try {
      raw = backend.getItem(STORAGE_KEY);
    } catch {
      persistent = false;
    }
    if (!raw) return defaultState();
    try {
      return normalize(migrate(JSON.parse(raw)));
    } catch {
      // Corrupt or newer-version data: keep a copy instead of silently destroying it.
      try {
        backend.setItem(BACKUP_KEY, raw);
      } catch {
        /* ignore */
      }
      return defaultState();
    }
  }

  function save() {
    try {
      backend.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      persistent = false; // quota exceeded / private mode: keep working in memory
    }
    for (const fn of listeners) fn(state);
  }

  function getStats() {
    const known = Object.values(state.words).filter((w) => w.status === 'known').length;
    return {
      xp: state.stats.xp,
      streak: currentStreak(state.stats.streak, now()),
      wordsLearned: known,
    };
  }

  return {
    get persistent() {
      return persistent;
    },
    getState: () => structuredClone(state),
    getSettings: () => ({ ...state.settings }),
    setSetting(key, value) {
      if (!(key in state.settings)) throw new StoreError(`Cài đặt không tồn tại: ${key}`);
      state = normalize({ ...state, settings: { ...state.settings, [key]: value } });
      save();
    },
    getStats,
    getWordStatus(domain, word) {
      return state.words[wordKey(domain, word)]?.status ?? 'new';
    },
    /** Record a flashcard answer. Returns the XP gained. */
    recordAnswer(domain, word, known) {
      const key = wordKey(domain, word);
      const prev = state.words[key];
      const gained = known ? XP_KNOWN : XP_LEARNING;
      state.words[key] = {
        status: known ? 'known' : 'learning',
        seen: (prev?.seen ?? 0) + 1,
        lastSeen: toDateKey(now()),
      };
      state.stats.xp += gained;
      state.stats.streak = updateStreak(state.stats.streak, now());
      save();
      return gained;
    },
    exportJSON() {
      return JSON.stringify({ app: EXPORT_APP_ID, exportedAt: now().toISOString(), data: state }, null, 2);
    },
    /** Replace all progress with the content of an exported file. Throws StoreError (Vietnamese message). */
    importJSON(text) {
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new StoreError('Tệp không phải JSON hợp lệ.');
      }
      if (!isObject(parsed)) throw new StoreError('Tệp không đúng định dạng của EnJoy.');
      let data = parsed;
      if ('app' in parsed || 'data' in parsed) {
        if (parsed.app !== EXPORT_APP_ID || !isObject(parsed.data)) {
          throw new StoreError('Tệp không đúng định dạng của EnJoy.');
        }
        data = parsed.data;
      }
      state = normalize(migrate(data));
      save();
    },
    reset() {
      const settings = state.settings; // keep preferences, clear learning progress
      state = defaultState();
      state.settings = { ...settings };
      save();
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}
