import {test} from 'node:test';
import assert from 'node:assert/strict';
import {useBrowser,collapseDemoSidebar} from './fixture.js';
import {png,fixture as nativeFixture} from '../test/helpers.js';
const fixture=useBrowser(process.env.ETCH_LIFECYCLE_BROWSER ?? 'chromium');
async function setup(t) {
  const context=await fixture.browser.newContext({viewport:{width:1200,height:850}}),page=await context.newPage(),errors=[],external=[];
  page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>{if(!request.url().startsWith(fixture.server.origin+'/') && !/^(blob:|data:)/.test(request.url()))external.push(request.url());});
  t.after(async()=>{await context.close();assert.deepEqual(errors,[]);assert.deepEqual(external,[]);});
  await page.goto(fixture.server.origin+'/demo/');await collapseDemoSidebar(page);
  await page.evaluate(async()=>{const {createEtch}=await import('/etch.js'),card=document.createElement('div');card.id='lifecycle-card';card.style='width:700px;height:400px';document.body.prepend(card);window.lifecycleEditor=createEtch(card,{limits:{totalPixels:12,assetPixels:6,rasterDimension:16}});});
  return page;
}

test('host teardown during a change callback settles all queued public promises without late events or fullscreen entry',async t=>{
  const page=await setup(t),result=await page.evaluate(async()=>{
    const e=lifecycleEditor,card=document.querySelector('#lifecycle-card'),saved=e.save(),jobs=[];let laterEvents=0,entries=0,reads=0;
    card.querySelector('.etch').requestFullscreen=()=>{entries++;return Promise.resolve();};
    const image=new Blob(['not decoded'],{type:'image/png'});image.arrayBuffer=async()=>{reads++;throw new Error('Must not read after teardown');};
    e.on('change',()=>{
      for(const job of [e.load(saved),e.importDocument(saved),e.importImage(image),e.importSVG('<svg width="20" height="20"><rect width="10" height="10"/></svg>'),e.setExpanded(true)])jobs.push(job.then(()=> 'resolved',error=>error.code));
      e.destroy();
    });
    e.on('change',()=>laterEvents++);e.on('historychange',()=>laterEvents++);e.on('selectionchange',()=>laterEvents++);
    e.createLayer();let timer;
    const codes=await Promise.race([Promise.all(jobs),new Promise(resolve=>{timer=setTimeout(()=>resolve(['timeout']),1500);})]);clearTimeout(timer);
    const {createEtch}=await import('/etch.js'),replacement=createEtch(card),native=replacement.save();replacement.destroy();
    return {codes,laterEvents,entries,reads,roots:card.querySelectorAll('.etch').length,fullscreen:document.fullscreenElement!==null,inert:card.inert,overflow:document.body.style.overflow,replacementLayers:native.layers.length};
  });
  assert.deepEqual(result,{codes:Array(5).fill('CANCELLED'),laterEvents:0,entries:0,reads:0,roots:0,fullscreen:false,inert:false,overflow:'',replacementLayers:1});
});

for(const action of ['cancel','load','destroy']) test(`fallback image decode cleans its Blob URL and late resource after ${action}`,async t=>{
  const page=await setup(t);await page.evaluate(data=>{
    const e=lifecycleEditor,bytes=Uint8Array.from(atob(data),c=>c.charCodeAt(0));window.lifecycleBlob=new Blob([bytes],{type:'image/png'});
    window.savedLifecycle=e.save();window.originalLifecycleDecode=HTMLImageElement.prototype.decode;window.createImageBitmap=undefined;
    const create=URL.createObjectURL.bind(URL),revoke=URL.revokeObjectURL.bind(URL);window.createdLifecycleURLs=[];window.revokedLifecycleURLs=[];
    URL.createObjectURL=blob=>{const url=create(blob);createdLifecycleURLs.push(url);return url;};URL.revokeObjectURL=url=>{revokedLifecycleURLs.push(url);revoke(url);};
    HTMLImageElement.prototype.decode=function(){window.gatedLifecycleImage=this;const decoded=originalLifecycleDecode.call(this).then(()=>({ok:true}),error=>({error}));return new Promise((resolve,reject)=>{window.releaseLifecycleDecode=async()=>{const value=await decoded;value.error?reject(value.error):resolve();};});};
    window.lifecycleImport=e.importImage(lifecycleBlob,{format:'png'}).then(()=> 'resolved',error=>error.code);
  },png(2,3));await page.waitForFunction(()=>typeof releaseLifecycleDecode==='function');
  const result=await page.evaluate(async action=>{
    const e=lifecycleEditor,crop={bounds:{x:0,y:0,width:1,height:1},padding:0};let held,after;
    if(action==='cancel')e.cancel();else if(action==='load')await e.load(savedLifecycle);else e.destroy();
    if(action!=='destroy')try{await e.exportPNG(crop);held='unexpected export';}catch(error){held=error.code;}
    await releaseLifecycleDecode();const code=await lifecycleImport;
    HTMLImageElement.prototype.decode=originalLifecycleDecode;
    if(action!=='destroy'){after={same:JSON.stringify(e.save())===JSON.stringify(savedLifecycle),mime:(await e.exportPNG(crop)).blob.type};await e.importImage(lifecycleBlob,{format:'png'});e.destroy();}
    return {code,held,after,src:gatedLifecycleImage.getAttribute('src'),created:createdLifecycleURLs,revoked:revokedLifecycleURLs,roots:document.querySelector('#lifecycle-card').children.length};
  },action);
  assert.equal(result.code,'CANCELLED');assert.equal(result.src,null);assert.equal(result.roots,0);assert.ok(result.created.length>0);assert.deepEqual(result.revoked,result.created);
  if(action!=='destroy'){assert.equal(result.held,'EXPORT_TOO_LARGE');assert.deepEqual(result.after,{same:true,mime:'image/png'});}
});

for(const action of ['cancel','load','destroy']) test(`native JSON file stream is aborted immediately on ${action} with no stale import`,async t=>{
  const page=await setup(t);await page.evaluate(()=>{
    window.originalNativeStream=Blob.prototype.stream;window.nativeReadCancelled=0;window.nativeReadStarted=false;window.nativeReadErrors=[];window.beforeNativeRead=lifecycleEditor.save();
    lifecycleEditor.on('error',error=>nativeReadErrors.push(error));
    Blob.prototype.stream=function(){const source=originalNativeStream.call(this);nativeReadStarted=true;return new ReadableStream({pull(){},cancel(){nativeReadCancelled++;return source.cancel();}});};
  });
  await page.locator('#lifecycle-card input[aria-label="Choose Etch drawing"]').setInputFiles({name:'drawing.etch.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(nativeFixture()))});
  await page.waitForFunction(()=>nativeReadStarted);
  await page.evaluate(async action=>{Blob.prototype.stream=originalNativeStream;if(action==='cancel')lifecycleEditor.cancel();else if(action==='load')await lifecycleEditor.load(beforeNativeRead);else lifecycleEditor.destroy();},action);
  await page.waitForFunction(()=>nativeReadCancelled===1);assert.equal(await page.locator('#lifecycle-card .etch-native-dialog').isVisible(),false);
  const result=await page.evaluate(action=>{let same=true;if(action!=='destroy'){same=JSON.stringify(lifecycleEditor.save())===JSON.stringify(beforeNativeRead);lifecycleEditor.createLayer();lifecycleEditor.destroy();}return {same,errors:nativeReadErrors};},action);
  assert.deepEqual(result,{same:true,errors:[]});
});

test('invalid UTF-8 native JSON is rejected without silently replacing attachment text',async t=>{
  const page=await setup(t);await page.evaluate(()=>{window.nativeReadErrors=[];window.beforeNativeRead=JSON.stringify(lifecycleEditor.save());lifecycleEditor.on('error',error=>nativeReadErrors.push(error));});
  await page.locator('#lifecycle-card input[aria-label="Choose Etch drawing"]').setInputFiles({name:'drawing.etch.json',mimeType:'application/json',buffer:Buffer.from([123,34,110,111,116,101,34,58,34,0xff,34,125])});
  await page.waitForFunction(()=>nativeReadErrors.length===1);const result=await page.evaluate(()=>({code:nativeReadErrors[0].code,same:JSON.stringify(lifecycleEditor.save())===beforeNativeRead}));assert.deepEqual(result,{code:'INVALID_DOCUMENT',same:true});
});

test('ambiguous PNG headers reject before browser decoding for both image and native imports',async t=>{
  const page=await setup(t),small=Buffer.from(png(),'base64'),other=Buffer.from(png(32,32),'base64'),data=Buffer.concat([small.subarray(0,33),other.subarray(8,33),small.subarray(33)]).toString('base64');
  const result=await page.evaluate(async data=>{
    const e=lifecycleEditor,before=JSON.stringify(e.save());let decoders=0;window.createImageBitmap=async()=>{decoders++;throw new Error('Header rejection must precede decode');};
    const d=e.save();d.assets=[{id:'a',mime:'image/png',width:1,height:1,data}];let image,native;
    try{await e.importImage(new Blob([Uint8Array.from(atob(data),c=>c.charCodeAt(0))]),{format:'png'});}catch(error){image=error.code;}
    try{await e.load(d);}catch(error){native=error.code;}
    const same=JSON.stringify(e.save())===before;e.destroy();return {image,native,decoders,same};
  },data);assert.deepEqual(result,{image:'DECODE_FAILED',native:'INVALID_DOCUMENT',decoders:0,same:true});
});
