/* Local example server. Run npm run dev; no dependencies or build step. */
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');

const pages = new Set(['index.html', 'html.html', 'markdown.html', 'markdown-iframe.html',
  'meltdown.html', 'polish.html', 'skins.html', 'markdown-skins.html']);
const types = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.md': 'text/plain; charset=utf-8',
  '.ans': 'text/plain; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml'
};

function createDevServer({ root = path.resolve(__dirname, '..'), log = console.log } = {}) {
  return http.createServer(async (req, res) => {
    const started = performance.now();
    res.once('finish', () => {
      const pathname = JSON.stringify(req.url.split('?')[0]);
      log(`${new Date().toISOString()} ${req.method} ${pathname} ${res.statusCode} ${(performance.now() - started).toFixed(1)} ms`);
    });
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (!['GET', 'HEAD'].includes(req.method)) {
      res.setHeader('Allow', 'GET, HEAD'); res.writeHead(405).end(); return;
    }
    let pathname;
    try { pathname = decodeURIComponent(req.url.split('?')[0]); }
    catch { res.writeHead(400).end(); return; }
    if (!pathname.startsWith('/') || /[\\\u0000-\u001f\u007f]/.test(pathname) ||
      pathname.split('/').some(part => part.startsWith('.'))) {
      res.writeHead(404).end(); return;
    }
    let directory, relative;
    if (pathname === '/' || pages.has(pathname.slice(1))) {
      directory = 'examples'; relative = pathname === '/' ? 'index.html' : pathname.slice(1);
    } else if (pathname.startsWith('/examples/')) {
      directory = 'examples'; relative = pathname.slice('/examples/'.length) || 'index.html';
    } else if (pathname.startsWith('/etch/')) {
      directory = 'examples'; relative = pathname.slice(1);
    } else if (pathname.startsWith('/dist/')) {
      directory = 'dist'; relative = pathname.slice('/dist/'.length);
    } else if (['/README.md', '/ligHTMetaL.png'].includes(pathname)) {
      directory = ''; relative = pathname.slice(1);
    } else if (pathname === '/img/tiny.png') {
      directory = 'examples'; relative = 'images/tiny.png';
    } else {
      // Preserve the Flask server's root-level dist aliases.
      directory = 'dist'; relative = pathname.slice(1);
    }
    try {
      const base = await fs.realpath(path.join(root, directory));
      const file = await fs.realpath(path.resolve(base, relative));
      if (!file.startsWith(base + path.sep) || !(await fs.stat(file)).isFile()) {
        res.writeHead(404).end(); return;
      }
      const body = await fs.readFile(file);
      res.writeHead(200, { 'Content-Type': types[path.extname(file).toLowerCase()] || 'application/octet-stream',
        'Content-Length': body.length });
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch (error) {
      res.writeHead(['ENOENT', 'ENOTDIR', 'EACCES'].includes(error.code) ? 404 : 500).end();
    }
  });
}

if (require.main === module) {
  const port = Number(process.env.LM_TEST_PORT ?? process.env.PORT ?? 5000);
  const host = process.env.HOST || '0.0.0.0';
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    console.error('PORT must be an integer between 0 and 65535.'); process.exitCode = 1;
  } else {
    const server = createDevServer();
    server.on('error', error => { console.error('Dev server: ' + error.message); process.exitCode = 1; });
    server.listen(port, host, () => {
      const address = server.address();
      console.log(`Examples: http://${host.includes(':') ? '[' + host + ']' : host}:${address.port}/`);
    });
  }
}

module.exports = { createDevServer };
