import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { symlink, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { startDemoServer, parseArguments } from '../support/serve-demo.js';

function request(origin, pathname, method = 'GET') {
  return new Promise((resolve, reject) => {
    const url = new URL(origin);
    const req = http.request({ hostname: url.hostname, port: url.port, path: pathname, method }, res => {
      let body = ''; res.setEncoding('utf8'); res.on('data', chunk => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error',reject); req.end();
  });
}
test('server redirects, serves public no-build routes, MIME, HEAD, errors and shutdown', async t => {
  const server = await startDemoServer({ port: 0 }); t.after(() => server.close());
  const root = await request(server.origin,'/');
  assert.equal(root.status,302); assert.equal(root.headers.location,'/demo/');
  for (const [pathname, mime] of [['/demo/','text/html'],['/demo/demo.js','text/javascript'],
    ['/demo/demo.css','text/css'],['/etch.js','text/javascript'],['/etch.css','text/css'],
    ['/src/index.js','text/javascript'],['/src/geometry/matrix.js','text/javascript'],['/README.md','text/markdown']]) {
    const result = await request(server.origin,pathname);
    assert.equal(result.status,200,pathname); assert.ok(result.body.length > 0,pathname);
    assert.ok(result.headers['content-type'].startsWith(mime));
    assert.equal(result.headers['cache-control'],'no-store');
    assert.equal(result.headers['x-content-type-options'],'nosniff');
    assert.equal(result.headers['access-control-allow-origin'],undefined);
    const head = await request(server.origin,pathname,'HEAD');
    assert.equal(head.status,200); assert.equal(head.body,'');
    assert.equal(head.headers['content-length'],result.headers['content-length']);
  }
  const missing = await request(server.origin,'/demo/missing.js'); assert.equal(missing.status,404);
  assert.equal((await request(server.origin,'/missing','HEAD')).body,'');
  const method = await request(server.origin,'/etch.js','POST');
  assert.equal(method.status,405); assert.equal(method.headers.allow,'GET, HEAD');
  await server.close(); await server.close();
});
test('private routes, malformed encodings, dot segments and symlink escapes are blocked', async t => {
  const server = await startDemoServer({ port: 0 }); t.after(() => server.close());
  for (const pathname of ['/package.json','/package-lock.json','/SPEC.md','/scripts/serve-demo.js',
    '/node_modules/playwright/package.json','/.git/config','/src/', '/demo/',
    '/demo/../SPEC.md','/demo/%2e%2e/SPEC.md','/demo/%252e%252e/SPEC.md',
    '/src/%2e%2e/etch.js','/demo/%00.js','/demo/%zz','/demo/%5c..%5cSPEC.md',
    '//etch.js','/demo/.hidden.js']) {
    if (pathname === '/demo/') continue;
    const result = await request(server.origin,pathname);
    assert.equal(result.status,404,pathname); assert.ok(!result.body.includes(fileURLToPath(new URL('../',import.meta.url))));
  }
  const link = new URL(`../../../examples/etch/escape-${process.pid}.js`,import.meta.url);
  await symlink(new URL('../support/serve-demo.js',import.meta.url),link);
  t.after(() => unlink(link));
  assert.equal((await request(server.origin,`/demo/escape-${process.pid}.js`)).status,404);
  const hidden = new URL(`../../../examples/etch/.hidden-${process.pid}.js`,import.meta.url);
  const alias = new URL(`../../../examples/etch/alias-${process.pid}.js`,import.meta.url);
  await writeFile(hidden,'hidden test content'); t.after(() => unlink(hidden));
  await symlink(hidden,alias); t.after(() => unlink(alias));
  assert.equal((await request(server.origin,`/demo/alias-${process.pid}.js`)).status,404);
});
test('CLI port precedence and invalid argument diagnostics', () => {
  assert.deepEqual(parseArguments([],{}),{host:'127.0.0.1',port:5050});
  assert.equal(parseArguments([],{ETCH_PORT:'5051'}).port,5051);
  assert.equal(parseArguments(['--port','0'],{ETCH_PORT:'bad'}).port,0);
  assert.equal(parseArguments(['--host','0.0.0.0'],{}).host,'0.0.0.0');
  for (const args of [['--unknown'],['--port'],['--port','-1'],['--port','1.5'],['--port','65536'],['--host','--port','4']]) {
    assert.throws(() => parseArguments(args,{}));
  }
});
test('port collision rejects without silently picking another port', async t => {
  const server = await startDemoServer({ port: 0 }); t.after(() => server.close());
  await assert.rejects(startDemoServer({ port: Number(new URL(server.origin).port) }),e => e.code === 'EADDRINUSE');
});
test('CLI startup is cwd-independent, prints actual ephemeral URL, and handles SIGTERM', { timeout: 10_000 }, async t => {
  const child = spawn(process.execPath,[fileURLToPath(new URL('../support/serve-demo.js',import.meta.url)),'--port','0'],
    { cwd: tmpdir(), stdio: ['ignore','pipe','pipe'] });
  t.after(() => { if (child.exitCode === null) child.kill('SIGKILL'); });
  let stdout = '', stderr = '';
  child.stderr.on('data',chunk => { stderr += chunk; });
  const origin = await new Promise((resolve,reject) => {
    child.once('error',reject);
    child.once('exit',code => reject(new Error(`CLI exited early: ${code} ${stderr}`)));
    child.stdout.on('data',chunk => {
      stdout += chunk;
      const match = stdout.match(/http:\/\/127\.0\.0\.1:\d+/);
      if (match) resolve(match[0]);
    });
  });
  assert.equal((await request(origin,'/demo/')).status,200);
  const exit = once(child,'exit'); child.kill('SIGTERM');
  const [code] = await exit; assert.equal(code,0); assert.equal(stderr,'');
});
