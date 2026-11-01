import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHighlighter } from '../../src/polish/index.js';
import { createLanguageLoader } from '../../src/polish/loader.js';
import json from '../../src/polish/languages/json.js';
import cpp from '../../src/polish/languages/cpp.js';

test('loader normalizes aliases and caches concurrent imports and registrations', async () => {
  const h = createHighlighter();
  let calls = 0;
  const loader = createLanguageLoader(h, { json: { load: async () => { calls++; return { default: json }; } } }, { data: 'json' });
  await Promise.all([loader.prepare(' DATA '), loader.prepare('json')]);
  await loader.prepare('json');
  assert.equal(calls, 1);
  assert.equal(h.tokenize('true', { language: 'json' }).tokens[0].kind, 'boolean');
});

test('partial failure keeps successful registrations cached and shares pending work on retry', async () => {
  const h = createHighlighter();
  const calls = { ready: 0, slow: 0, retry: 0 };
  let finishSlow;
  let failFirst;
  const slowGate = new Promise(resolve => { finishSlow = resolve; });
  const failureGate = new Promise(resolve => { failFirst = resolve; });
  const language = id => ({ default: { id, rules: [] } });
  const loader = createLanguageLoader(h, {
    ready: { load: async () => { calls.ready++; return language('ready'); } },
    slow: { load: async () => { calls.slow++; await slowGate; return language('slow'); } },
    retry: { load: async () => {
      if (++calls.retry === 1) { await failureGate; throw new Error('temporary'); }
      return language('retry');
    } },
  });

  const firstFailure = assert.rejects(loader.prepare('ready', 'slow', 'retry'), /temporary/);
  assert.equal(await loader.prepare('ready'), undefined);
  assert.equal(h.hasLanguage('ready'), true);
  failFirst();
  await firstFailure;
  assert.equal(h.hasLanguage('slow'), false);
  assert.equal(h.hasLanguage('retry'), false);

  const retried = loader.prepare('ready', 'slow', 'retry');
  assert.equal(await loader.prepare('retry'), undefined);
  assert.equal(h.hasLanguage('retry'), true);
  assert.equal(h.hasLanguage('slow'), false);
  assert.deepEqual(calls, { ready: 1, slow: 1, retry: 2 });
  finishSlow();
  assert.equal(await retried, undefined);
  assert.equal(h.hasLanguage('slow'), true);

  assert.equal(await loader.prepare('ready', 'slow', 'retry'), undefined);
  assert.equal(await loader.prepare(), undefined);
  assert.deepEqual(calls, { ready: 1, slow: 1, retry: 2 });
});

test('dependency cycles terminate and missing dependencies fail before imports', async () => {
  const h = createHighlighter();
  let calls = 0;
  const load = id => async () => { calls++; return { default: { id, rules: [] } }; };
  const loader = createLanguageLoader(h, {
    a: { load: load('a'), dependencies: ['b'] },
    b: { load: load('b'), dependencies: ['a'] },
    bad: { load: load('bad'), dependencies: ['missing'] },
  });
  await assert.rejects(loader.prepare('bad'), /No loader/);
  assert.equal(calls, 0);
  await loader.prepare('a');
  assert.equal(calls, 2);
});

test('punctuated aliases use explicit loaders, never runtime import paths', async () => {
  const h = createHighlighter();
  const loader = createLanguageLoader(h, { cpp: { load: async () => ({ default: cpp }) } }, { 'c++': 'cpp' });
  await loader.prepare('C++');
  assert.equal(h.hasLanguage('c++'), true);
  assert.throws(() => createLanguageLoader(h, {}, { '../cpp': 'cpp' }), /Invalid loader alias/);
});

test('mismatched modules are rejected before registration', async () => {
  const h = createHighlighter();
  const loader = createLanguageLoader(h, { other: { load: async () => ({ default: json }) } });
  await assert.rejects(loader.prepare('other'), /mismatch/);
  assert.equal(h.hasLanguage('json'), false);
});
