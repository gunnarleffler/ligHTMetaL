import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHighlighter, validateTokens, composeLanguage } from '../../src/polish.js';
import bash from '../../src/polish/languages/bash.js';

const h = createHighlighter({ languages: [bash] });
const run = source => h.tokenize(source, { language: 'sh', strict: true });
const kindAt = (source, needle) => run(source).tokens.find(t => t.start <= source.indexOf(needle) && t.end > source.indexOf(needle))?.kind;

test('Bash comments, strings, variables, assignments and builtins', () => {
  const source = '#!/bin/bash\nNAME="hello $USER"\necho "$NAME" # comment\nprintf \'literal $USER\'\necho file#name';
  assert.equal(kindAt(source, '#!/bin/bash'), 'comment');
  assert.equal(kindAt(source, 'NAME='), 'variable');
  assert.equal(kindAt(source, '$USER"'), 'variable');
  assert.equal(kindAt(source, 'echo'), 'function');
  assert.equal(kindAt(source, '# comment'), 'comment');
  assert.equal(kindAt(source, 'literal'), 'string');
  assert.notEqual(kindAt(source, '#name'), 'comment');
});

test('heredoc scanner uses dynamic quoted/unquoted delimiter and resumes shell rules', () => {
  for (const delimiter of ['EOF', "'EOF'", '"EOF"', '\\EOF', "'END TEXT'"]) {
    const closing = delimiter === "'END TEXT'" ? 'END TEXT' : 'EOF';
    const source = `cat <<${delimiter}\n$USER # text "quotes"\n${closing}\necho done`;
    assert.equal(kindAt(source, '$USER'), 'string');
    assert.equal(kindAt(source, 'echo done'), 'function');
    validateTokens(source, run(source).tokens);
  }
});

test('tab-stripping heredocs, CRLF, and exact closing-line matching', () => {
  const source = 'cat <<-EOF\r\n\tcontent\r\n\tEOF\r\necho done';
  assert.equal(kindAt(source, 'content'), 'string');
  assert.equal(kindAt(source, 'echo'), 'function');
  const exact = 'cat <<EOF\nEOF suffix\nstill text\nEOF\necho done';
  assert.equal(kindAt(exact, 'still text'), 'string');
  assert.equal(kindAt(exact, 'echo'), 'function');
});

test('strings/comments protect fake heredocs and here-strings are not heredocs', () => {
  const source = '# cat <<EOF\necho "<<EOF"\necho after';
  assert.equal(kindAt(source, 'echo after'), 'function');
  const hereString = 'cat <<<EOF\necho after';
  assert.equal(kindAt(hereString, 'echo after'), 'function');
});

test('unterminated heredocs preserve source; scanners survive composition', () => {
  for (const source of ['cat <<EOF\nunfinished', 'cat <<EOF', 'cat <<\'\'\n\necho done']) {
    const { tokens } = run(source);
    validateTokens(source, tokens);
    assert.equal(tokens.map(t => source.slice(t.start, t.end)).join(''), source);
  }
  const derived = composeLanguage(bash, { id: 'derived' });
  h.register(derived);
  assert.ok(h.highlight('cat <<EOF\nbody\nEOF', 'derived').includes('token string'));
});
