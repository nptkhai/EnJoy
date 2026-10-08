// Loads learning content from /data. Domains and vocab are plain JSON so they can be
// added without code changes (see README).

let domainsPromise = null;
const vocabCache = new Map();

async function getJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Không tải được ${url} (HTTP ${res.status})`);
  return res.json();
}

/** @returns {Promise<{ id: string, name: string, icon: string, description?: string, vocab: string }[]>} */
export function loadDomains() {
  if (!domainsPromise) {
    domainsPromise = getJSON('data/domains.json').catch((err) => {
      domainsPromise = null; // allow retry
      throw err;
    });
  }
  return domainsPromise;
}

/** Pick the domain with `id`, falling back to the first one. */
export function findDomain(domains, id) {
  return domains.find((d) => d.id === id) || domains[0];
}

/** @returns {Promise<{ word: string, ipa: string, vi: string, example: string }[]>} */
export function loadVocab(domain) {
  const url = `data/${domain.vocab || `vocab/${domain.id}.json`}`;
  if (!vocabCache.has(url)) {
    vocabCache.set(url, getJSON(url).catch((err) => {
      vocabCache.delete(url);
      throw err;
    }));
  }
  return vocabCache.get(url);
}
