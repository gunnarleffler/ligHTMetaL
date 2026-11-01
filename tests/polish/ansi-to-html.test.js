import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ansiToHTML } from '../../src/polish/ansi-to-html.js';
import { renderANSI } from '../../src/polish/ansi.js';
import { createHighlighter } from '../../src/polish.js';
import javascript from '../../src/polish/languages/javascript.js';

const esc = '\x1b[';

test('ANSI to HTML converts basic/bright foreground and background, and resets', () => {
  const output = ansiToHTML(`${esc}31mred${esc}0m plain ${esc}104;97mbright${esc}39;49m end`);
  assert.match(output, /<span style="color:rgb\([\d, ]+\)">red<\/span> plain /);
  assert.match(output, /background-color:rgb\(/);
  assert.ok(output.endsWith('</span> end'));
  assert.equal(ansiToHTML(`${esc}31mred${esc}39mplain`), '<span style="color:rgb(187, 0, 0)">red</span>plain');
});

test('256 colors, truecolor, C1 CSI, and empty-parameter reset', () => {
  assert.equal(ansiToHTML(`${esc}38;5;196mred`), '<span style="color:rgb(255, 0, 0)">red</span>');
  assert.equal(ansiToHTML(`${esc}38;2;1;2;3;48;2;4;5;6mRGB`), '<span style="color:rgb(1, 2, 3);background-color:rgb(4, 5, 6)">RGB</span>');
  assert.equal(ansiToHTML('\x9b38;2;1;2;3mx\x9bmend'), '<span style="color:rgb(1, 2, 3)">x</span>end');
});

test('style enable/disable transitions do not mutate previously rendered chunks', () => {
  const output = ansiToHTML(`${esc}1;3;4;9mA${esc}22;23;24;29mB`);
  assert.equal(output, '<span style="font-weight:bold;font-style:italic;text-decoration:underline line-through">A</span>B');
  assert.equal(ansiToHTML(`${esc}2mdim${esc}22mplain`), '<span style="opacity:0.5">dim</span>plain');
  const inverse = ansiToHTML(`${esc}31;44;7mx${esc}27my`);
  assert.match(inverse, /color:rgb\(0, 0, 187\);background-color:rgb\(187, 0, 0\)/);
  assert.match(inverse, /color:rgb\(187, 0, 0\);background-color:rgb\(0, 0, 187\)/);
});

test('HTML-like text stays escaped; no links, blink, or concealed output is generated', () => {
  const text = '<img src=x onerror="alert(1)"> & \'quoted\'';
  const output = ansiToHTML(`${esc}31m${text}`);
  assert.ok(output.includes('&lt;img'));
  assert.ok(output.includes('&quot;alert(1)&quot;'));
  assert.ok(output.includes('&amp;'));
  assert.ok(!output.includes('<img'));
  assert.equal(ansiToHTML(`${esc}5;8mvisible`), 'visible');
});

test('cursor/OSC/malformed sequences are visibly escaped, never emulated', () => {
  const source = 'before\x1b[2Jafter\x1b]52;c;payload\x07\x1b[38:2:1:2:3mcolon\x1b[31';
  const output = ansiToHTML(source);
  assert.ok(output.includes('before\\x1b[2Jafter'));
  assert.ok(output.includes('\\x1b]52;c;payload\\x07'));
  assert.ok(output.includes('\\x1b[38:2:1:2:3mcolon\\x1b[31'));
  assert.ok(!/[\x00-\x08\x0b-\x1f\x7f-\x9f]/.test(output));
});

test('state is isolated, whitespace/Unicode preserved, and empty input handled', () => {
  ansiToHTML(`${esc}31mred`);
  assert.equal(ansiToHTML('plain'), 'plain');
  assert.equal(ansiToHTML('😀\t block █\r\n'), '😀\t block █\n');
  assert.equal(ansiToHTML(''), '');
  assert.equal(ansiToHTML(`${esc}31m${esc}0m`), '');
});

test('coalesced adjacent SGR tokens apply in order and invalid colors stay inert', () => {
  assert.equal(ansiToHTML(`${esc}1m${esc}38;2;1;2;3mx${esc}0m`), '<span style="color:rgb(1, 2, 3);font-weight:bold">x</span>');
  assert.equal(ansiToHTML(`${esc}38;2;999;0;0mx`), 'x');
  assert.equal(ansiToHTML(`${esc}38;5;999mx`), 'x');
  assert.equal(ansiToHTML(`${esc}38;2;1mx`), 'x');
});

test('poliSH terminal rendering can be converted back to escaped HTML', () => {
  const h = createHighlighter();
  h.register(javascript);
  const source = 'const name = "<lightmetal>";';
  const { tokens } = h.tokenize(source, { language: 'js', strict: true });
  const output = ansiToHTML(renderANSI(source, tokens));
  assert.ok(output.includes('color:rgb(255, 123, 114)'));
  assert.ok(output.includes('&lt;lightmetal&gt;'));
  assert.ok(!output.includes('\x1b'));
});
