// EnJoy — máy chủ tĩnh không phụ thuộc (chỉ dùng http/https + fs của Node).
// Chạy: npm start            → http://localhost:3000  (hoặc http://enjoy.localhost:3000)
//       npm run https        → https://localhost:3443 (cần chứng chỉ mkcert trong /certs)
//       PORT=8080 npm start  → đổi cổng

import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const HOST = '127.0.0.1';

export const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

// Files that must never be served even though they live in the project folder.
const BLOCKED = [/^\/\.git(\/|$)/, /^\/certs(\/|$)/, /^\/node_modules(\/|$)/, /^\/\.env/];

function send(res, status, headers, body) {
  res.writeHead(status, headers);
  res.end(body);
}

function cacheHeaders(urlPath) {
  // The service worker must never be cached by the HTTP cache, or updates are not detected.
  if (urlPath === '/sw.js') return { 'Cache-Control': 'no-cache, no-store, must-revalidate' };
  // Everything else is revalidated too; offline caching is the service worker's job.
  return { 'Cache-Control': 'no-cache' };
}

/** Resolve a URL path to an absolute file path inside root, or null if it escapes root. */
export function resolveSafe(root, urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  if (decoded.includes('\0')) return null;
  const filePath = path.normalize(path.join(root, decoded));
  const rel = path.relative(root, filePath);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return filePath;
}

export function createHandler(root = ROOT) {
  return (req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return send(res, 405, { Allow: 'GET, HEAD', 'Content-Type': 'text/plain; charset=utf-8' }, 'Method Not Allowed');
    }

    let urlPath;
    try {
      urlPath = new URL(req.url, 'http://localhost').pathname;
    } catch {
      return send(res, 400, { 'Content-Type': 'text/plain; charset=utf-8' }, 'Bad Request');
    }
    if (urlPath.endsWith('/')) urlPath += 'index.html';

    const filePath = resolveSafe(root, urlPath);
    if (!filePath || BLOCKED.some((re) => re.test(urlPath))) {
      return send(res, 403, { 'Content-Type': 'text/plain; charset=utf-8' }, 'Forbidden');
    }

    fs.stat(filePath, (err, stat) => {
      let target = filePath;
      let targetPath = urlPath;
      if (err || !stat.isFile()) {
        // SPA-safe fallback: routes without a file extension get the app shell;
        // a missing asset (has an extension) is a real 404.
        if (path.extname(urlPath)) {
          return send(res, 404, { 'Content-Type': 'text/plain; charset=utf-8' }, 'Not Found');
        }
        target = path.join(root, 'index.html');
        targetPath = '/index.html';
      }

      const ext = path.extname(target).toLowerCase();
      const headers = {
        'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
        'X-Content-Type-Options': 'nosniff',
        ...cacheHeaders(targetPath),
      };

      if (req.method === 'HEAD') return send(res, 200, headers);

      const stream = fs.createReadStream(target);
      stream.on('open', () => res.writeHead(200, headers));
      stream.on('error', () => {
        if (!res.headersSent) send(res, 404, { 'Content-Type': 'text/plain; charset=utf-8' }, 'Not Found');
        else res.destroy();
      });
      stream.pipe(res);
    });
  };
}

export function createServer({ root = ROOT, tls = null } = {}) {
  const handler = createHandler(root);
  return tls ? https.createServer(tls, handler) : http.createServer(handler);
}

function loadCerts() {
  const certFile = path.join(ROOT, 'certs', 'cert.pem');
  const keyFile = path.join(ROOT, 'certs', 'key.pem');
  if (!fs.existsSync(certFile) || !fs.existsSync(keyFile)) return null;
  return { cert: fs.readFileSync(certFile), key: fs.readFileSync(keyFile) };
}

function printHttpsHelp() {
  console.log(`
Không tìm thấy chứng chỉ HTTPS (certs/cert.pem và certs/key.pem).

Cách tạo bằng mkcert (chỉ cần làm một lần):
  1. Cài mkcert:   winget install FiloSottile.mkcert    (hoặc: choco install mkcert)
  2. Cài CA cục bộ: mkcert -install
  3. Tạo chứng chỉ (chạy trong thư mục dự án):
       mkdir certs
       mkcert -key-file certs/key.pem -cert-file certs/cert.pem localhost enjoy.localhost 127.0.0.1 ::1
     (thêm tên miền riêng nếu bạn khai báo trong file hosts, ví dụ: enjoy.test)
  4. Chạy lại:     npm run https

Lưu ý: không bắt buộc HTTPS — http://localhost:3000 và http://enjoy.localhost:3000
đã đủ để cài app và dùng micro.
`);
}

function main() {
  const useHttps = process.argv.includes('--https');
  const port = Number(process.env.PORT) || (useHttps ? 3443 : 3000);
  let tls = null;
  if (useHttps) {
    tls = loadCerts();
    if (!tls) {
      printHttpsHelp(); // exit normally so npm doesn't bury the instructions under an error block
      return;
    }
  }

  const server = createServer({ tls });
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`Cổng ${port} đang được dùng. Thử cổng khác, ví dụ:`);
      console.error(process.platform === 'win32'
        ? `  PowerShell: $env:PORT=3001; npm start\n  CMD:        set PORT=3001 && npm start`
        : `  PORT=3001 npm start`);
    } else {
      console.error(err);
    }
    process.exit(1);
  });
  server.listen(port, HOST, () => {
    const scheme = useHttps ? 'https' : 'http';
    console.log(`EnJoy đang chạy:`);
    console.log(`  ${scheme}://enjoy.localhost:${port}   (khuyên dùng)`);
    console.log(`  ${scheme}://localhost:${port}`);
    console.log(`Nhấn Ctrl+C để dừng.`);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main();
}
