import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHighlighter, validateTokens } from '../../src/polish.js';
import { allLanguages } from '../../src/polish-languages.js';

const h = createHighlighter({ languages: allLanguages });
function result(id, source) {
  const { tokens, diagnostics } = h.tokenize(source, { language: id, strict: true });
  assert.deepEqual(diagnostics, []);
  validateTokens(source, tokens);
  return tokens;
}
function kind(tokens, source, needle, expected) {
  const start = source.indexOf(needle);
  assert.ok(start >= 0, needle);
  const selected = tokens.filter(t => t.end > start && t.start < start + needle.length);
  assert.ok(selected.length > 0 && selected.every(t => t.kind === expected), `${needle}: ${JSON.stringify(selected)}`);
}

test('INI and TOML share key/section mechanics, but not typed value semantics', () => {
  const source = '[server]\nenabled = true\nport = 8080\n';
  for (const id of ['ini', 'toml']) {
    const tokens = result(id, source);
    kind(tokens, source, '[server]', 'type');
    kind(tokens, source, 'enabled', 'property');
    kind(tokens, source, '8080', id === 'ini' ? 'plain' : 'number');
    kind(tokens, source, 'true', id === 'ini' ? 'plain' : 'boolean');
  }
  const source2 = 'site."odd.key" = { retries = 3, enabled = false }';
  const tokens = result('toml', source2);
  kind(tokens, source2, 'site."odd.key"', 'property');
  kind(tokens, source2, 'retries', 'property');
  kind(tokens, source2, 'false', 'boolean');
});

test('YAML block scalars respect indentation, blank lines, indicators and dedents', () => {
  for (const marker of ['|', '>-', '|2+', '>+2']) {
    const source = `message: ${marker}\n  # literal\n\n  false: literal\nafter: true\n`;
    const tokens = result('yaml', source);
    kind(tokens, source, '# literal', 'string');
    kind(tokens, source, 'false: literal', 'string');
    kind(tokens, source, 'after', 'property');
    kind(tokens, source, 'true', 'boolean');
  }
  const source = "plain: don't panic\nurl: https://example.test/#fragment\nafter: true";
  const tokens = result('yaml', source);
  kind(tokens, source, 'after', 'property');
  assert.ok(!tokens.some(t => t.kind === 'comment'));
});

test('TOML multiline literal/basic strings protect comments and resume at the next key', () => {
  for (const delimiter of ['"""', "'''"]) {
    const source = `text = ${delimiter}\n# literal\n[not_a_table]\n${delimiter}\nafter = false`;
    const tokens = result('toml', source);
    kind(tokens, source, '# literal', 'string');
    kind(tokens, source, '[not_a_table]', 'string');
    kind(tokens, source, 'after', 'property');
  }
  const source = 'created = 2026-01-02T03:04:05Z';
  kind(result('toml', source), source, '2026-01-02T03:04:05Z', 'constant');
});

test('systemd specifiers are distinct from shell interpretation and inline comments', () => {
  const source = '[Service]\nExecStart=/bin/tool %i\nDescription=literal # text\nEnvironment="HOME=%h"';
  const tokens = result('systemd', source);
  kind(tokens, source, '%i', 'variable');
  kind(tokens, source, '%h', 'variable');
  kind(tokens, source, '# text', 'plain');
});

test('XML quotes, CDATA and internal subsets protect fake closing delimiters', () => {
  const source = '<!DOCTYPE root [<!ENTITY e "a ] > b">]><root title="a > b"><![CDATA[</root>]]>&e;</root>';
  const tokens = result('xml', source);
  kind(tokens, source, 'a ] > b', 'string');
  kind(tokens, source, 'title', 'attribute');
  kind(tokens, source, '<![CDATA[</root>]]>', 'string');
  kind(tokens, source, '&e;', 'constant');
  assert.ok(!h.highlight(source, 'xml').includes('<!DOCTYPE'));
});

test('Markdown displays source with exact fence lengths and code-span delimiters', () => {
  for (const fence of ['````', '~~~~']) {
    const source = `${fence}js\n# code\n${fence.slice(1)}\n**still code**\n${fence}\n# After`;
    const tokens = result('markdown', source);
    kind(tokens, source, '# code', 'string');
    kind(tokens, source, '**still code**', 'string');
    kind(tokens, source, '# After', 'keyword');
  }
  const source = 'A ``literal ` tick`` and unmatched ` tail';
  kind(result('markdown', source), source, '``literal ` tick``', 'string');
  assert.equal(h.highlight('# title', 'md'), '<span class="token keyword"># title</span>');
  const unclosed = '```unknown\n# still code';
  kind(result('markdown', unclosed), unclosed, '# still code', 'string');
});

test('nginx and Apache have different comment and container semantics', () => {
  const nginx = 'server { listen 80; set $name "x # literal"; } # comment';
  const tokens = result('nginx', nginx);
  kind(tokens, nginx, 'listen', 'keyword');
  kind(tokens, nginx, 'set', 'keyword');
  kind(tokens, nginx, '# literal', 'string');
  kind(tokens, nginx, '# comment', 'comment');
  const apache = '<Directory "a > b">\nRequire all granted # literal\n</Directory>';
  const other = result('apache', apache);
  kind(other, apache, 'a > b', 'string');
  kind(other, apache, 'Require', 'keyword');
  kind(other, apache, '# literal', 'plain');
  kind(other, apache, '</Directory', 'tag');
});

test('Batch handles adjacent parameter/environment/FOR expansions and caret escaping', () => {
  const source = '@echo %1 %PATH% %~dp0 %%A !name! ^&\n:label\nREM comment';
  const tokens = result('batch', source);
  for (const expansion of ['%1', '%PATH%', '%~dp0', '%%A', '!name!']) kind(tokens, source, expansion, 'variable');
  kind(tokens, source, '^&', 'string');
  kind(tokens, source, ':label', 'function');
  kind(tokens, source, 'REM comment', 'comment');
});

test('new source scanners stay inside an embedding host boundary', () => {
  for (const id of ['yaml', 'markdown']) {
    const host = createHighlighter({ languages: allLanguages });
    host.register({ id: 'host', rules: [{ id: 'body', begin: /BEGIN/, end: /END/, kind: 'tag', embed: id }] });
    const source = id === 'yaml' ? 'BEGIN\ntext: |\n  raw END after' : 'BEGIN\n```js\nraw END after';
    const { tokens } = host.tokenize(source, { language: 'host', strict: true });
    const close = source.indexOf('END');
    assert.ok(tokens.some(t => t.start === close && t.kind === 'tag'));
    assert.ok(!tokens.some(t => t.language === id && t.end > close));
    validateTokens(source, tokens);
  }
});
