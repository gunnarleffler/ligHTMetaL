import {test} from 'node:test';
import assert from 'node:assert/strict';
import {useBrowser,collapseDemoSidebar} from './fixture.js';
import {fixture as nativeFixture} from '../test/helpers.js';

const fixture = useBrowser(process.env.ETCH_FULLSCREEN_BROWSER ?? 'chromium');
const root = page => page.locator('#fullscreen-card .etch');
const settle = page => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
async function setup(t,{fallback=false,denied=false,mobile=false,readOnly=false}={}) {
  const {browser,server} = fixture,context = await browser.newContext({viewport:mobile ? {width:390,height:700} : {width:1200,height:850},hasTouch:mobile,deviceScaleFactor:2}),page = await context.newPage(),errors = [];
  page.on('pageerror',e => errors.push(e.message));
  t.after(async () => {await context.close();assert.deepEqual(errors,[]);});
  await page.goto(server.origin+'/demo/');await collapseDemoSidebar(page);
  await page.evaluate(async ({data,fallback,denied,mobile,readOnly}) => {
    const {createEtch} = await import('/etch.js');
    const host = document.createElement('div');host.id = 'fullscreen-card';host.style = mobile ? 'width:320px;height:240px' : 'width:800px;height:450px';document.body.prepend(host);
    const outside = document.createElement('input');outside.id = 'outside-focus';outside.setAttribute('aria-label','Host input');document.body.prepend(outside);
    const e = window.fsEditor = createEtch(host,{sidebarOpen:true,readOnly});await e.load(data);
    if (!readOnly) {e.setBackground('#FFFFFF');e.undo();}
    e.setSelection(['image']);e.setTool('select');e.setViewState({zoom:1.5,pan:[71,93]});
    window.fsRoot = host.querySelector('.etch');window.fsViewport = host.querySelector('.etch-viewport');window.fsCanvases = [...host.querySelectorAll('canvas')];
    window.fsChanges = [];window.fsViews = [];e.on('change',v => fsChanges.push(v));e.on('viewchange',v => fsViews.push(v));
    window.nativeRequests = 0;
    if (fallback) fsRoot.requestFullscreen = undefined;
    else if (denied) fsRoot.requestFullscreen = () => {nativeRequests++;return Promise.reject(new DOMException('Fullscreen denied','NotAllowedError'));};
    else {const request = fsRoot.requestFullscreen;fsRoot.requestFullscreen = function() {nativeRequests++;return request.call(this);};}
  },{data:nativeFixture(),fallback,denied,mobile,readOnly});await settle(page);return page;
}
const snapshot = page => page.evaluate(() => {
  const e = fsEditor,v = e.getViewState(),box = fsViewport.getBoundingClientRect();
  return {data:e.save(),revision:e.getRevision(),active:e.getActiveLayer(),selection:e.getSelection(),tool:e.getTool(),undo:e.canUndo(),redo:e.canRedo(),
    sidebar:fsRoot.querySelector('.etch-sidebar-toggle').getAttribute('aria-expanded'),zoom:v.zoom,center:[(box.width/2-v.pan[0])/v.zoom,(box.height/2-v.pan[1])/v.zoom]};
});
function preserved(after,before) {
  after.center.forEach((n,i) => assert.ok(Math.abs(n-before.center[i]) < 1e-7,`${after.center} != ${before.center}`));
  assert.deepEqual({...after,center:before.center},before);
}
async function identities(page) {
  assert.equal(await page.evaluate(() => document.querySelector('#fullscreen-card .etch') === fsRoot && fsRoot.querySelector('.etch-viewport') === fsViewport && fsCanvases.every(c => c.isConnected && fsRoot.contains(c))),true);
}

test('toolbar enters native root fullscreen and native exit restores the same editor, center and view-only events',async t => {
  const page = await setup(t),before = await snapshot(page);
  await root(page).getByRole('button',{name:'Fullscreen',exact:true}).click();await settle(page);
  assert.equal(await page.evaluate(() => document.fullscreenElement === fsRoot),true);
  assert.equal(await root(page).getByRole('button',{name:'Exit fullscreen',exact:true}).getAttribute('aria-pressed'),'true');
  preserved(await snapshot(page),before);await identities(page);
  await page.evaluate(() => document.exitFullscreen());await settle(page);
  assert.equal(await page.evaluate(() => fsEditor.getViewState().expanded),false);preserved(await snapshot(page),before);await identities(page);
  assert.equal(await page.evaluate(() => nativeRequests),1);assert.deepEqual(await page.evaluate(() => fsChanges),[]);
  assert.ok((await page.evaluate(() => fsViews)).some(v => v.expanded));
  assert.equal((await page.evaluate(() => fsViews)).at(-1).expanded,false);
});

for (const denied of [false,true]) test(`CSS fallback ${denied ? 'after denial' : 'without native API'} preserves state and restores host styles/focus/scroll`,async t => {
  const page = await setup(t,{fallback:!denied,denied});
  if (!denied) await page.evaluate(() => {fsRoot.showPopover = undefined;}); // Pure CSS works without either native API.
  await page.evaluate(() => {
    document.body.style.setProperty('overflow','auto','important');
    document.querySelector('#editor').setAttribute('inert','original');
    window.scrollTo(0,100);document.querySelector('#outside-focus').focus({preventScroll:true});
    window.hostScroll = [scrollX,scrollY];
  });
  const before = await snapshot(page);
  await page.evaluate(() => fsEditor.setExpanded(true));await settle(page);
  assert.equal(await page.evaluate(() => document.fullscreenElement),null);
  assert.equal(await page.evaluate(() => fsEditor.getViewState().expanded),true);preserved(await snapshot(page),before);
  const b = await root(page).boundingBox();assert.deepEqual(b,{x:0,y:0,width:1200,height:850});
  assert.equal(await root(page).getAttribute('aria-modal'),'true');assert.equal(await root(page).getAttribute('role'),'dialog');
  assert.equal(await page.locator('#outside-focus').getAttribute('inert'),'');
  await page.keyboard.press('Tab');assert.equal(await root(page).getByRole('button',{name:'Redo',exact:true}).evaluate(el => el === document.activeElement),true);
  await page.keyboard.press('Shift+Tab');await page.keyboard.press('Tab');assert.equal(await root(page).getByRole('button',{name:'Redo',exact:true}).evaluate(el => el === document.activeElement),true);
  await page.keyboard.press('Escape');await settle(page);
  preserved(await snapshot(page),before);await identities(page);
  assert.deepEqual(await page.evaluate(() => ({focus:document.activeElement.id,overflow:document.body.style.getPropertyValue('overflow'),priority:document.body.style.getPropertyPriority('overflow'),scroll:[scrollX,scrollY],expected:hostScroll,inert:document.querySelector('#editor').getAttribute('inert')})),
    {focus:'outside-focus',overflow:'auto',priority:'important',scroll:await page.evaluate(() => hostScroll),expected:await page.evaluate(() => hostScroll),inert:'original'});
  assert.equal(await root(page).getAttribute('role'),null);assert.equal(await root(page).getAttribute('aria-modal'),null);
  assert.equal(await page.locator('#outside-focus').getAttribute('inert'),null);
  assert.deepEqual(await page.evaluate(() => fsChanges),[]);
});

test('fallback on a narrow read-only card keeps all toolbar controls available; toggle restores card layout',async t => {
  const page = await setup(t,{fallback:true,mobile:true,readOnly:true}),before = await snapshot(page);
  const cardBox = await root(page).boundingBox();
  for (const button of await root(page).locator('.etch-toolbar button').all()) {
    await button.scrollIntoViewIfNeeded();const b = await button.boundingBox();assert.ok(b.x >= cardBox.x && b.x+b.width <= cardBox.x+cardBox.width,await button.getAttribute('aria-label'));
  }
  await root(page).getByRole('button',{name:'Fullscreen',exact:true}).click();await settle(page);preserved(await snapshot(page),before);
  await root(page).getByRole('button',{name:'Exit fullscreen',exact:true}).click();await settle(page);preserved(await snapshot(page),before);
  assert.deepEqual(await root(page).boundingBox(),cardBox);
});

test('Escape dismisses a modal first, then exits expansion without collapsing the sidebar',async t => {
  const page = await setup(t,{fallback:true});await page.evaluate(() => fsEditor.setExpanded(true));
  await root(page).getByRole('button',{name:'Document background',exact:true}).click();
  await page.keyboard.press('Escape');assert.equal(await root(page).locator('.etch-background-dialog').isVisible(),false);
  assert.equal(await page.evaluate(() => fsEditor.getViewState().expanded),true);
  await page.keyboard.press('Escape');await settle(page);assert.equal(await page.evaluate(() => fsEditor.getViewState().expanded),false);
  assert.equal(await root(page).locator('.etch-sidebar-toggle').getAttribute('aria-expanded'),'true');
});

async function mockPendingNative(page) {
  await page.evaluate(() => {
    window.mockFullscreen = null;window.exits = 0;
    Object.defineProperty(document,'fullscreenElement',{configurable:true,get:() => mockFullscreen});
    Object.defineProperty(document,'fullscreenEnabled',{configurable:true,value:true});
    fsRoot.requestFullscreen = () => new Promise(resolve => {window.finishEntry = () => {mockFullscreen = fsRoot;document.dispatchEvent(new Event('fullscreenchange'));resolve();};});
    document.exitFullscreen = async () => {exits++;mockFullscreen = null;document.dispatchEvent(new Event('fullscreenchange'));};
  });
}

test('pending native entry can be cancelled or destroyed without installing fallback or leaking page isolation',async t => {
  for (const destroy of [false,true]) {
    const page = await setup(t);await mockPendingNative(page);
    const result = await page.evaluate(async destroy => {
      const entry = fsEditor.setExpanded(true).then(() => 'ok',e => e.code);
      const exit = destroy ? (fsEditor.destroy(),Promise.resolve()) : fsEditor.setExpanded(false);
      finishEntry();await exit;return {code:await entry,fullscreen:mockFullscreen,overflow:document.body.style.overflow,inert:document.querySelector('#outside-focus').inert,exits};
    },destroy);
    assert.deepEqual(result,{code:destroy ? 'CANCELLED' : 'ok',fullscreen:null,overflow:'',inert:false,exits:1});
  }
});

test('rapid fallback requests settle at the latest requested mode without leaking isolation',async t => {
  const page = await setup(t,{fallback:true});
  const result = await page.evaluate(async () => {
    document.body.style.setProperty('overflow-x','hidden','important');document.body.style.setProperty('overflow-y','scroll');
    await Promise.all([fsEditor.setExpanded(true),fsEditor.setExpanded(false)]);
    const first = fsEditor.getViewState().expanded;
    await Promise.all([fsEditor.setExpanded(true),fsEditor.setExpanded(false),fsEditor.setExpanded(true)]);
    const last = fsEditor.getViewState().expanded;
    await fsEditor.setExpanded(false);
    return {first,last,x:document.body.style.overflowX,y:document.body.style.overflowY,priority:document.body.style.getPropertyPriority('overflow-x'),inert:document.querySelector('#outside-focus').inert};
  });
  assert.deepEqual(result,{first:false,last:true,x:'hidden',y:'scroll',priority:'important',inert:false});
});

test('multiple editors hand off page ownership and destroy restores fallback isolation',async t => {
  const page = await setup(t,{fallback:true});
  const result = await page.evaluate(async () => {
    const {createEtch} = await import('/etch.js'),host = document.createElement('div');document.body.append(host);
    const other = createEtch(host);host.querySelector('.etch').requestFullscreen = undefined;
    document.querySelector('#outside-focus').focus();
    await fsEditor.setExpanded(true);await other.setExpanded(true);
    const first = fsEditor.getViewState().expanded,second = other.getViewState().expanded;
    other.destroy();host.remove();return {first,second,overflow:document.body.style.overflow,inert:document.querySelector('#outside-focus').inert,focus:document.activeElement.id};
  });
  assert.deepEqual(result,{first:false,second:true,overflow:'',inert:false,focus:'outside-focus'});
});

test('fallback escapes a clipped/transformed host without moving the editor or losing inherited theme tokens',async t => {
  const page = await setup(t,{fallback:true});
  await page.evaluate(() => {
    const host = document.querySelector('#fullscreen-card'),wrapper = document.createElement('div');host.before(wrapper);wrapper.append(host);
    wrapper.style.cssText = 'transform:translate(30px,20px);width:850px;height:500px;overflow:hidden;--etch-panel:rgb(12,34,56)';
    window.parentBefore = fsRoot.parentNode;
  });
  await page.evaluate(() => fsEditor.setExpanded(true));await settle(page);
  assert.deepEqual(await root(page).boundingBox(),{x:0,y:0,width:1200,height:850});
  assert.equal(await page.evaluate(() => fsRoot.parentNode === parentBefore),true);
  assert.equal(await root(page).locator('.etch-toolbar').evaluate(el => getComputedStyle(el).backgroundColor),'rgb(12, 34, 56)');
  await page.evaluate(() => fsEditor.setExpanded(false));assert.equal(await root(page).getAttribute('popover'),null);await identities(page);
});

test('expansion cancels wet content on entry and exit without committing or clearing selection',async t => {
  const page = await setup(t,{fallback:true});
  await root(page).getByRole('button',{name:'Toggle sidebar',exact:true}).click();
  await page.evaluate(() => fsEditor.setTool('pen'));await settle(page);
  const before = await snapshot(page);
  for (const expanded of [true,false]) {
    const b = await root(page).locator('.etch-viewport').boundingBox();
    await page.mouse.move(b.x+70,b.y+80);await page.mouse.down();await page.mouse.move(b.x+150,b.y+120);await settle(page);
    assert.equal(await root(page).locator('.etch-live').isVisible(),true);
    await page.evaluate(expanded => fsEditor.setExpanded(expanded),expanded);await page.mouse.up();await settle(page);
    preserved(await snapshot(page),before);assert.equal(await root(page).locator('.etch-live').isVisible(),false);
  }
});

test('failed native exit retains truthful expanded state and can be retried; unrelated fullscreen is never exited',async t => {
  const page = await setup(t);await mockPendingNative(page);
  const result = await page.evaluate(async () => {
    const enter = fsEditor.setExpanded(true);finishEntry();await enter;
    const exit = document.exitFullscreen;document.exitFullscreen = async () => {throw new DOMException('Denied');};
    let code;try {await fsEditor.setExpanded(false);} catch(e) {code = e.code;}
    const expanded = fsEditor.getViewState().expanded;
    document.exitFullscreen = exit;await fsEditor.setExpanded(false);
    const cleared = !fsEditor.getViewState().expanded;
    const second = fsEditor.setExpanded(true);
    document.exitFullscreen = async () => {throw new DOMException('Denied');};
    const cancel = fsEditor.setExpanded(false);finishEntry();
    const cancelledCodes = (await Promise.allSettled([second,cancel])).map(result => result.reason?.code);
    const landed = fsEditor.getViewState().expanded;
    document.exitFullscreen = exit;await fsEditor.setExpanded(false);
    // Another host owns fullscreen, so destroying this editor must leave it alone.
    mockFullscreen = document.querySelector('#editor');fsEditor.destroy();await Promise.resolve();
    return {code,expanded,cleared,cancelledCodes,landed,other:mockFullscreen.id,exits};
  });
  assert.deepEqual(result,{code:'INVALID_ARGUMENT',expanded:true,cleared:true,cancelledCodes:['INVALID_ARGUMENT','INVALID_ARGUMENT'],landed:true,other:'editor',exits:2});
});

test('expanded API validates arguments, no-ops emit no extra view changes, and destroyed instances reject',async t => {
  const page = await setup(t,{fallback:true});
  const result = await page.evaluate(async () => {
    const codes = [];
    for (const value of [undefined,null,1,'true',{}]) try {await fsEditor.setExpanded(value);} catch(e) {codes.push(e.code);}
    fsViews = [];await fsEditor.setExpanded(false);await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const views = fsViews.length;fsEditor.destroy();try {await fsEditor.setExpanded(true);} catch(e) {codes.push(e.code);}
    return {codes,views};
  });
  assert.deepEqual(result,{codes:[...Array(5).fill('INVALID_ARGUMENT'),'DESTROYED'],views:0});
});
