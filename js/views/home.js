// Home: stats, domain picker, games list.

import { h, clear, pageHead, emptyState, toast } from '../ui.js';
import { loadDomains, findDomain, loadVocab } from '../data.js';
import { games } from '../games/index.js';

export function renderHome(container, app) {
  const { store } = app;
  let alive = true;

  const statsEl = h('div', { class: 'stats', role: 'list' });
  const reviewEl = h('div');
  const domainEl = h('div', {}, h('p', { class: 'loading' }, 'Đang tải lĩnh vực…'));

  clear(container);
  container.append(
    pageHead({ title: 'Chào bạn 👋', hint: 'Chọn lĩnh vực bạn muốn học, rồi bắt đầu một trò chơi. Mỗi ngày một chút là đủ!' }),
    h('section', { class: 'section', 'aria-labelledby': 'stats-title' },
      h('h2', { id: 'stats-title', class: 'visually-hidden' }, 'Thành tích của bạn'),
      statsEl),
    reviewEl,
    h('section', { class: 'section', 'aria-labelledby': 'domain-title' },
      h('h2', { id: 'domain-title' }, '1. Chọn lĩnh vực'),
      domainEl),
    h('section', { class: 'section', 'aria-labelledby': 'games-title' },
      h('h2', { id: 'games-title' }, '2. Chọn trò chơi'),
      renderGames()),
  );

  renderStats();
  const unsubscribe = store.subscribe(renderStats);
  renderDomains();

  function renderStats() {
    const s = store.getStats();
    statsEl.replaceChildren(
      stat('⭐', s.xp, 'Điểm XP'),
      stat('🔥', s.streak, 'Chuỗi ngày học'),
      stat('📚', s.wordsLearned, 'Từ đã thuộc'),
    );
  }

  async function renderDomains() {
    let domains;
    try {
      domains = await loadDomains();
    } catch {
      if (!alive) return;
      domainEl.replaceChildren(emptyState({
        icon: '📡',
        title: 'Không tải được danh sách lĩnh vực',
        text: 'Hãy kiểm tra máy chủ (npm start) hoặc kết nối mạng rồi thử lại.',
        actions: [h('button', { class: 'btn btn-primary', type: 'button', onclick: renderDomains }, '↻ Thử lại')],
      }));
      return;
    }
    if (!alive) return;
    const current = findDomain(domains, store.getSettings().domain);
    const fieldset = h('fieldset', { class: 'domain-grid' },
      h('legend', { class: 'visually-hidden' }, 'Lĩnh vực học'),
      domains.map((d) => {
        const inputId = `domain-${d.id}`;
        return h('div', { class: 'domain-option' },
          h('input', {
            type: 'radio',
            name: 'domain',
            id: inputId,
            value: d.id,
            checked: d.id === current.id,
            onchange: () => {
              store.setSetting('domain', d.id);
              toast(`Đã chọn lĩnh vực: ${d.name}`);
              renderReview(d);
            },
          }),
          h('label', { for: inputId },
            h('span', { class: 'domain-icon', 'aria-hidden': 'true' }, d.icon || '📘'),
            h('span', {},
              h('span', { class: 'domain-name' }, d.name),
              d.description && h('span', { class: 'domain-desc' }, d.description)),
            h('span', { class: 'domain-check', 'aria-hidden': 'true' }, '✓')));
      }));
    domainEl.replaceChildren(fieldset);
    renderReview(current);
  }

  /** Shortcut card when the current domain has words marked "chưa thuộc". */
  async function renderReview(domain) {
    let words = [];
    try {
      words = await loadVocab(domain);
    } catch {
      /* the game view shows a proper error */
    }
    if (!alive) return;
    const count = words.filter((w) => store.getWordStatus(domain.id, w.word) === 'learning').length;
    reviewEl.replaceChildren(count === 0 ? '' : h('section', { class: 'section' },
      h('div', { class: 'card game-item' },
        h('span', { class: 'game-icon', 'aria-hidden': 'true' }, '🔁'),
        h('div', { class: 'game-text' },
          h('h2', {}, `Có ${count} từ cần ôn`),
          h('p', {}, `Các từ bạn đánh dấu “Chưa thuộc” trong lĩnh vực ${domain.name}.`)),
        h('a', { class: 'btn btn-primary', href: '#/review' }, 'Ôn ngay'))));
  }

  return () => {
    alive = false;
    unsubscribe();
  };
}

function stat(icon, value, label) {
  return h('div', { class: 'card stat', role: 'listitem' },
    h('span', { class: 'stat-icon', 'aria-hidden': 'true' }, icon),
    h('span', { class: 'stat-value' }, String(value)),
    h('span', { class: 'stat-label' }, label));
}

function renderGames() {
  return h('ul', { class: 'game-list' },
    games.map((g) => h('li', { class: 'card game-item' },
      h('span', { class: 'game-icon', 'aria-hidden': 'true' }, g.icon || '🎮'),
      h('div', { class: 'game-text' },
        h('h3', {}, g.title),
        h('p', {}, g.description)),
      h('a', { class: 'btn btn-primary', href: `#/game/${encodeURIComponent(g.id)}`, 'aria-label': `Bắt đầu: ${g.title}` }, '▶ Bắt đầu'))));
}
