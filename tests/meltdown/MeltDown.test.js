import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { parse } from '../../src/MeltDown.js';

const examples = [
  ['empty input', '', ''],
  ['blank input', ' \t\n\n', ''],
  ['heading', '# Hello', '<h1>Hello</h1>'],
  ['paragraph and bold', 'A **bold** paragraph.', '<p>A <strong>bold</strong> paragraph.</p>'],
  ['unordered list', '- Item\n* Two\n+ Three', '<ul><li>Item</li><li>Two</li><li>Three</li></ul>'],
  ['blockquote', '> Quote', '<blockquote><p>Quote</p></blockquote>'],
  ['inline code', '`inline code`', '<p><code>inline code</code></p>'],
  ['fenced code', '```\nescaped code\n```', '<pre><code>escaped code</code></pre>'],
  ['language class', '```javascript\nconst x = 1;\n```', '<pre><code class="language-javascript">const x = 1;</code></pre>'],
  ['link', '[Site](https://example.com)', '<p><a href="https://example.com">Site</a></p>'],
  ['image', '![Picture](./image.png)', '<p><img src="./image.png" alt="Picture"></p>'],
  ['emphasis', '*one* and _two_ and __three__', '<p><em>one</em> and <em>two</em> and <strong>three</strong></p>'],
  ['literal underscores', 'snake_case and some_other_word', '<p>snake_case and some_other_word</p>'],
  ['prose entities', '&copy; & < >', '<p>&copy; &amp; &lt; &gt;</p>'],
  ['raw HTML', '<script>alert("x")</script>', '<p>&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;</p>'],
  ['code isolation', '`**bold** [x](https://x.test) <b> &copy;`', '<p><code>**bold** [x](https://x.test) &lt;b&gt; &amp;copy;</code></p>'],
  ['fence isolation', '```\n**bold** <b> &copy;\n```', '<pre><code>**bold** &lt;b&gt; &amp;copy;</code></pre>'],
  ['paragraph boundaries', 'one\ntwo\n\nthree', '<p>one\ntwo</p>\n<p>three</p>'],
  ['adjacent blocks', 'before\n# Heading\n- item\n> quote\nafter', '<p>before</p>\n<h1>Heading</h1>\n<ul><li>item</li></ul>\n<blockquote><p>quote</p></blockquote>\n<p>after</p>'],
  ['quote paragraphs', '> one\n> two\n>\n> three', '<blockquote><p>one\ntwo</p>\n<p>three</p></blockquote>'],
  ['closing heading markers', '## Hello ##\n# C#', '<h2>Hello</h2>\n<h1>C#</h1>'],
  ['escaped punctuation', '\\*literal\\* and a\\|b', '<p>*literal* and a|b</p>'],
  ['unclosed fence', '```js\nhello', '<pre><code class="language-js">hello</code></pre>'],
  ['long fence', '````\n```\n````', '<pre><code>```</code></pre>'],
  ['tilde fence', '~~~\n<x>\n~~~', '<pre><code>&lt;x&gt;</code></pre>'],
  ['malformed fence opener', '```bad info\ntext', '<p>```bad info\ntext</p>'],
  ['ordered list and setext strike heading', '1. ordered\n~~strike~~\n---', '<ol><li>ordered</li></ol>\n<h2><del>strike</del></h2>'],
  ['nested blockquotes and headings', '> > nested\n> # heading', '<blockquote><blockquote><p>nested</p></blockquote>\n<h1>heading</h1></blockquote>'],
  ['nested list', '- parent\n  - child', '<ul><li>parent\n<ul><li>child</li></ul></li></ul>'],
  ['literal sentinel input', '\0C0\0 \0I0\0 \0B\0', '<p>\0C0\0 \0I0\0 \0B\0</p>'],
];

for (const [name, markdown, html] of examples) {
  test(name, () => assert.equal(parse(markdown), html));
}

test('rejects all non-string inputs', () => {
  for (const value of [undefined, null, 0, true, {}, [], new String('text'), Symbol('text'), () => 'text']) {
    assert.throws(() => parse(value), TypeError);
  }
});

test('normalizes LF, CRLF, and CR', () => {
  const source = '# Header\n\ntext\n\n```\na\nb\n```';
  for (const ending of ['\n', '\r\n', '\r']) {
    assert.equal(parse(source.replaceAll('\n', ending)), parse(source));
  }
});

test('all six heading levels', () => {
  for (let level = 1; level <= 6; level++) {
    assert.equal(parse('#'.repeat(level) + ' Hi'), `<h${level}>Hi</h${level}>`);
  }
  assert.equal(parse('####### Hi'), '<p>####### Hi</p>');
});

test('safe destinations for both links and images', () => {
  for (const url of ['https://example.com/a', 'https://example.com/a_(b)', 'HTTP://example.com', './a', '../a', '/a', 'a/b', '#part', '?q=x', './a:b']) {
    assert.equal(parse(`[x](${url})`), `<p><a href="${url}">x</a></p>`);
    assert.equal(parse(`![x](${url})`), `<p><img src="${url}" alt="x"></p>`);
  }
});

test('unsafe and unsupported destinations retain their original syntax', () => {
  for (const url of ['javascript:evil', 'JaVaScRiPt:evil', 'data:text/html,evil', 'vbscript:evil',
    'file:///etc/passwd', 'mailto:not-an-address', '//example.com', '\\\\example.com',
    '/\\example.com', 'java\tscript:evil', 'java\0script:evil', 'java&#x73;cript:evil',
    'javascript&#58;evil', 'https://', 'http:example.com', '', 'two words']) {
    const escaped = url.replaceAll('&', '&amp;');
    assert.equal(parse(`[x](${url})`), `<p>[x](${escaped})</p>`);
    assert.equal(parse(`![x](${url})`), `<p>![x](${escaped})</p>`);
  }
});

test('rejected links preserve formatting markers too', () => {
  assert.equal(parse('[**label**](javascript:evil)'), '<p>[**label**](javascript:evil)</p>');
  assert.equal(parse('[**label**](javascript:alert(1))'), '<p>[**label**](javascript:alert(1))</p>');
  assert.equal(parse('![*alt*](data:evil)'), '<p>![*alt*](data:evil)</p>');
});

test('attribute escaping and URL underscores are isolated from inline rules', () => {
  assert.equal(parse('[<x>](./a_b_c?q="x"&v=\'y\')'),
    '<p><a href="./a_b_c?q=&quot;x&quot;&amp;v=&#39;y&#39;">&lt;x&gt;</a></p>');
  assert.equal(parse('![" onerror="evil <tag> &](image.png)'),
    '<p><img src="image.png" alt="&quot; onerror=&quot;evil &lt;tag&gt; &amp;"></p>');
});

test('tables with inline formatting and optional outside pipes', () => {
  const expected = '<table><thead><tr><th>Name</th><th>Value</th></tr></thead>' +
    '<tbody><tr><td><strong>bold</strong></td><td><code>code</code></td></tr></tbody></table>';
  assert.equal(parse('| Name | Value |\n| --- | --- |\n| **bold** | `code` |'), expected);
  assert.equal(parse('Name | Value\n--- | ---\n**bold** | `code`'), expected);
});

test('table alignment uses fixed attribute values', () => {
  assert.equal(parse('| L | C | R |\n| :--- | :---: | ---: |\n| a | b | c |'),
    '<table><thead><tr><th style="text-align:left">L</th><th style="text-align:center">C</th>' +
    '<th style="text-align:right">R</th></tr></thead><tbody><tr><td style="text-align:left">a</td>' +
    '<td style="text-align:center">b</td><td style="text-align:right">c</td></tr></tbody></table>');
});

test('table cells escape HTML, allow escaped pipes, and pad missing cells', () => {
  assert.equal(parse('A | B\n--- | ---\nx\\|y | <b>\n| only |'),
    '<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody>' +
    '<tr><td>x|y</td><td>&lt;b&gt;</td></tr><tr><td>only</td><td></td></tr></tbody></table>');
});

test('malformed tables remain prose and extra cells are not discarded', () => {
  for (const source of ['a | b\n-- | ---', 'a | b\n--- | --- | ---', 'a | b\n--- nope | ---']) {
    assert.equal(parse(source), `<p>${source}</p>`);
  }
  assert.equal(parse('A | B\n--- | ---\na | b | c'),
    '<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody></tbody></table>\n<p>a | b | c</p>');
});

test('table can interrupt a paragraph and end before another block', () => {
  assert.equal(parse('intro\n| H |\n| --- |\n| x |\n# next'),
    '<p>intro</p>\n<table><thead><tr><th>H</th></tr></thead><tbody><tr><td>x</td></tr></tbody></table>\n<h1>next</h1>');
});

test('repeated calls have no parsing state', () => {
  const source = '# Hi\n\n**bold** [x](./x)';
  const expected = parse(source);
  for (let i = 0; i < 50; i++) {
    parse('```\nunclosed\n');
    parse('**unclosed');
    assert.equal(parse(source), expected);
  }
});

test('core has no browser-global side effects', () => {
  // Use a separate process so even the test does not mutate shared globals.
  execFileSync(process.execPath, ['--input-type=module', '-e', `
    import assert from 'node:assert/strict';
    globalThis.window = {};
    globalThis.fetch = () => { throw new Error('Unexpected network access'); };
    const { parse } = await import(${JSON.stringify(new URL('../../src/MeltDown.js', import.meta.url).href)});
    assert.deepEqual(window, {});
    assert.equal(parse('# Hi'), '<h1>Hi</h1>');
    parse('![image](https://example.com/image.png)');
  `]);
});

test('deterministic malformed-input smoke test', () => {
  const alphabet = ['#', '*', '_', '`', '~', '[', ']', '(', ')', '|', '>', '\\', '&', '<', '\n', ' ', 'a'];
  let seed = 12345;
  for (let sample = 0; sample < 300; sample++) {
    let source = '';
    for (let i = 0; i < 80; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      source += alphabet[seed % alphabet.length];
    }
    const html = parse(source);
    assert.equal(typeof html, 'string');
    assert.equal(parse(source), html);
    assert.ok(!html.includes('undefined'));
  }
});
