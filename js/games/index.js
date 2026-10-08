// Game registry. To add a game: create js/games/<id>.js exporting
// { id, title, description, start(container, ctx) } (optional: icon), then add one line below.
// Also add the file to the APP_SHELL list in sw.js so it works offline (a test checks this).

import * as flashcard from './flashcard.js';

export const games = [
  flashcard,
];

export function findGame(id) {
  return games.find((g) => g.id === id) || null;
}
