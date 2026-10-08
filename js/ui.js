// Small DOM helpers shared by views and games.

/**
 * Create an element: h('button', { class: 'btn', onclick: fn, 'aria-label': 'x' }, 'Text', childNode)
 * Attributes starting with "on" become event listeners; false/null attributes are skipped.
 */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value === false || value === null || value === undefined) continue;
    if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key === 'class') {
      el.className = value;
    } else if (key === 'dataset') {
      Object.assign(el.dataset, value);
    } else if (key in el && typeof value !== 'string') {
      el[key] = value;
    } else {
      el.setAttribute(key, value === true ? '' : String(value));
    }
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

export function clear(el) {
  el.replaceChildren();
}

/** Page header with optional back link, title and a one-line hint. */
export function pageHead({ title, hint, back = false, extra = null }) {
  return h('div', { class: 'page-head' },
    back && h('a', { class: 'back-link', href: '#/' }, '← Về trang chủ'),
    h('h1', { tabindex: '-1', 'data-page-title': true }, title),
    extra,
    hint && h('p', { class: 'hint' }, hint),
  );
}

/** Friendly empty/error state with a next step. */
export function emptyState({ icon, title, text, actions = [] }) {
  return h('div', { class: 'card empty' },
    h('div', { class: 'empty-icon', 'aria-hidden': 'true' }, icon),
    h('h2', {}, title),
    text && h('p', {}, text),
    actions.length > 0 && h('div', { class: 'btn-row' }, actions),
  );
}

/**
 * Show a toast message.
 * @param {string} message
 * @param {{ type?: 'info'|'error', duration?: number, action?: { label: string, onClick: () => void } }} [options]
 *   duration 0 keeps it until closed.
 */
export function toast(message, { type = 'info', duration = 3500, action = null } = {}) {
  const region = document.getElementById('toast-region');
  if (!region) return () => {};
  const close = () => el.remove();
  const el = h('div', { class: `toast${type === 'error' ? ' toast-error' : ''}` },
    h('span', { class: 'toast-msg' }, message),
    action && h('button', {
      class: 'btn',
      type: 'button',
      onclick: () => {
        close();
        action.onClick();
      },
    }, action.label),
    h('button', { class: 'toast-close', type: 'button', 'aria-label': 'Đóng thông báo', onclick: close }, '×'),
  );
  region.append(el);
  if (duration > 0) setTimeout(close, duration);
  return close;
}
