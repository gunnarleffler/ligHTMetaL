import { test } from 'node:test';
import assert from 'node:assert/strict';
import { composeLanguage } from '../../src/polish/compose.js';
import { createHighlighter } from '../../src/polish/index.js';
import javascript from '../../src/polish/languages/javascript.js';

const rule = (id, kind = 'string') => ({ id, pattern: /x/, kind });

test('composition performs explicit ordered insert/replace/remove edits', () => {
  const base = { id: 'base', aliases: ['b'], rules: [rule('a'), rule('b'), rule('c')] };
  const derived = composeLanguage(base, { id: 'derived', edits: [
    { op: 'insertBefore', target: 'b', rules: [rule('before')] },
    { op: 'insertAfter', target: 'b', rules: [rule('after')] },
    { op: 'replace', target: 'a', rule: rule('replacement') },
    { op: 'remove', target: 'c' },
  ] });
  assert.deepEqual(derived.rules.map(r => r.id), ['replacement', 'before', 'b', 'after']);
  assert.deepEqual(derived.aliases, []);
  assert.deepEqual(base.rules.map(r => r.id), ['a', 'b', 'c']);
});

test('nested grammar, captures, edits, and regexes are isolated', () => {
  const captures = { 1: 'keyword' };
  const inserted = { id: 'capture', pattern: /(x)/g, kind: 'plain', captures };
  const derived = composeLanguage(javascript, { id: 'derived', aliases: ['d'], edits: [{ op: 'insertBefore', target: 'keyword', rules: [inserted] }] });
  derived.repository.escapes[0].kind = 'number';
  derived.rules.find(r => r.id === 'capture').captures[1] = 'string';
  derived.rules.find(r => r.id === 'capture').pattern.lastIndex = 10;
  assert.equal(javascript.repository.escapes[0].kind, 'string');
  assert.equal(captures[1], 'keyword');
  assert.equal(inserted.pattern.lastIndex, 0);
  const h = createHighlighter();
  h.register(javascript);
  h.register(derived);
  assert.equal(h.tokenize('x', { language: 'd' }).tokens[0].kind, 'string');
  assert.equal(h.tokenize('x', { language: 'js' }).tokens[0].kind, 'variable');
});

test('invalid edits fail without mutating the base grammar', () => {
  const base = { id: 'base', rules: [rule('a')] };
  for (const edit of [
    { op: 'remove', target: 'missing' },
    { op: 'insertBefore', target: 'a', rules: [rule('a')] },
    { op: 'unexpected', target: 'a' },
  ]) assert.throws(() => composeLanguage(base, { id: 'derived', edits: [edit] }));
  assert.equal(base.rules.length, 1);
  assert.equal(base.rules[0].id, 'a');
});
