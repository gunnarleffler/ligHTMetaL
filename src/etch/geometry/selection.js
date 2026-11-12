import { elementBounds, unionBounds } from './paths.js';

// Corners precede edges for deterministic ties on very small selections.
export const RESIZE_HANDLES = Object.freeze([
  ['nw',0,0],['ne',1,0],['se',1,1],['sw',0,1],
  ['n',0.5,0],['e',1,0.5],['s',0.5,1],['w',0,0.5],
].map(Object.freeze));

export function selectionBounds(layer,ids) {
  const selected = new Set(ids);let bounds = null;
  for (const element of layer.elements) if (selected.has(element.id)) bounds = unionBounds(bounds,elementBounds(element,layer.offset));
  return bounds;
}

/** Padded interaction only; neither native geometry nor persisted bounds are changed. */
export function interactionBounds(bounds,zoom) {
  if (!bounds) return null;
  const width = Math.max(bounds.width,8/zoom),height = Math.max(bounds.height,8/zoom);
  return {x:bounds.x+(bounds.width-width)/2,y:bounds.y+(bounds.height-height)/2,width,height};
}

export function handlePosition(bounds,[,u,v]) {return [bounds.x+u*bounds.width,bounds.y+v*bounds.height];}

export function pickResizeHandle(bounds,view,screen,pointerType='mouse') {
  if (!bounds) return null;
  const radius = pointerType === 'touch' ? 12 : 8;
  let closest = null,distance = Infinity;
  for (const handle of RESIZE_HANDLES) {
    const point = handlePosition(bounds,handle).map((n,i) => n*view.zoom+view.pan[i]);
    const delta = point.map((n,i) => Math.abs(n-screen[i]));
    const d = Math.hypot(...delta);
    if (delta.every(n => n <= radius) && d < distance) {closest = handle;distance = d;}
  }
  return closest;
}
