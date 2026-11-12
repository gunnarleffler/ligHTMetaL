// Focused real-browser checks for the HTML-only toolbar refresh.
const assert = require('node:assert/strict');
const {chromium,firefox}=require('playwright');
const {pathToFileURL}=require('node:url');
const path=require('node:path');
(async()=>{
  for (const [engineName,engine] of Object.entries({chromium,firefox})) {
    const browser=await engine.launch();
    try {
      const page=await browser.newPage({viewport:{width:1100,height:800}});
      await page.goto(pathToFileURL(path.resolve(__dirname,'../examples/html.html')).href);
      await page.waitForFunction(()=>window.lightmetal);
      await page.evaluate(()=>{
        const host=document.createElement('div'); host.id='refresh'; host.className='lightmetal'; host.style.width='1000px'; document.body.prepend(host);
        window.editor=lightmetal.init({element:host}); editor.setHTML('<p>Hello</p>');
      });
      const host=page.locator('#refresh'), bar=host.locator('.lightmetal-actionbar');
      const button=name=>host.getByRole('button',{name,exact:true});
      const open=async name=>{
        if (!await button(name).isVisible()) await button('More').click();
        await button(name).click();
      };
      const prepare=async()=>page.evaluate(()=>{
        editor.setHTML('<p>Hello</p>'); editor.content.focus();
        const r=document.createRange(); r.selectNodeContents(editor.content.firstChild); r.collapse(false);
        const s=getSelection(); s.removeAllRanges(); s.addRange(r);
      });
      await page.evaluate(()=>{editor.content.blur();getSelection().removeAllRanges();});
      const beforeOpen=await page.evaluate(()=>editor.getHTML());
      await open('Paragraph style');
      assert.ok(await host.getByRole('menu',{name:'Paragraph style'}).isVisible());
      assert.equal(await page.evaluate(()=>editor.getHTML()),beforeOpen,'opening without a caret never edits');
      await host.getByRole('menuitemradio',{name:'Heading 2',exact:true}).click();
      assert.match(await page.evaluate(()=>editor.getHTML()),/<h2/,'no-caret commands use the end of their own editor');
      assert.equal(await host.locator('.lightmetal-content').textContent(),'Hello');
      await prepare();
      for(const name of ['Table','Image','Code','Source','Fullscreen']) assert.ok(await bar.getByRole('button',{name,exact:true}).isVisible());
      await open('Paragraph style'); await host.getByRole('menuitemradio',{name:'Heading 3',exact:true}).click();
      assert.match(await page.evaluate(()=>editor.getHTML()),/<h3/);
      await open('Undo'); assert.equal(await page.evaluate(()=>editor.getHTML()),'<p>Hello</p>');
      await prepare(); await open('Code'); assert.match(await page.evaluate(()=>editor.getHTML()),/<pre/);
      await open('Undo'); assert.equal(await page.evaluate(()=>editor.getHTML()),'<p>Hello</p>');
      await prepare(); await open('Lists'); await host.getByRole('menuitemradio',{name:'Bulleted list',exact:true}).click();
      assert.equal(await host.locator('.lightmetal-content ul').count(),1);
      await prepare();
      await page.evaluate(()=>{const r=document.createRange();r.selectNodeContents(editor.content.firstChild);getSelection().removeAllRanges();getSelection().addRange(r);});
      await open('Text options'); await host.getByRole('button',{name:'Superscript',exact:true}).click();
      assert.equal(await host.locator('.lightmetal-content sup').count(),1);
      await prepare(); await open('Insert');
      await host.getByRole('menuitem',{name:'😀 Grinning face',exact:true}).click();
      assert.equal(await host.locator('.lightmetal-content').textContent(),'Hello😀');
      await open('Undo'); assert.equal(await host.locator('.lightmetal-content').textContent(),'Hello');
      for(const width of [390,240,110,40]) {
        await page.evaluate(width=>document.getElementById('refresh').style.width=width+'px',width);
        await page.waitForFunction(()=>document.querySelector('#refresh .lightmetal-actionbar').scrollWidth<=document.querySelector('#refresh .lightmetal-actionbar').clientWidth);
        assert.ok(await button('More').isVisible());
        await prepare(); await open('Paragraph style');
        const box=await host.getByRole('menu',{name:'Paragraph style'}).boundingBox();
        assert.ok(box.x>=0 && box.x+box.width<=1100 && box.y>=0 && box.y+box.height<=800);
        await page.keyboard.press('Escape');
        const displaced=await host.getByRole('button',{name:'Paragraph style',exact:true,includeHidden:true}).evaluate(node=>!!node.closest('.lightmetal-overflow'));
        assert.equal(await page.evaluate(()=>document.activeElement.getAttribute('aria-label')),displaced?'More':'Paragraph style');
        await open('Source'); assert.ok(await host.locator('textarea').isVisible());
        await open('Source');
      }
      // Displaced Table retains its menu, picker, selection and manual insertion.
      await prepare(); await open('Table');
      await host.getByRole('menuitem',{name:'Insert Table…',exact:true}).click();
      await host.getByRole('button',{name:'Insert',exact:true}).click();
      assert.equal(await host.locator('.lightmetal-content table').count(),1);
      await page.evaluate(()=>{
        editor.destroy(); window.customCalls=[];
        editor=lightmetal.init({element:document.getElementById('refresh'),actions:Array.from({length:8},(_,i)=>({title:'Custom '+i,icon:String(i),result:()=>{customCalls.push(i);}}))});
        editor.content.focus();
      });
      await button('Overflow').click();
      const labels=await host.locator('.lightmetal-overflow button').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('aria-label')));
      assert.deepEqual(labels,[...labels].sort());
      await button('Custom 7').click(); assert.deepEqual(await page.evaluate(()=>customCalls),[7]);
      await page.evaluate(()=>editor.destroy());
      assert.equal(await host.locator('.lightmetal-overflow').count(),0);
      console.log(engineName+': HTML refresh, emoji/native undo, responsive overflow, displaced menus and custom callbacks: ok');
    } finally {await browser.close();}
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
