import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EditorState} from '../../../src/etch/state.js';
import {AssetPool} from '../../../src/etch/assets.js';
import {Emitter} from '../../../src/etch/events.js';
import {fixture,png,code} from './helpers.js';
const state=()=>new EditorState({decode:async()=>new AssetPool()});
async function settled(promise) {
  let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Deferred operation never settled after destruction')),150);})]);}finally{clearTimeout(timer);}
}

test('destroy rejects every queued asynchronous document operation rather than abandoning promises',async()=>{
  const s=state(),jobs=[];let calls=0;
  s.on('change',()=>{
    for(const job of [s.load(fixture()),s.beginImageImport([0,0]),s.beginDocumentImport([0,0]),s.importDocument(fixture(),[0,0])])jobs.push(job.then(()=> 'resolved',e=>e.code));
    s.destroy();
  });
  s.on('change',()=>calls++);s.on('historychange',()=>calls++);s.on('selectionchange',()=>calls++);
  s.createLayer();assert.deepEqual(await settled(Promise.all(jobs)),Array(4).fill('CANCELLED'));assert.equal(calls,0);
  await assert.rejects(s.load(fixture()),code('DESTROYED'));
});

test('destroy closes an image resource owned by a queued commit exactly once',async()=>{
  const s=state();await s.load(fixture());const context=await s.beginImageImport([0,0]);let result,closed=0;
  s.on('selectionchange',()=>{
    result=s.commitImageImport(context,{id:'new-asset',mime:'image/png',width:1,height:1,data:png()},{image:{},close(){closed++;}}).then(()=> 'resolved',e=>e.code);
    s.destroy();
  });
  s.setSelection(['line']);assert.equal(await settled(result),'CANCELLED');assert.equal(closed,1);
});

test('destroy disposes prepared native imports whose commits were queued by a session event',async()=>{
  const s=state();await s.load(fixture());const c=await s.beginDocumentImport([0,0]);await s.prepareDocumentImport(c,fixture());let result;
  s.on('selectionchange',()=>{result=s.commitDocumentImport(c).then(()=> 'resolved',e=>e.code);s.destroy();});
  s.setSelection(['line']);assert.equal(await settled(result),'CANCELLED');assert.equal(c.plan,null);assert.equal(c.pool,null);assert.equal(c.release,null);
});

test('async session deferral preserves ordering and rejects both thrown failures and teardown cancellation',async()=>{
  const s=state(),order=[],failure=new Error('session failed');let result;
  s.on('change',()=>{result=s.runSessionAsync(()=>{order.push('session');throw failure;}).then(()=>null,e=>e);});
  s.on('historychange',()=>order.push('history'));s.createLayer();assert.equal(await settled(result),failure);assert.deepEqual(order,['history','session']);s.destroy();
  const cancelled=state();cancelled.on('change',()=>{result=cancelled.runSessionAsync(()=>assert.fail('cancelled action ran')).then(()=>null,e=>e.code);cancelled.destroy();});
  cancelled.createLayer();assert.equal(await settled(result),'CANCELLED');await assert.rejects(cancelled.runSessionAsync(()=>{}),code('DESTROYED'));
});

test('clearing an emitter cancels queued work, stops the current listener batch and permits later reuse',()=>{
  const emitter=new Emitter(),calls=[],reason=new Error('closed');
  emitter.on('one',()=>{emitter.defer(()=>calls.push('ran'),error=>calls.push(error));emitter.clear(reason);});
  emitter.on('one',()=>calls.push('stale listener'));emitter.on('two',()=>calls.push('stale batch'));
  emitter.emitBatch([['one',{}],['two',{}]]);assert.deepEqual(calls,[reason]);
  emitter.on('one',()=>calls.push('new listener'));emitter.emitBatch([['one',{}]]);assert.deepEqual(calls,[reason,'new listener']);
});
