import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EditorState} from '../../../src/etch/state.js';
import {AssetPool} from '../../../src/etch/assets.js';
import {elementBounds,unionBounds} from '../../../src/etch/geometry/paths.js';
import {multiply} from '../../../src/etch/geometry/matrix.js';
import {fixture,code,deferred} from './helpers.js';

const state = options => new EditorState({decode:async () => new AssetPool(),...options});
const bounds = elements => elements.reduce((b,e) => unionBounds(b,elementBounds(e)),null);
const center = b => [b.x+b.width/2,b.y+b.height/2];
const near = (a,b) => a.forEach((n,i) => assert.ok(Math.abs(n-b[i]) < 1e-8,`${a} != ${b}`));
function source() {
  const d = fixture();
  d.layers[0].elements[1].transform = [-2,.3,.2,1,40,20];
  d.layers[0].elements.push({id:'ink',type:'ink',transform:[1,0,0,1,0,0],color:'#112233',parts:[[['M',0,0],['L',10,0],['L',10,10],['L',0,10],['Z']]]});
  d.layers.push({id:'other',name:'Other',visible:true,locked:false,offset:[30,40],elements:[]});
  return d;
}

test('layer quarter-turn rotates every native type together around painted center, preserving assets, offsets and session choice',async () => {
  const s = state();await s.load(source());s.setActiveLayer('other');
  const before = s.save(),layer = before.layers[0],b = bounds(layer.elements),[cx,cy] = center(b),events = [];
  s.on('change',e => events.push(e));
  s.rotateLayer('layer');const after = s.save(),rotated = after.layers[0];
  assert.deepEqual(after.assets,before.assets);assert.deepEqual(after.layers[1],before.layers[1]);
  assert.deepEqual(rotated.offset,layer.offset);assert.equal(s.getActiveLayer(),'other');
  for (let i=0;i<layer.elements.length;i++) {
    assert.deepEqual(rotated.elements[i],{...layer.elements[i],transform:multiply([0,1,-1,0,cx+cy,cy-cx],layer.elements[i].transform)});
  }
  near(center(bounds(rotated.elements)),[cx,cy]);
  near([bounds(rotated.elements).width,bounds(rotated.elements).height],[b.height,b.width]);
  assert.equal(events.length,1);assert.equal(events[0].label,'Rotate layer');
  s.undo();assert.deepEqual(s.save(),before);assert.equal(s.getActiveLayer(),'other');
  s.redo();assert.deepEqual(s.save(),after);await s.load(after);assert.deepEqual(s.save(),after);s.destroy();
});

test('selection rotation preserves other objects, IDs/order and selection; four clicks return to original placement with one history step per click',async () => {
  const s = state();await s.load(source());s.setActiveLayer('layer');s.setSelection(['image','line']);
  const before = s.save(),selected = before.layers[0].elements.filter(e => ['image','line'].includes(e.id)),pivot = center(bounds(selected));
  s.rotateSelection();const first = s.save();
  assert.deepEqual(s.getSelection(),['image','line']);
  assert.deepEqual(first.assets,before.assets);assert.deepEqual(first.layers[0].offset,before.layers[0].offset);
  for (const e of first.layers[0].elements) if (!['image','line'].includes(e.id)) assert.deepEqual(e,before.layers[0].elements.find(old => old.id === e.id));
  near(center(bounds(first.layers[0].elements.filter(e => ['image','line'].includes(e.id)))),pivot);
  for (let i=0;i<3;i++) s.rotateSelection();
  const fourth = s.save();
  fourth.layers[0].elements.forEach((e,i) => {
    near(e.transform,before.layers[0].elements[i].transform);
    assert.deepEqual({...e,transform:before.layers[0].elements[i].transform},before.layers[0].elements[i]);
  });
  for (let i=0;i<3;i++) s.undo();assert.deepEqual(s.save(),first);
  s.undo();assert.deepEqual(s.save(),before);assert.equal(s.canUndo(),false);s.destroy();
});

test('empty rotations preserve redo/revision and changes obey editability, busy and destroyed boundaries',async () => {
  const s = state();s.setBackground('#112233');s.undo();const revision = s.getRevision();
  s.rotateLayer();s.rotateSelection();assert.equal(s.getRevision(),revision);assert.equal(s.canRedo(),true);
  assert.throws(() => s.rotateLayer('missing'),code('INVALID_ARGUMENT'));
  s.setLayerVisibility(s.getActiveLayer(),false);
  for (const action of [() => s.rotateLayer(),() => s.rotateSelection()]) assert.throws(action,code('LAYER_NOT_EDITABLE'));
  s.setLayerVisibility(s.getActiveLayer(),true);s.setLayerLocked(s.getActiveLayer(),true);
  for (const action of [() => s.rotateLayer(),() => s.rotateSelection()]) assert.throws(action,code('LAYER_NOT_EDITABLE'));
  s.destroy();for (const action of [() => s.rotateLayer(),() => s.rotateSelection()]) assert.throws(action,code('DESTROYED'));
  const ro = state({readOnly:true});
  for (const action of [() => ro.rotateLayer(),() => ro.rotateSelection()]) assert.throws(action,code('READ_ONLY'));ro.destroy();
  const gate = deferred(),busy = state({decode:() => gate.promise}),pending = busy.load(fixture());
  for (const action of [() => busy.rotateLayer(),() => busy.rotateSelection()]) assert.throws(action,code('BUSY'));
  gate.resolve(new AssetPool());await pending;busy.destroy();
});

test('rotation validates full destination limits before changing content/history/revision/selection',async () => {
  const d = fixture(),s = state({limits:{jsonBytes:Buffer.byteLength(JSON.stringify(d))}});await s.load(d);s.setSelection(['image']);
  const before = s.save(),revision = s.getRevision();
  for (const action of [() => s.rotateLayer(),() => s.rotateSelection()]) {
    assert.throws(action,code('LIMIT_EXCEEDED'));assert.deepEqual(s.save(),before);
    assert.equal(s.getRevision(),revision);assert.equal(s.canUndo(),false);assert.deepEqual(s.getSelection(),['image']);
  }
  s.destroy();
  const edge = fixture();edge.assets = [];edge.layers[0].offset = [0,0];
  edge.layers[0].elements = [{...edge.layers[0].elements[2],x:9_999_980,y:0,width:10,height:100,stroke:null,strokeWidth:0,fill:'#112233'}];
  const bounded = state();await bounded.load(edge);const token = bounded.getRevision();
  assert.throws(() => bounded.rotateLayer(),code('INVALID_DOCUMENT'));
  assert.deepEqual(bounded.save(),edge);assert.equal(bounded.getRevision(),token);assert.equal(bounded.canUndo(),false);bounded.destroy();
});

test('rotation requested by a listener waits until the original event batch completes',async () => {
  const s = state();await s.load(fixture());const order = [];
  s.on('change',e => {order.push(e.label);if (e.label === 'Background') s.rotateLayer();});
  s.on('historychange',() => order.push('history'));
  s.setBackground('#FFFFFF');assert.deepEqual(order,['Background','history','Rotate layer','history']);s.destroy();
});
