import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PenInput} from '../../../src/etch/input/pen.js';
import {ToolSession} from '../../../src/etch/tools.js';
import {EditorState} from '../../../src/etch/state.js';
import {AssetPool} from '../../../src/etch/assets.js';
import {code,deferred,fixture} from './helpers.js';
const near = (a,b) => assert.ok(Math.abs(a-b) < 1e-10,`${a} != ${b}`);
const pen = extra => new PenInput({pointerType:'pen',view:{zoom:1,pan:[0,0]},offset:[0,0],settings:{color:'#112233',width:3},maxPoints:100,...extra});
const event = (pressure,timeStamp) => ({pressure,timeStamp});
const state = options => new EditorState({decode:async () => new AssetPool(),...options});
const dot = id => ({id,type:'stroke',transform:[1,0,0,1,0,0],points:[[0,0,1]],pressure:false,color:'#112233',width:3});

test('mouse/touch capture constant pressure in layer-local world coordinates, width independent of zoom',() => {
  for (const pointerType of ['mouse','touch']) {
    const p = pen({pointerType,view:{zoom:2,pan:[10,20]},offset:[100,-50]});
    p.add(event(0.2,1),[210,120]);p.add(event(0.9,2),[230,140],true);
    const e = p.element();assert.deepEqual(e.points,[[0,100,1],[10,110,1]]);
    assert.equal(e.pressure,false);assert.equal(e.width,3);assert.deepEqual(e.transform,[1,0,0,1,0,0]);
  }
});
test('pen pressure initializes, clamps, filters exactly once and never pinches at zero-pressure release',() => {
  const p = pen();p.add(event(0.2,1),[0,0]);p.add(event(0.8,2),[10,0]);p.add(event(1,3),[20,0]);p.add(event(0,4),[21,0],true);
  const pressures = p.element().points.map(p => p[2]);
  near(pressures[0],0.2);near(pressures[1],0.41);near(pressures[2],0.6165);near(pressures[3],0.6165);
  const clamped = pen();clamped.add(event(2,1),[0,0]);clamped.add(event(-1,2),[10,0]);
  near(clamped.element().points[1][2],0.65);
  for (const pressure of [undefined,0,NaN]) {
    const fallback = pen();fallback.add(event(pressure,1),[0,0]);near(fallback.element().points[0][2],0.5);
  }
});
test('subpixel dedup preserves first/last, short strokes, pressure-only changes and round taps',() => {
  const p = pen({pointerType:'mouse'});
  p.add(event(1,1),[0,0]);p.add(event(1,2),[0.1,0]);p.add(event(1,3),[0.2,0]);p.add(event(1,4),[0.3,0]);p.add(event(0,5),[0.35,0],true);
  assert.deepEqual(p.element().points,[[0,0,1],[0.3,0,1],[0.35,0,1]]);
  const tap = pen();tap.add(event(0.7,1),[5,6]);tap.add(event(0,2),[5,6],true);assert.equal(tap.element().points.length,1);
  const pressureOnly = pen();pressureOnly.add(event(0.1,1),[0,0]);pressureOnly.add(event(1,2),[0,0]);
  assert.equal(pressureOnly.element().points.length,2);
});
test('duplicate dispatched/coalesced samples do not refilter pressure; snapshots/settings are detached',() => {
  const p = pen(),sample = event(0.8,2);p.add(event(0.2,1),[0,0]);p.add(sample,[10,0]);p.add(sample,[10,0]);
  assert.equal(p.element().points.length,2);near(p.element().points[1][2],0.41);
  const e = p.element();e.points[0][0] = 999;e.transform[0] = 7;assert.equal(p.element().points[0][0],0);
});
test('input rejects sample/world limits before truncation, and never drops a tiny final endpoint',() => {
  const p = pen({pointerType:'mouse',maxPoints:2});p.add(event(1,1),[0,0]);p.add(event(1,2),[1,0]);
  assert.throws(() => p.add(event(0,3),[2,0],true),code('LIMIT_EXCEEDED'));assert.equal(p.element().points.length,2);
  assert.throws(() => pen().add(event(1,1),[Infinity,0]),code('INVALID_ARGUMENT'));
  assert.throws(() => pen().add(event(1,1),[10_000_001,0]),code('INVALID_ARGUMENT'));
  const tail = pen({pointerType:'mouse'});tail.add(event(1,1),[0,0]);tail.add(event(1,2),[0.1,0]);tail.add(event(1,2),[0.1,0],true);
  assert.deepEqual(tail.element().points,[[0,0,1],[0.1,0,1]]);
});
test('tool/pen/finger settings are validated, detached, independent per instance and survive switches',() => {
  let changes = 0;const a = new ToolSession({onChange:() => changes++}),b = new ToolSession({readOnly:true});
  assert.equal(a.getTool(),'pen');assert.equal(b.getTool(),'hand');
  assert.equal(a.getDrawWithTouch(),true);assert.equal(new ToolSession({drawWithTouch:false}).getDrawWithTouch(),false);
  a.setSettings('pen',{color:'#aabbcc',width:12});a.setTool('hand');a.setDrawWithTouch(true);a.setTool('pen');
  assert.deepEqual(a.getSettings('pen'),{color:'#AABBCC',width:12,pressure:true});assert.equal(b.getSettings('pen').width,3);
  const settings = a.getSettings('pen');settings.width = 20;assert.equal(a.getSettings('pen').width,12);
  const count = changes;a.setTool('pen');a.setSettings('pen',{color:'#aabbcc'});a.setDrawWithTouch(true);assert.equal(changes,count);
  for (const patch of [{width:0},{width:65},{width:NaN},{color:'#abcd'},{opacity:0.5},null]) assert.throws(() => a.setSettings('pen',patch),code('INVALID_ARGUMENT'));
  assert.throws(() => a.setTool('unknown'),code('INVALID_ARGUMENT'));assert.throws(() => a.setDrawWithTouch(1),code('INVALID_ARGUMENT'));
  assert.deepEqual(a.getSettings('pen'),{color:'#AABBCC',width:12,pressure:true});
  a.setDrawWithTouch(false);
  for (const tool of ['eraser','move-layer','hand','rect','pen']) {a.setTool(tool);assert.equal(a.getDrawWithTouch(),false);}
});
test('stroke previews are isolated; one commit appends canonically, changes once and undoes/redoes exactly',() => {
  const s = state(),before = s.save(),revision = s.getRevision(),events = [];
  s.on('change',e => events.push(e));const context = s.prepareDrawing('pen'),stroke = {...dot('new-ink'),extra:'discard'};
  const preview = s.previewDrawing(context,stroke);preview.elements[0].points[0][0] = 999;
  assert.deepEqual(s.save(),before);assert.equal(s.getRevision(),revision);assert.equal(s.canUndo(),false);
  s.commitDrawing(context,stroke);const after = s.save();
  assert.equal(events.length,1);assert.equal(events[0].label,'Pen stroke');assert.equal(after.layers[0].elements.length,1);
  assert.equal(Object.hasOwn(after.layers[0].elements[0],'extra'),false);
  stroke.points[0][0] = 123;assert.equal(s.save().layers[0].elements[0].points[0][0],0);
  s.undo();assert.deepEqual(s.save(),before);s.redo();assert.deepEqual(s.save(),after);
  assert.deepEqual(events.map(e => e.source),['edit','undo','redo']);s.destroy();
});
test('stroke baseline and every destination limit are enforced before any history/revision changes',() => {
  const s = state({limits:{points:2,pointsPerElement:2,derivedSegments:12}});
  const context = s.prepareDrawing('pen');s.commitDrawing(context,dot('one'));
  assert.throws(() => s.commitDrawing(context,dot('stale')),code('CANCELLED'));
  const next = s.prepareDrawing('pen');assert.equal(next.maxPoints,1);const before = s.save(),revision = s.getRevision();
  const tooMany = {...dot('long'),points:[[0,0,1],[1,0,1]]};
  assert.throws(() => s.commitDrawing(next,tooMany),code('LIMIT_EXCEEDED'));assert.deepEqual(s.save(),before);assert.equal(s.getRevision(),revision);
  s.commitDrawing(next,dot('two'));assert.throws(() => s.prepareDrawing('pen'),code('LIMIT_EXCEEDED'));s.destroy();
});
test('pen destination refuses read-only, locked/hidden, busy, changed active layer and destroyed states',async () => {
  const readOnly = state({readOnly:true});assert.throws(() => readOnly.prepareDrawing('pen'),code('READ_ONLY'));readOnly.destroy();
  const s = state(),id = s.getActiveLayer();s.setLayerLocked(id,true);assert.throws(() => s.prepareDrawing('pen'),code('LAYER_NOT_EDITABLE'));
  s.setLayerLocked(id,false);s.setLayerVisibility(id,false);assert.throws(() => s.prepareDrawing('pen'),code('LAYER_NOT_EDITABLE'));
  s.setLayerVisibility(id,true);const other = s.createLayer(),context = s.prepareDrawing('pen');s.setActiveLayer(id);
  assert.throws(() => s.commitDrawing(context,dot('wrong-layer')),code('CANCELLED'));s.setActiveLayer(other);s.destroy();
  assert.throws(() => s.prepareDrawing('pen'),code('DESTROYED'));
  const pending = deferred(),busy = state({decode:() => pending.promise}),load = busy.load(fixture());
  assert.throws(() => busy.prepareDrawing('pen'),code('BUSY'));pending.resolve(new AssetPool());await load;busy.destroy();
});
