import { createId } from '../document.js';
import { fail } from '../errors.js';
import { screenToWorld } from '../geometry/matrix.js';

/** Capture/filter samples only. The shared geometry module alone smooths the stroke. */
export class PenInput {
  #points = [];
  #filtered = null;
  #lastSample = null;
  #lastKeptScreen = null;
  #screen = null;
  constructor({tool = 'pen',pointerType,view,offset,settings,maxPoints,sampleLimit = {limit:'pointsPerElement',maximum:maxPoints}}) {
    this.tool = tool;this.pressure = pointerType === 'pen' && tool !== 'highlighter' && settings.pressure !== false;
    this.pointerType = pointerType; this.view = view; this.offset = offset;
    this.settings = {...settings}; this.maxPoints = maxPoints; this.sampleLimit = sampleLimit; this.id = createId();
  }
  get lastScreen() { return this.#screen && [...this.#screen]; }
  add(event,screen,final = false) {
    if (!screen.every(Number.isFinite) || !Number.isFinite(event.timeStamp)) fail('INVALID_ARGUMENT','Pointer coordinates and timestamp must be finite');
    const signature = [...screen,event.pressure,event.timeStamp];
    const duplicate = this.#lastSample && signature.every((n,i) => n === this.#lastSample[i]);
    if (duplicate && !final) return;
    this.#lastSample = signature; this.#screen = [...screen];
    const point = screenToWorld(screen,this.view).map((n,i) => n-this.offset[i]);
    if (point.some(n => !Number.isFinite(n) || Math.abs(n) > 10_000_000)) fail('INVALID_ARGUMENT','Pointer exceeds supported world coordinates');
    let pressure = 1;
    if (this.pressure) {
      const raw = Number.isFinite(event.pressure) ? Math.max(0,Math.min(1,event.pressure)) : null;
      if (this.#filtered === null) this.#filtered = raw > 0 ? raw : 0.5;
      else if (!duplicate && !(final && (raw === null || raw === 0))) this.#filtered = 0.35*(raw ?? this.#filtered)+0.65*this.#filtered;
      // A synthetic zero on release retains the last valid filtered down pressure.
      pressure = this.#filtered;
    }
    const previous = this.#points.at(-1);
    if (previous) {
      const delta = Math.abs(pressure-previous[2]);
      if (point[0] === previous[0] && point[1] === previous[1] && delta < 1e-12) return;
      if (!final && Math.hypot(screen[0]-this.#lastKeptScreen[0],screen[1]-this.#lastKeptScreen[1]) < 0.25 && delta < 0.01) return;
    }
    if (this.#points.length >= this.maxPoints) fail('LIMIT_EXCEEDED','Stroke sample limit reached; this stroke was cancelled',this.sampleLimit);
    this.#points.push([...point,pressure]); this.#lastKeptScreen = [...screen];
  }
  element() {
    return {id:this.id,type:this.tool === 'highlighter' ? 'highlight' : 'stroke',transform:[1,0,0,1,0,0],points:this.#points.map(p => [...p]),
      color:this.settings.color,width:this.settings.width,pressure:this.pressure,
      ...(this.tool === 'highlighter' ? {opacity:this.settings.opacity} : {})};
  }
}
