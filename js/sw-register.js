// Service worker registration + "update available" toast.

/**
 * Service workers (and the microphone) need a secure context. We register only on
 * HTTPS, localhost, *.localhost and loopback IPs — never on plain-HTTP LAN addresses.
 * @param {{ protocol: string, hostname: string }} loc
 */
export function canRegisterSW(loc) {
  if (loc.protocol === 'https:') return true;
  if (loc.protocol !== 'http:') return false;
  const host = loc.hostname.toLowerCase();
  return host === 'localhost' || host.endsWith('.localhost') || host === '127.0.0.1' || host === '[::1]';
}

/**
 * @param {{ toast: Function }} deps
 */
export async function registerServiceWorker({ toast }) {
  if (!('serviceWorker' in navigator) || !canRegisterSW(location)) return null;

  let reg;
  try {
    reg = await navigator.serviceWorker.register('./sw.js', { scope: './' });
  } catch (err) {
    console.warn('Không đăng ký được service worker:', err);
    return null;
  }

  let promptShown = false;
  const promptUpdate = (worker) => {
    // Only when an older version is in control; the very first install needs no reload.
    if (promptShown || !navigator.serviceWorker.controller) return;
    promptShown = true;
    toast('Có bản cập nhật, tải lại để dùng phiên bản mới.', {
      duration: 0,
      action: { label: 'Tải lại', onClick: () => worker.postMessage({ type: 'SKIP_WAITING' }) },
    });
  };

  if (reg.waiting) promptUpdate(reg.waiting);
  reg.addEventListener('updatefound', () => {
    const worker = reg.installing;
    worker?.addEventListener('statechange', () => {
      if (worker.state === 'installed') promptUpdate(worker);
    });
  });

  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!promptShown || reloading) return; // reload only after the user accepted an update
    reloading = true;
    location.reload();
  });

  // Look for updates when the app comes back to the foreground.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') reg.update().catch(() => {});
  });

  return reg;
}
