/** Shared pure bounds. Paths use analytic curve extrema; stroke bounds are conservative. */
import { multiply, translate, transformBounds } from './matrix.js';
import { visitStrokeOutline } from './stroke.js';

const immutableData = new WeakSet(),checking = new WeakSet();
const localBoundsCache = new WeakMap(),visibleBoundsCache = new WeakMap(),allBoundsCache = new WeakMap();

// Pure helpers also accept mutable input. A shallow freeze or frozen accessor
// does not make nested samples/commands immutable enough to cache.
function deeplyImmutable(value) {
  if (value === null || typeof value !== 'object') return typeof value !== 'function';
  if (immutableData.has(value)) return true;
  if (!Object.isFrozen(value) || checking.has(value)) return false;
  if (![Object.prototype,Array.prototype,null].includes(Object.getPrototypeOf(value))) return false;
  checking.add(value);
  const safe = Reflect.ownKeys(value).every(key => {
    const d = Object.getOwnPropertyDescriptor(value,key);
    return Object.hasOwn(d,'value') && deeplyImmutable(d.value);
  });
  checking.delete(value);
  if (safe) immutableData.add(value);
  return safe;
}
function reuseBounds(cache,value,calculate) {
  if (!deeplyImmutable(value)) return calculate();
  if (!cache.has(value)) cache.set(value,calculate());
  const bounds = cache.get(value);
  return bounds && {...bounds};
}

export function unionBounds(a, b) {
  if (!a) return b && { ...b };
  if (!b) return { ...a };
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
  return { x, y, width: Math.max(a.x+a.width, b.x+b.width)-x,
    height: Math.max(a.y+a.height, b.y+b.height)-y };
}

export function expandBounds(b, padding) {
  return b && { x: b.x-padding, y: b.y-padding, width: b.width+2*padding, height: b.height+2*padding };
}

function pointBounds(x, y) { return { x, y, width: 0, height: 0 }; }
function roots(a, b, c) {
  if (Math.abs(a) < 1e-15) return b === 0 ? [] : [-c/b];
  const discriminant = b*b-4*a*c;
  if (discriminant < 0) return [];
  const q = -0.5 * (b + (b < 0 ? -1 : 1) * Math.sqrt(discriminant));
  return q === 0 ? [-b/(2*a)] : [q/a, c/q];
}

export function pathBounds(commands) {
  let current = [0,0], start = current, bounds = null, drawn = false;
  const include = ([x, y]) => { bounds = unionBounds(bounds, pointBounds(x, y)); };
  for (const [op, ...n] of commands) {
    if (op === 'M') { current = n; start = n; drawn = false; continue; }
    if (op === 'Z' && !drawn) continue;
    drawn = true;
    const end = op === 'Z' ? start : n.slice(-2);
    include(current); include(end);
    if (op === 'Q' || op === 'C') {
      const candidates = [];
      for (let axis = 0; axis < 2; axis++) {
        const p = current[axis], q = n[axis], r = n[axis+2];
        if (op === 'Q') {
          const denominator = p-2*q+r;
          if (denominator !== 0) candidates.push((p-q)/denominator);
        } else {
          const s = n[axis+4];
          candidates.push(...roots(-p+3*q-3*r+s, 2*(p-2*q+r), q-p));
        }
      }
      for (const t of candidates) {
        if (!(t > 0 && t < 1)) continue;
        const u = 1-t;
        include([0,1].map(axis => op === 'Q'
          ? u*u*current[axis]+2*u*t*n[axis]+t*t*end[axis]
          : u*u*u*current[axis]+3*u*u*t*n[axis]+3*u*t*t*n[axis+2]+t*t*t*end[axis]));
      }
    }
    current = end;
  }
  return bounds;
}

export function localPaintedBounds(element) {
  return reuseBounds(localBoundsCache,element,() => calculateLocalBounds(element));
}
function calculateLocalBounds(element) {
  const e = element;
  let b;
  switch (e.type) {
    case 'stroke': case 'highlight': {
      // Midpoint quadratics stay inside the convex hull of their input samples.
      b = null;
      for (const [x, y] of e.points) b = unionBounds(b, pointBounds(x, y));
      return expandBounds(b, e.width/2);
    }
    case 'ink':
      b = null;for (const part of e.parts) b = unionBounds(b,pathBounds(part));return b;
    case 'line':
      b = unionBounds(pointBounds(...e.start), pointBounds(...e.end)); break;
    case 'rect': case 'image':
      b = { x: e.x, y: e.y, width: e.width, height: e.height }; break;
    case 'ellipse':
      b = { x: e.cx-e.rx, y: e.cy-e.ry, width: 2*e.rx, height: 2*e.ry }; break;
    case 'path': b = pathBounds(e.commands); break;
    default: throw new TypeError('Unknown geometry type');
  }
  if (e.stroke) {
    // Square caps can extend sqrt(2)*radius along a local coordinate axis.
    const factor = Math.max(e.lineJoin === 'miter' ? e.miterLimit : 1,
      e.lineCap === 'square' ? Math.SQRT2 : 1);
    b = expandBounds(b, e.strokeWidth/2*factor);
  }
  return b;
}

export function elementBounds(element, offset = [0,0]) {
  return transformBounds(multiply(translate(...offset), element.transform), localPaintedBounds(element));
}

/** Trace the same normalized geometry into Canvas contexts, Path2D, or test sinks. */
export function traceCommand(target, [op,...n]) {
  switch (op) {
    case 'M': target.moveTo(...n); break;
    case 'L': target.lineTo(...n); break;
    case 'Q': target.quadraticCurveTo(...n); break;
    case 'C': target.bezierCurveTo(...n); break;
    case 'Z': target.closePath(); break;
    default: throw new TypeError('Unknown native path command');
  }
}

export function traceElementPath(target, element) {
  const e = element;
  switch (e.type) {
    case 'stroke': case 'highlight': return visitStrokeOutline(e, command => traceCommand(target, command));
    case 'ink': {
      let count = 0;
      for (const part of e.parts) for (const command of part) {traceCommand(target,command);count++;}
      return count;
    }
    case 'path':
      for (const command of e.commands) traceCommand(target, command);
      return e.commands.length;
    case 'line': target.moveTo(...e.start); target.lineTo(...e.end); return 2;
    case 'rect': target.rect(e.x,e.y,e.width,e.height); return 5;
    case 'ellipse': target.ellipse(e.cx,e.cy,e.rx,e.ry,0,0,2*Math.PI); return 4;
    default: throw new TypeError('Element has no vector path');
  }
}

export function documentBounds(document, { visibleOnly = true } = {}) {
  return reuseBounds(visibleOnly ? visibleBoundsCache : allBoundsCache,document,() => {
    let bounds = null;
    for (const layer of document.layers) {
      if (visibleOnly && !layer.visible) continue;
      for (const element of layer.elements) bounds = unionBounds(bounds, elementBounds(element, layer.offset));
    }
    return bounds;
  });
}
