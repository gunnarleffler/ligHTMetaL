import { fail } from '../errors.js';
import { flattenBezier } from './curves.js';

export const MAX_STROKE_SEGMENTS = 500_000;
const TOLERANCE = 0.2;
const midpoint = (a,b) => a.map((n,i) => (n+b[i])/2);

/** Midpoint smoothing treats persisted pressure as a scalar, without re-filtering. */
export function* strokeSegments(points) {
  if (points.length < 2) return;
  if (points.length === 2) { yield [points[0],points[1]]; return; }
  let start = midpoint(points[0],points[1]);
  yield [points[0],start];
  for (let i = 1; i < points.length-1; i++) {
    const end = midpoint(points[i],points[i+1]);
    yield [start,points[i],end]; start = end;
  }
  yield [start,points.at(-1)];
}

/**
 * Emit one consistently wound nonzero path union: discs plus connecting quads.
 * No DOM or device state. A counting sink validates complexity without retaining arrays.
 * Returns the emitted command count; M/Z count toward the conservative work budget.
 */
export function visitStrokeOutline(stroke, emit, {maxSegments = MAX_STROKE_SEGMENTS} = {}) {
  let count = 0;
  const account = amount => {
    if (count+amount > maxSegments) fail('LIMIT_EXCEEDED', 'Pressure outline is too complex', {limit:'derivedSegments',maximum:maxSegments});
    count += amount;
  };
  const radiusPoint = ([x,y,p]) => [x,y,stroke.width/2*(stroke.pressure ? 0.2+0.8*p : 1)];
  function disc([x,y,r]) {
    // Quarter-aligned cubic arcs: all coordinate extrema stay within the disc's AABB.
    // Conservative r*angle^6/1000 error bound, at most pi/2 per cubic.
    const safeAngle = Math.min(Math.PI/2, Math.pow(TOLERANCE*1000/r,1/6));
    const parts = 4*Math.max(1,Math.ceil((Math.PI/2)/safeAngle));
    account(parts+2);
    if (!emit) return; // Validation counts without command arrays or trigonometry.
    const step = 2*Math.PI/parts, k = 4/3*Math.tan(step/4);
    emit(['M',x+r,y]);
    for (let i = 0; i < parts; i++) {
      const a = i*step, b = (i+1)*step;
      emit(['C',x+r*(Math.cos(a)-k*Math.sin(a)),y+r*(Math.sin(a)+k*Math.cos(a)),
        x+r*(Math.cos(b)+k*Math.sin(b)),y+r*(Math.sin(b)-k*Math.cos(b)),x+r*Math.cos(b),y+r*Math.sin(b)]);
    }
    emit(['Z']);
  }
  let previous = radiusPoint(stroke.points[0]);
  disc(previous);
  for (const segment of strokeSegments(stroke.points)) {
    const curve = segment.map(radiusPoint);
    const maxStep = Math.min(...curve.map(p => p[2]))/2;
    let first = true;
    for (const point of flattenBezier(curve,{tolerance:TOLERANCE,maxStep,maxSegments})) {
      if (first) { first = false; continue; }
      const [x,y,r] = point, [px,py,pr] = previous;
      const length = Math.hypot(x-px,y-py);
      if (length) {
        account(5);
        if (emit) {
          const nx = -(y-py)/length, ny = (x-px)/length;
          emit(['M',px-nx*pr,py-ny*pr]); emit(['L',x-nx*r,y-ny*r]);
          emit(['L',x+nx*r,y+ny*r]); emit(['L',px+nx*pr,py+ny*pr]); emit(['Z']);
        }
      }
      if (length || r !== pr) disc(point);
      previous = point;
    }
  }
  return count;
}

export function strokeOutline(stroke, options) {
  const commands = [];
  visitStrokeOutline(stroke, command => commands.push(command), options);
  return commands;
}
