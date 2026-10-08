// EnJoy — entry point: wires the store, audio, router and views together.

import { createStore } from './store.js';
import { createAudio } from './audio.js';
import { createRouter } from './router.js';
import { h, clear, pageHead, emptyState, toast } from './ui.js';
import { registerServiceWorker } from './sw-register.js';
import { renderHome } from './views/home.js';
import { renderGame } from './views/game.js';
import { renderSettings } from './views/settings.js';
import { findGame } from './games/index.js';

const THEME_COLORS = { light: '#1d4ed8', dark: '#0f1420' };

const store = createStore();
const audio = createAudio({ getRate: () => store.getSettings().speechRate });
const main = document.getElementById('app');
const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');

function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'light' || theme === 'dark') root.dataset.theme = theme;
  else delete root.dataset.theme;
  const effective = theme === 'light' || theme === 'dark' ? theme : darkQuery.matches ? 'dark' : 'light';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLORS[effective]);
}

applyTheme(store.getSettings().theme);
darkQuery.addEventListener('change', () => applyTheme(store.getSettings().theme));

// Shared services handed to every view and game.
const app = {
  store,
  audio,
  toast,
  applyTheme,
  navigate: (path) => router.navigate(path),
  refresh: () => router.refresh(),
};

const TITLES = { home: 'EnJoy', review: 'Ôn tập · EnJoy', settings: 'Cài đặt · EnJoy' };

let firstRender = true;

const router = createRouter({
  routes: [
    { path: '/', render: () => renderHome(main, app) },
    {
      path: '/game/:id',
      render: ({ id }) => {
        document.title = `${findGame(id)?.title ?? 'Trò chơi'} · EnJoy`;
        return renderGame(main, app, { gameId: id });
      },
    },
    { path: '/review', render: () => renderGame(main, app, { gameId: 'flashcard', mode: 'review' }) },
    { path: '/settings', render: () => renderSettings(main, app) },
  ],
  notFound: () => {
    clear(main);
    main.append(
      pageHead({ title: 'Không tìm thấy trang', back: true }),
      emptyState({
        icon: '🧭',
        title: 'Trang này không tồn tại',
        text: 'Đường dẫn có thể bị gõ sai. Hãy quay về trang chủ.',
        actions: [h('a', { class: 'btn btn-primary', href: '#/' }, '🏠 Về trang chủ')],
      }),
    );
  },
  onChange: (path) => {
    const section = path === '/' ? 'home' : path.split('/')[1];
    for (const link of document.querySelectorAll('[data-nav]')) {
      if (link.dataset.nav === section) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    }
    if (TITLES[section]) document.title = TITLES[section];
    // Move focus to the new page title so keyboard and screen-reader users land in the content.
    if (!firstRender) {
      const heading = main.querySelector('[data-page-title]');
      (heading || main).focus({ preventScroll: true });
      window.scrollTo(0, 0);
    }
    firstRender = false;
  },
});

router.start();
registerServiceWorker({ toast });

if (!store.persistent) {
  toast('Trình duyệt đang chặn lưu dữ liệu. Tiến độ sẽ mất khi đóng ứng dụng.', { type: 'error', duration: 8000 });
}
