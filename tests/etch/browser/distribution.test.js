import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
const {chromium,firefox} = createRequire(import.meta.url)('playwright');
import {buildDistribution} from '../support/build.js';

let dir,server,browser,origin;const requests=[];
const engine=process.env.ETCH_DIST_BROWSER ?? 'chromium';
before(async()=>{
  dir=await mkdtemp(join(tmpdir(),'etch-dist-'));
  try {
    await buildDistribution(dir);
    const js=await readFile(join(dir,'etch.js')),css=await readFile(join(dir,'etch.css'));
    server=createServer((req,res)=>{
      requests.push(req.url);
      if(req.url==='/etch.js') {res.writeHead(200,{'Content-Type':'text/javascript'});res.end(js);}
      else if(req.url==='/etch.css') {res.writeHead(200,{'Content-Type':'text/css'});res.end(css);}
      else if(req.url==='/') {res.writeHead(200,{'Content-Type':'text/html'});res.end(`<!doctype html><html><head><link rel="icon" href="data:,"><link rel="stylesheet" href="/etch.css"></head><body><div id="editor" style="width:800px;height:500px"></div><script type="module">import {createEtch,EtchError} from '/etch.js';window.editor=createEtch(document.querySelector('#editor'));window.EtchError=EtchError;window.ready=true;</script></body></html>`);}
      else {res.writeHead(404);res.end('No source tree is available.');}
    });
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
    origin=`http://127.0.0.1:${server.address().port}`;browser=await ({chromium,firefox})[engine].launch();
  } catch(error) {await browser?.close();await new Promise(resolve=>server?.listening?server.close(resolve):resolve());await rm(dir,{recursive:true,force:true});throw error;}
});
after(async()=>{await browser?.close();await new Promise(resolve=>server?.listening?server.close(resolve):resolve());if(dir)await rm(dir,{recursive:true,force:true});});

test('distribution is exactly one JS plus one CSS, exports the facade and imports safely without DOM',async()=>{
  assert.deepEqual((await readdir(dir)).sort(),['etch.css','etch.js']);
  assert.equal(await readFile(join(dir,'etch.css'),'utf8'),await readFile(new URL('../../../src/etch.css',import.meta.url),'utf8'));
  const entry=await import(pathToFileURL(join(dir,'etch.js')).href);
  assert.deepEqual(Object.keys(entry).sort(),['EtchError','createEtch']);assert.throws(()=>entry.createEtch(null),e=>e instanceof entry.EtchError && e.code==='INVALID_ARGUMENT');
});

test('isolated built editor mounts/draws/imports/exports and uses no source files or runtime dependencies',async t=>{
  const context=await browser.newContext(),page=await context.newPage(),errors=[],external=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(!r.url().startsWith(origin+'/') && !r.url().startsWith('data:') && !r.url().startsWith('blob:'))external.push(r.url());});
  t.after(async()=>{await context.close();assert.deepEqual(errors,[]);assert.deepEqual(external,[]);});
  await page.goto(origin+'/');await page.waitForFunction(()=>window.ready);
  assert.equal(await page.locator('.etch').evaluate(el=>getComputedStyle(el).display),'flex');
  await page.locator('.etch-viewport').focus();await page.keyboard.press('k');
  const b=await page.locator('.etch-viewport').boundingBox();await page.mouse.move(b.x+30,b.y+60);await page.mouse.down();await page.mouse.move(b.x+200,b.y+60);await page.mouse.up();
  assert.equal(await page.evaluate(()=>editor.save().layers[0].elements[0].type),'highlight');
  await page.locator('.etch-viewport').focus();await page.keyboard.press('p');await page.getByRole('checkbox',{name:'Quick pressure width',exact:true}).uncheck();assert.equal(await page.evaluate(()=>editor.getToolSettings('pen').pressure),false);
  for(const format of ['PNG','SVG']) {
    await page.getByRole('button',{name:'Export',exact:true}).click();const pending=page.waitForEvent('download');
    await page.getByRole('button',{name:`Export ${format}`,exact:true}).click();assert.equal((await pending).suggestedFilename(),`drawing.${format.toLowerCase()}`);
  }
  const result=await page.evaluate(async()=>{
    const saved=editor.save();await editor.load(saved);const {layerId}=await editor.importSVG('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect x="5" y="5" width="30" height="30" fill="red"/></svg>');
    const {blob}=await editor.exportPNG(),{svg}=editor.exportSVG();const layers=editor.save().layers.length;
    editor.undo();const undo=editor.save().layers.length;editor.redo();const redo=editor.save().layers.length;editor.destroy();
    return {layerId,layers,undo,redo,mime:blob.type,bytes:blob.size,svg:svg.includes('opacity="0.35"'),removed:!document.querySelector('.etch')};
  });
  assert.ok(result.layerId);assert.equal(result.layers,2);assert.equal(result.undo,1);assert.equal(result.redo,2);assert.equal(result.mime,'image/png');assert.ok(result.bytes>0);assert.equal(result.svg,true);assert.equal(result.removed,true);
  assert.deepEqual([...new Set(requests)].sort(),['/','/etch.css','/etch.js']);
});
