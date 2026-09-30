// 開発用の小さなサーバー（キャッシュしない）： node tests/devserver.cjs [port]
// このリポジトリのフォルダだけを配信します（親フォルダは見えません）。
const http = require('http');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const port = +process.argv[2] || 8766;
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webm': 'video/webm', '.mp4': 'video/mp4' };
http
  .createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p.endsWith('/')) p += 'index.html';
    const f = path.resolve(root, '.' + p);
    if (f !== root && !f.startsWith(root + path.sep)) { res.writeHead(403); return res.end('forbidden'); }
    fs.readFile(f, (err, buf) => {
      if (err) { res.writeHead(404); return res.end('not found'); }
      res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(buf);
    });
  })
  .listen(port, '127.0.0.1', () => console.log('http://127.0.0.1:' + port + '/'));
