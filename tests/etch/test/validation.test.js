import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateDocument, resolveLimits, inspectPNG } from '../../../src/etch/validation.js';
import { fixture, code, png } from './helpers.js';

const mutate = fn => { const d = fixture(); fn(d); return d; };
test('every native type round-trips to detached whitelisted v1 data', () => {
  const original = fixture();
  assert.deepEqual(validateDocument(JSON.stringify(original)), original);
  const result = validateDocument(original);
  result.layers[0].elements[0].points[0][0] = 999;
  assert.equal(original.layers[0].elements[0].points[0][0], 1);
  assert.deepEqual(inspectPNG(png()), { width: 1, height: 1, byteLength: Buffer.from(png(), 'base64').length });
});
test('extra keys, including prototype-named keys, are not retained', () => {
  const d = fixture();
  const input = JSON.parse(JSON.stringify(d).replace('"version":1', '"version":1,"__proto__":{"polluted":true},"extra":42'));
  input.layers[0].elements[0].constructor = { prototype: { polluted: true } };
  assert.deepEqual(validateDocument(input), d);
  assert.equal({}.polluted, undefined);
});
test('canonical colors, unused stroke width, and constant pressure', () => {
  const d = fixture(), e = d.layers[0].elements;
  d.background = '#abcdef'; e[0].pressure = false; e[3].strokeWidth = 15;
  const result = validateDocument(d);
  assert.equal(result.background, '#ABCDEF');
  assert.equal(result.layers[0].elements[3].strokeWidth, 0);
  assert.deepEqual(result.layers[0].elements[0].points.map(p => p[2]), [1,1]);
});
for (const [name, change] of [
  ['format', d => { d.format = 'other'; }],
  ['empty layers', d => { d.layers = []; }],
  ['layer name', d => { d.layers[0].name = ''; }],
  ['duplicate global ID', d => { d.layers[0].id = 'stroke'; }],
  ['unknown element', d => { d.layers[0].elements[0].type = 'text'; }],
  ['missing asset', d => { d.assets = []; }],
  ['wrong asset MIME', d => { d.assets[0].mime = 'image/svg+xml'; }],
  ['invalid base64', d => { d.assets[0].data = 'not png'; }],
  ['wrong PNG dimensions', d => { d.assets[0].width = 2; }],
  ['singular transform', d => { d.layers[0].elements[0].transform = [1,2,2,4,0,0]; }],
  ['too-small transform', d => { d.layers[0].elements[0].transform = [0.00001,0,0,1,0,0]; }],
  ['non-finite transform', d => { d.layers[0].elements[0].transform[0] = Infinity; }],
  ['non-finite point', d => { d.layers[0].elements[0].points[0][0] = NaN; }],
  ['pressure outside range', d => { d.layers[0].elements[0].points[0][2] = 2; }],
  ['empty stroke', d => { d.layers[0].elements[0].points = []; }],
  ['sparse samples', d => { d.layers[0].elements[0].points = new Array(2); }],
  ['degenerate line', d => { d.layers[0].elements[1].end = [0,0]; }],
  ['negative dimensions', d => { d.layers[0].elements[2].width = -1; }],
  ['transparent paint', d => { d.layers[0].elements[2].stroke = '#12345680'; }],
  ['unpainted vector', d => { d.layers[0].elements[2].stroke = null; }],
  ['path without M', d => { d.layers[0].elements[4].commands = [['L',1,2]]; }],
  ['path after Z without M', d => { d.layers[0].elements[4].commands.push(['L',1,2]); }],
  ['path wrong arity', d => { d.layers[0].elements[4].commands = [['M',1]]; }],
  ['unsupported native arc', d => { d.layers[0].elements[4].commands.push(['A',1,2]); }],
  ['transformed painted world bounds', d => { d.layers[0].elements[2].transform[4] = 10_000_000; }],
]) test(`native rejects ${name}`, () => assert.throws(() => validateDocument(mutate(change)), code('INVALID_DOCUMENT')));

test('malformed JSON and future schema have typed errors', () => {
  assert.throws(() => validateDocument('{'), code('INVALID_DOCUMENT'));
  assert.throws(() => validateDocument(mutate(d => { d.version = 2; })), code('UNSUPPORTED_VERSION'));
});
for (const [name, limits] of [
  ['elements', { elements: 5 }], ['pointsPerElement', { pointsPerElement: 1 }],
  ['points', { points: 3 }], ['assetBytes', { assetBytes: 8 }], ['jsonBytes', { jsonBytes: 16 }],
]) test(`native enforces ${name} before commit`, () => {
  assert.throws(() => validateDocument(fixture(), limits), code('LIMIT_EXCEEDED'));
});
test('UTF-8 input size and layer limits are enforced', () => {
  const d = fixture();
  d.layers.push({ ...d.layers[0], id: 'second', elements: [] });
  assert.throws(() => validateDocument(d, { layers: 1 }), code('LIMIT_EXCEEDED'));
  const json = JSON.stringify(fixture());
  assert.throws(() => validateDocument(json, { jsonBytes: json.length-1 }), code('LIMIT_EXCEEDED'));
});
test('PNG dimension, per-asset pixels, asset count, and combined pixels have explicit limits', () => {
  const d = fixture();
  d.assets[0] = { ...d.assets[0], width: 2, data: png(2,1) };
  assert.throws(() => validateDocument(d, { rasterDimension: 1 }), code('LIMIT_EXCEEDED'));
  assert.throws(() => validateDocument(d, { assetPixels: 1 }), code('LIMIT_EXCEEDED'));
  d.assets.push({ ...d.assets[0], id: 'extra-asset' });
  assert.throws(() => validateDocument(d, { assets: 1 }), code('LIMIT_EXCEEDED'));
  assert.throws(() => validateDocument(d, { totalPixels: 3 }), code('LIMIT_EXCEEDED'));
});
test('exact point/byte limits are accepted; a 100,000-point element does not overflow traversal', () => {
  const d = fixture();
  d.layers[0].elements = [d.layers[0].elements[0]]; d.assets = [];
  d.layers[0].elements[0].points = Array.from({length:100_000}, () => [0,0,0.5]);
  assert.equal(validateDocument(d).layers[0].elements[0].points.length,100_000);
  d.layers[0].elements[0].points.push([0,0,0.5]);
  assert.throws(() => validateDocument(d), code('LIMIT_EXCEEDED'));
  const normal = fixture(), bytes = Buffer.from(normal.assets[0].data,'base64').length;
  assert.deepEqual(validateDocument(normal,{assetBytes:bytes}),normal);
  assert.throws(() => validateDocument(normal,{assetBytes:bytes-1}),code('LIMIT_EXCEEDED'));
});
test('derived pressure geometry is bounded independently of stored sample counts', () => {
  const d = fixture();
  d.layers[0].elements[0].points = [[0,0,1],[1_000_000,0,1]];
  d.layers[0].elements[0].width = 0.01;
  assert.throws(() => validateDocument(d), error => error.code === 'LIMIT_EXCEEDED' && error.details.limit === 'derivedSegmentsPerElement');
});
test('aggregate derived budget counts all layers before retaining outlines, with downward limits', () => {
  const d = fixture(), dot = {...d.layers[0].elements[0],points:[[0,0,0.5]]};
  d.layers[0].elements = [dot,{...dot,id:'second-dot'}];
  assert.equal(validateDocument(d,{derivedSegments:12,derivedSegmentsPerElement:6}).layers[0].elements.length,2);
  assert.throws(() => validateDocument(d,{derivedSegments:11}),e => e.code === 'LIMIT_EXCEEDED' && e.details.limit === 'derivedSegments' && e.details.maximum === 11);
  assert.throws(() => validateDocument(d,{derivedSegmentsPerElement:5}),e => e.code === 'LIMIT_EXCEEDED' && e.details.limit === 'derivedSegmentsPerElement');
});
test('limits can only be configured downwards with known positive integers', () => {
  assert.equal(resolveLimits({ layers: 1 }).layers, 1);
  for (const value of [{ layers: 129 }, { layers: 0 }, { jsonBytes: Infinity }, { typo: 1 }, null]) {
    assert.throws(() => resolveLimits(value), code('INVALID_ARGUMENT'));
  }
});

test('immutable canonical assets reuse byte inspection but still enforce destination limits and fresh output', () => {
  const d = validateDocument(fixture());Object.freeze(d.assets[0]);
  const original = globalThis.atob;let decodes = 0;
  globalThis.atob = (...args) => {decodes++;return original(...args);};
  try {
    const next = validateDocument(d);assert.equal(decodes,0);assert.deepEqual(next,d);
    assert.notEqual(next.assets[0],d.assets[0]);
    const bytes = Buffer.from(d.assets[0].data,'base64').length;
    assert.throws(() => validateDocument(d,{assetBytes:bytes-1}),code('LIMIT_EXCEEDED'));
    assert.throws(() => validateDocument({...d,assets:[...d.assets,{...d.assets[0],id:'other'}]},{totalPixels:1}),code('LIMIT_EXCEEDED'));
    assert.throws(() => validateDocument({...d,assets:[...d.assets,d.assets[0]]}),code('INVALID_DOCUMENT'));
    // A detached/untrusted object is not a cache hit, even if frozen.
    validateDocument({...d,assets:[Object.freeze({...d.assets[0]})]});assert.ok(decodes > 0);
  } finally {globalThis.atob = original;}
});

test('mutated canonical bytes/MIME/dimensions or accessors cannot inherit validated asset status', () => {
  for (const change of [
    a => {a.data = a.data.slice(0,-4)+'!!!!';},
    a => {a.mime = 'image/webp';},
    a => {a.width = 2;},
    a => {Object.defineProperty(a,'data',{get:() => 'invalid!'});},
  ]) {
    const d = validateDocument(fixture());change(d.assets[0]);Object.freeze(d.assets[0]);
    assert.throws(() => validateDocument(d),code('INVALID_DOCUMENT'));
  }
});

test('JSON byte accounting exactly includes base64, Unicode and escaped text at the boundary', () => {
  const d = fixture();d.layers[0].name = '笔记 🖊️ \"\\\\\\n';d.assets.push({...d.assets[0],id:'unused-图片'});
  const canonical = validateDocument(d),bytes = Buffer.byteLength(JSON.stringify(canonical));
  for (const input of [d,canonical,JSON.stringify(canonical)]) {
    assert.deepEqual(validateDocument(input,{jsonBytes:bytes}),canonical);
    assert.throws(() => validateDocument(input,{jsonBytes:bytes-1}),code('LIMIT_EXCEEDED'));
  }
  Object.freeze(canonical.assets[0]);Object.freeze(canonical.assets[1]);
  assert.deepEqual(validateDocument(canonical,{jsonBytes:bytes}),canonical);
  assert.throws(() => validateDocument(canonical,{jsonBytes:bytes-1}),code('LIMIT_EXCEEDED'));
});
