import { fail } from '../errors.js';
import { paperBands } from '../background.js';
import { multiply, translate } from '../geometry/matrix.js';
import { elementBounds, traceElementPath } from '../geometry/paths.js';
import { createScheduler } from './scheduler.js';
import { RESIZE_HANDLES, selectionBounds, interactionBounds, handlePosition } from '../geometry/selection.js';

/** Bounded LRU of immutable element paths. Never cache by untrusted ID alone. */
export class PathCache {
  #entries = new Map();
  #segments = 0;
  constructor(Path2D, {maxSegments = 500_000, maxEntries = 2048} = {}) {
    this.Path2D = Path2D; this.maxSegments = maxSegments; this.maxEntries = maxEntries;
  }
  get(element,{retain = true,onWork} = {}) {
    let entry = this.#entries.get(element);
    if (entry) { onWork?.(entry.segments); this.#entries.delete(element); this.#entries.set(element,entry); return entry.path; }
    const path = new this.Path2D(), segments = traceElementPath(path,element);
    onWork?.(segments);entry = {path,segments};
    if (retain && segments <= this.maxSegments) {
      while (this.#entries.size && (this.#segments+segments > this.maxSegments || this.#entries.size >= this.maxEntries)) {
        const key = this.#entries.keys().next().value;
        this.#segments -= this.#entries.get(key).segments; this.#entries.delete(key);
      }
      this.#entries.set(element,entry); this.#segments += segments;
    }
    return path;
  }
  clear() { this.#entries.clear(); this.#segments = 0; }
}

/** Complete painter-order scene, optionally with a virtual replacement in one layer. */
export function renderScene(context, document, {width,height,dpr = 1,view,assets,cache,preview = null,background = document.background}) {
  context.setTransform(1,0,0,1,0,0);
  context.globalAlpha = 1; context.globalCompositeOperation = 'source-over';
  context.clearRect(0,0,context.canvas.width,context.canvas.height);
  if (background) {
    const paper = typeof background === 'object' ? paperBands(background,{
      width:context.canvas.width,height:context.canvas.height,scale:dpr*view.zoom,pan:view.pan.map(n => n*dpr),
    }) : null;
    context.fillStyle = paper ? paper.color : background;
    context.fillRect(0,0,context.canvas.width,context.canvas.height);
    if (paper?.dots) {
      const [x,y] = paper.bands;
      context.fillStyle = x.color;
      for (let i=0;i<x.count;i++) for (let j=0;j<y.count;j++) {
        context.beginPath();context.arc(x.start+i*x.step,y.start+j*y.step,dpr*view.zoom,0,Math.PI*2);context.fill();
      }
    } else if (paper) for (const band of paper.bands) {
      context.fillStyle = band.color;
      for (let i=0;i<band.count;i++) {
        const position = band.start+i*band.step-band.lineWidth/2;
        if (band.axis === 0) context.fillRect(position,0,band.lineWidth,context.canvas.height);
        else context.fillRect(0,position,context.canvas.width,band.lineWidth);
      }
    }
  }
  const z = view.zoom, [px,py] = view.pan;
  const base = [dpr*z,0,0,dpr*z,dpr*px,dpr*py];
  const worldViewport = {left:-px/z,top:-py/z,right:(width-px)/z,bottom:(height-py)/z};
  for (const layer of document.layers) {
    if (!layer.visible) continue;
    const virtual = preview?.layerId === layer.id ? preview : null;
    const offset = virtual?.offset ?? layer.offset;
    const originals = virtual ? new Set(layer.elements) : null;
    const layerMatrix = multiply(base,translate(...offset));
    for (const element of virtual?.elements ?? layer.elements) {
      const bounds = elementBounds(element,offset);
      if (!bounds || bounds.x+bounds.width < worldViewport.left || bounds.y+bounds.height < worldViewport.top
        || bounds.x > worldViewport.right || bounds.y > worldViewport.bottom) continue;
      // Fill the complete outline once: subpath/self overlap never compounds alpha.
      context.globalAlpha = element.type === 'highlight' ? element.opacity : 1;
      context.setTransform(...multiply(layerMatrix,element.transform));
      if (element.type === 'image') {
        const image = assets.get(element.assetId);
        if (!image) fail('DECODE_FAILED','Image resource is not available');
        context.drawImage(image,element.x,element.y,element.width,element.height); continue;
      }
      const path = cache.get(element,{retain:!originals || originals.has(element)});
      const fill = ['stroke','highlight','ink'].includes(element.type) ? element.color : element.fill;
      if (fill) { context.fillStyle = fill; context.fill(path,element.fillRule ?? 'nonzero'); }
      if (element.stroke) {
        context.strokeStyle = element.stroke; context.lineWidth = element.strokeWidth;
        context.lineCap = element.lineCap ?? 'butt'; context.lineJoin = element.lineJoin ?? 'round';
        context.miterLimit = element.miterLimit ?? 4;
        context.stroke(path);
      }
    }
  }
  context.setTransform(1,0,0,1,0,0);context.globalAlpha = 1;
}

/** Retained two-canvas viewport, resize/DPR observation, scene invalidation and previews. */
export function createCanvasRenderer(viewport, state, view, {onViewChange,onResize,onError,isSelectionTool = () => false}) {
  const doc = viewport.ownerDocument, window = doc.defaultView;
  const committed = doc.createElement('canvas'), live = doc.createElement('canvas');
  committed.className = 'etch-canvas etch-committed'; live.className = 'etch-canvas etch-live';
  committed.setAttribute('aria-hidden','true'); live.setAttribute('aria-hidden','true');
  const mainContext = committed.getContext('2d'), liveContext = live.getContext('2d');
  if (!mainContext || !liveContext) fail('INVALID_ARGUMENT','Etch requires Canvas 2D support');
  live.hidden = true; viewport.prepend(committed,live);
  const outlines = [doc.createElement('span'),doc.createElement('span')];
  for (const outline of outlines) {outline.className = 'etch-selection-outline';outline.hidden = true;outline.setAttribute('aria-hidden','true');viewport.append(outline);}
  const handles = RESIZE_HANDLES.map(([name]) => {
    const handle = doc.createElement('span');handle.className = 'etch-selection-handle';handle.dataset.handle = name;
    handle.hidden = true;handle.setAttribute('aria-hidden','true');viewport.append(handle);return handle;
  });
  const cache = new PathCache(window.Path2D);
  let destroyed = false, viewDirty = true, preview = null, liveDirty = false, dpr = 0, media = null;
  // UI draft only: undefined means committed paper; null previews transparency.
  let backgroundPreview,backgroundDocument = null;
  const scheduler = createScheduler(window,draw);
  function invalidate(changedView = false) { viewDirty ||= changedView; scheduler.request(); }
  function watchDPR() {
    media?.removeEventListener('change',dprChanged);
    media = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
    media.addEventListener('change',dprChanged);
  }
  function dprChanged() { watchDPR(); invalidate(); }
  function measure() {
    const {width,height} = viewport.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    const available = width > 0 && height > 0;
    const w = available ? Math.round(width*ratio) : 0, h = available ? Math.round(height*ratio) : 0;
    if (w > 8192 || h > 8192 || w*h > 16_777_216) fail('LIMIT_EXCEEDED','Viewport backing canvas exceeds safety limits',{limit:'viewportPixels',maximum:16_777_216});
    const changed = view.resize(width,height);
    if (changed || ratio !== dpr) { dpr = ratio; onResize?.(); }
    for (const canvas of [committed,live]) {
      if (canvas.width !== w) canvas.width = w;
      if (canvas.height !== h) canvas.height = h;
    }
    return {width,height};
  }
  function draw() {
    if (destroyed) return;
    try {
      const {width,height} = measure();
      if (backgroundDocument !== state.document) {backgroundPreview = undefined;backgroundDocument = null;}
      const previewing = preview !== null || backgroundPreview !== undefined;
      if (width > 0 && height > 0) {
        // A gesture factory snapshots/validates once per frame, never per raw sample.
        const replacement = typeof preview === 'function' ? preview() : preview;
        const options = {width,height,dpr,view:view.get(),assets:state.assets,cache,preview:replacement,background:backgroundPreview};
        const context = previewing ? liveContext : mainContext;
        renderScene(context,state.document,options);
        const layer = state.document.layers.find(l => l.id === state.getActiveLayer());
        const virtual = replacement?.layerId === layer.id ? replacement : null;
        const selectedLayer = virtual ? {...layer,elements:virtual.elements ?? layer.elements,offset:virtual.offset ?? layer.offset} : layer;
        let bounds = selectionBounds(selectedLayer,state.getSelection());
        const current = view.get(),selecting = isSelectionTool() && !state.readOnly && !state.busy;
        if (selecting) bounds = interactionBounds(bounds,current.zoom);
        handles.forEach((handle,i) => {
          handle.hidden = !selecting || !bounds || Boolean(replacement?.marquee);
          if (!handle.hidden) {
            const point = handlePosition(bounds,RESIZE_HANDLES[i]);
            handle.style.left = `${point[0]*current.zoom+current.pan[0]}px`;handle.style.top = `${point[1]*current.zoom+current.pan[1]}px`;
          }
        });
        [bounds,replacement?.marquee].forEach((b,i) => {
          const outline = outlines[i];outline.hidden = !b;
          if (b) Object.assign(outline.style,{left:`${b.x*current.zoom+current.pan[0]}px`,top:`${b.y*current.zoom+current.pan[1]}px`,width:`${b.width*current.zoom}px`,height:`${b.height*current.zoom}px`});
        });
        if (previewing) liveDirty = true;
        else if (liveDirty) {
          liveContext.setTransform(1,0,0,1,0,0); liveContext.clearRect(0,0,live.width,live.height); liveDirty = false;
        }
      }
      committed.hidden = previewing; live.hidden = !previewing;
      if (viewDirty) { viewDirty = false; onViewChange(view.get()); }
    } catch (error) {
      for (const outline of [...outlines,...handles]) outline.hidden = true;
      // Failed wet geometry never leaves a partial preview covering committed work.
      if (preview || backgroundPreview !== undefined) {
        preview = null;backgroundPreview = undefined;backgroundDocument = null;
        committed.hidden = false; live.hidden = true;
        liveContext.setTransform(1,0,0,1,0,0); liveContext.clearRect(0,0,live.width,live.height); liveDirty = false;
      }
      onError(error);
    }
  }
  const observer = new window.ResizeObserver(() => invalidate());
  observer.observe(viewport); watchDPR(); window.addEventListener('resize',invalidateResize);
  function invalidateResize() { invalidate(); }
  try { measure(); } catch (error) { onError(error); }
  invalidate();
  return {
    invalidate,
    // Exact paint membership supplements the swept, flattened tolerance band.
    // CSS-space query matrix intentionally excludes both pan and backing-store DPR.
    hitPoint(element,matrix,point,budget) {
      const path = cache.get(element,{onWork:n => budget.step(n)}),fill = ['stroke','highlight','ink'].includes(element.type) ? element.color : element.fill;
      liveContext.save();
      try {
        liveContext.setTransform(...matrix);
        if (fill && liveContext.isPointInPath(path,...point,element.fillRule ?? 'nonzero')) return true;
        if (!element.stroke) return false;
        liveContext.lineWidth = element.strokeWidth;liveContext.lineCap = element.lineCap ?? 'butt';
        liveContext.lineJoin = element.lineJoin ?? 'round';liveContext.miterLimit = element.miterLimit ?? 4;
        return liveContext.isPointInStroke(path,...point);
      } finally {liveContext.restore();}
    },
    setBackgroundPreview(value) {
      if (destroyed) return;
      backgroundPreview = value;backgroundDocument = value === undefined ? null : state.document;invalidate();
    },
    setPreview(value) { preview = value; invalidate(); },
    clearPreview() { if (preview) { preview = null; invalidate(); } },
    resetCache() { cache.clear(); preview = null;backgroundPreview = undefined;backgroundDocument = null;invalidate(); },
    destroy() {
      destroyed = true; scheduler.destroy(); observer.disconnect();
      media?.removeEventListener('change',dprChanged); window.removeEventListener('resize',invalidateResize);
      cache.clear(); committed.width = committed.height = live.width = live.height = 0;
      committed.remove(); live.remove();for (const outline of [...outlines,...handles]) outline.remove();
    },
  };
}
