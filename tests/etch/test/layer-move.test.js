import {test} from 'node:test';
import assert from 'node:assert/strict';
import {LayerMoveInput} from '../../../src/etch/input/layer-move.js';
import {ToolSession} from '../../../src/etch/tools.js';
import {EditorState} from '../../../src/etch/state.js';
import {AssetPool} from '../../../src/etch/assets.js';
import {code,deferred,fixture} from './helpers.js';

const state = options => new EditorState({decode:async () => new AssetPool(),...options});
const input = zoom => new LayerMoveInput({view:{zoom,pan:[100,-50]}});
const empty = (id='empty') => ({id,name:'Empty',visible:true,locked:false,offset:[0,0],elements:[]});

test('Move Layer is a separate session tool with no style settings and retains all drawing preferences',() => {
  let changes = 0;const tools = new ToolSession({onChange:() => changes++});
  tools.setSettings('pen',{width:9});tools.setTool('ellipse');tools.setSettings('ellipse',{fill:'#112233'});tools.setDrawWithTouch(true);
  tools.setTool('move-layer');assert.equal(tools.getTool(),'move-layer');assert.deepEqual(tools.getSettings('move-layer'),{});
  assert.equal(tools.getShapeTool(),'ellipse');assert.equal(tools.getDrawWithTouch(),true);
  assert.equal(tools.getSettings('pen').width,9);assert.equal(tools.getSettings('ellipse').fill,'#112233');
  const count = changes;tools.setTool('move-layer');tools.setSettings('move-layer',{});assert.equal(changes,count);
  assert.throws(() => tools.setSettings('move-layer',{width:3}),code('INVALID_ARGUMENT'));
  assert.throws(() => tools.setSettings('move-layer',{layerId:'other'}),code('INVALID_ARGUMENT'));
});

test('layer drag captures zoom, ignores pan/DPR/pressure and converts CSS displacement into relative world delta',() => {
  for (const zoom of [0.1,1,2,8]) {
    const view = {zoom,pan:[123,-456]},p = new LayerMoveInput({view});
    p.add({pressure:0.1},[40,80]);view.zoom = 99;view.pan[0] = 999;
    p.add({pressure:1},[80,60]);assert.deepEqual(p.delta(),[40/zoom,-20/zoom]);
    const a = p.delta(),b = p.lastScreen;a[0] = b[0] = 999;assert.deepEqual(p.delta(),[40/zoom,-20/zoom]);assert.deepEqual(p.lastScreen,[80,60]);
  }
});

test('layer taps, sub-2px jitter and a drag returned to its origin produce zero delta at every zoom',() => {
  for (const zoom of [0.1,1,8]) {
    const p = input(zoom);assert.deepEqual(p.delta(),[0,0]);p.add({},[0,0]);assert.deepEqual(p.delta(),[0,0]);
    p.add({},[1.999,0]);assert.deepEqual(p.delta(),[0,0]);p.add({},[2,0]);assert.deepEqual(p.delta(),[2/zoom,0]);
    p.add({},[100,100]);p.add({},[0,0]);assert.deepEqual(p.delta(),[0,0]);
  }
  for (const point of [[Infinity,0],[NaN,1],[1],Array(2),null]) assert.throws(() => input(1).add({},point),code('INVALID_ARGUMENT'));
});

test('whole-layer preview is committed-only; one commit preserves all native geometry, painter order and other layers',async () => {
  const native = fixture();native.layers.push(empty('other'));
  const s = state();await s.load(native);s.setActiveLayer('layer');s.setSelection(['stroke','image']);
  const before = s.save(),revision = s.getRevision(),elements = s.document.layers[0].elements,changes = [];
  s.on('change',e => changes.push(e));const context = s.prepareLayerMove(),preview = s.previewLayerMove(context,[20,-15]);
  assert.deepEqual(preview.offset,[30,-35]);assert.equal(preview.elements,elements);preview.offset[0] = 999;
  assert.deepEqual(s.save(),before);assert.equal(s.getRevision(),revision);assert.equal(s.canUndo(),false);assert.deepEqual(changes,[]);
  s.commitLayerMove(context,[20,-15]);const after = s.save();assert.deepEqual(after.layers[0].offset,[30,-35]);
  assert.equal(s.document.layers[0].elements,elements);assert.deepEqual(after.layers[0].elements,before.layers[0].elements);
  assert.deepEqual(after.layers[1],before.layers[1]);assert.deepEqual(after.assets,before.assets);assert.equal(after.background,before.background);
  assert.deepEqual(s.getSelection(),['stroke','image']);assert.equal(s.getActiveLayer(),before.layers[0].id);
  assert.equal(changes.length,1);assert.equal(changes[0].label,'Move layer');
  s.undo();assert.deepEqual(s.save(),before);s.redo();assert.deepEqual(s.save(),after);
  assert.deepEqual(changes.map(e => e.source),['edit','undo','redo']);s.destroy();
});

test('no-op layer move preserves selection, redo, revision and history; deltas are never accumulated per sample',async () => {
  const s = state();await s.load(fixture());const id = s.getActiveLayer();
  s.translateLayer(id,[10,10]);s.undo();s.setSelection(['stroke']);const before = s.save(),revision = s.getRevision();let changes = 0;s.on('change',() => changes++);
  const context = s.prepareLayerMove();assert.equal(s.previewLayerMove(context,[0,0]),null);s.commitLayerMove(context,[0,0]);
  assert.deepEqual(s.save(),before);assert.equal(s.getRevision(),revision);assert.equal(changes,0);assert.equal(s.canRedo(),true);assert.deepEqual(s.getSelection(),['stroke']);
  assert.deepEqual(s.previewLayerMove(context,[20,10]).offset,[30,-10]);assert.deepEqual(s.previewLayerMove(context,[-5,2]).offset,[5,-18]);
  s.commitLayerMove(context,[-5,2]);assert.deepEqual(s.save().layers[0].offset,[5,-18]);assert.equal(changes,1);s.destroy();
});

test('empty layers can move even with the document element/point budgets already full',async () => {
  const s = state({limits:{elements:1,points:1}}),native = s.save();
  native.layers[0].elements.push({id:'dot',type:'stroke',transform:[1,0,0,1,0,0],points:[[0,0,1]],color:'#112233',width:3,pressure:false});
  native.layers.push(empty());await s.load(native);s.setActiveLayer('empty');
  assert.throws(() => s.prepareDrawing('rect'),code('LIMIT_EXCEEDED'));
  s.commitLayerMove(s.prepareLayerMove(),[20,30]);assert.deepEqual(s.save().layers[1].offset,[20,30]);assert.deepEqual(s.save().layers[0],native.layers[0]);
  s.undo();assert.deepEqual(s.save(),native);s.destroy();
});

test('layer previews/commits reject invalid deltas and painted world overflow without any partial state',async () => {
  const s = state();await s.load(fixture());const before = s.save(),revision = s.getRevision(),context = s.prepareLayerMove();
  for (const delta of [[Infinity,0],[NaN,1],[1],Array(2),null]) {
    assert.throws(() => s.previewLayerMove(context,delta),code('INVALID_ARGUMENT'));assert.throws(() => s.commitLayerMove(context,delta),code('INVALID_ARGUMENT'));
    assert.throws(() => s.translateLayer(context.layer.id,delta),code('INVALID_ARGUMENT'));
  }
  for (const delta of [[10_000_001,0],[9_999_950,0]]) {
    assert.throws(() => s.previewLayerMove(context,delta),code('INVALID_DOCUMENT'));assert.throws(() => s.commitLayerMove(context,delta),code('INVALID_DOCUMENT'));
  }
  assert.deepEqual(s.save(),before);assert.equal(s.getRevision(),revision);assert.equal(s.canUndo(),false);s.destroy();
});

test('layer movement validates the combined JSON destination, including unchanged content',async () => {
  const source = state(),native = source.save();source.destroy();
  const next = {...native,layers:[{...native.layers[0],offset:[100000,0]}]};
  const s = state({limits:{jsonBytes:Buffer.byteLength(JSON.stringify(next))-1}});await s.load(native);
  const revision = s.getRevision(),context = s.prepareLayerMove();
  assert.throws(() => s.previewLayerMove(context,[100000,0]),code('LIMIT_EXCEEDED'));
  assert.throws(() => s.commitLayerMove(context,[100000,0]),code('LIMIT_EXCEEDED'));
  assert.deepEqual(s.save(),native);assert.equal(s.getRevision(),revision);assert.equal(s.canUndo(),false);s.destroy();
});

test('layer move baselines cannot land in a changed active layer/document',async () => {
  const s = state();await s.load(fixture());const context = s.prepareLayerMove();s.createLayer();const before = s.save();
  assert.throws(() => s.previewLayerMove(context,[2,3]),code('CANCELLED'));assert.throws(() => s.commitLayerMove(context,[2,3]),code('CANCELLED'));
  assert.deepEqual(s.save(),before);
  const active = s.prepareLayerMove();s.setActiveLayer('layer');assert.throws(() => s.commitLayerMove(active,[2,3]),code('CANCELLED'));s.destroy();
});

test('read-only, hidden, locked, busy and destroyed layer moves obey the same guards as content edits',async () => {
  const ro = state({readOnly:true});assert.throws(() => ro.prepareLayerMove(),code('READ_ONLY'));ro.destroy();
  const s = state(),id = s.getActiveLayer();s.setLayerLocked(id,true);assert.throws(() => s.prepareLayerMove(),code('LAYER_NOT_EDITABLE'));
  s.setLayerLocked(id,false);s.setLayerVisibility(id,false);assert.throws(() => s.prepareLayerMove(),code('LAYER_NOT_EDITABLE'));
  s.setLayerVisibility(id,true);const context = s.prepareLayerMove();s.destroy();assert.throws(() => s.previewLayerMove(context,[2,3]),code('DESTROYED'));
  const gate = deferred(),busy = state({decode:() => gate.promise}),load = busy.load(fixture());
  assert.throws(() => busy.prepareLayerMove(),code('BUSY'));gate.resolve(new AssetPool());await load;busy.destroy();
});
