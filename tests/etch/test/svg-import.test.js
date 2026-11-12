import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readSVGInput,MAX_SVG_INPUT_BYTES} from '../../../src/etch/svg-import.js';
import {code} from './helpers.js';
const source = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>';
test('SVG read accepts strings and UTF-8 Blob/File input without invoking overridden text/stream/size',async () => {
  const blob = new Blob([source]);blob.text = blob.stream = () => {throw Error('override used');};Object.defineProperty(blob,'size',{value:0});
  assert.equal(await readSVGInput(source),source);assert.equal(await readSVGInput(blob),source);
});
test('SVG byte cap is UTF-8, downward with host jsonBytes, and checked before a Blob stream is opened',async () => {
  await assert.rejects(readSVGInput('é',{jsonBytes:1}),code('LIMIT_EXCEEDED'));
  const original = Blob.prototype.stream;let opened = 0;Blob.prototype.stream = function() {opened++;return original.call(this);};
  try {await assert.rejects(readSVGInput(new Blob(['x'.repeat(MAX_SVG_INPUT_BYTES+1)])),code('LIMIT_EXCEEDED'));assert.equal(opened,0);}
  finally {Blob.prototype.stream = original;}
  await assert.rejects(readSVGInput(new Blob([source]),{jsonBytes:source.length-1}),code('LIMIT_EXCEEDED'));
});
test('SVG reads reject invalid UTF-8 and non-Blob object inputs, not silently repaired file bytes',async () => {
  await assert.rejects(readSVGInput(new Blob([new Uint8Array([0xff,0xfe,0x3c,0])])),code('INVALID_SVG'));
  for (const value of [null,{},new Uint8Array([1]),{size:1,text:async () => source}]) await assert.rejects(readSVGInput(value),code('INVALID_ARGUMENT'));
});
test('SVG stream reads are cancellable before and during read with no partial source return',async () => {
  const controller = new AbortController();controller.abort();await assert.rejects(readSVGInput(source,{},controller.signal),code('CANCELLED'));
  const next = new AbortController(),pending = readSVGInput(new Blob([source.repeat(10000)]),{},next.signal);next.abort();await assert.rejects(pending,code('CANCELLED'));
});
