// #/game/<id> and #/review — loads the current domain and hands control to a game module.

import { h, clear, pageHead, emptyState } from '../ui.js';
import { loadDomains, findDomain, loadVocab } from '../data.js';
import { findGame } from '../games/index.js';

/**
 * @param {HTMLElement} container
 * @param {object} app shared services { store, audio, navigate }
 * @param {{ gameId: string, mode?: 'learn'|'review' }} options
 */
export function renderGame(container, app, { gameId, mode = 'learn' }) {
  const game = findGame(gameId);
  let alive = true;
  let gameCleanup = null;
  clear(container);

  if (!game) {
    container.append(
      pageHead({ title: 'Không tìm thấy trò chơi', back: true }),
      emptyState({
        icon: '🤔',
        title: `Không có trò chơi “${gameId}”`,
        text: 'Có thể đường dẫn đã cũ. Hãy chọn một trò chơi ở trang chủ.',
        actions: [h('a', { class: 'btn btn-primary', href: '#/' }, '🏠 Về trang chủ')],
      }),
    );
    return undefined;
  }

  const isReview = mode === 'review';
  const badge = h('span', { class: 'badge' }, '…');
  const stage = h('div');
  container.append(
    pageHead({
      title: isReview ? 'Ôn tập' : game.title,
      back: true,
      extra: h('p', {}, 'Lĩnh vực: ', badge, ' ', h('a', { href: '#/' }, 'Đổi')),
      hint: isReview ? 'Ôn lại các từ bạn đã đánh dấu “Chưa thuộc”.' : game.description,
    }),
    stage,
  );
  stage.append(h('p', { class: 'loading' }, 'Đang tải…'));

  loadDomains()
    .then((domains) => {
      if (!alive) return;
      const domain = findDomain(domains, app.store.getSettings().domain);
      badge.textContent = `${domain.icon || '📘'} ${domain.name}`;
      clear(stage);

      const loadWords = isReview
        ? async () => (await loadVocab(domain)).filter((w) => app.store.getWordStatus(domain.id, w.word) === 'learning')
        : () => loadVocab(domain);

      if (isReview) {
        // Check up front so the empty state can point to the right next step.
        return loadWords().then((words) => {
          if (!alive) return;
          if (words.length === 0) {
            stage.append(emptyState({
              icon: '🎉',
              title: 'Chưa có từ nào cần ôn',
              text: `Trong lĩnh vực ${domain.name}, bạn chưa đánh dấu từ nào là “Chưa thuộc”. Hãy học Flashcard trước nhé!`,
              actions: [
                h('a', { class: 'btn btn-primary', href: `#/game/${game.id}` }, `▶ Học ${game.title}`),
                h('a', { class: 'btn btn-ghost', href: '#/' }, '🏠 Về trang chủ'),
              ],
            }));
            return;
          }
          gameCleanup = game.start(stage, { ...app, domain, loadWords, mode });
        });
      }
      gameCleanup = game.start(stage, { ...app, domain, loadWords, mode });
      return undefined;
    })
    .catch(() => {
      if (!alive) return;
      clear(stage);
      stage.append(emptyState({
        icon: '📡',
        title: 'Không tải được dữ liệu',
        text: 'Hãy kiểm tra máy chủ (npm start) hoặc kết nối mạng rồi thử lại.',
        actions: [h('button', { class: 'btn btn-primary', type: 'button', onclick: () => app.refresh() }, '↻ Thử lại')],
      }));
    });

  return () => {
    alive = false;
    if (typeof gameCleanup === 'function') gameCleanup();
  };
}
