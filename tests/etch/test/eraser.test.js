import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ToolSession} from '../../../src/etch/tools.js';
import {EditorState} from '../../../src/etch/state.js';
import {AssetPool} from '../../../src/etch/assets.js';
import {EraserInput} from '../../../src/etch/input/eraser.js';
import {SweptHitTester,HitBudget} from '../../../src/etch/geometry/hit-test.js';
import {apply,multiply,translate,scale} from '../../../src/etch/geometry/matrix.js';
import {code,deferred,fixture} from './helpers.js';
const identity = [1,0,0,1,0,0];
const layer = elements => ({id:'layer',name:'Marks',visible:true,locked:false,offset:[0,0],elements});
const line = (id='line',lineCap='butt') => ({id,type:'line',transform:identity,start:[0,0],end:[100,0],stroke:'#112233',strokeWidth:10,lineCap});
const rect = fill => ({id:'rect',type:'rect',transform:identity,x:0,y:0,width:100,height:100,stroke:'#112233',strokeWidth:2,lineJoin:'round',miterLimit:4,fill});
const path = (commands,paint={}) => ({id:'path',type:'path',transform:identity,commands,fill:'#112233',fillRule:'nonzero',stroke:null,strokeWidth:0,lineCap:'butt',lineJoin:'miter',miterLimit:4,...paint});
const box = (x,y,w,h) => [['M',x,y],['L',x+w,y],['L',x+w,y+h],['L',x,y+h],['Z']];
function hit(element,a,b=a,{radius=1,zoom=1,offset=[0,0],budget}={}) {const l = {...layer([element]),offset};return new SweptHitTester(l,zoom,{budget}).sweep(a,b,radius).length > 0;}
const state = options => new EditorState({decode:async () => new AssetPool(),...options});

test('eraser preferences are validated, detached, per-instance session state with no paint/pressure settings',() => {
  let changes = 0;const a = new ToolSession({onChange:() => changes++}),b = new ToolSession();
  assert.deepEqual(a.getSettings('eraser'),{radius:10,mode:'partial'});a.setSettings('pen',{width:13});a.setTool('ellipse');a.setTool('eraser');
  const settings = a.getSettings('eraser');settings.radius = 99;assert.equal(a.getSettings('eraser').radius,10);
  a.setSettings('eraser',{radius:24});assert.equal(b.getSettings('eraser').radius,10);assert.equal(a.getSettings('pen').width,13);assert.equal(a.getShapeTool(),'ellipse');
  for (const value of [0,0.9,128.01,Infinity,NaN,'10',null]) assert.throws(() => a.setSettings('eraser',{radius:value}),code('INVALID_ARGUMENT'));
  for (const patch of [{width:5},{color:'#112233'},{pressure:true},{radius:20,size:30},null,[]]) assert.throws(() => a.setSettings('eraser',patch),code('INVALID_ARGUMENT'));
  const count = changes;a.setTool('eraser');a.setSettings('eraser',{});assert.equal(changes,count);assert.equal(a.getSettings('eraser').radius,24);
});

test('sweep hits all crossed objects in reverse painter order, not just endpoints; repeated hits are omitted',() => {
  const elements = Array.from({length:3},(_,i) => ({...line(String(i)),transform:[1,0,0,1,i*100+50,50],start:[0,-5],end:[0,5],strokeWidth:1}));
  const t = new SweptHitTester(layer(elements),1);assert.deepEqual(t.sweep([0,50],[400,50],1),['2','1','0']);assert.deepEqual(t.sweep([400,50],[0,50],1),[]);
});

test('painted geometry rejects unfilled shape interiors and ellipse bounding-box corners',() => {
  assert.equal(hit(rect(null),[50,50]),false);assert.equal(hit(rect('#112233'),[50,50]),true);assert.equal(hit(rect(null),[-1,50]),true);
  const ellipse = {id:'e',type:'ellipse',transform:identity,cx:50,cy:50,rx:50,ry:30,stroke:'#112233',strokeWidth:2,fill:null};
  assert.equal(hit(ellipse,[50,50]),false);assert.equal(hit(ellipse,[1,21]),false);assert.equal(hit(ellipse,[50,19]),true);
  assert.equal(hit({...ellipse,fill:'#112233'},[50,50]),true);
});

test('fill rules, implicit closing segments, thin fills and cancelling subpaths are honored',() => {
  const commands = [...box(0,0,100,100),...box(20,20,60,60)];
  assert.equal(hit(path(commands,{fillRule:'evenodd'}),[50,50]),false);assert.equal(hit(path(commands),[50,50]),true);
  assert.equal(hit(path(commands,{fillRule:'evenodd'}),[10,50]),true);
  assert.equal(hit(path([['M',0,0],['L',100,0],['L',0,100]]),[25,25]),true);
  assert.equal(hit(path(box(0,0,100,1e-8)),[-20,-20],[120,20]),true);
  const reverse = [['M',0,0],['L',0,100],['L',100,100],['L',100,0],['Z']];
  assert.equal(hit(path([...box(0,0,100,100),...reverse]),[-5,50],[105,50]),false);
  assert.equal(hit(path([...box(0,0,100,100),...box(0,0,100,100)],{fillRule:'evenodd'}),[-5,50],[105,50]),false);
  assert.equal(hit(path([['M',0,0],['L',100,0]]),[50,0]),false);
});

test('CSS radius is independent of zoom and honors nonuniform affine transforms, skew, reflection and layer offsets',() => {
  for (const zoom of [0.1,1,8]) {
    const e = {...rect(null),transform:[1,0.3,2,-0.2,10,20]},offset = [30,-40];
    const matrix = multiply(scale(zoom),multiply(translate(...offset),e.transform));
    const edge = apply(matrix,[50,0]),inside = apply(matrix,[50,50]);
    assert.equal(hit(e,edge,edge,{zoom,offset}),true);
    if (zoom >= 1) assert.equal(hit(e,inside,inside,{zoom,offset}),false);
  }
  for (const zoom of [0.1,1,8]) {
    assert.equal(hit(line(),[50*zoom,5*zoom+2],[50*zoom,5*zoom+2],{zoom,radius:1}),false);
    assert.equal(hit(line(),[50*zoom,5*zoom+0.8],[50*zoom,5*zoom+0.8],{zoom,radius:1}),true);
  }
});

test('uniform strokes respect butt/round/square caps and bevel/round/miter joins, not expanded AABBs',() => {
  assert.equal(hit(line('l','butt'),[-4,0]),false);assert.equal(hit(line('l','round'),[-4,0]),true);assert.equal(hit(line('l','square'),[-4,0]),true);
  assert.equal(hit(line('l','round'),[-4,-4]),true);assert.equal(hit(line('l','butt'),[-4,-4]),false);
  assert.equal(hit(line('l','round'),[-5.8,-5.8]),false);assert.equal(hit(line('l','square'),[-5.8,-5.8]),true);
  const corner = path([['M',0,100],['L',0,0],['L',100,0]],{fill:null,stroke:'#112233',strokeWidth:20});
  assert.equal(hit({...corner,lineJoin:'miter'},[-9,-9]),true);
  assert.equal(hit({...corner,lineJoin:'bevel'},[-9,-9]),false);
  assert.equal(hit({...corner,lineJoin:'round'},[-9,-9]),false);
  assert.equal(hit({...corner,miterLimit:1},[-9,-9]),false);
  const zero = path([['M',0,0],['L',0,0]],{fill:null,stroke:'#112233',strokeWidth:10});assert.equal(hit(zero,[0,0]),false);
  assert.equal(hit({...zero,lineCap:'square'},[-4,-4]),true);assert.equal(hit({...zero,lineCap:'round'},[0,0]),true);
});

test('Q/C paths use shared normalized curves rather than their control-point hulls',() => {
  const q = path([['M',0,0],['Q',50,100,100,0]],{fill:null,stroke:'#112233',strokeWidth:2,lineCap:'round',lineJoin:'round'});
  assert.equal(hit(q,[50,50]),true);assert.equal(hit(q,[50,95]),false);assert.equal(hit(q,[-10,45],[110,45]),true);
  const c = path([['M',0,0],['C',0,100,100,100,100,0]],{fill:null,stroke:'#112233',strokeWidth:2});
  assert.equal(hit(c,[50,75]),true);assert.equal(hit(c,[50,99]),false);
});

test('pressure hit geometry uses the persisted smoothed filled outline, including pressure-only dots',() => {
  const e = {id:'ink',type:'stroke',transform:identity,points:[[0,0,0],[100,0,1]],width:20,color:'#112233',pressure:true};
  assert.equal(hit(e,[0,6]),false);assert.equal(hit(e,[100,9]),true);assert.equal(hit(e,[-6,0]),false);
  const dot = {...e,points:[[0,0,0],[0,0,1]]};assert.equal(hit(dot,[8,0]),true);assert.equal(hit(dot,[12,0]),false);
});

test('whole transformed image rectangles hit irrespective of PNG alpha, but AABB-only corners miss',() => {
  const e = {id:'i',type:'image',transform:[1,1,-1,1,50,0],x:0,y:0,width:20,height:20,assetId:'a'};
  assert.equal(hit(e,[50,20]),true);assert.equal(hit(e,[32,2]),false);assert.equal(hit(e,[0,20],[100,20]),true);
});

test('geometry, work and subdivision limits fail explicitly rather than skipping or partially erasing',() => {
  for (const config of [{maxSegmentsPerElement:2},{maxSegments:2},{maxWork:2}]) {
    assert.throws(() => hit(rect('#112233'),[-20,50],[120,50],{budget:new HitBudget(config)}),code('LIMIT_EXCEEDED'));
  }
});

test('input snapshots CSS radius/view and retains every queued/coalesced bend across frames, including the final segment',() => {
  const view = {zoom:2,pan:[20,-10]},settings = {radius:7},calls = [];
  const input = new EraserInput({view,settings,tester:{sweep:(a,b,r) => {calls.push([a,b,r]);return ['same',String(calls.length)];}}});
  input.add({},[30,0]);input.add({},[40,20]);input.add({},[30,0]);view.pan[0] = 999;view.zoom = 9;settings.radius = 100;
  assert.deepEqual(input.ids(),['same','1','2','3']);assert.deepEqual(calls,[[[10,10],[10,10],7],[[10,10],[20,30],7],[[20,30],[10,10],7]]);
  const screen = input.lastScreen;screen[0] = 99;assert.deepEqual(input.lastScreen,[30,0]);
  input.add({},[30,0]);input.ids();assert.equal(calls.length,3);input.add({},[50,0]);input.ids();assert.deepEqual(calls.at(-1),[[10,10],[30,10],7]);
});

test('input coordinates/sample limits are bounded, exact duplicates do not consume capacity',() => {
  const create = () => new EraserInput({layer:layer([]),view:{zoom:1,pan:[0,0]},settings:{radius:10},maxSamples:1});
  const input = create();input.add({},[0,0]);input.add({},[0,0]);assert.throws(() => input.add({},[1,0]),code('LIMIT_EXCEEDED'));
  for (const p of [[NaN,1],[Infinity,0],[1],Array(2),null,[10_000_001,0]]) assert.throws(() => create().add({},p),code('INVALID_ARGUMENT'));
});

test('preview is virtual; one erase preserves unhit identities/order/layers and selection survivors; undo restores original slots/assets',async () => {
  const s = state(),native = fixture();native.layers.push({...layer([]),id:'other'});await s.load(native);s.setActiveLayer('layer');s.setSelection(['stroke','line','image']);
  const before = s.save(),revision = s.getRevision(),originals = s.document.layers[0].elements,events = [];s.on('change',e => events.push(e));
  const context = s.prepareErase(),preview = s.previewErase(context,['stroke','image']);
  assert.deepEqual(preview.elements.map(e => e.id),['line','rect','ellipse','path']);assert.equal(preview.elements[0],originals[1]);
  assert.deepEqual(s.save(),before);assert.equal(s.getRevision(),revision);assert.equal(s.canUndo(),false);
  s.commitErase(context,['image','stroke']);const after = s.save();assert.equal(events.length,1);assert.equal(events[0].label,'Erase objects');
  assert.deepEqual(after.layers[1],before.layers[1]);assert.deepEqual(after.assets,[]);assert.deepEqual(s.getSelection(),['line']);assert.equal(s.getActiveLayer(),'layer');
  assert.equal(s.document.layers[0].elements[0],originals[1]);s.undo();assert.deepEqual(s.save(),before);s.redo();assert.deepEqual(s.save(),after);s.destroy();
});

test('empty-hit gestures preserve selection/redo/revision; erasing works with stored element/point capacity full',async () => {
  const s = state({limits:{elements:1,points:1,pointsPerElement:1}}),native = s.save();native.layers[0].elements = [{id:'dot',type:'stroke',transform:identity,points:[[0,0,1]],width:3,color:'#112233',pressure:false}];
  await s.load(native);s.translateLayer(s.getActiveLayer(),[10,0]);s.undo();s.setSelection(['dot']);const revision = s.getRevision(),context = s.prepareErase();
  assert.equal(s.previewErase(context,[]),null);s.commitErase(context,[]);assert.equal(s.getRevision(),revision);assert.equal(s.canRedo(),true);assert.deepEqual(s.getSelection(),['dot']);
  assert.throws(() => s.prepareDrawing('pen'),code('LIMIT_EXCEEDED'));s.commitErase(context,['dot']);assert.deepEqual(s.save().layers[0].elements,[]);assert.equal(s.canRedo(),false);s.destroy();
});

test('erase rejects foreign/invalid IDs and stale baselines atomically',async () => {
  const s = state();await s.load(fixture());const context = s.prepareErase(),before = s.save(),revision = s.getRevision();
  for (const ids of [null,new Set(['stroke']),['unknown'],['stroke','stroke'],[1],Array(1)]) {
    assert.throws(() => s.previewErase(context,ids),code('INVALID_ARGUMENT'));assert.throws(() => s.commitErase(context,ids),code('INVALID_ARGUMENT'));
  }
  assert.deepEqual(s.save(),before);assert.equal(s.getRevision(),revision);s.createLayer();
  assert.throws(() => s.previewErase(context,['stroke']),code('CANCELLED'));assert.throws(() => s.commitErase(context,['stroke']),code('CANCELLED'));
  const other = s.prepareErase();assert.throws(() => s.commitErase(other,['stroke']),code('INVALID_ARGUMENT'));s.setActiveLayer('layer');
  assert.throws(() => s.commitErase(other,[]),code('CANCELLED'));s.destroy();
});

test('eraser guards read-only/busy/hidden/locked/destroyed destinations, including empty-hit commands',async () => {
  const ro = state({readOnly:true});assert.throws(() => ro.prepareErase(),code('READ_ONLY'));ro.destroy();
  const s = state(),id = s.getActiveLayer(),context = s.prepareErase();s.setLayerLocked(id,true);assert.throws(() => s.prepareErase(),code('LAYER_NOT_EDITABLE'));
  s.setLayerLocked(id,false);s.setLayerVisibility(id,false);assert.throws(() => s.prepareErase(),code('LAYER_NOT_EDITABLE'));
  s.setLayerVisibility(id,true);s.destroy();assert.throws(() => s.previewErase(context,[]),code('DESTROYED'));
  const gate = deferred(),busy = state({decode:() => gate.promise}),load = busy.load(fixture());assert.throws(() => busy.prepareErase(),code('BUSY'));gate.resolve(new AssetPool());await load;busy.destroy();
});
