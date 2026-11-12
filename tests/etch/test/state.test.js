import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EditorState } from '../../../src/etch/state.js';
import { AssetPool } from '../../../src/etch/assets.js';
import { fixture, code, deferred } from './helpers.js';
const state = options => new EditorState({ decode: async () => new AssetPool(), ...options });

test('initial state, detached snapshots, no-op suppression, revision and history events', () => {
  const s = state(), events = [];
  s.on('change', e => events.push(e));
  const initial = s.save(), token = s.getRevision();
  assert.equal(initial.layers.length, 1);
  const copy = s.save(); copy.layers[0].name = 'tampered';
  assert.deepEqual(s.save(), initial);
  s.renameLayer(s.getActiveLayer(), 'Layer 1'); s.translateLayer(s.getActiveLayer(), [0,0]); s.undo();
  assert.equal(s.getRevision(), token); assert.equal(events.length, 0);
  s.createLayer({ name: 'Ink' });
  const edited = s.save(), editedRevision = s.getRevision();
  assert.notEqual(editedRevision, token); assert.equal(s.canUndo(), true);
  s.undo(); assert.deepEqual(s.save(), initial); assert.notEqual(s.getRevision(), token);
  s.redo(); assert.deepEqual(s.save(), edited);
  assert.deepEqual(events.map(e => e.source), ['edit','undo','redo']);
  s.undo(); s.setBackground('#aabbcc'); assert.equal(s.canRedo(), false);
});
test('layer commands undo and redo to exact document order/geometry', () => {
  const s = state();
  const first = s.getActiveLayer(), second = s.createLayer({ name: 'Two' });
  const commands = [() => s.renameLayer(second,'Renamed'), () => s.translateLayer(second,[25,-10]),
    () => s.setLayerVisibility(second,false), () => s.reorderLayer(second,0),
    () => s.setLayerLocked(second,true), () => s.setLayerLocked(second,false), () => s.deleteLayer(first)];
  for (const command of commands) {
    const before = s.save(); command(); const after = s.save();
    s.undo(); assert.deepEqual(s.save(), before);
    s.redo(); assert.deepEqual(s.save(), after);
  }
});
test('deleting the last layer replaces it in a single undoable transaction', () => {
  const s = state(), before = s.save();
  s.deleteLayer(s.getActiveLayer());
  assert.equal(s.save().layers.length, 1);
  assert.notEqual(s.getActiveLayer(), before.layers[0].id);
  s.undo(); assert.deepEqual(s.save(), before);
});
test('lock/visibility rules and selection restrictions are enforced by the API', async () => {
  const s = state(); await s.load(fixture());
  const id = s.getActiveLayer(); s.setSelection(['rect']);
  s.setLayerLocked(id,true); assert.deepEqual(s.getSelection(), []);
  for (const action of [() => s.renameLayer(id,'x'), () => s.translateLayer(id,[1,1]), () => s.deleteLayer(id), () => s.reorderLayer(id,0)]) {
    assert.throws(action, code('LAYER_NOT_EDITABLE'));
  }
  s.setLayerVisibility(id,false); s.setLayerLocked(id,false);
  assert.throws(() => s.translateLayer(id,[1,1]), code('LAYER_NOT_EDITABLE'));
  s.renameLayer(id,'Hidden');
  assert.throws(() => s.setSelection(['rect']), code('LAYER_NOT_EDITABLE'));
  const hiddenRevision = s.getRevision(); s.deleteSelection();
  assert.equal(s.getRevision(), hiddenRevision);
  s.setLayerVisibility(id,true);
  assert.throws(() => s.setSelection(['rect','rect']), code('INVALID_ARGUMENT'));
  const selection = ['rect']; s.setSelection(selection); selection.push('image');
  assert.deepEqual(s.getSelection(), ['rect']);
  s.deleteSelection(); assert.equal(s.save().layers[0].elements.some(e => e.id === 'rect'), false);
  s.undo(); assert.deepEqual(s.save().layers[0].elements, fixture().layers[0].elements);
});
test('large selections preserve caller order, no-op events and surviving IDs across edits/history', async () => {
  const s = state(), d = fixture(), rect = d.layers[0].elements.find(e => e.type === 'rect');
  d.layers[0].elements = Array.from({length:2000},(_,i) => ({...rect,id:`rect-${i}`}));
  d.assets = [];
  await s.load(d);
  const ids = d.layers[0].elements.map(e => e.id).reverse(),events = [];
  s.on('selectionchange',e => events.push(e.elementIds));
  s.setSelection(ids);s.setSelection([...ids]);
  assert.deepEqual(s.getSelection(),ids);assert.equal(events.length,1);
  const nonArray = {get length() {assert.fail('Non-array selection must reject before reading length');}};
  for (const invalid of [[ids[0],ids[0]],[ids[0],'missing'],null,nonArray]) {
    assert.throws(() => s.setSelection(invalid),code('INVALID_ARGUMENT'));
    assert.deepEqual(s.getSelection(),ids);
  }
  s.setBackground('#FFFFFF');assert.equal(events.length,1);
  s.commitErase(s.prepareErase(),ids.slice(0,2));
  const survivors = ids.slice(2);
  assert.deepEqual(s.getSelection(),survivors);assert.equal(events.length,2);
  s.undo();assert.deepEqual(s.getSelection(),survivors);
  s.redo();assert.deepEqual(s.getSelection(),survivors);assert.equal(events.length,2);
  s.destroy();
});
test('load is an atomic clean baseline; failures preserve old content/history/revision', async () => {
  const s = state(), changes = [], loads = [];
  s.on('change', e => changes.push(e)); s.on('load', e => loads.push(e));
  s.createLayer(); const old = s.save(), revision = s.getRevision();
  await assert.rejects(s.load('{'), code('INVALID_DOCUMENT'));
  assert.deepEqual(s.save(),old); assert.equal(s.getRevision(),revision); assert.equal(s.canUndo(),true);
  await s.load(fixture());
  assert.deepEqual(s.save(), fixture()); assert.equal(s.canUndo(),false); assert.equal(s.canRedo(),false);
  assert.equal(changes.length,1); assert.equal(loads.length,1); assert.notEqual(s.getRevision(),revision);
});
test('latest load wins; editing is busy but save/navigation remain available', async () => {
  const pending = [], s = state({ decode: (_d, signal) => { const d = deferred(); pending.push({ ...d, signal }); return d.promise; } });
  const before = s.save(), a = s.load(fixture());
  const rejected = assert.rejects(a, code('CANCELLED'));
  assert.equal(s.busy,true); assert.deepEqual(s.save(),before);
  assert.throws(() => s.createLayer(), code('BUSY'));
  s.setActiveLayer(s.getActiveLayer());
  const next = fixture(); next.layers[0].name = 'Newest';
  const b = s.load(next);
  assert.equal(pending[0].signal.aborted,true);
  pending[1].resolve(new AssetPool()); await b;
  pending[0].resolve(new AssetPool()); await rejected;
  assert.deepEqual(s.save(),next); assert.equal(s.busy,false);
});
test('cancel and destroy invalidate async loads and dispose temporary assets', async () => {
  const d = deferred(), pool = new AssetPool(); let closed = 0;
  pool.add('asset', { image: {}, close: () => closed++ });
  const s = state({ decode: () => d.promise });
  const load = s.load(fixture()), rejected = assert.rejects(load,code('CANCELLED'));
  s.destroy(); s.destroy(); d.resolve(pool); await rejected;
  assert.equal(closed,1);
  for (const action of [() => s.save(), () => s.getRevision(), () => s.canUndo(), () => s.cancel(), () => s.createLayer(), () => s.on('change',()=>{})]) {
    assert.throws(action,code('DESTROYED'));
  }
});
test('read-only allows load/save/session selection but no durable mutations or history', async () => {
  const s = state({ readOnly: true }); await s.load(fixture());
  assert.deepEqual(s.save(),fixture()); s.setSelection(['rect']);
  for (const action of [() => s.createLayer(), () => s.setBackground(null), () => s.deleteSelection(), () => s.undo(), () => s.redo()]) {
    assert.throws(action,code('READ_ONLY'));
  }
});
test('events are detached; reentrant commands wait until the full event batch completes', () => {
  const order = [], s = state();
  s.on('change', e => {
    order.push(`change:${e.label}`); e.label = 'mutated';
    if (s.save().background === null) s.setBackground('#123456');
  });
  s.on('change', e => { assert.notEqual(e.label,'mutated'); });
  s.on('historychange', () => order.push('history'));
  s.createLayer();
  assert.deepEqual(order,['change:New layer','history','change:Background','history']);
});
test('retained history keeps decoded resources alive until eviction; save omits unused assets', async () => {
  let closed = 0;
  const pool = new AssetPool(); pool.add('asset',{ image: {}, close: () => closed++ });
  const s = state({ history: { maxCommands: 1 }, decode: async () => pool });
  await s.load(fixture()); s.setSelection(['image']); s.deleteSelection();
  assert.equal(s.save().assets.length,0); assert.equal(closed,0);
  s.undo(); assert.equal(s.save().assets.length,1);
  s.redo(); s.setBackground('#112233'); assert.equal(closed,1);
  s.destroy(); assert.equal(closed,1);
});
test('combined destination limits fail before command/history/revision changes', () => {
  const s = state({ limits: { layers: 1 } }), before = s.save(), token = s.getRevision();
  assert.throws(() => s.createLayer(), code('LIMIT_EXCEEDED'));
  assert.deepEqual(s.save(),before); assert.equal(s.canUndo(),false); assert.equal(s.getRevision(),token);
});
