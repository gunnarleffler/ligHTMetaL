import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHighlighter, validateTokens } from '../../src/polish/index.js';
import javascript from '../../src/polish/languages/javascript.js';
import python from '../../src/polish/languages/python.js';

const highlighter = createHighlighter();
highlighter.register(javascript);
highlighter.register(python);
const tokens = (source, language = 'js') => highlighter.tokenize(source, { language, strict: true }).tokens;
const kindAt = (source, needle, language = 'js') => tokens(source, language).find(t => t.start <= source.indexOf(needle) && t.end > source.indexOf(needle))?.kind;

test('regions protect comment and string contents, including escapes', () => {
  const source = '/* const 42\ntrue */ const x = "a\\"true"; // false\nreturn x;';
  assert.equal(kindAt(source, 'const'), 'comment');
  assert.equal(kindAt(source, 'true"'), 'string');
  assert.equal(kindAt(source, 'false'), 'comment');
  assert.equal(kindAt(source, 'return'), 'keyword');
});

test('templates recurse through expressions, object braces and nested templates', () => {
  const source = '`outer ${ { x: `inner ${1 + 2}` }.x } tail`';
  assert.equal(kindAt(source, 'outer'), 'string');
  assert.equal(kindAt(source, 'inner'), 'string');
  assert.equal(kindAt(source, '1'), 'number');
  assert.equal(kindAt(source, 'tail'), 'string');
  assert.equal(kindAt(source, 'x:'), 'variable');
  validateTokens(source, tokens(source));
});

test('closing wins equal-start ties and zero-width closes pop without losing text', () => {
  const h = createHighlighter();
  h.register({ id: 'test', rules: [{ id: 'region', begin: /</, end: />/, kind: 'string', rules: [{ id: 'competing', pattern: />/, kind: 'number' }] }] });
  assert.equal(h.tokenize('<x>', { language: 'test' }).tokens[0].kind, 'string');
  assert.equal(kindAt('"unclosed\nconst x = 1', 'const'), 'keyword');
});

test('Unicode consuming and zero-width closes cannot rewind over a region begin', () => {
  for (const end of [/./u, /(?=😀)|(?=x)/u]) {
    const h = createHighlighter({ maxSteps: 10 });
    h.register({ id: 'unicode', rules: [
      { id: 'region', begin: /\ud83d/, end, kind: 'punctuation', contentKind: 'plain' },
    ] });
    for (const strict of [false, true]) {
      const source = '😀xy';
      const { tokens, diagnostics } = h.tokenize(source, { language: 'unicode', strict });
      validateTokens(source, tokens);
      assert.deepEqual(diagnostics, []);
      assert.equal(tokens.map(t => source.slice(t.start, t.end)).join(''), source);
      assert.deepEqual(tokens.map(t => [t.start, t.end, t.kind]), end.source === '.' ? [
        [0, 1, 'punctuation'], [1, 2, 'plain'], [2, 3, 'punctuation'], [3, 4, 'plain'],
      ] : [[0, 1, 'punctuation'], [1, 4, 'plain']]);
    }
  }
});

test('unterminated regions and malformed input preserve source', () => {
  for (const source of ['/* unfinished', '`x ${ {', '"tail\\', '\ud800\r\n', '`x \\` ${"}"} tail`']) {
    const result = tokens(source);
    validateTokens(source, result);
    assert.equal(result.map(t => source.slice(t.start, t.end)).join(''), source);
  }
});

test('Python multiline strings, prefixes, and comments are lexical regions', () => {
  const source = 'doc = r"""first\nTrue # still string\nlast"""\n# comment\ndef greet():\n  return None';
  assert.equal(kindAt(source, 'True', 'py'), 'string');
  assert.equal(kindAt(source, '# comment', 'py'), 'comment');
  assert.equal(kindAt(source, 'def', 'py'), 'keyword');
  assert.equal(kindAt(source, 'greet', 'py'), 'function');
  assert.equal(kindAt(source, 'None', 'py'), 'constant');
  validateTokens(source, tokens(source, 'py'));
});

test('conservative JS regexp heuristic separates common regex and division', () => {
  const source = 'const re = /a[\\/]b/gi; const n = a / b; return /x+/;';
  assert.equal(kindAt(source, '/a'), 'string');
  assert.equal(kindAt(source, '/ b'), 'operator');
  assert.equal(kindAt(source, '/x'), 'string');
});

test('limits and zero-width begin fail gracefully with exact source preservation', () => {
  const h = createHighlighter({ maxDepth: 2, maxSteps: 20 });
  h.register(javascript);
  const source = '{{{{}}}}';
  const result = h.tokenize(source, { language: 'js' });
  assert.equal(result.diagnostics[0].code, 'depth-limit');
  validateTokens(source, result.tokens);
  assert.throws(() => h.tokenize(source, { language: 'js', strict: true }), /depth-limit/);
  const limited = createHighlighter({ maxSteps: 1 });
  limited.register(javascript);
  const exhausted = limited.tokenize('x + y', { language: 'js' });
  assert.equal(exhausted.diagnostics[0].code, 'step-limit');
  validateTokens('x + y', exhausted.tokens);
  assert.throws(() => createHighlighter({ maxSteps: 0 }), /Limits/);
  const bad = createHighlighter();
  bad.register({ id: 'bad', rules: [{ id: 'empty', begin: /(?=x)/, end: /x/, kind: 'string' }] });
  assert.equal(bad.tokenize('x', { language: 'bad' }).diagnostics[0].code, 'zero-length-match');
});

test('compilation rejects cyclic definitions and snapshots nested rules', () => {
  const rules = [];
  rules.push({ id: 'cycle', begin: /</, end: />/, kind: 'string', rules });
  assert.throws(() => createHighlighter().register({ id: 'bad', rules }), /Cyclic/);
  const child = { id: 'n', pattern: /x/, kind: 'number' };
  const h = createHighlighter();
  h.register({ id: 'test', rules: [{ id: 'region', begin: /</, end: />/, kind: 'string', rules: [child] }] });
  child.kind = 'boolean';
  assert.equal(h.tokenize('<x>', { language: 'test' }).tokens[1].kind, 'number');
});
