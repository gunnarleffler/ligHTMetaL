import {test} from 'node:test';
import assert from 'node:assert/strict';
import {InkCutTester,PartialCutTester} from '../../../src/etch/geometry/ink-cut.js';
import {outlineParts,partControls} from '../../../src/etch/geometry/ink.js';
import {positiveConvex,area,intersects,subtract,capsule,hull} from '../../../src/etch/geometry/convex.js';
import {HitBudget,SweptHitTester} from '../../../src/etch/geometry/hit-test.js';
import {elementBounds,traceElementPath} from '../../../src/etch/geometry/paths.js';
import {apply,multiply,scale,translate} from '../../../src/etch/geometry/matrix.js';
import {validateDocument} from '../../../src/etch/validation.js';
import {EditorState} from '../../../src/etch/state.js';
import {AssetPool} from '../../../src/etch/assets.js';
import {EraserInput} from '../../../src/etch/input/eraser.js';
import {code} from './helpers.js';
const identity = [1,0,0,1,0,0];
const stroke = patch => ({id:'pen',type:'stroke',transform:identity,color:'#112233',width:8,pressure:true,points:[[0,100,1],[100,100,0.2],[200,100,1]],...patch});
const layer = elements => ({id:'ink',name:'Ink',visible:true,locked:false,offset:[0,0],elements});
const native = elements => ({format:'lightmetal-etch',version:1,background:null,assets:[],layers:[layer(elements)]});
const ink = (original,change) => change.groups.map((parts,i) => ({id:change.ids[i],type:'ink',transform:original.transform,color:original.color,parts}));
function cut(e=stroke(),a=[100,100],b=a,radius=6,options={}) {const t = new InkCutTester(layer([e]),1,options);t.sweep(a,b,radius);return t;}
const state = options => new EditorState({decode:async () => new AssetPool(),...options});
const square = x => [['M',x,0],['L',x+10,0],['L',x+10,10],['L',x,10],['Z']];

test('shared hull removes duplicate/collinear interior points and preserves sort/work accounting',() => {
  const points = [[10,10],[0,0],[5,0],[10,0],[0,10],[0,0],[5,5]],budget = new HitBudget();
  assert.deepEqual(hull(points,budget),[[0,0],[10,0],[10,10],[0,10]]);
  assert.deepEqual(points[0],[0,0]);assert.equal(budget.work,Math.ceil(points.length*Math.log2(points.length)));
  assert.deepEqual(hull([[0,0],[1,0],[2,0]],new HitBudget()),[[0,0],[2,0]]);
  assert.throws(() => hull([[0,0],[1,0],[0,1]],new HitBudget({maxWork:1})),code('LIMIT_EXCEEDED'));
});

test('convex subtraction retains local coordinates and partitions a square without overlapping interiors',() => {
  const budget = new HitBudget(),subject = [[0,0,0,0],[10,0,10,0],[10,10,10,10],[0,10,0,10]],cutter = [[4,-1],[6,-1],[6,11],[4,11]],pieces = subtract(subject,cutter,budget,() => {});
  assert.equal(pieces.length,2);assert.equal(pieces.reduce((s,p) => s+area(p),0),80);
  assert.ok(pieces.every(p => p.every(v => v[0] === v[2] && v[1] === v[3])));assert.equal(intersects(pieces[0],pieces[1],budget),false);
  assert.equal(positiveConvex([[0,0],[10,0],[10,10],[0,10]]),true);
  assert.equal(positiveConvex([[0,0],[10,0],[5,5],[10,10],[0,10]]),false);
  const star = Array.from({length:5},(_,i) => [Math.cos(i*4*Math.PI/5),Math.sin(i*4*Math.PI/5)]);assert.equal(positiveConvex(star),false);
  const cap = capsule([10,20],[40,20],8,budget);assert.ok(positiveConvex(cap));
  // Independent O(n*m) SAT oracle exercises support-vertex plateaus and winding.
  let seed = 7;const random = () => ((seed = Math.imul(seed,1664525)+1013904223 >>> 0)/2**32);
  const polygon = () => {const n = 3+Math.floor(random()*12),x = random()*20,y = random()*20,r = 1+random()*10,ry = 1+random()*10,t = random()*6;return Array.from({length:n},(_,i) => [x+r*Math.cos(t+i*2*Math.PI/n),y+ry*Math.sin(t+i*2*Math.PI/n)]);};
  const brute = (a,b) => {for (const p of [a,b]) for (let i = 0;i < p.length;i++) {const q = p[i],z = p[(i+1)%p.length],nx = q[1]-z[1],ny = z[0]-q[0],aa = a.map(v => v[0]*nx+v[1]*ny),bb = b.map(v => v[0]*nx+v[1]*ny);if (Math.max(...aa) <= Math.min(...bb) || Math.max(...bb) <= Math.min(...aa)) return false;}return true;};
  for (let i = 0;i < 1000;i++) {const a = polygon(),b = polygon();if (i%2) b.reverse();assert.equal(intersects(a,b,budget),brute(a,b));}
});

test('freehand erasing splits the painted pressure outline into native independently editable ink components',() => {
  const e = stroke(),before = structuredClone(e),t = cut(e),change = t.changes()[0],pieces = ink(e,change);
  assert.equal(pieces.length,2);assert.equal(pieces[0].id,e.id);assert.notEqual(pieces[1].id,e.id);
  assert.deepEqual(t.changes()[0].ids,change.ids);assert.deepEqual(e,before);validateDocument(native(pieces));
  for (const p of pieces) {assert.equal(p.type,'ink');assert.equal(p.color,e.color);assert.deepEqual(p.transform,e.transform);assert.ok(p.parts.every(part => positiveConvex(partControls(part))));}
  assert.ok(elementBounds(pieces[0]).x+elementBounds(pieces[0]).width < 95);assert.ok(elementBounds(pieces[1]).x > 105);
});

test('untouched cubic pressure primitives are preserved verbatim and no pressure samples are re-filtered',() => {
  const e = stroke(),original = outlineParts(e,new HitBudget()),pieces = ink(e,cut(e).changes()[0]);
  const commands = new Set(pieces.flatMap(e => e.parts).map(p => JSON.stringify(p)));
  assert.ok(commands.has(JSON.stringify(original[0])));assert.ok(commands.has(JSON.stringify(original.at(-1))));
  assert.ok(pieces.flatMap(p => p.parts).some(p => p.some(c => c[0] === 'C')));
  assert.deepEqual(e.points,[[0,100,1],[100,100,0.2],[200,100,1]]);
});

test('repeated erasing in an existing gap is an identity no-op, while another cut makes further native pieces',() => {
  const original = stroke(),first = cut(original).changes()[0],pieces = ink(original,first),again = new InkCutTester(layer(pieces),1);
  assert.deepEqual(again.sweep([100,100],[100,100],6),[]);assert.deepEqual(again.changes(),[]);
  again.sweep([40,100],[40,100],6);const changes = again.changes();assert.equal(changes.length,1);assert.equal(changes[0].groups.length,2);
  const detached = again.changes();detached[0].groups[0][0][0][1] = 999;assert.notDeepEqual(again.changes(),detached);
});

test('continuous sweeps and multiple cuts in one gesture retain three components with stable preview IDs',() => {
  const e = stroke(),t = cut(e,[50,70],[50,130],3),a = t.changes()[0];assert.equal(a.groups.length,2);
  t.sweep([150,130],[150,70],3);const b = t.changes()[0];assert.equal(b.groups.length,3);assert.equal(b.ids[0],a.ids[0]);assert.equal(b.ids[1],a.ids[1]);
  assert.deepEqual(t.changes()[0].ids,b.ids);validateDocument(native(ink(e,b)));
});

test('dot strokes, endpoint trimming, whole removal and holes have painted rather than sample-index semantics',() => {
  const dot = stroke({points:[[100,100,1]],width:30}),partial = cut(dot,[100,100],[100,100],3).changes()[0];
  assert.equal(partial.groups.length,1);const donut = ink(dot,partial);assert.deepEqual(new SweptHitTester(layer(donut),1).sweep([100,100],[100,100],1),[]);
  assert.ok(new SweptHitTester(layer(donut),1).sweep([110,100],[110,100],1).length);
  const full = cut(dot,[100,100],[100,100],30).changes()[0];assert.deepEqual(full.groups,[]);
  const end = ink(stroke(),cut(stroke(),[0,100]).changes()[0]);assert.equal(end.length,1);assert.ok(elementBounds(end[0]).x > 0);
  const ring = stroke({width:4,pressure:false,points:[[40,40,1],[160,40,1],[160,160,1],[40,160,1],[40,40,1]]});
  assert.deepEqual(cut(ring,[100,100],[100,100],3).changes(),[]);
});

test('curved pressure strokes retain loops/self-crossings and can be cut without reconnecting across gaps',() => {
  const e = stroke({width:6,points:[[10,100,1],[70,20,0.1],[130,180,0.8],[190,30,1]]}),t = cut(e,[100,0],[100,200],4),c = t.changes()[0];
  assert.ok(c.groups.length >= 2);const p = ink(e,c);validateDocument(native(p));
  assert.deepEqual(new SweptHitTester(layer(p),1).sweep([100,0],[100,200],1),[]);
});

test('CSS-space cuts honor zoom, skew, reflection, anisotropy and translated layer origins',() => {
  for (const zoom of [0.1,1,8]) {
    const e = stroke({transform:[1,0.2,0.5,-0.7,10,20]}),l = {...layer([e]),offset:[30,-20]},m = multiply(scale(zoom),multiply(translate(...l.offset),e.transform)),p = apply(m,[100,100]),t = new InkCutTester(l,zoom);
    t.sweep(p,p,2);const pieces = ink(e,t.changes()[0]);validateDocument({...native([]),layers:[{...l,elements:pieces}]});
    assert.deepEqual(new SweptHitTester({...l,elements:pieces},zoom).sweep(p,p,1),[]);
  }
});

test('partial tester handles lines and Pen in one shared budget and ignores general paths, images and shapes',() => {
  const e = stroke(),l = layer([e,{id:'line',type:'line',transform:identity,start:[0,100],end:[200,100],stroke:'#112233',strokeWidth:2,lineCap:'round'},
    {id:'path',type:'path',transform:identity,commands:square(100),fill:'#112233',stroke:null,strokeWidth:0,lineCap:'butt',lineJoin:'round',miterLimit:4,fillRule:'nonzero'}]);
  const t = new PartialCutTester(l,1);assert.equal(t.lines.budget,t.ink.budget);t.sweep([100,90],[100,110],4);
  assert.deepEqual(new Set(t.changes().map(c => c.id)),new Set(['line','pen']));
});

test('input snapshots Pen partial mode, retains swept/release samples, and does not spend stored sample capacity on input',() => {
  const input = new EraserInput({layer:layer([stroke()]),view:{zoom:1,pan:[20,30]},settings:{radius:3,mode:'partial'},maxSamples:4});
  input.add({},[70,100]);input.add({},[70,160]);input.add({},[170,160]);input.add({},[170,100]);assert.equal(input.changes()[0].groups.length,3);
  assert.throws(() => input.add({},[180,100]),code('LIMIT_EXCEEDED'));
});

test('interactive vertex/work/part/component limits reject without fallback or truncation',() => {
  for (const budget of [new HitBudget({maxWork:5}),new HitBudget({maxSegments:10}),new HitBudget({maxSegmentsPerElement:10})]) assert.throws(() => cut(stroke(),[100,100],[100,100],6,{budget}),code('LIMIT_EXCEEDED'));
  assert.throws(() => cut(stroke(),[100,100],[100,100],6,{maxPieces:1}).changes(),code('LIMIT_EXCEEDED'));
  const edge = stroke({transform:[0.001,0,0,0.001,0,0],points:[[10_000_000,0,1]],width:1});validateDocument(native([edge]));
  assert.throws(() => cut(edge,[10000,0],[10000,0],1),code('LIMIT_EXCEEDED')); // valid stroke, unrepresentable native ink coordinates
});

test('native ink validates convex closed commands, strict paints/coordinates/winding and stored/derived/part ceilings',() => {
  const e = {id:'part',type:'ink',transform:identity,color:'#aabbcc',parts:[square(0)]},doc = native([e]);
  assert.equal(validateDocument(doc).layers[0].elements[0].color,'#AABBCC');
  const variants = [[],[[]],[[['M',0,0],['L',10,0]]],[square(0).toReversed()],[[['M',0,0],['L',10,0],['L',5,5],['L',10,10],['L',0,10],['Z']]],[[['M',0,0],['X',1,2],['Z']]],Array(20_001)];
  for (const parts of variants) assert.throws(() => validateDocument(native([{...e,parts}])),error => ['INVALID_DOCUMENT','LIMIT_EXCEEDED'].includes(error.code));
  assert.throws(() => validateDocument(native([{...e,color:null}])),code('INVALID_DOCUMENT'));
  for (const limits of [{points:4},{pointsPerElement:4},{derivedSegments:4},{derivedSegmentsPerElement:4}]) assert.throws(() => validateDocument(doc,limits),code('LIMIT_EXCEEDED'));
  const huge = structuredClone(e);huge.parts[0][1][1] = Infinity;assert.throws(() => validateDocument(native([huge])),code('INVALID_DOCUMENT'));
  let count = 0;traceElementPath({moveTo(){count++;},lineTo(){count++;},closePath(){count++;}},e);assert.equal(count,5);
});

test('state preview/commit preserves painter slots, active layer, untouched identities, selection and exact sampled Undo',async () => {
  const s = state(),e = stroke(),other = {...stroke(),id:'other',points:[[300,100,1]]},data = native([e,other]);data.layers.push({...layer([]),id:'other-layer'});await s.load(data);s.setActiveLayer('ink');s.setSelection(['pen','other']);
  const before = s.save(),originals = s.document.layers[0].elements,revision = s.getRevision(),context = s.prepareErase('partial'),changes = cut(e).changes(),events = [];s.on('change',e => events.push(e));
  const preview = s.previewPartialErase(context,changes);assert.equal(preview.elements.length,3);assert.equal(preview.elements[2],originals[1]);assert.deepEqual(s.save(),before);assert.equal(s.getRevision(),revision);assert.equal(s.canUndo(),false);
  s.commitPartialErase(context,changes);const after = s.save();assert.equal(events.length,1);assert.equal(events[0].label,'Partially erase ink');assert.deepEqual(s.getSelection(),['pen','other']);assert.deepEqual(after.layers[1],before.layers[1]);
  assert.equal(s.document.layers[0].elements[2],originals[1]);s.undo();assert.deepEqual(s.save(),before);s.redo();assert.deepEqual(s.save(),after);await s.load(after);assert.deepEqual(s.save(),after);s.destroy();
});

test('state misses preserve redo/revision; foreign targets, invalid ink/IDs, stale contexts and mismatched modes are atomic',async () => {
  const s = state();await s.load(native([stroke()]));s.translateLayer('ink',[1,0]);s.undo();const before = s.save(),revision = s.getRevision(),context = s.prepareErase('partial');s.commitPartialErase(context,[]);assert.equal(s.canRedo(),true);assert.equal(s.getRevision(),revision);
  for (const changes of [[{id:'unknown',groups:[],ids:[]}],[{id:'pen',groups:[],ids:['pen']}],[{id:'pen',groups:[[square(0)]],ids:['wrong']}],[{id:'pen',groups:[[square(0)],[square(20)]],ids:['pen','ink']}],[{id:'pen',groups:[[]],ids:['pen']}],[{id:'pen',groups:[],ids:[]},{id:'pen',groups:[],ids:[]}]]) assert.throws(() => s.commitPartialErase(context,changes));
  assert.deepEqual(s.save(),before);s.setLayerLocked('ink',true);assert.throws(() => s.commitPartialErase(context,cut().changes()),code('CANCELLED'));s.destroy();
});

test('full destination element/point/derived/JSON limits roll back every proposed ink piece',async () => {
  const e = stroke(),changes = cut(e).changes();
  for (const limits of [{elements:1},{points:3},{derivedSegments:4300},{jsonBytes:2000}]) {
    const s = state({limits});await s.load(native([e]));const before = s.save(),context = s.prepareErase('partial'),revision = s.getRevision();
    assert.throws(() => s.previewPartialErase(context,changes),code('LIMIT_EXCEEDED'));assert.throws(() => s.commitPartialErase(context,changes),code('LIMIT_EXCEEDED'));assert.deepEqual(s.save(),before);assert.equal(s.getRevision(),revision);s.destroy();
  }
});

test('drawing capacity accounts for native ink commands and translated/merged ink retains its local geometry',async () => {
  const e = {id:'i',type:'ink',transform:identity,color:'#112233',parts:[square(0)]},s = state({limits:{points:5}});await s.load(native([e]));assert.throws(() => s.prepareDrawing('pen'),code('LIMIT_EXCEEDED'));
  const before = s.save().layers[0].elements[0];s.translateLayer('ink',[20,30]);assert.deepEqual(s.save().layers[0].elements[0],before);s.undo();s.createLayer('Upper');s.mergeDown();assert.equal(s.save().layers[0].elements[0].type,'ink');s.destroy();
});
