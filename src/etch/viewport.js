import { fail } from './errors.js';

export const MIN_ZOOM = 0.1, MAX_ZOOM = 8;
export const clampZoom = value => Math.min(MAX_ZOOM,Math.max(MIN_ZOOM,value));

/** Session-only CSS-pixel view math; never edits durable document coordinates. */
export class Viewport {
  #zoom = 1;
  #pan = [0,0];
  #expanded = false;
  #lastSize = [0,0];
  width = 0;
  height = 0;
  constructor(onChange = () => {}) { this.onChange = onChange; }
  get() { return {zoom:this.#zoom,pan:[...this.#pan],expanded:this.#expanded}; }
  setExpanded(value) {
    if (value === this.#expanded) return;
    this.#expanded = value;this.onChange();
  }
  set(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.keys(value).some(key => !['zoom','pan'].includes(key))) fail('INVALID_ARGUMENT','View accepts zoom and pan only');
    const zoom = Object.hasOwn(value,'zoom') ? value.zoom : this.#zoom;
    const pan = Object.hasOwn(value,'pan') ? value.pan : this.#pan;
    if (typeof zoom !== 'number' || !Number.isFinite(zoom) || zoom < MIN_ZOOM || zoom > MAX_ZOOM
      || !Array.isArray(pan) || pan.length !== 2 || Array.from(pan).some(n => typeof n !== 'number' || !Number.isFinite(n) || !Number.isFinite(n/zoom))) {
      fail('INVALID_ARGUMENT','View requires zoom in [0.1, 8] and a finite [x, y] pan');
    }
    if (zoom === this.#zoom && pan.every((n,i) => n === this.#pan[i])) return;
    this.#zoom = zoom; this.#pan = [...pan]; this.onChange();
  }
  resize(width,height) {
    if (width === this.width && height === this.height) return false;
    this.width = width; this.height = height;
    if (width > 0 && height > 0) {
      const [w,h] = this.#lastSize;
      this.#lastSize = [width,height];
      this.set({pan:[this.#pan[0]+(width-w)/2,this.#pan[1]+(height-h)/2]});
    }
    return true;
  }
  panBy(dx,dy) { this.set({pan:[this.#pan[0]+dx,this.#pan[1]+dy]}); }
  zoomAt(zoom, anchor = [this.width/2,this.height/2]) {
    const next = clampZoom(zoom), ratio = next/this.#zoom;
    this.set({zoom:next,pan:anchor.map((n,i) => n-(n-this.#pan[i])*ratio)});
  }
  fit(bounds) {
    if (!(this.width > 0 && this.height > 0)) return;
    if (!bounds) { this.set({zoom:1,pan:[this.width/2,this.height/2]}); return; }
    const zoom = clampZoom(Math.min(Math.max(1,this.width-48)/Math.max(bounds.width,1e-8),
      Math.max(1,this.height-48)/Math.max(bounds.height,1e-8)));
    this.set({zoom,pan:[this.width/2-(bounds.x+bounds.width/2)*zoom,this.height/2-(bounds.y+bounds.height/2)*zoom]});
  }
}
