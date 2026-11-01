import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHighlighter, validateTokens } from '../../src/polish.js';
import c from '../../src/polish/languages/c.js';
import cpp from '../../src/polish/languages/cpp.js';
import java from '../../src/polish/languages/java.js';
import csharp from '../../src/polish/languages/csharp.js';
import go from '../../src/polish/languages/go.js';

const languages = [c, cpp, java, csharp, go];
const h = createHighlighter({ languages });
function at(source, tokens, text) {
  const start = source.indexOf(text);
  assert.ok(start >= 0, `Missing fixture text: ${text}`);
  return tokens.find(t => t.start <= start && t.end > start)?.kind;
}

const fixtures = [
  { file: 'example.c', language: 'c', expected: [
    ['#include', 'keyword'], ['<stdio.h>', 'string'], ['ordinary C comment', 'comment'], ['const', 'keyword'],
    ['char', 'type'], ['hello //', 'string'], ['0x2aUL', 'number'], ['printf', 'function'], ['return', 'keyword'],
  ] },
  { file: 'example.cpp', language: 'cpp', expected: [
    ['template', 'keyword'], ['typename', 'keyword'], ['concept', 'keyword'], ['requires', 'keyword'],
    ['Quotes " and //', 'string'], ['constexpr', 'keyword'], ["1'000ULL", 'number'], ['greet', 'function'],
  ] },
  { file: 'Example.java', language: 'java', expected: [
    ['Override', 'type'], ['public', 'keyword'], ['// not a comment', 'string'], ['"quotes" stay', 'string'],
    ['1_000L', 'number'], ['boolean', 'type'], ['true', 'boolean'], ['return', 'keyword'],
  ] },
  { file: 'Example.cs', language: 'csharp', expected: [
    ['#nullable', 'keyword'], ['record', 'keyword'], ['string', 'type'], ['C:\\folder', 'string'],
    ['Text with """ inside', 'string'], ['@class', 'variable'], ['1_000.5m', 'number'], ['null;', 'constant'],
  ] },
  { file: 'example.go', language: 'go', expected: [
    ['package', 'keyword'], ['func', 'keyword'], ['raw \\n', 'string'], ['// still string', 'string'],
    ["'界'", 'string'], ['0x1.fp+2', 'number'], ['make', 'function'], ['int', 'type'], ['Println', 'function'],
  ] },
];
for (const fixture of fixtures) {
  test(`${fixture.language}: saved fixture classifies distinctive lexical constructs`, async () => {
    const source = await readFile(new URL(`./fixtures/c-family/${fixture.file}`, import.meta.url), 'utf8');
    const { tokens, diagnostics } = h.tokenize(source, { language: fixture.language, strict: true });
    validateTokens(source, tokens);
    assert.deepEqual(diagnostics, []);
    assert.equal(tokens.map(t => source.slice(t.start, t.end)).join(''), source);
    for (const [text, kind] of fixture.expected) assert.equal(at(source, tokens, text), kind, `${fixture.language}: ${text}`);
    assert.ok(h.highlight(source, fixture.language).includes('token'));
  });
}

test('C++ raw strings respect custom delimiters, prefixes and closing boundaries', () => {
  const source = 'auto x = LR"tag(a )other" // content)tag"; return 1;';
  const { tokens } = h.tokenize(source, { language: 'cxx', strict: true });
  assert.equal(at(source, tokens, '// content'), 'string');
  assert.equal(at(source, tokens, 'return'), 'keyword');
  assert.equal(at(source, tokens, '1;'), 'number');
});

test('C# verbatim doubled quotes and raw quote counts preserve following code', () => {
  for (const source of ['var x = @"a ""quoted"" value"; return 1;', 'var x = """"a """ value""""; return 1;', 'var x = $$"""{{name}} // text"""; return 1;']) {
    const { tokens } = h.tokenize(source, { language: 'cs', strict: true });
    assert.equal(at(source, tokens, 'return'), 'keyword');
    validateTokens(source, tokens);
  }
});

test('Java text blocks and Go raw strings do not interpret comment delimiters', () => {
  for (const [language, source] of [['java', 'String x = """\n// raw\n"""; return;'], ['golang', 'x := `// raw \\n`; return']]) {
    const { tokens } = h.tokenize(source, { language, strict: true });
    assert.equal(at(source, tokens, '// raw'), 'string');
    assert.equal(at(source, tokens, 'return'), 'keyword');
  }
});

test('C-family grammars remain distinct rather than sharing one keyword list', () => {
  assert.equal(at('concept', h.tokenize('concept', { language: 'cpp' }).tokens, 'concept'), 'keyword');
  assert.equal(at('concept', h.tokenize('concept', { language: 'c' }).tokens, 'concept'), 'variable');
  assert.equal(at('defer', h.tokenize('defer', { language: 'go' }).tokens, 'defer'), 'keyword');
  assert.equal(at('defer', h.tokenize('defer', { language: 'java' }).tokens, 'defer'), 'variable');
  assert.equal(c.repository.quotes[0].begin.source, '(?:u8|[LuU])?"');
});

test('conventional C++/C# aliases work without relaxing canonical IDs', () => {
  assert.equal(h.hasLanguage(' C++ '), true);
  assert.equal(h.hasLanguage('C#'), true);
  assert.ok(h.highlight('concept Sized', 'c++').includes('token keyword'));
  assert.ok(h.highlight('record Person', 'c#').includes('token keyword'));
  assert.throws(() => h.register({ id: 'bad+canonical', rules: [] }), /Invalid/);
  assert.throws(() => h.register({ id: 'badalias', aliases: ['../cpp'], rules: [] }), /Invalid/);
});

test('malformed/incomplete strings and directives preserve all original source', () => {
  const samples = ['"unfinished\r\nreturn 1;', '/* unfinished', '#define X \\\r\n  1\r\n', 'R"tag(unfinished', '@"unfinished ""', '""""unterminated', '`unfinished', '\ud800\t😀\r\n'];
  for (const language of languages) for (const source of samples) {
    const { tokens } = h.tokenize(source, { language: language.id, strict: true });
    validateTokens(source, tokens);
    assert.equal(tokens.map(t => source.slice(t.start, t.end)).join(''), source);
  }
});
