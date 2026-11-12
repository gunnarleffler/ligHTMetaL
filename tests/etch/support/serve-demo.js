import http from 'node:http';
import { open, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const TYPES = Object.freeze({
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
});
const within = (root, target) => target === root || target.startsWith(root+path.sep);

function route(raw) {
  // Inspect the request target before URL normalization can erase dot segments.
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.includes('#')) return null;
  let pathname;
  try { pathname = decodeURIComponent(raw.split('?')[0]); } catch { return null; }
  if (/[\0-\x1f\x7f\\%]/.test(pathname) || pathname.split('/').some(p => p === '.' || p === '..' || p.startsWith('.'))) return null;
  if (pathname === '/') return { redirect: '/demo/' };
  if (pathname === '/demo/') pathname = '/demo/index.html';
  const file = pathname.slice(1);
  if (file === 'etch.js') return {file:'src/etch.js', boundary:ROOT};
  if (file === 'etch.css') return {file:'src/etch.css', boundary:ROOT};
  if (file === 'README.md') return {file:'docs/Etch.md', boundary:ROOT};
  if (file.startsWith('src/') && file.endsWith('.js')) return {file:'src/etch/'+file.slice(4), boundary:path.join(ROOT,'src/etch')};
  if (file.startsWith('demo/') && Object.hasOwn(TYPES, path.extname(file))) return {file:'examples/etch/'+file.slice(5), boundary:path.join(ROOT,'examples/etch')};
  if (file === 'dist/etch.esm.js' || file === 'dist/etch.css') return {file, boundary:ROOT};
  if (file.startsWith('etch/') && file.endsWith('.js')) return {file:'src/'+file, boundary:path.join(ROOT,'src/etch')};
  return null;
}

function reply(response, status, message, head = false, extra = {}) {
  response.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': Buffer.byteLength(message), ...extra });
  response.end(head ? undefined : message);
}

/** Development-only, read-only, narrow route allowlist. Importing never listens. */
export async function startDemoServer({ host = '127.0.0.1', port = 5050 } = {}) {
  if (typeof host !== 'string' || !host.trim() || /[\s/]/.test(host)) throw new TypeError('Host must be a hostname or IP address');
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new TypeError('Port must be an integer from 0 to 65535');
  const root = await realpath(ROOT);
  const server = http.createServer(async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    const head = request.method === 'HEAD';
    if (!['GET', 'HEAD'].includes(request.method)) return reply(response, 405, 'Method not allowed\n', head, { Allow: 'GET, HEAD' });
    const target = route(request.url ?? '');
    if (!target) return reply(response, 404, 'Not found\n', head);
    if (target.redirect) return reply(response, 302, 'See /demo/\n', head, { Location: target.redirect });
    let handle;
    try {
      const filename = await realpath(path.join(ROOT, target.file));
      // Check both the repository and the route's own tree, including symlink targets.
      const boundary = path.join(root, path.relative(ROOT, target.boundary));
      if (!within(root, filename) || !within(boundary, filename)) return reply(response, 404, 'Not found\n', head);
      // A root public file must not alias a different private repository file.
      if (target.boundary === ROOT && filename !== path.join(root, target.file)) return reply(response, 404, 'Not found\n', head);
      if (filename !== path.join(root, target.file)) return reply(response, 404, 'Not found\n', head);
      handle = await open(filename, 'r');
      const stat = await handle.stat();
      if (!stat.isFile()) return reply(response, 404, 'Not found\n', head);
      response.writeHead(200, { 'Content-Type': TYPES[path.extname(filename)] ?? 'application/octet-stream', 'Content-Length': stat.size });
      if (head) { response.end(); return; }
      const stream = handle.createReadStream({ autoClose: false });
      await new Promise((resolve, reject) => {
        stream.on('error', reject);
        response.on('close', () => { stream.destroy(); resolve(); });
        response.on('finish', resolve);
        stream.pipe(response);
      });
    } catch (error) {
      if (response.headersSent) response.destroy();
      else {
        const notFound = ['ENOENT', 'ENOTDIR', 'EACCES', 'ELOOP'].includes(error.code);
        reply(response, notFound ? 404 : 500, notFound ? 'Not found\n' : 'Server error\n', head);
      }
    } finally { await handle?.close().catch(() => {}); }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolve);
  });
  const address = server.address();
  const hostname = address.family === 'IPv6' ? `[${address.address}]` : address.address;
  let closing;
  return {
    origin: `http://${hostname}:${address.port}`,
    close() {
      if (!closing) closing = new Promise((resolve, reject) => {
        server.close(error => error ? reject(error) : resolve());
        server.closeAllConnections();
      });
      return closing;
    },
  };
}

export function parseArguments(args, env = process.env) {
  let host = '127.0.0.1', port = env.ETCH_PORT ?? '5050';
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (!['--host', '--port'].includes(flag) || !args[i+1] || args[i+1].startsWith('--')) throw new Error('Usage: npm run demo -- [--host 127.0.0.1] [--port 5050]');
    const value = args[++i];
    if (flag === '--host') host = value; else port = value;
  }
  if (!/^\d+$/.test(port) || Number(port) > 65535) throw new Error('Port must be an integer from 0 to 65535 (--port or ETCH_PORT)');
  return { host, port: Number(port) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const server = await startDemoServer(parseArguments(process.argv.slice(2)));
    console.log(`Etch demo available at ${server.origin}/demo/`);
    const stop = () => { server.close().catch(error => { console.error(error.message); process.exitCode = 1; }); };
    process.once('SIGINT', stop); process.once('SIGTERM', stop);
  } catch (error) {
    console.error(error.code === 'EADDRINUSE'
      ? 'Demo port is already in use. Choose another with --port 5051 or ETCH_PORT=5051.'
      : `Cannot start Etch demo: ${error.message}`);
    process.exitCode = 1;
  }
}
