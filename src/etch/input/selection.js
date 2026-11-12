import { LayerMoveInput } from './layer-move.js';
import { SweptHitTester } from '../geometry/hit-test.js';
import { elementBounds } from '../geometry/paths.js';
import { multiply, scale, translate, singularValues, IDENTITY } from '../geometry/matrix.js';

/** Topmost painted hit, using the same bounded geometry and affine rules as erasing. */
export function pickElement(layer,view,screen,exact) {
  const point = screen.map((n,i) => n-view.pan[i]);
  return new SweptHitTester(layer,view.zoom,{exact}).sweep(point,point,0)[0] ?? null;
}

/** Endpoint-only resize from captured bounds/matrices; never incrementally scale a preview. */
export class SelectionResizeInput extends LayerMoveInput {
  constructor({view,layer,selection,bounds,handle}) {
    super({view});this.layer = layer;this.bounds = {...bounds};this.handle = handle;
    const ids = new Set(selection);this.elements = layer.elements.filter(e => ids.has(e.id));
    this.image = this.elements.length === 1 && this.elements[0].type === 'image';this.constrained = false;
  }
  add(event,screen) {super.add(event,screen);if (typeof event.shiftKey === 'boolean') this.constrained = event.shiftKey;}
  setConstrained(value) {this.constrained = value;}
  matrix() {
    const delta = this.delta();
    if (delta.every(n => n === 0)) return [...IDENTITY];
    const [,u,v] = this.handle,b = this.bounds;
    const anchor = [b.x+(1-u)*b.width,b.y+(1-v)*b.height];
    let sx = u === 0.5 ? 1 : 1+delta[0]/((2*u-1)*b.width);
    let sy = v === 0.5 ? 1 : 1+delta[1]/((2*v-1)*b.height);
    const uniform = u !== 0.5 && v !== 0.5 && (this.image !== this.constrained);
    if (uniform) sx = sy = Math.abs(sx-1) >= Math.abs(sy-1) ? sx : sy;
    sx = Math.max(1e-8,sx);sy = Math.max(1e-8,sy); // No flipping or singular matrices.
    // Clamp shrinkage against each original affine matrix, not a conservative uniform
    // bound that would unnecessarily disable the other axis of an anisotropic mark.
    const stable = (x,y) => this.elements.every(e => singularValues(multiply(scale(x,y),e.transform))[0] >= 0.0001);
    if (!stable(sx,sy)) {
      let low = 0,high = 1;
      for (let i=0;i<50;i++) {
        const t = (low+high)/2;
        if (stable(1+(sx-1)*t,1+(sy-1)*t)) low = t;else high = t;
      }
      sx = 1+(sx-1)*low;sy = 1+(sy-1)*low;
    }
    const pivot = anchor.map((n,i) => n-this.layer.offset[i]);
    return multiply(translate(...pivot),multiply(scale(sx,sy),translate(-pivot[0],-pivot[1])));
  }
}

export class SelectionInput extends LayerMoveInput {
  constructor({view,layer,start,marquee,additive,selection}) {
    super({view});this.view = view;this.layer = layer;this.start = start;
    this.marquee = marquee;this.additive = additive;this.selection = selection;
  }
  bounds() {
    const a = this.start.map((n,i) => (n-this.view.pan[i])/this.view.zoom);
    const b = this.lastScreen.map((n,i) => (n-this.view.pan[i])/this.view.zoom);
    return {x:Math.min(a[0],b[0]),y:Math.min(a[1],b[1]),width:Math.abs(a[0]-b[0]),height:Math.abs(a[1]-b[1])};
  }
  ids() {
    const ids = new Set(this.additive ? this.selection : []);
    if (Math.hypot(...this.lastScreen.map((n,i) => n-this.start[i])) < 2) return [...ids];
    const box = this.bounds();
    for (const element of this.layer.elements) {
      const b = elementBounds(element,this.layer.offset);
      if (b && b.x >= box.x && b.y >= box.y && b.x+b.width <= box.x+box.width && b.y+b.height <= box.y+box.height) ids.add(element.id);
    }
    return [...ids];
  }
}
