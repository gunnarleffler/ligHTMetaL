import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SelectionResizeInput} from '../../../src/etch/input/selection.js';
import {RESIZE_HANDLES,selectionBounds,interactionBounds,pickResizeHandle,handlePosition} from '../../../src/etch/geometry/selection.js';
import {apply,multiply,singularValues} from '../../../src/etch/geometry/matrix.js';
import {EditorState} from '../../../src/etch/state.js';
import {AssetPool} from '../../../src/etch/assets.js';
import {fixture,code} from './helpers.js';

const rect = {id:'r',type:'rect',transform:[1,0,0,1,0,0],x:10,y:10,width:100,height:80,fill:'#112233',stroke:null,strokeWidth:0,lineJoin:'round',miterLimit:4};
const layer = () => ({id:'l',offset:[10,20],elements:[structuredClone(rect)]});
const state = options => new EditorState({decode:async()=>new AssetPool(),...options});
function input({name='se',zoom=1,image=false,elements,shift=false}={}) {
  const l=layer();if(image) l.elements[0].type='image';if(elements) l.elements=elements;
  const view={zoom,pan:[27,-19]},bounds=interactionBounds(selectionBounds(l,l.elements.map(e=>e.id)),zoom),handle=RESIZE_HANDLES.find(h=>h[0]===name);
  const start=handlePosition(bounds,handle).map((n,i)=>n*zoom+view.pan[i]);
  const p=new SelectionResizeInput({view,layer:l,selection:l.elements.map(e=>e.id),bounds,handle});p.add({shiftKey:shift},start);
  return {p,l,bounds,handle,start,view};
}
const close = (a,b) => a.forEach((n,i)=>assert.ok(Math.abs(n-b[i])<1e-7,`${a} != ${b}`));

test('all eight handles resize around the opposite anchor using captured CSS displacement and layer offset',()=>{
  for(const name of RESIZE_HANDLES.map(h=>h[0])) for(const zoom of [0.1,1,2,8]) {
    const {p,l,bounds:b,handle:[,u,v],start}=input({name,zoom});
    const dx=u===0.5?0:(2*u-1)*40,dy=v===0.5?0:(2*v-1)*32;
    p.add({},start.map((n,i)=>n+[dx,dy][i]*zoom));const m=p.matrix();
    close([m[0],m[3]],[u===0.5?1:1.4,v===0.5?1:1.4]);
    const anchor=[b.x+(1-u)*b.width-l.offset[0],b.y+(1-v)*b.height-l.offset[1]];close(apply(m,anchor),anchor);
    p.add({},start.map((n,i)=>n+[dx,dy][i]*zoom));assert.deepEqual(p.matrix(),m); // no accumulation
  }
});
test('ordinary corners are free by default; Shift locks aspect and updates without another sample',()=>{
  const {p,start}=input();p.add({},[start[0]+50,start[1]+8]);assert.equal(p.matrix()[0],1.5);assert.equal(p.matrix()[3],1.1);
  p.setConstrained(true);assert.equal(p.matrix()[0],1.5);assert.equal(p.matrix()[3],1.5);
  p.setConstrained(false);assert.equal(p.matrix()[3],1.1);
});
test('a single image locks corner aspect by default; Shift unlocks; image side handles remain one-axis',()=>{
  const {p,start}=input({image:true});p.add({},[start[0]+50,start[1]+8]);assert.equal(p.matrix()[0],1.5);assert.equal(p.matrix()[3],1.5);
  p.setConstrained(true);assert.equal(p.matrix()[0],1.5);assert.equal(p.matrix()[3],1.1);
  for(const shift of [false,true]) {const {p,start}=input({image:true,name:'e',shift});p.add({},[start[0]+50,start[1]+100]);assert.equal(p.matrix()[0],1.5);assert.equal(p.matrix()[3],1);}
  const l=layer();l.elements[0].type='image';l.elements.push({...rect,id:'second'});
  const multi=input({elements:l.elements});multi.p.add({},[multi.start[0]+50,multi.start[1]+8]);assert.equal(multi.p.matrix()[3],1.1);
});
test('tiny drags, irrelevant side-axis motion and origin returns are identity transforms',()=>{
  const {p,start}=input();for(const delta of [[0,0],[1,1],[0,0]]){p.add({},start.map((n,i)=>n+delta[i]));assert.deepEqual(p.matrix(),[1,0,0,1,0,0]);}
  p.add({},[start[0]+50,start[1]+50]);p.add({},start);assert.deepEqual(p.matrix(),[1,0,0,1,0,0]);
  const side=input({name:'e'});side.p.add({},[side.start[0],side.start[1]+50]);assert.deepEqual(side.p.matrix(),[1,0,0,1,0,0]);
});
test('crossing the anchor clamps without flipping or making an existing affine transform singular',()=>{
  for(const elements of [[rect],[{...rect,transform:[0.0001,0,0,1,0,0]}],[{...rect,transform:[-1,0.2,0.4,2,0,0]}]]) {
    const {p,start}=input({elements});p.add({},[start[0]-500,start[1]-500]);const matrix=p.matrix();
    assert.ok(matrix[0]>0 && matrix[3]>0);
    assert.ok(singularValues(multiply(matrix,elements[0].transform))[0]>=0.0001);
  }
});
test('thin bounds pad to eight CSS pixels without changing geometry; hit areas are screen-sized with nearest priority',()=>{
  const b={x:10,y:20,width:0,height:1};const padded=interactionBounds(b,2);assert.deepEqual(padded,{x:8,y:18.5,width:4,height:4});assert.deepEqual(b,{x:10,y:20,width:0,height:1});
  const box={x:10,y:20,width:100,height:80},view={zoom:2,pan:[7,9]};
  for(const handle of RESIZE_HANDLES){const p=handlePosition(box,handle).map((n,i)=>n*2+view.pan[i]);assert.equal(pickResizeHandle(box,view,p)[0],handle[0]);}
  assert.equal(pickResizeHandle(box,view,[20+7-8,40+9-8])[0],'nw');
  assert.equal(pickResizeHandle(box,view,[20+7-11,40+9-11]),null);
  assert.equal(pickResizeHandle(box,view,[20+7-11,40+9-11],'touch')[0],'nw');
});
test('resizing is a committed-only affine edit preserving native geometry/assets/order and exactly undoable/reopenable',async()=>{
  const s=state();await s.load(fixture());s.setSelection(['stroke','image']);const before=s.save(),revision=s.getRevision(),context=s.prepareSelectionMove(),events=[];
  s.on('change',e=>events.push(e));const matrix=[2,0,0,0.5,-30,40];const preview=s.previewSelectionResize(context,matrix);
  assert.deepEqual(s.save(),before);assert.equal(s.getRevision(),revision);assert.equal(events.length,0);
  assert.deepEqual(preview.elements.map(e=>e.id),before.layers[0].elements.map(e=>e.id));
  s.commitSelectionResize(context,matrix);const after=s.save();assert.deepEqual(after.assets,before.assets);assert.deepEqual(after.layers[0].offset,before.layers[0].offset);
  for(let i=0;i<after.layers[0].elements.length;i++){const old=before.layers[0].elements[i];assert.deepEqual(after.layers[0].elements[i],['stroke','image'].includes(old.id)?{...old,transform:multiply(matrix,old.transform)}:old);}
  assert.equal(events.length,1);assert.equal(events[0].label,'Resize selection');assert.deepEqual(s.getSelection(),['stroke','image']);
  s.undo();assert.deepEqual(s.save(),before);s.redo();assert.deepEqual(s.save(),after);
  await s.load(after);assert.deepEqual(s.save(),after);s.destroy();
});
test('identity resize retains redo/revision and invalid/stale resize destinations fail atomically',async()=>{
  const s=state();await s.load(fixture());s.setSelection(['stroke']);s.commitSelectionResize(s.prepareSelectionMove(),[2,0,0,2,0,0]);s.undo();
  const context=s.prepareSelectionMove(),before=s.save(),revision=s.getRevision();
  assert.equal(s.previewSelectionResize(context,[1,0,0,1,0,0]),null);s.commitSelectionResize(context,[1,0,0,1,0,0]);assert.equal(s.canRedo(),true);assert.equal(s.getRevision(),revision);
  for(const m of [null,Array(6),[1,0,0,1,NaN,0],[-1,0,0,1,0,0],[0,0,0,1,0,0],[1,1,0,1,0,0]])assert.throws(()=>s.commitSelectionResize(context,m),code('INVALID_ARGUMENT'));
  for(const m of [[10001,0,0,1,0,0],[0.000001,0,0,1,0,0],[1,0,0,1,10_000_001,0]])assert.throws(()=>s.commitSelectionResize(context,m),code('INVALID_DOCUMENT'));
  assert.deepEqual(s.save(),before);s.createLayer();assert.throws(()=>s.commitSelectionResize(context,[2,0,0,2,0,0]),code('CANCELLED'));s.destroy();
});
test('full JSON destination limits apply to resize previews and leave committed content untouched',async()=>{
  const source=state(),native=source.save();source.destroy();native.layers[0].elements=[rect];
  const s=state({limits:{jsonBytes:Buffer.byteLength(JSON.stringify(native))+1}});await s.load(native);s.setSelection(['r']);const before=s.save();
  assert.throws(()=>s.previewSelectionResize(s.prepareSelectionMove(),[1,0,0,1,123456,123456]),code('LIMIT_EXCEEDED'));assert.deepEqual(s.save(),before);s.destroy();
});
