const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { spawn, spawnSync } = require('node:child_process');
const { once } = require('node:events');
const { createDevServer } = require('../examples/server');

function request(port, pathname, method = 'GET') {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port, path: pathname, method }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject); req.end();
  });
}

test('demo routes, MIME types, HEAD, live reads, method and path boundaries', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'lightmetal-server-'));
  const logs = [];
  const server = createDevServer({ root, log: line => logs.push(line) });
  try {
    const fixtures = {
      'examples/index.html': '<h1>Examples</h1>', 'examples/html.html': '<h1>HTML</h1>',
      'examples/markdown.html': '<h1>Markdown</h1>', 'examples/markdown-iframe.html': '<h1>Frame</h1>',
      'examples/meltdown.html': '<h1>Parser</h1>', 'examples/polish.html': '<h1>Highlighter</h1>',
      'examples/skins.html': '<h1>Skins</h1>', 'examples/markdown-skins.html': '<h1>Markdown skins</h1>',
      'examples/code-blocks.js': 'const value = 1;', 'examples/POLISH.ANS': '\x1b[31mArt',
      'examples/images/tiny.png': Buffer.from([137, 80, 78, 71]),
      'dist/maiden.esm.js': 'export const init = () => {};', 'dist/lightmetal.css': '.lightmetal {}',
      'dist/skins/frost.css': '.lightmetal-frost {}', 'README.md': '# ligHTMetaL',
      'ligHTMetaL.png': Buffer.from([137, 80, 78, 71]), '.env': 'secret',
      'secret.txt': 'private', 'examples/.hidden': 'private'
    };
    for (const [file, content] of Object.entries(fixtures)) {
      const target = path.join(root, file);
      await fs.mkdir(path.dirname(target), { recursive: true }); await fs.writeFile(target, content);
    }
    await fs.symlink(path.join(root, 'secret.txt'), path.join(root, 'examples', 'escape.txt'));
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    for (const [route, file] of [
      ['/', 'examples/index.html'], ['/index.html', 'examples/index.html'],
      ...['html', 'markdown', 'markdown-iframe', 'meltdown', 'polish', 'skins', 'markdown-skins'].map(name => ['/' + name + '.html', 'examples/' + name + '.html']),
      ['/examples/', 'examples/index.html'], ['/examples/html.html', 'examples/html.html'],
      ['/examples/code-blocks.js', 'examples/code-blocks.js'], ['/examples/POLISH.ANS', 'examples/POLISH.ANS'],
      ['/dist/maiden.esm.js', 'dist/maiden.esm.js'], ['/maiden.esm.js', 'dist/maiden.esm.js'],
      ['/dist/lightmetal.css', 'dist/lightmetal.css'], ['/skins/frost.css', 'dist/skins/frost.css'],
      ['/README.md', 'README.md'], ['/ligHTMetaL.png', 'ligHTMetaL.png'],
      ['/img/tiny.png', 'examples/images/tiny.png'], ['/examples/images/tiny.png', 'examples/images/tiny.png']
    ]) {
      const result = await request(port, route + '?cache=1');
      assert.equal(result.status, 200, route);
      assert.deepEqual(result.body, Buffer.from(fixtures[file]), route);
      assert.equal(result.headers['cache-control'], 'no-store');
      assert.equal(result.headers['x-content-type-options'], 'nosniff');
      const mime = file.endsWith('.html') ? 'text/html' : file.endsWith('.js') ? 'text/javascript' :
        file.endsWith('.css') ? 'text/css' : file.endsWith('.png') ? 'image/png' : 'text/plain';
      assert.ok(result.headers['content-type'].startsWith(mime), route);
    }
    const head = await request(port, '/README.md', 'HEAD');
    assert.equal(head.status, 200); assert.equal(head.body.length, 0);
    assert.equal(Number(head.headers['content-length']), Buffer.byteLength(fixtures['README.md']));
    await fs.writeFile(path.join(root, 'README.md'), '# Updated');
    assert.equal((await request(port, '/README.md')).body.toString(), '# Updated');
    assert.equal((await request(port, '/html.html', 'POST')).status, 405);
    for (const route of ['/missing', '/.env', '/secret.txt', '/package.json', '/tests/smoke.js',
      '/examples/.hidden', '/examples/../secret.txt', '/examples/%2e%2e/secret.txt',
      '/examples/%2e%2e%2fsecret.txt', '/dist/%2e%2e/README.md', '/examples/%5c..%5csecret.txt',
      '/examples/escape.txt', '/dist/', '/examples/images/', '/examples/%00index.html']) {
      assert.equal((await request(port, route)).status, 404, route);
    }
    assert.equal((await request(port, '/examples/%ZZ')).status, 400);
    for (const pattern of [/GET "\/" 200/, /HEAD "\/README.md" 200/,
      /POST "\/html.html" 405/, /GET "\/missing" 404/, /GET "\/examples\/%ZZ" 400/]) {
      assert.ok(logs.some(line => pattern.test(line)), String(pattern));
    }
    assert.ok(logs.every(line => /^\d{4}-\d{2}-\d{2}T\S+ (GET|HEAD|POST) "[^\n]*" \d{3} \d+\.\d ms$/.test(line)));
    assert.ok(logs.every(line => !line.includes('cache=1')), 'query strings stay out of access logs');
  } finally {
    if (server.listening) await new Promise(resolve => server.close(resolve));
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('CLI starts without Python/uv, honors test port, and reports invalid ports', async () => {
  const script = path.resolve(__dirname, '../examples/server.js');
  const env = { ...process.env, PATH: '', LM_TEST_PORT: '0', PORT: 'invalid' };
  delete env.HOST;
  const child = spawn(process.execPath, [script], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  const exited = once(child, 'exit');
  try {
    const address = await new Promise((resolve, reject) => {
      let output = '';
      child.stdout.on('data', chunk => {
        output += chunk;
        const match = /Examples: http:\/\/0\.0\.0\.0:(\d+)\//.exec(output);
        if (match) resolve(Number(match[1]));
      });
      child.on('error', reject);
      child.on('exit', code => reject(new Error('server exited before readiness: ' + code)));
    });
    assert.equal((await request(address, '/')).status, 200);
    const occupied = spawnSync(process.execPath, [script], {
      env: { ...env, LM_TEST_PORT: String(address) }, encoding: 'utf8'
    });
    assert.equal(occupied.status, 1); assert.match(occupied.stderr, /EADDRINUSE/);
    assert.equal((await request(address, '/')).status, 200, 'port conflict leaves the existing server alone');
  } finally { child.kill(); await exited; }
  delete env.LM_TEST_PORT;
  const invalid = spawnSync(process.execPath, [script], { env, encoding: 'utf8' });
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /PORT must be an integer/);
});
