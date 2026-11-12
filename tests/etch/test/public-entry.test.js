import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createEtch, EtchError } from '../../../src/etch.js';
import * as namedEntry from '../../../src/etch.js';

test('public entry imports in Node without DOM globals or side effects', () => {
  assert.equal(typeof globalThis.document,'undefined');
  assert.equal(createEtch,namedEntry.createEtch);
  assert.equal(typeof createEtch,'function');
  assert.throws(() => createEtch(null),error => error instanceof EtchError && error.code === 'INVALID_ARGUMENT');
});
test('suite has no runtime dependencies and Etch exposes explicit CSS', async () => {
  const pkg = JSON.parse(await readFile(new URL('../../../package.json',import.meta.url),'utf8'));
  assert.equal(pkg.dependencies,undefined);
  const entry = await readFile(new URL('../../../src/etch.js',import.meta.url),'utf8');
  assert.ok(entry.length < 500);
  const css = await readFile(new URL('../../../src/etch.css',import.meta.url),'utf8');
  assert.ok(css.includes('.etch')); assert.ok(css.includes('--etch-'));
});
