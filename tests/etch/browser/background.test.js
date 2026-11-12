import {test} from 'node:test';
import assert from 'node:assert/strict';
import {useBrowser,collapseDemoSidebar} from './fixture.js';
import {fixture as nativeFixture} from '../test/helpers.js';

const fixture = useBrowser(process.env.ETCH_BACKGROUND_BROWSER ?? 'chromium');
const root = page => page.locator('#paper-card .etch');
const dialog = page => root(page).locator('.etch-background-dialog');
const settle = page => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
const save = page => page.evaluate(() => paperEditor.save());
async function setup(t,{mobile=false,data,options={}}={}) {
  const {browser,server} = fixture,context = await browser.newContext({viewport:mobile ? {width:390,height:320} : {width:1200,height:850},hasTouch:mobile,deviceScaleFactor:2}),page = await context.newPage(),errors = [];
  page.on('pageerror',e => errors.push(e.message));t.after(async () => {await context.close();assert.deepEqual(errors,[]);});
  await page.goto(server.origin+'/demo/');await collapseDemoSidebar(page);
  await page.evaluate(async ({mobile,data,options}) => {
    const {createEtch} = await import('/etch.js'),host = document.createElement('div');host.id = 'paper-card';host.style = mobile ? 'width:320px;height:240px' : 'width:900px;height:480px';document.body.prepend(host);
    window.paperEditor = createEtch(host,{sidebarOpen:false,...options});if (data) await paperEditor.load(data);
    paperEditor.setViewState({zoom:1,pan:[0,0]});window.paperChanges = [];paperEditor.on('change',e => paperChanges.push(e));
  },{mobile,data,options});await settle(page);return page;
}
async function pixels(page,zoom=1,pan=[0,0]) {
  return page.evaluate(async ({zoom,pan}) => {
    paperEditor.setViewState({zoom,pan});await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const width = 240,height = 160,canvas = document.querySelector('#paper-card .etch-committed');
    const c = document.createElement('canvas');c.width = width;c.height = height;
    c.getContext('2d').drawImage(canvas,0,0,canvas.width/devicePixelRatio,canvas.height/devicePixelRatio);
    const viewport = c.getContext('2d').getImageData(0,0,width,height).data;
    const bounds = {x:-pan[0]/zoom,y:-pan[1]/zoom,width:width/zoom,height:height/zoom};
    const {blob} = await paperEditor.exportPNG({bounds,padding:0,scale:zoom}),{svg} = paperEditor.exportSVG({bounds,padding:0});
    const read = async blob => {
      const url = URL.createObjectURL(blob),image = new Image();
      try {image.src = url;await image.decode();c.getContext('2d').clearRect(0,0,width,height);c.getContext('2d').drawImage(image,0,0,width,height);return c.getContext('2d').getImageData(0,0,width,height).data;}
      finally {URL.revokeObjectURL(url);image.src = '';}
    };
    const png = await read(blob),vector = await read(new Blob([svg],{type:'image/svg+xml'}));
    const compare = (a,b) => {let total = 0,bad = 0,max = 0;for (let i=0;i<a.length;i++) {const d = Math.abs(a[i]-b[i]);total += d;max = Math.max(max,d);if (d > 8) bad++;}return {mean:total/a.length,bad,max};};
    const at = (a,x,y) => Array.from(a.slice((y*width+x)*4,(y*width+x)*4+4));
    c.width = c.height = 0;
    return {zoom,pan,png:compare(viewport,png),svg:compare(png,vector),samples:{base:at(png,10,10),vertical:at(png,20,10),horizontal:at(png,10,20),major:at(png,100,10),dot:at(png,20,20)},svgLength:svg.length};
  },{zoom,pan});
}

for (const type of ['dots','graph','ruled','engineering']) test(`${type} paper matches viewport/PNG/SVG at world-origin, negative and zoomed fractional crops`,async t => {
  const page = await setup(t);await page.evaluate(type => paperEditor.setBackground({type,spacing:20}),type);
  const result = await pixels(page);
  const expected = type === 'engineering' ? [241,247,233,255] : [255,255,255,255];
  assert.deepEqual(result.samples.base,expected);
  await page.evaluate(() => {document.documentElement.dataset.lightmetalTheme = 'dark';document.querySelector('#paper-card').style.setProperty('--etch-canvas','#123456');});
  assert.deepEqual((await pixels(page)).samples.base,expected);
  if (type === 'dots') {
    assert.deepEqual(result.samples.horizontal,expected);assert.deepEqual(result.samples.vertical,expected);
    assert.notDeepEqual(result.samples.dot,expected);
  } else {
    assert.notDeepEqual(result.samples.horizontal,expected);
    if (type === 'ruled') assert.deepEqual(result.samples.vertical,expected);
    else assert.notDeepEqual(result.samples.vertical,expected);
  }
  if (type === 'engineering') assert.ok(result.samples.major[0] < result.samples.vertical[0]);
  for (const output of [result,await pixels(page,2,[-26,-14]),await pixels(page,1,[13.25,27.5])]) {
    assert.ok(output.png.mean < 0.5,JSON.stringify(output));assert.ok(output.svg.mean < 0.5,JSON.stringify(output));
    assert.equal(output.png.bad,0,JSON.stringify(output));assert.equal(output.svg.bad,0,JSON.stringify(output));
    assert.ok(output.svgLength < 2000);
  }
});

for (const mobile of [false,true]) test(`paper dialog previews drafts, validates spacing, applies one edit and reopens/undoes (${mobile ? 'mobile' : 'desktop'})`,async t => {
  const page = await setup(t,{mobile,data:nativeFixture()});await page.evaluate(() => paperEditor.setSelection(['image']));const before = await save(page);
  await root(page).getByRole('button',{name:'Toggle sidebar',exact:true}).click();
  await root(page).getByRole('button',{name:'Document background',exact:true}).click();
  const mode = dialog(page).getByRole('combobox',{name:'Background mode'}),spacing = dialog(page).getByRole('spinbutton',{name:'Paper spacing'}),apply = dialog(page).getByRole('button',{name:'Apply background',exact:true});
  for (const type of ['dots','graph','ruled','engineering']) {await mode.selectOption(type);assert.equal(await spacing.inputValue(),'24');assert.notEqual(await dialog(page).locator('.etch-background-sample').evaluate(el => getComputedStyle(el).backgroundImage),'none');}
  await spacing.fill('0');assert.equal(await apply.isDisabled(),true);await spacing.fill('24.5');assert.equal(await apply.isDisabled(),true);
  await spacing.fill('28');assert.equal(await apply.isEnabled(),true);assert.deepEqual(await save(page),before);assert.equal(await page.evaluate(() => paperChanges.length),0);
  await apply.click();await settle(page);const after = await save(page);
  assert.deepEqual(after,{...before,background:{type:'engineering',spacing:28}});assert.deepEqual(await page.evaluate(() => paperEditor.getSelection()),['image']);assert.equal(await page.evaluate(() => paperChanges.length),1);
  await root(page).getByRole('button',{name:'Document background',exact:true}).click();assert.equal(await mode.inputValue(),'engineering');assert.equal(await spacing.inputValue(),'28');
  await mode.selectOption('ruled');await page.keyboard.press('Escape');assert.deepEqual(await save(page),after);
  await page.evaluate(() => paperEditor.undo());assert.deepEqual(await save(page),before);await page.evaluate(() => paperEditor.redo());assert.deepEqual(await save(page),after);
  await page.evaluate(async () => paperEditor.load(paperEditor.save()));assert.deepEqual(await save(page),after);
});

test('off-white preset previews without editing, round-trips as a solid color and exports consistently',async t => {
  const page = await setup(t),before = await save(page);
  await root(page).getByRole('button',{name:'Toggle sidebar',exact:true}).click();
  const open = () => root(page).getByRole('button',{name:'Document background',exact:true}).click();
  await open();const mode = dialog(page).getByRole('combobox',{name:'Background mode'});
  await mode.selectOption('offwhite');assert.deepEqual(await save(page),before);
  assert.equal(await dialog(page).locator('.etch-background-sample').evaluate(el => getComputedStyle(el).backgroundColor),'rgb(250, 248, 242)');
  await page.keyboard.press('Escape');assert.deepEqual(await save(page),before);
  await open();await mode.selectOption('offwhite');await dialog(page).getByRole('button',{name:'Apply background',exact:true}).click();
  const after = await save(page);assert.equal(after.background,'#FAF8F2');assert.equal(await page.evaluate(() => paperChanges.length),1);
  const result = await pixels(page);assert.deepEqual(result.samples.base,[250,248,242,255]);assert.equal(result.png.bad,0);assert.equal(result.svg.bad,0);
  await page.evaluate(() => paperEditor.undo());assert.deepEqual(await save(page),before);
  await page.evaluate(() => paperEditor.redo());assert.deepEqual(await save(page),after);
  await page.evaluate(async () => paperEditor.load(paperEditor.save()));await open();assert.equal(await mode.inputValue(),'offwhite');
});

test('paper stays behind artwork, is not hit-testable, and PNG captures the committed paper before later changes',async t => {
  const d = nativeFixture();d.layers[0].offset = [0,0];d.layers[0].elements = [{...d.layers[0].elements[2],x:40,y:40,width:50,height:30,fill:'#FF0000',stroke:null,strokeWidth:0}];d.assets = [];
  const page = await setup(t,{data:d});
  const result = await page.evaluate(async () => {
    paperEditor.setBackground({type:'engineering',spacing:20});paperEditor.setTool('select');
    const options = {bounds:{x:0,y:0,width:160,height:120},padding:0},pending = paperEditor.exportPNG(options),oldSVG = paperEditor.exportSVG(options).svg;
    paperEditor.setBackground({type:'graph',spacing:20});const {blob} = await pending;
    const image = await createImageBitmap(blob),canvas = document.createElement('canvas');canvas.width = 160;canvas.height = 120;canvas.getContext('2d').drawImage(image,0,0);image.close();
    const at = (x,y) => [...canvas.getContext('2d').getImageData(x,y,1,1).data];
    const samples = {paper:at(10,10),art:at(50,50),oldSVG:oldSVG.includes('#F1F7E9')};canvas.width = canvas.height = 0;return samples;
  });
  assert.deepEqual(result,{paper:[241,247,233,255],art:[255,0,0,255],oldSVG:true});
  const b = await root(page).locator('.etch-viewport').boundingBox();await page.mouse.click(b.x+120,b.y+100);
  assert.deepEqual(await page.evaluate(() => paperEditor.getSelection()),[]);
  const beforeErase = await save(page);await page.evaluate(() => paperEditor.setTool('eraser'));await page.mouse.click(b.x+120,b.y+100);
  assert.deepEqual(await save(page),beforeErase);
});

for (const mobile of [false,true]) test(`live background previews match applied artwork while saves/exports/history stay committed (${mobile?'mobile':'desktop'})`,async t=>{
  const d=nativeFixture();d.background='#123456';
  const page=await setup(t,{mobile,data:d});
  await page.evaluate(()=>{paperEditor.setViewState({zoom:1.5,pan:[-13,27]});paperEditor.setSelection(['image']);});await settle(page);
  const committed=()=>root(page).locator('.etch-committed').evaluate(c=>c.toDataURL());
  const beforePixels=await committed(),before=await save(page);
  const metadata=()=>page.evaluate(()=>({revision:paperEditor.getRevision(),undo:paperEditor.canUndo(),redo:paperEditor.canRedo(),selection:paperEditor.getSelection(),active:paperEditor.getActiveLayer(),view:paperEditor.getViewState(),changes:paperChanges.length}));
  const exports=()=>page.evaluate(async()=>({svg:paperEditor.exportSVG().svg,png:Array.from(new Uint8Array(await (await paperEditor.exportPNG({bounds:{x:0,y:0,width:100,height:100},padding:0})).blob.arrayBuffer()))}));
  const beforeExports=await exports();
  for(const type of ['transparent','solid','offwhite','dots','graph','ruled','engineering']) {
    const baseline=await metadata();
    await root(page).getByRole('button',{name:'Document background',exact:true}).click();
    await dialog(page).getByRole('combobox',{name:'Background mode'}).selectOption(type);
    if(type==='solid') await dialog(page).getByRole('textbox',{name:'Background hex color'}).fill('#FEDCBA');
    if(['dots','graph','ruled','engineering'].includes(type)) await dialog(page).getByRole('spinbutton',{name:'Paper spacing'}).fill('28');
    await settle(page);
    assert.equal(await root(page).locator('.etch-live').isVisible(),true);
    const preview=await root(page).locator('.etch-live').evaluate(c=>c.toDataURL());
    assert.notEqual(preview,beforePixels);assert.equal(await committed(),beforePixels);
    assert.deepEqual(await save(page),before);assert.deepEqual(await metadata(),baseline);assert.deepEqual(await exports(),beforeExports);
    await dialog(page).getByRole('button',{name:'Apply background',exact:true}).click();await settle(page);
    assert.equal(await committed(),preview);assert.equal(await root(page).locator('.etch-live').isVisible(),false);
    assert.equal((await metadata()).changes,baseline.changes+1);
    await page.evaluate(()=>paperEditor.undo());await settle(page);assert.deepEqual(await save(page),before);assert.equal(await committed(),beforePixels);
  }
});

test('Cancel, Escape, API cancel and stale document changes discard live paper without history or pixel leaks',async t=>{
  const page=await setup(t);await page.evaluate(()=>{paperEditor.setBackground('#123456');paperEditor.setBackground('#ABCDEF');paperEditor.undo();paperChanges.length=0;});await settle(page);
  const original=await root(page).locator('.etch-committed').evaluate(c=>c.toDataURL());
  for(const action of ['cancel','escape','api']) {
    const before=await page.evaluate(()=>({data:paperEditor.save(),revision:paperEditor.getRevision(),undo:paperEditor.canUndo(),redo:paperEditor.canRedo()}));
    await root(page).getByRole('button',{name:'Document background',exact:true}).click();await dialog(page).getByRole('combobox',{name:'Background mode'}).selectOption('offwhite');await settle(page);
    if(action==='cancel') await dialog(page).getByRole('button',{name:'Cancel background',exact:true}).click();
    else if(action==='escape') await page.keyboard.press('Escape');else await page.evaluate(()=>paperEditor.cancel());
    await settle(page);assert.equal(await dialog(page).isVisible(),false);assert.equal(await root(page).locator('.etch-live').isVisible(),false);
    assert.equal(await root(page).locator('.etch-committed').evaluate(c=>c.toDataURL()),original);
    assert.deepEqual(await page.evaluate(()=>({data:paperEditor.save(),revision:paperEditor.getRevision(),undo:paperEditor.canUndo(),redo:paperEditor.canRedo()})),before);
  }
  await root(page).getByRole('button',{name:'Document background',exact:true}).click();await dialog(page).getByRole('combobox',{name:'Background mode'}).selectOption('graph');
  await dialog(page).getByRole('spinbutton',{name:'Paper spacing'}).fill('0');await settle(page);
  assert.equal(await root(page).locator('.etch-live').isVisible(),false);assert.equal(await dialog(page).getByRole('button',{name:'Apply background',exact:true}).isDisabled(),true);
  await dialog(page).getByRole('spinbutton',{name:'Paper spacing'}).fill('24');await settle(page);assert.equal(await root(page).locator('.etch-live').isVisible(),true);
  await page.evaluate(()=>paperEditor.setBackground('#00FF00'));await settle(page);
  assert.equal(await dialog(page).isVisible(),false);assert.equal(await root(page).locator('.etch-live').isVisible(),false);assert.equal((await save(page)).background,'#00FF00');
  await root(page).getByRole('button',{name:'Document background',exact:true}).click();await dialog(page).getByRole('combobox',{name:'Background mode'}).selectOption('engineering');await settle(page);
  await page.evaluate(async()=>{const d=paperEditor.save();d.background='#FF0000';await paperEditor.load(d);});await settle(page);
  assert.equal(await dialog(page).isVisible(),false);assert.equal(await root(page).locator('.etch-live').isVisible(),false);assert.equal((await save(page)).background,'#FF0000');
});

test('pathological paper PNG crops reject bounded work and release resources; SVG remains compact and native import warns about omitted paper',async t => {
  const page = await setup(t);await page.evaluate(() => paperEditor.setBackground({type:'engineering',spacing:24}));const before = await save(page);
  const result = await page.evaluate(async () => {
    let code,limit;try {await paperEditor.exportPNG({bounds:{x:0,y:0,width:1e7,height:1e7},padding:0,scale:0.00001});} catch(e) {code = e.code;limit = e.details.limit;}
    const svg = paperEditor.exportSVG({bounds:{x:0,y:0,width:1e7,height:1e7},padding:0}).svg;
    let importCode;try {await paperEditor.importSVG(svg);} catch(e) {importCode = e.code;}
    const {blob} = await paperEditor.exportPNG({bounds:{x:0,y:0,width:100,height:100},padding:0});return {code,limit,importCode,length:svg.length,bytes:blob.size};
  });
  assert.equal(result.code,'LIMIT_EXCEEDED');assert.equal(result.limit,'paperLines');assert.equal(result.importCode,'UNSUPPORTED_SVG_FEATURE');assert.ok(result.length < 2000);assert.ok(result.bytes > 0);assert.deepEqual(await save(page),before);
  const source = nativeFixture();source.background = {type:'ruled',spacing:32};
  await root(page).getByRole('button',{name:'Toggle sidebar',exact:true}).click();
  await root(page).getByLabel('Choose Etch drawing',{exact:true}).setInputFiles({name:'paper.etch.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(source))});
  const native = root(page).locator('.etch-native-dialog');await native.getByRole('button',{name:'Import as one layer',exact:true}).waitFor();
  await page.waitForFunction(() => !document.querySelector('#paper-card .etch-native-dialog button:last-child').disabled);
  assert.match(await native.textContent(),/Ruled paper \(32 world units\).*omitted/);
  await native.getByRole('button',{name:'Cancel drawing import',exact:true}).click();assert.deepEqual(await save(page),before);
});
