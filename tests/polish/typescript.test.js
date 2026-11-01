import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHighlighter, validateTokens } from '../../src/polish/index.js';
import javascript from '../../src/polish/languages/javascript.js';
import typescript from '../../src/polish/languages/typescript.js';

const h = createHighlighter();
h.register(javascript);
h.register(typescript);
const run = source => h.tokenize(source, { language: 'ts', strict: true }).tokens;
const at = (source, needle) => run(source).find(t => t.start <= source.indexOf(needle) && t.end > source.indexOf(needle));

test('TypeScript declarations, annotations, modifiers and operators', () => {
  const source = 'export interface Person { readonly name: string; age?: number; }\ntype result = Person | null;\nabstract class Box implements Person { public name!: string; private count: number = 0; }';
  for (const word of ['interface', 'readonly', 'type', 'abstract', 'implements', 'public', 'private']) assert.equal(at(source, word).kind, 'keyword', word);
  for (const word of ['Person', 'string', 'number', 'result', 'Box']) assert.equal(at(source, word).kind, 'type', word);
  assert.equal(at(source, 'null').kind, 'constant');
  validateTokens(source, run(source));
});

test('generic declarations/calls, decorators, and conditional/mapped type keywords', () => {
  const source = '@sealed\nclass Box<T> {}\nfunction identity<T extends object>(value: T): T { return value; }\nconst item = identity<string>("x");\ntype Unwrap<T> = T extends Promise<infer U> ? U : never;\ntype Keys<T> = { readonly [K in keyof T]?: T[K] };';
  assert.equal(at(source, 'sealed').kind, 'function');
  assert.equal(at(source, 'identity<T').kind, 'function');
  assert.equal(at(source, 'identity<string').kind, 'function');
  for (const word of ['T>', 'Promise', 'U :', 'never', 'object', 'Keys']) assert.equal(at(source, word).kind, 'type', word);
  for (const word of ['infer', 'keyof']) assert.equal(at(source, word).kind, 'keyword', word);
});

test('inherited strings/comments/regexes and nested templates retain precedence', () => {
  const source = '/* interface Person string */\nconst value = `type ${1 + 2} ${`nested ${true}`}`;\nconst regex = /interface/;';
  assert.equal(at(source, 'interface Person').kind, 'comment');
  assert.equal(at(source, 'type $').kind, 'string');
  assert.equal(at(source, '1').kind, 'number');
  assert.equal(at(source, 'true').kind, 'boolean');
  assert.equal(at(source, '/interface/').kind, 'string');
});

test('TypeScript support does not change JavaScript grammar or aliases', () => {
  const source = 'interface Person';
  assert.equal(h.tokenize(source, { language: 'js' }).tokens[0].kind, 'variable');
  assert.equal(run(source)[0].kind, 'keyword');
  assert.equal(h.tokenize('Infinity', { language: 'ts' }).tokens[0].kind, 'constant');
});

test('incomplete TypeScript preserves source; TSX is not silently aliased', () => {
  for (const source of ['interface Person {', 'type X<T extends', '@decorator(', 'const x: string = "tail\\', 'type X = { [K in keyof T]:']) {
    const tokens = run(source);
    validateTokens(source, tokens);
    assert.equal(tokens.map(t => source.slice(t.start, t.end)).join(''), source);
  }
  assert.equal(h.tokenize('<div/>', { language: 'tsx' }).diagnostics[0].code, 'unknown-language');
});
