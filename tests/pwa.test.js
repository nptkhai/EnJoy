import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canRegisterSW } from '../js/sw-register.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const readJSON = (p) => JSON.parse(read(p));
const exists = (p) => fs.existsSync(path.join(ROOT, p));

function pngSize(file) {
  const buf = fs.readFileSync(path.join(ROOT, file));
  assert.equal(buf.toString('ascii', 1, 4), 'PNG', `${file} is not a PNG`);
  return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
}

function listFiles(dir, ext) {
  const out = [];
  for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) out.push(...listFiles(rel, ext));
    else if (entry.name.endsWith(ext)) out.push(rel);
  }
  return out;
}

function appShell() {
  const src = read('sw.js');
  const block = /const APP_SHELL = \[([\s\S]*?)\];/.exec(src);
  assert.ok(block, 'APP_SHELL not found in sw.js');
  return [...block[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

test('manifest meets installability requirements', () => {
  const m = readJSON('manifest.webmanifest');
  assert.equal(m.name, 'EnJoy');
  assert.equal(m.short_name, 'EnJoy');
  assert.equal(m.lang, 'vi');
  assert.equal(m.display, 'standalone');
  assert.equal(m.start_url, './');
  assert.equal(m.scope, './');
  assert.match(m.theme_color, /^#[0-9a-f]{6}$/i);
  assert.match(m.background_color, /^#[0-9a-f]{6}$/i);

  const png = (size, purpose) =>
    m.icons.find((i) => i.sizes === `${size}x${size}` && i.type === 'image/png' && (i.purpose || 'any').split(' ').includes(purpose));
  for (const [size, purpose] of [[192, 'any'], [512, 'any'], [512, 'maskable']]) {
    const icon = png(size, purpose);
    assert.ok(icon, `missing ${size}px ${purpose} icon`);
    assert.deepEqual(pngSize(icon.src), [size, size], `${icon.src} has wrong dimensions`);
  }
  for (const icon of m.icons) assert.ok(exists(icon.src), `${icon.src} missing`);
});

test('index.html links manifest, icons and the module entry point', () => {
  const html = read('index.html');
  assert.match(html, /<html lang="vi">/);
  assert.match(html, /<link rel="manifest" href="manifest.webmanifest">/);
  assert.match(html, /<meta name="theme-color"/);
  assert.match(html, /<meta name="viewport"/);
  assert.match(html, /<script type="module" src="js\/app.js"><\/script>/);
  assert.ok(exists('icons/apple-touch-icon.png'));
});

test('service worker precaches every app file that exists', () => {
  const shell = appShell();
  for (const url of shell) {
    if (url === './') continue;
    assert.ok(exists(url.replace(/^\.\//, '')), `sw.js precaches missing file ${url}`);
  }
  const expected = [
    'index.html',
    'manifest.webmanifest',
    'data/domains.json',
    ...listFiles('js', '.js'),
    ...listFiles('css', '.css'),
    ...listFiles('icons', '.png'),
    ...listFiles('icons', '.svg'),
  ];
  for (const file of expected) {
    assert.ok(shell.includes(`./${file}`), `add './${file}' to APP_SHELL in sw.js so it works offline`);
  }
});

test('service worker has a versioned cache and the update handshake', () => {
  const src = read('sw.js');
  assert.match(src, /const VERSION = '[^']+';/);
  assert.match(src, /SKIP_WAITING/);
  assert.match(src, /caches\.delete/);
  assert.match(read('js/sw-register.js'), /Có bản cập nhật, tải lại/);
});

test('domains.json is valid and every vocab file is well-formed', () => {
  const domains = readJSON('data/domains.json');
  assert.ok(Array.isArray(domains) && domains.length > 0);
  const ids = new Set();
  for (const d of domains) {
    assert.match(d.id, /^[a-z0-9-]+$/, `bad domain id ${d.id}`);
    assert.ok(!ids.has(d.id), `duplicate domain ${d.id}`);
    ids.add(d.id);
    assert.ok(d.name, `${d.id}: missing name`);
    const file = `data/${d.vocab || `vocab/${d.id}.json`}`;
    assert.ok(exists(file), `${file} missing`);

    const words = readJSON(file);
    assert.ok(Array.isArray(words) && words.length >= 10, `${file}: needs at least 10 words`);
    const seen = new Set();
    for (const w of words) {
      for (const field of ['word', 'ipa', 'vi', 'example']) {
        assert.equal(typeof w[field], 'string', `${file}: "${w.word}" missing ${field}`);
        assert.ok(w[field].trim(), `${file}: "${w.word}" has empty ${field}`);
      }
      const key = w.word.toLowerCase();
      assert.ok(!seen.has(key), `${file}: duplicate word ${w.word}`);
      seen.add(key);
    }
  }
  for (const required of ['general', 'it', 'business', 'medical']) assert.ok(ids.has(required), `missing domain ${required}`);
});

test('service worker registers only on secure origins', () => {
  const ok = (protocol, hostname) => canRegisterSW({ protocol, hostname });
  assert.equal(ok('http:', 'localhost'), true);
  assert.equal(ok('http:', 'enjoy.localhost'), true);
  assert.equal(ok('http:', 'ENJOY.LOCALHOST'), true);
  assert.equal(ok('http:', '127.0.0.1'), true);
  assert.equal(ok('https:', 'enjoy.test'), true);
  assert.equal(ok('http:', 'enjoy.test'), false);
  assert.equal(ok('http:', '192.168.1.10'), false);
  assert.equal(ok('http:', 'localhost.evil.com'), false);
  assert.equal(ok('file:', ''), false);
});
