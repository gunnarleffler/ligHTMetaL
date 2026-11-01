import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHighlighter, validateTokens } from '../../src/polish.js';
import sql from '../../src/polish/languages/sql.js';
const h = createHighlighter({ languages: [sql] });

test('SQL quoted spans, comments and following code have exact categories', () => {
  for (const [literal, kind] of [
    ["'it''s -- not a comment\r\n<&>'", 'string'], ['"a""b"', 'variable'],
    ['/* SELECT \'text\' */', 'comment'], ['-- SELECT \'text\'', 'comment'],
  ]) {
    const source = literal + '\r\nselect null, false, .5, 12e-3;';
    const { tokens, diagnostics } = h.tokenize(source, { language: 'SQL', strict: true });
    validateTokens(source, tokens);
    assert.deepEqual(diagnostics, []);
    assert.ok(tokens.filter(t => t.start < literal.length).every(t => t.kind === kind && t.end <= literal.length));
    assert.equal(tokens.find(t => t.start <= literal.length + 2 && t.end > literal.length + 2)?.kind, 'keyword');
    assert.equal(tokens.map(t => source.slice(t.start, t.end)).join(''), source);
  }
});

test('SQL unfinished regions and malformed Unicode preserve every code unit', () => {
  for (const source of ["SELECT 'unterminated\r\n\ud800😀", 'SELECT "unfinished', '/* unfinished\r\n', "SELECT '''' AS value;", 'SELECT """" FROM t;']) {
    const { tokens, diagnostics } = h.tokenize(source, { language: 'sql', strict: true });
    assert.deepEqual(diagnostics, []);
    validateTokens(source, tokens);
    assert.equal(tokens.map(t => source.slice(t.start, t.end)).join(''), source);
  }
});
