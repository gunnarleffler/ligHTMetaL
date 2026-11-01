import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHighlighter, renderHTML, validateTokens, composeLanguage, createLanguageLoader } from '../../src/polish.js';
import json from '../../src/polish/languages/json.js';
import { allThemes, themeToCSS } from '../../src/polish/themes/index.js';

test('poliSH core source entry and opt-in language modules work', () => {
  const highlighter = createHighlighter();
  highlighter.register(json);
  const source = '{"suite":"lightmetal"}';
  const result = highlighter.tokenize(source, { language: 'json', strict: true });
  validateTokens(source, result.tokens);
  assert.ok(renderHTML(source, result.tokens).includes('token property'));
  const unknown = highlighter.tokenize('text', { language: 'unknown' });
  assert.equal(unknown.diagnostics[0].code, 'unknown-language');
  assert.ok(Array.isArray(unknown.tokens));
  assert.equal(typeof composeLanguage, 'function');
  assert.equal(typeof createLanguageLoader, 'function');
});

test('polish.css includes every current generated theme', async () => {
  const stylesheet = await readFile(new URL('../../src/polish.css', import.meta.url), 'utf8');
  assert.ok(stylesheet.includes('ligHTMetaL::poliSH'));
  assert.equal(allThemes.length, 11);
  assert.equal(new Set(allThemes.map(theme => theme.name)).size, 11);
  for (const theme of allThemes) assert.ok(stylesheet.includes(themeToCSS(theme)), `Run npm run build to refresh ${theme.name}`);
});
