import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { allThemes } from '../src/polish/themes/index.js';
const { chromium, firefox, webkit } = createRequire(import.meta.url)('playwright');

let server;
let origin;
before(async () => {
  server = createServer(async (request, response) => {
    const path = new URL(request.url, 'http://localhost').pathname;
    if (path === '/demo/index.html') {
      response.setHeader('Content-Type', 'text/html');
      response.end('<!doctype html><link rel="stylesheet" href="/polish.css">' + allThemes.map(theme =>
        `<pre class="code theme-${theme.name}"><span class="token comment">// Theme sample</span></pre>`).join(''));
      return;
    }
    let filename;
    if (path === '/polish.js') filename = '../src/polish.js';
    else if (path === '/languages.js') filename = '../src/polish-languages.js';
    else if (path === '/polish.css') filename = '../src/polish.css';
    else if (/^\/(?:src|polish)\/[a-zA-Z0-9_/-]+\.js$/.test(path)) filename = '../src/polish/' + path.split('/').slice(2).join('/');
    else if (/^\/test\/fixtures\/(?:language|config)-examples\.js$/.test(path)) filename = './polish/fixtures/' + path.split('/').pop();
    if (!filename || path.includes('..')) { response.writeHead(404).end(); return; }
    try {
      const contents = await readFile(new URL(filename, import.meta.url));
      response.setHeader('Content-Type', path.endsWith('.js') ? 'text/javascript' : 'text/css');
      response.end(contents);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { if (server) await new Promise(resolve => server.close(resolve)); });

const engines = { chromium, firefox, webkit };
for (const name of (process.env.BROWSERS ?? 'chromium,firefox').split(',')) {
  test(`${name}: native modules, capture indices, safe rendering, and CSS theme switching`, async () => {
    assert.ok(engines[name], `Unknown browser: ${name}`);
    const browser = await engines[name].launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.goto(`${origin}/demo/index.html`);
      assert.equal(await page.locator('pre.code').count(), 11);
      const result = await page.evaluate(async () => {
        const { createHighlighter, renderHTML } = await import('/polish.js');
        const { allLanguages } = await import('/languages.js');
        const { default: examples } = await import('/test/fixtures/language-examples.js');
        const catalog = createHighlighter({ languages: allLanguages });
        const catalogFailures = [];
        for (const example of examples) {
          const result = catalog.tokenize(example.source, { language: example.id, strict: true });
          for (const [needle, kind] of example.expected) {
            const start = example.source.indexOf(needle);
            if (result.tokens.find(t => t.start <= start && t.end > start)?.kind !== kind) catalogFailures.push(`${example.id}: ${needle}`);
          }
          const element = document.createElement('div');
          element.innerHTML = catalog.highlight(example.source, example.id);
          if (element.textContent !== example.source) catalogFailures.push(`${example.id}: source changed`);
        }
        const { default: html } = await import('/src/languages/html.js');
        const { default: js } = await import('/src/languages/javascript.js');
        const { default: ts } = await import('/src/languages/typescript.js');
        const { default: bash } = await import('/src/languages/bash.js');
        const { light, dark, allThemes, themeToCSS } = await import('/src/themes/index.js');
        const themeFailures = [];
        const rgb = hex => 'rgb(' + hex.slice(1).match(/../g).map(value => parseInt(value, 16)).join(', ') + ')';
        for (const theme of allThemes) {
          const sample = document.querySelector(`pre.code.theme-${theme.name}`);
          if (!sample || getComputedStyle(sample).backgroundColor !== rgb(theme.background)) themeFailures.push(theme.name + '/background');
          if (!sample || getComputedStyle(sample.querySelector('.token.comment')).color !== rgb(theme.tokens.comment.foreground)) themeFailures.push(theme.name + '/comment');
          const preview = document.createElement('div');
          preview.className = `polish theme-${theme.name}`;
          preview.innerHTML = '<pre><span class="token keyword">const</span></pre>';
          document.body.append(preview);
          if (getComputedStyle(preview.querySelector('span')).color !== rgb(theme.tokens.keyword.foreground)) themeFailures.push(theme.name + '/preview');
          preview.remove();
        }
        const boundary = createHighlighter({ languages: [{ id: 'boundary', rules: [
          { id: 'half', pattern: /\ud83d/, kind: 'keyword' },
          { id: 'unicode', pattern: /./u, kind: 'string' },
        ] }] });
        const boundaryResult = boundary.tokenize('😀x', { language: 'boundary', strict: true });
        renderHTML('😀x', boundaryResult.tokens); // Also validates the partition in each engine.
        const htmlBoundaryFailures = [];
        for (const sample of ['😀', 'a😀b', '😀😎', '<😀&"\'\n>']) {
          const sampleTokens = Array.from({ length: sample.length }, (_, start) => ({
            start, end: start + 1, kind: ['keyword', 'plain', 'string'][start % 3], language: 'boundary',
          }));
          const markup = renderHTML(sample, sampleTokens);
          const decoded = new TextDecoder().decode(new TextEncoder().encode(markup));
          const element = document.createElement('div');
          element.innerHTML = decoded;
          if (element.textContent !== sample) htmlBoundaryFailures.push('UTF-8 text: ' + sample);
          const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
          for (let node; (node = walker.nextNode());) {
            for (const character of node.data) {
              const code = character.charCodeAt(0);
              if (character.length === 1 && code >= 0xd800 && code <= 0xdfff) htmlBoundaryFailures.push('split pair: ' + sample);
            }
          }
        }
        boundary.register({ id: 'bounded-captures', rules: [
          { id: 'nested', pattern: /(?=(ab>))(?=(ab>c))ab>c/, kind: 'number', captures: { 1: 'keyword', 2: 'string' } },
          { id: 'crossing', pattern: /(?=(abc>))ab(c>de)/, kind: 'number', captures: { 1: 'keyword', 2: 'string' } },
        ] });
        boundary.register({ id: 'capture-host', rules: [
          { id: 'embed', begin: /</, end: />/, kind: 'tag', embed: 'bounded-captures' },
        ] });
        const nestedCaptures = boundary.tokenize('<ab>c', { language: 'capture-host', strict: true });
        const crossingCaptures = boundary.tokenize('<abc>de', { language: 'capture-host' });
        renderHTML('<ab>c', nestedCaptures.tokens);
        renderHTML('<abc>de', crossingCaptures.tokens);
        const highlighter = createHighlighter();
        highlighter.register(html);
        highlighter.register(js);
        highlighter.register(ts);
        highlighter.register(bash);
        const familyResults = [];
        for (const [language, sample] of [
          ['c', '#include <stdio.h>'], ['cpp', 'R"tag(// raw)tag"'],
          ['java', '"""\n// text block\n"""'], ['csharp', '@"a ""quote"""'], ['go', '`// raw`'],
        ]) {
          const { default: grammar } = await import(`/src/languages/${language}.js`);
          highlighter.register(grammar);
          const node = document.createElement('div');
          node.innerHTML = highlighter.highlight(sample, language);
          familyResults.push({ language, text: node.textContent, sample, string: !!node.querySelector('.token.string') });
        }
        const shell = document.createElement('div');
        shell.innerHTML = highlighter.highlight('cat <<EOF\nbody\nEOF\necho done', 'sh');
        const typed = highlighter.tokenize('interface Person { name: string }', { language: 'ts', strict: true });
        const source = '<p title="a > b"><img src=x onerror="window.injected=true"></p>\r\n<script>const x = `😀 ${1}`;</script>';
        const { tokens } = highlighter.tokenize(source, { language: 'html', strict: true });
        const pre = document.createElement('pre');
        pre.className = 'code theme-light';
        pre.innerHTML = highlighter.highlight(source, 'html');
        const style = document.createElement('style');
        style.textContent = themeToCSS(light) + '\n' + themeToCSS(dark);
        document.head.append(style);
        document.body.append(pre);
        const lightColor = getComputedStyle(pre).backgroundColor;
        const markup = pre.innerHTML;
        pre.className = 'code theme-dark';
        const preview = document.createElement('div');
        preview.className = 'polish theme-dark';
        preview.innerHTML = `<pre><code>${highlighter.highlight('const n = 42;', 'js')}</code></pre><pre>${highlighter.highlight('\x1b[31mRED\x1b[0m', 'ansi')}</pre>`;
        document.body.append(preview);
        return {
          htmlBoundaryFailures,
          nestedCaptureKinds: nestedCaptures.tokens.map(token => token.kind),
          crossingCaptureKinds: crossingCaptures.tokens.map(token => token.kind),
          crossingCaptureDiagnostics: crossingCaptures.diagnostics.map(diagnostic => diagnostic.code),
          boundaryRanges: boundaryResult.tokens.map(token => [token.start, token.end, token.kind]),
          boundaryDiagnostics: boundaryResult.diagnostics,
          themeFailures,
          guessedSQL: catalog.highlight('SELECT * FROM users;') === catalog.highlight('SELECT * FROM users;', 'sql'),
          guessDisabled: createHighlighter({ languages: allLanguages, guessLanguage: false }).highlight('SELECT * FROM users;') === 'SELECT * FROM users;',
          catalogCount: allLanguages.length,
          catalogFailures,
          familyResults,
          heredocText: shell.querySelector('.token.string')?.textContent,
          shellCommand: shell.querySelector('.token.function')?.textContent,
          previewKeyword: getComputedStyle(preview.querySelector('.token.keyword')).color,
          ansiColor: getComputedStyle(preview.querySelector('span[style]')).color,
          // HTML parsing normalizes CRLF even though tokenizer/renderer preserve
          // it before insertion into the DOM. Compare browser text accordingly.
          text: pre.textContent,
          expected: source.replace(/\r\n/g, '\n'),
          lightColor,
          darkColor: getComputedStyle(pre).backgroundColor,
          unchanged: markup === pre.innerHTML,
          attributes: pre.querySelectorAll('.token.attribute').length,
          numbers: pre.querySelectorAll('.token.number').length,
          injectedElements: pre.querySelectorAll('img, script').length,
          injected: window.injected === true,
          typeKinds: typed.tokens.filter(token => token.kind === 'type').map(token => 'interface Person { name: string }'.slice(token.start, token.end)),
        };
      });
      assert.deepEqual(result.htmlBoundaryFailures, []);
      assert.deepEqual(result.nestedCaptureKinds, ['tag', 'keyword', 'tag', 'plain']);
      assert.deepEqual(result.crossingCaptureKinds, ['tag', 'number', 'tag', 'plain']);
      assert.deepEqual(result.crossingCaptureDiagnostics, ['invalid-captures']);
      assert.deepEqual(result.boundaryRanges, [[0, 1, 'keyword'], [1, 2, 'plain'], [2, 3, 'string']]);
      assert.deepEqual(result.boundaryDiagnostics, []);
      assert.deepEqual(result.themeFailures, []);
      assert.equal(result.catalogCount, 49);
      assert.equal(result.guessedSQL, true);
      assert.equal(result.guessDisabled, true);
      assert.deepEqual(result.catalogFailures, []);
      assert.equal(result.text, result.expected);
      assert.equal(result.lightColor, 'rgb(255, 255, 255)');
      assert.equal(result.darkColor, 'rgb(13, 17, 23)');
      assert.equal(result.unchanged, true);
      assert.ok(result.attributes > 0);
      assert.ok(result.numbers > 0);
      assert.equal(result.injectedElements, 0);
      assert.equal(result.injected, false);
      assert.deepEqual(result.typeKinds, ['Person', 'string']);
      assert.equal(result.previewKeyword, 'rgb(255, 123, 114)');
      assert.equal(result.ansiColor, 'rgb(187, 0, 0)');
      assert.equal(result.heredocText, '<<EOF\nbody\nEOF');
      assert.equal(result.shellCommand, 'echo');
      for (const entry of result.familyResults) {
        assert.equal(entry.text, entry.sample, entry.language);
        assert.equal(entry.string, true, entry.language);
      }
    } finally { await browser.close(); }
  });
}
