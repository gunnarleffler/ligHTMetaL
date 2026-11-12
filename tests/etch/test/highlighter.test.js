import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PenInput} from '../../../src/etch/input/pen.js';
import {ToolSession} from '../../../src/etch/tools.js';
import {EditorState} from '../../../src/etch/state.js';
import {AssetPool} from '../../../src/etch/assets.js';
import {validateDocument} from '../../../src/etch/validation.js';
import {elementBounds,traceElementPath} from '../../../src/etch/geometry/paths.js';
import {strokeOutline} from '../../../src/etch/geometry/stroke.js';
import {code} from './helpers.js';
const state=options=>new EditorState({decode:async()=>new AssetPool(),...options});
const highlight=(id='mark')=>({id,type:'highlight',transform:[1,0,0,1,0,0],points:[[0,0,1],[20,0,1]],color:'#FDE047',width:20,pressure:false,opacity:0.35});
const input=(tool='highlighter',settings=new ToolSession().getSettings(tool))=>new PenInput({tool,pointerType:'pen',view:{zoom:2,pan:[10,20]},offset:[5,10],settings,maxPoints:100});

test('Highlighter preferences are independent, detached and validated atomically',()=>{
  const a=new ToolSession(),b=new ToolSession();assert.deepEqual(a.getSettings('highlighter'),{color:'#FDE047',width:20,opacity:0.35});
  a.setSettings('highlighter',{color:'#abcdef',width:40,opacity:0.6});a.setTool('highlighter');a.setTool('pen');
  assert.deepEqual(a.getSettings('highlighter'),{color:'#ABCDEF',width:40,opacity:0.6});assert.equal(a.getSettings('pen').width,3);assert.equal(b.getSettings('highlighter').opacity,0.35);
  const before=a.getSettings('highlighter');before.width=1;assert.equal(a.getSettings('highlighter').width,40);
  for(const patch of [{opacity:0},{opacity:1.01},{opacity:NaN},{opacity:'0.5'},{pressure:true},{color:'transparent'},{width:0}]) assert.throws(()=>a.setSettings('highlighter',patch),code('INVALID_ARGUMENT'));
  assert.equal(a.getSettings('highlighter').opacity,0.6);
});

test('Highlighter samples are constant-width for pen/mouse/touch and capture opacity at gesture start',()=>{
  for(const pointerType of ['pen','mouse','touch']) {
    const settings=new ToolSession().getSettings('highlighter'),p=new PenInput({tool:'highlighter',pointerType,view:{zoom:2,pan:[10,20]},offset:[5,10],settings,maxPoints:100});
    p.add({pressure:0.1,timeStamp:1},[20,40]);settings.opacity=1;settings.width=64;
    p.add({pressure:0.9,timeStamp:2},[40,40]);p.add({pressure:0,timeStamp:3},[41,40],true);
    const e=p.element();assert.equal(e.type,'highlight');assert.equal(e.width,20);assert.equal(e.opacity,0.35);assert.equal(e.pressure,false);assert.deepEqual(e.points,[[0,0,1],[10,0,1],[10.5,0,1]]);
    e.points[0][0]=99;assert.equal(p.element().points[0][0],0);
  }
});

test('Pen pressure toggle produces full-width constant samples, persists in session and snapshots per gesture',()=>{
  const tools=new ToolSession();assert.equal(tools.getSettings('pen').pressure,true);tools.setSettings('pen',{pressure:false});
  tools.setTool('highlighter');tools.setTool('pen');assert.equal(tools.getSettings('pen').pressure,false);
  const p=input('pen',tools.getSettings('pen'));p.add({pressure:0.1,timeStamp:1},[20,40]);tools.setSettings('pen',{pressure:true});
  p.add({pressure:1,timeStamp:2},[40,40]);p.add({pressure:0,timeStamp:3},[41,40],true);
  assert.equal(p.element().pressure,false);assert.ok(p.element().points.every(p=>p[2]===1));
  const sensitive=input('pen',tools.getSettings('pen'));sensitive.add({pressure:0.1,timeStamp:1},[20,40]);assert.equal(sensitive.element().pressure,true);assert.equal(sensitive.element().points[0][2],0.1);
  for(const pressure of [0,1,null,'false',undefined])assert.throws(()=>tools.setSettings('pen',{pressure}),code('INVALID_ARGUMENT'));
});

test('Highlight native data whitelists opacity, normalizes constant pressure and rejects malformed appearances',()=>{
  const s=state(),doc=s.save();s.destroy();doc.layers[0].elements=[{...highlight(),points:[[0,0,0.2]],color:'#fde047',extra:'discard'}];
  const result=validateDocument(doc),e=result.layers[0].elements[0];assert.equal(e.opacity,0.35);assert.equal(e.pressure,false);assert.deepEqual(e.points,[[0,0,1]]);assert.equal(e.color,'#FDE047');assert.equal(Object.hasOwn(e,'extra'),false);
  for(const opacity of [undefined,null,0,0.049,1.001,Infinity,'0.5']) {const d=structuredClone(doc);d.layers[0].elements[0].opacity=opacity;assert.throws(()=>validateDocument(d),code('INVALID_DOCUMENT'));}
  for(const pressure of [true,undefined]) {const d=structuredClone(doc);d.layers[0].elements[0].pressure=pressure;assert.throws(()=>validateDocument(d),code('INVALID_DOCUMENT'));}
  result.layers[0].elements[0].points[0][0]=99;assert.equal(doc.layers[0].elements[0].points[0][0],0);
});

test('Highlight geometry and affine painted bounds reuse the shared opaque stroke outline',()=>{
  const e=highlight(),stroke={...e,type:'stroke'};delete stroke.opacity;
  assert.deepEqual(elementBounds(e,[10,20]),elementBounds(stroke,[10,20]));assert.deepEqual(strokeOutline(e),strokeOutline(stroke));
  const count=traceElementPath({moveTo(){},lineTo(){},bezierCurveTo(){},closePath(){}},e);assert.ok(count>0);
});

test('Highlight previews/Undo/redo/native load preserve opacity and one-command transaction boundaries',async()=>{
  const s=state(),before=s.save(),revision=s.getRevision(),events=[];s.on('change',e=>events.push(e));const context=s.prepareDrawing('highlighter');
  s.previewDrawing(context,highlight());assert.deepEqual(s.save(),before);assert.equal(s.getRevision(),revision);assert.equal(s.canUndo(),false);
  s.commitDrawing(context,highlight());const after=s.save();assert.equal(events.length,1);assert.equal(events[0].label,'Highlighter stroke');assert.equal(after.layers[0].elements[0].opacity,0.35);
  s.undo();assert.deepEqual(s.save(),before);s.redo();assert.deepEqual(s.save(),after);await s.load(after);assert.deepEqual(s.save(),after);s.destroy();
});

test('Highlights enforce combined sample/geometry budgets without truncating or changing revision/history',()=>{
  for(const limits of [{points:1},{pointsPerElement:1},{derivedSegments:1},{derivedSegmentsPerElement:1},{jsonBytes:100}]) {
    const s=state({limits}),before=s.save(),revision=s.getRevision();
    assert.throws(()=>s.commitDrawing(s.prepareDrawing('highlighter'),highlight()),code('LIMIT_EXCEEDED'));assert.deepEqual(s.save(),before);assert.equal(s.getRevision(),revision);assert.equal(s.canUndo(),false);s.destroy();
  }
  const s=state({limits:{points:2}});s.commitDrawing(s.prepareDrawing('highlighter'),highlight());assert.throws(()=>s.prepareDrawing('pen'),code('LIMIT_EXCEEDED'));assert.throws(()=>s.prepareDrawing('highlighter'),code('LIMIT_EXCEEDED'));s.destroy();
});
