import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EditorState} from '../../../src/etch/state.js';
import {AssetPool} from '../../../src/etch/assets.js';
import {multiply,translate} from '../../../src/etch/geometry/matrix.js';
import {fixture,code,deferred} from './helpers.js';

const state=options=>new EditorState({decode:async()=>new AssetPool(),...options});
function layered(){const d=fixture();d.layers.push({id:'upper',name:'Upper',visible:true,locked:false,offset:[-30,40],elements:d.layers[0].elements.map(e=>({...e,id:`upper-${e.id}`,transform:[2,0.3,0.2,1,-2,3]}))});return d;}
function crowded(){return {format:'lightmetal-etch',version:1,background:null,assets:[],layers:[
  {id:'lower',name:'Below',visible:true,locked:false,offset:[0,0],elements:[]},
  {id:'upper',name:'Above',visible:true,locked:false,offset:[100000,100000],elements:Array.from({length:100},(_,i)=>({id:`r${i}`,type:'rect',transform:[1,0,0,1,0,0],x:0,y:0,width:10,height:10,fill:'#112233',stroke:null,strokeWidth:0,lineJoin:'round',miterLimit:4}))},
]};}

test('background normalizes opaque colors and is one undoable document-only edit retaining selection/assets/session state',async()=>{
  const s=state();await s.load(fixture());s.setSelection(['image']);const before=s.save(),revision=s.getRevision(),events=[];s.on('change',e=>events.push(e));
  s.setBackground('#aabbcc');const after=s.save();assert.equal(after.background,'#AABBCC');assert.deepEqual(after.layers,before.layers);assert.deepEqual(after.assets,before.assets);assert.deepEqual(s.getSelection(),['image']);assert.equal(s.getActiveLayer(),'layer');assert.notEqual(s.getRevision(),revision);assert.equal(events.length,1);assert.equal(events[0].label,'Background');
  s.undo();assert.deepEqual(s.save(),before);s.redo();assert.deepEqual(s.save(),after);await s.load(after);assert.deepEqual(s.save(),after);s.setBackground(null);assert.equal(s.save().background,null);s.undo();assert.equal(s.save().background,'#AABBCC');s.destroy();
});
test('background no-ops/invalid values retain redo and hidden/locked layers do not block document background',async()=>{
  const s=state();await s.load(fixture());s.setBackground('#112233');s.undo();const revision=s.getRevision(),before=s.save();s.setBackground(null);assert.equal(s.getRevision(),revision);assert.equal(s.canRedo(),true);
  for(const value of ['#fff','#11223344','transparent','red','url(x)',{},0])assert.throws(()=>s.setBackground(value),code('INVALID_ARGUMENT'));assert.deepEqual(s.save(),before);
  s.setLayerLocked('layer',true);s.setLayerVisibility('layer',false);s.setBackground('#FFFFFF');assert.equal(s.save().background,'#FFFFFF');assert.equal(s.save().layers[0].locked,true);assert.equal(s.save().layers[0].visible,false);s.destroy();
});
test('background destination JSON limits roll back without changing revision or selection',async()=>{
  const data=fixture(),s=state({limits:{jsonBytes:Buffer.byteLength(JSON.stringify(data))+1}});await s.load(data);s.setSelection(['image']);const before=s.save(),revision=s.getRevision();assert.throws(()=>s.setBackground('#FFFFFF'),code('LIMIT_EXCEEDED'));assert.deepEqual(s.save(),before);assert.equal(s.getRevision(),revision);assert.deepEqual(s.getSelection(),['image']);assert.equal(s.canUndo(),false);s.destroy();
});
test('Merge Down rejects missing neighbors and either hidden/locked participant without changing content/history',async()=>{
  for(const [index,flag] of [[0,'locked'],[0,'visible'],[1,'locked'],[1,'visible']]){
    const d=layered();d.layers[index][flag]=flag==='locked';const s=state();await s.load(d);s.setActiveLayer('upper');const before=s.save(),revision=s.getRevision();
    assert.throws(()=>s.mergeDown(),code('LAYER_NOT_EDITABLE'));assert.deepEqual(s.save(),before);assert.equal(s.getRevision(),revision);assert.equal(s.canUndo(),false);s.destroy();
  }
  const s=state();await s.load(layered());s.setActiveLayer('layer');assert.throws(()=>s.mergeDown(),code('INVALID_ARGUMENT'));s.destroy();
});
test('Merge Down preserves world matrices, painter order and embedded bytes, clears selection and restores both layers and active layer on Undo',async()=>{
  const s=state();await s.load(layered());s.setActiveLayer('upper');s.setSelection(['upper-image']);const before=s.save(),events=[];s.on('change',e=>events.push(e));
  assert.equal(s.mergeDown(),'layer');const after=s.save();assert.equal(after.layers.length,1);assert.equal(s.getActiveLayer(),'layer');assert.deepEqual(s.getSelection(),[]);assert.deepEqual(after.assets,before.assets);
  assert.deepEqual(after.layers[0].elements.map(e=>e.id),before.layers.flatMap(l=>l.elements.map(e=>e.id)));assert.deepEqual(after.layers[0].offset,before.layers[0].offset);assert.equal(after.layers[0].name,before.layers[0].name);assert.equal(events.length,1);
  for(const layer of before.layers) for(const element of layer.elements) {
    const merged=after.layers[0].elements.find(e=>e.id===element.id);
    assert.deepEqual({...merged,transform:element.transform},element);
    assert.deepEqual(multiply(translate(...after.layers[0].offset),merged.transform),multiply(translate(...layer.offset),element.transform));
  }
  s.undo();assert.deepEqual(s.save(),before);assert.equal(s.getActiveLayer(),'upper');s.redo();assert.deepEqual(s.save(),after);s.destroy();
});
test('Merge Down full destination JSON limit rolls back even when removing a layer',async()=>{
  const d=crowded(),s=state({limits:{jsonBytes:Buffer.byteLength(JSON.stringify(d))+16}});await s.load(d);s.setActiveLayer('upper');const before=s.save(),revision=s.getRevision();
  assert.throws(()=>s.mergeDown(),code('LIMIT_EXCEEDED'));assert.deepEqual(s.save(),before);assert.equal(s.getRevision(),revision);assert.equal(s.canUndo(),false);s.destroy();
});
test('background and merge obey read-only, pending-operation and destroyed guards',async()=>{
  const ro=state({readOnly:true});for(const action of [()=>ro.setBackground('#FFFFFF'),()=>ro.mergeDown()])assert.throws(action,code('READ_ONLY'));ro.destroy();
  const gate=deferred(),s=state({decode:()=>gate.promise}),load=s.load(layered());assert.throws(()=>s.setBackground('#FFFFFF'),code('BUSY'));assert.throws(()=>s.mergeDown(),code('BUSY'));gate.resolve(new AssetPool());await load;s.destroy();assert.throws(()=>s.setBackground(null),code('DESTROYED'));assert.throws(()=>s.mergeDown(),code('DESTROYED'));
});
