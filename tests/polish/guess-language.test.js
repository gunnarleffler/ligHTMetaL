import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHighlighter } from '../../src/polish.js';
import { allLanguages } from '../../src/polish-languages.js';
import sql from '../../src/polish/languages/sql.js';

const h = createHighlighter({ languages: allLanguages });
test('unlabelled HTML hooks guess common registered syntax by default', () => {
  for (const [language, source] of [
    ['sql', 'select name\nfrom users where id = 42;'],
    ['json', '{"hello": true}'], ['javascript', 'const count = 42;'],
    ['typescript', 'const count: number = 42;'], ['python', 'def greet(name):\n    return name'],
    ['rust', 'fn main() {}'], ['go', 'package main\nfunc main() {}'],
    ['html', '<div>hello & goodbye</div>'], ['xml', '<?xml version="1.0"?><root/>'],
    ['css', '.hello { color: red; }'], ['bash', '#!/bin/bash\necho hello'],
    ['ruby', 'def greet\n  puts "hello"\nend'], ['php', '<?php echo 1;'],
    ['java', 'public class Hello {}'], ['csharp', 'Console.WriteLine("hello");'],
    ['c', '#include <stdio.h>\nint main() {}'], ['cpp', '#include <iostream>\nint main() {}'],
    ['dockerfile', 'FROM node:22\nRUN echo hello'], ['markdown', '# Hello\nworld'],
  ]) {
    for (const name of [undefined, '', '  ']) assert.equal(h.highlight(source, name), h.highlight(source, language), language);
    assert.equal(h.highlightHTML(source, { strict: true }), h.highlight(source, language));
  }
});

test('C include signatures accept angle and quoted headers', () => {
  const onlyC = createHighlighter({ languages: allLanguages.filter(language => language.id === 'c') });
  for (const header of ['stdio', 'stdlib', 'string', 'stdint']) {
    for (const directive of [`#include <${header}.h>`, `#include "${header}.h"`, `  # include\t"${header}.h"`, `#include"${header}.h"`]) {
      for (const newline of ['\n', '\r\n', '\r']) {
        const source = `${directive}${newline}int main() { return 0; }`;
        assert.equal(onlyC.highlight(source), onlyC.highlight(source, 'c'), directive);
        assert.equal(h.highlight(source), h.highlight(source, 'c'), directive);
      }
    }
  }
});

test('include directives inside Python literals do not count as C evidence', () => {
  const onlyC = createHighlighter({ languages: allLanguages.filter(language => language.id === 'c') });
  for (const directive of ['#include <stdio.h>', '#include "stdio.h"', '#include "string.h"']) {
    for (const fragment of [
      `snippet = ${JSON.stringify(directive)}`,
      `snippet = '''\n${directive}\n'''`,
      `snippet = """\n${directive}\n"""`,
      `# Example: ${directive}`,
    ]) {
      const source = `def example():\n    ${fragment}\n    return None`;
      assert.equal(h.highlight(source), h.highlight(source, 'python'), fragment);
      assert.equal(onlyC.highlight(source), onlyC.highlight(source, 'plain'), fragment);
    }
  }
});

test('SQL in Python strings and comments is not SQL evidence', () => {
  for (const query of [
    '"SELECT name FROM users"',
    "'SELECT name FROM users'",
    '"""SELECT name\nFROM users\nWHERE id = 1"""',
    "'''INSERT INTO users VALUES (1)'''",
    'r"""SELECT name FROM users"""',
    'f"SELECT name FROM {table}"',
    '"SELECT \\"name\\" FROM users"',
  ]) {
    const source = `def fetch_users(db):\n    query = ${query}\n    return db.execute(query)`;
    assert.equal(h.highlight(source), h.highlight(source, 'python'), query);
    const fragment = `query = ${query}`;
    assert.equal(h.highlight(fragment), h.highlight(fragment, 'plain'), query);
  }
  const source = '# SELECT name FROM users\ndef fetch_users():\n    return []';
  assert.equal(h.highlight(source), h.highlight(source, 'python'));
  const withoutPython = createHighlighter({ languages: [sql] });
  assert.equal(withoutPython.highlight(source), withoutPython.highlight(source, 'plain'));
});

test('strings and comments alone are not code evidence', () => {
  for (const source of [
    '"SELECT * FROM users"', "'''SELECT * FROM users",
    '-- SELECT * FROM users', '/* SELECT * FROM users */',
    '"def greet():"', '"const value = 42;"',
    '// const value = 42;', '/* fn main() {} */',
  ]) assert.equal(h.highlight(source), h.highlight(source, 'plain'), source);
  const sqlOnly = createHighlighter({ languages: [sql] });
  assert.equal(sqlOnly.highlight('# SELECT * FROM users'), '# SELECT * FROM users');
  const source = 'SELECT \'FROM users\' AS message FROM logs;';
  assert.equal(h.highlight(source), h.highlight(source, 'sql'));
});

test('guessLanguage false opts out; explicit languages, unknown names and modes always win', () => {
  const source = 'SELECT * FROM users;';
  const disabled = createHighlighter({ languages: allLanguages, guessLanguage: false });
  assert.equal(disabled.highlight(source), source);
  assert.equal(disabled.highlightHTML(source, { strict: true }), source);
  assert.ok(disabled.highlight(source, 'sql').includes('token keyword'));
  for (const language of ['plain', 'text', 'unknown', 'ansi']) assert.equal(h.highlight(source, language), source);
  assert.throws(() => h.highlightHTML(source, { language: 'unknown', strict: true }), /unknown-language/);
  for (const value of [null, 0, 1, 'true', {}]) assert.throws(() => createHighlighter({ guessLanguage: value }), TypeError);
});

test('guesses are isolated, use current registrations, and never load grammars', () => {
  const isolated = createHighlighter();
  const source = 'SELECT * FROM users;';
  assert.equal(isolated.highlight(source), source);
  isolated.register(sql);
  assert.equal(isolated.highlight(source), h.highlight(source, 'sql'));
  assert.equal(createHighlighter().highlight(source), source);
  assert.equal(isolated.hasLanguage('javascript'), false);
  assert.equal(isolated.tokenize(source, { language: 'unknown' }).diagnostics[0].code, 'unknown-language');
});

test('uncertain, ambiguous and unsignalled inputs remain escaped plain text', () => {
  for (const source of ['', 'hello <world> & goodbye', 'return 42;', '{broken json}',
    'const x = 1;\ndef greet():\n pass', 'x'.repeat(8192) + '\nSELECT * FROM users;']) {
    assert.equal(h.highlight(source), h.highlight(source, 'plain'));
  }
  const source = 'SELECT \'<img src=x onerror="evil">\' FROM users;';
  assert.ok(!h.highlight(source).includes('<img'));
});
