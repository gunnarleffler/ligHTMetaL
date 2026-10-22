import test from 'node:test';
import assert from 'node:assert/strict';
import { parse } from '../../src/MeltDown.js';

const cases = [
  ['ordered list start', '3. three\n4. four', '<ol start="3"><li>three</li><li>four</li></ol>'],
  ['ordered closing-paren markers', '1) one\n2) two', '<ol><li>one</li><li>two</li></ol>'],
  ['list type changes', '- a\n1. b\n- c', '<ul><li>a</li></ul>\n<ol><li>b</li></ol>\n<ul><li>c</li></ul>'],
  ['mixed nested lists', '- parent\n  3. child\n     - grandchild\n  4. child2\n- sibling', '<ul><li>parent\n<ol start="3"><li>child\n<ul><li>grandchild</li></ul></li><li>child2</li></ol></li><li>sibling</li></ul>'],
  ['list continuation', '- first\n  continued\n- second', '<ul><li>first\ncontinued</li><li>second</li></ul>'],
  ['loose list', '- a\n\n- b', '<ul><li><p>a</p></li><li><p>b</p></li></ul>'],
  ['multi-paragraph item', '- a\n\n  second\n\n- b', '<ul><li><p>a</p>\n<p>second</p></li><li><p>b</p></li></ul>'],
  ['task items', '- [x] done\n- [ ] todo\n- [X] **yes**', '<ul><li><input type="checkbox" disabled checked> done</li><li><input type="checkbox" disabled> todo</li><li><input type="checkbox" disabled checked> <strong>yes</strong></li></ul>'],
  ['ordered tasks', '2. [ ] todo', '<ol start="2"><li><input type="checkbox" disabled> todo</li></ol>'],
  ['empty task', '- [ ]', '<ul><li><input type="checkbox" disabled></li></ul>'],
  ['fenced code in list', '- a\n  ```js\n  <b>\n  ```', '<ul><li>a\n<pre><code class="language-js">&lt;b&gt;</code></pre></li></ul>'],
  ['quote in list', '- a\n  > quoted', '<ul><li>a\n<blockquote><p>quoted</p></blockquote></li></ul>'],
  ['list in quote', '> - a\n>   1. b', '<blockquote><ul><li>a\n<ol><li>b</li></ol></li></ul></blockquote>'],
  ['quote code isolation', '> ```\n> > not a quote\n> ```', '<blockquote><pre><code>&gt; not a quote</code></pre></blockquote>'],
  ['indented heading', '   ## title', '<h2>title</h2>'],
  ['indented unordered list', '  - a\n  - b', '<ul><li>a</li><li>b</li></ul>'],
  ['setext headings', 'Title\n===\n\nSubtitle\n---', '<h1>Title</h1>\n<h2>Subtitle</h2>'],
  ['setext with inline markup', '**Title**\n===', '<h1><strong>Title</strong></h1>'],
  ['table versus setext precedence', 'a | b\n---', '<h2>a | b</h2>'],
  ['horizontal rules', '---\n***\n_ _ _\n- - -', '<hr>\n<hr>\n<hr>\n<hr>'],
  ['indented code', '    <tag>\n    **literal**\n\n    &copy;', '<pre><code>&lt;tag&gt;\n**literal**\n\n&amp;copy;</code></pre>'],
  ['tab-indented code', '\tconst x = 1;\n\t\treturn x;', '<pre><code>const x = 1;\n\treturn x;</code></pre>'],
  ['indented code does not interrupt paragraph', 'a\n    b', '<p>a\n    b</p>'],
  ['indented fence outdents content', '  ```js\n  const x = 1;\n  ```', '<pre><code class="language-js">const x = 1;</code></pre>'],
  ['hard breaks by spaces', 'one  \ntwo', '<p>one<br>\ntwo</p>'],
  ['hard breaks by backslash', 'one\\\ntwo', '<p>one<br>\ntwo</p>'],
  ['escaped backslash is not a break', 'one\\\\\ntwo', '<p>one\\\ntwo</p>'],
  ['hard break in list continuation', '- one  \n  two', '<ul><li>one<br>\ntwo</li></ul>'],
  ['nested bold and italic', '**bold *italic* text**', '<p><strong>bold <em>italic</em> text</strong></p>'],
  ['nested italic and bold', '*italic **bold** text*', '<p><em>italic <strong>bold</strong> text</em></p>'],
  ['triple emphasis', '***both***', '<p><em><strong>both</strong></em></p>'],
  ['adjacent closing delimiters', '**bold *italic***', '<p><strong>bold <em>italic</em></strong></p>'],
  ['nested strike', '~~**gone**~~', '<p><del><strong>gone</strong></del></p>'],
  ['strike contains code', '~~`literal *`~~', '<p><del><code>literal *</code></del></p>'],
  ['unmatched delimiters', '**open and _open', '<p>**open and _open</p>'],
  ['crossed markers stay balanced', '*a _b* c_', '<p><em>a _b</em> c_</p>'],
  ['escaped closing marker', '*a\\*b*', '<p><em>a*b</em></p>'],
  ['custom inline quotation', ':"a **quote**":', '<p><q>a <strong>quote</strong></q></p>'],
  ['unmatched quotation', ':"open', '<p>:&quot;open</p>'],
  ['multi-backtick code', '``a ` b``', '<p><code>a ` b</code></p>'],
  ['unmatched backtick run', '``a`', '<p>``a`</p>'],
  ['code-span spaces', '`` `x` `` and `  `', '<p><code>`x`</code> and <code>  </code></p>'],
  ['code-span soft newline', '`a\nb`', '<p><code>a b</code></p>'],
  ['prose entities versus code', '&copy; &#169; &#xA9; `&copy;`', '<p>&copy; &#169; &#xA9; <code>&amp;copy;</code></p>'],
  ['entity-encoded markup stays text', '&lt;script&gt; &quot; &#x3c;img&#x3e;', '<p>&lt;script&gt; &quot; &#x3c;img&#x3e;</p>'],
  ['formatted link label and title', '[**a** and `b`](./a "title")', '<p><a href="./a" title="title"><strong>a</strong> and <code>b</code></a></p>'],
  ['single-quoted link title', "[a](./a 'title')", '<p><a href="./a" title="title">a</a></p>'],
  ['angle destination', '[a](<./path> "title")', '<p><a href="./path" title="title">a</a></p>'],
  ['deeply balanced URL', '[a](./a(b(c)))', '<p><a href="./a(b(c))">a</a></p>'],
  ['escaped URL parentheses', '[a](./a\\(b\\))', '<p><a href="./a(b)">a</a></p>'],
  ['link inside emphasis', '**[x](./x)**', '<p><strong><a href="./x">x</a></strong></p>'],
  ['code isolates links', '`[x](./x)`', '<p><code>[x](./x)</code></p>'],
  ['image in link', '[![alt](./img)](./page)', '<p><a href="./page"><img src="./img" alt="alt"></a></p>'],
  ['nested anchors are not generated', '[outer [inner](./in)](./out)', '<p><a href="./out">outer [inner](./in)</a></p>'],
  ['plain-text formatted image alt', '![**alt** and `code`](./img)', '<p><img src="./img" alt="alt and code"></p>'],
  ['sized image with title', '![alt](img.png =120x80 "a title")', '<p><img src="img.png" alt="alt" title="a title" style="width:120px;height:80px"></p>'],
  ['forward reference', '[forward][ID]\n\n[id]: ./x "t"', '<p><a href="./x" title="t">forward</a></p>'],
  ['collapsed and shortcut references', '[name][] and [name]\n\n[name]: ./page', '<p><a href="./page">name</a> and <a href="./page">name</a></p>'],
  ['reference whitespace normalization', '[label][ a  B ]\n\n[A B]: ./page', '<p><a href="./page">label</a></p>'],
  ['reference image', '![alt][img]\n\n[img]: ./img "title"', '<p><img src="./img" alt="alt" title="title"></p>'],
  ['missing reference stays readable', '[**label**][missing]', '<p>[**label**][missing]</p>'],
  ['first reference wins', '[id]\n\n[id]: ./first\n[id]: ./second', '<p><a href="./first">id</a></p>'],
  ['reference shared into nested blocks', '> [id]\n\n[id]: ./page', '<blockquote><p><a href="./page">id</a></p></blockquote>'],
  ['reference defined inside quote', '[id]\n\n> [id]: ./page', '<p><a href="./page">id</a></p>\n<blockquote></blockquote>'],
  ['reference-looking fenced code is not collected', '[id]\n\n```\n[id]: ./page\n```', '<p>[id]</p>\n<pre><code>[id]: ./page</code></pre>'],
  ['reference-looking indented code is not collected', '[id]\n\n    [id]: ./page', '<p>[id]</p>\n<pre><code>[id]: ./page</code></pre>'],
];
for (const [name, markdown, html] of cases) test(name, () => assert.equal(parse(markdown), html));

test('link-label scanning preserves matched and unmatched backtick runs', () => {
  assert.equal(parse('[``a ] b``](./page)'),
    '<p><a href="./page"><code>a ] b</code></a></p>');
  assert.equal(parse('[a `` b](./page)'),
    '<p><a href="./page">a `` b</a></p>');
});

test('quote recognition preserves empty, indented, tabbed, and nested quotes', () => {
  for (const source of ['>', '   >', '>\t']) {
    assert.equal(parse(source), '<blockquote></blockquote>');
  }
  assert.equal(parse('   >\touter\n   > > inner'),
    '<blockquote><p>outer</p>\n<blockquote><p>inner</p></blockquote></blockquote>');
  assert.equal(parse('    > literal'), '<pre><code>&gt; literal</code></pre>');
});

test('image dimensions accept only validated numeric forms', () => {
  for (const [size, style] of [['120', 'width:120px'], ['120x', 'width:120px'], ['x80', 'height:80px'],
    ['60%', 'width:60%'], ['60%x80%', 'width:60%;height:80%']]) {
    assert.equal(parse(`![x](img =${size})`), `<p><img src="img" alt="x" style="${style}"></p>`);
  }
  for (const size of ['x', '-1', '10em', '10;position:fixed', '10x20x30', 'calc(1)', '10%foo']) {
    const html = parse(`![x](img =${size})`);
    assert.ok(!html.includes('<img'), html);
    assert.ok(html.includes(size), html);
  }
  assert.equal(parse('[x](./page =20)'), '<p>[x](./page =20)</p>');
});

test('image titles and dimensions work in either order', () => {
  assert.equal(parse('![x](./img "title" =20x30)'),
    '<p><img src="./img" alt="x" title="title" style="width:20px;height:30px"></p>');
});

test('all new attribute paths escape quotes and ampersands', () => {
  assert.equal(parse('[x](./page "a \\"quoted\\" <b> &copy;")'),
    '<p><a href="./page" title="a &quot;quoted&quot; &lt;b&gt; &amp;copy;">x</a></p>');
  assert.equal(parse('![`" onerror="evil`](./img)'),
    '<p><img src="./img" alt="&quot; onerror=&quot;evil"></p>');
  assert.equal(parse('[x][id]\n\n[id]: ./a?x=1&y=2 \'" onmouseover="evil\''),
    '<p><a href="./a?x=1&amp;y=2" title="&quot; onmouseover=&quot;evil">x</a></p>');
});

test('unsafe destinations remain literal across nested/new syntax', () => {
  for (const url of ['javascript:alert(1)', 'javascript:alert((1))', 'javascript\\:evil', 'data:text/html,evil']) {
    assert.equal(parse(`[**x**](${url} "title")`), `<p>[**x**](${url} &quot;title&quot;)</p>`);
    assert.equal(parse(`![*x*](${url} =20)`), `<p>![*x*](${url} =20)</p>`);
  }
  assert.equal(parse('[**x**][bad]\n\n[bad]: javascript:evil'),
    '<p>[**x**][bad]</p>\n<p>[bad]: javascript:evil</p>');
});

test('reference maps are per call and prototype-safe', () => {
  assert.equal(parse('[__proto__]\n\n[__proto__]: ./safe'), '<p><a href="./safe"><strong>proto</strong></a></p>');
  assert.equal(parse('[__proto__]'), '<p>[__proto__]</p>');
  assert.equal(parse('[constructor]'), '<p>[constructor]</p>');
});

test('table splitter respects code and link boundaries', () => {
  assert.equal(parse('A | B\n--- | ---\n`a|b` | [x](./a|b)'),
    '<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody>' +
    '<tr><td><code>a|b</code></td><td><a href="./a|b">x</a></td></tr></tbody></table>');
  assert.equal(parse('`a|b`\n---'), '<h2><code>a|b</code></h2>');
});

test('table rows stop before block openers containing pipes', () => {
  assert.equal(parse('A | B\n--- | ---\n# next | heading'),
    '<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody></tbody></table>\n<h1>next | heading</h1>');
});

test('table inside a quote and inline references inside cells', () => {
  assert.equal(parse('> A | B\n> --- | ---\n> ~~old~~ | [id]\n\n[id]: ./page'),
    '<blockquote><table><thead><tr><th>A</th><th>B</th></tr></thead><tbody>' +
    '<tr><td><del>old</del></td><td><a href="./page">id</a></td></tr></tbody></table></blockquote>');
});

test('malformed syntax does not produce unbalanced generated anchors', () => {
  for (const source of ['[', ']', '[x](', '[x](./a', '![x](./a "unterminated)', '[x][', '[**x**](./a extra)']) {
    const html = parse(source);
    assert.equal((html.match(/<a /g) || []).length, (html.match(/<\/a>/g) || []).length);
    assert.ok(!html.includes('undefined'));
  }
});

test('bounded nesting preserves deep input without a call-stack error', () => {
  const quotes = '> '.repeat(1000) + 'deep';
  const quoteHTML = parse(quotes);
  assert.ok(quoteHTML.includes('deep'));
  assert.ok(quoteHTML.includes('&gt;'));
  const emphasis = '*'.repeat(1000) + 'deep' + '*'.repeat(1000);
  const emphasisHTML = parse(emphasis);
  assert.ok(emphasisHTML.includes('deep'));
  assert.ok(emphasisHTML.includes('*'));
  assert.equal(parse(emphasis), emphasisHTML);
});

test('emphasis and image labels share the nesting budget', () => {
  let source = 'leaf <tag> " &copy;';
  const emphasis = '*'.repeat(120);
  for (let i = 0; i < 64; i++) source = emphasis + '![' + source + '](./img)' + emphasis;
  const html = parse(source);
  assert.ok(html.includes('leaf &lt;tag&gt; &quot; &amp;copy;'));
  assert.ok(html.includes('!['), 'over-depth label syntax is retained');
  assert.ok(!html.includes('<tag>'));
  assert.equal((html.match(/<strong>/g) || []).length, (html.match(/<\/strong>/g) || []).length);
  assert.equal((html.match(/<img /g) || []).length, 1);
  assert.equal(parse(source), html);
});

test('label parsing respects the emphasis depth at and around the cutoff', () => {
  for (const depth of [62, 63, 64, 65]) {
    const marker = '**'.repeat(depth);
    const rendered = Math.min(depth, 64);
    const remaining = '**'.repeat(depth - rendered);
    const label = depth < 63 ? '<strong>x</strong>' : '**x**';
    assert.equal(parse(marker + '[**x**](./page)' + marker),
      '<p>' + '<strong>'.repeat(rendered) + remaining + `<a href="./page">${label}</a>` +
      remaining + '</strong>'.repeat(rendered) + '</p>');
  }
});

test('depth fallback preserves code and simple link/image rendering', () => {
  const marker = '*'.repeat(130);
  assert.equal(parse(marker + '`x` [y](./z) ![" &copy;](./img)' + marker),
    '<p>' + '<strong>'.repeat(64) + '**<code>x</code> <a href="./z">y</a> ' +
    '<img src="./img" alt="&quot; &amp;copy;">**' + '</strong>'.repeat(64) + '</p>');
});

test('unsafe syntax remains literal at the depth cutoff', () => {
  const marker = '*'.repeat(130);
  assert.equal(parse(marker + '[**x**](javascript:evil)' + marker),
    '<p>' + '<strong>'.repeat(64) + '**[**x**](javascript:evil)**' + '</strong>'.repeat(64) + '</p>');
});

test('fenced code in lists preserves every collected blank line', () => {
  for (const count of [1, 2, 4]) {
    const gap = '\n'.repeat(count + 1);
    assert.equal(parse('- ```\n  a' + gap + '  b\n  ```'),
      '<ul><li><pre><code>a' + gap + 'b</code></pre></li></ul>');
  }
});

test('fenced code in lists only outdents whitespace-only lines', () => {
  for (const [source, expected] of [['      ', '    '], ['\t\t', '  \t'], [' ', '']]) {
    assert.equal(parse('- ```\n  a\n' + source + '\n  b\n  ```'),
      '<ul><li><pre><code>a\n' + expected + '\nb</code></pre></li></ul>');
  }
});

test('indented code in lists preserves blank lines and remaining indentation', () => {
  assert.equal(parse('- item\n\n      a\n\n\n      b'),
    '<ul><li><p>item</p>\n<pre><code>a\n\n\nb</code></pre></li></ul>');
  assert.equal(parse('- item\n\n      a\n        \n      b'),
    '<ul><li><p>item</p>\n<pre><code>a\n  \nb</code></pre></li></ul>');
});

test('nested lists preserve collected code whitespace at both levels', () => {
  assert.equal(parse('- parent\n  - ```\n    a\n\n\n    b\n    ```'),
    '<ul><li><p>parent</p>\n<ul><li><pre><code>a\n\n\nb</code></pre></li></ul></li></ul>');
});

test('multiple blank lines retain existing list boundaries and loose paragraphs', () => {
  assert.equal(parse('- a\n\n\n- b'), '<ul><li><p>a</p></li><li><p>b</p></li></ul>');
  assert.equal(parse('- a\n\n\noutside'), '<ul><li>a</li></ul>\n<p>outside</p>');
  assert.equal(parse('- a\n\n\n  b'), '<ul><li><p>a</p>\n<p>b</p></li></ul>');
});

test('table token scanning preserves code, links, unresolved references, and escapes', () => {
  const header = '<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody>';
  const rows = [
    ['``a|`b`` | y', '<code>a|`b</code>'],
    ['[x](./a(b|c)) | y', '<a href="./a(b|c)">x</a>'],
    ['[unknown|label] | y', '[unknown|label]'],
    ['![x|alt](./img|path) | y', '<img src="./img|path" alt="x|alt">'],
    ['left\\|pipe | y', 'left|pipe'],
    ['left\\\\| y', 'left\\'],
  ];
  for (const [row, cell] of rows) {
    assert.equal(parse('A | B\n--- | ---\n' + row),
      header + `<tr><td>${cell}</td><td>y</td></tr></tbody></table>`);
  }
  for (const [row, prose] of [['``a|b` | c', '``a|b` | c'], ['\\`a|b\\` | c', '`a|b` | c']]) {
    assert.equal(parse('A | B\n--- | ---\n' + row), header + `</tbody></table>\n<p>${prose}</p>`);
  }
});
