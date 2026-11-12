import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeBackground,paperGrid,paperBands} from '../../../src/etch/background.js';
import {validateDocument} from '../../../src/etch/validation.js';
import {EditorState} from '../../../src/etch/state.js';
import {AssetPool} from '../../../src/etch/assets.js';
import {serializeSVG} from '../../../src/etch/svg-export.js';
import {planPNG} from '../../../src/etch/png-export.js';
import {planDocumentImport} from '../../../src/etch/native-import.js';
import {fixture,code,deferred} from './helpers.js';

const state = options => new EditorState({decode:async () => new AssetPool(),...options});
const types = ['dots','graph','ruled','engineering'];

test('paper backgrounds whitelist fresh native data and retain legacy null/solid representation',() => {
  for (const type of types) for (const spacing of [8,24,128]) {
    const d = fixture();d.background = {type,spacing,untrusted:'discard'};
    const parsed = validateDocument(d);assert.deepEqual(parsed.background,{type,spacing});assert.notEqual(parsed.background,d.background);
    d.background.spacing = 60;assert.equal(parsed.background.spacing,spacing);
    assert.deepEqual(validateDocument(JSON.stringify(parsed)),parsed);
  }
  assert.equal(normalizeBackground(null),null);assert.equal(normalizeBackground('#abcdef'),'#ABCDEF');
  for (const value of [undefined,[],{},'#fff','graph',{type:'photo',spacing:24},{type:'toString',spacing:24},{type:Object.create(null),spacing:24},{type:'graph'},{type:'graph',spacing:'24'},...[-1,0,7,129,NaN,Infinity,24.5].map(spacing => ({type:'graph',spacing})),Object.assign(new Date(),{type:'graph',spacing:24})]) {
    assert.throws(() => validateDocument({...fixture(),background:value}),code('INVALID_DOCUMENT'));
    assert.throws(() => normalizeBackground(value,'INVALID_ARGUMENT',true),code('INVALID_ARGUMENT'));
  }
  assert.throws(() => normalizeBackground({type:'graph',spacing:24,color:'#FFFFFF'},'INVALID_ARGUMENT',true),code('INVALID_ARGUMENT'));
});

test('paper changes are one undoable edit, detached from callers, preserving artwork/assets/selection and suppressing equivalent changes',async () => {
  const s = state();await s.load(fixture());s.setSelection(['image']);const before = s.save(),events = [];
  s.on('change',e => events.push(e));
  for (const type of types) {
    const setting = {type,spacing:24};s.setBackground(setting);setting.spacing = 90;
    const after = s.save(),revision = s.getRevision();
    assert.deepEqual(after.background,{type,spacing:24});assert.deepEqual(after.layers,before.layers);assert.deepEqual(after.assets,before.assets);
    assert.deepEqual(s.getSelection(),['image']);assert.equal(s.getActiveLayer(),'layer');
    s.setBackground({spacing:24,type});assert.equal(s.getRevision(),revision);
    s.undo();assert.deepEqual(s.save(),before);s.setBackground(null);assert.equal(s.canRedo(),true);
    s.redo();assert.deepEqual(s.save(),after);s.undo();
  }
  assert.equal(events.length,types.length*4);assert.ok(events.every(e => e.label === 'Background'));
  s.setBackground({type:'engineering',spacing:32});const saved = s.save();saved.background.spacing = 99;
  assert.equal(s.save().background.spacing,32);await s.load(s.save());assert.deepEqual(s.save().background,{type:'engineering',spacing:32});s.destroy();
});

test('paper destination limits and public guards reject without changing content/revision',async () => {
  const d = fixture(),s = state({limits:{jsonBytes:Buffer.byteLength(JSON.stringify(d))}});await s.load(d);const revision = s.getRevision();
  assert.throws(() => s.setBackground({type:'graph',spacing:24}),code('LIMIT_EXCEEDED'));assert.deepEqual(s.save(),d);assert.equal(s.getRevision(),revision);assert.equal(s.canUndo(),false);s.destroy();
  const ro = state({readOnly:true});assert.throws(() => ro.setBackground({type:'graph',spacing:24}),code('READ_ONLY'));ro.destroy();
  const gate = deferred(),busy = state({decode:() => gate.promise}),pending = busy.load(d);
  assert.throws(() => busy.setBackground({type:'graph',spacing:24}),code('BUSY'));gate.resolve(new AssetPool());await pending;busy.destroy();
  assert.throws(() => busy.setBackground({type:'graph',spacing:24}),code('DESTROYED'));
});

test('paper line plans share world-origin phase across crops/zoom/DPR, with heavier engineering lines every five squares',() => {
  for (const type of types) {
    const paper = {type,spacing:24},grid = paperGrid(paper),scale = 2.5,pan = [-13,21];
    assert.equal(grid.groups[0].vertical,type !== 'ruled');
    const a = paperBands(paper,{width:800,height:400,scale,pan});
    const b = paperBands(paper,{width:800,height:400,scale,pan:pan.map(p => p+grid.size*scale)});
    assert.deepEqual(a,b);
    for (const band of a.bands) {assert.ok(Number.isFinite(band.start));assert.ok(band.count < 1000);assert.equal(band.step,(band.color === grid.groups[0].color ? 24 : 120)*scale);}
    if (type === 'engineering') {assert.equal(grid.size,120);assert.equal(grid.groups[1].width,1);assert.equal(grid.groups[1].spacing,120);}
  }
  assert.throws(() => paperBands({type:'dots',spacing:8},{width:8192,height:8192,scale:0.1,pan:[0,0]}),code('LIMIT_EXCEEDED'));
  const paper = {type:'engineering',spacing:8};
  assert.ok(paperBands(paper,{width:8192,height:8192,scale:0.1,pan:[1e300,-1e300]}).bands.every(b => Number.isFinite(b.start)));
  for (const scale of [1e-12,Number.MAX_VALUE,0]) assert.throws(() => paperBands(paper,{width:800,height:400,scale,pan:[0,0]}),code('LIMIT_EXCEEDED'));
});

test('SVG paper remains a small vector pattern for huge fractional crops and PNG keeps artwork-only crop rules',() => {
  for (const type of types) {
    const d = {background:{type,spacing:24},layers:[],assets:[]},svg = serializeSVG(d,{bounds:{x:-100.25,y:-250.5,width:1e8,height:1e8},padding:0.125});
    assert.match(svg,/<pattern id="etch-paper" patternUnits="userSpaceOnUse"/);assert.match(svg,/fill="url\(#etch-paper\)"/);
    assert.match(svg,/x="-100.375" y="-250.625" width="100000000.25" height="100000000.25"/);
    assert.equal((svg.match(/<pattern /g) ?? []).length,1);assert.equal((svg.match(/<path /g) ?? []).length,type === 'engineering' ? 2 : type === 'dots' ? 0 : 1);
    if (type === 'dots') assert.match(svg,/<circle[^>]*r="1"/);
    assert.ok(svg.length < 2000);assert.doesNotMatch(svg,/<image|base64|https:|<script/);
    const size = Buffer.byteLength(svg);assert.equal(serializeSVG(d,{bounds:{x:-100.25,y:-250.5,width:1e8,height:1e8},padding:0.125},{jsonBytes:size}),svg);
    assert.throws(() => serializeSVG(d,{bounds:{x:-100.25,y:-250.5,width:1e8,height:1e8},padding:0.125},{jsonBytes:size-1}),code('EXPORT_TOO_LARGE'));
    assert.deepEqual(planPNG(d).bounds,{x:-144,y:-144,width:288,height:288});
  }
  assert.throws(() => serializeSVG({background:{type:'image',spacing:24},layers:[],assets:[]}),code('INVALID_DOCUMENT'));
});

test('native insertion omits source paper with a structured warning, without changing destination paper',() => {
  const source = fixture(),destination = fixture();source.background = {type:'engineering',spacing:24};destination.background = {type:'ruled',spacing:28};
  const plan = planDocumentImport(source,{document:destination,target:'layer',center:[0,0]});
  assert.deepEqual(plan.document.background,destination.background);
  assert.deepEqual(plan.warnings,[{code:'BACKGROUND_OMITTED',background:{type:'engineering',spacing:24}}]);
  source.background.spacing = 80;assert.equal(plan.warnings[0].background.spacing,24);
});
