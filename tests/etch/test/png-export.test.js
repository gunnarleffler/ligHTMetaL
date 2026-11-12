import {test} from 'node:test';
import assert from 'node:assert/strict';
import {planPNG} from '../../../src/etch/png-export.js';
import {EditorState} from '../../../src/etch/state.js';
import {AssetPool} from '../../../src/etch/assets.js';
import {code,fixture,png,deferred} from './helpers.js';

const empty = {background:null,assets:[],layers:[]};
const crop = (width,height) => ({bounds:{x:0,y:0,width,height},padding:0});
function imageDoc(width,height) {const d = fixture();d.assets[0] = {...d.assets[0],width,height,data:png(width,height)};return d;}

test('empty PNG falls back to centered 256-world-unit bounds then applies default padding',() => {
  const p = planPNG(empty);assert.deepEqual(p.bounds,{x:-144,y:-144,width:288,height:288});assert.deepEqual([p.width,p.height,p.pixels],[288,288,82944]);assert.deepEqual(p.view,{zoom:1,pan:[144,144]});
});
test('automatic PNG bounds include locked paint/offsets and omit hidden paint',() => {
  const rect = {...fixture().layers[0].elements.find(e => e.type === 'rect'),x:10,y:20,width:30,height:40,stroke:null,strokeWidth:0,transform:[1,0,0,1,0,0]};
  const d = {...empty,layers:[{visible:true,locked:true,offset:[5,-3],elements:[rect]},{visible:false,offset:[1000,1000],elements:[rect]}]};
  assert.deepEqual(planPNG(d).bounds,{x:-1,y:1,width:62,height:72});
});
test('explicit world crop replaces auto bounds; padding is world-sized and fractional output rounds upward',() => {
  const p = planPNG(empty,{bounds:{x:10,y:20,width:5,height:7},padding:0.25,scale:1.5});assert.deepEqual(p.bounds,{x:9.75,y:19.75,width:5.5,height:7.5});assert.deepEqual([p.width,p.height],[9,12]);assert.deepEqual(p.view,{zoom:1.5,pan:[-14.625,-29.625]});
  assert.deepEqual([planPNG(empty,{...crop(1,1),scale:0.001}).width,planPNG(empty,{...crop(1,1),scale:0.001}).height],[1,1]);
});
test('PNG rejects malformed options before allocating',() => {
  for (const options of [null,[],{other:true},{padding:null},{padding:-1},{padding:NaN},{scale:0},{scale:'2'},{scale:Infinity},{bounds:null},{bounds:[]},{bounds:{x:0,y:0,width:0,height:1}},{bounds:{x:0,y:0,width:1}},{bounds:{x:NaN,y:0,width:1,height:1}},{bounds:{x:0,y:0,width:1,height:1,url:'remote'}}]) assert.throws(() => planPNG(empty,options),code('INVALID_ARGUMENT'));
});
test('PNG accepts exact dimension/pixel ceilings, rejects first excess and suggests a verified smaller scale',() => {
  assert.equal(planPNG(empty,crop(8192,1)).width,8192);assert.equal(planPNG(empty,crop(4096,4096)).pixels,16_777_216);
  for (const options of [crop(8193,1),crop(4097,4097),{...crop(1e300,1e300),scale:1e300}]) {
    let error;try {planPNG(empty,options);}catch(e) {error = e;}assert.equal(error.code,'EXPORT_TOO_LARGE');assert.ok(error.details.suggestedScale > 0);const smaller = planPNG(empty,{...options,scale:error.details.suggestedScale});assert.ok(smaller.width <= 8192 && smaller.pixels <= 16_777_216);
  }
});
test('PNG respects downward host and currently available combined pixel limits',() => {
  const limits = {rasterDimension:64,assetPixels:100};assert.equal(planPNG(empty,crop(5,10),limits,100).pixels,50);
  assert.throws(() => planPNG(empty,crop(5,11),limits,100),code('EXPORT_TOO_LARGE'));assert.throws(() => planPNG(empty,crop(65,1),limits,100),code('EXPORT_TOO_LARGE'));
  try {planPNG(empty,crop(1,1),limits,0);assert.fail();}catch(e) {assert.equal(e.code,'EXPORT_TOO_LARGE');assert.equal(e.details.suggestedScale,0);}
});
test('PNG rejects overflowing coordinates/transforms without allocating',() => {
  for (const options of [{...crop(1,1),bounds:{x:1e308,y:0,width:1e308,height:1}},{...crop(1,1),bounds:{x:1e308,y:0,width:1,height:1},scale:100},{padding:Number.MAX_VALUE}]) assert.throws(() => planPNG(empty,options),code('INVALID_ARGUMENT'));
});
test('transient pixel leases include retained history and are idempotent across destroy',async () => {
  const s = new EditorState({decode:async () => new AssetPool(),limits:{totalPixels:64,assetPixels:64,rasterDimension:8}});await s.load(imageDoc(4,4));assert.equal(s.availableRasterPixels(),48);
  const release = s.reserveRasterPixels(32);assert.equal(s.availableRasterPixels(),16);assert.throws(() => s.reserveRasterPixels(17),code('LIMIT_EXCEEDED'));
  const before = s.save();await assert.rejects(s.load(imageDoc(8,4)),code('LIMIT_EXCEEDED'));assert.deepEqual(s.save(),before);assert.equal(s.availableRasterPixels(),16);
  release();release();assert.equal(s.availableRasterPixels(),48);await s.load(imageDoc(8,4));assert.equal(s.availableRasterPixels(),32);
  s.deleteLayer(s.getActiveLayer());assert.equal(s.availableRasterPixels(),32); // Undo owns the image.
  const last = s.reserveRasterPixels(32);s.destroy();last();assert.throws(() => s.availableRasterPixels(),code('DESTROYED'));
});
test('native load holds a transient decoding lease until completion/cancellation',async () => {
  const gate = deferred(),s = new EditorState({decode:() => gate.promise,limits:{totalPixels:64,assetPixels:64,rasterDimension:8}});
  const pending = s.load(imageDoc(4,4));assert.equal(s.availableRasterPixels(),48);s.cancel();assert.equal(s.availableRasterPixels(),48);gate.resolve(new AssetPool());await assert.rejects(pending,code('CANCELLED'));assert.equal(s.availableRasterPixels(),64);s.destroy();
});
