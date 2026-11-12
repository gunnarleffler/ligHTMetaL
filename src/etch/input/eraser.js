import { fail } from '../errors.js';
import { SweptHitTester } from '../geometry/hit-test.js';
import { PartialCutTester } from '../geometry/ink-cut.js';

/** Snapshot radius/view/layer once. Keep every traversed segment, not just frame endpoints. */
export class EraserInput {
  #pending = [];
  #hits = new Set();
  #last = null;
  #processed = null;
  #screen = null;
  #samples = 0;
  constructor({layer,view,settings,maxSamples=100_000,tester,exact}) {
    this.view = {zoom:view.zoom,pan:[...view.pan]};this.radius = settings.radius;this.maxSamples = maxSamples;
    this.mode = settings.mode ?? 'object';
    this.tester = tester ?? (this.mode === 'partial' ? new PartialCutTester(layer,view.zoom) : new SweptHitTester(layer,view.zoom,{exact}));
  }
  get lastScreen() {return this.#screen && [...this.#screen];}
  add(event,screen) {
    if (!Array.isArray(screen) || screen.length !== 2 || Array.from(screen).some(n => !Number.isFinite(n))) fail('INVALID_ARGUMENT','Pointer coordinates must be a finite pair');
    const point = screen.map((n,i) => n-this.view.pan[i]);
    if (point.some(n => !Number.isFinite(n) || Math.abs(n/this.view.zoom) > 10_000_000)) fail('INVALID_ARGUMENT','Pointer exceeds supported world coordinates');
    this.#screen = [...screen];
    if (this.#last && point.every((n,i) => n === this.#last[i])) return;
    if (++this.#samples > this.maxSamples) fail('LIMIT_EXCEEDED','Eraser sample limit reached; gesture cancelled',{limit:'pointsPerElement',maximum:this.maxSamples});
    this.#pending.push(point);this.#last = point;
  }
  #flush() {
    for (const point of this.#pending) {
      for (const id of this.tester.sweep(this.#processed ?? point,point,this.radius)) this.#hits.add(id);
      this.#processed = point;
    }
    this.#pending = [];
  }
  ids() {
    if (this.mode !== 'object') fail('INVALID_ARGUMENT','Partial eraser returns line changes, not removed object IDs');
    this.#flush();return [...this.#hits];
  }
  changes() {
    if (this.mode !== 'partial') fail('INVALID_ARGUMENT','Object eraser returns removed IDs, not line changes');
    this.#flush();return this.tester.changes();
  }
}
