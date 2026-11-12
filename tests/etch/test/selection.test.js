import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EditorState} from '../../../src/etch/state.js';
import {AssetPool} from '../../../src/etch/assets.js';
import {SelectionInput,pickElement} from '../../../src/etch/input/selection.js';
import {fixture,code} from './helpers.js';

const state = () => new EditorState({decode:async () => new AssetPool()});
test('selection movement is virtual, offset/affine aware, preserves order/assets and commits once',async () => {
  const s = state();await s.load(fixture());s.setSelection(['stroke','image']);
  const before = s.save(),revision = s.getRevision(),context = s.prepareSelectionMove(),events = [];
  s.on('change',e => events.push(e));
  const preview = s.previewSelectionMove(context,[20,-10]);
  assert.deepEqual(s.save(),before);assert.equal(s.getRevision(),revision);assert.equal(events.length,0);
  assert.deepEqual(preview.elements.map(e => e.id),before.layers[0].elements.map(e => e.id));
  s.commitSelectionMove(context,[20,-10]);const after = s.save();
  assert.deepEqual(after.assets,before.assets);assert.deepEqual(after.layers[0].offset,before.layers[0].offset);
  for (let i=0;i<after.layers[0].elements.length;i++) {
    const old = before.layers[0].elements[i],next = after.layers[0].elements[i];
    assert.deepEqual(next,['stroke','image'].includes(old.id) ? {...old,transform:old.transform.map((n,j) => n+(j===4 ? 20 : j===5 ? -10 : 0))} : old);
  }
  assert.equal(events.length,1);assert.deepEqual(s.getSelection(),['stroke','image']);
  s.undo();assert.deepEqual(s.save(),before);s.redo();assert.deepEqual(s.save(),after);
  const reopened = state();await reopened.load(after);assert.deepEqual(reopened.save(),after);reopened.destroy();s.destroy();
});
test('selection no-ops retain redo and invalid/stale moves are atomic',async () => {
  const s = state();await s.load(fixture());s.setSelection(['stroke']);
  s.commitSelectionMove(s.prepareSelectionMove(),[4,5]);s.undo();
  const context = s.prepareSelectionMove(),before = s.save(),revision = s.getRevision();
  assert.equal(s.previewSelectionMove(context,[0,0]),null);s.commitSelectionMove(context,[0,0]);
  assert.equal(s.canRedo(),true);assert.equal(s.getRevision(),revision);
  for (const delta of [null,[NaN,0],[Infinity,0],Array(2)]) assert.throws(() => s.commitSelectionMove(context,delta),code('INVALID_ARGUMENT'));
  assert.throws(() => s.commitSelectionMove(context,[10_000_001,0]),code('INVALID_DOCUMENT'));
  assert.deepEqual(s.save(),before);s.createLayer();assert.throws(() => s.commitSelectionMove(context,[2,3]),code('CANCELLED'));s.destroy();
});
test('selection movement obeys readonly/hidden/locked guards',() => {
  const ro = new EditorState({readOnly:true});assert.throws(() => ro.prepareSelectionMove(),code('READ_ONLY'));ro.destroy();
  const s = state(),id = s.getActiveLayer();s.setLayerLocked(id,true);assert.throws(() => s.prepareSelectionMove(),code('LAYER_NOT_EDITABLE'));
  s.setLayerLocked(id,false);s.setLayerVisibility(id,false);assert.throws(() => s.prepareSelectionMove(),code('LAYER_NOT_EDITABLE'));s.destroy();
});
test('marquee fully contains painted bounds, supports reverse drag and additive selection',() => {
  const layer = {offset:[10,20],elements:[{id:'a',type:'rect',transform:[1,0,0,1,0,0],x:0,y:0,width:20,height:20,fill:'#112233'},
    {id:'b',type:'rect',transform:[1,0,0,1,0,0],x:40,y:0,width:20,height:20,fill:'#112233'}]};
  const p = new SelectionInput({view:{zoom:2,pan:[5,7]},layer,start:[70,90],marquee:true,additive:true,selection:['b']});
  p.add({},[70,90]);p.add({},[20,40]);assert.deepEqual(p.ids(),['b','a']);
  p.add({},[40,40]);assert.deepEqual(p.ids(),['b']);p.add({},[70,90]);assert.deepEqual(p.ids(),['b']);
});
test('picking chooses topmost painted geometry, not unfilled interiors or affine image AABB corners',() => {
  const base = {type:'rect',transform:[1,0,0,1,0,0],x:0,y:0,width:100,height:100,fill:'#112233'};
  const layer = {offset:[10,20],elements:[{...base,id:'bottom'},{...base,id:'top',fill:null,stroke:'#112233',strokeWidth:4,lineJoin:'round'}]};
  const view = {zoom:2,pan:[7,9]};assert.equal(pickElement(layer,view,[127,149]),'bottom');
  assert.equal(pickElement(layer,view,[27,109]),'top');assert.equal(pickElement(layer,view,[400,400]),null);
});
