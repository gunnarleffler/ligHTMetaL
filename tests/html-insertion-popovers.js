// Link/Image forms exercise real native editing and browser history.
const assert = require('node:assert/strict');
const {chromium,firefox}=require('playwright');
const {pathToFileURL}=require('node:url');
const path=require('node:path');
(async()=>{
  for(const [name,engine] of Object.entries({chromium,firefox})) {
    const browser=await engine.launch();
    try {
      const page=await browser.newPage({viewport:{width:1100,height:800}});
      await page.goto(pathToFileURL(path.resolve(__dirname,'../examples/html.html')).href);
      await page.waitForFunction(()=>window.lightmetal);
      await page.evaluate(()=>{
        const host=document.createElement('div');host.id='insertion-test';host.className='lightmetal';document.body.prepend(host);
        window.changes=[];window.editor=lightmetal.init({element:host,rawMode:true,actions:['link','image','undo','redo','source','fullscreen'],onChange:html=>changes.push(html)});
      });
      const host=page.locator('#insertion-test');
      const toolbar=title=>host.getByRole('button',{name:title,exact:true});
      const dialog=()=>host.locator('.lightmetal-insertion-popup');
      const html=()=>page.evaluate(()=>editor.getHTML());
      const prepare=async(markup,selector='p',collapse=false)=>page.evaluate(({markup,selector,collapse})=>{
        editor.setHTML(markup);editor.content.focus();const r=document.createRange();r.selectNodeContents(editor.content.querySelector(selector));
        if(collapse)r.collapse(false);getSelection().removeAllRanges();getSelection().addRange(r);changes.length=0;
      },{markup,selector,collapse});
      const history=async key=>{await host.locator('.lightmetal-content').focus();await page.keyboard.press('Control+'+key);};
      await prepare('<p>Visit <strong>our</strong> <em>site</em></p>');
      await toolbar('Link').click();assert.equal(await dialog().getByLabel('Display Text',{exact:true}).inputValue(),'Visit our site');
      assert.ok(await dialog().getByRole('button',{name:'Insert',exact:true}).isDisabled());
      await dialog().getByLabel('URL',{exact:true}).fill('https://example.com');await dialog().getByRole('button',{name:'Cancel',exact:true}).click();
      assert.equal(await page.evaluate(()=>getSelection().toString()),'Visit our site','Cancel restores the original editor selection');
      await toolbar('Link').click();
      await dialog().getByLabel('URL',{exact:true}).fill('javascript:alert(1)');assert.ok(await dialog().getByRole('button',{name:'Insert',exact:true}).isDisabled());
      await dialog().getByLabel('URL',{exact:true}).fill('https://example.com');await dialog().getByLabel('Open in new tab').check();
      await dialog().getByRole('button',{name:'Insert',exact:true}).click();
      assert.equal(await host.locator('a strong').textContent(),'our');assert.equal(await host.locator('a em').textContent(),'site');
      assert.equal(await host.locator('a').getAttribute('rel'),'noopener noreferrer');assert.equal(await page.evaluate(()=>changes.length),1);
      await history('z');assert.equal(await html(),'<p>Visit <strong>our</strong> <em>site</em></p>');
      await history('y');assert.equal(await host.locator('a').count(),1);
      await prepare('<p>Hello <strong>world</strong></p>');await toolbar('Link').click();
      await dialog().getByLabel('URL',{exact:true}).fill('mailto:hello@example.com');await dialog().getByLabel('Display Text',{exact:true}).fill('Email us');
      await dialog().getByLabel('URL',{exact:true}).press('Enter');assert.equal(await host.locator('a').textContent(),'Email us');assert.equal(await host.locator('strong').count(),0);
      const existing='<p>Visit <a href="https://old.example" target="_blank" rel="nofollow noopener" data-note="keep"><strong>our</strong> <em>website</em></a>.</p>';
      await prepare(existing,'a strong',true);await toolbar('Link').click();
      assert.equal(await dialog().getAttribute('aria-label'),'Edit Link');assert.equal(await dialog().getByLabel('URL',{exact:true}).inputValue(),'https://old.example');
      await dialog().getByLabel('URL',{exact:true}).fill('https://new.example');await dialog().getByRole('button',{name:'Save',exact:true}).click();
      assert.equal(await host.locator('a a').count(),0);assert.equal(await host.locator('a strong').textContent(),'our');assert.equal(await host.locator('a').getAttribute('data-note'),'keep');
      assert.equal(await host.locator('a').getAttribute('rel'),'nofollow noopener noreferrer');assert.equal(await page.evaluate(()=>changes.length),1);
      await history('z');assert.equal(await html(),existing);
      await prepare(existing,'a em',true);await page.evaluate(()=>window.savedStrong=editor.content.querySelector('strong'));
      await toolbar('Link').click();await dialog().getByRole('button',{name:'Remove Link',exact:true}).click();
      assert.equal(await page.evaluate(()=>savedStrong===editor.content.querySelector('strong')),true,'native unlink preserves inline nodes');
      assert.equal(await html(),'<p>Visit <strong>our</strong> <em>website</em>.</p>');assert.equal(await page.evaluate(()=>changes.length),1);
      await history('z');assert.equal(await html(),existing);
      await prepare(existing,'a em',true);await toolbar('Link').click();await dialog().getByLabel('Display Text',{exact:true}).fill('new name');
      await dialog().getByLabel('Open in new tab').uncheck();await dialog().getByRole('button',{name:'Save',exact:true}).click();
      assert.equal(await host.locator('a').textContent(),'new name');assert.equal(await host.locator('a').getAttribute('target'),null);assert.equal((await host.locator('p').textContent()).replace(/\u00a0/g,' '),'Visit new name.');
      await prepare(existing,'a',true);await toolbar('Link').click();await page.evaluate(()=>editor.content.querySelector('a').remove());
      await dialog().waitFor({state:'hidden'});assert.equal(await host.locator('p').textContent(),'Visit .');
      await prepare('<p>Hello</p>','p',true);await page.evaluate(()=>getSelection().removeAllRanges());await toolbar('Link').click();
      await dialog().getByLabel('URL',{exact:true}).fill('https://example.com');await dialog().getByRole('button',{name:'Insert',exact:true}).click();assert.equal(await host.locator('a').textContent(),'https://example.com');
      await prepare('<p>AB</p>','p',true);await toolbar('Image').click();
      assert.equal(await dialog().getByRole('tab').allTextContents().then(items=>items.join(',')),'Upload,URL');
      await dialog().getByRole('tab',{name:'URL',exact:true}).click();await dialog().getByLabel('Image URL',{exact:true}).fill('javascript:alert(1)');
      assert.ok(await dialog().getByRole('button',{name:'Insert',exact:true}).isDisabled());
      await dialog().getByLabel('Image URL',{exact:true}).fill('https://example.com/image.png');await dialog().getByLabel('Alt Text',{exact:true}).fill('A "picture" <safe>');
      await dialog().getByRole('button',{name:'Insert',exact:true}).click();assert.equal(await host.locator('.lightmetal-content img').getAttribute('alt'),'A "picture" <safe>');assert.equal(await page.evaluate(()=>changes.length),1);
      await history('z');assert.equal(await host.locator('.lightmetal-content img').count(),0);
      await prepare('<p>AB</p>','p',true);await toolbar('Image').click();
      await dialog().locator('input[type=file]').setInputFiles({name:'bad.bmp',mimeType:'image/bmp',buffer:Buffer.from('bad')});
      await dialog().getByRole('alert').waitFor();assert.match(await dialog().getByRole('alert').textContent(),/not supported/);
      await page.keyboard.press('Escape');assert.equal(await dialog().count(),0);
      await prepare('<p>Before</p>','p',true);await toolbar('Image').click();
      await dialog().getByRole('tab',{name:'Upload',exact:true}).focus();await page.keyboard.press('ArrowRight');
      assert.equal(await dialog().getByRole('tab',{name:'URL',exact:true}).getAttribute('aria-selected'),'true');
      await page.setViewportSize({width:390,height:500});
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      const box=await dialog().boundingBox();assert.ok(box.x>=0&&box.y>=0&&box.x+box.width<=390&&box.y+box.height<=500);
      await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>document.activeElement.title),'Image');
      await page.setViewportSize({width:1100,height:800});
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      await page.evaluate(()=>{window.nativePopover=HTMLElement.prototype.showPopover;HTMLElement.prototype.showPopover=undefined;});
      await toolbar('Link').click();assert.equal(await dialog().getAttribute('popover'),null);await dialog().getByRole('button',{name:'Cancel',exact:true}).click();
      await page.evaluate(()=>{HTMLElement.prototype.showPopover=nativePopover;});
      await page.evaluate(()=>{
        const host=document.createElement('div');host.className='lightmetal';document.body.append(host);
        window.other=lightmetal.init({element:host,actions:['link','image']});other.setHTML('<p>Other editor</p>');other.content.focus();
        const r=document.createRange();r.selectNodeContents(other.content.firstChild);getSelection().removeAllRanges();getSelection().addRange(r);
      });
      await toolbar('Link').click();assert.equal(await dialog().getByLabel('Display Text',{exact:true}).inputValue(),'');
      await dialog().getByRole('button',{name:'Cancel',exact:true}).click();assert.equal(await page.evaluate(()=>other.getHTML()),'<p>Other editor</p>');
      await page.evaluate(()=>{const host=other.element;other.destroy();host.remove();});
      await prepare('<p>Fullscreen</p>','p',true);await toolbar('Fullscreen').click();await toolbar('Link').click();await page.keyboard.press('Escape');
      assert.equal(await host.evaluate(node=>node.classList.contains('lightmetal-fullscreen')),true);await page.keyboard.press('Escape');
      assert.equal(await host.evaluate(node=>node.classList.contains('lightmetal-fullscreen')),false);
      for(const skin of ['', 'bootstrap','material-classic','material-outline','frost','patina','sterling','substantial']) {
        if(skin)await page.addStyleTag({path:path.resolve(__dirname,'../dist/skins/'+skin+'.css')});
        const colors=[];
        for(const theme of ['light','dark']) {
          await host.evaluate((node,{skin,theme})=>{node.className='lightmetal lightmetal-html lightmetal-'+theme+(skin?' lightmetal-'+skin:'');},{skin,theme});
          await toolbar('Image').click();colors.push(await dialog().evaluate(node=>getComputedStyle(node).backgroundColor));await page.keyboard.press('Escape');
        }
        assert.notEqual(colors[0],colors[1],skin+': insertion surface follows theme');
      }
      await host.evaluate(node=>node.className='lightmetal lightmetal-html');
      // A pending upload uses its saved range, not a later selection. Cancel/replacement suppress late results.
      const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
      await page.evaluate(()=>{
        editor.destroy();editor=lightmetal.init({element:document.getElementById('insertion-test'),actions:['link','image','source'],images:{onInsert:()=>new Promise((resolve,reject)=>{window.finishUpload=resolve;window.failUpload=reject;})}});
      });
      const file={name:'one.png',mimeType:'image/png',buffer:Buffer.from(png.split(',')[1],'base64')};
      await prepare('<p>AB</p>','p',true);
      await page.evaluate(()=>{const r=document.createRange();r.setStart(editor.content.firstChild.firstChild,1);r.collapse(true);getSelection().removeAllRanges();getSelection().addRange(r);});
      await toolbar('Image').click();await dialog().locator('input[type=file]').setInputFiles(file);await dialog().getByRole('status').waitFor();
      await page.evaluate(()=>{const r=document.createRange();r.selectNodeContents(editor.content.firstChild);r.collapse(false);getSelection().removeAllRanges();getSelection().addRange(r);});
      await page.evaluate(png=>finishUpload(png),png);await dialog().waitFor({state:'hidden'});
      assert.equal(await host.locator('.lightmetal-content p').evaluate(node=>[...node.childNodes].map(n=>n.nodeType===3?n.data:n.tagName).join('|')),'A|IMG|B');
      await prepare('<p>Drop</p>','p',true);await toolbar('Image').click();
      await page.evaluate(png=>{
        const bytes=Uint8Array.from(atob(png.split(',')[1]),char=>char.charCodeAt(0));const transfer=new DataTransfer();
        transfer.items.add(new File([bytes],'drop.png',{type:'image/png'}));
        document.querySelector('#insertion-test [role="tabpanel"]').dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:transfer}));
      },png);
      await dialog().getByRole('status').waitFor();await page.evaluate(()=>failUpload(new Error('Upload refused')));
      await dialog().getByRole('alert').waitFor();assert.equal(await dialog().getByRole('alert').textContent(),'Upload refused');
      assert.equal(await host.locator('.lightmetal-content img').count(),0);await page.keyboard.press('Escape');
      for(const cancel of ['escape','replace','mutation','source','destroy']) {
        await prepare('<p>Unchanged</p>','p',true);await toolbar('Image').click();await dialog().locator('input[type=file]').setInputFiles(file);await dialog().getByRole('status').waitFor();
        if(cancel==='escape')await page.keyboard.press('Escape');
        else if(cancel==='replace')await page.evaluate(()=>editor.setHTML('<p>Replacement</p>'));
        else if(cancel==='mutation')await page.evaluate(()=>editor.content.firstChild.append(document.createTextNode('changed')));
        else if(cancel==='source')await toolbar('Source').click();
        else await page.evaluate(()=>editor.destroy());
        await page.evaluate(async png=>{finishUpload(png);await Promise.resolve();await Promise.resolve();},png);
        assert.equal(await host.locator('.lightmetal-content img').count(),0);
        if(cancel==='source')await toolbar('Source').click();
      }
      await page.evaluate(()=>{editor=lightmetal.init({element:document.getElementById('insertion-test'),actions:['image'],images:{allowURL:false,maxSize:1}});});
      await prepare('<p>Size limit</p>','p',true);await toolbar('Image').click();assert.equal(await dialog().getByRole('tab',{name:'URL',exact:true}).count(),0);
      await dialog().locator('input[type=file]').setInputFiles(file);await dialog().getByRole('alert').waitFor();assert.match(await dialog().getByRole('alert').textContent(),/limit/);
      await page.evaluate(()=>editor.destroy());
      console.log(name+': link insert/edit/remove, native Undo, validation, image URL/upload/drop and stale async cancellation: ok');
    }finally{await browser.close();}
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
