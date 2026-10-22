import test from 'node:test';
import assert from 'node:assert/strict';
import { parse } from '../../src/MeltDown.js';

const allow = Object.freeze({ html: 'allow' });
const cases = [
  ['inline HTML opt-in', 'Hello <em>there</em>.', '<p>Hello <em>there</em>.</p>'],
  ['HTML attributes are opaque to Markdown', 'A <span title="a > **b**">*c*</span>.', '<p>A <span title="a > **b**"><em>c</em></span>.</p>'],
  ['raw block content is not Markdown', '<div>\n**literal**\n# not a heading\n</div>', '<div>\n**literal**\n# not a heading\n</div>'],
  ['blank line ends a structural HTML block', '<div>\ntext\n</div>\n\n**after**', '<div>\ntext\n</div>\n<p><strong>after</strong></p>'],
  ['structural HTML blocks run until a blank line', '<div>x</div>\n**still raw**', '<div>x</div>\n**still raw**'],
  ['HTML block interrupts a paragraph', 'before\n<div>x</div>', '<p>before</p>\n<div>x</div>'],
  ['standalone custom tag starts a block', '<my-widget value="x">\n**literal**\n</my-widget>', '<my-widget value="x">\n**literal**\n</my-widget>'],
  ['standalone inline tags do not interrupt prose', 'before\n<span>\n**after**', '<p>before\n<span>\n<strong>after</strong></p>'],
  ['details block', '<details>\n<summary>More</summary>\n<p>Details</p>\n</details>', '<details>\n<summary>More</summary>\n<p>Details</p>\n</details>'],
  ['script body remains literal', '<script>\nconst x = "**literal**";\n\n</script>\n# After', '<script>\nconst x = "**literal**";\n\n</script>\n<h1>After</h1>'],
  ['style body remains literal', '<style>\np { color: red; }\n</style>\ntext', '<style>\np { color: red; }\n</style>\n<p>text</p>'],
  ['pre body remains literal', '<pre>\n# literal\n\n</pre>\ntext', '<pre>\n# literal\n\n</pre>\n<p>text</p>'],
  ['textarea body remains literal', '<textarea>**literal**</textarea>\ntext', '<textarea>**literal**</textarea>\n<p>text</p>'],
  ['raw-text closing tag is case insensitive', '<SCRIPT>x</SCRIPT>\ntext', '<SCRIPT>x</SCRIPT>\n<p>text</p>'],
  ['inline comment', 'a <!-- **literal** --> b', '<p>a <!-- **literal** --> b</p>'],
  ['HTML comments skip definitions', '<!--\n[id]: ./hidden\n\n-->\n[id]', '<!--\n[id]: ./hidden\n\n-->\n<p>[id]</p>'],
  ['HTML blocks skip definitions', '<div>\n[id]: ./hidden\n</div>\n\n[id]', '<div>\n[id]: ./hidden\n</div>\n<p>[id]</p>'],
  ['processing instruction', '<?target\n**literal**?>\ntext', '<?target\n**literal**?>\n<p>text</p>'],
  ['CDATA block', '<![CDATA[\n**literal**\n]]>\ntext', '<![CDATA[\n**literal**\n]]>\n<p>text</p>'],
  ['declaration', '<!DOCTYPE html>\ntext', '<!DOCTYPE html>\n<p>text</p>'],
  ['unclosed HTML comment consumes remaining lines', '<!--\n# literal\n\ntext', '<!--\n# literal\n\ntext'],
  ['unclosed raw-text block consumes remaining lines', '<script>\n**literal**', '<script>\n**literal**'],
  ['code spans remain escaped with HTML allowed', '`<b>x</b>`', '<p><code>&lt;b&gt;x&lt;/b&gt;</code></p>'],
  ['fenced code remains escaped with HTML allowed', '```\n<div>\n```', '<pre><code>&lt;div&gt;</code></pre>'],
  ['indented code remains escaped with HTML allowed', '    <b>x</b>', '<pre><code>&lt;b&gt;x&lt;/b&gt;</code></pre>'],
  ['escaped angle brackets do not activate HTML', '\\<b>x\\</b>', '<p>&lt;b&gt;x&lt;/b&gt;</p>'],
  ['HTML inside a quote', '> <div>\n> **literal**\n> </div>', '<blockquote><div>\n**literal**\n</div></blockquote>'],
  ['HTML inside a list', '- <div>\n  **literal**\n  </div>', '<ul><li><div>\n**literal**\n</div></li></ul>'],
  ['quoted bracket inside a link label tag', '[<span title="]">x</span>](./page)', '<p><a href="./page"><span title="]">x</span></a></p>'],
  ['unsafe Markdown stays literal with HTML enabled', '[**x**](javascript:evil)', '<p>[**x**](javascript:evil)</p>'],
  ['HTML allow mode is not a sanitizer', '<img src=x onerror="alert(1)">', '<img src=x onerror="alert(1)">'],
  ['raw HTML URLs bypass Markdown destination policy', 'Raw <a href="javascript:evil">x</a>', '<p>Raw <a href="javascript:evil">x</a></p>'],
  ['raw entities and attributes pass through unchanged', 'A <span title="&copy;">&copy;</span>', '<p>A <span title="&copy;">&copy;</span></p>'],
];
for (const [name, source, expected] of cases) {
  test(name, () => assert.equal(parse(source, allow), expected));
}

test('HTML escaping is the default and is selectable explicitly', () => {
  const source = '<div>\n<img src=x onerror="evil">\n</div>';
  const expected = '<p>&lt;div&gt;\n&lt;img src=x onerror=&quot;evil&quot;&gt;\n&lt;/div&gt;</p>';
  for (const options of [undefined, {}, { html: 'escape' }, { html: undefined }]) {
    assert.equal(parse(source, options), expected);
  }
  assert.equal(parse('<span title="**x**">', { html: 'escape' }), '<p>&lt;span title=&quot;**x**&quot;&gt;</p>');
});

test('invalid options and HTML policies throw TypeError', () => {
  for (const options of [null, true, 'allow', 1, [], () => {}, { html: null }, { html: true }, { html: 'sanitize' }, { html: 'ALLOW' }]) {
    assert.throws(() => parse('text', options), TypeError);
  }
});

test('HTML mode and definitions are local to one parse call', () => {
  assert.equal(parse('<div>x</div>', allow), '<div>x</div>');
  assert.equal(parse('<div>x</div>'), '<p>&lt;div&gt;x&lt;/div&gt;</p>');
  parse('[id]: ./page', allow);
  assert.equal(parse('[id]', allow), '<p>[id]</p>');
  assert.deepEqual(allow, { html: 'allow' });
});

test('HTML attribute pipes do not split table cells', () => {
  const source = 'A | B\n--- | ---\n<span title="a|b">x</span> | y';
  assert.equal(parse(source, allow), '<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody>' +
    '<tr><td><span title="a|b">x</span></td><td>y</td></tr></tbody></table>');
});

test('HTML in image alt text is still attribute-escaped', () => {
  assert.equal(parse('![<b title="x">alt</b>](./img)', allow),
    '<p><img src="./img" alt="&lt;b title=&quot;x&quot;&gt;alt&lt;/b&gt;"></p>');
});

test('malformed inline HTML remains readable instead of being guessed', () => {
  for (const source of ['a <b title="unterminated>', 'a <1tag>', 'a <b =oops>', 'a <b']) {
    const html = parse(source, allow);
    assert.ok(html.includes('&lt;'), html);
  }
});

test('HTML newline handling follows the parse contract', () => {
  const source = '<div>\ntext\n</div>\n\n# After';
  for (const newline of ['\n', '\r\n', '\r']) assert.equal(parse(source.replaceAll('\n', newline), allow), parse(source, allow));
});

test('HTTP(S) angle autolinks are enabled in both HTML modes', () => {
  for (const options of [{ html: 'escape' }, allow]) {
    assert.equal(parse('See <https://example.com/a_b*c?q=1&x=2>.', options),
      '<p>See <a href="https://example.com/a_b*c?q=1&amp;x=2">https://example.com/a_b*c?q=1&amp;x=2</a>.</p>');
    assert.equal(parse('<HTTP://example.com>', options), '<p><a href="HTTP://example.com">HTTP://example.com</a></p>');
    assert.equal(parse('<https://example.com/"x">', options),
      '<p><a href="https://example.com/&quot;x&quot;">https://example.com/&quot;x&quot;</a></p>');
  }
});

test('unsafe and unsupported angle destinations remain escaped in both HTML modes', () => {
  for (const options of [{ html: 'escape' }, allow]) {
    for (const value of ['javascript:evil', 'data:text/html,evil', 'file:///tmp/x', 'https://', 'javascript:&#x61;lert(1)', 'tel:not-a-number', 'mailto:not-an-address']) {
      const source = `<${value}>`;
      const expected = source.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
      assert.equal(parse(source, options), `<p>${expected}</p>`);
    }
  }
});

test('malformed scheme spellings stay prose, with their angle brackets escaped', () => {
  for (const options of [{ html: 'escape' }, allow]) {
    assert.equal(parse('<java&#x73;cript:evil>', options), '<p>&lt;java&#x73;cript:evil&gt;</p>');
    assert.equal(parse('<javascript&#58;evil>', options), '<p>&lt;javascript&#58;evil&gt;</p>');
  }
});

test('autolinks do not activate in code, escapes, or Markdown link labels', () => {
  assert.equal(parse('`<https://example.com>`', allow), '<p><code>&lt;https://example.com&gt;</code></p>');
  assert.equal(parse('\\<https://example.com>', allow), '<p>&lt;https://example.com&gt;</p>');
  assert.equal(parse('[<https://example.com>](./outer)', allow),
    '<p><a href="./outer">&lt;https://example.com&gt;</a></p>');
  assert.equal(parse('https://example.com +15551234567 user@example.com'),
    '<p>https://example.com +15551234567 user@example.com</p>');
});

test('autolinks work in headings, lists, quotes, and tables', () => {
  const link = '<a href="https://example.com">https://example.com</a>';
  assert.equal(parse('# <https://example.com>'), `<h1>${link}</h1>`);
  assert.equal(parse('- <https://example.com>'), `<ul><li>${link}</li></ul>`);
  assert.equal(parse('> <https://example.com>'), `<blockquote><p>${link}</p></blockquote>`);
  assert.equal(parse('| Link |\n| --- |\n| <https://example.com/a|b> |'),
    '<table><thead><tr><th>Link</th></tr></thead><tbody><tr><td>' +
    '<a href="https://example.com/a|b">https://example.com/a|b</a></td></tr></tbody></table>');
});

test('telephone links support explicit numbers and numeric extensions', () => {
  for (const url of ['tel:+15551234567', 'TEL:555-1234', 'tel:+1(555)123.4567;ext=42']) {
    assert.equal(parse(`[Call](${url})`), `<p><a href="${url}">Call</a></p>`);
    assert.equal(parse(`<${url}>`), `<p><a href="${url}">${url}</a></p>`);
    assert.equal(parse(`[Call][phone]\n\n[phone]: ${url}`), `<p><a href="${url}">Call</a></p>`);
  }
});

test('mailto links support recipients and encoded query parameters', () => {
  for (const url of ['mailto:user@example.com', 'MAILTO:first@example.com,second@example.org',
    'mailto:user+tag@example.com?subject=Hello%20there&body=Hi']) {
    const escaped = url.replaceAll('&', '&amp;');
    assert.equal(parse(`[Email](${url})`), `<p><a href="${escaped}">Email</a></p>`);
    assert.equal(parse(`<${url}>`), `<p><a href="${escaped}">${escaped}</a></p>`);
    assert.equal(parse(`[Email][mail]\n\n[mail]: ${url}`), `<p><a href="${escaped}">Email</a></p>`);
  }
});

test('email angle autolinks add mailto without changing the visible address', () => {
  const addresses = [
    ['user+tag@example.com', 'user+tag@example.com'],
    ['div/user@example.com', 'div/user@example.com'],
    ['user?tag@example.com', 'user%3Ftag@example.com'],
    ['user#tag@example.com', 'user%23tag@example.com'],
    ['user%tag@example.com', 'user%25tag@example.com'],
  ];
  for (const options of [{ html: 'escape' }, allow]) {
    for (const [address, encoded] of addresses) {
      assert.equal(parse(`<${address}>`, options), `<p><a href="mailto:${encoded}">${address}</a></p>`);
    }
  }
});

test('tel and mailto are rejected for both direct and reference images', () => {
  for (const options of [{ html: 'escape' }, allow]) {
    for (const url of ['tel:+15551234567', 'mailto:user@example.com']) {
      assert.equal(parse(`![**alt**](${url})`, options), `<p>![**alt**](${url})</p>`);
      assert.equal(parse(`![**alt**][id]\n\n[id]: ${url}`, options), '<p>![**alt**][id]</p>');
    }
  }
});

test('malformed phone and email destinations remain literal', () => {
  for (const url of ['tel:', 'tel:()', 'tel:+', 'tel:+1 555', 'tel:+12;ext=abc', 'tel:*123#',
    'mailto:', 'mailto:not-an-address', 'mailto:user@', 'mailto:a@example.com,', 'mailto:a@example.com b@example.com']) {
    assert.equal(parse(`[x](${url})`), `<p>[x](${url})</p>`);
  }
});
