import {test} from 'node:test';
import assert from 'node:assert/strict';
import {useBrowser,collapseDemoSidebar} from './fixture.js';
import {fixture,png} from '../test/helpers.js';
import {documentBounds} from '../../../src/etch/geometry/paths.js';

const engine=process.env.ETCH_NATIVE_BROWSER ?? 'chromium',runtime=useBrowser(engine);
const rect=(id,x,y)=>({id,type:'rect',transform:[1,0,0,1,0,0],x,y,width:20,height:20,fill:'#FF0000',stroke:null,strokeWidth:0,lineJoin:'round',miterLimit:4});
function destination(){return {format:'lightmetal-etch',version:1,background:'#FFEEDD',assets:[],layers:[{id:'target',name:'Existing',visible:true,locked:false,offset:[10,20],elements:[rect('old',0,0)]},{id:'other',name:'Other',visible:true,locked:false,offset:[0,0],elements:[rect('other-rect',300,50)]}]};}
function source(){const d=fixture();d.background='#ABCDEF';d.layers[0].locked=true;d.layers[0].elements.push({id:'ink',type:'ink',transform:[1,0,0,1,65,0],color:'#008000',parts:[[['M',0,0],['L',15,0],['L',0,15],['Z']]]});d.layers.push({...structuredClone(d.layers[0]),id:'second',name:'Second',offset:[-40,60],elements:d.layers[0].elements.map(e=>({...structuredClone(e),id:`second-${e.id}`}))});d.layers.push({id:'hidden',name:'Hidden <img src=x>',visible:false,locked:false,offset:[0,0],elements:[rect('hidden-rect',0,0)]});return d;}
const root=page=>page.locator('#native-card'),dialog=page=>root(page).locator('.etch-native-dialog');
async function settle(page){await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));}
async function setup(t,{options={},mobile=false,data=destination()}={}){
  const {browser,server} = runtime;
  const context=await browser.newContext({viewport:mobile?{width:390,height:320}:{width:1280,height:900},hasTouch:mobile,deviceScaleFactor:2}),page=await context.newPage(),errors=[],external=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('request',r=>{if(!r.url().startsWith(server.origin+'/')&&!/^(blob:|data:)/.test(r.url()))external.push(r.url());});
  t.after(async()=>{await context.close();assert.deepEqual(errors,[]);assert.deepEqual(external,[]);});await page.goto(server.origin+'/demo/');await collapseDemoSidebar(page);
  await page.evaluate(async({data,options,mobile})=>{const {createEtch}=await import('/etch.js'),card=document.createElement('div');card.id='native-card';card.style=mobile?'width:320px;height:240px':'width:900px;height:460px';document.body.prepend(card);const e=window.nativeEditor=createEtch(card,{sidebarOpen:true,...options});await e.load(data);e.setActiveLayer('target');e.setViewState({zoom:1,pan:[15,25]});window.nativeChanges=[];window.nativeErrors=[];e.on('change',e=>window.nativeChanges.push(e));e.on('error',e=>window.nativeErrors.push(e));}, {data,options,mobile});await settle(page);return page;
}
const save=page=>page.evaluate(()=>window.nativeEditor.save());
async function snapshot(page){return page.evaluate(()=>{const e=window.nativeEditor;return {data:e.save(),revision:e.getRevision(),active:e.getActiveLayer(),selection:e.getSelection(),view:e.getViewState(),tool:e.getTool(),undo:e.canUndo(),redo:e.canRedo()};});}
async function upload(page,data=source(),name='example.etch.json'){await root(page).getByLabel('Choose Etch drawing',{exact:true}).setInputFiles({name,mimeType:'application/json',buffer:Buffer.from(typeof data==='string'?data:JSON.stringify(data))});}
async function ready(page){await page.waitForFunction(()=>{const button=document.querySelector('#native-card .etch-native-dialog button:last-child');return document.querySelector('#native-card .etch-native-dialog').open && !button.disabled;});}
async function exported(page){return page.evaluate(async()=>{const {blob}=await window.nativeEditor.exportPNG({bounds:{x:-100,y:-100,width:800,height:600},padding:0});return Array.from(new Uint8Array(await blob.arrayBuffer()));});}
function near(a,b){a.forEach((n,i)=>assert.ok(Math.abs(n-b[i])<1e-7,`${a} != ${b}`));}

test('public importDocument adds one native layer above the captured target, centers at scale one, warns and preserves exact bytes',async t=>{
  const page=await setup(t),before=await snapshot(page),input=source();
  const center=await page.evaluate(()=>{const e=window.nativeEditor,v=e.getViewState(),b=document.querySelector('#native-card .etch-viewport').getBoundingClientRect();return [b.width/2,b.height/2].map((n,i)=>(n-v.pan[i])/v.zoom);});
  const result=await page.evaluate(async input=>window.nativeEditor.importDocument(input),input);await settle(page);const after=await snapshot(page),l=after.data.layers[1];
  assert.deepEqual(after.data.layers.map(l=>l.id),['target',result.layerId,'other']);assert.equal(after.active,result.layerId);assert.equal(l.visible,true);assert.equal(l.locked,false);assert.equal(l.elements.length,14);assert.deepEqual(after.data.layers[0],before.data.layers[0]);assert.deepEqual(after.data.layers[2],before.data.layers[1]);assert.equal(after.data.background,before.data.background);assert.deepEqual(after.view,before.view);assert.equal(after.tool,before.tool);
  const b=documentBounds({...after.data,layers:[l]});near([b.x+b.width/2,b.y+b.height/2],center);assert.deepEqual(l.elements.map(e=>e.type),input.layers.filter(l=>l.visible).flatMap(l=>l.elements.map(e=>e.type)));assert.equal(after.data.assets[0].data,input.assets[0].data);assert.notEqual(after.data.assets[0].id,input.assets[0].id);
  assert.deepEqual(result.warnings.map(w=>w.code),['HIDDEN_LAYERS_OMITTED','BACKGROUND_OMITTED']);assert.equal(result.revision,after.revision);assert.deepEqual(await page.evaluate(()=>window.nativeChanges.map(e=>[e.label,e.source])),[['Import drawing','import']]);
  const pixels=await exported(page);await root(page).getByRole('button',{name:'Undo',exact:true}).click();assert.deepEqual(await save(page),before.data);assert.equal((await snapshot(page)).active,'target');await root(page).getByRole('button',{name:'Redo',exact:true}).click();assert.deepEqual(await exported(page),pixels);
  await page.evaluate(async()=>{const e=window.nativeEditor;await e.load(e.save());});assert.deepEqual(await exported(page),pixels);
});
test('consolidated import pixels equal independent original-layer painting, including pressure/ink/path/image alpha',async t=>{
  const page=await setup(t),src=source();await page.evaluate(async src=>{await window.nativeEditor.importDocument(JSON.stringify(src));},src);const imported=await save(page),pixels=await exported(page),placement=imported.layers[1].offset;
  const expected={...destination(),assets:src.assets,layers:[destination().layers[0],...src.layers.filter(l=>l.visible).map(l=>({...l,locked:false,offset:l.offset.map((n,i)=>n+placement[i])})),destination().layers[1]]};
  await page.evaluate(async expected=>window.nativeEditor.load(expected),expected);assert.deepEqual(await exported(page),pixels);
});
test('UI summary names omissions before confirmation, retains committed saves, and imports with one Undo step',async t=>{
  const page=await setup(t);await page.evaluate(()=>window.nativeEditor.setSelection(['old']));const before=await snapshot(page);await upload(page);await ready(page);
  assert.deepEqual(await snapshot(page),before);assert.match(await dialog(page).textContent(),/2 visible source layer\(s\), 14 editable mark\(s\)/);assert.match(await dialog(page).textContent(),/Hidden <img src=x>/);assert.match(await dialog(page).textContent(),/#ABCDEF.*omitted/);assert.equal(await dialog(page).locator('img').count(),0);
  await dialog(page).getByRole('button',{name:'Import as one layer',exact:true}).click();await settle(page);const after=await snapshot(page);assert.equal(after.data.layers[1].name,'example');assert.equal(after.data.layers.length,3);assert.deepEqual(after.selection,[]);assert.equal(after.data.background,before.data.background);assert.equal(await dialog(page).isVisible(),false);assert.equal(await page.evaluate(()=>document.activeElement.getAttribute('aria-label')),'Import drawing');await root(page).getByRole('button',{name:'Undo',exact:true}).click();assert.deepEqual(await save(page),before.data);
});
test('Escape/Cancel preserve native content, revision, selection and redo; file picker can import the same file again',async t=>{
  const page=await setup(t);await page.evaluate(()=>{const e=window.nativeEditor;e.setBackground(null);e.undo();e.setSelection(['old']);window.nativeChanges=[];});const before=await snapshot(page);
  await upload(page);await ready(page);await page.keyboard.press('Escape');assert.deepEqual(await snapshot(page),before);assert.equal(await root(page).getByRole('button',{name:'Toggle sidebar'}).getAttribute('aria-expanded'),'true');
  await upload(page);await ready(page);await dialog(page).getByRole('button',{name:'Cancel drawing import'}).click();assert.deepEqual(await snapshot(page),before);assert.equal(await root(page).getByRole('button',{name:'Import drawing',exact:true}).isEnabled(),true);assert.deepEqual(await page.evaluate(()=>window.nativeChanges),[]);
});
test('invalid/empty/unknown source imports reject atomically; UI errors retain the original content',async t=>{
  const page=await setup(t),before=await snapshot(page);
  const cases=[['{','INVALID_DOCUMENT'],[{...source(),version:99},'UNSUPPORTED_VERSION'],[{...source(),layers:source().layers.map(l=>({...l,visible:false}))},'EMPTY_IMPORT']];
  for(const [value,code] of cases){const count=await page.evaluate(()=>window.nativeErrors.length);await upload(page,value);await page.waitForFunction(n=>window.nativeErrors.length===n,count+1);assert.deepEqual(await snapshot(page),before);assert.equal(await page.evaluate(()=>window.nativeErrors.at(-1).code),code);assert.equal(await dialog(page).isVisible(),false);}
});
test('JSON file bytes are bounded before opening a stream and combined destination limits reject before decode',async t=>{
  const page=await setup(t,{options:{limits:{jsonBytes:1000}}}),before=await snapshot(page);
  await page.evaluate(()=>{window.nativeTextReads=0;const stream=Blob.prototype.stream;Blob.prototype.stream=function(){window.nativeTextReads++;return stream.call(this);};});await upload(page);await page.waitForFunction(()=>window.nativeErrors.length===1);assert.equal(await page.evaluate(()=>window.nativeTextReads),0);assert.equal(await page.evaluate(()=>window.nativeErrors[0].code),'LIMIT_EXCEEDED');assert.deepEqual(await snapshot(page),before);
  const limited=await setup(t,{options:{limits:{elements:15}}});const result=await limited.evaluate(async src=>{try{await window.nativeEditor.importDocument(src);}catch(e){return e.code;}},source());assert.equal(result,'LIMIT_EXCEEDED');assert.equal((await save(limited)).layers.length,2);
});
test('API import captures invocation view/target while pending; content mutations and concurrent imports reject BUSY',async t=>{
  const page=await setup(t),before=await snapshot(page);await page.evaluate(src=>{const original=createImageBitmap;let release;const gate=new Promise(r=>release=r);window.releaseNativeDecode=()=>{window.createImageBitmap=original;release();};window.createImageBitmap=async(...args)=>{await gate;return original(...args);};const e=window.nativeEditor,v=e.getViewState(),b=document.querySelector('#native-card .etch-viewport').getBoundingClientRect();window.nativeCenter=[b.width/2,b.height/2].map((n,i)=>(n-v.pan[i])/v.zoom);window.pendingNativeImport=e.importDocument(src);},source());
  assert.deepEqual(await save(page),before.data);const codes=await page.evaluate(async src=>{const e=window.nativeEditor,codes=[];try{e.setBackground(null);}catch(e){codes.push(e.code);}try{await e.importDocument(src);}catch(e){codes.push(e.code);}try{await e.importImage(new Blob());}catch(e){codes.push(e.code);}e.setActiveLayer('other');e.setViewState({zoom:2,pan:[100,100]});return codes;},source());assert.deepEqual(codes,['BUSY','BUSY','BUSY']);
  await page.evaluate(async()=>{window.releaseNativeDecode();await window.pendingNativeImport;});const after=await save(page),b=documentBounds({...after,layers:[after.layers[1]]});near([b.x+b.width/2,b.y+b.height/2],await page.evaluate(()=>window.nativeCenter));assert.equal(after.layers[2].id,'other');
});
test('cancel/load/destroy racing late browser decode cannot install source assets or content',async t=>{
  for(const action of ['cancel','load','destroy']){
    const page=await setup(t),before=await save(page);await page.evaluate(src=>{let release;const gate=new Promise(r=>release=r),original=createImageBitmap;window.nativeClosed=0;window.releaseNativeDecode=()=>{window.createImageBitmap=original;release();};window.createImageBitmap=async(...args)=>{await gate;const image=await original(...args),close=image.close.bind(image);image.close=()=>{window.nativeClosed++;close();};return image;};window.pendingNativeImport=window.nativeEditor.importDocument(src).then(()=> 'success',e=>e.code);},source());
    await page.evaluate(async({action,data})=>{const e=window.nativeEditor;if(action==='cancel')e.cancel();if(action==='load')await e.load(data);if(action==='destroy')e.destroy();},{action,data:destination()});
    const result=await page.evaluate(async()=>{window.releaseNativeDecode();return await window.pendingNativeImport;});assert.equal(result,'CANCELLED');assert.ok(await page.evaluate(()=>window.nativeClosed>=1));if(action!=='destroy')assert.deepEqual(await save(page),before);
  }
});
test('cancelled native decode keeps its shared raster lease until the underlying bitmap settles',async t=>{
  const page=await setup(t,{options:{limits:{totalPixels:3}}}),src=source();src.assets[0].width=2;src.assets[0].data=png(2,1);
  await page.evaluate(src=>{let release;const gate=new Promise(r=>release=r),original=createImageBitmap;window.releaseNativeDecode=()=>{window.createImageBitmap=original;release();};window.createImageBitmap=async(...args)=>{await gate;return original(...args);};window.pendingNativeImport=window.nativeEditor.importDocument(src).then(()=> 'success',e=>e.code);},src);
  await page.evaluate(()=>window.nativeEditor.cancel());
  const options={bounds:{x:0,y:0,width:1,height:1},padding:0};assert.equal(await page.evaluate(async options=>{try{await window.nativeEditor.exportPNG(options);}catch(e){return e.code;}},options),'EXPORT_TOO_LARGE');
  assert.equal(await page.evaluate(async()=>{window.releaseNativeDecode();return await window.pendingNativeImport;}),'CANCELLED');
  assert.ok(await page.evaluate(async options=>(await window.nativeEditor.exportPNG(options)).blob.size,options)>0);
});
test('browser decoder rejection after valid headers closes partial assets and leaves destination/history untouched',async t=>{
  const page=await setup(t),before=await snapshot(page),src=source();src.assets.push({...src.assets[0],id:'asset-second'});src.layers[0].elements.push({...src.layers[0].elements.find(e=>e.type==='image'),id:'image-second',assetId:'asset-second'});
  const result=await page.evaluate(async src=>{
    const original=createImageBitmap;let calls=0,closed=0;
    window.createImageBitmap=async(...args)=>{if(++calls===2)throw new DOMException('Codec rejected the image','InvalidStateError');const image=await original(...args),close=image.close.bind(image);image.close=()=>{closed++;close();};return image;};
    try{await window.nativeEditor.importDocument(src);}catch(e){return {code:e.code,calls,closed};}finally{window.createImageBitmap=original;}
  },src);assert.deepEqual(result,{code:'DECODE_FAILED',calls:2,closed:1});assert.deepEqual(await snapshot(page),before);
});
test('readonly disables native imports, but hidden/locked insertion layers can receive a new independent layer',async t=>{
  const ro=await setup(t,{options:{readOnly:true}});assert.equal(await root(ro).getByRole('button',{name:'Import drawing',exact:true}).isDisabled(),true);assert.equal(await ro.evaluate(async src=>{try{await window.nativeEditor.importDocument(src);}catch(e){return e.code;}},source()),'READ_ONLY');
  const data=destination();data.layers[0].locked=true;data.layers[0].visible=false;const page=await setup(t,{data});await upload(page);await ready(page);await dialog(page).getByRole('button',{name:'Import as one layer'}).click();const after=await save(page);assert.equal(after.layers[0].locked,true);assert.equal(after.layers[1].locked,false);assert.equal(after.layers[1].visible,true);
});
test('actual desktop/mobile demo imports native JSON alongside its image, saves exact assets, undoes/reopens and downloads PNG',async t=>{
  for(const [name,size] of [['desktop',{width:1440,height:1000}],['mobile',{width:390,height:844}]]){
    const {browser,server} = runtime;
    const context=await browser.newContext({viewport:size}),page=await context.newPage();t.after(()=>context.close());await page.goto(server.origin+'/demo/');await page.locator('#sample-coloring').click();await page.waitForFunction(()=>JSON.parse(document.querySelector('#native').value).assets.length===1);await page.locator('#save').click();const before=JSON.parse(await page.locator('#native').inputValue());
    const editor=page.locator('#editor'),input=source(),chooser=page.waitForEvent('filechooser');await editor.getByRole('button',{name:'Import drawing',exact:true}).click();await (await chooser).setFiles({name:'lesson.etch.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(input))});
    const modal=editor.locator('.etch-native-dialog');await page.waitForFunction(()=>{const d=document.querySelector('#editor .etch-native-dialog');return d.open && !d.querySelector('button:last-child').disabled;});assert.match(await modal.textContent(),/Source background #ABCDEF is omitted/);await page.screenshot({path:`/tmp/etch-native-demo-${engine}-${name}.png`});await modal.getByRole('button',{name:'Import as one layer',exact:true}).click();
    await page.locator('#save').click();const after=JSON.parse(await page.locator('#native').inputValue());assert.equal(after.layers.length,before.layers.length+1);assert.equal(after.layers.at(-1).name,'lesson');assert.equal(after.layers.at(-1).elements.length,14);assert.equal(after.background,before.background);assert.deepEqual(after.assets[0],before.assets[0]);assert.equal(after.assets[1].data,input.assets[0].data);
    await editor.getByRole('button',{name:'Undo',exact:true}).click();await page.locator('#save').click();assert.deepEqual(JSON.parse(await page.locator('#native').inputValue()),before);await editor.getByRole('button',{name:'Redo',exact:true}).click();await page.locator('#save').click();assert.deepEqual(JSON.parse(await page.locator('#native').inputValue()),after);
    await page.locator('#reopen').click();await page.waitForFunction(()=>document.querySelector('#save-status').textContent.includes('Loaded baseline'));const download=page.waitForEvent('download');await page.locator('#export-png').click();assert.equal((await download).suggestedFilename(),'drawing.png');assert.equal(await page.locator('#error').textContent(),'');
  }
});
test('320×240 native summary scrolls, shortcuts stay modal, load closes it, toolbar and viewport stay mounted',async t=>{
  const page=await setup(t,{mobile:true}),before=await snapshot(page);await root(page).locator('.etch-viewport').evaluate(el=>el.dataset.identity='native');await upload(page);await ready(page);const b=await dialog(page).boundingBox();assert.ok(b.width<=366 && b.height<=296);await dialog(page).getByRole('button',{name:'Cancel drawing import'}).focus();await page.keyboard.press('h');await page.keyboard.press('0');await page.keyboard.press('ControlOrMeta+z');assert.deepEqual(await snapshot(page),before);
  await page.evaluate(async data=>window.nativeEditor.load(data),destination());assert.equal(await dialog(page).isVisible(),false);assert.equal(await root(page).locator('.etch-toolbar button').count(),17);assert.equal(await root(page).locator('.etch-viewport').getAttribute('data-identity'),'native');
});
