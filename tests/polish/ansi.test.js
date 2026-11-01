import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stripVTControlCharacters } from 'node:util';
import { createHighlighter } from '../../src/polish.js';
import { renderANSI, escapeTerminalText } from '../../src/polish/ansi.js';
import { dark } from '../../src/polish/themes/index.js';
import javascript from '../../src/polish/languages/javascript.js';

const h = createHighlighter();
h.register(javascript);
const plainTokens = source => source ? [{ start: 0, end: source.length, kind: 'plain', language: 'plain' }] : [];

test('terminal text preserves ordinary Unicode, tabs and LF; normalizes CRLF', () => {
  assert.equal(escapeTerminalText('Hello 😀\t世界\nline\r\n'), 'Hello 😀\t世界\nline\n');
  assert.equal(escapeTerminalText('overwrite\rback\b\x07'), 'overwrite\\x0dback\\x08\\x07');
  assert.equal(escapeTerminalText(''), '');
});

test('all C0/C1 controls and DEL are visible except allowed tab/LF', () => {
  for (let code = 0; code <= 0x9f; code++) {
    if (code > 0x1f && code < 0x7f) continue;
    const char = String.fromCharCode(code);
    assert.equal(escapeTerminalText(char), code === 9 || code === 10 ? char : `\\x${code.toString(16).padStart(2, '0')}`);
  }
  for (const code of [0x061c, 0x200e, 0x200f, 0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2066, 0x2067, 0x2068, 0x2069]) {
    assert.equal(escapeTerminalText(String.fromCharCode(code)), `\\u${code.toString(16).padStart(4, '0')}`);
  }
});

test('OSC clipboard/hyperlink, CSI erase, and C1 strings become inert text', () => {
  const source = '\x1b]52;c;payload\x07\x1b]8;;https://example.com\x1b\\link\x1b]8;;\x1b\\\x1b[2J\x9b2J\x90payload\x9c';
  const escaped = escapeTerminalText(source);
  assert.ok(escaped.includes('\\x1b]52;c;payload\\x07'));
  assert.ok(escaped.includes('\\x9b2J'));
  assert.ok(!/[\x00-\x08\x0b-\x1f\x7f-\x9f]/.test(escaped));
  assert.equal(stripVTControlCharacters(escaped), escaped);
});

test('ANSI renderer adds only trusted SGR after escaping source', () => {
  const source = 'const value = "\x1b[2J"; // \u202e';
  const { tokens } = h.tokenize(source, { language: 'js', strict: true });
  const output = renderANSI(source, tokens);
  assert.ok(output.includes('\x1b[0;38;2;255;123;114m'));
  assert.ok(output.endsWith('\x1b[0m'));
  assert.equal(stripVTControlCharacters(output), escapeTerminalText(source));
  assert.equal(output.replace(/\x1b\[[0-9;]+m/g, ''), escapeTerminalText(source));
  assert.equal(renderANSI(source, tokens, dark, { colors: false }), escapeTerminalText(source));
});

test('split surrogate pairs use the following token style without empty SGR chunks', () => {
  const source = '😀';
  const theme = { ...dark, tokens: { keyword: { foreground: '#010203' }, string: { foreground: '#040506' } } };
  for (const firstKind of ['keyword', 'string']) {
    const tokens = Object.freeze([
      Object.freeze({ start: 0, end: 1, kind: firstKind, language: 'first' }),
      Object.freeze({ start: 1, end: 2, kind: 'string', language: 'second' }),
    ]);
    const output = renderANSI(source, tokens, theme);
    assert.equal(output, '\x1b[0;38;2;4;5;6m😀\x1b[0m');
    assert.equal(stripVTControlCharacters(Buffer.from(output, 'utf8').toString('utf8')), source);
    assert.equal(renderANSI(source, tokens, theme, { colors: false }), source);
  }
});

test('UTF-8 terminal output preserves text across every partition of boundary fixtures', () => {
  for (const source of ['😀', 'a😀b', '😀😎', 'a😀\r\n😎\x1b\u202eb', '\ud800x\udc00']) {
    const expected = Buffer.from(escapeTerminalText(source), 'utf8').toString('utf8');
    for (let cuts = 0; cuts < 2 ** (source.length - 1); cuts++) {
      const tokens = [];
      let start = 0;
      for (let end = 1; end <= source.length; end++) {
        if (end === source.length || (cuts & (1 << (end - 1)))) {
          tokens.push({ start, end, kind: tokens.length % 2 ? 'string' : 'keyword', language: 'test' });
          start = end;
        }
      }
      for (const colors of [false, true]) {
        const output = renderANSI(source, tokens, dark, { colors });
        assert.equal(stripVTControlCharacters(output), escapeTerminalText(source));
        assert.equal(stripVTControlCharacters(Buffer.from(output, 'utf8').toString('utf8')), expected);
      }
    }
  }
});

test('ANSI styling supports theme flags/fallback, rejects injection, and handles empty input', () => {
  const theme = { ...dark, tokens: { keyword: { foreground: '#010203', bold: true, italic: true, underline: true } } };
  const token = [{ start: 0, end: 1, kind: 'keyword', language: 'test' }];
  assert.equal(renderANSI('x', token, theme), '\x1b[0;1;3;4;38;2;1;2;3mx\x1b[0m');
  assert.equal(renderANSI('', [], theme), '');
  assert.throws(() => renderANSI('x', [], theme), /partition/);
  assert.throws(() => renderANSI('x', token, { ...theme, foreground: '\x1b[2J' }), /colors/);
  assert.equal(stripVTControlCharacters(renderANSI('plain', plainTokens('plain'), theme)), 'plain');
});
