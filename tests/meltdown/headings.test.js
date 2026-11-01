import test from 'node:test';
import assert from 'node:assert/strict';
import { parse } from '../../src/MeltDown.js';

test('headings get readable IDs without formatting markers or destinations', () => {
  assert.equal(parse('# **Hello** [`world`](https://example.com)!'),
    '<h1 id="hello-world"><strong>Hello</strong> <a href="https://example.com"><code>world</code></a>!</h1>');
  assert.equal(parse('Café 日本語\n==='), '<h1 id="café-日本語">Café 日本語</h1>');
});

test('heading IDs remain unique across levels and containers, and reset per parse', () => {
  assert.equal(parse('# One\n## One\n> # One\n# One-1'),
    '<h1 id="one">One</h1>\n<h2 id="one-1">One</h2>\n<blockquote><h1 id="one-2">One</h1></blockquote>\n<h1 id="one-1-1">One-1</h1>');
  assert.equal(parse('# One'), '<h1 id="one">One</h1>');
});

test('literal angle brackets remain heading text rather than becoming HTML', () => {
  assert.equal(parse('# `<tag>`'), '<h1 id="tag"><code>&lt;tag&gt;</code></h1>');
  assert.equal(parse('# <tag>'), '<h1 id="tag">&lt;tag&gt;</h1>');
  assert.equal(parse('# `<tag>`', { html: 'allow' }), '<h1 id="tag"><code>&lt;tag&gt;</code></h1>');
  assert.equal(parse('# <span title="a > b">Hello</span>', { html: 'allow' }),
    '<h1 id="hello"><span title="a > b">Hello</span></h1>');
});

test('prose character references use decoded text, while code remains literal', () => {
  for (const text of ['Café', 'Caf&#233;', 'Caf&#xE9;']) {
    assert.equal(parse('# ' + text), `<h1 id="café">${text}</h1>`);
  }
  assert.equal(parse('# Fish &amp; Chips'), '<h1 id="fish--chips">Fish &amp; Chips</h1>');
  assert.equal(parse('# A&nbsp;B'), '<h1 id="a-b">A&nbsp;B</h1>');
  assert.equal(parse('# `&eacute;`'), '<h1 id="eacute"><code>&amp;eacute;</code></h1>');
  assert.equal(parse('# &amp;eacute;'), '<h1 id="eacute">&amp;eacute;</h1>');
  assert.equal(parse('# Caf&eacute;'), '<h1 id="caf">Caf&eacute;</h1>');
  assert.equal(parse('# &unknown;'), '<h1 id="section">&unknown;</h1>');
  assert.equal(parse('# &#0; &#xD800; &#99999999;'), '<h1 id="--">&#0; &#xD800; &#99999999;</h1>');
  assert.equal(parse('# &#x8A;'), '<h1 id="š">&#x8A;</h1>');
});

test('heading suffixes skip collisions with naturally numbered titles', () => {
  assert.equal(parse('# Name\n# Name-1\n# Name\n# Name-2\n# Name'),
    '<h1 id="name">Name</h1>\n<h1 id="name-1">Name-1</h1>\n<h1 id="name-2">Name</h1>\n<h1 id="name-2-1">Name-2</h1>\n<h1 id="name-3">Name</h1>');
  const output = parse(Array(4000).fill('# Same').join('\n'));
  assert.equal([...output.matchAll(/id="([^"]*)"/g)].length, 4000);
  assert.ok(output.endsWith('<h1 id="same-3999">Same</h1>'));
});

test('punctuation-only headings and raw inline HTML have stable IDs', () => {
  assert.equal(parse('# !!!\n# !!!'), '<h1 id="section">!!!</h1>\n<h1 id="section-1">!!!</h1>');
  assert.equal(parse('# <em>Hello</em>', { html: 'allow' }), '<h1 id="hello"><em>Hello</em></h1>');
});
