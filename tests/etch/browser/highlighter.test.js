import {test} from 'node:test';
import assert from 'node:assert/strict';
import {useBrowser,collapseDemoSidebar} from './fixture.js';
const engine=process.env.ETCH_HIGHLIGHTER_BROWSER ?? 'chromium',fixture=useBrowser(engine);
const root=page=>page.locator('#highlight-card'),vp=page=>root(page).locator('.etch-viewport');
const settle=page=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
const save=page=>page.evaluate(()=>highlightEditor.save());
async function setup(t,{mobile=false,options={}}={}) {
  const context=await fixture.browser.newContext({viewport:{width:1200,height:850},hasTouch:mobile}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));t.after(async()=>{await context.close();assert.deepEqual(errors,[]);});
  await page.goto(fixture.server.origin+'/demo/');await collapseDemoSidebar(page);
  await page.evaluate(async({mobile,options})=>{
    const {createEtch}=await import('/etch.js'),card=document.createElement('div');card.id='highlight-card';card.style=mobile?'width:320px;height:240px':'width:900px;height:500px';document.body.prepend(card);
    window.highlightEditor=createEtch(card,options);window.highlightChanges=[];window.highlightErrors=[];highlightEditor.on('change',e=>highlightChanges.push(e));highlightEditor.on('error',e=>highlightErrors.push(e));
  },{mobile,options});await settle(page);return page;
}
async function begin(page,x=40,y=70) {await vp(page).scrollIntoViewIfNeeded();const b=await vp(page).boundingBox();await page.mouse.move(b.x+x,b.y+y);await page.mouse.down();return b;}
async function pixel(page,canvas,x,y) {return root(page).locator(`.etch-${canvas}`).evaluate((c,[x,y])=>[...c.getContext('2d').getImageData(x,y,1,1).data],[x,y]);}

for(const mobile of [false,true]) test(`Highlighter and pressure controls synchronize both surfaces and retain session-only preferences (${mobile?'mobile':'desktop'})`,async t=>{
  const page=await setup(t,{mobile}),card=root(page),quick=card.locator('.etch-quick-toolbar'),before=await save(page);
  await card.getByRole('button',{name:'Pen',exact:true}).click();await quick.getByRole('checkbox',{name:'Quick pressure width',exact:true}).uncheck();
  await card.getByRole('button',{name:'Toggle sidebar',exact:true}).click();assert.equal(await card.getByRole('checkbox',{name:'Pen pressure width',exact:true}).isChecked(),false);
  await card.getByRole('checkbox',{name:'Pen pressure width',exact:true}).check();assert.equal(await quick.getByRole('checkbox',{name:'Quick pressure width',exact:true}).isChecked(),true);
  await card.getByRole('checkbox',{name:'Pen pressure width',exact:true}).uncheck();await card.getByRole('checkbox',{name:'Draw with finger',exact:true}).uncheck();
  await card.getByRole('button',{name:'Highlighter',exact:true}).click();assert.equal(await quick.isVisible(),true);assert.equal(await card.getByRole('button',{name:'Highlighter properties',exact:true}).isVisible(),true);
  assert.equal(await card.getByRole('checkbox',{name:'Pen pressure width',exact:true}).isVisible(),false);assert.equal(await card.getByRole('checkbox',{name:'Draw with finger',exact:true}).isChecked(),false);
  assert.equal(await quick.getByRole('button',{name:'Stroke color #FDE047',exact:true}).getAttribute('aria-pressed'),'true');
  await quick.getByRole('button',{name:'Stroke width 24',exact:true}).click();await quick.getByRole('button',{name:'Stroke color #EC4899',exact:true}).click();
  await quick.getByRole('slider',{name:'Quick opacity percent',exact:true}).evaluate(el=>{el.value='60';el.dispatchEvent(new Event('input',{bubbles:true}));});
  assert.equal(await card.getByLabel('Highlighter width',{exact:true}).inputValue(),'24');assert.equal(await card.getByLabel('Highlighter color',{exact:true}).inputValue(),'#ec4899');assert.equal(await card.getByLabel('Highlighter opacity percent',{exact:true}).inputValue(),'60');
  await card.getByLabel('Highlighter opacity percent',{exact:true}).fill('25');await card.getByLabel('Highlighter opacity percent',{exact:true}).press('Tab');assert.equal(await quick.getByRole('slider',{name:'Quick opacity percent'}).inputValue(),'25');
  await card.getByLabel('Highlighter opacity percent',{exact:true}).fill('0');await card.getByLabel('Highlighter opacity percent',{exact:true}).press('Tab');assert.equal(await card.getByLabel('Highlighter opacity percent',{exact:true}).inputValue(),'25');
  await card.getByRole('button',{name:'Highlighter',exact:true}).click();assert.equal(await quick.isVisible(),false);
  await card.getByRole('button',{name:'Toggle sidebar',exact:true}).click();await vp(page).focus();await page.keyboard.press('k');assert.equal(await quick.isVisible(),true);
  await page.keyboard.press('p');assert.equal(await quick.getByRole('checkbox',{name:'Quick pressure width'}).isChecked(),false);await page.keyboard.press('k');
  assert.deepEqual(await page.evaluate(()=>highlightEditor.getToolSettings('highlighter')),{color:'#EC4899',width:24,opacity:0.25});assert.deepEqual(await save(page),before);assert.equal(await page.evaluate(()=>highlightEditor.canUndo()),false);
});

test('one highlight fills once through self-overlap; separate strokes build alpha; PNG/SVG/native/Undo agree',async t=>{
  const page=await setup(t);await page.evaluate(()=>{highlightEditor.setTool('highlighter');highlightEditor.setToolSettings('highlighter',{color:'#FFFF00',width:20,opacity:0.4});highlightEditor.setViewState({zoom:1,pan:[0,0]});});await settle(page);
  const before=await save(page),b=await begin(page);await page.mouse.move(b.x+220,b.y+70);await page.mouse.move(b.x+40,b.y+70);await settle(page);
  assert.deepEqual(await pixel(page,'live',100,70),[255,255,0,102]);assert.deepEqual(await pixel(page,'live',60,70),[255,255,0,102]);assert.deepEqual(await save(page),before);
  const exportAlpha=await page.evaluate(async()=>{const {blob}=await highlightEditor.exportPNG({bounds:{x:0,y:0,width:240,height:100},padding:0});const im=await createImageBitmap(blob),c=document.createElement('canvas');c.width=240;c.height=100;c.getContext('2d').drawImage(im,0,0);im.close();return c.getContext('2d').getImageData(100,70,1,1).data[3];});assert.equal(exportAlpha,0);
  const wet=await root(page).locator('.etch-live').evaluate(c=>c.toDataURL());await page.mouse.up();await settle(page);assert.equal(await root(page).locator('.etch-committed').evaluate(c=>c.toDataURL()),wet);
  const single=await save(page);assert.equal(single.layers[0].elements[0].type,'highlight');assert.equal(single.layers[0].elements[0].pressure,false);assert.ok(single.layers[0].elements[0].points.every(p=>p[2]===1));
  await begin(page);await page.mouse.move(b.x+220,b.y+70);await page.mouse.up();await settle(page);const overlap=await pixel(page,'committed',100,70);assert.deepEqual(overlap,[255,255,0,163]);
  const outputs=await page.evaluate(async()=>{
    const options={bounds:{x:0,y:0,width:240,height:100},padding:0},{blob}=await highlightEditor.exportPNG(options),{svg}=highlightEditor.exportSVG(options);
    const c=document.createElement('canvas');c.width=240;c.height=100;const ctx=c.getContext('2d'),read=()=>[...ctx.getImageData(100,70,1,1).data],im=await createImageBitmap(blob);ctx.drawImage(im,0,0);im.close();const png=read();
    const url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml'})),image=new Image();try{image.src=url;await image.decode();ctx.clearRect(0,0,240,100);ctx.drawImage(image,0,0);}finally{URL.revokeObjectURL(url);image.src='';}return {png,svg:read(),source:svg};
  });assert.deepEqual(outputs.png,overlap);assert.deepEqual(outputs.svg,overlap);assert.match(outputs.source,/opacity="0.4"/);
  const both=await save(page);await page.evaluate(()=>highlightEditor.undo());assert.deepEqual(await save(page),single);await page.evaluate(()=>highlightEditor.redo());assert.deepEqual(await save(page),both);
  await page.evaluate(async()=>highlightEditor.load(highlightEditor.save()));await settle(page);assert.deepEqual(await pixel(page,'committed',100,70),overlap);
  await page.evaluate(()=>{highlightEditor.setTool('pen');highlightEditor.setToolSettings('pen',{color:'#FF0000',width:10});});await page.mouse.click(b.x+100,b.y+70);await settle(page);assert.deepEqual(await pixel(page,'committed',100,70),[255,0,0,255]);
});

test('highlight previews retain painter order, selection/transforms/merge preserve alpha and eraser modes are explicit',async t=>{
  const page=await setup(t);await page.evaluate(async()=>{
    const e=highlightEditor,d=e.save();d.layers[0].id='lower';d.layers.push({id:'upper',name:'Upper',offset:[0,0],visible:true,locked:false,elements:[{id:'box',type:'rect',transform:[1,0,0,1,0,0],x:140,y:50,width:40,height:40,fill:'#123456',stroke:null,strokeWidth:0,lineJoin:'round',miterLimit:4}]});
    await e.load(d);e.setActiveLayer('lower');e.setTool('highlighter');e.setViewState({zoom:1,pan:[0,0]});
  });await settle(page);const b=await begin(page);await page.mouse.move(b.x+220,b.y+70);await settle(page);assert.deepEqual(await pixel(page,'live',160,70),[18,52,86,255]);await page.mouse.up();await settle(page);assert.deepEqual(await pixel(page,'committed',160,70),[18,52,86,255]);
  const before=await save(page),mark=before.layers[0].elements[0];await page.evaluate(()=>highlightEditor.setTool('select'));await page.mouse.click(b.x+100,b.y+70);assert.deepEqual(await page.evaluate(()=>highlightEditor.getSelection()),[mark.id]);
  await page.evaluate(()=>highlightEditor.rotateSelection());const rotated=(await save(page)).layers[0].elements[0];assert.deepEqual(rotated.points,mark.points);assert.equal(rotated.opacity,mark.opacity);await page.evaluate(()=>highlightEditor.undo());
  await page.evaluate(()=>highlightEditor.setTool('eraser'));await page.mouse.click(b.x+100,b.y+70);assert.deepEqual(await save(page),before);
  await page.evaluate(()=>highlightEditor.setToolSettings('eraser',{mode:'object'}));await page.mouse.click(b.x+100,b.y+70);assert.equal((await save(page)).layers[0].elements.length,0);await page.evaluate(()=>highlightEditor.undo());await settle(page);assert.deepEqual(await save(page),before);
  const pixels=await root(page).locator('.etch-committed').evaluate(c=>c.toDataURL());await page.evaluate(()=>{highlightEditor.setActiveLayer('upper');highlightEditor.mergeDown();});await settle(page);assert.equal(await root(page).locator('.etch-committed').evaluate(c=>c.toDataURL()),pixels);assert.equal((await save(page)).layers[0].elements[0].opacity,mark.opacity);
});

test('opacity/settings capture at gesture start; cancellation and point budgets preserve committed history',async t=>{
  const page=await setup(t);await page.evaluate(()=>highlightEditor.setTool('highlighter'));await settle(page);const before=await save(page),b=await begin(page);await page.mouse.move(b.x+120,b.y+70);
  await page.evaluate(()=>highlightEditor.setToolSettings('highlighter',{opacity:0.8,width:40}));await page.mouse.up();const after=await save(page);assert.equal(after.layers[0].elements[0].opacity,0.35);assert.equal(after.layers[0].elements[0].width,20);
  await begin(page);await page.mouse.move(b.x+200,b.y+70);await page.keyboard.press('Escape');await page.mouse.up();assert.deepEqual(await save(page),after);await page.evaluate(()=>highlightEditor.undo());assert.deepEqual(await save(page),before);
  const limited=await setup(t,{options:{limits:{points:1}}});await limited.evaluate(()=>highlightEditor.setTool('highlighter'));const empty=await save(limited),c=await begin(limited);await limited.mouse.move(c.x+120,c.y+70);await settle(limited);await limited.mouse.up();assert.deepEqual(await save(limited),empty);assert.equal(await limited.evaluate(()=>highlightEditor.canUndo()),false);assert.equal(await limited.evaluate(()=>highlightErrors[0].code),'LIMIT_EXCEEDED');
});

test('native highlight import/read-only load preserve alpha while editable SVG import stays restricted',async t=>{
  const page=await setup(t);await page.evaluate(()=>highlightEditor.setTool('highlighter'));const b=await begin(page);await page.mouse.move(b.x+150,b.y+70);await page.mouse.up();const native=await save(page);
  const result=await page.evaluate(async native=>{
    const before=highlightEditor.save(),svg=highlightEditor.exportSVG().svg;let svgCode;try{await highlightEditor.importSVG(svg);}catch(e){svgCode=e.code;}
    const unchanged=JSON.stringify(before)===JSON.stringify(highlightEditor.save());const {layerId}=await highlightEditor.importDocument(native);const inserted=highlightEditor.save().layers.find(l=>l.id===layerId).elements[0];
    return {svgCode,unchanged,opacity:inserted.opacity,type:inserted.type,id:inserted.id};
  },native);
  assert.equal(result.svgCode,'UNSUPPORTED_SVG_FEATURE');assert.equal(result.unchanged,true);assert.equal(result.type,'highlight');assert.equal(result.opacity,0.35);assert.notEqual(result.id,native.layers[0].elements[0].id);
  const ro=await setup(t,{options:{readOnly:true}});await ro.evaluate(async native=>highlightEditor.load(native),native);const before=await save(ro);
  assert.equal(await root(ro).getByRole('button',{name:'Highlighter',exact:true}).isDisabled(),true);await vp(ro).focus();await ro.keyboard.press('k');assert.equal(await ro.evaluate(()=>highlightEditor.getTool()),'hand');assert.deepEqual(await save(ro),before);
});

test('finger Highlighter draws uniformly, second touch cancels wet ink and finger-off navigates',{skip:engine!=='chromium'},async t=>{
  const page=await setup(t,{mobile:true}),cdp=await page.context().newCDPSession(page);await page.evaluate(()=>highlightEditor.setTool('highlighter'));await settle(page);const b=await vp(page).boundingBox();
  const p=(id,x,y)=>({id,x:b.x+x,y:b.y+y}),touch=(type,touchPoints)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints});
  await touch('touchStart',[p(1,30,50)]);await touch('touchMove',[p(1,130,50)]);await touch('touchEnd',[]);await settle(page);
  let marks=(await save(page)).layers[0].elements;assert.equal(marks.length,1);assert.equal(marks[0].pressure,false);assert.ok(marks[0].points.every(p=>p[2]===1));
  const before=await save(page);await touch('touchStart',[p(2,30,80)]);await touch('touchMove',[p(2,130,80)]);await touch('touchStart',[p(2,130,80),p(3,160,80)]);await touch('touchEnd',[]);await settle(page);assert.deepEqual(await save(page),before);
  await page.evaluate(()=>highlightEditor.setDrawWithTouch(false));await touch('touchStart',[p(4,30,110)]);await touch('touchMove',[p(4,100,110)]);await touch('touchEnd',[]);assert.deepEqual(await save(page),before);
});

test('stylus pressure off yields constant-width Pen and Highlighter, including low-pressure release',{skip:engine!=='chromium'},async t=>{
  const page=await setup(t),cdp=await page.context().newCDPSession(page),card=root(page);
  await card.getByRole('button',{name:'Pen',exact:true}).click();await card.locator('.etch-quick-toolbar').getByRole('checkbox',{name:'Quick pressure width'}).uncheck();await settle(page);
  const b=await vp(page).boundingBox();
  async function stroke(y) {for(const [type,x,buttons,force] of [['mousePressed',40,1,0.05],['mouseMoved',180,1,0.95],['mouseReleased',200,0,0]])await cdp.send('Input.dispatchMouseEvent',{type,x:b.x+x,y:b.y+y,button:'left',buttons,pointerType:'pen',force});await settle(page);}
  await stroke(50);let e=(await save(page)).layers[0].elements[0];assert.equal(e.pressure,false);assert.ok(e.points.every(p=>p[2]===1));
  await page.evaluate(()=>highlightEditor.setToolSettings('pen',{pressure:true}));await stroke(80);e=(await save(page)).layers[0].elements[1];assert.equal(e.pressure,true);assert.ok(e.points.some(p=>p[2]!==1));
  // Use keyboard to keep the quick row open, preserving viewport coordinates.
  await vp(page).focus();await page.keyboard.press('k');await settle(page);await stroke(110);e=(await save(page)).layers[0].elements[2];assert.equal(e.type,'highlight');assert.equal(e.pressure,false);assert.ok(e.points.every(p=>p[2]===1));
});
