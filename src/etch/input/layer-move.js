import { fail } from '../errors.js';

/** Relative CSS-pixel drag, converted using the gesture-start zoom, never DPR/pan. */
export class LayerMoveInput {
  #start = null;
  #screen = null;
  #zoom;
  constructor({view}) { this.#zoom = view.zoom; }
  get lastScreen() { return this.#screen && [...this.#screen]; }
  add(_event,screen) {
    if (!Array.isArray(screen) || screen.length !== 2 || !Array.from(screen).every(Number.isFinite)) fail('INVALID_ARGUMENT','Pointer coordinates must be finite');
    this.#start ??= [...screen]; this.#screen = [...screen];
  }
  delta() {
    if (!this.#start) return [0,0];
    const delta = this.#screen.map((n,i) => n-this.#start[i]);
    // Taps, sub-threshold jitter and a drag returned to its origin are true no-ops.
    return Math.hypot(...delta) < 2 ? [0,0] : delta.map(n => n/this.#zoom);
  }
}
