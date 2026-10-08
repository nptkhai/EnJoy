import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createServer, resolveSafe } from '../server.js';

let server;
let base;
let root;

before(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'enjoy-server-'));
  fs.writeFileSync(path.join(root, 'index.html'), '<!doctype html><title>shell</title>');
  fs.writeFileSync(path.join(root, 'sw.js'), 'self.addEventListener("fetch", () => {});');
  fs.writeFileSync(path.join(root, 'manifest.webmanifest'), '{}');
  fs.writeFileSync(path.join(root, 'mod.mjs'), 'export default 1;');
  fs.mkdirSync(path.join(root, 'data'));
  fs.writeFileSync(path.join(root, 'data', 'x.json'), '[]');
  fs.mkdirSync(path.join(root, 'certs'));
  fs.writeFileSync(path.join(root, 'certs', 'key.pem'), 'secret');

  server = createServer({ root });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.close();
  fs.rmSync(root, { recursive: true, force: true });
});

test('serves index.html for /', async () => {
  const res = await fetch(`${base}/`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /^text\/html/);
  assert.match(await res.text(), /shell/);
});

test('uses correct MIME types', async () => {
  const cases = {
    '/manifest.webmanifest': /^application\/manifest\+json/,
    '/mod.mjs': /^text\/javascript/,
    '/sw.js': /^text\/javascript/,
    '/data/x.json': /^application\/json/,
  };
  for (const [url, type] of Object.entries(cases)) {
    const res = await fetch(base + url);
    assert.equal(res.status, 200, url);
    assert.match(res.headers.get('content-type'), type, url);
    await res.arrayBuffer();
  }
});

test('sw.js is served with no-cache headers', async () => {
  const res = await fetch(`${base}/sw.js`);
  assert.match(res.headers.get('cache-control'), /no-cache/);
  assert.match(res.headers.get('cache-control'), /no-store/);
  await res.arrayBuffer();
});

test('extension-less unknown paths fall back to index.html', async () => {
  const res = await fetch(`${base}/review/some/route`);
  assert.equal(res.status, 200);
  assert.match(await res.text(), /shell/);
});

test('missing assets with an extension return 404', async () => {
  const res = await fetch(`${base}/icons/missing.png`);
  assert.equal(res.status, 404);
  await res.arrayBuffer();
});

test('HEAD works and other methods are rejected', async () => {
  const head = await fetch(`${base}/index.html`, { method: 'HEAD' });
  assert.equal(head.status, 200);
  const post = await fetch(`${base}/index.html`, { method: 'POST' });
  assert.equal(post.status, 405);
  await post.arrayBuffer();
});

test('certificates are never served', async () => {
  const res = await fetch(`${base}/certs/key.pem`);
  assert.equal(res.status, 403);
  await res.arrayBuffer();
});

test('resolveSafe blocks path traversal', () => {
  assert.equal(resolveSafe('/srv/app', '/../etc/passwd'), null);
  assert.equal(resolveSafe('/srv/app', '/%2e%2e/%2e%2e/etc/passwd'), null);
  assert.equal(resolveSafe('/srv/app', '/%E0%A4%A'), null);
  assert.equal(resolveSafe('/srv/app', '/a\0b'), null);
  assert.equal(resolveSafe('/srv/app', '/css/styles.css'), path.normalize('/srv/app/css/styles.css'));
});
