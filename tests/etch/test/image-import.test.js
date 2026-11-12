import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {MAX_IMAGE_BYTES,base64ByteLength,base64FromBytes,bytesFromBase64,checkImageSize,imageOptions,inspectRaster} from '../../../src/etch/raster.js';
import {validateDocument,resolveLimits} from '../../../src/etch/validation.js';
import {EditorState} from '../../../src/etch/state.js';
import {AssetPool} from '../../../src/etch/assets.js';
import {code,fixture,png,deferred} from './helpers.js';
const state = options => new EditorState({decode:async () => new AssetPool(),...options});
const asset = (id='photo',width=2,height=3) => ({id,mime:'image/png',width,height,data:png(width,height)});
function resource() {let closed = 0;return {image:{},close(){closed++;},get closed(){return closed;}};}
const webp = new Uint8Array(await readFile(new URL('../../../examples/etch/coloring.webp',import.meta.url)));
const jpeg = new Uint8Array(await readFile(new URL('../../../examples/etch/note.jpeg',import.meta.url)));

test('image settings default to WebP 80; PNG lossless and quality limits remain explicit',() => {
  assert.deepEqual(imageOptions(),{format:'webp',quality:0.8});assert.deepEqual(imageOptions({format:'png'}),{format:'png',quality:0.8});
  for (const options of [null,[],{format:null},{quality:null},{format:'jpeg'},{quality:NaN},{quality:1.1},{quality:-1},{quality:'80'},{url:'http://example.com'}]) assert.throws(() => imageOptions(options),code('INVALID_ARGUMENT'));
});
test('chunked base64 round trips byte boundaries without spread/argument exhaustion',() => {
  for (const n of [0,1,2,3,16383,16384,32768,100000]) {
    const bytes = Uint8Array.from({length:n},(_,i) => i%256),data = base64FromBytes(bytes);
    assert.equal(base64ByteLength(data),n);assert.deepEqual(bytesFromBase64(data),bytes);
  }
});
test('sniff actual PNG/JPEG/WebP dimensions, not filenames or declared MIME',() => {
  assert.equal(inspectRaster(bytesFromBase64(png(2,3))).mime,'image/png');assert.equal(inspectRaster(jpeg).mime,'image/jpeg');assert.equal(inspectRaster(webp).mime,'image/webp');
  assert.deepEqual([inspectRaster(webp).width,inspectRaster(webp).height],[425,550]);assert.deepEqual([inspectRaster(jpeg).width,inspectRaster(jpeg).height],[381,500]);
  for (const bytes of [new Uint8Array(),new TextEncoder().encode('<svg/>'),new TextEncoder().encode('GIF89a'),webp.slice(0,25),jpeg.slice(0,10)]) assert.throws(() => inspectRaster(bytes),code('DECODE_FAILED'));
  const bad = webp.slice();bad[4] ^= 1;assert.throws(() => inspectRaster(bad),code('DECODE_FAILED'));
});
test('JPEG EXIF orientation is inspected safely before decode',() => {
  const payload = Buffer.alloc(32);payload.write('Exif\0\0',0,'binary');payload.write('II',6);payload.writeUInt16LE(42,8);payload.writeUInt32LE(8,10);payload.writeUInt16LE(1,14);payload.writeUInt16LE(274,16);payload.writeUInt16LE(3,18);payload.writeUInt32LE(1,20);payload.writeUInt16LE(6,24);
  const segment = Buffer.alloc(4);segment[0] = 255;segment[1] = 225;segment.writeUInt16BE(payload.length+2,2);
  const bytes = new Uint8Array(Buffer.concat([Buffer.from(jpeg.slice(0,2)),segment,payload,Buffer.from(jpeg.slice(2))]));assert.equal(inspectRaster(bytes).orientation,6);
  payload.writeUInt32LE(0xffffffff,10);assert.doesNotThrow(() => inspectRaster(new Uint8Array(Buffer.concat([Buffer.from(jpeg.slice(0,2)),segment,payload,Buffer.from(jpeg.slice(2))]))));
});
test('raster dimension, per-asset and combined temporary/history pixels are preflighted',() => {
  const limits = resolveLimits({rasterDimension:100,assetPixels:10000,totalPixels:20000});checkImageSize({width:100,height:100},limits);
  for (const [info,retained,extra] of [[{width:101,height:1},0,0],[{width:100,height:100},1,0],[{width:100,height:100},0,1]]) assert.throws(() => checkImageSize(info,limits,retained,extra),code('LIMIT_EXCEEDED'));
  assert.equal(MAX_IMAGE_BYTES,20*1024*1024);
});
test('native documents accept static WebP bytes and reject MIME/dimension/container/animation mismatch',() => {
  const d = fixture();d.assets[0] = {id:'asset',mime:'image/webp',width:425,height:550,data:base64FromBytes(webp)};assert.equal(validateDocument(d).assets[0].mime,'image/webp');
  for (const patch of [{mime:'image/jpeg'},{width:426},{data:png()},{data:'not base64!'}]) assert.throws(() => validateDocument({...d,assets:[{...d.assets[0],...patch}]}),code('INVALID_DOCUMENT'));
  const animated = webp.slice();if (String.fromCharCode(...animated.slice(12,16)) === 'VP8X') {animated[20] |= 2;assert.throws(() => inspectRaster(animated,{allowAnimation:false}),code('DECODE_FAILED'));}
  assert.throws(() => validateDocument(d,{assetBytes:100}),code('LIMIT_EXCEEDED'));
});
test('PNG chunk preflight rejects animation, truncation and excessive containers before decode',() => {
  const p = bytesFromBase64(png(2,3)),chunk = Buffer.alloc(20);chunk.writeUInt32BE(8);chunk.write('acTL',4);chunk.writeUInt32BE(1,8);
  const animated = new Uint8Array(Buffer.concat([p.slice(0,33),chunk,p.slice(33)]));assert.throws(() => inspectRaster(animated,{allowAnimation:false}),code('DECODE_FAILED'));
  const d = fixture();d.assets[0] = {id:'asset',mime:'image/png',width:2,height:3,data:base64FromBytes(animated)};assert.throws(() => validateDocument(d),code('INVALID_DOCUMENT'));
  assert.throws(() => inspectRaster(p.slice(0,-1)),code('DECODE_FAILED'));
  const empty = Buffer.alloc(12);empty.write('tEXt',4);const excessive = new Uint8Array(Buffer.concat([p.slice(0,33),...Array(10001).fill(empty),p.slice(33)]));assert.throws(() => inspectRaster(excessive),code('DECODE_FAILED'));
});
test('duplicate PNG headers cannot disagree with the dimensions used for raster budgets',() => {
  const small=bytesFromBase64(png(1,1)),large=bytesFromBase64(png(32,32)),d=fixture();
  for(const header of [small.subarray(8,33),large.subarray(8,33)]) {
    const bytes=new Uint8Array(Buffer.concat([small.subarray(0,33),header,small.subarray(33)]));
    assert.throws(()=>inspectRaster(bytes,{allowAnimation:false}),code('DECODE_FAILED'));
    d.assets[0]={id:'asset',mime:'image/png',width:1,height:1,data:base64FromBytes(bytes)};
    assert.throws(()=>validateDocument(d),code('INVALID_DOCUMENT'));
  }
});

test('ordinary artwork Undo/redo does not overwrite later independent active-layer choices',() => {
  const s = state(),original = s.getActiveLayer(),top = s.createLayer();s.renameLayer(top,'Renamed');s.setActiveLayer(original);s.undo();assert.equal(s.getActiveLayer(),original);s.redo();assert.equal(s.getActiveLayer(),original);s.destroy();
});
test('image import previews are transient; commit inserts above captured target and restores exact native/active state on Undo/redo',async () => {
  const s = state();await s.load(fixture());const above = s.createLayer({name:'Above'});s.setActiveLayer('layer');s.setSelection(['line']);const before = s.save(),revision = s.getRevision(),old = s.document.layers[0],events = [];s.on('change',e => events.push(e));
  const context = await s.beginImageImport([100,200]),a = asset(),r = resource();assert.equal(s.busy,true);s.previewImageImport(context,a,'Picture');assert.deepEqual(s.save(),before);assert.equal(s.getRevision(),revision);assert.deepEqual(s.getSelection(),['line']);
  const {layerId:id,revision:importRevision,warnings} = await s.commitImageImport(context,a,r,'Picture'),after = s.save();assert.equal(importRevision,s.getRevision());assert.deepEqual(warnings,[]);assert.deepEqual(after.layers.map(l => l.id),['layer',id,above]);assert.equal(s.document.layers[0],old);assert.equal(s.getActiveLayer(),id);assert.deepEqual(s.getSelection(),[]);assert.equal(s.busy,false);assert.equal(events.length,1);assert.equal(events[0].label,'Import image');assert.equal(events[0].source,'import');
  const l = after.layers[1];assert.deepEqual(l.offset,[100,200]);assert.deepEqual([l.elements[0].x,l.elements[0].y,l.elements[0].width,l.elements[0].height],[-1,-1.5,2,3]);assert.equal(l.locked,false);assert.equal(s.assets.get('photo'),r.image);
  s.undo();assert.deepEqual(s.save(),before);assert.equal(s.getActiveLayer(),'layer');assert.equal(r.closed,0);s.redo();assert.deepEqual(s.save(),after);assert.equal(s.getActiveLayer(),id);s.destroy();assert.equal(r.closed,1);
});
test('capture insertion and center independently of navigation/active-layer session changes while decoding',async () => {
  const s = state(),original = s.getActiveLayer(),upper = s.createLayer({name:'Top'});s.setActiveLayer(original);const center = [20,30],context = await s.beginImageImport(center);center[0] = 999;s.setActiveLayer(upper);
  const {layerId:id} = await s.commitImageImport(context,asset(),resource());assert.deepEqual(s.save().layers.map(l => l.id),[original,id,upper]);assert.deepEqual(s.save().layers[1].offset,[20,30]);s.destroy();
});
test('pending import blocks content and concurrent imports but cancellation preserves revision/selection/redo',async () => {
  const s = state();await s.load(fixture());s.translateLayer('layer',[1,0]);s.undo();s.setSelection(['line']);const before = s.save(),revision = s.getRevision(),c = await s.beginImageImport([0,0]);
  assert.throws(() => s.createLayer(),code('BUSY'));await assert.rejects(s.beginImageImport([0,0]),code('BUSY'));s.cancelImageImport(c);assert.equal(c.signal.aborted,true);assert.equal(s.busy,false);assert.deepEqual(s.save(),before);assert.equal(s.getRevision(),revision);assert.equal(s.canRedo(),true);assert.deepEqual(s.getSelection(),['line']);
  const r = resource();await assert.rejects(s.commitImageImport(c,asset(),r),code('CANCELLED'));assert.equal(r.closed,1);s.destroy();
});
test('load/destroy supersede pending import, close stale resources and never modify the replacement',async () => {
  const s = state(),c = await s.beginImageImport([0,0]);await s.load(fixture());const before = s.save(),r = resource();await assert.rejects(s.commitImageImport(c,asset(),r),code('CANCELLED'));assert.equal(r.closed,1);assert.deepEqual(s.save(),before);
  const next = await s.beginImageImport([0,0]);s.destroy();const q = resource();await assert.rejects(s.commitImageImport(next,asset(),q),code('DESTROYED'));assert.equal(q.closed,1);
});
test('resource and document limits fail atomically and dispose transferred resources',async () => {
  for (const limits of [{elements:1},{jsonBytes:600},{assetBytes:50}]) {
    const s = state({limits});
    if (limits.elements) {const d = s.save();d.layers[0].elements = [{id:'line',type:'line',transform:[1,0,0,1,0,0],start:[0,0],end:[10,0],stroke:'#112233',strokeWidth:2,lineCap:'round'}];await s.load(d);}
    const before = s.save(),revision = s.getRevision(),c = await s.beginImageImport([0,0]),r = resource();
    await assert.rejects(s.commitImageImport(c,asset(),r),code('LIMIT_EXCEEDED'));assert.equal(r.closed,1);assert.deepEqual(s.save(),before);assert.equal(s.getRevision(),revision);assert.equal(s.busy,false);s.destroy();
  }
});
test('retained asset budgets include Undo resources and release them when history is reset',async () => {
  const s = state({limits:{assets:1}}),c = await s.beginImageImport([0,0]),r = resource();await s.commitImageImport(c,asset(),r);s.undo();assert.equal(r.closed,0);
  await assert.rejects(s.beginImageImport([0,0]),code('LIMIT_EXCEEDED'));await s.load(s.save());assert.equal(r.closed,1);const next = await s.beginImageImport([0,0]);assert.equal(next.retained.count,0);s.cancelImageImport(next);s.destroy();
});
test('read-only/destroyed/layer limits reject before starting and locked layers still permit a new image layer',async () => {
  const ro = state({readOnly:true});await assert.rejects(ro.beginImageImport([0,0]),code('READ_ONLY'));ro.destroy();
  const full = state({limits:{layers:1}});await assert.rejects(full.beginImageImport([0,0]),code('LIMIT_EXCEEDED'));full.destroy();
  const s = state(),id = s.getActiveLayer();s.setLayerLocked(id,true);const c = await s.beginImageImport([0,0]);await s.commitImageImport(c,asset(),resource());assert.equal(s.save().layers[1].locked,false);s.destroy();await assert.rejects(s.beginImageImport([0,0]),code('DESTROYED'));
});
test('reentrant async import starts after current event batch without corrupting native history',async () => {
  const s = state(),order = [],gate = deferred();s.on('change',e => {order.push(e.label);if (e.label === 'New layer') s.beginImageImport([0,0]).then(gate.resolve,gate.reject);});s.on('historychange',() => order.push('history'));
  s.createLayer();const c = await gate.promise;assert.deepEqual(order,['New layer','history']);await s.commitImageImport(c,asset(),resource());assert.deepEqual(order,['New layer','history','Import image','history']);s.destroy();
});
