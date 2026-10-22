import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { parse } from '../../src/MeltDown.js';
const require = createRequire(import.meta.url);
const hljs = require('highlight.js/lib/core');
hljs.registerLanguage('javascript', require('highlight.js/lib/languages/javascript'));
hljs.registerLanguage('bash', require('highlight.js/lib/languages/bash'));

test('highlight receives raw fenced code and language, not inline code', () => {
  const calls = [];
  const html = parse('`inline`\n\n```bash\necho "<hello>"\n```', {
    highlight(code, language) { calls.push([code, language]); return '<span>highlighted</span>'; }
  });
  assert.deepEqual(calls, [['echo "<hello>"', 'bash']]);
  assert.equal(html, '<p><code>inline</code></p>\n<pre><code class="language-bash"><span>highlighted</span></code></pre>');
});

test('unlabelled, indented and nested code share the hook', () => {
  const calls = [];
  parse('```\nfenced\n```\n\n    indented\n\n> ```js\n> quoted\n> ```', {
    highlight(code, language) { calls.push([code, language]); }
  });
  assert.deepEqual(calls, [['fenced', ''], ['indented', ''], ['quoted', 'js']]);
});

test('nullish fallback escapes code; empty string is valid output', () => {
  for (const highlight of [() => null, () => undefined]) {
    assert.equal(parse('```\n<&>\n```', { highlight }), '<pre><code>&lt;&amp;&gt;</code></pre>');
  }
  assert.equal(parse('```\ntext\n```', { highlight: () => '' }), '<pre><code></code></pre>');
});

test('hook configuration and result must be synchronous and correctly typed', () => {
  for (const highlight of [null, false, 'bad', {}]) assert.throws(() => parse('', { highlight }), TypeError);
  for (const value of [false, 0, {}, Promise.resolve('html')]) {
    assert.throws(() => parse('```\nx\n```', { highlight: () => value }), TypeError);
  }
  const error = new Error('highlight failed');
  assert.throws(() => parse('```\nx\n```', { highlight() { throw error; } }), value => value === error);
});

test('hooks stay parse-local and do not sanitize their trusted HTML output', () => {
  const source = '```\nx\n```';
  assert.equal(parse(source, { highlight: () => '<b>x</b>' }), '<pre><code><b>x</b></code></pre>');
  assert.equal(parse(source), '<pre><code>x</code></pre>');
});

test('real highlight.js handles explicit languages, aliases and plain fallbacks', () => {
  const highlight = (code, language) => language && hljs.getLanguage(language)
    ? hljs.highlight(code, { language, ignoreIllegals: true }).value : null;
  assert.match(parse('```javascript\nconst answer = 42;\n```', { highlight }), /hljs-keyword/);
  assert.match(parse('```js\nconst answer = 42;\n```', { highlight }), /hljs-keyword/);
  assert.match(parse('```bash\necho "hello"\n```', { highlight }), /hljs-/);
  for (const language of ['', 'unknown']) assert.match(parse('```' + language + '\n<tag>\n```', { highlight }), /&lt;tag&gt;/);
});
