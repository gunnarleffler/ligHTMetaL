import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ShapeInput} from '../../../src/etch/input/shapes.js';
import {ToolSession,SHAPE_TOOLS,isLineTool} from '../../../src/etch/tools.js';
import {EditorState} from '../../../src/etch/state.js';
import {AssetPool} from '../../../src/etch/assets.js';
import {code} from './helpers.js';

const near = (a,b) => assert.ok(Math.abs(a-b) < 1e-9,`${a} != ${b}`);
const session = () => new ToolSession();
const input = (tool='rect',extra={}) => new ShapeInput({tool,view:{zoom:1,pan:[0,0]},offset:[0,0],settings:session().getSettings(tool),...extra});
const shape = (tool='rect',start=[10,20],end=[50,70],extra={}) => {
  const p = input(tool,extra);p.add({},start);p.add({},end);return p.element();
};
const state = options => new EditorState({decode:async () => new AssetPool(),...options});

test('shape preferences, last Shapes choice and Pen settings remain independent and detached',() => {
  let changes = 0;const a = new ToolSession({onChange:() => changes++}),b = session();
  assert.equal(a.getShapeTool(),'rect');
  assert.deepEqual(a.getSettings('line'),{stroke:'#24292F',strokeWidth:2});
  assert.deepEqual(a.getSettings('rect'),{stroke:'#24292F',strokeWidth:2,fill:null});
  a.setSettings('rect',{fill:'#aabbcc',strokeWidth:8});a.setSettings('ellipse',{stroke:'#ff00ff'});
  a.setTool('ellipse');a.setTool('hand');a.setTool('pen');
  assert.equal(a.getShapeTool(),'ellipse');assert.equal(b.getShapeTool(),'rect');
  assert.deepEqual(a.getSettings('rect'),{stroke:'#24292F',strokeWidth:8,fill:'#AABBCC'});
  assert.deepEqual(a.getSettings('pen'),{color:'#24292F',width:3,pressure:true});
  const detached = a.getSettings('rect');detached.strokeWidth = 55;assert.equal(a.getSettings('rect').strokeWidth,8);
  const count = changes;a.setSettings('rect',{fill:'#aabbcc'});a.setTool('pen');assert.equal(changes,count);
});

test('shape settings reject invisible/transparent/unsupported/invalid patches atomically',() => {
  const a = session();
  for (const tool of SHAPE_TOOLS) {
    const before = a.getSettings(tool);
    for (const patch of [null,[],{color:'#112233'},{strokeWidth:0},{strokeWidth:65},{strokeWidth:NaN},{stroke:'#1234'},{opacity:1},{stroke:null}]) {
      assert.throws(() => a.setSettings(tool,patch),code('INVALID_ARGUMENT'));assert.deepEqual(a.getSettings(tool),before);
    }
  }
  assert.throws(() => a.setSettings('line',{fill:'#112233'}),code('INVALID_ARGUMENT'));
  for (const tool of ['rect','ellipse']) {
    a.setSettings(tool,{fill:'#abcdef',stroke:null,strokeWidth:64});
    assert.equal(a.getSettings(tool).fill,'#ABCDEF');
    assert.throws(() => a.setSettings(tool,{fill:null}),code('INVALID_ARGUMENT'));
    assert.throws(() => a.setSettings(tool,{fill:'transparent'}),code('INVALID_ARGUMENT'));
    a.setSettings(tool,{stroke:'#123456',fill:null});assert.equal(a.getSettings(tool).strokeWidth,64);
  }
  for (const tool of ['shapes','unknown','__proto__',new String('pen'),null]) assert.throws(() => a.setTool(tool),code('INVALID_ARGUMENT'));
});

test('shape endpoints normalize CSS to layer-local world coordinates; reverse drags have positive dimensions',() => {
  const options = {view:{zoom:2,pan:[10,20]},offset:[100,-50]};
  for (const tool of SHAPE_TOOLS) {
    const p = input(tool,options);p.add({pressure:0.01},[210,120]);p.add({pressure:0.99},[170,80]);const e = p.element();
    assert.deepEqual(e.transform,[1,0,0,1,0,0]);assert.equal(e.strokeWidth,2);assert.equal(Object.hasOwn(e,'pressure'),false);
    if (tool === 'line') {assert.deepEqual(e.start,[0,100]);assert.deepEqual(e.end,[-20,80]);assert.equal(e.lineCap,'round');}
    else if (tool === 'arrow') {assert.equal(e.type,'path');assert.deepEqual(e.commands[0],['M',0,100]);assert.deepEqual(e.commands[1],['L',-20,80]);assert.equal(e.commands.length,5);assert.equal(e.lineCap,'round');}
    else if (tool === 'rect') {assert.equal(e.x,-20);assert.equal(e.y,80);assert.equal(e.width,20);assert.equal(e.height,20);}
    else {assert.equal(e.cx,-10);assert.equal(e.cy,90);assert.equal(e.rx,10);assert.equal(e.ry,10);}
  }
  for (const x of [-30,30]) for (const y of [-20,20]) {
    const e = shape('rect',[0,0],[x,y]);assert.equal(e.width,30);assert.equal(e.height,20);assert.equal(e.x,Math.min(0,x));assert.equal(e.y,Math.min(0,y));
  }
});

test('Shift snaps lines to all eight 45-degree directions without changing length',() => {
  for (let i = 0;i < 8;i++) {
    const p = input('line'),angle = i*Math.PI/4+0.1;
    p.add({},[10,20]);p.add({shiftKey:true},[10+100*Math.cos(angle),20+100*Math.sin(angle)]);
    const e = p.element();near(e.end[0],10+100*Math.cos(i*Math.PI/4));near(e.end[1],20+100*Math.sin(i*Math.PI/4));
    near(Math.hypot(e.end[0]-10,e.end[1]-20),100);
  }
});

test('Shift square/circle uses the larger extent and preserves anchor/quadrant; release restores raw endpoint',() => {
  for (const tool of ['rect','ellipse']) for (const dx of [-40,40]) for (const dy of [-10,10]) {
    const p = input(tool);p.add({},[100,100]);p.add({},[100+dx,100+dy]);
    p.setConstrained(true);let e = p.element();
    if (tool === 'rect') {assert.equal(e.width,40);assert.equal(e.height,40);assert.equal(e.x,dx < 0 ? 60 : 100);assert.equal(e.y,dy < 0 ? 60 : 100);}
    else {assert.equal(e.rx,20);assert.equal(e.ry,20);assert.equal(e.cx,dx < 0 ? 80 : 120);assert.equal(e.cy,dy < 0 ? 80 : 120);}
    p.setConstrained(false);e = p.element();assert.equal(tool === 'rect' ? e.height : e.ry*2,10);
  }
  const p = input('rect');p.add({},[0,0]);p.add({shiftKey:true},[30,0]);assert.equal(p.element().height,30);
});

test('shape taps and tiny/flat boxes are no-ops at every zoom, measured in CSS pixels',() => {
  for (const tool of SHAPE_TOOLS) for (const zoom of [0.1,1,8]) {
    const p = input(tool,{view:{zoom,pan:[0,0]}});assert.equal(p.element(),null);p.add({},[0,0]);assert.equal(p.element(),null);
    p.add({},isLineTool(tool) ? [1.999,0] : [1.999,20]);assert.equal(p.element(),null);
    p.add({},[2,2]);assert.ok(p.element());
    p.add({},isLineTool(tool) ? [0,0] : [20,0]);assert.equal(p.element(),null);
  }
});

test('shape settings and returned geometry do not alias snapshots; invalid coordinates are rejected',() => {
  const settings = session().getSettings('line'),p = input('line',{settings});
  settings.strokeWidth = 20;p.add({},[10,20]);p.add({},[50,70]);const e = p.element();
  assert.equal(e.strokeWidth,2);e.start[0] = 999;e.transform[0] = 9;assert.deepEqual(p.element().start,[10,20]);
  const screen = p.lastScreen;screen[0] = 999;assert.deepEqual(p.lastScreen,[50,70]);
  for (const position of [[Infinity,0],[NaN,2],[10_000_001,0]]) assert.throws(() => input().add({},position),code('INVALID_ARGUMENT'));
});

test('fill-only shape canonicalizes unused width to zero without changing the width preference',() => {
  const a = session();a.setSettings('ellipse',{fill:'#112233',stroke:null,strokeWidth:12});
  const e = shape('ellipse',[0,0],[40,30],{settings:a.getSettings('ellipse')});
  assert.equal(e.stroke,null);assert.equal(e.strokeWidth,0);assert.equal(e.fill,'#112233');assert.equal(a.getSettings('ellipse').strokeWidth,12);
});

test('all shapes preview without durable state, commit once, clear selection and undo/redo exactly',() => {
  for (const tool of SHAPE_TOOLS) {
    const s = state(),changes = [];s.on('change',e => changes.push(e));
    const before = s.save(),revision = s.getRevision(),context = s.prepareDrawing(tool),e = shape(tool);
    const preview = s.previewDrawing(context,e);preview.elements[0].transform[0] = 9;
    assert.deepEqual(s.save(),before);assert.equal(s.getRevision(),revision);assert.equal(s.canUndo(),false);
    s.commitDrawing(context,e);const after = s.save();assert.equal(changes.length,1);assert.match(changes[0].label,/^Draw /);
    assert.equal(after.layers[0].elements[0].transform[0],1);s.undo();assert.deepEqual(s.save(),before);s.redo();assert.deepEqual(s.save(),after);
    s.setSelection([e.id]);const next = s.prepareDrawing(tool);s.commitDrawing(next,shape(tool));assert.deepEqual(s.getSelection(),[]);s.destroy();
  }
});

test('a below-threshold shape preserves document, revision, selection, redo and events',() => {
  const s = state();s.commitDrawing(s.prepareDrawing('rect'),shape());const id = s.save().layers[0].elements[0].id;
  s.commitDrawing(s.prepareDrawing('line'),shape('line'));s.undo();s.setSelection([id]);
  const before = s.save(),revision = s.getRevision();let changes = 0;s.on('change',() => changes++);
  const context = s.prepareDrawing('ellipse');assert.equal(s.previewDrawing(context,null),null);s.commitDrawing(context,null);
  assert.deepEqual(s.save(),before);assert.equal(s.getRevision(),revision);assert.deepEqual(s.getSelection(),[id]);assert.equal(s.canRedo(),true);assert.equal(changes,0);s.destroy();
});

test('arrows use one native open path with a width-scaled bounded head in every direction',() => {
  for(const width of [0.5,2,12,64]) for(const length of [3,10,1000]) for(let i=0;i<8;i++) {
    const angle=i*Math.PI/4,dx=length*Math.cos(angle),dy=length*Math.sin(angle);
    const e=shape('arrow',[10,20],[10+dx,20+dy],{settings:{stroke:'#112233',strokeWidth:width}});
    assert.equal(e.type,'path');assert.equal(e.fill,null);assert.equal(e.stroke,'#112233');assert.equal(e.strokeWidth,width);
    assert.deepEqual(e.commands[0],['M',10,20]);near(e.commands[1][1],10+dx);near(e.commands[1][2],20+dy);assert.deepEqual(e.commands[3],e.commands[1]);
    const head=Math.min(length,Math.max(12,4*width));
    for(const command of [e.commands[2],e.commands[4]]) {
      const hx=command[1]-10,hy=command[2]-20;
      near(hx*Math.cos(angle)+hy*Math.sin(angle),length-head);
      near(Math.abs(-hx*Math.sin(angle)+hy*Math.cos(angle)),head/2);
    }
  }
});

test('Arrow settings are separate from Line; Shift snaps shaft and head together from immutable endpoints',() => {
  const a=session();a.setSettings('arrow',{stroke:'#abcdef',strokeWidth:6});a.setTool('arrow');a.setTool('pen');assert.equal(a.getShapeTool(),'arrow');
  assert.deepEqual(a.getSettings('line'),{stroke:'#24292F',strokeWidth:2});assert.deepEqual(a.getSettings('arrow'),{stroke:'#ABCDEF',strokeWidth:6});
  assert.throws(()=>a.setSettings('arrow',{fill:'#112233'}),code('INVALID_ARGUMENT'));
  for(let i=0;i<8;i++) {
    const p=input('arrow'),angle=i*Math.PI/4+0.1;p.add({},[10,20]);p.add({},[10+100*Math.cos(angle),20+100*Math.sin(angle)]);
    const original=p.element();p.setConstrained(true);const e=p.element();near(e.commands[1][1],10+100*Math.cos(i*Math.PI/4));near(e.commands[1][2],20+100*Math.sin(i*Math.PI/4));
    p.setConstrained(false);assert.deepEqual(p.element(),original);e.commands[2][1]=999;assert.deepEqual(p.element(),original);
  }
});

test('Arrow path commands enforce aggregate and per-element limits atomically and round-trip unchanged',async()=>{
  for(const limits of [{points:4},{pointsPerElement:4},{derivedSegments:4},{derivedSegmentsPerElement:4}]) {
    const s=state({limits}),before=s.save(),revision=s.getRevision(),context=s.prepareDrawing('arrow');
    assert.throws(()=>s.previewDrawing(context,shape('arrow')),code('LIMIT_EXCEEDED'));assert.throws(()=>s.commitDrawing(context,shape('arrow')),code('LIMIT_EXCEEDED'));
    assert.deepEqual(s.save(),before);assert.equal(s.getRevision(),revision);assert.equal(s.canUndo(),false);s.destroy();
  }
  const s=state({limits:{points:5,pointsPerElement:5}});s.commitDrawing(s.prepareDrawing('arrow'),shape('arrow'));const saved=s.save();
  assert.equal(saved.layers[0].elements[0].commands.length,5);await s.load(saved);assert.deepEqual(s.save(),saved);
  const before=s.save();assert.throws(()=>s.commitDrawing(s.prepareDrawing('arrow'),shape('arrow')),code('LIMIT_EXCEEDED'));assert.deepEqual(s.save(),before);s.destroy();
});

test('shape commits enforce tool, immutable baseline, aggregate/per-element work and element limits atomically',() => {
  for (const [limits,tool] of [[{derivedSegments:4},'rect'],[{derivedSegmentsPerElement:4},'rect'],[{elements:1},'line']]) {
    const s = state({limits});
    if (limits.elements) s.commitDrawing(s.prepareDrawing('line'),shape('line'));
    const before = s.save(),revision = s.getRevision(),context = limits.elements ? null : s.prepareDrawing(tool);
    assert.throws(() => context ? s.commitDrawing(context,shape(tool)) : s.prepareDrawing(tool),code('LIMIT_EXCEEDED'));
    assert.deepEqual(s.save(),before);assert.equal(s.getRevision(),revision);s.destroy();
  }
  const s = state(),context = s.prepareDrawing('rect');
  assert.throws(() => s.commitDrawing(context,shape('ellipse')),code('INVALID_ARGUMENT'));
  s.createLayer();assert.throws(() => s.commitDrawing(context,shape()),code('CANCELLED'));s.destroy();
});

test('shapes do not consume the stored-point budget but combined painted world/JSON bounds still apply',async () => {
  const s = state({limits:{points:1}}),context = s.prepareDrawing('pen');
  s.commitDrawing(context,{id:'dot',type:'stroke',transform:[1,0,0,1,0,0],points:[[0,0,1]],color:'#112233',width:3,pressure:false});
  assert.throws(() => s.prepareDrawing('pen'),code('LIMIT_EXCEEDED'));s.commitDrawing(s.prepareDrawing('rect'),shape());
  const before = s.save(),revision = s.getRevision();
  const large = shape('line',[9_999_990,0],[9_999_999,0],{settings:{stroke:'#112233',strokeWidth:64}});
  assert.throws(() => s.commitDrawing(s.prepareDrawing('line'),large),code('INVALID_DOCUMENT'));
  assert.deepEqual(s.save(),before);assert.equal(s.getRevision(),revision);s.destroy();
  const source = state(),empty = source.save(),e = shape();source.destroy();
  const destination = {...empty,layers:[{...empty.layers[0],elements:[e]}]};
  const bounded = state({limits:{jsonBytes:Buffer.byteLength(JSON.stringify(destination))-1}});await bounded.load(empty);
  const rev = bounded.getRevision();assert.throws(() => bounded.commitDrawing(bounded.prepareDrawing('rect'),e),code('LIMIT_EXCEEDED'));
  assert.deepEqual(bounded.save(),empty);assert.equal(bounded.getRevision(),rev);assert.equal(bounded.canUndo(),false);bounded.destroy();
});
