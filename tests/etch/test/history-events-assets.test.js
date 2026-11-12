import { test } from 'node:test';
import assert from 'node:assert/strict';
import { History } from '../../../src/etch/history.js';
import { Emitter } from '../../../src/etch/events.js';
import { AssetPool, decodeAssets } from '../../../src/etch/assets.js';
import { referencedAssetIds, snapshot } from '../../../src/etch/document.js';
import { fixture, code } from './helpers.js';

test('history caps entries, suppresses identical state and clears redo on push', () => {
  const history = new History({maxCommands:2});
  const a = {value:0}, b = {value:1}, c = {value:2}, d = {value:3};
  assert.equal(history.push(a,a,'nothing'),false);
  history.push(a,b,'one'); history.push(b,c,'two'); history.push(c,d,'three');
  assert.equal(history.undo().before,c); assert.equal(history.undo().before,b); assert.equal(history.undo(),null);
  history.redo(); history.push(c,d,'new'); assert.equal(history.getState().canRedo,false);
  history.clear(); assert.deepEqual(history.documents(),[]);
});
test('byte budget evicts old commands but a permitted single large command is kept alone', () => {
  const history = new History({maxBytes:64});
  history.push({x:''},{x:'a'.repeat(1000)},'large');
  assert.equal(history.getState().canUndo,true);
  history.push({x:0},{x:1},'small');
  assert.equal(history.undo().label,'small'); assert.equal(history.undo(),null);
});
test('emitter isolates listeners and payloads, reports exceptions asynchronously, unsubscribe is idempotent', async () => {
  const errors = [], emitter = new Emitter(e => errors.push(e)); let called = 0;
  const off = emitter.on('event',e => { e.values[0] = 99; throw new Error('listener failed'); });
  emitter.on('event',e => { called++; assert.equal(e.values[0],1); });
  emitter.emitBatch([['event',{values:[1]}]]);
  assert.equal(called,1); assert.equal(errors.length,0);
  await Promise.resolve(); assert.equal(errors.length,1);
  off(); off(); emitter.emitBatch([['event',{values:[1]}]]); assert.equal(called,2);
  emitter.clear(); emitter.emitBatch([['event',{values:[1]}]]); assert.equal(called,2);
});
test('failed decode cleans prior resources; cancellation cleans the just-resolved resource', async () => {
  const doc = fixture(); doc.assets.push({...doc.assets[0],id:'second'});
  const controller = new AbortController(); let calls = 0, closed = 0;
  await assert.rejects(decodeAssets(doc,controller.signal,async () => {
    if (++calls === 2) throw new Error('bad image');
    return {image:{},close:()=>closed++};
  }),code('DECODE_FAILED'));
  assert.equal(closed,1);
  await assert.rejects(decodeAssets(fixture(),controller.signal,async () => {
    controller.abort(); return {image:{},close:()=>closed++};
  }),code('CANCELLED'));
  assert.equal(closed,2);
});
test('asset references include hidden/locked layers, deduplicate instances and omit unused assets from snapshots', () => {
  const doc = fixture(),image = doc.layers[0].elements.find(e => e.type === 'image');
  doc.layers[0].visible = false;doc.layers[0].locked = true;
  doc.layers[0].elements.push({...image,id:'second-image'});
  doc.assets.push({...doc.assets[0],id:'unused'});
  const ids = referencedAssetIds(doc);assert.deepEqual([...ids],['asset']);
  ids.clear();assert.deepEqual([...referencedAssetIds(doc)],['asset']);
  assert.deepEqual(snapshot(doc).assets,doc.assets.slice(0,1));assert.equal(doc.assets.length,2);
  let closed = 0;const pool = new AssetPool();
  pool.add('asset',{image:'pixel',close:() => closed++});pool.add('unused',{image:'unused',close:() => closed++});
  pool.retain([doc,doc]);assert.equal(closed,1);assert.equal(pool.get('asset'),'pixel');
  pool.dispose();assert.equal(closed,2);
});
test('resource pool retention follows actual element references, dispose is idempotent', () => {
  let closed = 0; const pool = new AssetPool();
  pool.add('asset',{image:'pixel',close:()=>closed++});
  assert.equal(pool.get('asset'),'pixel'); pool.retain([fixture()]); assert.equal(closed,0);
  pool.retain([]); assert.equal(closed,1); pool.dispose(); pool.dispose(); assert.equal(closed,1);
});
