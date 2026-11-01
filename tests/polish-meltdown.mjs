import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readFile } from 'node:fs/promises';
import { createHighlighter } from '../src/polish.js';
import { allLanguages } from '../src/polish-languages.js';
import extraExamples from './polish/fixtures/language-examples.js';

// Keep another lightmetal project out of our dependencies and default tests.
const filename = process.argv[2] ?? process.env.MELTDOWN_PATH;
if (!filename) {
  console.error('Usage: npm run test:meltdown -- /path/to/MeltDown.js (or set MELTDOWN_PATH)');
  process.exitCode = 1;
} else {
  const { parse } = await import(pathToFileURL(resolve(filename)).href);
  assert.equal(typeof parse, 'function', 'Expected a MeltDown module exporting parse');
  const polish = createHighlighter({ languages: allLanguages });
  const familyFences = await Promise.all([
    ['c', 'example.c'], ['c++', 'example.cpp'], ['java', 'Example.java'], ['csharp', 'Example.cs'], ['go', 'example.go'],
  ].map(async ([language, file]) => '```' + language + '\n' + await readFile(new URL(`./polish/fixtures/c-family/${file}`, import.meta.url), 'utf8') + '```'));
  const markdown = [
    '```js\nconst count = 42;\n```',
    '```ts\ninterface Person { name: string }\n```',
    '```bash\ncat <<EOF\nbody\nEOF\necho done\n```',
    '```ansi\n\x1b[31mred <literal>\x1b[0m\n```',
    '```unknown\n<img src=x onerror=alert(1)>\n```',
    '```\n<plain> &copy;\n```',
    '    <indented>',
    'Inline `const count = 42` stays literal.',
    '- Nested:\n\n  ```js\n  const nested = true;\n  ```',
    ...familyFences,
  ].join('\n\n');
  const result = parse(markdown, { highlight: polish.highlight });
  assert.equal(typeof result, 'string');
  assert.ok(result.includes('class="token keyword">const</span>'));
  assert.ok(result.includes('class="token type">Person</span>'));
  assert.ok(result.includes('class="token string">&lt;&lt;EOF\nbody\nEOF</span>'));
  assert.ok(result.includes('color:rgb(187, 0, 0)">red &lt;literal&gt;</span>'));
  assert.ok(result.includes('&lt;img src=x onerror=alert(1)&gt;'));
  assert.ok(result.includes('&lt;plain&gt; &amp;copy;'));
  assert.ok(result.includes('&lt;indented&gt;'));
  assert.ok(result.includes('Inline <code>const count = 42</code>'));
  assert.ok(result.includes('class="token boolean">true</span>'));
  assert.ok(!result.includes('<pre><code><pre>'));
  assert.ok(!result.includes('<img'));
  assert.equal((result.match(/<pre>/g) ?? []).length, 13);
  assert.ok(result.includes('class="language-c++"'));
  assert.ok(result.includes('class="language-csharp"'));
  assert.equal(parse('```js\n```', { highlight: polish.highlight }), '<pre><code class="language-js"></code></pre>');
  for (const example of [...extraExamples, { id: 'json', source: '{"x":1}' }, { id: 'python', source: 'return True' }, { id: 'html', source: '<p>x</p>' }, { id: 'css', source: 'a { color: red; }' }]) {
    const rendered = parse(`~~~${example.id}\n${example.source}\n~~~`, { highlight: polish.highlight });
    assert.equal(rendered, `<pre><code class="language-${example.id}">${polish.highlight(example.source, example.id)}</code></pre>`, example.id);
  }
  const unlabelled = 'SELECT name FROM users;';
  assert.equal(parse(`~~~\n${unlabelled}\n~~~`, { highlight: polish.highlight }), `<pre><code>${polish.highlight(unlabelled, 'sql')}</code></pre>`);
  const noGuess = createHighlighter({ languages: allLanguages, guessLanguage: false });
  assert.equal(parse(`~~~\n${unlabelled}\n~~~`, { highlight: noGuess.highlight }), `<pre><code>${unlabelled}</code></pre>`);
  console.log('MeltDown integration passed: all 49 syntax languages + ANSI, unknown/unlabelled/indented code, nested fences, inline code, empty blocks, and escaping.');
}
