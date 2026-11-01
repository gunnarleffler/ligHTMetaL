import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHighlighter, renderHTML } from '../../src/polish/index.js';
import { allLanguages } from '../../src/polish-languages.js';

test('deterministic malformed-input corpus preserves partitions for every language', () => {
  const h = createHighlighter({ maxDepth: 16, maxSteps: 2000 });
  for (const language of allLanguages) h.register(language);
  let seed = 0x12345678;
  const next = () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return seed >>> 0;
  };
  const pieces = ['a', '42', ' ', '\r\n', '\t', '\\', '"', "'", '`', '${', '{', '}', '/*', '*/', '//', '[', ']', '#', 'true', 'None', ':', '😀', '\ud800', '<script>', '&', '<script>', '</script>', '<style>', '</style>', '<!--', '-->', '<<EOF', '<<-\'END\'', '\nEOF\n', '$USER', '<<<', 'R"tag(', ')tag"', '@"', '"""', '""""', '#include', 'r##"', '"##', '[=[', ']=]', '%q{', '#=', '=#', '{-', '-}', '@"\n', '"@', '*>', '\ntext: |\n  # body\n', '\n````js\n', '\n~~~\n', '[[table]]', '<![CDATA[', ']]>', '<!DOCTYPE', '%%A', '%PATH%', '!name!', '${HOME}', '\n[Service]\n', 'proxy_pass', 'Host ', 'RUN '];
  for (let i = 0; i < 400; i++) {
    let source = '';
    const count = next() % 80;
    for (let j = 0; j < count; j++) source += pieces[next() % pieces.length];
    for (const language of allLanguages) {
      const { tokens } = h.tokenize(source, { language: language.id });
      assert.equal(tokens.map(t => source.slice(t.start, t.end)).join(''), source);
      assert.ok(!renderHTML(source, tokens).includes('<script>'));
    }
  }
});
