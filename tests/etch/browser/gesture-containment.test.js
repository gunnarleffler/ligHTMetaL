import {test} from 'node:test';
import assert from 'node:assert/strict';
import {useBrowser,collapseDemoSidebar} from './fixture.js';
const engine=process.env.ETCH_GESTURE_BROWSER ?? 'chromium';
const runtime = useBrowser(engine);
const settle=page=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
async function setup(t) {
  const {browser,server} = runtime;
  const context=await browser.newContext({viewport:{width:390,height:700},hasTouch:true}),page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));t.after(async()=>{await context.close();assert.deepEqual(errors,[]);});
  await page.goto(server.origin+'/demo/');await collapseDemoSidebar(page);
  await page.evaluate(async()=>{
    const {createEtch}=await import('/etch.js'),card=document.createElement('div');card.id='gesture-card';card.style='width:320px;height:240px';document.body.prepend(card);
    const outside=document.createElement('input');outside.id='gesture-outside';document.body.prepend(outside);
    const e=window.gestureEditor=createEtch(card);e.setTool('hand');window.gestureRoot=card.querySelector('.etch');window.gestureViewport=card.querySelector('.etch-viewport');window.nativeGestureRequests=0;
    gestureRoot.requestFullscreen=()=>{nativeGestureRequests++;throw new Error('Touch devices must not request native fullscreen');};
    window.touchEvent=(target,type,x=50,y=50,count=1,cancelable=true)=>{
      const event=new Event(type,{bubbles:true,cancelable}),touches=['touchend','touchcancel'].includes(type)?[]:Array.from({length:count},(_,i)=>({identifier:i,clientX:x+i*20,clientY:y+i*20,target}));
      Object.defineProperty(event,'touches',{value:touches});target.dispatchEvent(event);return event.defaultPrevented;
    };
    window.gestureEvent=(target,type)=>{const event=new Event(type,{bubbles:true,cancelable:true});target.dispatchEvent(event);return event.defaultPrevented;};
  });await settle(page);return page;
}

test('canvas browser gestures are suppressed locally without swallowing taps, native controls or host zoom',async t=>{
  const page=await setup(t),result=await page.evaluate(()=>{
    const root=gestureRoot,v=gestureViewport,outside=document.querySelector('#gesture-outside'),range=document.createElement('input');range.type='range';root.append(range);
    const start=touchEvent(v,'touchstart'),move=touchEvent(v,'touchmove',60,70),end=touchEvent(v,'touchend');
    const gestures=['gesturestart','gesturechange','gestureend'].map(name=>gestureEvent(v,name));
    const hostGesture=gestureEvent(outside,'gesturestart'),toolbarGesture=gestureEvent(root.querySelector('.etch-toolbar'),'gesturestart');
    touchEvent(range,'touchstart');const controlMove=touchEvent(range,'touchmove',80,50);touchEvent(range,'touchend');
    touchEvent(v,'touchstart',50,50,2);const pinch=touchEvent(v,'touchmove',70,70,2);touchEvent(v,'touchend');
    return {start,move,end,gestures,hostGesture,toolbarGesture,controlMove,pinch,canvasTouch:getComputedStyle(v).touchAction,rangeTouch:getComputedStyle(range).touchAction,rootOverscroll:getComputedStyle(root).overscrollBehavior};
  });
  assert.deepEqual(result,{start:false,move:true,end:false,gestures:[true,true,true],hostGesture:false,toolbarGesture:false,controlMove:false,pinch:true,canvasTouch:'none',rangeTouch:'none',rootOverscroll:'none'});
});

test('native UI scrollports work internally but cannot chain vertical/horizontal boundary drags to the page',async t=>{
  const page=await setup(t),result=await page.evaluate(()=>{
    const scroller=document.createElement('div');scroller.style='height:60px;width:100px;overflow:auto';const content=document.createElement('div');content.style='height:400px;width:400px';scroller.append(content);gestureRoot.append(scroller);
    const drag=(x,y,dx,dy)=>{touchEvent(content,'touchstart',x,y);const blocked=touchEvent(content,'touchmove',x+dx,y+dy);touchEvent(content,'touchend');return blocked;};
    scroller.scrollTop=100;const verticalInside=drag(50,50,0,-10);scroller.scrollTop=0;const verticalStart=drag(50,50,0,10);scroller.scrollTop=scroller.scrollHeight;const verticalEnd=drag(50,50,0,-10);
    scroller.scrollLeft=100;const horizontalInside=drag(50,50,-10,0);scroller.scrollLeft=0;const horizontalStart=drag(50,50,10,0);scroller.scrollLeft=scroller.scrollWidth;const horizontalEnd=drag(50,50,-10,0);
    scroller.style.direction='rtl';scroller.scrollLeft=-100;const rtlInside=drag(50,50,-10,0);scroller.scrollLeft=0;const rtlEnd=drag(50,50,-10,0);scroller.scrollLeft=-scroller.scrollWidth;const rtlStart=drag(50,50,10,0);
    const toolbar=gestureRoot.querySelector('.etch-toolbar-scroll');touchEvent(toolbar,'touchstart');const toolbarVertical=touchEvent(toolbar,'touchmove',50,90);touchEvent(toolbar,'touchend');
    return {verticalInside,verticalStart,verticalEnd,horizontalInside,horizontalStart,horizontalEnd,rtlInside,rtlEnd,rtlStart,toolbarVertical,toolbarTouch:getComputedStyle(toolbar).touchAction,toolbarOverscroll:getComputedStyle(toolbar).overscrollBehavior};
  });
  assert.deepEqual(result,{verticalInside:false,verticalStart:true,verticalEnd:true,horizontalInside:false,horizontalStart:true,horizontalEnd:true,rtlInside:false,rtlEnd:true,rtlStart:true,toolbarVertical:true,toolbarTouch:'pan-x',toolbarOverscroll:'none'});
});

for(const destroy of [false,true]) test(`touch expansion avoids native fullscreen, pins the page and restores host styles/scroll on ${destroy?'destroy':'exit'}`,async t=>{
  const page=await setup(t);await page.evaluate(()=>{
    const html=document.documentElement,body=document.body;
    html.style.setProperty('overflow-x','scroll','important');html.style.setProperty('overscroll-behavior','contain');html.style.scrollBehavior='smooth';
    body.style.setProperty('position','relative','important');body.style.setProperty('top','7px','important');body.style.left='3px';body.style.width='calc(100% - 16px)';body.style.setProperty('overflow','auto','important');body.style.overscrollBehavior='contain';
    window.managedStyles=()=>[html,body].map(el=>['overflow-x','overflow-y','overscroll-behavior-x','overscroll-behavior-y','position','top','left','width'].map(name=>[name,el.style.getPropertyValue(name),el.style.getPropertyPriority(name)]));
    window.originalGestureStyles=managedStyles();window.scrollTo({top:250,left:0,behavior:'instant'});document.querySelector('#gesture-outside').focus({preventScroll:true});window.originalGestureScroll=[scrollX,scrollY];
  });
  await page.evaluate(()=>gestureEditor.setExpanded(true));await settle(page);
  const during=await page.evaluate(()=>({native:nativeGestureRequests,expanded:gestureEditor.getViewState().expanded,body:getComputedStyle(document.body).position,top:document.body.style.top,expectedTop:`${-originalGestureScroll[1]}px`,htmlOverflow:getComputedStyle(document.documentElement).overflowY,bodyOverflow:getComputedStyle(document.body).overflowY,gesture:gestureEvent(gestureRoot.querySelector('.etch-toolbar'),'gesturestart')}));
  assert.deepEqual(during,{native:0,expanded:true,body:'fixed',top:during.expectedTop,expectedTop:during.expectedTop,htmlOverflow:'hidden',bodyOverflow:'hidden',gesture:true});
  const box=await page.locator('#gesture-card .etch').boundingBox();assert.deepEqual(box,{x:0,y:0,width:390,height:700});
  const after=await page.evaluate(async destroy=>{if(destroy)gestureEditor.destroy();else await gestureEditor.setExpanded(false);return {styles:managedStyles(),expected:originalGestureStyles,scroll:[scrollX,scrollY],expectedScroll:originalGestureScroll,focus:document.activeElement.id,removed:!document.querySelector('#gesture-card .etch')};},destroy);
  assert.deepEqual(after.styles,after.expected);assert.deepEqual(after.scroll,after.expectedScroll);assert.equal(after.focus,'gesture-outside');assert.equal(after.removed,destroy);
  if(!destroy){assert.equal(await page.evaluate(()=>gestureEditor.getViewState().expanded),false);await page.evaluate(()=>gestureEditor.destroy());}
  assert.equal(await page.evaluate(()=>gestureEvent(gestureRoot,'gesturestart')),false);
});

test('touch expansion still scrolls Layers/properties and opens controls without changing saved content',async t=>{
  const page=await setup(t);await page.evaluate(async()=>{for(let i=0;i<25;i++)gestureEditor.createLayer();gestureEditor.setTool('pen');await gestureEditor.setExpanded(true);});
  const card=page.locator('#gesture-card .etch');await card.getByRole('button',{name:'Toggle sidebar',exact:true}).click();await card.getByRole('button',{name:'Pen',exact:true}).click();await settle(page);
  const before=await page.evaluate(()=>JSON.stringify(gestureEditor.save()));const result=await page.evaluate(()=>{
    const layers=gestureRoot.querySelector('.etch-layers'),props=gestureRoot.querySelector('.etch-properties-content');
    layers.scrollTop=layers.scrollHeight/2;touchEvent(layers,'touchstart');const layerMove=touchEvent(layers,'touchmove',50,40);touchEvent(layers,'touchend');
    props.scrollTop=0;touchEvent(props,'touchstart');const boundary=touchEvent(props,'touchmove',50,80);touchEvent(props,'touchend');
    return {layerMove,boundary,layerScrollable:layers.scrollHeight>layers.clientHeight,propsOverscroll:getComputedStyle(props).overscrollBehavior};
  });assert.deepEqual(result,{layerMove:false,boundary:true,layerScrollable:true,propsOverscroll:'none'});
  await card.getByRole('button',{name:'Export',exact:true}).click();assert.equal(await card.getByRole('button',{name:'Export PNG',exact:true}).isVisible(),true);await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>gestureEditor.getViewState().expanded),true);assert.equal(await page.evaluate(()=>JSON.stringify(gestureEditor.save())),before);
});

test('touch fullscreen ownership handoff retains page locking until the last owner exits',async t=>{
  const page=await setup(t),result=await page.evaluate(async()=>{
    const {createEtch}=await import('/etch.js'),host=document.createElement('div');host.style='width:320px;height:240px';document.body.prepend(host);const other=createEtch(host);
    document.querySelector('#gesture-outside').focus();const scroll=[scrollX,scrollY];await gestureEditor.setExpanded(true);await other.setExpanded(true);
    const handedOff=!gestureEditor.getViewState().expanded && other.getViewState().expanded;gestureEditor.destroy();const stillLocked=document.body.style.position==='fixed';other.destroy();host.remove();
    return {handedOff,stillLocked,position:document.body.style.position,bodyOverflow:document.body.style.overflow,htmlOverflow:document.documentElement.style.overflow,scroll:[scrollX,scrollY],expected:scroll,focus:document.activeElement.id};
  });assert.deepEqual(result,{handedOff:true,stillLocked:true,position:'',bodyOverflow:'',htmlOverflow:'',scroll:result.expected,expected:result.expected,focus:'gesture-outside'});
});

test('real touch canvas pan/pinch, toolbar scrolling and native sliders stay inside the editor',{skip:engine!=='chromium'?'CDP touch dispatch is Chromium-only':false},async t=>{
  const page=await setup(t),cdp=await page.context().newCDPSession(page);
  const send=(type,points)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points.map(([x,y],i)=>({id:i+1,x,y,radiusX:3,radiusY:3,force:1}))});
  async function swipe(from,to){await send('touchStart',[from]);for(let i=1;i<=6;i++){await send('touchMove',[[from[0]+(to[0]-from[0])*i/6,from[1]+(to[1]-from[1])*i/6]]);await settle(page);}await send('touchEnd',[]);await settle(page);}
  const b=await page.locator('#gesture-card .etch-viewport').boundingBox(),initial=await page.evaluate(()=>({scroll:scrollY,view:gestureEditor.getViewState(),data:JSON.stringify(gestureEditor.save())}));
  await swipe([b.x+80,b.y+70],[b.x+150,b.y+100]);const panned=await page.evaluate(()=>gestureEditor.getViewState());assert.ok(panned.pan[0]>initial.view.pan[0]+40);assert.equal(await page.evaluate(()=>scrollY),initial.scroll);
  await send('touchStart',[[b.x+80,b.y+70],[b.x+160,b.y+70]]);await send('touchMove',[[b.x+60,b.y+70],[b.x+180,b.y+70]]);await settle(page);await send('touchEnd',[]);assert.ok((await page.evaluate(()=>gestureEditor.getViewState())).zoom>panned.zoom);
  const toolbar=page.locator('#gesture-card .etch-toolbar-scroll'),tb=await toolbar.boundingBox();await swipe([tb.x+tb.width-20,tb.y+20],[tb.x+30,tb.y+20]);assert.ok(await toolbar.evaluate(el=>el.scrollLeft)>20);
  await swipe([tb.x+60,tb.y+20],[tb.x+60,tb.y+100]);assert.equal(await page.evaluate(()=>scrollY),initial.scroll);
  await page.evaluate(()=>gestureEditor.setTool('pen'));await page.locator('#gesture-card').getByRole('button',{name:'Toggle sidebar',exact:true}).click();
  const slider=page.locator('#gesture-card').getByRole('slider',{name:'Pen width slider',exact:true});await slider.scrollIntoViewIfNeeded();const sb=await slider.boundingBox();
  await swipe([sb.x+sb.width*0.3,sb.y+sb.height/2],[sb.x+sb.width*0.8,sb.y+sb.height/2]);assert.ok((await page.evaluate(()=>gestureEditor.getToolSettings('pen'))).width>20);
  assert.equal(await page.evaluate(()=>JSON.stringify(gestureEditor.save())),initial.data);
});
