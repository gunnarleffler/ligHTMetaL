import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHighlighter, validateTokens } from '../../src/polish.js';
import { allLanguages } from '../../src/polish-languages.js';
import examples from './fixtures/language-examples.js';

const h = createHighlighter({ languages: allLanguages });
const requested = ['python', 'java', 'c', 'cpp', 'r', 'objective-c', 'javascript', 'php', 'rust', 'ada', 'swift', 'csharp', 'typescript', 'matlab', 'ruby', 'powershell', 'vba', 'go', 'dart', 'kotlin', 'lua', 'julia', 'scala', 'abap', 'zig', 'visual-basic', 'delphi', 'pascal', 'haskell', 'perl', 'cobol', 'groovy'];
test('catalog covers exactly 49 syntax grammars plus the built-in ANSI mode', () => {
  assert.equal(allLanguages.length, 49);
  assert.equal(new Set(allLanguages.map(g => g.id)).size, 49);
  for (const id of [...requested, 'sql', 'yaml', 'toml', 'xml', 'systemd', 'markdown', 'nginx', 'apache', 'ini', 'dotenv', 'dockerfile', 'ssh-config', 'batch', 'json', 'html', 'css', 'bash', 'ansi']) assert.equal(h.hasLanguage(id), true, id);
  for (const grammar of allLanguages) for (const alias of grammar.aliases ?? []) assert.equal(h.hasLanguage(alias), true, alias);
});
for (const example of examples) {
  test(`${example.id}: distinctive language fixture and public HTML hook`, () => {
    const { source } = example;
    const { tokens, diagnostics } = h.tokenize(source, { language: example.id, strict: true });
    assert.deepEqual(diagnostics, []);
    validateTokens(source, tokens);
    assert.equal(tokens.map(t => source.slice(t.start, t.end)).join(''), source);
    for (const [needle, kind] of example.expected) {
      const start = source.indexOf(needle);
      assert.ok(start >= 0, `Fixture is missing ${needle}`);
      assert.equal(tokens.find(t => t.start <= start && t.end > start)?.kind, kind, `${example.id}: ${needle}`);
    }
    assert.ok(h.highlight(source, example.id).includes('token'));
  });
  test(`${example.id}: incomplete input, Unicode and CRLF preserve source`, () => {
    for (const source of [example.source.slice(0, Math.floor(example.source.length / 2)), example.source + '\n"unterminated', example.source.replace(/\n/g, '\r\n') + '\ud800😀\t']) {
      const { tokens } = h.tokenize(source, { language: example.id, strict: true });
      validateTokens(source, tokens);
      assert.equal(tokens.map(t => source.slice(t.start, t.end)).join(''), source);
    }
  });
}

test('whole distinctive literals retain their category, not just their first character', () => {
  for (const [id, literal, kind] of [
    ['rust', 'r##"quote "# raw"##', 'string'], ['swift', '##"quote "# raw"##', 'string'],
    ['lua', '[==[ ]=] raw ]==]', 'string'], ['r', 'r"--{ raw " text }--"', 'string'],
    ['ruby', '%q{a{b}c}', 'string'], ['perl', 'q{a{b}c}', 'string'],
    ['ada', '16#FF#', 'number'], ['vba', '&HFF', 'number'],
    ['matlab', "'it''s literal'", 'string'], ['powershell', '@"\nraw "quotes"\n"@', 'string'],
  ]) {
    const { tokens } = h.tokenize(literal, { language: id, strict: true });
    assert.ok(tokens.length > 0, id);
    assert.ok(tokens.every(token => token.kind === kind), `${id}: ${JSON.stringify(tokens)}`);
    assert.equal(tokens.map(t => literal.slice(t.start, t.end)).join(''), literal);
  }
});

test('distinctive literal delimiters do not swallow following code', () => {
  for (const [id, source, keyword] of [
    ['rust', 'let s = r##"quote "# raw"##; return;', 'return'],
    ['swift', 'let s = #"a \\#" quote"#; return nil', 'return'],
    ['lua', 'local s = [==[ ]=] raw ]==]; return nil', 'return'],
    ['r', 'x <- r"--{ raw " text }--"; if (TRUE) x', 'if'],
    ['ruby', 's = %q{a{b}c}; return nil', 'return'],
    ['perl', 'my $s = q{a{b}c}; return $s;', 'return'],
    ['php', "$s = <<<'END'\nraw\nEND;\nreturn null;", 'return'],
  ]) {
    const result = h.tokenize(source, { language: id, strict: true });
    const start = source.lastIndexOf(keyword);
    assert.equal(result.tokens.find(t => t.start <= start && t.end > start)?.kind, 'keyword', id);
  }
});
