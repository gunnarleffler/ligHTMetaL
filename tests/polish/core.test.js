import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHighlighter, renderHTML, validateTokens } from '../../src/polish/index.js';

function fixture() {
  const highlighter = createHighlighter();
  highlighter.register({ id: 'sample', aliases: ['s'], rules: [
    { id: 'word', pattern: /hello/, kind: 'keyword' },
    { id: 'number', pattern: /\d+/, kind: 'number' },
  ] });
  return highlighter;
}

test('preserves all source, UTF-16 offsets, CRLF, and trailing text', () => {
  const highlighter = fixture();
  for (const source of ['', 'hello 42', '😀\r\nhello 42\t tail', 'unterminated "']) {
    const result = highlighter.tokenize(source, { language: ' S ' });
    validateTokens(source, result.tokens);
    assert.equal(result.tokens.map(t => source.slice(t.start, t.end)).join(''), source);
    assert.deepEqual(result.diagnostics, []);
    assert.ok(result.tokens.every(t => t.language === 'sample'));
  }
});

test('Unicode regex searches stay forward after a rule consumes half a surrogate pair', () => {
  for (const first of [
    { id: 'half', pattern: /\ud83d/, kind: 'keyword' },
    { id: 'half', scan: ({ source, start, end }) => {
      const index = source.indexOf('\ud83d', start);
      return index < 0 || index >= end ? null : { start: index, end: index + 1 };
    }, kind: 'keyword' },
  ]) {
    for (const pattern of [/./u, /😀|(?<=😀)x/u]) {
      const h = createHighlighter();
      h.register({ id: 'unicode', rules: [first, { id: 'unicode', pattern, kind: 'string' }] });
      for (const strict of [false, true]) {
        // Repeated calls also check that cached failures do not leak across calls.
        for (const [source, expected] of [
          ['😀x😀x', [
            [0, 1, 'keyword'], [1, 2, 'plain'], [2, 3, 'string'],
            [3, 4, 'keyword'], [4, 5, 'plain'], [5, 6, 'string'],
          ]],
          ['😀', [[0, 1, 'keyword'], [1, 2, 'plain']]],
          ['😀x', [[0, 1, 'keyword'], [1, 2, 'plain'], [2, 3, 'string']]],
        ]) {
          const { tokens, diagnostics } = h.tokenize(source, { language: 'unicode', strict });
          validateTokens(source, tokens);
          assert.deepEqual(diagnostics, []);
          assert.equal(tokens.map(t => source.slice(t.start, t.end)).join(''), source);
          assert.deepEqual(tokens.map(t => [t.start, t.end, t.kind]), expected);
        }
      }
    }
  }
});

test('earliest match wins, and declaration order breaks ties', () => {
  const highlighter = createHighlighter();
  highlighter.register({ id: 'order', rules: [
    { id: 'later', pattern: /z/, kind: 'keyword' },
    { id: 'first', pattern: /a/, kind: 'string' },
    { id: 'tie', pattern: /ab/, kind: 'number' },
  ] });
  assert.deepEqual(highlighter.tokenize('abz', { language: 'order' }).tokens.map(t => t.kind), ['string', 'plain', 'keyword']);
});

test('unknown languages fall back with diagnostics; strict mode throws', () => {
  const highlighter = fixture();
  const result = highlighter.tokenize('hello', { language: 'missing' });
  assert.equal(result.tokens[0].kind, 'plain');
  assert.equal(result.diagnostics[0].code, 'unknown-language');
  assert.throws(() => highlighter.tokenize('hello', { language: 'missing', strict: true }), /unknown-language/);
  assert.deepEqual(highlighter.tokenize('hello', { language: 'plain' }).diagnostics, []);
});

test('zero-length rules fail gracefully without dropping source', () => {
  const highlighter = createHighlighter();
  highlighter.register({ id: 'bad', rules: [{ id: 'empty', pattern: /(?=x)/, kind: 'string' }] });
  const result = highlighter.tokenize(' x', { language: 'bad' });
  validateTokens(' x', result.tokens);
  assert.equal(result.diagnostics[0].code, 'zero-length-match');
  assert.throws(() => highlighter.tokenize('x', { language: 'bad', strict: true }), /zero-length-match/);
});

test('registration is isolated, snapshots regexes, and rejects collisions', () => {
  const a = fixture();
  const b = createHighlighter();
  assert.equal(b.tokenize('hello', { language: 'sample' }).diagnostics.length, 1);
  assert.throws(() => a.register({ id: 's', rules: [] }), /already registered/);
  const pattern = /x/g;
  pattern.lastIndex = 99;
  b.register({ id: 'x', rules: [{ id: 'x', pattern, kind: 'keyword' }] });
  b.tokenize('x', { language: 'x' });
  assert.equal(pattern.lastIndex, 99);
  assert.throws(() => b.register({ id: 'sticky', rules: [{ id: 'x', pattern: /x/y, kind: 'string' }] }), /Sticky/);
});

test('HTML keeps split surrogate pairs in the following token without empty spans', () => {
  for (const firstKind of ['keyword', 'string', 'plain']) {
    for (const followingKind of ['string', 'plain']) {
      const tokens = Object.freeze([
        Object.freeze({ start: 0, end: 1, kind: firstKind, language: 'first' }),
        Object.freeze({ start: 1, end: 2, kind: followingKind, language: 'second' }),
      ]);
      const expected = followingKind === 'plain' ? '😀' : '<span class="token string">😀</span>';
      const output = renderHTML('😀', tokens);
      assert.equal(output, expected);
      assert.equal(Buffer.from(output, 'utf8').toString('utf8'), expected);
    }
  }
});

test('HTML UTF-8 output preserves escaped text across every partition of boundary fixtures', () => {
  for (const source of ['😀', 'a😀b', '😀😎', '<😀&"\'\r\n>']) {
    const expected = renderHTML(source, [{ start: 0, end: source.length, kind: 'plain', language: 'test' }]);
    for (let cuts = 0; cuts < 2 ** (source.length - 1); cuts++) {
      const tokens = [];
      let start = 0;
      for (let end = 1; end <= source.length; end++) {
        if (end === source.length || (cuts & (1 << (end - 1)))) {
          tokens.push({ start, end, kind: ['keyword', 'plain', 'string'][tokens.length % 3], language: 'test' });
          start = end;
        }
      }
      const output = renderHTML(source, tokens);
      assert.equal(output.replace(/<\/?span\b[^>]*>/g, ''), expected);
      assert.equal(Buffer.from(output, 'utf8').toString('utf8').replace(/<\/?span\b[^>]*>/g, ''), expected);
    }
  }
});

test('HTML escapes source and rejects invalid partitions or class injection', () => {
  const source = '<script>"&\'</script>';
  const tokens = [{ start: 0, end: source.length, kind: 'string', language: 'sample' }];
  const html = renderHTML(source, tokens);
  assert.equal(html, '<span class="token string">&lt;script&gt;&quot;&amp;&#39;&lt;/script&gt;</span>');
  assert.throws(() => renderHTML(source, []), /partition/);
  assert.throws(() => renderHTML(source, [{ ...tokens[0], kind: '" onclick="bad' }]), /partition/);
  assert.throws(() => validateTokens('ab', [{ start: 1, end: 2, kind: 'plain' }]), /partition/);
  assert.equal(renderHTML('', []), '');
});
