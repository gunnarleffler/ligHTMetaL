import {test} from 'node:test';
import assert from 'node:assert/strict';
import {useBrowser,collapseDemoSidebar} from './fixture.js';
import {png} from '../test/helpers.js';

const fixture = useBrowser(process.env.ETCH_ROTATION_BROWSER ?? 'chromium');
const root = page => page.locator('#rotation-card');
const layerButton = page => root(page).getByRole('button',{name:'Rotate layer clockwise 90°',exact:true});
const selectionButton = page => root(page).getByRole('button',{name:'Rotate selection clockwise 90°',exact:true});
const settle = page => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
const save = page => page.evaluate(() => rotationEditor.save());
async function setup(t,{mobile=false,readOnly=false}={}) {
  const {browser,server} = fixture,context = await browser.newContext({viewport:mobile ? {width:390,height:320} : {width:1280,height:900},hasTouch:mobile,deviceScaleFactor:2}),page = await context.newPage(),errors = [];
  page.on('pageerror',e => errors.push(e.message));
  t.after(async () => {await context.close();assert.deepEqual(errors,[]);});
  await page.goto(server.origin+'/demo/');await collapseDemoSidebar(page);
  await page.evaluate(async ({data,mobile,readOnly}) => {
    const {createEtch} = await import('/etch.js'),card = document.createElement('div');card.id = 'rotation-card';card.style = mobile ? 'width:320px;height:240px' : 'width:900px;height:500px';document.body.prepend(card);
    const e = window.rotationEditor = createEtch(card,{sidebarOpen:true,readOnly}),d = e.save();
    d.layers[0].id = 'photo';d.layers[0].name = 'School photo';d.layers[0].offset = [10,20];
    d.assets = [{id:'png',mime:'image/png',width:2,height:1,data}];
    d.layers[0].elements = [
      {id:'image',type:'image',assetId:'png',transform:[1,0,0,1,0,0],x:50,y:40,width:80,height:40,alt:'School worksheet'},
      {id:'note',type:'rect',transform:[1,0,0,1,0,0],x:50,y:40,width:20,height:10,fill:'#FF0000',stroke:null,strokeWidth:0,lineJoin:'round',miterLimit:4},
    ];
    await e.load(d);e.setViewState({zoom:1,pan:[0,0]});window.rotationChanges = [];e.on('change',e => rotationChanges.push(e));
  },{data:png(2,1),mobile,readOnly});await settle(page);return page;
}
async function pixels(page) {
  return page.evaluate(async () => {
    const e = rotationEditor,canvas = document.querySelector('#rotation-card .etch-committed');
    const at = (c,x,y) => [...c.getContext('2d').getImageData(x,y,1,1).data];
    const points = [[110,45],[70,65],[90,100]],viewport = points.map(([x,y]) => at(canvas,x*2,y*2));
    const options = {bounds:{x:0,y:0,width:200,height:160},padding:0};
    const {blob} = await e.exportPNG(options),{svg} = e.exportSVG(options);
    const read = async blob => {
      const url = URL.createObjectURL(blob),image = new Image(),c = document.createElement('canvas');c.width = 200;c.height = 160;
      try {image.src = url;await image.decode();c.getContext('2d').drawImage(image,0,0);return points.map(([x,y]) => at(c,x,y));}
      finally {URL.revokeObjectURL(url);image.src = '';c.width = c.height = 0;}
    };
    return {viewport,png:await read(blob),svg:await read(new Blob([svg],{type:'image/svg+xml'}))};
  });
}

for (const mobile of [false,true]) test(`layer button supports repeated quarter-turns and Undo with no image re-encoding (${mobile ? 'mobile' : 'desktop'})`,async t => {
  const page = await setup(t,{mobile}),before = await save(page),view = await page.evaluate(() => rotationEditor.getViewState());
  await root(page).getByRole('button',{name:'Layer options',exact:true}).click();
  await layerButton(page).click();await settle(page);const first = await save(page);
  assert.deepEqual(first.assets,before.assets);assert.deepEqual(first.layers[0].offset,before.layers[0].offset);
  assert.deepEqual(first.layers[0].elements.map(e => e.transform),[[0,1,-1,0,150,-30],[0,1,-1,0,150,-30]]);
  const expected = [[255,0,0,255],[0,0,0,0],[40,120,200,128]];
  const rendered = await pixels(page);
  for (const output of Object.values(rendered)) output.forEach((pixel,i) => pixel.forEach((channel,j) => {
    // Translucent RGB passes through browser color management and multiple
    // premultiplication/encoding round trips (notably Firefox PNG); alpha stays exact.
    assert.ok(Math.abs(channel-expected[i][j]) <= (j < 3 && expected[i][3] === 128 ? 4 : 0),JSON.stringify(rendered));
  }));
  for (let i=0;i<3;i++) await layerButton(page).click();
  assert.deepEqual(await save(page),before);assert.equal(await layerButton(page).isVisible(),true);
  assert.deepEqual(await page.evaluate(() => rotationEditor.getViewState()),view);
  assert.equal(await page.evaluate(() => rotationChanges.length),4);
  await root(page).getByRole('button',{name:'Done',exact:true}).click();
  await page.evaluate(() => {for (let i=0;i<3;i++) rotationEditor.undo();});assert.deepEqual(await save(page),first);
  await page.evaluate(() => rotationEditor.undo());assert.deepEqual(await save(page),before);
  await page.evaluate(() => rotationEditor.redo());assert.deepEqual(await save(page),first);
  await page.evaluate(async () => {await rotationEditor.load(rotationEditor.save());});assert.deepEqual(await save(page),first);
});

for (const mobile of [false,true]) test(`toolbar rotates selection or active layer with sidebar closed (${mobile ? 'mobile' : 'desktop'})`,async t => {
  const page = await setup(t,{mobile}),before = await save(page),rotate = root(page).getByRole('button',{name:'Rotate clockwise 90°',exact:true});
  await root(page).getByRole('button',{name:'Toggle sidebar',exact:true}).click();
  const box = await root(page).boundingBox();
  for (const button of await root(page).locator('.etch-toolbar button').all()) {
    await button.scrollIntoViewIfNeeded();const b = await button.boundingBox();assert.ok(b.x >= box.x && b.x+b.width <= box.x+box.width,await button.getAttribute('aria-label'));
  }
  assert.equal(await rotate.getAttribute('title'),'Rotate active layer clockwise 90°');
  await rotate.click();const layer = await save(page);assert.notDeepEqual(layer.layers[0].elements[1],before.layers[0].elements[1]);
  await page.evaluate(() => {rotationEditor.undo();rotationEditor.setSelection(['image']);});
  assert.equal(await rotate.getAttribute('title'),'Rotate selected objects clockwise 90°');
  await rotate.click();const selected = await save(page);
  assert.deepEqual(selected.assets,before.assets);assert.deepEqual(selected.layers[0].elements[1],before.layers[0].elements[1]);
  assert.deepEqual(selected.layers[0].elements[0],layer.layers[0].elements[0]);
  assert.deepEqual(await page.evaluate(() => rotationEditor.getSelection()),['image']);
  await page.evaluate(() => rotationEditor.setLayerLocked('photo',true));assert.equal(await rotate.isDisabled(),true);
});

test('Select button rotates only selected objects, preserves selection, and disables when empty or locked',async t => {
  const page = await setup(t),before = await save(page);
  await root(page).getByRole('button',{name:'Select',exact:true}).click();assert.equal(await selectionButton(page).isDisabled(),true);
  await page.evaluate(() => rotationEditor.setSelection(['image']));await selectionButton(page).click();
  await settle(page);
  const box = await root(page).locator('.etch-viewport').boundingBox();
  await page.mouse.click(box.x+90,box.y+100); // Rotated photo remains pickable in its new painted rectangle.
  const after = await save(page);assert.deepEqual(after.assets,before.assets);assert.deepEqual(after.layers[0].elements[1],before.layers[0].elements[1]);
  assert.deepEqual(after.layers[0].elements[0].transform,[0,1,-1,0,150,-30]);
  assert.deepEqual(await page.evaluate(() => rotationEditor.getSelection()),['image']);
  await selectionButton(page).focus();await page.keyboard.press('Enter');
  assert.deepEqual((await save(page)).layers[0].elements[0].transform,[-1,0,0,-1,180,120]);
  await page.evaluate(() => rotationEditor.setLayerLocked('photo',true));assert.equal(await selectionButton(page).isDisabled(),true);
});

test('F2 rotates the focused layer without changing the active layer, and limit failures keep the dialog and artwork intact',async t => {
  const page = await setup(t),before = await save(page);
  await page.evaluate(() => rotationEditor.createLayer({name:'Notes'}));
  const active = await page.evaluate(() => rotationEditor.getActiveLayer());
  await root(page).getByRole('button',{name:'School photo (2)',exact:true}).focus();await page.keyboard.press('F2');
  await layerButton(page).click();assert.equal(await page.evaluate(() => rotationEditor.getActiveLayer()),active);
  assert.notDeepEqual((await save(page)).layers[0],before.layers[0]);
  await page.evaluate(() => rotationEditor.undo());assert.deepEqual((await save(page)).layers[0],before.layers[0]);
  // A valid loaded document can grow in serialized size when matrices gain translations.
  await page.evaluate(async () => {
    const d = rotationEditor.save(),{createEtch} = await import('/etch.js');rotationEditor.destroy();
    const card = document.querySelector('#rotation-card');window.rotationEditor = createEtch(card,{sidebarOpen:true,limits:{jsonBytes:new TextEncoder().encode(JSON.stringify(d)).length}});
    await rotationEditor.load(d);rotationEditor.setActiveLayer('photo');
  });
  const baseline = await save(page);await root(page).getByRole('button',{name:'Layer options',exact:true}).click();await layerButton(page).click();
  assert.deepEqual(await save(page),baseline);assert.equal(await layerButton(page).isVisible(),true);
  assert.ok((await root(page).locator('.etch-layer-dialog [role="alert"]').textContent()).length > 0);
});

test('layer rotation disables for hidden/empty layers and is unavailable read-only',async t => {
  const page = await setup(t);await page.evaluate(() => rotationEditor.setLayerVisibility('photo',false));
  await root(page).getByRole('button',{name:'Layer options',exact:true}).click();assert.equal(await layerButton(page).isDisabled(),true);
  assert.equal(await root(page).getByRole('button',{name:'Rotate clockwise 90°',exact:true}).isDisabled(),true);
  await root(page).getByRole('button',{name:'Done',exact:true}).click();
  await page.evaluate(() => rotationEditor.createLayer());await root(page).getByRole('button',{name:'Layer options',exact:true}).click();assert.equal(await layerButton(page).isDisabled(),true);
  const ro = await setup(t,{readOnly:true});assert.equal(await root(ro).getByRole('button',{name:'Layer options',exact:true}).isDisabled(),true);
  assert.equal(await root(ro).getByRole('button',{name:'Rotate clockwise 90°',exact:true}).isDisabled(),true);
});
