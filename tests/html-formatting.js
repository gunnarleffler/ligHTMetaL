// Real-browser coverage for the compact native HTML formatting controls.
const assert = require('node:assert/strict');
module.exports = async function formattingChecks(page) {
  const viewportSize = page.viewportSize();
  await page.evaluate(() => {
    const host = document.createElement('div'); host.id='formatting-editor'; host.className='lightmetal'; document.body.append(host);
    window.__formatChanges=[];
    window.__formatEditor=lightmetal.init({element:host,actions:['headings','script','alignment','indentation','formatting','font','undo','redo','source'],onChange:html=>__formatChanges.push(html)});
  });
  const host=page.locator('#formatting-editor');
  const prepare=async (html='<p>Format these words</p>') => {
    await page.evaluate(html=>{
      const e=__formatEditor; e.setHTML(html); e.content.focus();
      const r=document.createRange();r.selectNodeContents(e.content.firstElementChild);
      const s=document.getSelection();s.removeAllRanges();s.addRange(r);__formatChanges.length=0;
    },html);
  };
  const open=async title=>{
    const button=host.getByRole('button',{name:title,exact:true});
    if (!await button.isVisible()) await host.getByRole('button',{name:'Overflow',exact:true}).click();
    await button.click();
  };
  const choose=async (title,label)=>{await open(title);await host.getByRole('menuitem',{name:label,exact:true}).or(host.getByRole('menuitemradio',{name:label,exact:true})).or(host.getByRole('menuitemcheckbox',{name:label,exact:true})).click();};
  const html=()=>page.evaluate(()=>__formatEditor.getHTML());
  assert.equal(await host.getByRole('button',{name:'Heading 2',exact:true}).count(),0);
  await page.evaluate(()=>document.getSelection().removeAllRanges());
  await open('Headings');
  assert.equal(await host.locator('.lightmetal-error').count(),0, 'no selection does not add a toolbar notice');
  for (let n=1;n<=6;n++) {
    await prepare(); await choose('Headings',`Heading ${n}`);
    assert.match(await html(),new RegExp(`<h${n}[^>]*>Format these words</h${n}>`));
    assert.equal(await page.evaluate(()=>__formatChanges.length),1);
    await host.getByRole('button',{name:'Undo',exact:true}).click();assert.equal(await html(),'<p>Format these words</p>');
    await host.getByRole('button',{name:'Redo',exact:true}).click();assert.match(await html(),new RegExp(`<h${n}`));
  }
  for (const [label,tag] of [['Superscript','sup'],['Subscript','sub']]) {
    await prepare();await choose('Superscript / Subscript',label);assert.match(await html(),new RegExp(`<${tag}[^>]*>`));
  }
  for (const [label,value] of [['Align left','left'],['Align center','center'],['Align right','right'],['Justify','justify']]) {
    await prepare();await choose('Text alignment',label);
    const alignment=await host.locator('.lightmetal-content > *').evaluate(node=>getComputedStyle(node).textAlign.replace(/^-moz-/,''));
    assert.ok(alignment===value || value==='left' && alignment==='start', `Expected ${value}, got ${alignment}`);
  }
  await prepare();await choose('Indentation','Indent');assert.notEqual(await html(),'<p>Format these words</p>');
  await choose('Indentation','Outdent');assert.equal(await host.locator('.lightmetal-content').textContent(),'Format these words');
  await prepare('<p><b>Format these words</b></p>');await choose('Formatting','Remove formatting');assert.equal(await host.locator('.lightmetal-content b,strong').count(),0);
  await prepare('<p><a href="https://example.com">Format these words</a></p>');await choose('Formatting','Unlink');assert.equal(await host.locator('.lightmetal-content a').count(),0);
  for (const [label,value,property,expected] of [['Font family','Georgia','fontFamily','Georgia'],['Font size','5','fontSize','24px']]) {
    await prepare();await open('Font and colors');await host.getByLabel(label,{exact:true}).selectOption(value);
    assert.ok((await host.locator('.lightmetal-content').evaluate((node,property)=>getComputedStyle(node.querySelector('font,span')||node.firstElementChild)[property],property)).includes(expected));
    assert.equal(await page.evaluate(()=>__formatChanges.length),1);
  }
  for (const [label,color] of [['Text color','#123456'],['Highlight color','#abcdef']]) {
    await prepare();await open('Font and colors');await host.getByLabel(label,{exact:true}).fill(color);
    await host.getByRole('button',{name:`Apply ${label.toLowerCase()}`,exact:true}).click();
    assert.equal(await page.evaluate(()=>__formatChanges.length),1);
    assert.notEqual(await html(),'<p>Format these words</p>');
    await host.getByRole('button',{name:'Undo',exact:true}).click();assert.equal(await html(),'<p>Format these words</p>');
  }
  await prepare();await open('Headings');await page.keyboard.press('End');assert.equal(await page.evaluate(()=>document.activeElement.textContent),'Heading 6');
  await page.keyboard.press('Escape');assert.equal(await host.getByRole('button',{name:'Headings',exact:true}).getAttribute('aria-expanded'),'false');
  assert.equal(await page.evaluate(()=>document.activeElement.getAttribute('aria-label')),'Headings');
  await page.keyboard.press('ArrowDown');await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');assert.match(await html(),/<h2/);
  await prepare();await open('Font and colors');await page.evaluate(()=>__formatEditor.setHTML('<p>Replacement</p>'));
  assert.equal(await host.getByRole('dialog',{name:'Font and colors'}).count(),0);assert.equal(await html(),'<p>Replacement</p>');
  await prepare();await open('Headings');
  await page.evaluate(()=>{
    const e=__formatEditor, button=document.querySelector('#formatting-editor [role="menuitemradio"]');
    e.content.firstElementChild.firstChild.data='Format these words';
    button.click();
  });
  assert.equal(await html(),'<p>Format these words</p>', 'same-text synchronous edits invalidate pending positions');
  assert.equal(await page.evaluate(()=>__formatChanges.length),0);
  await prepare();await open('Headings');
  await page.evaluate(()=>{const e=__formatEditor; e.content.firstElementChild.firstChild.data='Changed';});
  await host.getByRole('menu',{name:'Headings'}).waitFor({state:'hidden'});
  await prepare();await open('Font and colors');await page.evaluate(()=>__formatEditor.content.dispatchEvent(new CompositionEvent('compositionstart')));
  assert.equal(await host.getByRole('dialog',{name:'Font and colors'}).count(),0);
  await page.evaluate(()=>__formatEditor.content.dispatchEvent(new CompositionEvent('compositionend')));
  await host.getByRole('button',{name:'Source',exact:true}).click();
  for (const title of ['Headings','Undo','Redo','Font and colors']) assert.equal(await host.getByRole('button',{name:title,exact:true}).isDisabled(),true);
  await host.getByRole('button',{name:'Source',exact:true}).click();
  await page.setViewportSize({width:390,height:700});await prepare();await open('Headings');
  const box=await host.getByRole('menu',{name:'Headings'}).boundingBox();assert.ok(box.x>=0 && box.x+box.width<=390 && box.y+box.height<=700);
  await page.keyboard.press('Escape');
  await page.evaluate(()=>{window.__nativeShowPopover=HTMLElement.prototype.showPopover;HTMLElement.prototype.showPopover=undefined;});
  await prepare();await open('Headings');
  assert.equal(await host.getByRole('menu',{name:'Headings'}).getAttribute('popover'),null);
  await page.keyboard.press('Escape');
  await page.evaluate(()=>{HTMLElement.prototype.showPopover=__nativeShowPopover;});
  // Keep explicit individual-heading actions and application callbacks intact.
  await page.evaluate(()=>{
    __formatEditor.destroy();__formatEditor.destroy();
    window.__formatCustom=lightmetal.init({element:document.getElementById('formatting-editor'),actions:['heading1','heading2',{name:'headings',result:()=>{window.__customFormat=true;}}]});
  });
  assert.equal(await host.getByRole('button',{name:'Heading 1',exact:true}).count(),1);
  assert.equal(await host.getByRole('button',{name:'Heading 2',exact:true}).count(),1);
  await open('Headings');assert.equal(await page.evaluate(()=>__customFormat),true);
  await page.evaluate(()=>{__formatCustom.destroy();document.getElementById('formatting-editor').remove();});
  if (viewportSize) await page.setViewportSize(viewportSize);
};
if (require.main===module) (async()=>{
  const {chromium,firefox}=require('playwright');const {pathToFileURL}=require('node:url');const path=require('node:path');
  for(const [name,engine] of Object.entries({chromium,firefox})) {
    const browser=await engine.launch();try{const page=await browser.newPage();await page.goto(pathToFileURL(path.resolve(__dirname,'../examples/html.html')).href);await page.waitForFunction(()=>window.lightmetal);await module.exports(page);console.log(name+': compact HTML formatting, selection, native history, lifecycle and narrow layout: ok');}finally{await browser.close();}
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
