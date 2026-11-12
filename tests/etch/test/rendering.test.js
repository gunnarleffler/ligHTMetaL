import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PathCache,renderScene} from '../../../src/etch/rendering/canvas.js';
import {createScheduler} from '../../../src/etch/rendering/scheduler.js';
import {validateDocument} from '../../../src/etch/validation.js';
import {readFile} from 'node:fs/promises';
import {fixture} from './helpers.js';

class FakePath {
  static builds = 0;
  constructor() { FakePath.builds++; }
  moveTo() {} lineTo() {} quadraticCurveTo() {} bezierCurveTo() {} closePath() {} rect() {} ellipse() {}
}
test('path cache reuses identity, bounds retained complexity/entries, and clears', () => {
  FakePath.builds = 0;
  const cache = new PathCache(FakePath,{maxSegments:5,maxEntries:1});
  const a = fixture().layers[0].elements[2], b = {...a,id:'second'};
  assert.equal(cache.get(a),cache.get(a)); assert.equal(FakePath.builds,1);
  cache.get(b); cache.get(a); assert.equal(FakePath.builds,3);
  cache.clear(); cache.get(a); assert.equal(FakePath.builds,4);
  cache.get(b,{retain:false});cache.get(b,{retain:false});assert.equal(FakePath.builds,6);
  cache.get(a);assert.equal(FakePath.builds,6); // Wet snapshots do not evict committed paths.
});
test('renderer paints visible layers/elements in order with explicit DPR/view/layer/element transforms', () => {
  const d = fixture(); d.background = '#FFFFFF';
  d.layers.push({id:'upper',name:'Upper',visible:true,locked:true,offset:[20,30],elements:[{...d.layers[0].elements[2],id:'blue',fill:'#0000FF',stroke:null}]});
  d.layers.push({...d.layers[1],id:'hidden',visible:false,elements:[{...d.layers[1].elements[0],id:'hidden-rect',fill:'#000000'}]});
  const calls = [], context = {
    canvas:{width:800,height:600}, setTransform(...matrix) {calls.push(['matrix',matrix]);},clearRect() {},
    fillRect() {calls.push(['background',this.fillStyle]);},
    fill(_path,rule) {calls.push(['fill',this.fillStyle,rule]);},
    stroke() {calls.push(['stroke',this.strokeStyle,this.lineCap,this.lineJoin,this.miterLimit]);},
    drawImage(image) {calls.push(['image',image]);},
  };
  renderScene(context,d,{width:400,height:300,dpr:2,view:{zoom:2,pan:[100,50]},assets:new Map([['asset','decoded']]),cache:new PathCache(FakePath)});
  assert.deepEqual(calls[0],['matrix',[1,0,0,1,0,0]]);
  assert.deepEqual(calls[1],['background','#FFFFFF']);
  assert.ok(calls.some(c => c[0] === 'matrix' && JSON.stringify(c[1]) === JSON.stringify([4,0,0,4,240,20])));
  assert.deepEqual(calls.filter(c => c[0] === 'fill').at(-1),['fill','#0000FF','nonzero']);
  assert.equal(calls.some(c => c[0] === 'fill' && c[1] === '#000000'),false);
  assert.ok(calls.some(c => c[0] === 'image' && c[1] === 'decoded'));
});
test('culling skips offscreen elements, virtual layer replacement stays at its painter position', () => {
  const rect = fixture().layers[0].elements[2];
  const d = {background:null,layers:[{id:'lower',visible:true,offset:[0,0],elements:[rect]},
    {id:'upper',visible:true,offset:[0,0],elements:[{...rect,id:'upper-rect',fill:'#0000FF',stroke:null},
      {...rect,id:'offscreen',transform:[1,0,0,1,100000,0],fill:'#000000',stroke:null}]}]};
  const colors = [], context = {canvas:{width:200,height:200},setTransform(){},clearRect(){},fill(){colors.push(this.fillStyle);},stroke(){}};
  renderScene(context,d,{width:200,height:200,view:{zoom:1,pan:[0,0]},assets:new Map(),cache:new PathCache(FakePath),
    preview:{layerId:'lower',elements:[{...rect,fill:'#00FF00',stroke:null}]}});
  assert.deepEqual(colors,['#00FF00','#0000FF']);
});
test('frame scheduler coalesces and cancels only its own pending frame', () => {
  const pending = new Map(); let id = 0, runs = 0;
  const window = {requestAnimationFrame(fn) {pending.set(++id,fn);return id;},cancelAnimationFrame(key) {pending.delete(key);}};
  const scheduler = createScheduler(window,() => runs++);
  scheduler.request(); scheduler.request(); assert.equal(pending.size,1);
  const [key,fn] = [...pending][0]; pending.delete(key); fn(); assert.equal(runs,1);
  scheduler.request(); scheduler.destroy(); assert.equal(pending.size,0);
  scheduler.request(); assert.equal(pending.size,0);
});
test('original demo native fixture is valid and includes all supported native types', async () => {
  const d = validateDocument(await readFile(new URL('../../../examples/etch/fixtures/sample.etch.json',import.meta.url),'utf8'));
  assert.deepEqual([...new Set(d.layers.flatMap(l => l.elements.map(e => e.type)))].sort(),['ellipse','image','line','path','rect','stroke']);
});
