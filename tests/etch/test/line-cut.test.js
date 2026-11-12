import {test} from 'node:test';
import assert from 'node:assert/strict';
import {LineCutTester,lineFragments} from '../../../src/etch/geometry/line-cut.js';
import {HitBudget,HIT_ERROR} from '../../../src/etch/geometry/hit-test.js';
import {apply,multiply,scale,translate} from '../../../src/etch/geometry/matrix.js';
import {ToolSession} from '../../../src/etch/tools.js';
import {EraserInput} from '../../../src/etch/input/eraser.js';
import {EditorState} from '../../../src/etch/state.js';
import {AssetPool} from '../../../src/etch/assets.js';
import {code,fixture,deferred} from './helpers.js';
const identity = [1,0,0,1,0,0];
const line = (lineCap='butt') => ({id:'line',type:'line',transform:identity,start:[0,0],end:[100,0],stroke:'#112233',strokeWidth:2,lineCap});
const layer = e => ({id:'layer',name:'Lines',offset:[0,0],visible:true,locked:false,elements:Array.isArray(e) ? e : [e]});
const close = (a,b,tolerance=1e-7) => assert.ok(Math.abs(a-b) < tolerance,`${a} != ${b}`);
const state = options => new EditorState({decode:async () => new AssetPool(),...options});
const cut = (e,a,b=a,radius=10,options={}) => {const tester = new LineCutTester(layer(e),1,options);tester.sweep(a,b,radius);return tester;};
const pieces = tester => tester.changes().flatMap(c => lineFragments(tester.entries.find(e => e.element.id === c.id).element,c.ranges,c.ids));

test('eraser mode is validated, detached and independent session state; partial is the default',() => {
  let changes = 0;const a = new ToolSession({onChange:() => changes++}),b = new ToolSession();
  assert.deepEqual(a.getSettings('eraser'),{radius:10,mode:'partial'});a.setSettings('eraser',{mode:'object'});a.setTool('line');a.setTool('eraser');
  assert.deepEqual(a.getSettings('eraser'),{radius:10,mode:'object'});assert.equal(b.getSettings('eraser').mode,'partial');
  for (const mode of [null,undefined,{},[],1,'pixel','Partial']) assert.throws(() => a.setSettings('eraser',{mode}),code('INVALID_ARGUMENT'));
  const count = changes;a.setSettings('eraser',{mode:'object'});assert.equal(changes,count);
  const settings = a.getSettings('eraser');settings.mode = 'partial';assert.equal(a.getSettings('eraser').mode,'object');
});

test('tap cuts a circular gap into two editable native lines, preserving original outer endpoints and style',() => {
  const original = line(),p = pieces(cut(original,[50,0]));assert.equal(p.length,2);
  assert.deepEqual(p[0].start,[0,0]);assert.deepEqual(p[1].end,[100,0]);close(p[0].end[0],40-HIT_ERROR);close(p[1].start[0],60+HIT_ERROR);
  assert.equal(p[0].id,original.id);assert.notEqual(p[1].id,original.id);
  for (const e of p) {assert.equal(e.type,'line');assert.deepEqual(e.transform,original.transform);assert.equal(e.stroke,original.stroke);assert.equal(e.strokeWidth,2);assert.equal(e.lineCap,'butt');}
  assert.deepEqual(original,line());
});

test('new round/square ends retract so caps do not regrow into the erased gap; repeated erasing there is a no-op',() => {
  for (const cap of ['butt','round','square']) {
    const original = line(cap),p = pieces(cut(original,[50,0]));assert.equal(p.length,2,cap);
    const reach = cap === 'butt' ? 0 : 1;
    assert.ok(p[0].end[0]+reach <= 40-HIT_ERROR+0.07,cap);assert.ok(p[1].start[0]-reach >= 60+HIT_ERROR-0.07,cap);
    const next = new LineCutTester(layer(p),1);next.sweep([50,0],[50,0],10);assert.deepEqual(next.changes(),[],cap);
  }
});

test('continuous sweeps cut between samples, merge overlaps and preserve multiple disjoint pieces/preview IDs',() => {
  const t = new LineCutTester(layer(line()),1);t.sweep([20,-30],[20,30],2);t.sweep([75,-30],[75,30],2);
  let changes = t.changes();assert.equal(changes[0].ranges.length,3);const ids = changes[0].ids;
  assert.deepEqual(t.changes()[0].ids,ids);t.sweep([20,30],[20,-30],2);assert.deepEqual(t.changes()[0].ids,ids);
  t.sweep([18,0],[77,0],2);changes = t.changes();assert.equal(changes[0].ranges.length,2);assert.equal(changes[0].ids[1],ids[1]);
  const detached = t.changes();detached[0].ranges[0][1] = 999;detached[0].ids[0] = 'bad';assert.notDeepEqual(t.changes(),detached);
});

test('endpoint trimming, full removal, reversed direction, short survivors and tangencies produce no degenerate stubs',() => {
  assert.equal(pieces(cut(line(),[0,0])).length,1);assert.ok(pieces(cut(line(),[0,0]))[0].start[0] > 10);
  assert.deepEqual(pieces(cut(line(),[50,0],[50,0],128)),[]);
  assert.deepEqual(pieces(cut({...line('round'),end:[1e-9,0],strokeWidth:20},[0,0])),[]); // short centers can still have visible caps
  const reversed = {...line(),start:[100,0],end:[0,0]},p = pieces(cut(reversed,[50,0]));assert.deepEqual(p[0].start,[100,0]);assert.deepEqual(p[1].end,[0,0]);
  const short = pieces(cut(line(),[11,0],[11,0],10));assert.equal(short.length,2);close(short[0].end[0],0.75);
  assert.deepEqual(cut(line(),[50,11.25]).changes(),[]); // tangent to padded footprint
  assert.deepEqual(cut(line(),[-50,0],[-20,0],1).changes(),[]);
});

test('line-only tester leaves other types to the combined Partial tester without allocating their geometry',() => {
  const native = fixture(),l = native.layers[0];l.elements = l.elements.filter(e => e.type !== 'line');
  const t = new LineCutTester(l,1);t.sweep([-100,0],[100,0],128);assert.deepEqual(t.changes(),[]);assert.equal(t.entries.length,0);
});

test('cuts account for visible stroke width, butt cap exclusion, and round/square cap contacts beyond endpoints',() => {
  const thick = {...line(),strokeWidth:20};assert.equal(pieces(cut(thick,[50,15],[50,15],6)).length,2);
  assert.deepEqual(cut(thick,[50,20],[50,20],2).changes(),[]);
  assert.deepEqual(cut(thick,[-5,0],[-5,0],1).changes(),[]);
  for (const lineCap of ['round','square']) assert.ok(cut({...thick,lineCap},[-5,0],[-5,0],1).changes().length);
});

test('CSS radius remains zoom-independent and affine skew/reflection/anisotropic width and layer offsets are honored',() => {
  for (const zoom of [0.1,1,8]) {
    const e = {...line(),transform:[1,0.3,2,-0.2,10,20]},l = {...layer(e),offset:[30,-40]},m = multiply(scale(zoom),multiply(translate(...l.offset),e.transform));
    const t = new LineCutTester(l,zoom),p = apply(m,[50,0]);t.sweep(p,p,2);const change = t.changes()[0];assert.equal(change.ranges.length,2);
    const first = apply(m,lineFragments(e,change.ranges,change.ids)[0].end);assert.ok(Math.hypot(first[0]-p[0],first[1]-p[1]) >= 2);
  }
  const e = {...line(),transform:[100,0,0,0.01,0,0]},t = new LineCutTester(layer(e),1);t.sweep([5000,5],[5000,5],1);assert.deepEqual(t.changes(),[]); // no operator-norm-as-width shortcut
  t.sweep([5000,0],[5000,0],1);const p = pieces(t);close(p[0].end[0],50-(1+HIT_ERROR)/100);
});

test('geometry/work/piece budgets fail explicitly without producing a partial destination',() => {
  for (const budget of [new HitBudget({maxWork:1}),new HitBudget({maxSegments:1})]) assert.throws(() => cut(line(),[50,0],[50,0],10,{budget}),code('LIMIT_EXCEEDED'));
  const t = cut(line(),[50,0],[50,0],10,{maxPieces:1});assert.throws(() => t.changes(),code('LIMIT_EXCEEDED'));
  assert.throws(() => cut({...line('round'),end:[Number.MIN_VALUE,0],transform:[0.1,0,0,0.1,0,0]},[0,0]),code('LIMIT_EXCEEDED'));
});

test('input captures partial mode/radius/view at start and retains all coalesced bends',() => {
  const settings = {radius:2,mode:'partial'},view = {zoom:1,pan:[20,30]},input = new EraserInput({layer:layer(line()),view,settings});
  input.add({},[40,10]);input.add({},[40,50]);input.add({},[95,50]);input.add({},[95,10]);settings.mode = 'object';settings.radius = 128;view.pan[0] = 999;
  const changes = input.changes();assert.equal(input.mode,'partial');assert.equal(input.radius,2);assert.equal(changes[0].ranges.length,3);assert.throws(() => input.ids(),code('INVALID_ARGUMENT'));
  const object = new EraserInput({layer:layer(line()),view:{zoom:1,pan:[0,0]},settings:{radius:2}});assert.throws(() => object.changes(),code('INVALID_ARGUMENT'));
});

test('canonical line fragments reject invalid/overlapping/reordered ranges/IDs and omit unrepresentable zero-length pieces',() => {
  const e = line();assert.equal(lineFragments(e,[[0,1]],['line'])[0],e);assert.deepEqual(lineFragments(e,[],[]),[]);
  for (const ranges of [null,[null],Array(1),[[0,0]],[[0,2]],[[-1,0.2]],[[NaN,0.2]],[[0.2,0.1]],[[0,0.6],[0.5,1]],[[0,0.5],[0.5,1]]]) {
    const ids = Array.isArray(ranges) ? ranges.map((_,i) => i ? 'new' : 'line') : [];
    assert.throws(() => lineFragments(e,ranges,ids),code('INVALID_ARGUMENT'));
  }
  for (const ids of [['other'],[null],Array(1),[]]) assert.throws(() => lineFragments(e,[[0,0.5]],ids),code('INVALID_ARGUMENT'));
  assert.throws(() => lineFragments({...e,type:'stroke'},[],[]),code('INVALID_ARGUMENT'));
});

test('partial previews save committed-only; one command preserves painter slots/styles/other layers and undo restores exact originals',async () => {
  const s = state(),native = fixture();native.layers.push({...layer([]),id:'other'});await s.load(native);s.setActiveLayer('layer');s.setSelection(['line','image']);
  const before = s.save(),revision = s.getRevision(),originals = s.document.layers[0].elements,context = s.prepareErase('partial'),changes = [{id:'line',ranges:[[0,0.3],[0.7,1]],ids:['line','piece']}],events = [];
  s.on('change',e => events.push(e));const preview = s.previewPartialErase(context,changes);assert.deepEqual(preview.elements.map(e => e.id),['stroke','line','piece','rect','ellipse','path','image']);
  assert.equal(preview.elements[0],originals[0]);assert.deepEqual(s.save(),before);assert.equal(s.getRevision(),revision);assert.equal(s.canUndo(),false);
  s.commitPartialErase(context,changes);const after = s.save();assert.equal(events.length,1);assert.equal(events[0].label,'Partially erase lines');
  assert.deepEqual(after.layers[1],before.layers[1]);assert.deepEqual(after.assets,before.assets);assert.deepEqual(after.layers[0].offset,before.layers[0].offset);assert.deepEqual(s.getSelection(),['line','image']);
  for (const id of ['line','piece']) {const e = after.layers[0].elements.find(e => e.id === id);assert.equal(e.type,'line');assert.deepEqual(e.transform,originals[1].transform);assert.equal(e.lineCap,originals[1].lineCap);}
  s.undo();assert.deepEqual(s.save(),before);s.redo();assert.deepEqual(s.save(),after);s.destroy();
});

test('misses/identity ranges preserve redo, selection, revision and original element identities',async () => {
  const s = state();await s.load(fixture());s.translateLayer('layer',[10,0]);s.undo();s.setSelection(['line']);const revision = s.getRevision(),before = s.save(),context = s.prepareErase('partial');
  assert.equal(s.previewPartialErase(context,[]),null);s.commitPartialErase(context,[]);s.commitPartialErase(context,[{id:'line',ranges:[[0,1]],ids:['line']}]);
  assert.equal(s.getRevision(),revision);assert.deepEqual(s.save(),before);assert.equal(s.canRedo(),true);assert.deepEqual(s.getSelection(),['line']);s.destroy();
});

test('splitting checks full destination element/derived/JSON limits, fails atomically, and never falls back to whole-object removal',async () => {
  const native = {format:'lightmetal-etch',version:1,background:null,assets:[],layers:[layer(line())]},change = [{id:'line',ranges:[[0,0.3],[0.7,1]],ids:['line','new-fragment']}];
  for (const limits of [{elements:1},{derivedSegments:2},{derivedSegmentsPerElement:2,jsonBytes:JSON.stringify(native).length+5}]) {
    const s = state({limits});await s.load(native);const revision = s.getRevision(),context = s.prepareErase('partial');
    assert.throws(() => s.previewPartialErase(context,change),code('LIMIT_EXCEEDED'));assert.throws(() => s.commitPartialErase(context,change),code('LIMIT_EXCEEDED'));
    assert.deepEqual(s.save(),native);assert.equal(s.getRevision(),revision);assert.equal(s.canUndo(),false);s.destroy();
  }
});

test('partial editing rejects foreign/non-line/duplicate targets, stale baselines, modes and reused fragment identities',async () => {
  const s = state();await s.load(fixture());const context = s.prepareErase('partial'),before = s.save();
  for (const changes of [null,Array(1),[{id:'stroke',ranges:[],ids:[]}],[{id:'unknown',ranges:[],ids:[]}],[{id:'line',ranges:[],ids:[]},{id:'line',ranges:[],ids:[]}],[{id:'line',ranges:[[0,0.3],[0.7,1]],ids:['line','image']}]]) {
    assert.throws(() => s.previewPartialErase(context,changes),code('INVALID_ARGUMENT'));assert.throws(() => s.commitPartialErase(context,changes),code('INVALID_ARGUMENT'));
  }
  assert.deepEqual(s.save(),before);assert.throws(() => s.commitErase(context,['line']),code('INVALID_ARGUMENT'));assert.throws(() => s.commitPartialErase(s.prepareErase(),[]),code('INVALID_ARGUMENT'));
  assert.throws(() => s.prepareErase('pixel'),code('INVALID_ARGUMENT'));s.createLayer();assert.throws(() => s.commitPartialErase(context,[]),code('CANCELLED'));s.destroy();
});

test('partial guards read-only/busy/hidden/locked/destroyed state; full stored point capacity still permits line splitting',async () => {
  const ro = state({readOnly:true});assert.throws(() => ro.prepareErase('partial'),code('READ_ONLY'));ro.destroy();
  const s = state(),id = s.getActiveLayer();s.setLayerLocked(id,true);assert.throws(() => s.prepareErase('partial'),code('LAYER_NOT_EDITABLE'));
  s.setLayerLocked(id,false);s.setLayerVisibility(id,false);assert.throws(() => s.prepareErase('partial'),code('LAYER_NOT_EDITABLE'));s.setLayerVisibility(id,true);
  const context = s.prepareErase('partial');s.destroy();assert.throws(() => s.commitPartialErase(context,[]),code('DESTROYED'));
  const gate = deferred(),busy = state({decode:() => gate.promise}),loading = busy.load(fixture());assert.throws(() => busy.prepareErase('partial'),code('BUSY'));gate.resolve(new AssetPool());await loading;busy.destroy();
  const full = state({limits:{points:1,pointsPerElement:1}}),data = full.save();data.layers[0].elements = [line(),{id:'dot',type:'stroke',transform:identity,points:[[200,0,1]],width:3,color:'#112233',pressure:false}];await full.load(data);
  full.commitPartialErase(full.prepareErase('partial'),[{id:'line',ranges:[[0,0.3],[0.7,1]],ids:['line','fragment']}]);assert.equal(full.save().layers[0].elements.length,3);full.destroy();
});
