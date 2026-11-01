import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHighlighter, renderHTML, validateTokens } from '../../src/polish/index.js';
import json from '../../src/polish/languages/json.js';

const highlighter = createHighlighter();
highlighter.register(json);
const tokenize = source => highlighter.tokenize(source, { language: 'json', strict: true }).tokens;

test('JSON classifies properties, strings, numbers, booleans, null and punctuation', () => {
  const source = '{"key": "value", "n": -12.5e+2, "yes": true, "no": false, "nil": null}';
  const classified = tokenize(source).filter(t => t.kind !== 'plain').map(t => [source.slice(t.start, t.end), t.kind]);
  assert.deepEqual(classified, [
    ['{', 'punctuation'], ['"key"', 'property'], [':', 'punctuation'], ['"value"', 'string'], [',', 'punctuation'],
    ['"n"', 'property'], [':', 'punctuation'], ['-12.5e+2', 'number'], [',', 'punctuation'],
    ['"yes"', 'property'], [':', 'punctuation'], ['true', 'boolean'], [',', 'punctuation'],
    ['"no"', 'property'], [':', 'punctuation'], ['false', 'boolean'], [',', 'punctuation'],
    ['"nil"', 'property'], [':', 'punctuation'], ['null', 'constant'], ['}', 'punctuation'],
  ]);
});

test('strings protect escaped quotes, token-like contents, and Unicode', () => {
  for (const source of ['"true null 42 {}"', '"a\\"b\\\\c\\u1234"', '"😀"', '""']) {
    assert.deepEqual(tokenize(source), [{ start: 0, end: source.length, kind: 'string', language: 'json' }]);
  }
  assert.equal(tokenize('"escaped\\"key" \r\n : 0')[0].kind, 'property');
});

test('malformed and incomplete snippets preserve all source', () => {
  for (const source of ['', '{"a":', '"true null 42', '"tail\\', '"line\r\n42', '{"x": 01, "y": 1e+, ???}', '\ud800\t\r\n', '[true,false,null,0,-0,0.5,1E-9]  ']) {
    const tokens = tokenize(source);
    validateTokens(source, tokens);
    assert.equal(tokens.map(t => source.slice(t.start, t.end)).join(''), source);
  }
  assert.equal(tokenize('"true null 42')[0].kind, 'string');
  assert.ok(tokenize('01 1e+ +2').every(t => t.kind === 'plain'));
});

test('JSON output escapes HTML-like strings', () => {
  const source = '{"html":"<img src=x onerror=alert(1)> &"}';
  const html = renderHTML(source, tokenize(source));
  assert.ok(!html.includes('<img'));
  assert.ok(html.includes('&lt;img'));
  assert.ok(html.includes('&amp;'));
});
