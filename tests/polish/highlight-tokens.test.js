import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHighlighter, validateTokens } from '../../src/polish.js';
import { allLanguages } from '../../src/polish-languages.js';

const h = createHighlighter({ languages: allLanguages });
test('highlightTokens is callback-safe and shares HTML language guessing', () => {
  const { highlightTokens } = h;
  for (const [language, code] of [['js', 'const count = 42;'], ['json', '{"ready": true}'], ['python', 'def greet():\n    return "hi"']]) {
    for (const label of [undefined, '', '  ', language.toUpperCase()]) {
      const result = highlightTokens(code, label);
      validateTokens(code, result.tokens);
      assert.deepEqual(result, h.tokenize(code, { language }));
    }
  }
});

test('token hook preserves source and explicit plain/unknown/ANSI modes', () => {
  const code = '\x1b[31mconst\tcount = 42;\r\n😀\x1b[0m';
  for (const language of ['plain', 'text', 'unknown', 'ansi']) {
    const result = h.highlightTokens(code, language);
    validateTokens(code, result.tokens);
    assert.ok(result.tokens.every(token => token.kind === 'plain'));
  }
  assert.deepEqual(h.highlightTokens(''), { tokens: [], diagnostics: [] });
  const disabled = createHighlighter({ languages: allLanguages, guessLanguage: false });
  assert.ok(disabled.highlightTokens('const count = 42;').tokens.every(token => token.kind === 'plain'));
  assert.ok(disabled.highlightTokens('const count = 42;', 'js').tokens.some(token => token.kind === 'keyword'));
});

test('token hook validates inputs and keeps core tokenize explicit', () => {
  for (const code of [null, 42, {}, new String('text')]) assert.throws(() => h.highlightTokens(code), TypeError);
  for (const language of [null, 42, {}]) assert.throws(() => h.highlightTokens('text', language), TypeError);
  assert.throws(() => h.tokenize('const n = 1;', {}), TypeError);
});
