import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readUTF8Blob} from '../../../src/etch/text-input.js';
import {code} from './helpers.js';
const options=extra=>({maximum:1000,invalidCode:'INVALID_DOCUMENT',label:'Drawing',...extra});

test('native UTF-8 file reads preserve JSON and bypass per-instance size/text/stream overrides',async()=>{
  const text=JSON.stringify({note:'<script> & 🖊 café'}),blob=new Blob([text]),bytes=new TextEncoder().encode(text).length;
  blob.text=blob.stream=()=>assert.fail('Per-instance Blob method used');Object.defineProperty(blob,'size',{value:0});
  assert.equal(await readUTF8Blob(blob,options({maximum:bytes})),text);
  const original=Blob.prototype.stream;let opened=0;Blob.prototype.stream=function(){opened++;return original.call(this);};
  try{await assert.rejects(readUTF8Blob(blob,options({maximum:bytes-1})),code('LIMIT_EXCEEDED'));assert.equal(opened,0);}finally{Blob.prototype.stream=original;}
});

test('native UTF-8 reader aborts outstanding reads and releases its stream lock without returning partial data',async()=>{
  const controller=new AbortController(),original=Blob.prototype.stream;let cancelled=0;
  const stream=new ReadableStream({pull(){},cancel(){cancelled++;}});Blob.prototype.stream=()=>stream;
  try{
    const pending=readUTF8Blob(new Blob(['{}']),options({signal:controller.signal})),rejected=assert.rejects(pending,code('CANCELLED'));
    controller.abort();await rejected;assert.equal(cancelled,1);assert.equal(stream.locked,false);
  }finally{Blob.prototype.stream=original;}
});

test('native UTF-8 rejects malformed text, invalid input/caps and pre-aborted work',async()=>{
  await assert.rejects(readUTF8Blob(new Blob([new Uint8Array([0xff])]),options()),code('INVALID_DOCUMENT'));
  await assert.rejects(readUTF8Blob('not a Blob',options()),code('INVALID_ARGUMENT'));
  for(const maximum of [0,NaN,128*1024*1024+1])await assert.rejects(readUTF8Blob(new Blob(['{}']),options({maximum})),code('INVALID_ARGUMENT'));
  const controller=new AbortController();controller.abort();await assert.rejects(readUTF8Blob(new Blob(['{}']),options({signal:controller.signal})),code('CANCELLED'));
});
