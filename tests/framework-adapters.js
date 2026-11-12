/* Install exact local archives without scripts; exercise real framework consumers. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const esbuild = require('esbuild');
const { chromium, firefox } = require('playwright');
const { withPage, setMarkdownView } = require('./browser-checks');

const ROOT = path.resolve(__dirname, '..');
function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8' });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout;
}
function pack(directory, destination) {
  const json = JSON.parse(run('npm', ['pack', directory, '--ignore-scripts', '--json', '--pack-destination', destination], ROOT));
  const [result] = Array.isArray(json) ? json : Object.values(json);
  return { ...result, archive: path.join(destination, result.filename) };
}

async function browserChecks(browser, origin, framework, settings) {
  const page = await browser.newPage({ viewport: { width: 1100, height: 1000 } });
  const errors = [], remote = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('request', request => { if (new URL(request.url()).origin !== origin) remote.push(request.url()); });
  try {
    await page.goto(origin + '/?ssr=' + (settings.hydrate ? framework : ''));
    await page.waitForFunction(() => window.mountAdapters);
    await page.evaluate(([framework, settings]) => mountAdapters(framework, settings), [framework, settings]);
    await page.waitForFunction(() => adapterState.api('html') && adapterState.api('markdown'));
    await page.evaluate(() => adapterState.capture());
    assert.deepEqual(await page.evaluate(() => adapterState.events), [], 'mount and initialization stay silent');
    assert.equal(await page.evaluate(() => adapterState.api('html').getHTML()), '<p>HTML </p>');
    assert.equal(await page.evaluate(() => adapterState.api('markdown').getMarkdown()), 'Markdown ');
    assert.equal(await page.evaluate(() => adapterState.stats().proxy), false, 'Vue does not deeply proxy native instances');

    for (const kind of ['html', 'markdown']) {
      const value = () => page.evaluate(kind => {
        const editor = adapterState.api(kind); return kind === 'html' ? editor.getHTML() : editor.getMarkdown();
      }, kind);
      const before = await value();
      const source = page.locator('#' + kind + '-wrapper ' + (kind === 'html' ? '.lightmetal-content' : '.lightmarkdown-input'));
      await source.focus(); await page.keyboard.press('Control+End');
      await page.keyboard.type('native history');
      const typed = await value(); assert.notEqual(typed, before);
      const snapshot = await page.evaluate(kind => {
        const editor = adapterState.api(kind);
        window.savedEditor = editor; window.savedContent = editor.content; window.savedChild = editor.content.firstChild;
        return { count: adapterState.stats().count, events: adapterState.events.length };
      }, kind);
      await page.evaluate(() => adapterState.update());
      await page.waitForFunction(() => document.getElementById('html-wrapper').dataset.version === String(adapterState.version));
      assert.equal(await value(), typed, 'changed initialValue is ignored after mount');
      assert.deepEqual(await page.evaluate(kind => {
        const editor = adapterState.api(kind);
        return { editor: editor === savedEditor, content: editor.content === savedContent, child: editor.content.firstChild === savedChild,
          count: adapterState.stats().count, events: adapterState.events.length,
          hostClass: editor.element.classList.contains(kind === 'html' ? 'lightmetal-html' : 'lightmarkdown'),
          skin: editor.element.classList.contains('lightmetal-frost'), ignoredSkin: editor.element.classList.contains('lightmetal-substantial') };
      }, kind), { editor: true, content: true, child: true, count: snapshot.count, events: snapshot.events, hostClass: true, skin: true, ignoredSkin: false });
      assert.equal(await page.locator('#' + kind + '-wrapper').getAttribute('class'), 'outer updated');
      assert.equal(await page.locator('#' + kind + '-wrapper').getAttribute('data-lightmetal-theme'), 'dark');
      await page.keyboard.press('Control+z'); assert.equal(await value(), before, kind + ' grouped native Undo survives parent updates');
      await page.keyboard.press('Control+Shift+z'); assert.equal(await value(), typed);
      assert.equal(await page.evaluate(() => adapterState.events.at(-1).version), await page.evaluate(() => adapterState.version), 'new committed change handler receives edits');
    }

    const htmlWrapper = page.locator('#html-wrapper');
    await htmlWrapper.getByRole('button', { name: 'Fullscreen', exact: true }).click();
    await page.evaluate(() => adapterState.update());
    await page.waitForFunction(() => document.getElementById('html-wrapper').dataset.version === String(adapterState.version));
    assert.equal(await page.evaluate(() => adapterState.api('html').element.classList.contains('lightmetal-fullscreen')), true, 'outer class updates do not strip editor state');
    await page.keyboard.press('Escape');
    await htmlWrapper.getByRole('button', { name: 'Source', exact: true }).click();
    const sourceHTML = await page.evaluate(() => adapterState.api('html').getHTML());
    await page.locator('#html-wrapper textarea').focus(); await page.keyboard.press('Control+End'); await page.keyboard.type(' source edit');
    const editedSource = await page.evaluate(() => adapterState.api('html').getHTML());
    await page.evaluate(() => adapterState.update());
    await page.waitForFunction(() => document.getElementById('html-wrapper').dataset.version === String(adapterState.version));
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.equal(await page.evaluate(() => adapterState.api('html').getHTML()), editedSource);
    await page.keyboard.press('Control+z');
    assert.equal(await page.evaluate(() => adapterState.api('html').getHTML()), sourceHTML, 'native textarea Undo survives painted parent updates');
    await htmlWrapper.getByRole('button', { name: 'Source', exact: true }).click();

    const markdown = '- [ ] Wrapped task\n\n```js\nconst n = 1;\n```';
    const events = await page.evaluate(markdown => { const before = adapterState.events.length; adapterState.api('markdown').setMarkdown(markdown); return adapterState.events.length - before; }, markdown);
    assert.equal(events, 1, 'native setters still notify once');
    await page.locator('#markdown-wrapper .lightmarkdown-paint .keyword').first().waitFor();
    const point = await page.locator('#markdown-wrapper .lightmarkdown-input').evaluate(content => {
      content.firstChild.scrollIntoView({ block: 'nearest' });
      const range = document.createRange(); range.setStart(content.firstChild.firstChild, 3); range.setEnd(content.firstChild.firstChild, 4);
      const rect = range.getBoundingClientRect(); return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    });
    await page.mouse.click(point.x, point.y);
    assert.equal(await page.evaluate(() => adapterState.api('markdown').getMarkdown()), markdown.replace('[ ]', '[x]'));
    await page.keyboard.press('Control+z');
    assert.equal(await page.evaluate(() => adapterState.api('markdown').getMarkdown()), markdown);
    await setMarkdownView(page.locator('#markdown-wrapper'), 'split');
    await page.locator('#markdown-wrapper .lightmarkdown-preview .keyword').first().waitFor();

    await page.evaluate(() => {
      adapterState.deferPreview = true;
      adapterState.api('markdown').setMarkdown('Late preview');
    });
    await page.waitForFunction(() => adapterState.pending.length > 0);
    const finalCount = await page.evaluate(() => { const count = adapterState.events.length; adapterState.unmount(); return count; });
    await page.waitForFunction(() => document.getElementById('app').childNodes.length === 0);
    assert.equal(await page.evaluate(() => adapterState.api('html') === null && adapterState.api('markdown') === null), true, 'refs clear on unmount');
    const stats = await page.evaluate(() => adapterState.stats());
    assert.ok(stats.destroys.every(count => count === 1), JSON.stringify(stats));
    assert.ok(stats.detached.every(Boolean) && stats.empty.every(Boolean));
    if (framework === 'react' && settings.cleanupRefs) assert.ok(await page.evaluate(() => adapterState.cleanupRefs >= 2));
    await page.evaluate(() => adapterState.pending.forEach(resolve => resolve('<p>Too late</p>')));
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.equal(await page.evaluate(() => adapterState.events.length), finalCount, 'late preview work stays silent after cleanup');
    assert.ok((await page.evaluate(() => adapterState.stats())).empty.every(Boolean));
    await page.evaluate(framework => mountAdapters(framework, { objectRefs: true }), framework);
    await page.waitForFunction(() => adapterState.api('html') && adapterState.api('markdown'));
    assert.equal(await page.locator('.lightmetal-html').count(), 1);
    assert.equal(await page.locator('.lightmarkdown-input').count(), 1);
    assert.deepEqual(await page.evaluate(() => adapterState.events), []);
    await page.evaluate(() => adapterState.unmount());
    assert.deepEqual(errors, []);
    assert.deepEqual(remote, []);
  } finally { await page.close(); }
}

async function demoChecks(browser, location, framework) {
  await withPage(browser, framework + ' demo', async page => {
    const consoleErrors = [];
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    await page.goto(location);
    await page.locator('#markdown-wrapper .lightmarkdown-input').waitFor();
    assert.match(await page.locator('#build-status').textContent(), /Running a local/);
    const split = page.locator('#markdown-wrapper').getByRole('button', { name: 'Side-by-side', exact: true });
    await page.locator('#markdown-wrapper .lightmarkdown-preview .keyword').first().waitFor();
    assert.equal(await split.getAttribute('aria-pressed'), 'true');
    assert.equal(await page.evaluate(() => document.activeElement === document.body && scrollY === 0), true);
    for (const kind of ['html', 'markdown']) {
      const source = page.locator('#' + kind + '-wrapper ' + (kind === 'html' ? '.lightmetal-content' : '.lightmarkdown-input'));
      const before = await source.innerHTML();
      await source.focus(); await page.keyboard.press('Control+End'); await page.keyboard.type(' framework edits');
      const typed = await source.innerHTML(); assert.notEqual(typed, before);
      await page.waitForFunction(kind => document.querySelector('pre[aria-label="' + kind + ' output"]').textContent.includes('framework edits'), kind);
      await page.keyboard.press('Control+z');
      assert.equal(await source.innerHTML(), before, framework + ' live output preserves grouped typing Undo');
      await page.keyboard.press('Control+Shift+z');
      assert.equal(await source.innerHTML(), typed);
      await page.getByRole('button', { name: 'Rerender parent', exact: true }).click();
      assert.equal(await source.innerHTML(), typed);
    }
    await page.getByLabel('Color mode', { exact: true }).selectOption('dark');
    await page.getByRole('button', { name: 'Read instances', exact: true }).click();
    assert.equal(await split.getAttribute('aria-pressed'), 'true', 'parent updates retain split view');
    await page.locator('#markdown-wrapper .lightmarkdown-preview .keyword').first().waitFor();
    assert.deepEqual(consoleErrors, []);
  }, { viewport: { width: 1100, height: 1000 } });
}

async function main() {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'lightmetal-frameworks-'));
  let server;
  try {
    const packed = pack(process.argv[2] ? path.resolve(process.argv[2]) : ROOT, temp);
    const installFlags = ['--ignore-scripts', '--offline', '--no-audit', '--no-fund', '--package-lock=false'];
    fs.writeFileSync(path.join(temp, 'package.json'), JSON.stringify({ name: 'adapter-consumer', private: true }));
    const react = process.env.LM_REACT_VERSION || require('react/package.json').version;
    const vue = process.env.LM_VUE_VERSION || require('vue/package.json').version;
    run('npm', ['install', packed.archive, ...installFlags], temp);
    const installed = path.join(temp, 'node_modules');
    const core = JSON.parse(fs.readFileSync(path.join(installed, 'lightmetal/package.json')));
    assert.deepEqual(core.dependencies || {}, {});
    assert.deepEqual(core.peerDependencies, { react: '^18.3.1 || ^19.0.0', vue: '^3.5.0' });
    assert.deepEqual(core.peerDependenciesMeta, { react: { optional: true }, vue: { optional: true } });
    for (const framework of ['react', 'react-dom', 'vue']) assert.equal(fs.existsSync(path.join(installed, framework)), false);
    for (const framework of ['react', 'vue']) {
      const folder = path.join(installed, 'lightmetal/adapters', framework);
      assert.deepEqual(packed.files.filter(file => file.path.startsWith('adapters/' + framework + '/')).map(file => path.basename(file.path)).sort(), ['LICENSE', 'README.md', 'index.js', 'package.json']);
      assert.deepEqual(JSON.parse(fs.readFileSync(path.join(folder, 'package.json'))), { type: 'module' });
      assert.deepEqual(fs.readFileSync(path.join(folder, 'index.js')), fs.readFileSync(path.join(ROOT, 'adapters', framework, 'index.js')));
      // Each adapter works without the other framework being installed or bundled.
      const consumer = path.join(temp, framework + '-only'); fs.mkdirSync(consumer);
      fs.writeFileSync(path.join(consumer, 'package.json'), JSON.stringify({ name: framework + '-consumer', private: true }));
      run('npm', ['install', packed.archive, framework + '@' + (framework === 'react' ? react : vue), ...installFlags], consumer);
      const other = framework === 'react' ? 'vue' : 'react';
      assert.equal(fs.existsSync(path.join(consumer, 'node_modules', other)), false);
      const output = path.join(consumer, 'probe.cjs');
      const result = await esbuild.build({ stdin: { resolveDir: consumer, contents: `
        import { LightmetalEditor, MaidenEditor } from 'lightmetal/adapters/${framework}/index.js';
        console.log(JSON.stringify([LightmetalEditor, MaidenEditor].map(editor => editor.displayName || editor.name)));
      ` }, outfile: output, bundle: true, platform: 'node', format: 'cjs', metafile: true, logLevel: 'silent' });
      assert.ok(Object.keys(result.metafile.inputs).every(input => !input.includes('node_modules/' + other + '/')));
      assert.deepEqual(JSON.parse(run(process.execPath, [output], consumer)), ['LightmetalEditor', 'MaidenEditor']);
    }
    run('npm', ['install', 'react@' + react, 'react-dom@' + react, 'vue@' + vue, ...installFlags], temp);
    fs.copyFileSync(path.join(ROOT, 'tests/fixtures/framework-adapters.js'), path.join(temp, 'entry.js'));
    await esbuild.build({ entryPoints: [path.join(temp, 'entry.js')], bundle: true, platform: 'browser',
      define: { 'process.env.NODE_ENV': '"development"' }, outfile: path.join(temp, 'consumer.js'), logLevel: 'silent' });
    fs.writeFileSync(path.join(temp, 'ssr.js'), `
      import assert from 'node:assert/strict';
      import React from 'react';
      import { renderToString as renderReact } from 'react-dom/server';
      import { createSSRApp, h } from 'vue';
      import { renderToString as renderVue } from 'vue/server-renderer';
      import { MaidenEditor as R } from 'lightmetal/adapters/react/index.js';
      import { MaidenEditor as V } from 'lightmetal/adapters/vue/index.js';
      import { stateFor, reactTree, vueApp } from './entry.js';
      async function main() {
        assert.equal(typeof document, 'undefined');
        const react = renderReact(reactTree(stateFor('react')));
        const vue = await renderVue(vueApp(stateFor('vue')));
        for (const output of [react, vue]) {
          assert.ok(output.includes('<div></div>'));
          assert.ok(!output.includes('HTML ') && !output.includes('Markdown '));
        }
        for (const props of [{ value: 'controlled' }, { options: { element: {} } }, { children: 'unsupported' }]) {
          assert.throws(() => renderReact(React.createElement(R, props)), TypeError);
        }
        for (const props of [{ modelValue: 'controlled' }, { options: { onChange() {} } }, { innerHTML: '<p>unsupported</p>' }]) {
          await assert.rejects(() => renderVue(createSSRApp({ render: () => h(V, props) })), TypeError);
        }
        process.stdout.write(JSON.stringify({ react, vue }));
      }
      main().catch(error => { console.error(error); process.exitCode = 1; });
    `);
    await esbuild.build({ entryPoints: [path.join(temp, 'ssr.js')], bundle: true, platform: 'node', format: 'cjs',
      outfile: path.join(temp, 'ssr.cjs'), logLevel: 'silent' });
    const ssr = JSON.parse(run(process.execPath, [path.join(temp, 'ssr.cjs')], temp));
    const demoSite = path.join(temp, 'demo-site');
    const demoBuild = path.join(demoSite, 'examples/frameworks/build');
    const { buildFrameworkExamples } = await import(pathToFileURL(path.join(ROOT, 'build/framework-examples.mjs')).href);
    await buildFrameworkExamples(demoBuild);
    for (const name of ['examples/frameworks/react.html', 'examples/frameworks/vue.html', 'examples/showcase.css',
      'examples/code-blocks.js', 'examples/markdown-samples.js', 'dist/polish.js']) {
      const target = path.join(demoSite, name);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(path.join(ROOT, name), target);
    }
    const assets = new Map([
      ...['react.js', 'react.css', 'vue.js', 'vue.css'].map(name => ['/demos/build/' + name, path.join(demoBuild, name)]),
      ...['consumer.js', 'consumer.css'].map(name => ['/' + name, path.join(temp, name)]),
      ...['showcase.css', 'code-blocks.js', 'markdown-samples.js'].map(name => ['/' + name, path.join(ROOT, 'examples', name)]),
      ['/dist/polish.js', path.join(ROOT, 'dist/polish.js')]
    ]);
    server = http.createServer((request, response) => {
      const url = new URL(request.url, 'http://localhost');
      if (url.pathname === '/') {
        response.setHeader('Content-Type', 'text/html');
        response.end('<!doctype html><link rel="stylesheet" href="/consumer.css"><div id="app">' + (ssr[url.searchParams.get('ssr')] || '') + '</div><script src="/consumer.js"></script>');
      } else if (assets.has(url.pathname)) {
        response.setHeader('Content-Type', url.pathname.endsWith('.css') ? 'text/css' : 'text/javascript');
        response.end(fs.readFileSync(assets.get(url.pathname)));
      } else if (['/demos/react.html', '/demos/vue.html'].includes(url.pathname)) {
        response.setHeader('Content-Type', 'text/html');
        response.end(fs.readFileSync(path.join(ROOT, 'examples/frameworks', path.basename(url.pathname))));
      } else if (url.pathname === '/favicon.ico') response.writeHead(204).end();
      else response.writeHead(404).end();
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = 'http://127.0.0.1:' + server.address().port;
    for (const [name, engine] of Object.entries({ chromium, firefox })) {
      const browser = await engine.launch();
      try {
        for (const settings of [{ strict: true, cleanupRefs: true }, { objectRefs: true }, { hydrate: true, strict: true }]) {
          await browserChecks(browser, origin, 'react', settings);
        }
        for (const settings of [{}, { hydrate: true }]) await browserChecks(browser, origin, 'vue', settings);
        for (const framework of ['react', 'vue']) {
          await demoChecks(browser, origin + '/demos/' + framework + '.html', framework);
          await demoChecks(browser, pathToFileURL(path.join(demoSite, 'examples/frameworks', framework + '.html')).href, framework);
        }
        console.log(name + ': React ' + react + '/Vue ' + vue + ' text adapters: refs, Strict Mode, rerenders, native Undo/Source, task clicks, highlighting, SSR hydration and cleanup: ok');
      } finally { await browser.close(); }
    }
    console.log('framework adapters: one core archive, bare/React-only/Vue-only installs, optional peers, script-free offline install and DOM-free SSR: ok');
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    fs.rmSync(temp, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
