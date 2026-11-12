import {test} from 'node:test';
import assert from 'node:assert/strict';
import {useBrowser} from './fixture.js';

const fixture = useBrowser(process.env.ETCH_UI_BROWSER ?? 'chromium');
async function setup(t,{small=false}={}) {
  const context = await fixture.browser.newContext({viewport:{width:1280,height:900},hasTouch:small});
  const page = await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  t.after(async()=>{await context.close();assert.deepEqual(errors,[]);});
  await page.goto(fixture.server.origin+'/demo/');
  await page.evaluate(async small=>{
    const {createEtch}=await import('/etch.js'),card=document.createElement('div');
    card.id='quick-card';card.style=small?'width:320px;height:240px':'width:960px;height:640px';document.body.prepend(card);
    window.quickEditor=createEtch(card);window.quickBaseline={data:quickEditor.save(),revision:quickEditor.getRevision()};
    window.quickViewport=card.querySelector('.etch-viewport');window.quickCanvases=[...card.querySelectorAll('canvas')];
  },small);
  return {page,card:page.locator('#quick-card'),quick:page.locator('#quick-card .etch-quick-toolbar')};
}
async function unchanged(page) {
  assert.deepEqual(await page.evaluate(()=>({
    data:JSON.stringify(quickEditor.save())===JSON.stringify(quickBaseline.data),revision:quickEditor.getRevision()===quickBaseline.revision,
    undo:quickEditor.canUndo(),viewport:document.querySelector('#quick-card .etch-viewport')===quickViewport,
    canvases:[...document.querySelectorAll('#quick-card canvas')].every((c,i)=>c===quickCanvases[i]),
  })),{data:true,revision:true,undo:false,viewport:true,canvases:true});
}

test('quick controls start collapsed, toggle without deactivation and remain independent of sidebar',async t=>{
  const {page,card,quick}=await setup(t),pen=card.getByRole('button',{name:'Pen',exact:true});
  assert.equal(await quick.isVisible(),false);
  await pen.click();assert.equal(await quick.isVisible(),true);assert.equal(await pen.getAttribute('aria-expanded'),'true');
  await pen.click();assert.equal(await quick.isVisible(),false);assert.equal(await pen.getAttribute('aria-pressed'),'true');
  await pen.click();await card.getByRole('button',{name:'Toggle sidebar',exact:true}).click();
  assert.equal(await quick.isVisible(),true);assert.equal(await card.locator('.etch-sidebar').isVisible(),true);
  await pen.click();assert.equal(await card.locator('.etch-sidebar').isVisible(),true);
  await card.getByRole('button',{name:'Eraser',exact:true}).click();assert.equal(await quick.getByRole('combobox',{name:'Quick erasing mode'}).isVisible(),true);
  for(const name of ['Select','Hand / Pan','Move Layer']) {
    await pen.click();await card.getByRole('button',{name,exact:true}).click();assert.equal(await quick.isVisible(),false);
  }
  await unchanged(page);
});

test('tool shortcuts open even the active tool; programmatic changes do not open; canvas does not dismiss',async t=>{
  const {page,card,quick}=await setup(t),viewport=card.locator('.etch-viewport');
  await viewport.focus();await page.keyboard.press('p');assert.equal(await quick.isVisible(),true);
  await card.getByRole('button',{name:'Pen',exact:true}).click();assert.equal(await quick.isVisible(),false);
  await viewport.focus();await page.keyboard.press('b');assert.equal(await quick.isVisible(),true);
  await page.keyboard.press('e');assert.equal(await quick.getByRole('combobox',{name:'Quick erasing mode'}).isVisible(),true);
  await page.keyboard.press('r');assert.equal(await quick.getByRole('combobox',{name:'Quick shape',exact:true}).inputValue(),'rect');
  await page.keyboard.press('v');assert.equal(await quick.isVisible(),false);
  await page.evaluate(()=>quickEditor.setTool('pen'));assert.equal(await quick.isVisible(),false);
  await unchanged(page);
  await card.getByRole('button',{name:'Pen',exact:true}).click();
  const box=await viewport.boundingBox();await page.mouse.move(box.x+40,box.y+40);await page.mouse.down();await page.mouse.move(box.x+100,box.y+70);await page.mouse.up();
  assert.equal(await quick.isVisible(),true);assert.equal(await page.evaluate(()=>quickEditor.save().layers[0].elements.length),1);
});

test('pen colors, presets, custom values and shared-outline preview synchronize both ways without edits',async t=>{
  const {page,card,quick}=await setup(t);
  await card.getByRole('button',{name:'Pen',exact:true}).click();
  await quick.getByRole('button',{name:'Stroke color #EF4444',exact:true}).click();await quick.getByRole('button',{name:'Stroke width 6',exact:true}).click();
  await card.getByRole('button',{name:'Toggle sidebar',exact:true}).click();
  assert.equal(await card.getByLabel('Pen color',{exact:true}).inputValue(),'#ef4444');assert.equal(await card.getByLabel('Pen width',{exact:true}).inputValue(),'6');
  assert.equal(await quick.locator('svg[role="img"] path').getAttribute('d'),await card.locator('.etch-stroke-preview path').getAttribute('d'));
  await card.getByLabel('Pen width',{exact:true}).fill('7.5');await card.getByLabel('Pen width',{exact:true}).press('Tab');
  assert.equal(await quick.locator('[aria-label^="Stroke width"][aria-pressed="true"]').count(),0);
  await quick.getByRole('button',{name:'More colors',exact:true}).click();await quick.getByRole('button',{name:'Stroke color #14B8A6',exact:true}).click();
  await quick.getByLabel('Custom stroke color').evaluate(el=>{el.value='#123456';el.dispatchEvent(new Event('input',{bubbles:true}));});
  assert.equal(await card.getByLabel('Pen color',{exact:true}).inputValue(),'#123456');
  await page.evaluate(()=>quickEditor.setToolSettings('pen',{color:'#8B5CF6',width:12}));
  assert.equal(await quick.getByRole('button',{name:'Stroke color #8B5CF6',exact:true}).getAttribute('aria-pressed'),'true');
  assert.equal(await quick.getByRole('button',{name:'Stroke width 12',exact:true}).getAttribute('aria-pressed'),'true');
  await card.getByRole('button',{name:'Eraser',exact:true}).click();await card.getByRole('button',{name:'Pen',exact:true}).click();
  assert.deepEqual(await page.evaluate(()=>quickEditor.getToolSettings('pen')),{color:'#8B5CF6',width:12,pressure:true});await unchanged(page);
});

test('shape and eraser controls share existing settings and preserve shape paint guards',async t=>{
  const {page,card,quick}=await setup(t);
  await card.getByRole('button',{name:'Shapes',exact:true}).click();
  await quick.getByRole('checkbox',{name:'Quick shape fill',exact:true}).check();await quick.getByRole('checkbox',{name:'Quick shape border',exact:true}).uncheck();
  assert.equal(await quick.getByRole('checkbox',{name:'Quick shape fill',exact:true}).isDisabled(),true);
  assert.equal(await quick.getByLabel('Custom stroke color').isDisabled(),true);
  await quick.getByLabel('Quick fill color').evaluate(el=>{el.value='#aabbcc';el.dispatchEvent(new Event('input',{bubbles:true}));});
  assert.deepEqual(await page.evaluate(()=>quickEditor.getToolSettings('rect')),{stroke:null,strokeWidth:2,fill:'#AABBCC'});
  await quick.getByRole('combobox',{name:'Quick shape',exact:true}).selectOption('line');
  assert.equal(await quick.getByRole('checkbox',{name:'Quick shape fill',exact:true}).isVisible(),false);
  await quick.getByRole('button',{name:'Stroke width 3',exact:true}).click();
  await card.getByRole('button',{name:'Eraser',exact:true}).click();await quick.getByRole('button',{name:'Eraser radius 20 pixels',exact:true}).click();
  await quick.getByRole('combobox',{name:'Quick erasing mode'}).selectOption('object');
  await card.getByRole('button',{name:'Toggle sidebar',exact:true}).click();
  assert.equal(await card.getByLabel('Eraser radius',{exact:true}).inputValue(),'20');assert.equal(await card.getByLabel('Eraser mode',{exact:true}).inputValue(),'object');
  await page.evaluate(()=>quickEditor.setToolSettings('eraser',{radius:40,mode:'partial'}));
  assert.equal(await quick.getByRole('button',{name:'Eraser radius 40 pixels',exact:true}).getAttribute('aria-pressed'),'true');
  assert.equal(await quick.getByRole('combobox',{name:'Quick erasing mode'}).inputValue(),'partial');await unchanged(page);
});

test('quick toolbar expansion preserves world center and cancels wet content on tool change',async t=>{
  const {page,card,quick}=await setup(t);
  const snapshot=()=>page.evaluate(()=>{const v=quickEditor.getViewState(),b=quickViewport.getBoundingClientRect();return {zoom:v.zoom,center:[(b.width/2-v.pan[0])/v.zoom,(b.height/2-v.pan[1])/v.zoom]};});
  const settle=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  await page.evaluate(()=>quickEditor.setViewState({zoom:2,pan:[50,70]}));await settle();const before=await snapshot();
  await card.getByRole('button',{name:'Pen',exact:true}).click();await settle();assert.deepEqual(await snapshot(),before);
  const b=await card.locator('.etch-viewport').boundingBox();await page.mouse.move(b.x+30,b.y+40);await page.mouse.down();await page.mouse.move(b.x+100,b.y+70);
  await unchanged(page);
  await page.evaluate(()=>quickEditor.setTool('eraser'));await page.mouse.up();await settle();assert.equal(await quick.isVisible(),false);
  await unchanged(page);assert.deepEqual(await snapshot(),before);
});

test('stylus compatibility clicks activate quick controls without drawing',{skip:(process.env.ETCH_UI_BROWSER ?? 'chromium')!=='chromium'},async t=>{
  const {page,card,quick}=await setup(t),cdp=await page.context().newCDPSession(page);
  async function tap(locator) {
    await locator.scrollIntoViewIfNeeded();const b=await locator.boundingBox(),point={x:b.x+b.width/2,y:b.y+b.height/2,button:'left',pointerType:'pen',clickCount:1};
    await cdp.send('Input.dispatchMouseEvent',{...point,type:'mousePressed',buttons:1,force:0.5});
    await cdp.send('Input.dispatchMouseEvent',{...point,type:'mouseReleased',buttons:0,force:0});
  }
  await tap(card.getByRole('button',{name:'Pen',exact:true}));assert.equal(await quick.isVisible(),true);
  await tap(quick.getByRole('button',{name:'Stroke width 6',exact:true}));assert.equal(await page.evaluate(()=>quickEditor.getToolSettings('pen').width),6);
  await tap(card.getByRole('button',{name:'Pen',exact:true}));assert.equal(await quick.isVisible(),false);await unchanged(page);
});

test('320×240 touch card scrolls quick controls without shrinking targets or overflowing the root',async t=>{
  const {page,card,quick}=await setup(t,{small:true});
  await card.getByRole('button',{name:'Pen',exact:true}).tap();
  await quick.getByRole('button',{name:'Stroke color #EF4444',exact:true}).tap();
  assert.equal(await quick.getByRole('button',{name:'Stroke color #EF4444',exact:true}).getAttribute('aria-pressed'),'true');
  await quick.getByRole('button',{name:'Stroke width 12',exact:true}).tap();
  const metrics=await quick.evaluate(el=>({height:el.clientHeight,scroll:el.scrollWidth>el.clientWidth,target:el.querySelector('button').getBoundingClientRect().width,rootOverflow:el.parentElement.scrollWidth>el.parentElement.clientWidth,viewport:el.parentElement.querySelector('.etch-viewport').clientHeight}));
  assert.ok(metrics.height>=40 && metrics.height<=48);assert.equal(metrics.scroll,true);assert.equal(metrics.target,40);assert.equal(metrics.rootOverflow,false);assert.ok(metrics.viewport>60);
  await unchanged(page);
});
