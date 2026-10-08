# EnJoy

Ứng dụng học từ vựng tiếng Anh mỗi ngày, chạy **hoàn toàn trên máy của bạn** và cài được như một ứng dụng riêng từ Chrome (PWA).

- Giao diện tiếng Việt, nội dung học tiếng Anh.
- Học theo lĩnh vực: **Tổng quát, IT, Kinh doanh, Y tế** (thêm lĩnh vực mới chỉ cần thêm tệp JSON).
- Theo dõi **XP**, **chuỗi ngày học** và **số từ đã thuộc**.
- Dùng được **offline** sau lần mở đầu tiên.
- HTML/CSS/JS thuần: không framework, không bước build, không backend, **không cần `npm install`**.

---

## 1. Cài đặt và chạy (Windows)

### Bước 1 — Cài Node.js LTS

Tải bản **LTS** tại <https://nodejs.org> rồi cài với các tuỳ chọn mặc định.
Hoặc dùng PowerShell:

```powershell
winget install OpenJS.NodeJS.LTS
```

Kiểm tra (mở cửa sổ PowerShell **mới**):

```powershell
node --version
```

### Bước 2 — Tải mã nguồn

```powershell
git clone https://github.com/nptkhai/EnJoy.git
cd EnJoy
```

> Chưa có Git? `winget install Git.Git`, hoặc trên GitHub bấm **Code → Download ZIP** rồi giải nén.

### Bước 3 — Chạy

```powershell
npm start
```

Rồi mở Chrome tại: **<http://enjoy.localhost:3000>**

> **Vì sao là `enjoy.localhost`?** Chrome tự hiểu mọi tên miền `*.localhost` là chính máy bạn, **không cần sửa file hosts**. Tên riêng giúp app EnJoy có dữ liệu (tiến độ, cache) tách biệt với các dự án khác cũng chạy trên `localhost:3000`.
> Dùng <http://localhost:3000> cũng được, nhưng đó là **một app khác** trong mắt trình duyệt (tiến độ không dùng chung).

Đổi cổng nếu 3000 đang bận:

```powershell
# PowerShell
$env:PORT=3001; npm start
```

```bat
:: CMD
set PORT=3001 && npm start
```

Dừng máy chủ: nhấn **Ctrl + C** trong cửa sổ terminal.

---

## 2. Cài thành ứng dụng từ Chrome

1. Mở <http://enjoy.localhost:3000> trong Chrome (máy chủ phải đang chạy).
2. Bấm menu **⋮** (góc trên bên phải) → **Truyền, lưu và chia sẻ** (*Cast, save, and share*) → **Cài đặt trang dưới dạng ứng dụng** (*Install page as app*).
   - Hoặc bấm biểu tượng **cài đặt** (màn hình có mũi tên) ở cuối thanh địa chỉ.
3. Bấm **Cài đặt**. EnJoy sẽ mở trong cửa sổ riêng và có biểu tượng ở Start menu / Desktop / Taskbar.

**Lưu ý**
- App đã cài vẫn lấy dữ liệu từ địa chỉ trên. Sau lần mở đầu tiên, mọi thứ được lưu sẵn nên **dùng được cả khi tắt máy chủ hoặc mất mạng**. Riêng nhận dạng giọng nói (khi có trò chơi luyện nói) cần Internet.
- Khi có phiên bản mới, app hiện thông báo **“Có bản cập nhật, tải lại…”** — bấm **Tải lại** để cập nhật. (Máy chủ cần đang chạy để tải bản mới.)
- Gỡ app: mở app → menu **⋮** → **Gỡ cài đặt EnJoy**.

---

## 3. Micro và HTTPS

Trình duyệt chỉ cho phép **micro** và **service worker** (chạy offline, cài app) trên **ngữ cảnh an toàn**:

| Địa chỉ | Micro / cài app / offline |
| --- | --- |
| `http://localhost:3000` | ✅ |
| `http://enjoy.localhost:3000` | ✅ |
| `https://…` (có chứng chỉ hợp lệ) | ✅ |
| `http://192.168.x.x:3000`, `http://enjoy.test:3000` | ❌ |

Vì vậy với cách chạy mặc định bạn **không cần HTTPS**.

### Tuỳ chọn: tên miền riêng + HTTPS bằng mkcert

Nếu muốn dùng tên như `https://enjoy.test`:

1. **Khai báo tên miền trong file hosts.** Mở Notepad **bằng quyền Administrator**, mở tệp `C:\Windows\System32\drivers\etc\hosts`, thêm dòng:

   ```
   127.0.0.1  enjoy.test
   ```

2. **Tạo chứng chỉ tin cậy cục bộ với [mkcert](https://github.com/FiloSottile/mkcert):**

   ```powershell
   winget install FiloSottile.mkcert
   mkcert -install
   mkdir certs
   mkcert -key-file certs/key.pem -cert-file certs/cert.pem enjoy.test localhost enjoy.localhost 127.0.0.1 ::1
   ```

3. **Chạy máy chủ HTTPS:**

   ```powershell
   npm run https
   ```

   Mở <https://enjoy.test:3443> (cổng mặc định 3443, đổi bằng biến `PORT`).
   Nếu chưa có chứng chỉ, lệnh này sẽ in hướng dẫn thay vì chạy.

> Thư mục `certs/` đã nằm trong `.gitignore` — **đừng bao giờ commit khoá riêng (key.pem)**.

---

## 4. Các lệnh

| Lệnh | Tác dụng |
| --- | --- |
| `npm start` | Chạy máy chủ tại `http://127.0.0.1:3000` |
| `npm run https` | Chạy máy chủ HTTPS (cần `certs/cert.pem` + `certs/key.pem`) |
| `npm test` | Chạy kiểm thử (`node:test`) |
| `npm run icons` | Tạo lại các icon PNG từ `icons/icon.svg` |

Máy chủ chỉ nghe trên `127.0.0.1` (không ai trong mạng LAN truy cập được).

---

## 5. Cấu trúc dự án

```
index.html               Khung trang
manifest.webmanifest     Thông tin PWA (tên, icon, màu)
sw.js                    Service worker: cache offline + cập nhật
server.js                Máy chủ tĩnh (Node thuần, không thư viện)
css/styles.css           Giao diện, theme sáng/tối
js/app.js                Điểm khởi động
js/router.js             Router theo hash: #/, #/game/<id>, #/review, #/settings
js/store.js              Lưu tiến độ (localStorage), schema có phiên bản, xuất/nhập JSON
js/audio.js              Phát âm (speechSynthesis)
js/data.js               Đọc dữ liệu trong /data
js/views/                Các màn hình: trang chủ, trò chơi/ôn tập, cài đặt
js/games/index.js        Danh sách trò chơi (registry)
js/games/flashcard.js    Trò chơi “Flashcard từ vựng”
js/lib/                  Logic thuần (có kiểm thử)
data/domains.json        Danh sách lĩnh vực
data/vocab/<id>.json     Từ vựng của từng lĩnh vực
icons/                   icon.svg (nguồn) + PNG đã tạo
scripts/make-icons.mjs   Tạo PNG từ SVG (không thư viện)
tests/                   Kiểm thử node:test
```

---

## 6. Thêm một trò chơi mới

1. Tạo tệp `js/games/<game-id>.js`:

   ```js
   export const id = 'listen-choose';            // chữ thường, số, dấu gạch ngang
   export const title = 'Nghe và chọn';
   export const description = 'Nghe từ tiếng Anh rồi chọn nghĩa đúng.';
   export const icon = '🎧';                      // tuỳ chọn

   /**
    * ctx = { domain, loadWords(), store, audio, navigate, toast, mode }
    * Trả về hàm dọn dẹp (tuỳ chọn) — được gọi khi rời màn hình.
    */
   export function start(container, ctx) {
     ctx.loadWords().then((words) => {
       container.textContent = `Có ${words.length} từ trong lĩnh vực ${ctx.domain.name}`;
     });
     return () => {};
   }
   ```

   - `ctx.store.recordAnswer(ctx.domain.id, word, true|false)` để cộng XP, cập nhật chuỗi ngày và trạng thái từ.
   - `ctx.audio.speak('hello')` để phát âm (kiểm tra `ctx.audio.isSupported`).

2. Thêm **một dòng** vào `js/games/index.js`:

   ```js
   import * as listenChoose from './listen-choose.js';
   export const games = [flashcard, listenChoose];
   ```

3. Thêm `'./js/games/listen-choose.js'` vào danh sách `APP_SHELL` trong `sw.js` và **tăng `VERSION`** (ví dụ `'v2'`) để app offline có tệp mới. `npm test` sẽ báo lỗi nếu bạn quên.

Trò chơi tự xuất hiện ở trang chủ và có địa chỉ `#/game/<game-id>`.

---

## 7. Thêm một lĩnh vực mới (không cần sửa code)

1. Tạo `data/vocab/<id>.json` (ít nhất 10 từ):

   ```json
   [
     { "word": "itinerary", "ipa": "/aɪˈtɪnərəri/", "vi": "lịch trình chuyến đi", "example": "Here is the itinerary for our trip." }
   ]
   ```

2. Thêm một mục vào `data/domains.json`:

   ```json
   { "id": "travel", "name": "Du lịch", "icon": "✈️", "description": "Sân bay, khách sạn, tham quan", "vocab": "vocab/travel.json" }
   ```

3. Tải lại trang. Lĩnh vực mới xuất hiện ngay; service worker tự lưu tệp từ vựng để dùng offline. Chạy `npm test` để kiểm tra định dạng.

---

## 8. Dữ liệu học tập

- Tiến độ lưu trong `localStorage` của trình duyệt, khoá `enjoy:state`, có trường `schemaVersion` để nâng cấp dữ liệu an toàn khi app thay đổi.
- **Cài đặt → Xuất dữ liệu** để sao lưu ra tệp `.json`; **Nhập dữ liệu** để khôi phục hoặc chuyển sang máy khác.
- **Xoá tiến độ** xoá XP, chuỗi ngày và từ đã học (giữ nguyên cài đặt giao diện).
- Không có dữ liệu nào được gửi ra ngoài máy của bạn.

---

## 9. Phát triển

- Không có bước build: sửa tệp rồi tải lại trang.
- Service worker cache mạnh tay. Khi đang sửa code, mở DevTools → **Application → Service workers** → bật **Update on reload**, hoặc tăng `VERSION` trong `sw.js`.
- Kiểm thử: `npm test` (chạy tự động trên GitHub Actions cho mọi pull request, cả Ubuntu và Windows).
- Icon: sửa `icons/icon.svg` (chỉ dùng `rect`, `circle`, `polygon` với màu hex — xem chú thích trong tệp) rồi chạy `npm run icons`.
