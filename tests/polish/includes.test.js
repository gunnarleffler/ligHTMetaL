import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHighlighter, validateTokens } from '../../src/polish.js';
import { composeLanguage } from '../../src/polish/compose.js';

const word = (id, kind = 'keyword') => ({ id, pattern: /x/, kind });

test('local includes expand in place and preserve earliest-match/tie precedence', () => {
  const h = createHighlighter({ languages: [{
    id: 'test', repository: { words: [word('first')], nested: [{ id: 'nested-words', include: 'words' }] },
    rules: [{ id: 'expand', include: 'nested' }, word('second', 'string')],
  }] });
  assert.equal(h.tokenize(' x ', { language: 'test' }).tokens[1].kind, 'keyword');
});

test('productive repository recursion nests regions and preserves source', () => {
  const grammar = {
    id: 'balanced',
    repository: {
      braces: [{ id: 'brace', begin: /\{/, end: /\}/, kind: 'punctuation', contentKind: 'plain', rules: [
        { id: 'recur', include: 'braces' }, word('word'),
      ] }],
    },
    rules: [{ id: 'balanced', include: 'braces' }],
  };
  const h = createHighlighter({ languages: [grammar] });
  const source = '{x {x} tail}';
  const { tokens } = h.tokenize(source, { language: 'balanced', strict: true });
  validateTokens(source, tokens);
  assert.equal(tokens.filter(t => t.kind === 'keyword').length, 2);
  assert.equal(tokens.map(t => source.slice(t.start, t.end)).join(''), source);
});

test('non-productive cycles, missing includes and conflicting expanded IDs fail atomically', () => {
  const h = createHighlighter();
  for (const language of [
    { id: 'bad', repository: { a: [{ id: 'b', include: 'b' }], b: [{ id: 'a', include: 'a' }] }, rules: [{ id: 'a', include: 'a' }] },
    { id: 'bad', rules: [{ id: 'missing', include: 'missing' }] },
    { id: 'bad', repository: { words: [word('duplicate')] }, rules: [{ id: 'words', include: 'words' }, word('duplicate')] },
    { id: 'bad', repository: { words: [word('x')] }, rules: [{ id: 'words', include: 'words', pattern: /x/ }] },
    { id: 'bad', repository: { words: [word('x')] }, rules: [{ id: 'words', include: 'toString' }] },
  ]) {
    assert.throws(() => h.register(language));
    assert.equal(h.hasLanguage('bad'), false);
  }
});

test('registered repository definitions are isolated from later input mutations', () => {
  const entry = word('x');
  const language = { id: 'base', repository: { words: [entry] }, rules: [{ id: 'words', include: 'words' }] };
  const derived = composeLanguage(language, { id: 'derived' });
  derived.repository.words[0].kind = 'string';
  const h = createHighlighter({ languages: [language, derived] });
  entry.kind = 'number';
  assert.equal(h.tokenize('x', { language: 'base' }).tokens[0].kind, 'keyword');
  assert.equal(h.tokenize('x', { language: 'derived' }).tokens[0].kind, 'string');
});

test('runtime depth guards still bound productive recursion', () => {
  const h = createHighlighter({ maxDepth: 2, languages: [{
    id: 'recursive', rules: [{ id: 'root', include: 'braces' }],
    repository: { braces: [{ id: 'brace', begin: /\{/, end: /\}/, kind: 'punctuation', rules: [{ id: 'child', include: 'braces' }] }] },
  }] });
  const source = '{{{{}}}}';
  const result = h.tokenize(source, { language: 'recursive' });
  assert.equal(result.diagnostics[0].code, 'depth-limit');
  validateTokens(source, result.tokens);
});
