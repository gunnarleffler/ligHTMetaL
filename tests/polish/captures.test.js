import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHighlighter, validateTokens } from '../../src/polish/index.js';
import html from '../../src/polish/languages/html.js';
import { flattenCaptures } from '../../src/polish/captures.js';

function run(pattern, captures, source, strict = true) {
  const h = createHighlighter();
  h.register({ id: 'test', rules: [{ id: 'capture', pattern, kind: 'plain', captures }] });
  return h.tokenize(source, { language: 'test', strict });
}
const pairs = (source, result) => result.tokens.map(t => [source.slice(t.start, t.end), t.kind]);

test('capture ranges override outer classification, not the consumed source', () => {
  assert.deepEqual(pairs('const name', run(/(const) (name)/, { 1: 'keyword', 2: 'variable' }, 'const name')), [
    ['const', 'keyword'], [' ', 'plain'], ['name', 'variable'],
  ]);
  assert.deepEqual(pairs('abc', run(/(a(b)c)/, { 1: 'string', 2: 'keyword' }, 'abc')), [
    ['a', 'string'], ['b', 'keyword'], ['c', 'string'],
  ]);
});

test('equal spans prefer higher group index; absent/empty groups are ignored', () => {
  assert.equal(run(/((abc))/, { 0: 'comment', 1: 'string', 2: 'keyword' }, 'abc').tokens[0].kind, 'keyword');
  assert.equal(run(/(a)?(b)()/, { 1: 'number', 2: 'string', 3: 'keyword' }, 'b').tokens[0].kind, 'string');
});

test('bounds clip output without changing original capture precedence', () => {
  for (const [pattern, captures, expected] of [
    [/(?=(abc))(?=(abcd))abcd/d, { 1: 'keyword', 2: 'string' }, [
      { start: 0, end: 3, kind: 'keyword' }, { start: 3, end: 4, kind: 'string' },
    ]],
    [/(?=(abcd))(?=(abcd))abcd/d, { 1: 'keyword', 2: 'string' }, [
      { start: 0, end: 4, kind: 'string' },
    ]],
    [/(a)?(bcd)()/d, { 1: 'keyword', 2: 'string', 3: 'comment' }, [
      { start: 0, end: 1, kind: 'keyword' }, { start: 1, end: 4, kind: 'string' },
    ]],
  ]) {
    const match = pattern.exec('abcd');
    for (const bound of [1, 2, 3, 4]) {
      const clipped = expected.filter(span => span.start < bound).map(span => ({ ...span, end: Math.min(span.end, bound) }));
      assert.deepEqual(flattenCaptures(match, captures, 'plain', bound), clipped);
    }
  }
});

test('crossing capture validation uses original ranges even outside the bound', () => {
  for (const [pattern, source] of [
    [/(?=(abcd))ab(cde)/d, 'abcde'],
    [/a(?=(bcde))bc(def)/d, 'abcdef'],
  ]) {
    const match = pattern.exec(source);
    for (const bound of [1, 3, source.length]) {
      assert.throws(() => flattenCaptures(match, { 1: 'string', 2: 'keyword' }, 'plain', bound), /Crossing capture/);
    }
  }
});

test('crossing, nonexistent, or out-of-match captures diagnose without losing text', () => {
  for (const [pattern, captures, source] of [
    [/(?=(ab))a(bc)/, { 1: 'string', 2: 'keyword' }, 'abc'],
    [/a/, { 2: 'string' }, 'a'],
    [/(?<=(a))b/, { 1: 'string' }, 'ab'],
  ]) {
    const result = run(pattern, captures, source, false);
    validateTokens(source, result.tokens);
    assert.equal(result.diagnostics[0].code, 'invalid-captures');
    assert.throws(() => run(pattern, captures, source), /invalid-captures/);
  }
});

test('region begin/end captures classify delimiters separately', () => {
  const h = createHighlighter();
  h.register({ id: 'region', rules: [{ id: 'r', begin: /(<)(x)/, end: /(x)(>)/, kind: 'punctuation', contentKind: 'string', beginCaptures: { 2: 'tag' }, endCaptures: { 1: 'tag' } }] });
  const source = '<x content x>';
  assert.deepEqual(pairs(source, h.tokenize(source, { language: 'region' })), [
    ['<', 'punctuation'], ['x', 'tag'], [' content ', 'string'], ['x', 'tag'], ['>', 'punctuation'],
  ]);
});

test('HTML classifies attribute values with greater-than signs and boolean attributes', () => {
  const h = createHighlighter();
  h.register(html);
  const source = '<input disabled title="a > b" count=42/>';
  const result = h.tokenize(source, { language: 'html', strict: true });
  validateTokens(source, result.tokens);
  const classified = pairs(source, result);
  assert.ok(classified.some(([text, kind]) => text === 'input' && kind === 'tag'));
  assert.ok(classified.some(([text, kind]) => text === 'disabled' && kind === 'attribute'));
  assert.ok(classified.some(([text, kind]) => text === '"a > b"' && kind === 'string'));
});

test('capture maps are snapshotted and invalid keys/kinds are rejected', () => {
  const captures = { 1: 'keyword' };
  const h = createHighlighter();
  h.register({ id: 'snap', rules: [{ id: 'x', pattern: /(x)/, kind: 'plain', captures }] });
  captures[1] = 'string';
  assert.equal(h.tokenize('x', { language: 'snap' }).tokens[0].kind, 'keyword');
  for (const invalid of [{ foo: 'string' }, { 1: 'made-up' }]) {
    assert.throws(() => createHighlighter().register({ id: 'bad', rules: [{ id: 'x', pattern: /(x)/, kind: 'plain', captures: invalid }] }), /Invalid capture/);
  }
});
