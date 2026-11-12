const assert = require('node:assert/strict');
module.exports = async function fullscreenChecks(page) {
  const originalViewport=page.viewportSize();
  await page.evaluate(() => {
    const host=document.createElement('div');host.id='html-fullscreen-test';host.className='lightmetal app-owned';
    host.style.cssText='width:650px;height:350px;position:relative;margin:15px;--app-owned:1';
    document.body.append(host);window.__htmlFullChanges=[];
    window.__htmlFull=lightmetal.init({element:host,onChange:html=>__htmlFullChanges.push(html)});
    __htmlFull.setHTML('<p>Keep this selection</p>');__htmlFullChanges.length=0;
    window.__htmlFullNodes=[__htmlFull.content,__htmlFull.source];
    window.__htmlFullStyle=host.getAttribute('style');
  });
  const host=page.locator('#html-fullscreen-test');
  const settle=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const toggle=async()=>{await host.getByRole('button',{name:'Fullscreen',exact:true}).click();await settle();};
  const full=()=>host.evaluate(node=>node.classList.contains('lightmetal-fullscreen'));
  const selection=()=>page.evaluate(()=>document.getSelection().toString());
  const select=()=>page.evaluate(()=>{
    const content=__htmlFull.content;content.focus();
    const node=content.firstElementChild.firstChild;
    document.getSelection().setBaseAndExtent(node,14,node,5);
  });
  const assertViewport=async()=>{
    const rect=await host.boundingBox(),viewport=page.viewportSize();
    assert.ok(Math.abs(rect.x)<1&&Math.abs(rect.y)<1&&Math.abs(rect.width-viewport.width)<1&&Math.abs(rect.height-viewport.height)<1,JSON.stringify({rect,viewport}));
  };
  await select();const before=await selection();
  await toggle();assert.equal(await full(),true);await assertViewport();assert.equal(await selection(),before);
  assert.equal(await host.getByRole('button',{name:'Fullscreen',exact:true}).getAttribute('aria-pressed'),'true');
  assert.equal(await page.evaluate(()=>__htmlFullChanges.length),0);
  assert.equal(await page.evaluate(()=>__htmlFull.content===__htmlFullNodes[0]&&__htmlFull.source===__htmlFullNodes[1]),true);
  // Popup Escape wins; a second Escape exits fullscreen.
  await host.getByRole('button',{name:'Paragraph style',exact:true}).click();await page.keyboard.press('Escape');assert.equal(await full(),true);
  await host.getByRole('button',{name:'Table',exact:true}).click();await page.keyboard.press('Escape');assert.equal(await full(),true);
  await page.keyboard.press('Escape');assert.equal(await full(),false);assert.equal(await selection(),before);
  assert.equal(await host.getAttribute('style'),await page.evaluate(()=>__htmlFullStyle));
  assert.equal(await page.evaluate(()=>document.documentElement.classList.contains('lightmetal-page-fullscreen')),false);
  // Live editing survives expansion and Undo/Redo in either layout.
  await page.evaluate(()=>{__htmlFull.setHTML('<p>Native history</p>');__htmlFull.content.focus();const range=document.createRange();range.selectNodeContents(__htmlFull.content);range.collapse(false);const s=document.getSelection();s.removeAllRanges();s.addRange(range);});
  await page.keyboard.type(' works');const edited=await page.evaluate(()=>__htmlFull.getHTML());
  await toggle();await page.keyboard.press('Control+z');assert.equal(await host.locator('.lightmetal-content').textContent(),'Native history');
  await page.keyboard.press('Control+y');assert.equal(await page.evaluate(()=>__htmlFull.getHTML()),edited);
  await toggle();assert.equal(await page.evaluate(()=>__htmlFull.getHTML()),edited);
  // Source has its own native textarea selection/history; never assign its value on a view toggle.
  await host.getByRole('button',{name:'Source',exact:true}).click();
  await page.evaluate(()=>{__htmlFull.source.focus();__htmlFull.source.setSelectionRange(0,4,'backward');__htmlFullChanges.length=0;});
  const sourceBefore=await page.evaluate(()=>({value:__htmlFull.source.value,start:__htmlFull.source.selectionStart,end:__htmlFull.source.selectionEnd,direction:__htmlFull.source.selectionDirection}));
  await toggle();await assertViewport();assert.equal(await host.locator('textarea').isVisible(),true);assert.equal(await host.locator('[contenteditable]').isVisible(),false);
  assert.deepEqual(await page.evaluate(()=>({value:__htmlFull.source.value,start:__htmlFull.source.selectionStart,end:__htmlFull.source.selectionEnd,direction:__htmlFull.source.selectionDirection})),sourceBefore);
  assert.equal(await page.evaluate(()=>__htmlFullChanges.length),0);
  await page.keyboard.press('End');await page.keyboard.type(' source');const sourceEdited=await host.locator('textarea').inputValue();
  await toggle();await page.keyboard.press('Control+z');assert.equal(await host.locator('textarea').inputValue(),sourceBefore.value,JSON.stringify(await page.evaluate(()=>({active:document.activeElement.className,undo:document.queryCommandEnabled('undo'),selected:[__htmlFull.source.selectionStart,__htmlFull.source.selectionEnd]}))));
  await page.keyboard.press('Control+y');assert.equal(await host.locator('textarea').inputValue(),sourceEdited);
  // Keyboard toggles must retain Source history even after the toolbar takes focus.
  await host.getByRole('button',{name:'Fullscreen',exact:true}).focus();await page.keyboard.press('Enter');await settle();
  await page.keyboard.press('End');await page.keyboard.type(' keyboard');const keyboardEdited=await host.locator('textarea').inputValue();
  await host.getByRole('button',{name:'Fullscreen',exact:true}).focus();await page.keyboard.press('Enter');await settle();
  await page.keyboard.press('Control+z');assert.notEqual(await host.locator('textarea').inputValue(),keyboardEdited);
  await page.keyboard.press('Control+y');assert.equal(await host.locator('textarea').inputValue(),keyboardEdited);
  // Switching Source/visual inside fullscreen preserves the view and fills its writing area.
  await toggle();await host.getByRole('button',{name:'Source',exact:true}).click();await settle();await assertViewport();
  assert.equal(await full(),true);assert.equal(await host.locator('[contenteditable]').isVisible(),true);
  await host.getByRole('button',{name:'Source',exact:true}).click();await toggle();
  // Escape during composition must not close the view.
  await toggle();await page.evaluate(()=>__htmlFull.source.dispatchEvent(new CompositionEvent('compositionstart')));
  await page.keyboard.press('Escape');assert.equal(await full(),true);
  await page.evaluate(()=>__htmlFull.source.dispatchEvent(new CompositionEvent('compositionend')));
  await page.keyboard.press('Escape');assert.equal(await full(),false);
  await host.getByRole('button',{name:'Source',exact:true}).click();
  // Narrow layouts and all skins retain viewport geometry.
  for (const skin of ['', 'bootstrap','material-classic','material-outline','frost','patina','sterling','substantial']) {
    if (skin) await page.addStyleTag({url:new URL(`../dist/skins/${skin}.css`,page.url()).href});
    await host.evaluate((node,skin)=>{for(const name of ['bootstrap','material-classic','material-outline','frost','patina','sterling','substantial'])node.classList.toggle('lightmetal-'+name,name===skin);},skin);
    await page.setViewportSize({width:390,height:600});await toggle();await assertViewport();await toggle();
  }
  // Restore the exact page and writing scroll offsets after exiting.
  await page.evaluate(()=>{
    __htmlFull.setHTML('<p>Line</p>'.repeat(100));__htmlFull.content.focus();
    __htmlFull.content.scrollTop=250;window.scrollTo(0,150);
    window.__htmlFullScroll={top:__htmlFull.content.scrollTop,x:scrollX,y:scrollY};
  });
  // Invoke without Playwright scrolling the offscreen trigger into view first.
  await host.getByRole('button',{name:'Fullscreen',exact:true}).evaluate(button=>button.click());await page.keyboard.press('Escape');
  assert.deepEqual(await page.evaluate(()=>({top:__htmlFull.content.scrollTop,x:scrollX,y:scrollY})),await page.evaluate(()=>__htmlFullScroll));
  // Keyboard activation, resizing, and page scroll containment.
  await host.getByRole('button',{name:'Fullscreen',exact:true}).focus();await page.keyboard.press('Enter');await settle();
  await page.setViewportSize({width:500,height:700});await settle();await assertViewport();
  const pageScroll=await page.evaluate(()=>({x:scrollX,y:scrollY}));
  await host.getByRole('button',{name:'Fullscreen',exact:true}).hover();await page.mouse.wheel(0,500);await settle();
  assert.deepEqual(await page.evaluate(()=>({x:scrollX,y:scrollY})),pageScroll);
  await page.keyboard.press('Escape');assert.equal(await full(),false);
  // At most one HTML editor in this document owns fullscreen.
  await page.evaluate(()=>{const other=document.createElement('div');other.id='html-fullscreen-other';other.className='lightmetal';document.body.append(other);window.__htmlFullOther=lightmetal.init({element:other});});
  await toggle();await page.locator('#html-fullscreen-other').getByRole('button',{name:'Fullscreen',exact:true}).evaluate(button=>button.click());
  assert.equal(await full(),false);assert.equal(await page.locator('#html-fullscreen-other').evaluate(node=>node.classList.contains('lightmetal-fullscreen')),true);
  await page.evaluate(()=>{__htmlFull.destroy();__htmlFullOther.destroy();__htmlFullOther.destroy();});
  assert.equal(await page.evaluate(()=>document.documentElement.classList.contains('lightmetal-page-fullscreen')),false);
  assert.equal(await page.locator('#html-fullscreen-other').getAttribute('style'),null);
  assert.equal(await host.getAttribute('style'),await page.evaluate(()=>__htmlFullStyle));
  assert.equal(await host.evaluate(node=>node.classList.contains('app-owned')&&!node.classList.contains('lightmetal-html')),true);
  // A whole editor inside an iframe fills only that document. Use minified assets.
  if (page.url().startsWith('http')) {
    const assets={js:new URL('../dist/lightmetal.min.js',page.url()).href,css:new URL('../dist/lightmetal.min.css',page.url()).href};
    await page.evaluate(({js,css})=>{
      const frame=document.createElement('iframe');frame.id='html-fullscreen-frame';frame.style.cssText='width:420px;height:340px;border:0';
      frame.srcdoc=`<!doctype html><link rel="stylesheet" href="${css}"><div class="lightmetal" id="editor"></div><script src="${js}"></script><script>window.editor=lightmetal.init({element:document.getElementById('editor')});<\/script>`;
      document.body.append(frame);
    },assets);
    const frame=page.frameLocator('#html-fullscreen-frame');
    await frame.getByRole('button',{name:'Fullscreen',exact:true}).click();
    assert.equal(await frame.locator('#editor').evaluate(node=>{const r=node.getBoundingClientRect();return Math.abs(r.x)<1&&Math.abs(r.y)<1&&Math.abs(r.width-innerWidth)<1&&Math.abs(r.height-innerHeight)<1;}),true);
    assert.equal(await page.evaluate(()=>document.documentElement.classList.contains('lightmetal-page-fullscreen')),false);
    await frame.locator('#editor').evaluate(()=>window.editor.destroy());
    await page.locator('#html-fullscreen-frame').evaluate(frame=>frame.remove());
  }
  // Explicit action arrays may omit Fullscreen or replace its callback.
  await page.evaluate(()=>{window.__htmlFull=lightmetal.init({element:document.getElementById('html-fullscreen-test'),actions:['bold']});});
  assert.equal(await host.getByRole('button',{name:'Fullscreen',exact:true}).count(),0);
  await page.evaluate(()=>{__htmlFull.destroy();window.__htmlFull=lightmetal.init({element:document.getElementById('html-fullscreen-test'),actions:[{name:'fullscreen',result:()=>{window.__customHTMLFullscreen=true;}}]});});
  await toggle();assert.equal(await full(),false);assert.equal(await page.evaluate(()=>__customHTMLFullscreen),true);
  await page.evaluate(()=>__htmlFull.destroy());
  // A preexisting page class belongs to the application; teardown leaves it alone.
  await page.evaluate(()=>{
    document.documentElement.classList.add('lightmetal-page-fullscreen');
    window.__htmlFull=lightmetal.init({element:document.getElementById('html-fullscreen-test'),actions:['fullscreen']});
  });
  await toggle();await page.evaluate(()=>__htmlFull.destroy());
  assert.equal(await page.evaluate(()=>document.documentElement.classList.contains('lightmetal-page-fullscreen')),true);
  await page.evaluate(()=>{document.documentElement.classList.remove('lightmetal-page-fullscreen');document.getElementById('html-fullscreen-test').remove();document.getElementById('html-fullscreen-other').remove();});
  if(originalViewport)await page.setViewportSize(originalViewport);
};
if(require.main===module)(async()=>{
  const {chromium,firefox}=require('playwright');const {createDevServer}=require('../examples/server');
  const server=createDevServer({log:()=>{}});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{for(const [name,engine]of Object.entries({chromium,firefox})){
    const browser=await engine.launch();try{const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}/examples/html.html`);await page.waitForFunction(()=>window.lightmetal);await module.exports(page);console.log(name+': HTML fullscreen, visual/Source history, selection, popups, ownership, skins and teardown: ok');}finally{await browser.close();}
  }}finally{await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
