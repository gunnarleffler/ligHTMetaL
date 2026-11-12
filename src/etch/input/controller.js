import { clampZoom } from '../viewport.js';
import { installGestureGuard } from './gesture-guard.js';
import { PenInput } from './pen.js';
import { ShapeInput } from './shapes.js';
import { LayerMoveInput } from './layer-move.js';
import { EraserInput } from './eraser.js';
import { SelectionInput, SelectionResizeInput, pickElement } from './selection.js';
import { selectionBounds, interactionBounds, pickResizeHandle } from '../geometry/selection.js';

/** One pointer owner: content gesture OR pan/pinch. No competing drawing/navigation listeners. */
export function createInputController(viewport,root,view,{state,tools,renderer,fit,setTool,onError}) {
  const window = viewport.ownerDocument.defaultView,pointers = new Map(),listeners = [];
  let base = null,drawing = null,space = false,destroyed = false,hover = null;
  const cursor = viewport.ownerDocument.createElement('span');cursor.className = 'etch-eraser-cursor';cursor.hidden = true;
  cursor.setAttribute('aria-hidden','true');viewport.append(cursor);
  const barrel = event => event.pointerType === 'pen' && (event.button === 5 || Boolean(event.buttons & 32));
  function refreshCursor() {
    const layer = state.document.layers.find(l => l.id === state.getActiveLayer());
    const erasing = drawing?.context.tool === 'eraser' || (!drawing && tools.getTool() === 'eraser');
    const show = erasing && hover?.inside && (hover.type !== 'touch' || drawing) && !space && !base && !state.readOnly && !state.busy && layer.visible && !layer.locked;
    cursor.hidden = !show;
    if (show) {
      const radius = drawing?.input.radius ?? tools.getSettings('eraser').radius;
      cursor.style.width = cursor.style.height = `${2*radius}px`;
      cursor.style.transform = `translate(${hover.screen[0]-radius}px,${hover.screen[1]-radius}px)`;
    }
  }
  function track(event) {
    if (drawing && drawing.id !== event.pointerId) return;
    const rect = viewport.getBoundingClientRect(),screen = local(event,rect);
    hover = {screen,type:event.pointerType,inside:screen[0] >= 0 && screen[1] >= 0 && screen[0] <= rect.width && screen[1] <= rect.height};refreshCursor();
  }
  const local = (event,rect = viewport.getBoundingClientRect()) => [event.clientX-rect.left,event.clientY-rect.top];
  const listen = (target,name,callback,options) => {
    const guarded = event => {
      if (destroyed) return;
      try {callback(event);} catch (error) {cancel();onError(error);}
    };
    target.addEventListener(name,guarded,options);listeners.push(() => target.removeEventListener(name,guarded,options));
  };
  function release(id) {if (viewport.hasPointerCapture(id)) viewport.releasePointerCapture(id);}
  function endDrawing(releaseCapture = true) {
    const old = drawing;drawing = null;viewport.classList.remove('etch-drawing','etch-moving-layer','etch-erasing','etch-resizing');renderer.clearPreview();
    if (old && releaseCapture) release(old.id);
    return old;
  }
  function rebase() {
    const points = [...pointers.values()].slice(0,2).map(p => p.position);
    base = points.length ? {view:view.get(),points} : null;
    viewport.classList.toggle('etch-panning',points.length > 0);refreshCursor();
  }
  function cancel() {
    endDrawing();const ids = [...pointers.keys()];pointers.clear();
    for (const id of ids) release(id);
    rebase();
  }
  function reset() {hover = null;space = false;viewport.classList.remove('etch-temporary-hand');cancel();}
  function navigate(event) {
    pointers.set(event.pointerId,{type:event.pointerType,position:local(event)});
    viewport.setPointerCapture(event.pointerId);rebase();
  }
  function begin(event,forcedTool) {
    const tool = forcedTool ?? tools.getTool(),moving = tool === 'move-layer',erasing = tool === 'eraser',settings = tools.getSettings(tool);
    if (tool === 'select') {
      const initial = state.prepareSelectionMove(),start = local(event),selection = state.getSelection();
      const currentView = view.get(),bounds = interactionBounds(selectionBounds(initial.layer,selection),currentView.zoom);
      const handle = pickResizeHandle(bounds,currentView,start,event.pointerType);
      if (handle) {
        const input = new SelectionResizeInput({view:currentView,layer:initial.layer,selection,bounds,handle});input.add(event,start);
        drawing = {id:event.pointerId,type:event.pointerType,input,context:initial,commit:() => state.commitSelectionResize(initial,input.matrix())};
        viewport.setPointerCapture(event.pointerId);viewport.classList.add('etch-resizing');
        viewport.style.setProperty('--etch-resize-cursor',`${handle[0]}-resize`);
        renderer.setPreview(() => state.previewSelectionResize(initial,input.matrix()));return;
      }
      const hit = pickElement(initial.layer,view.get(),start,(...args) => renderer.hitPoint(...args));
      if (hit) state.setSelection(event.shiftKey ? (selection.includes(hit) ? selection.filter(id => id !== hit) : [...selection,hit]) : selection.includes(hit) ? selection : [hit]);
      const context = state.prepareSelectionMove();
      if (hit && !context.ids.includes(hit)) context.ids = []; // Shift-deselect never drags the other selected objects.
      const input = new SelectionInput({view:view.get(),layer:context.layer,start,marquee:!hit,additive:event.shiftKey,selection});
      input.add(event,start);
      drawing = {id:event.pointerId,type:event.pointerType,input,context,
        commit:() => input.marquee ? state.setSelection(input.ids()) : state.commitSelectionMove(context,input.delta())};
      viewport.setPointerCapture(event.pointerId);
      renderer.setPreview(() => input.marquee ? {marquee:input.bounds()} : state.previewSelectionMove(context,input.delta()));
      return;
    }
    const partial = erasing && settings.mode === 'partial';
    const context = erasing ? state.prepareErase(settings.mode) : moving ? state.prepareLayerMove() : state.prepareDrawing(tool);
    const Input = erasing ? EraserInput : moving ? LayerMoveInput : ['pen','highlighter'].includes(tool) ? PenInput : ShapeInput;
    const input = new Input({tool,pointerType:event.pointerType,view:view.get(),offset:context.layer.offset,layer:context.layer,
      settings,maxPoints:context.maxPoints,sampleLimit:context.sampleLimit,maxSamples:context.maxSamples,exact:(...args) => renderer.hitPoint(...args)});
    input.add(event,local(event));
    drawing = {id:event.pointerId,type:event.pointerType,input,context,
      commit:() => partial ? state.commitPartialErase(context,input.changes()) : erasing ? state.commitErase(context,input.ids()) : moving ? state.commitLayerMove(context,input.delta()) : state.commitDrawing(context,input.element())};
    viewport.setPointerCapture(event.pointerId);viewport.classList.add(erasing ? 'etch-erasing' : moving ? 'etch-moving-layer' : 'etch-drawing');
    renderer.setPreview(() => partial ? state.previewPartialErase(context,input.changes()) : erasing ? state.previewErase(context,input.ids()) : moving ? state.previewLayerMove(context,input.delta()) : state.previewDrawing(context,input.element()));
    track(event);
  }
  function samples(event,final = false) {
    // Shapes/layer moves need only endpoints. Pen and eraser retain the full path.
    const batch = ['pen','eraser'].includes(drawing.context.tool) && typeof event.getCoalescedEvents === 'function' ? event.getCoalescedEvents() : [];
    const rect = viewport.getBoundingClientRect();
    for (const sample of batch) if (sample.pointerId === drawing.id) drawing.input.add(sample,local(sample,rect));
    drawing.input.add(event,local(event,rect),final);renderer.invalidate();
  }
  listen(viewport,'pointerdown',event => {
    if (event.target.closest('button,input,select,textarea,a[href]')) return;
    if (event.pointerType === 'mouse' && ![0,1].includes(event.button)) return;
    // A reported pen eraser end/button is temporary; never change the selected tool.
    if (event.pointerType === 'pen' && event.button !== 0 && !barrel(event)) return;
    if (drawing?.type === 'pen' || (event.pointerType === 'touch' && [...pointers.values()].some(p => p.type === 'pen'))) return;
    event.preventDefault();viewport.focus({preventScroll:true});track(event);
    if (drawing) {
      if (event.pointerType === 'pen') cancel();
      else if (drawing.type === 'touch' && event.pointerType === 'touch') {
        const old = endDrawing(false);
        pointers.set(old.id,{type:'touch',position:old.input.lastScreen});navigate(event);return;
      } else return;
    }
    if (event.pointerType === 'pen') cancel(); // Pen takes ownership from incidental touch navigation.
    if (pointers.size) {navigate(event);return;}
    const touchNavigation = event.pointerType === 'touch' && !tools.getDrawWithTouch();
    if ((tools.getTool() === 'hand' && !barrel(event)) || space || event.button === 1 || touchNavigation || state.readOnly || state.busy) navigate(event);
    else begin(event,barrel(event) ? 'eraser' : undefined);
  });
  listen(viewport,'pointermove',event => {
    if (drawing?.type === 'pen' && drawing.id !== event.pointerId) return;
    track(event);
    if (drawing?.id === event.pointerId) {
      if (!viewport.hasPointerCapture(event.pointerId)) {cancel();return;}
      if (drawing.type === 'pen' && barrel(event) && drawing.context.tool !== 'eraser') {endDrawing(false);begin(event,'eraser');return;}
      const buttons = drawing.context.tool === 'eraser' && drawing.type === 'pen' ? 33 : 1;
      if (['mouse','pen'].includes(drawing.type) && !(event.buttons & buttons)) {cancel();return;}
      samples(event);return;
    }
    const pointer = pointers.get(event.pointerId);if (!pointer) return;
    if (pointer.type === 'pen' && barrel(event) && !space && !state.readOnly && !state.busy) {
      pointers.delete(event.pointerId);rebase();begin(event,'eraser');return;
    }
    if (event.pointerType === 'mouse' && event.buttons === 0) {cancel();return;}
    pointer.position = local(event);
    const points = [...pointers.values()].slice(0,2).map(p => p.position);
    if (points.length === 1) view.set({pan:base.view.pan.map((n,i) => n+points[0][i]-base.points[0][i])});
    else {
      const center = points[0].map((n,i) => (n+points[1][i])/2),oldCenter = base.points[0].map((n,i) => (n+base.points[1][i])/2);
      const distance = Math.hypot(points[1][0]-points[0][0],points[1][1]-points[0][1]);
      const oldDistance = Math.hypot(base.points[1][0]-base.points[0][0],base.points[1][1]-base.points[0][1]);
      const zoom = oldDistance > 0.01 ? clampZoom(base.view.zoom*distance/oldDistance) : base.view.zoom;
      view.set({zoom,pan:center.map((n,i) => n-(oldCenter[i]-base.view.pan[i])/base.view.zoom*zoom)});
    }
  });
  listen(viewport,'pointerup',event => {
    if (drawing?.id === event.pointerId) {
      if (!viewport.hasPointerCapture(event.pointerId)) {cancel();return;}
      samples(event,true);track(event);
      const old = endDrawing();old.commit();refreshCursor();return;
    }
    if (!pointers.delete(event.pointerId)) return;
    release(event.pointerId);rebase();
  });
  for (const name of ['pointercancel','lostpointercapture']) listen(viewport,name,event => {
    if (drawing?.id === event.pointerId || pointers.has(event.pointerId)) cancel();
  });
  listen(viewport,'pointerleave',event => {if (!drawing || drawing.id === event.pointerId) {hover = null;refreshCursor();}});
  listen(window,'blur',reset);
  listen(root,'focusout',event => {if (!root.contains(event.relatedTarget)) reset();});
  listen(viewport,'wheel',event => {
    if (event.defaultPrevented) return;
    if (drawing || pointers.size) {event.preventDefault();return;}
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? view.height : 1;
    const dx = event.deltaX*unit,dy = event.deltaY*unit;
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
    event.preventDefault();
    if (event.ctrlKey || event.metaKey) view.zoomAt(view.get().zoom*Math.exp(-Math.max(-1000,Math.min(1000,dy))*0.002),local(event));
    else view.panBy(-dx,-dy);
  },{passive:false});
  listen(root,'keydown',event => {
    if (event.defaultPrevented || event.target.closest('.etch-shape-menu,.etch-export-menu,input,textarea,select,dialog[open],[contenteditable]:not([contenteditable="false"])')) return;
    if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'a' && tools.getTool() === 'select') {
      const layer = state.document.layers.find(l => l.id === state.getActiveLayer());
      if (!state.readOnly && !state.busy && layer.visible && !layer.locked) {event.preventDefault();cancel();state.setSelection(layer.elements.map(e => e.id));}
      return;
    }
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    switch (event.key.toLowerCase()) {
      case '+':case '=':event.preventDefault();cancel();view.zoomAt(view.get().zoom*1.2);break;
      case '-':event.preventDefault();cancel();view.zoomAt(view.get().zoom/1.2);break;
      case '0':event.preventDefault();fit();break;
      case '1':event.preventDefault();cancel();view.zoomAt(1);break;
      case 'h':event.preventDefault();setTool('hand');break;
      case 'v':case 'p':case 'b':case 'k':case 'e':case 'l':case 'a':case 'r':case 'o':case 'm': {
        const layer = state.document.layers.find(l => l.id === state.getActiveLayer());
        const tool = {v:'select',p:'pen',b:'pen',k:'highlighter',e:'eraser',l:'line',a:'arrow',r:'rect',o:'ellipse',m:'move-layer'}[event.key.toLowerCase()];
        if (!state.readOnly && !state.busy && layer.visible && !layer.locked) {event.preventDefault();setTool(tool);}
        break;
      }
      case 'arrowleft':case 'arrowright':case 'arrowup':case 'arrowdown': {
        const layer = state.document.layers.find(l => l.id === state.getActiveLayer());
        if (tools.getTool() === 'select' && state.getSelection().length && !state.readOnly && !state.busy && layer.visible && !layer.locked) {
          event.preventDefault();cancel();const step = event.shiftKey ? 10 : 1;
          const direction = {arrowleft:[-1,0],arrowright:[1,0],arrowup:[0,-1],arrowdown:[0,1]}[event.key.toLowerCase()];
          state.commitSelectionMove(state.prepareSelectionMove(),direction.map(n => n*step));
        }
        break;
      }
      case 'shift':
        if (drawing?.input.setConstrained) {drawing.input.setConstrained(true);renderer.invalidate();}
        break;
      case ' ':
        if (event.target === viewport || event.target === root) {
          event.preventDefault();if (!space) {cancel();space = true;viewport.classList.add('etch-temporary-hand');refreshCursor();}
        }
        break;
      case 'delete':case 'backspace':
        if (state.getSelection().length && !state.readOnly && !state.busy) {event.preventDefault();cancel();state.deleteSelection();}
        break;
      case 'escape': {
        const active = Boolean(drawing || pointers.size);cancel();
        if (!active) state.setSelection([]);
        break;
      }
    }
  });
  listen(window,'keyup',event => {
    if (event.key === ' ' && space) {space = false;viewport.classList.remove('etch-temporary-hand');refreshCursor();}
    if (event.key === 'Shift' && drawing?.input.setConstrained) {drawing.input.setConstrained(false);renderer.invalidate();}
  });
  listen(viewport,'dragstart',event => event.preventDefault());
  // Safari long-press/pen callouts must not compete with drawing. Keep native
  // behavior on controls and everywhere outside the artwork viewport.
  for (const name of ['contextmenu','selectstart']) listen(viewport,name,event => {
    if (!event.target.closest?.('button,input,select,textarea,a[href],[contenteditable]')) event.preventDefault();
  });
  const removeGestureGuard = installGestureGuard(root,() => view.get().expanded);
  return {cancel,refreshCursor,destroy() {if (destroyed) return;reset();destroyed = true;removeGestureGuard();cursor.remove();for (const off of listeners) off();}};
}
