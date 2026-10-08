import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHash, matchRoute } from '../js/router.js';

test('parseHash normalises hashes', () => {
  assert.equal(parseHash(''), '/');
  assert.equal(parseHash('#'), '/');
  assert.equal(parseHash('#/'), '/');
  assert.equal(parseHash('#/settings/'), '/settings');
  assert.equal(parseHash('#review'), '/review');
  assert.equal(parseHash('#/game/flashcard?x=1'), '/game/flashcard');
});

test('matchRoute extracts params', () => {
  const routes = [{ path: '/' }, { path: '/game/:id' }, { path: '/review' }, { path: '/settings' }];
  assert.equal(matchRoute(routes, '/').route.path, '/');
  assert.deepEqual(matchRoute(routes, '/game/flashcard').params, { id: 'flashcard' });
  assert.deepEqual(matchRoute(routes, '/game/a%20b').params, { id: 'a b' });
  assert.equal(matchRoute(routes, '/review').route.path, '/review');
  assert.equal(matchRoute(routes, '/game'), null);
  assert.equal(matchRoute(routes, '/game/x/y'), null);
  assert.equal(matchRoute(routes, '/nope'), null);
});
