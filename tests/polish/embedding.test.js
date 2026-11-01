import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHighlighter, validateTokens } from '../../src/polish/index.js';
import html from '../../src/polish/languages/html.js';
import javascript from '../../src/polish/languages/javascript.js';
import css from '../../src/polish/languages/css.js';

const h = createHighlighter();
for (const language of [html, javascript, css]) h.register(language);
const tokenize = source => h.tokenize(source, { language: 'html', strict: true }).tokens;
const at = (source, tokens, needle) => tokens.find(t => t.start <= source.indexOf(needle) && t.end > source.indexOf(needle));

test('HTML embeds JS and CSS while preserving host delimiter language', () => {
  const source = '<STYLE>.x { color: "red"; width: 12px; }</STYLE><script>const n = 42;</script><p>&amp;</p>';
  const tokens = tokenize(source);
  validateTokens(source, tokens);
  assert.equal(at(source, tokens, 'color').language, 'css');
  assert.equal(at(source, tokens, 'color').kind, 'property');
  assert.equal(at(source, tokens, 'const').language, 'javascript');
  assert.equal(at(source, tokens, '42').kind, 'number');
  assert.equal(at(source, tokens, '</script>').language, 'html');
  assert.equal(at(source, tokens, '&amp;').kind, 'constant');
});

test('host close bounds embedded strings/comments including malformed ones', () => {
  for (const content of ['"unterminated', '/* unfinished', '`nested ${ {', '"literal']) {
    const source = `<script>${content}</script><p>after</p>`;
    const tokens = tokenize(source);
    validateTokens(source, tokens);
    assert.equal(at(source, tokens, '</script>').kind, 'tag');
    assert.equal(at(source, tokens, 'after').language, 'html');
    assert.equal(at(source, tokens, 'after').kind, 'plain');
  }
});

test('Unicode searches respect host closes and embedded bounds inside surrogate pairs', () => {
  const local = createHighlighter();
  local.register({ id: 'unicode', rules: [{ id: 'character', pattern: /./u, kind: 'string' }] });
  local.register({ id: 'host', rules: [
    { id: 'embed', begin: /\ud83d/, end: /./u, kind: 'tag', embed: 'unicode' },
  ] });
  for (const strict of [false, true]) {
    const source = '😀xy';
    const { tokens, diagnostics } = local.tokenize(source, { language: 'host', strict });
    validateTokens(source, tokens);
    assert.deepEqual(diagnostics, []);
    assert.equal(tokens.map(t => source.slice(t.start, t.end)).join(''), source);
    assert.deepEqual(tokens, [
      { start: 0, end: 1, kind: 'tag', language: 'host' },
      { start: 1, end: 2, kind: 'plain', language: 'unicode' },
      { start: 2, end: 3, kind: 'tag', language: 'host' },
      { start: 3, end: 4, kind: 'plain', language: 'host' },
    ]);
  }
});

test('embedded match and begin captures retain nesting precedence at host bounds', () => {
  for (const region of [false, true]) {
    const local = createHighlighter();
    const pattern = /(?=(ab>))(?=(ab>c))ab>c/;
    const captures = { 1: 'keyword', 2: 'string' };
    local.register({ id: 'child', rules: [region
      ? { id: 'capture', begin: pattern, end: /!/, kind: 'number', beginCaptures: captures }
      : { id: 'capture', pattern, kind: 'number', captures },
    ] });
    local.register({ id: 'host', rules: [{ id: 'embed', begin: /</, end: />/, kind: 'tag', embed: 'child' }] });
    for (const strict of [false, true]) {
      const source = '<ab>c';
      const { tokens, diagnostics } = local.tokenize(source, { language: 'host', strict });
      validateTokens(source, tokens);
      assert.deepEqual(diagnostics, []);
      assert.equal(tokens.map(t => source.slice(t.start, t.end)).join(''), source);
      assert.deepEqual(tokens, [
        { start: 0, end: 1, kind: 'tag', language: 'host' },
        { start: 1, end: 3, kind: 'keyword', language: 'child' },
        { start: 3, end: 4, kind: 'tag', language: 'host' },
        { start: 4, end: 5, kind: 'plain', language: 'host' },
      ]);
    }
  }
});

test('host bounds cannot hide crossing captures or change their graceful fallback', () => {
  for (const region of [false, true]) {
    const local = createHighlighter();
    const pattern = /(?=(abc>))ab(c>de)/;
    const captures = { 1: 'keyword', 2: 'string' };
    local.register({ id: 'child', rules: [region
      ? { id: 'capture', begin: pattern, end: /!/, kind: 'number', beginCaptures: captures }
      : { id: 'capture', pattern, kind: 'number', captures },
    ] });
    local.register({ id: 'host', rules: [{ id: 'embed', begin: /</, end: />/, kind: 'tag', embed: 'child' }] });
    const source = '<abc>de';
    const { tokens, diagnostics } = local.tokenize(source, { language: 'host' });
    validateTokens(source, tokens);
    assert.equal(tokens.map(t => source.slice(t.start, t.end)).join(''), source);
    assert.deepEqual(diagnostics.map(d => [d.code, d.language, d.rule, d.offset]), [['invalid-captures', 'child', 'capture', 1]]);
    assert.deepEqual(tokens, [
      { start: 0, end: 1, kind: 'tag', language: 'host' },
      { start: 1, end: 4, kind: 'number', language: 'child' },
      { start: 4, end: 5, kind: 'tag', language: 'host' },
      { start: 5, end: 7, kind: 'plain', language: 'host' },
    ]);
    assert.throws(() => local.tokenize(source, { language: 'host', strict: true }), /invalid-captures/);
  }
});

test('quote-aware tags and HTML comments protect fake delimiters', () => {
  const source = '<!-- <script>const</script> --><div title=">">x</div><scripture>text</scripture>';
  const tokens = tokenize(source);
  assert.equal(at(source, tokens, 'const').kind, 'comment');
  assert.equal(at(source, tokens, 'title').kind, 'attribute');
  assert.ok(tokens.every(t => t.language === 'html'));
});

test('optional embeddings stay plain, and resolve after later registration', () => {
  const local = createHighlighter();
  local.register(html);
  const source = '<script>const n = 1;</script>';
  const missing = local.tokenize(source, { language: 'html' });
  assert.equal(missing.diagnostics[0].code, 'missing-embedding');
  assert.equal(at(source, missing.tokens, 'const').kind, 'plain');
  assert.throws(() => local.tokenize(source, { language: 'html', strict: true }), /missing-embedding/);
  local.register(javascript);
  assert.equal(at(source, local.tokenize(source, { language: 'html' }).tokens, 'const').kind, 'keyword');
});

test('embedding shares the global step/depth budgets', () => {
  const local = createHighlighter({ maxSteps: 2 });
  local.register(html);
  local.register(javascript);
  const source = '<script>x + y</script><p>end</p>';
  const result = local.tokenize(source, { language: 'html' });
  assert.equal(result.diagnostics[0].code, 'step-limit');
  validateTokens(source, result.tokens);
});
