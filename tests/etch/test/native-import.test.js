import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EditorState} from '../../../src/etch/state.js';
import {AssetPool} from '../../../src/etch/assets.js';
import {EtchError} from '../../../src/etch/errors.js';
import {planDocumentImport} from '../../../src/etch/native-import.js';
import {documentBounds} from '../../../src/etch/geometry/paths.js';
import {multiply,translate} from '../../../src/etch/geometry/matrix.js';
import {fixture,code,deferred} from './helpers.js';

const state=options=>new EditorState({decode:async()=>new AssetPool(),...options});
function source(){const d=fixture();d.background='#ABCDEF';d.layers[0].locked=true;d.layers.push({...structuredClone(d.layers[0]),id:'second',name:'Second',offset:[-60,70],elements:d.layers[0].elements.map(e=>({...structuredClone(e),id:`second-${e.id}`}))});d.layers.push({id:'hidden',name:'Hidden <&>',visible:false,locked:false,offset:[0,0],elements:[]});return d;}
function plan(input=source(),extra={}){const d=fixture();return planDocumentImport(input,{document:d,target:'layer',center:[300,200],...extra});}
const ids=d=>[...d.assets.map(a=>a.id),...d.layers.flatMap(l=>[l.id,...l.elements.map(e=>e.id)])];
const near=(a,b)=>a.forEach((n,i)=>assert.ok(Math.abs(n-b[i])<1e-8,`${a} != ${b}`));

test('native import planner flattens visible locked source layers in order, bakes offsets and centers without scaling',()=>{
  const input=source(),before=structuredClone(input),p=plan(input),l=p.document.layers[1],visible=input.layers.filter(l=>l.visible),original=visible.flatMap(l=>l.elements);
  assert.equal(l.visible,true);assert.equal(l.locked,false);assert.equal(l.elements.length,12);assert.deepEqual(l.elements.map(e=>e.type),original.map(e=>e.type));
  let i=0;for(const sourceLayer of visible)for(const e of sourceLayer.elements){const copy=l.elements[i++];assert.deepEqual(copy.transform,multiply(translate(...sourceLayer.offset),e.transform));assert.deepEqual({...copy,id:e.id,transform:e.transform,...(e.type==='image'?{assetId:e.assetId}:{})},e);}
  const b=documentBounds({...p.document,layers:[l]});near([b.x+b.width/2,b.y+b.height/2],[300,200]);assert.deepEqual(input,before);assert.equal(p.document.background,null);
  assert.deepEqual(p.warnings,[{code:'HIDDEN_LAYERS_OMITTED',layers:[{id:'hidden',name:'Hidden <&>'}]},{code:'BACKGROUND_OMITTED',color:'#ABCDEF'}]);
});
test('all imported IDs and asset references are fresh, referenced compressed bytes exact, omitted assets excluded',()=>{
  const d=source();d.assets.push({...d.assets[0],id:'unused'});const p=plan(d),l=p.document.layers[1],originalIds=new Set(ids(d));
  for(const id of [l.id,...l.elements.map(e=>e.id),...p.assets.map(a=>a.id)])assert.equal(originalIds.has(id),false);
  assert.equal(p.assets.length,1);assert.equal(p.assets[0].data,d.assets[0].data);assert.equal(l.elements.filter(e=>e.type==='image').every(e=>e.assetId===p.assets[0].id),true);assert.equal(new Set(ids(p.document)).size,ids(p.document).length);
  assert.throws(()=>plan(d,{id:()=> 'layer'}),code('LIMIT_EXCEEDED'));
});
test('native planner rejects empty/hidden-only/background-only sources and validates omitted content',()=>{
  const empty=fixture();empty.layers[0].elements=[];empty.background='#FFFFFF';assert.throws(()=>plan(empty),code('EMPTY_IMPORT'));
  const hidden=fixture();hidden.layers[0].visible=false;assert.throws(()=>plan(hidden),code('EMPTY_IMPORT'));
  const malformed=source();malformed.layers[2].elements=[{type:'unknown'}];assert.throws(()=>plan(malformed),code('INVALID_DOCUMENT'));
  assert.throws(()=>plan('{'),code('INVALID_DOCUMENT'));assert.throws(()=>plan({...source(),version:99}),code('UNSUPPORTED_VERSION'));
  assert.throws(()=>plan(source(),{limits:{elements:13}}),code('LIMIT_EXCEEDED'));
});
test('importDocument commits once, preserves destination/artwork/assets/background and exact Undo/redo/reopen',async()=>{
  const s=state();await s.load(fixture());s.setSelection(['image']);s.setBackground('#112233');const before=s.save(),active=s.getActiveLayer(),events=[];s.on('change',e=>events.push(e));
  const result=await s.importDocument(JSON.stringify(source()),[300,200]),after=s.save();assert.equal(result.revision,s.getRevision());assert.equal(result.layerId,s.getActiveLayer());assert.equal(result.warnings.length,2);assert.deepEqual(s.getSelection(),[]);assert.deepEqual(after.layers[0],before.layers[0]);assert.equal(after.background,'#112233');assert.equal(after.assets[1].data,before.assets[0].data);assert.equal(events.length,1);assert.equal(events[0].source,'import');
  result.warnings[0].layers[0].name='changed';assert.equal(after.layers[1].name,'Imported drawing');s.undo();assert.deepEqual(s.save(),before);assert.equal(s.getActiveLayer(),active);s.redo();assert.deepEqual(s.save(),after);await s.load(after);assert.deepEqual(s.save(),after);s.destroy();
});
test('prepared summary is detached and committed-only; cancel retains content/revision/redo and closes owned assets',async()=>{
  let closed=0;const s=state({decode:async doc=>{const pool=new AssetPool();for(const a of doc.assets)pool.add(a.id,{image:{},close:()=>closed++});return pool;}});
  await s.load(fixture());s.setBackground('#FFFFFF');s.undo();s.setSelection(['image']);const before=s.save(),revision=s.getRevision(),available=s.availableRasterPixels();
  const c=await s.beginDocumentImport([0,0]),summary=await s.prepareDocumentImport(c,source());summary.warnings.length=0;assert.equal(s.busy,true);assert.deepEqual(s.save(),before);assert.equal(s.getRevision(),revision);assert.equal(s.availableRasterPixels(),available-1);
  s.cancelDocumentImport(c);assert.equal(s.busy,false);assert.equal(closed,1);assert.equal(s.availableRasterPixels(),available);assert.deepEqual(s.getSelection(),['image']);assert.equal(s.canRedo(),true);await assert.rejects(s.commitDocumentImport(c),code('CANCELLED'));s.destroy();
});
test('object input is detached before awaiting decode and insertion target/placement are captured',async()=>{
  const gate=deferred();let delay=false;const s=state({decode:async()=>{if(delay)await gate.promise;return new AssetPool();}});await s.load(fixture());const target=s.getActiveLayer();delay=true;const input=source(),pending=s.importDocument(input,[100,200]);input.layers[0].elements[0].color='#FF0000';s.setActiveLayer(target);assert.equal(s.busy,true);gate.resolve();await pending;
  assert.equal(s.save().layers[1].elements[0].color,'#112233');const b=documentBounds({...s.save(),layers:[s.save().layers[1]]});near([b.x+b.width/2,b.y+b.height/2],[100,200]);s.destroy();
});
test('native import is single-flight and content edits block while navigation/session selection remain independent',async()=>{
  const s=state();await s.load(fixture());const c=await s.beginDocumentImport([0,0]);
  await assert.rejects(s.importDocument(source(),[0,0]),code('BUSY'));await assert.rejects(s.beginImageImport([0,0]),code('BUSY'));assert.throws(()=>s.setBackground(null),code('BUSY'));s.setSelection(['line']);s.setActiveLayer('layer');s.cancelDocumentImport(c);assert.deepEqual(s.getSelection(),['line']);s.destroy();
});
test('load/cancel/destroy racing late native decode dispose temporary pools and hold pixel leases until settled',async()=>{
  for(const action of ['load','cancel','destroy']){
    let delayed=false,closed=0;const gate=deferred(),s=state({decode:async doc=>{if(delayed)await gate.promise;const p=new AssetPool();for(const a of doc.assets)p.add(a.id,{image:{},close:()=>closed++});return p;}});await s.load(fixture());const before=s.save();delayed=true;
    const pending=s.importDocument(source(),[0,0]),rejected=assert.rejects(pending,code('CANCELLED'));const available=s.availableRasterPixels();
    if(action==='cancel')s.cancel();if(action==='destroy')s.destroy();if(action==='load'){delayed=false;const d=fixture();d.background='#010203';await s.load(d);}
    if(action==='cancel')assert.equal(s.availableRasterPixels(),available);gate.resolve();await rejected;assert.ok(closed>=1);
    if(action!=='destroy'){if(action==='cancel')assert.deepEqual(s.save(),before);else assert.equal(s.save().background,'#010203');s.destroy();}
  }
});
test('decode/resource failures keep native content/history unchanged and release reservations',async()=>{
  const s=state();await s.load(fixture());const before=s.save(),available=s.availableRasterPixels();
  const lease=s.reserveRasterPixels(available);await assert.rejects(s.importDocument(source(),[0,0]),code('LIMIT_EXCEEDED'));lease();assert.equal(s.availableRasterPixels(),available);assert.deepEqual(s.save(),before);
  const retained=state({limits:{assets:1}});await retained.load(fixture());await assert.rejects(retained.importDocument(source(),[0,0]),code('LIMIT_EXCEEDED'));assert.equal(retained.busy,false);retained.destroy();s.destroy();
});
test('read-only/hidden/locked insertion and destroyed native import follow document import guards',async()=>{
  const ro=state({readOnly:true});await assert.rejects(ro.importDocument(source(),[0,0]),code('READ_ONLY'));ro.destroy();
  const s=state();await s.load(fixture());s.setLayerLocked('layer',true);s.setLayerVisibility('layer',false);await s.importDocument(source(),[0,0]);assert.equal(s.save().layers[0].locked,true);assert.equal(s.save().layers[1].visible,true);s.destroy();await assert.rejects(s.importDocument(source(),[0,0]),code('DESTROYED'));
});
test('a failed decoder releases the import reservation and preserves the prior committed baseline',async()=>{
  let reject=false;const s=state({decode:async()=>{if(reject)throw new EtchError('DECODE_FAILED','Test decode failed');return new AssetPool();}});await s.load(fixture());const before=s.save(),available=s.availableRasterPixels();reject=true;await assert.rejects(s.importDocument(source(),[0,0]),code('DECODE_FAILED'));assert.equal(s.busy,false);assert.equal(s.availableRasterPixels(),available);assert.deepEqual(s.save(),before);s.destroy();
});
test('reentrant import from a change listener starts after the batch and is not cancelled by the previous import cleanup',async()=>{
  const s=state();await s.load(fixture());let second;s.on('change',event=>{if(event.label==='Import drawing' && !second)second=s.importDocument(source(),[50,60]);});
  const first=await s.importDocument(source(),[0,0]);await second;assert.equal(s.save().layers.length,3);assert.notEqual(first.layerId,s.getActiveLayer());assert.equal(s.busy,false);s.undo();assert.equal(s.save().layers.length,2);s.undo();assert.deepEqual(s.save(),fixture());s.destroy();
});
test('asset ownership transfer is atomic and does not close the old pool on ID collision',()=>{
  let closed=0;const a=new AssetPool(),b=new AssetPool();a.add('a',{image:1,close:()=>closed++});b.add('a',{image:2,close:()=>closed++});assert.throws(()=>a.transferTo(b),code('INVALID_ARGUMENT'));assert.equal(a.get('a'),1);assert.equal(b.get('a'),2);a.dispose();b.dispose();assert.equal(closed,2);
});
