// Game: Flashcard từ vựng — lật thẻ, tự đánh giá "Đã thuộc" / "Chưa thuộc".

import { h, clear, emptyState } from '../ui.js';
import {
  buildDeck,
  createSession,
  currentCard,
  flip,
  answer,
  isDone,
  progress,
  summarize,
  xpFor,
} from '../lib/flashcard-logic.js';

export const id = 'flashcard';
export const title = 'Flashcard từ vựng';
export const description = 'Lật thẻ để xem nghĩa, rồi tự đánh giá: đã thuộc hay chưa.';
export const icon = '🃏';

/**
 * @param {HTMLElement} container
 * @param {{ domain: { id: string, name: string }, loadWords: () => Promise<any[]>, store: any,
 *           audio: any, navigate: (path: string) => void, mode?: 'learn'|'review' }} ctx
 * @returns {() => void} cleanup
 */
export function start(container, ctx) {
  const { domain, store, audio, navigate, mode = 'learn' } = ctx;
  let session = null;
  let alive = true;
  let els = null;

  container.append(h('p', { class: 'loading' }, 'Đang tải từ vựng…'));
  begin();

  async function begin() {
    let words;
    try {
      words = await ctx.loadWords();
    } catch (err) {
      if (!alive) return;
      clear(container);
      container.append(emptyState({
        icon: '📡',
        title: 'Không tải được từ vựng',
        text: 'Hãy kiểm tra kết nối rồi thử lại. Nếu đã mở app ít nhất một lần, dữ liệu sẽ có sẵn khi offline.',
        actions: [h('button', { class: 'btn btn-primary', type: 'button', onclick: () => { clear(container); begin(); } }, '↻ Thử lại')],
      }));
      return;
    }
    if (!alive) return;
    const deck = buildDeck(words, (w) => store.getWordStatus(domain.id, w));
    clear(container);
    if (deck.length === 0) {
      container.append(emptyState({
        icon: mode === 'review' ? '🎉' : '📭',
        title: mode === 'review' ? 'Không còn từ nào cần ôn' : 'Lĩnh vực này chưa có từ vựng',
        actions: [h('a', { class: 'btn btn-primary', href: '#/' }, '🏠 Về trang chủ')],
      }));
      return;
    }
    session = createSession(deck);
    buildCardUI();
    update();
  }

  function buildCardUI() {
    els = {};
    els.bar = h('div', { class: 'progress-bar' });
    els.progress = h('div', {
      class: 'progress',
      role: 'progressbar',
      'aria-label': 'Tiến độ',
      'aria-valuemin': '0',
    }, els.bar);
    els.count = h('span', { class: 'fc-count' });
    els.feedback = h('span', { class: 'badge', 'aria-live': 'polite' });

    els.word = h('span', { class: 'fc-word', lang: 'en' });
    els.ipa = h('span', { class: 'fc-ipa' });
    els.front = h('span', { class: 'fc-face fc-front' },
      els.word, els.ipa,
      h('span', { class: 'fc-tap' }, '👆 Chạm để xem nghĩa'));

    els.vi = h('span', { class: 'fc-vi' });
    els.backWord = h('span', { class: 'fc-ipa', lang: 'en' });
    els.example = h('span', { class: 'fc-example', lang: 'en' });
    els.back = h('span', { class: 'fc-face fc-back' },
      els.backWord, els.vi, els.example,
      h('span', { class: 'fc-tap' }, '👆 Chạm để lật lại'));

    els.card = h('button', {
      class: 'fc-card',
      type: 'button',
      'aria-pressed': 'false',
      'aria-describedby': 'fc-help',
      onclick: onFlip,
    }, h('span', { class: 'fc-inner' }, els.front, els.back));

    els.speak = h('button', {
      class: 'btn btn-ghost',
      type: 'button',
      onclick: onSpeak,
      disabled: !audio.isSupported,
      title: audio.isSupported ? 'Nghe phát âm (phím P)' : 'Trình duyệt không hỗ trợ đọc văn bản',
    }, '🔊 Nghe');

    els.flipBtn = h('button', { class: 'btn btn-ghost', type: 'button', onclick: onFlip }, '🔄 Lật thẻ');

    container.append(h('div', { class: 'fc' },
      h('div', { class: 'fc-top' }, els.progress, els.count),
      h('p', { id: 'fc-help', class: 'hint' }, 'Đọc từ, tự nhớ nghĩa, rồi lật thẻ để kiểm tra. Sau đó chọn bạn đã thuộc hay chưa.'),
      els.card,
      h('div', { class: 'fc-tools' }, els.speak, els.flipBtn, els.feedback),
      h('div', { class: 'fc-actions' },
        h('button', { class: 'btn btn-warning', type: 'button', onclick: () => onAnswer(false) }, '↻ Chưa thuộc'),
        h('button', { class: 'btn btn-success', type: 'button', onclick: () => onAnswer(true) }, '✓ Đã thuộc')),
      h('p', { class: 'kbd-hint' },
        'Phím tắt: ', h('kbd', {}, 'Space'), ' lật thẻ · ',
        h('kbd', {}, '1'), ' / ', h('kbd', {}, '←'), ' chưa thuộc · ',
        h('kbd', {}, '2'), ' / ', h('kbd', {}, '→'), ' đã thuộc · ',
        h('kbd', {}, 'P'), ' nghe'),
    ));
  }

  function update() {
    if (isDone(session)) return showSummary();
    const card = currentCard(session);
    const p = progress(session);
    els.bar.style.width = `${p.percent}%`;
    els.progress.setAttribute('aria-valuemax', String(p.total));
    els.progress.setAttribute('aria-valuenow', String(session.index));
    els.progress.setAttribute('aria-valuetext', `Thẻ ${p.current} trên ${p.total}`);
    els.count.textContent = `Thẻ ${p.current}/${p.total}`;

    els.word.textContent = card.word;
    els.ipa.textContent = card.ipa || '';
    els.backWord.textContent = `${card.word}${card.ipa ? `  ${card.ipa}` : ''}`;
    els.vi.textContent = card.vi;
    els.example.textContent = card.example ? `“${card.example}”` : '';

    els.card.setAttribute('aria-pressed', String(session.flipped));
    // Only the visible face is exposed to screen readers (it becomes the button's name).
    els.front.setAttribute('aria-hidden', String(session.flipped));
    els.back.setAttribute('aria-hidden', String(!session.flipped));
    els.flipBtn.textContent = session.flipped ? '🔄 Xem lại từ' : '🔄 Xem nghĩa';
  }

  function onFlip() {
    if (!session || isDone(session)) return;
    session = flip(session);
    update();
  }

  function onSpeak() {
    const card = session && currentCard(session);
    if (!card) return;
    audio.speak(session.flipped && card.example ? `${card.word}. ${card.example}` : card.word);
  }

  function onAnswer(known) {
    const card = session && currentCard(session);
    if (!card) return;
    store.recordAnswer(domain.id, card.word, known);
    session = answer(session, known);
    els.feedback.textContent = `${known ? '✓' : '↻'} ${card.word}: +${xpFor(known)} XP`;
    update();
  }

  function showSummary() {
    const s = summarize(session);
    const allKnown = s.learning === 0;
    clear(container);
    const heading = h('h2', { tabindex: '-1' }, allKnown ? 'Xuất sắc! Bạn đã thuộc hết.' : 'Hoàn thành lượt học!');
    container.append(h('div', { class: 'card summary' },
      h('div', { class: 'summary-big', 'aria-hidden': 'true' }, allKnown ? '🎉' : '💪'),
      heading,
      h('div', { class: 'summary-stats' },
        h('span', { class: 'badge' }, `✓ Đã thuộc: ${s.known}`),
        h('span', { class: 'badge' }, `↻ Chưa thuộc: ${s.learning}`),
        h('span', { class: 'badge' }, `⭐ +${s.xp} XP`)),
      s.learning > 0 && h('p', {}, 'Cần ôn thêm: ', h('strong', { lang: 'en' }, s.learningWords.join(', '))),
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn btn-primary', type: 'button', onclick: restart },
          mode === 'review' ? '↻ Ôn lại' : '↻ Học lại'),
        mode === 'learn' && s.learning > 0 &&
          h('button', { class: 'btn', type: 'button', onclick: () => navigate('/review') }, '🔁 Ôn từ chưa thuộc'),
        h('a', { class: 'btn btn-ghost', href: '#/' }, '🏠 Về trang chủ')),
    ));
    heading.focus();
  }

  function restart() {
    clear(container);
    container.append(h('p', { class: 'loading' }, 'Đang tải từ vựng…'));
    begin();
  }

  function onKey(e) {
    if (!session || isDone(session) || e.altKey || e.ctrlKey || e.metaKey) return;
    const t = e.target;
    if (t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    const onControl = t instanceof HTMLElement && /^(BUTTON|A)$/.test(t.tagName);
    switch (e.key) {
      case ' ':
      case 'Enter':
        if (onControl) return; // let the focused button/link do its own thing
        e.preventDefault();
        onFlip();
        break;
      case '1':
      case 'ArrowLeft':
        e.preventDefault();
        onAnswer(false);
        break;
      case '2':
      case 'ArrowRight':
        e.preventDefault();
        onAnswer(true);
        break;
      case 'p':
      case 'P':
        onSpeak();
        break;
      default:
    }
  }

  document.addEventListener('keydown', onKey);
  return () => {
    alive = false;
    document.removeEventListener('keydown', onKey);
    audio.cancel();
  };
}
