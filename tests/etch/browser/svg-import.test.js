import {test} from 'node:test';
import assert from 'node:assert/strict';
import {useBrowser,collapseDemoSidebar} from './fixture.js';
import {documentBounds} from '../../../src/etch/geometry/paths.js';
import {fixture} from '../test/helpers.js';
const engine = process.env.ETCH_SVG_BROWSER ?? 'chromium',runtime = useBrowser(engine);
const rect = id => ({id,type:'rect',x:0,y:0,width:20,height:20,fill:'#123456',stroke:null,strokeWidth:0,lineJoin:'miter',miterLimit:4,transform:[1,0,0,1,0,0]});
const baseline = () => ({format:'lightmetal-etch',version:1,background:'#FFEEDD',assets:[],layers:[{id:'target',name:'Existing',offset:[10,20],visible:true,locked:false,elements:[rect('old')]},{id:'other',name:'Other',offset:[200,30],visible:true,locked:false,elements:[rect('other-mark')]}]});
const wrap = body => `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100">${body}</svg>`;
const source = wrap('<style>.a{fill:royalblue}</style><rect class="a" x="10" y="10" width="40" height="30"/><circle cx="90" cy="40" r="10" fill="orange"/>');
const root = page => page.locator('#svg-card'),dialog = page => root(page).locator('.etch-native-dialog');
async function setup(t,options={},mobile=false,data=baseline()) {
  const {browser,server} = runtime;
  const page = await browser.newPage({viewport:mobile ? {width:390,height:844} : {width:1280,height:900}}),errors = [],external = [];
  page.on('pageerror',e => errors.push(e.message));page.on('request',r => {if (!r.url().startsWith(server.origin+'/') && !r.url().startsWith('blob:'+server.origin+'/')) external.push(r.url());});
  t.after(async () => {await page.close();assert.deepEqual(errors,[]);assert.deepEqual(external,[]);});await page.goto(server.origin+'/demo/');await collapseDemoSidebar(page);
  await page.evaluate(async ({options,mobile,data}) => {const {createEtch} = await import('/etch.js');const card = document.createElement('div');card.id = 'svg-card';card.style.cssText = mobile ? 'width:340px;height:480px' : 'width:900px;height:460px';document.body.prepend(card);const e = window.svgEditor = createEtch(card,{sidebarOpen:true,...options});await e.load(data);e.setActiveLayer('target');e.setViewState({zoom:1,pan:[15,25]});window.svgChanges = [];window.svgErrors = [];e.on('change',e => window.svgChanges.push(e));e.on('error',e => window.svgErrors.push(e));
    window.parseSVG = (await import('/etch/svg-import.js')).parseSVGForImport;
  },{options,mobile,data});await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));return page;
}
const snapshot = page => page.evaluate(() => {const e = window.svgEditor;return {data:e.save(),revision:e.getRevision(),active:e.getActiveLayer(),selection:e.getSelection(),view:e.getViewState(),undo:e.canUndo(),redo:e.canRedo()};});
async function upload(page,text=source,name='lesson.svg') {await root(page).getByLabel('Choose SVG drawing',{exact:true}).setInputFiles({name,mimeType:'image/svg+xml',buffer:Buffer.from(text)});}
async function ready(page) {await page.waitForFunction(() => {const d = document.querySelector('#svg-card .etch-native-dialog');return d.open && !d.querySelector('button:last-child').disabled;});}
async function gateRead(page) {await page.evaluate(() => {
  const original = Blob.prototype.stream;let release;const gate = new Promise(r => release = r);window.releaseSVGRead = () => {Blob.prototype.stream = original;release();};
  Blob.prototype.stream = function() {const reader = original.call(this).getReader();let cancelled = false;return new ReadableStream({async pull(controller) {await gate;if (cancelled) return;const {done,value} = await reader.read();if (cancelled) return;if (done) controller.close();else controller.enqueue(value);},cancel() {cancelled = true;return reader.cancel();}});};
});}

test('public importSVG adds one centered editable layer, retains scale/background/content and supports one-step Undo/Redo/reopen',async t => {
  const data = baseline(),images = fixture();data.assets = images.assets;data.layers[0].elements.push(...images.layers[0].elements.filter(e => e.type === 'image'));
  const page = await setup(t,{},false,data),before = await snapshot(page),center = await page.evaluate(() => {const v = svgEditor.getViewState(),b = document.querySelector('#svg-card .etch-viewport').getBoundingClientRect();return [b.width/2-v.pan[0],b.height/2-v.pan[1]];});
  const result = await page.evaluate(source => svgEditor.importSVG(source),source),after = await snapshot(page),layer = after.data.layers[1];assert.deepEqual(after.data.layers.map(l => l.id),['target',result.layerId,'other']);assert.equal(after.active,result.layerId);assert.equal(layer.visible,true);assert.equal(layer.locked,false);assert.deepEqual(layer.elements.map(e => e.type),['rect','ellipse']);assert.equal(layer.elements[0].width,40);assert.deepEqual(after.data.assets,before.data.assets);assert.equal(after.data.background,before.data.background);assert.deepEqual(after.data.layers[0],before.data.layers[0]);assert.deepEqual(after.data.layers[2],before.data.layers[1]);assert.deepEqual(after.view,before.view);assert.equal(after.revision,result.revision);assert.deepEqual(result.warnings,[]);
  const bounds = documentBounds({...after.data,layers:[layer]});assert.ok(Math.abs(bounds.x+bounds.width/2-center[0]) < 1e-8);assert.ok(Math.abs(bounds.y+bounds.height/2-center[1]) < 1e-8);assert.equal(await page.evaluate(() => svgChanges.length),1);
  await page.evaluate(() => svgEditor.undo());assert.deepEqual((await snapshot(page)).data,before.data);await page.evaluate(() => svgEditor.redo());assert.deepEqual((await snapshot(page)).data,after.data);await page.evaluate(async () => svgEditor.load(svgEditor.save()));assert.deepEqual((await snapshot(page)).data,after.data);
});
test('root transforms, tiny primitives and zero-length caps match original SVG pixels in actual native Canvas rendering',async t => {
  const page = await setup(t),rows = await page.evaluate(async () => {
    const {traceElementPath} = await import('/etch/geometry/paths.js');const cases = [
      '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 100 50" transform="rotate(30 10 20)"><rect x="40" y="20" width="10" height="10" fill="red"/></svg>',
      '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 .2 .1"><circle cx=".05" cy=".05" r=".001" fill="red"/><rect x=".1" y=".04" width=".001" height=".02" fill="blue"/><line x1=".15" y1=".05" x2=".15" y2=".05" stroke="green" stroke-width=".01" stroke-linecap="square"/></svg>',
      '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><line x1="40" y1="40" x2="40" y2="40" stroke="red" stroke-width="10" stroke-linecap="round"/><line x1="90" y1="40" x2="90" y2="40" stroke="blue" stroke-width="10" stroke-linecap="square"/></svg>',
      '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><path d="M1 1H199V99H1Z" fill="none" stroke="red" stroke-width="2" stroke-linejoin="miter"/></svg>'
    ],rows = [];
    for (const source of cases) {const result = window.parseSVG(source),make = () => {const c = document.createElement('canvas');c.width = 200;c.height = 100;return c;},a = make(),b = make(),ctx = a.getContext('2d'),url = URL.createObjectURL(new Blob([source],{type:'image/svg+xml'}));
      try {const image = new Image();image.src = url;await image.decode();b.getContext('2d').drawImage(image,0,0);
        for (const e of result.document.layers[0].elements) {ctx.setTransform(...e.transform);ctx.beginPath();traceElementPath(ctx,e);if (e.fill) {ctx.fillStyle = e.fill;ctx.fill(e.fillRule ?? 'nonzero');}if (e.stroke) {ctx.strokeStyle = e.stroke;ctx.lineWidth = e.strokeWidth;ctx.lineCap = e.lineCap ?? 'butt';ctx.lineJoin = e.lineJoin ?? 'miter';ctx.miterLimit = e.miterLimit ?? 4;ctx.stroke();}}
        const p = ctx.getImageData(0,0,200,100).data,q = b.getContext('2d').getImageData(0,0,200,100).data;let total = 0,strong = 0;for (let i = 0;i < p.length;i += 4) {let worst = Math.abs(p[i+3]-q[i+3]);total += worst;for (let j = 0;j < 3;j++) {const d = Math.abs(p[i+j]*p[i+3]/255-q[i+j]*q[i+3]/255);total += d;worst = Math.max(worst,d);}if (worst > 32) strong++;}const probes = [[[103,43]],[[50,50],[150,50]],[[40,40],[90,40]],[[0,50]]][cases.indexOf(source)];rows.push({mean:total/p.length,strong,samples:probes.map(([x,y]) => [p[(y*200+x)*4+3],q[(y*200+x)*4+3]])});
      }finally {URL.revokeObjectURL(url);}}
    return rows;
  });for (const row of rows) {assert.ok(row.mean < .25,JSON.stringify(row));assert.ok(row.strong < 20,JSON.stringify(row));for (const [native,original] of row.samples) {assert.ok(native > 100 && original > 100,JSON.stringify(row));assert.ok(Math.abs(native-original) < 32,JSON.stringify(row));}}
});
test('computed hidden unsupported content and degenerate no-op styles are ignored only after full security inspection',async t => {
  const page = await setup(t),result = await page.evaluate(async () => {
    const s = '<svg width="200" height="100"><style>.hidden{display:none}</style><g class="hidden"><text x="10" y="10">not imported</text><use href="#unused"/></g><text visibility="hidden">also hidden</text><g opacity=".5"><rect width="0" height="20" fill="rgba(1,2,3,.5)"/></g><g transform="scale(0)"><rect width="20" height="20" fill="rgba(1,2,3,.5)"/></g><path d="M10 10L20 20"/><rect x="30" y="30" width="20" height="20"/></svg>';
    const r = await svgEditor.importSVG(s);return {r,layer:svgEditor.save().layers.find(l => l.id === r.layerId)};
  });assert.equal(result.layer.elements.length,1);assert.equal(result.layer.elements[0].type,'rect');
  for (const payload of ['<g display="none"><script>window.svgExecuted=1</script></g>','<defs><image href="https://evil.invalid/a.png"/></defs>']) {
    assert.equal(await page.evaluate(async source => {try {await svgEditor.importSVG(source);}catch(e) {return e.code;}},wrap(payload)),'UNSAFE_SVG');
  }
});
test('invalid/unsafe/unsupported/empty sources, generating filters and markers reject atomically without fallback decoding',async t => {
  const page = await setup(t),before = await snapshot(page);
  const cases = [['<svg>','INVALID_SVG'],['<!DOCTYPE svg>'+source,'UNSAFE_SVG'],['<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" transform="translate(50)"><rect x="-25" y="20" width="10" height="10"/></svg>','UNSUPPORTED_SVG_FEATURE'],[wrap('<text>secret attachment text</text>'),'UNSUPPORTED_SVG_FEATURE'],[wrap('<defs><rect id="a" x="10" y="10" width="10" height="10" visibility="visible"/></defs><use href="#a" visibility="hidden"/><rect x="50" y="50" width="10" height="10"/>'),'UNSUPPORTED_SVG_FEATURE'],[wrap('<path d="M40 40L40 40" stroke="red" stroke-width="10" stroke-linecap="square"/>'),'UNSUPPORTED_SVG_FEATURE'],[wrap('<rect x="-1" width="20" height="20"/>'),'UNSUPPORTED_SVG_FEATURE'],[wrap('<g opacity=".5"><rect width="0" height="20"/></g>'),'EMPTY_IMPORT'],[wrap('<defs><filter id="f"><feFlood flood-color="red"/></filter></defs><g filter="url(#f)"/>'),'UNSUPPORTED_SVG_FEATURE'],[wrap('<defs><marker id="m"><rect width="10" height="10"/></marker></defs><path d="M10 10L20 20" fill="none" stroke="none" marker-start="url(#m)"/>'),'UNSUPPORTED_SVG_FEATURE']];
  for (const cap of ['round','square']) for (const d of ['M40 40L40 40','M40 40Z','M40 40A10 10 0 0 1 40 40']) cases.push([wrap(`<path d="${d}" stroke="red" stroke-width="10" stroke-linecap="${cap}"/>`),'UNSUPPORTED_SVG_FEATURE']);
  for (const [text,code] of cases) {const result = await page.evaluate(async text => {try {await svgEditor.importSVG(text);return {code:'accepted'};}catch(e) {return {code:e.code,message:e.message,details:e.details};}},text);assert.equal(result.code,code,text);assert.ok(!JSON.stringify(result).includes('secret attachment text'));assert.deepEqual(await snapshot(page),before);}
  assert.equal(await page.evaluate(async source => {try {await svgEditor.importSVG(source,{mode:'image'});}catch(e) {return e.code;}},source),'INVALID_ARGUMENT');
});
test('SVG import captures target/view immediately, is single-flight and keeps saves committed while reading',async t => {
  const page = await setup(t),before = await snapshot(page);const exported = await page.evaluate(() => svgEditor.exportSVG());await gateRead(page);
  await page.evaluate(source => {window.pendingSVG = svgEditor.importSVG(new Blob([source],{type:'image/svg+xml'}));},source);
  assert.deepEqual(await snapshot(page),before);assert.deepEqual(await page.evaluate(() => svgEditor.exportSVG()),exported);
  const codes = await page.evaluate(async source => {const codes = [];try {svgEditor.setBackground(null);}catch(e) {codes.push(e.code);}try {await svgEditor.importSVG(source);}catch(e) {codes.push(e.code);}svgEditor.setActiveLayer('other');svgEditor.setViewState({zoom:2,pan:[100,100]});return codes;},source);assert.deepEqual(codes,['BUSY','BUSY']);
  const imported = await page.evaluate(async () => {releaseSVGRead();return await pendingSVG;});const after = await snapshot(page);assert.deepEqual(after.data.layers.map(l => l.id),['target',imported.layerId,'other']);assert.equal(after.view.zoom,2);
});
test('cancel/load/destroy racing a Blob read cannot install stale content',async t => {
  for (const action of ['cancel','load','destroy']) {const page = await setup(t),before = (await snapshot(page)).data;await gateRead(page);await page.evaluate(source => {window.pendingSVG = svgEditor.importSVG(new Blob([source])).then(() => 'accepted',e => e.code);},source);
    await page.evaluate(async ({action,data}) => {if (action === 'load') await svgEditor.load(data);else svgEditor[action]();},{action,data:baseline()});
    const outcome = await page.evaluate(async () => {releaseSVGRead();return pendingSVG;});assert.equal(outcome,'CANCELLED');
    if (action !== 'destroy') assert.deepEqual((await snapshot(page)).data,before);
    else assert.equal(await page.evaluate(async () => {try {await svgEditor.importSVG('<svg/>');}catch(e) {return e.code;}}),'DESTROYED');
  }
});
test('cancelled read cleanup cannot cancel a fresh SVG job, and change listeners may start the next import',async t => {
  const page = await setup(t);await gateRead(page);
  await page.evaluate(source => {window.oldSVG = svgEditor.importSVG(new Blob([source])).then(() => 'accepted',e => e.code);},source);
  const result = await page.evaluate(async source => {svgEditor.cancel();const fresh = svgEditor.importSVG(source);releaseSVGRead();return {old:await oldSVG,fresh:await fresh};},source);
  assert.equal(result.old,'CANCELLED');assert.equal((await snapshot(page)).data.layers.length,3);
  const revisions = await page.evaluate(async source => {let once = true;const off = svgEditor.on('change',() => {if (once) {once = false;window.followingSVG = svgEditor.importSVG(source);}});try {const first = await svgEditor.importSVG(source),second = await followingSVG;return [first.revision,second.revision,svgEditor.getRevision()];}finally {off();}},source);
  assert.notEqual(revisions[0],revisions[1]);assert.equal(revisions[1],revisions[2]);assert.equal((await snapshot(page)).data.layers.length,5);
});
test('UI confirms before mutation, restores SVG focus, supports Cancel/retry and one Undo on desktop/mobile',async t => {
  for (const mobile of [false,true]) {const page = await setup(t,{},mobile),before = await snapshot(page);await upload(page);await ready(page);assert.deepEqual(await snapshot(page),before);assert.match(await dialog(page).textContent(),/SVG viewport 200.00 × 100.00/);assert.match(await dialog(page).textContent(),/no automatic image fallback/i);
    await page.screenshot({path:`/tmp/etch-svg-import-${engine}-${mobile ? 'mobile' : 'desktop'}.png`});await page.keyboard.press('Escape');assert.deepEqual(await snapshot(page),before);assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-label')),'Import SVG');
    await upload(page,source,'lesson.svg');await ready(page);await dialog(page).getByRole('button',{name:'Import as one layer',exact:true}).click();const after = await snapshot(page);assert.equal(after.data.layers[1].name,'lesson');assert.equal(await dialog(page).isVisible(),false);assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-label')),'Import SVG');await page.evaluate(() => svgEditor.undo());assert.deepEqual((await snapshot(page)).data,before.data);
  }
});
test('SVG UTF-8 file cap, destination limits and readonly fail without reads/commits; hidden locked target remains valid',async t => {
  const page = await setup(t,{limits:{jsonBytes:1000}}),before = await snapshot(page);await page.evaluate(() => {window.svgStreams = 0;const original = Blob.prototype.stream;Blob.prototype.stream = function() {window.svgStreams++;return original.call(this);};});await upload(page,wrap(' '.repeat(1100)));await page.waitForFunction(() => svgErrors.length === 1);assert.equal(await page.evaluate(() => svgStreams),0);assert.equal(await page.evaluate(() => svgErrors[0].code),'LIMIT_EXCEEDED');assert.deepEqual(await snapshot(page),before);
  const limited = await setup(t,{limits:{elements:2}}),limitedBefore = await snapshot(limited);assert.equal(await limited.evaluate(async source => {try {await svgEditor.importSVG(source);}catch(e) {return e.code;}},wrap('<rect width="20" height="20"/>')),'LIMIT_EXCEEDED');assert.deepEqual(await snapshot(limited),limitedBefore);
  const ro = await setup(t,{readOnly:true});assert.equal(await root(ro).getByRole('button',{name:'Import SVG',exact:true}).isDisabled(),true);assert.equal(await ro.evaluate(async source => {try {await svgEditor.importSVG(source);}catch(e) {return e.code;}},source),'READ_ONLY');
  const data = baseline();data.layers[0].visible = false;data.layers[0].locked = true;const hidden = await setup(t,{},false,data);await hidden.evaluate(source => svgEditor.importSVG(source),source);const layers = (await snapshot(hidden)).data.layers;assert.equal(layers[0].locked,true);assert.equal(layers[1].locked,false);assert.equal(layers[1].visible,true);
});
