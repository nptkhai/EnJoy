// Minimal hash router: #/, #/game/<id>, #/review, #/settings.

/** '#/game/flashcard?x=1' → '/game/flashcard' */
export function parseHash(hash) {
  let path = (hash || '').replace(/^#/, '').split('?')[0];
  if (!path.startsWith('/')) path = `/${path}`;
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
  return path;
}

function compile(pattern) {
  const names = [];
  const source = pattern
    .split('/')
    .map((part) => {
      if (part.startsWith(':')) {
        names.push(part.slice(1));
        return '([^/]+)';
      }
      return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('/');
  return { regex: new RegExp(`^${source}$`), names };
}

/** Find the route matching `path`. Returns { route, params } or null. */
export function matchRoute(routes, path) {
  for (const route of routes) {
    const { regex, names } = route.compiled || (route.compiled = compile(route.path));
    const m = regex.exec(path);
    if (!m) continue;
    const params = {};
    names.forEach((name, i) => {
      try {
        params[name] = decodeURIComponent(m[i + 1]);
      } catch {
        params[name] = m[i + 1];
      }
    });
    return { route, params };
  }
  return null;
}

/**
 * @param {{ routes: { path: string, render: (params) => (void | (() => void)) }[],
 *           notFound: () => void, onChange?: (path: string) => void }} options
 * Each render may return a cleanup function, called before the next route renders.
 */
export function createRouter({ routes, notFound, onChange }) {
  let cleanup = null;

  function render() {
    if (typeof cleanup === 'function') {
      try {
        cleanup();
      } catch (err) {
        console.error(err);
      }
    }
    cleanup = null;
    const path = parseHash(location.hash);
    const match = matchRoute(routes, path);
    cleanup = match ? match.route.render(match.params) : notFound(path);
    onChange?.(path);
  }

  return {
    start() {
      window.addEventListener('hashchange', render);
      render();
    },
    navigate(path) {
      const target = `#${path}`;
      if (location.hash === target) render();
      else location.hash = target;
    },
    refresh: render,
  };
}
