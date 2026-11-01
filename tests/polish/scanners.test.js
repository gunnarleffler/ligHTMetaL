import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHighlighter, validateTokens, composeLanguage } from '../../src/polish.js';

function scannerLanguage(scan) {
  return { id: 'scanner', rules: [{ id: 'custom', scan, kind: 'string' }] };
}

test('scanner candidates compete by earliest start and declaration-order ties', () => {
  const scan = ({ source, start }) => {
    const index = source.indexOf('xx', start);
    return index < 0 ? null : { start: index, end: index + 2 };
  };
  const language = scannerLanguage(scan);
  language.rules.push({ id: 'earlier', pattern: /\ba\b/, kind: 'keyword' }, { id: 'tie', pattern: /xx/, kind: 'number' });
  const h = createHighlighter({ languages: [language] });
  const result = h.tokenize('a xx tail', { language: 'scanner', strict: true });
  assert.deepEqual(result.tokens.map(t => t.kind), ['keyword', 'plain', 'string', 'plain']);
  validateTokens('a xx tail', result.tokens);
});

test('scanner receives frozen, bounded context and is not cached across cursors', () => {
  const contexts = [];
  const scan = context => {
    assert.ok(Object.isFrozen(context));
    contexts.push(context);
    return context.start < context.end ? { start: context.start, end: context.start + 1 } : null;
  };
  const h = createHighlighter({ languages: [scannerLanguage(scan), {
    id: 'host', rules: [{ id: 'embed', begin: /</, end: />/, kind: 'tag', embed: 'scanner' }],
  }] });
  h.tokenize('<abc>tail', { language: 'host', strict: true });
  assert.deepEqual(contexts.map(c => c.start), [1, 2, 3]);
  assert.ok(contexts.every(c => c.source === '<abc>tail' && c.end === 4 && c.language === 'scanner'));
});

test('invalid/throwing/async scanners diagnose and preserve remaining source', async () => {
  for (const scan of [
    () => ({ start: 0, end: 0 }),
    () => ({ start: -1, end: 1 }),
    () => ({ start: 0, end: 99 }),
    () => ({ start: 0.5, end: 1 }),
    () => undefined,
    () => { throw new Error('broken scanner'); },
    () => Promise.reject(new Error('async scanner')),
  ]) {
    const h = createHighlighter({ languages: [scannerLanguage(scan)] });
    const result = h.tokenize('abc', { language: 'scanner' });
    assert.equal(result.diagnostics[0].code, 'invalid-scanner');
    assert.equal(result.diagnostics[0].rule, 'custom');
    validateTokens('abc', result.tokens);
    assert.throws(() => h.tokenize('abc', { language: 'scanner', strict: true }), /invalid-scanner/);
  }
  await new Promise(resolve => setImmediate(resolve)); // Rejected scanner promises must not leak unhandled rejections.
});

test('scanners cannot overrun embedded bounds or return already-consumed source', () => {
  const h = createHighlighter({ languages: [scannerLanguage(({ source }) => ({ start: 1, end: source.length })), {
    id: 'host', rules: [{ id: 'embed', begin: /</, end: />/, kind: 'tag', embed: 'scanner' }],
  }] });
  const result = h.tokenize('<abc>tail', { language: 'host' });
  assert.equal(result.diagnostics[0].code, 'invalid-scanner');
  assert.equal(result.diagnostics[0].language, 'scanner');
  validateTokens('<abc>tail', result.tokens);
  const stale = createHighlighter({ languages: [scannerLanguage(() => ({ start: 0, end: 1 }))] });
  assert.equal(stale.tokenize('abc', { language: 'scanner' }).diagnostics[0].code, 'invalid-scanner');
});

test('scanner composition clones data, retains callbacks and permits replacement', () => {
  const scan = ({ start, end }) => start < end ? { start, end: start + 1 } : null;
  const base = scannerLanguage(scan);
  const derived = composeLanguage(base, { id: 'derived' });
  assert.equal(derived.rules[0].scan, scan);
  derived.rules[0].kind = 'number';
  assert.equal(base.rules[0].kind, 'string');
  const h = createHighlighter({ languages: [base, derived] });
  assert.equal(h.tokenize('x', { language: 'derived' }).tokens[0].kind, 'number');
  assert.throws(() => h.register({ id: 'bad', rules: [{ id: 'x', scan, pattern: /x/, kind: 'string' }] }), /Invalid scanner/);
});

test('scanner tokens participate in the shared scan-step budget', () => {
  const h = createHighlighter({ maxSteps: 2, languages: [scannerLanguage(({ start }) => ({ start, end: start + 1 }))] });
  const result = h.tokenize('abcdef', { language: 'scanner' });
  assert.equal(result.diagnostics[0].code, 'step-limit');
  validateTokens('abcdef', result.tokens);
});
