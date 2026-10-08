// #/settings — theme, speech rate, export/import, reset.

import { h, clear, pageHead, toast } from '../ui.js';
import { toDateKey, SPEECH_RATE_MIN, SPEECH_RATE_MAX } from '../store.js';

const THEME_OPTIONS = [
  { value: 'auto', label: '🖥️ Tự động' },
  { value: 'light', label: '☀️ Sáng' },
  { value: 'dark', label: '🌙 Tối' },
];

export function renderSettings(container, app) {
  const { store, audio, applyTheme } = app;
  const settings = store.getSettings();
  clear(container);

  // --- Theme ---
  const theme = h('fieldset', { class: 'segmented' },
    h('legend', {}, 'Giao diện'),
    THEME_OPTIONS.map((opt) => h('label', {},
      h('input', {
        type: 'radio',
        name: 'theme',
        value: opt.value,
        checked: settings.theme === opt.value,
        onchange: () => {
          store.setSetting('theme', opt.value);
          applyTheme(opt.value);
          toast(`Đã đổi giao diện: ${opt.label.replace(/^\S+\s/, '')}`);
        },
      }),
      h('span', {}, opt.label))));

  // --- Speech rate ---
  const rateOut = h('output', { for: 'speech-rate' }, formatRate(settings.speechRate));
  const rate = h('input', {
    type: 'range',
    id: 'speech-rate',
    min: String(SPEECH_RATE_MIN),
    max: String(SPEECH_RATE_MAX),
    step: '0.1',
    value: String(settings.speechRate),
    'aria-describedby': 'speech-rate-hint',
    oninput: () => {
      rateOut.textContent = formatRate(Number(rate.value));
    },
    onchange: () => {
      store.setSetting('speechRate', Number(rate.value));
      toast(`Đã lưu tốc độ đọc: ${formatRate(Number(rate.value))}`);
    },
  });
  const testVoice = h('button', {
    class: 'btn btn-ghost',
    type: 'button',
    disabled: !audio.isSupported,
    onclick: () => audio.speak('Hello! Welcome to EnJoy.', { rate: Number(rate.value) }),
  }, '🔊 Nghe thử');

  // --- Export / import ---
  const fileInput = h('input', {
    type: 'file',
    accept: 'application/json,.json',
    hidden: true,
    onchange: onImportFile,
  });

  container.append(
    pageHead({ title: 'Cài đặt', back: true, hint: 'Mọi thay đổi được lưu ngay trên máy của bạn.' }),
    h('section', { class: 'card section' },
      h('div', { class: 'setting' }, theme,
        h('p', { class: 'hint' }, '“Tự động” sẽ theo chế độ sáng/tối của Windows.')),
      h('div', { class: 'setting' },
        h('label', { class: 'setting-label', for: 'speech-rate' }, 'Tốc độ đọc'),
        h('div', { class: 'range-row' }, h('span', { 'aria-hidden': 'true' }, '🐢'), rate, h('span', { 'aria-hidden': 'true' }, '🐇'), rateOut, testVoice),
        h('p', { class: 'hint', id: 'speech-rate-hint' }, audio.isSupported
          ? 'Kéo để chỉnh tốc độ phát âm tiếng Anh. 1.0× là tốc độ bình thường.'
          : 'Trình duyệt này không hỗ trợ đọc văn bản. Hãy dùng Chrome hoặc Edge trên Windows.'))),
    h('section', { class: 'card section', 'aria-labelledby': 'data-title' },
      h('h2', { id: 'data-title' }, 'Dữ liệu học tập'),
      h('p', { class: 'hint' }, 'Tiến độ chỉ lưu trong trình duyệt này. Hãy xuất ra tệp để sao lưu hoặc chuyển sang máy khác.'),
      h('div', { class: 'setting' },
        h('div', { class: 'btn-row' },
          h('button', { class: 'btn btn-primary', type: 'button', onclick: onExport }, '⬇️ Xuất dữ liệu'),
          h('button', { class: 'btn', type: 'button', onclick: () => fileInput.click() }, '⬆️ Nhập dữ liệu'),
          fileInput),
        h('p', { class: 'hint' }, 'Nhập dữ liệu sẽ thay thế toàn bộ tiến độ hiện tại.')),
      h('div', { class: 'setting' },
        h('div', { class: 'btn-row' },
          h('button', { class: 'btn btn-danger', type: 'button', onclick: onReset }, '🗑️ Xoá tiến độ')),
        h('p', { class: 'hint' }, 'Xoá XP, chuỗi ngày và các từ đã học. Cài đặt giao diện được giữ nguyên.')),
      !store.persistent && h('p', { class: 'hint', role: 'note' },
        '⚠️ Trình duyệt đang chặn lưu dữ liệu (ví dụ cửa sổ ẩn danh). Tiến độ sẽ mất khi đóng ứng dụng.')),
    h('p', { class: 'hint' }, 'EnJoy · chạy hoàn toàn trên máy của bạn, không gửi dữ liệu đi đâu.'),
  );

  function onExport() {
    const blob = new Blob([store.exportJSON()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: `enjoy-tien-do-${toDateKey(new Date())}.json` });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('Đã xuất dữ liệu. Kiểm tra thư mục Tải xuống (Downloads).');
  }

  async function onImportFile() {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file) return;
    if (!confirm('Nhập dữ liệu sẽ THAY THẾ toàn bộ tiến độ hiện tại bằng nội dung trong tệp. Tiếp tục?')) return;
    try {
      store.importJSON(await file.text());
      applyTheme(store.getSettings().theme);
      toast('Đã nhập dữ liệu thành công.');
      app.refresh(); // re-render with imported settings
    } catch (err) {
      toast(`Không nhập được: ${err.message}`, { type: 'error', duration: 6000 });
    }
  }

  function onReset() {
    if (!confirm('Xoá toàn bộ XP, chuỗi ngày và từ đã học?\nKhông thể hoàn tác — bạn nên “Xuất dữ liệu” trước.')) return;
    store.reset();
    toast('Đã xoá tiến độ học.');
  }
}

function formatRate(n) {
  return `${Number(n).toFixed(1)}×`;
}
