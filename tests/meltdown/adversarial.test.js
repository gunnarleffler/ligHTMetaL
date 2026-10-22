import test from 'node:test';
import assert from 'node:assert/strict';
import { parse } from '../../src/MeltDown.js';

function assertBalanced(html) {
  const stack = [];
  const voids = new Set(['br', 'hr', 'img', 'input']);
  for (const match of html.matchAll(/<(\/?)([a-z][a-z\d]*)(?:\s[^<>]*)?>/g)) {
    const [, closing, name] = match;
    if (closing) assert.equal(stack.pop(), name, html);
    else if (!voids.has(name)) stack.push(name);
  }
  assert.deepEqual(stack, [], html);
}

test('mixed malformed syntax remains deterministic with balanced generated tags', () => {
  const pieces = ['# ', '*', '**', '***', '_', '__', '~~', ':"', '":', '`', '``', '[', ']', '(', ')',
    '![', '|', '> ', '\\', '\n', '\n\n', '  ', '- ', '1. ', '[x] ', '[id]: ', 'javascript:evil',
    '&copy;', '<script>', '" onerror="evil', 'a', 'b'];
  let seed = 987654321;
  for (let sample = 0; sample < 1000; sample++) {
    let source = '';
    for (let i = 0; i < 40; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      source += pieces[seed % pieces.length];
    }
    const html = parse(source);
    assert.equal(parse(source), html);
    assertBalanced(html);
    assert.ok(!html.includes('<script>'));
    assert.ok(!/<(?:a|img)\b[^>]*(?:href|src)="javascript:/i.test(html));
  }
});

test('entity and control-character URL disguises cannot create active destinations', () => {
  for (const url of ['javascript&#58;alert(1)', 'java&#x73;cript:evil', 'java\nscript:evil',
    'java\rscript:evil', 'java\tscript:evil', 'java\0script:evil', '&#106;avascript:evil',
    'javascript&colon;evil', '//host', '/\\host', '\\\\host']) {
    for (const prefix of ['[**x**]', '![**x**]']) {
      const html = parse(`${prefix}(${url})`);
      assert.ok(!/<(?:a|img)\b/.test(html), html);
      assertBalanced(html);
    }
  }
});

test('large unmatched runs are retained and do not overflow recursive rendering', () => {
  for (const source of ['*'.repeat(5000), '_'.repeat(5000), '`'.repeat(5000),
    '*'.repeat(2000) + '<x>' + '*'.repeat(2000)]) {
    const html = parse(source);
    assertBalanced(html);
    assert.ok(!html.includes('<x>'));
  }
});
