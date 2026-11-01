import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHighlighter } from '../../src/polish.js';
import javascript from '../../src/polish/languages/javascript.js';
import typescript from '../../src/polish/languages/typescript.js';

const polish = createHighlighter({ languages: [javascript, typescript] });

test('highlight is an unbound synchronous callback returning code contents', () => {
  const { highlight } = polish;
  const result = highlight('const n = 42;', 'js');
  assert.equal(typeof result, 'string');
  assert.ok(result.includes('<span class="token keyword">const</span>'));
  assert.ok(!result.includes('<pre'));
  assert.ok(!result.includes('<code'));
  assert.equal(result, polish.highlightHTML('const n = 42;', { language: 'javascript' }));
});

test('missing, empty, unknown and explicitly plain languages return escaped text', () => {
  for (const language of [undefined, '', '  ', 'unknown', 'text', 'plain']) {
    assert.equal(polish.highlight('<example>&"', language), '&lt;example&gt;&amp;&quot;');
  }
  assert.equal(polish.highlight(''), '');
  assert.equal(polish.highlight('literal \\x1b[31m', 'ansi'), 'literal \\x1b[31m');
});

test('ANSI tag goes through the grammar-driven conversion path', () => {
  assert.equal(polish.highlight('\x1b[31mred\x1b[0m', ' ANSI '), '<span style="color:rgb(187, 0, 0)">red</span>');
  assert.equal(polish.highlight('\x1b[31m<img>\x1b[0m', 'ansi'), '<span style="color:rgb(187, 0, 0)">&lt;img&gt;</span>');
});

test('language lookup includes modes and aliases without exposing mutable grammars', () => {
  for (const name of ['JS', 'ts', 'typescript', 'ansi', 'plain', 'text']) assert.equal(polish.hasLanguage(name), true);
  for (const name of ['', 'unknown', undefined, null]) assert.equal(polish.hasLanguage(name), false);
  assert.equal(createHighlighter().hasLanguage('js'), false);
  for (const id of ['ansi', 'plain', 'text']) assert.throws(() => polish.register({ id, rules: [] }), /Reserved/);
  assert.throws(() => polish.register({ id: 'collision', aliases: ['ANSI'], rules: [] }), /Reserved/);
});

test('invalid API input throws instead of coercing; options remain unchanged', () => {
  for (const source of [null, 42, {}, new String('text')]) assert.throws(() => polish.highlight(source), TypeError);
  for (const language of [null, 42, {}]) assert.throws(() => polish.highlight('text', language), TypeError);
  for (const options of [null, [], 'js']) assert.throws(() => polish.highlightHTML('text', options), TypeError);
  assert.throws(() => polish.highlightHTML('text', { strict: 'yes' }), TypeError);
  for (const options of [null, [], { languages: {} }]) assert.throws(() => createHighlighter(options), TypeError);
  const options = Object.freeze({ language: ' TS ', strict: true });
  assert.ok(polish.highlightHTML('interface Person {}', options).includes('token type'));
  assert.deepEqual(options, { language: ' TS ', strict: true });
});

test('strict option and configured limits remain available without hook boilerplate', () => {
  assert.throws(() => polish.highlightHTML('text', { language: 'unknown', strict: true }), /unknown-language/);
  const limited = createHighlighter({ maxSteps: 1, languages: [javascript] });
  assert.equal(typeof limited.highlight('x + y', 'js'), 'string');
  const source = '\x1b[31mred\x1b[0m';
  const html = limited.highlight(source, 'ansi');
  assert.ok(html.includes('\\x1b[0m'));
  assert.throws(() => limited.highlightHTML(source, { language: 'ansi', strict: true }), /step-limit/);
});
