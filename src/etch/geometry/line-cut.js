import { fail } from '../errors.js';
import { createId } from '../document.js';
import { apply, multiply, scale, translate } from './matrix.js';
import { elementBounds } from './paths.js';
import { flattenPaint, HitBudget, HIT_ERROR } from './hit-test.js';
import { hull } from './convex.js';

const pair = value => Array.isArray(value) && value.length === 2 && Array.from(value).every(Number.isFinite);
/** Intersection of the x axis with a convex polygon, including horizontal edges. */
function polygonInterval(points,budget) {
  let lo = Infinity,hi = -Infinity;
  const include = x => {lo = Math.min(lo,x);hi = Math.max(hi,x);};
  for (let i = 0;i < points.length;i++) {
    budget.step();const p = points[i],q = points[(i+1)%points.length];
    if (p[1] === 0) include(p[0]);
    if ((p[1] < 0 && q[1] > 0) || (p[1] > 0 && q[1] < 0)) include(p[0]+(q[0]-p[0])*(-p[1])/(q[1]-p[1]));
  }
  return lo <= hi ? [lo,hi] : null;
}
/** Intersect a line with a convex polygon dilated by a circular CSS radius. */
function roundedInterval(points,radius,budget) {
  let lo = Infinity,hi = -Infinity;
  const include = interval => {if (interval) {lo = Math.min(lo,interval[0]);hi = Math.max(hi,interval[1]);}};
  if (points.length > 2) include(polygonInterval(points,budget));
  for (let i = 0;i < points.length;i++) {
    budget.step();const p = points[i],q = points[(i+1)%points.length],y = Math.abs(p[1]);
    if (y <= radius) {const dx = Math.sqrt(Math.max(0,(radius-y)*(radius+y)));include([p[0]-dx,p[0]+dx]);}
    const dx = q[0]-p[0],dy = q[1]-p[1],length = Math.hypot(dx,dy);if (!length) continue;
    const x = -dy/length*radius,z = dx/length*radius;
    include(polygonInterval([[p[0]-x,p[1]-z],[q[0]-x,q[1]-z],[q[0]+x,q[1]+z],[p[0]+x,p[1]+z]],budget));
  }
  return lo <= hi ? [lo,hi] : null;
}
function geometry(element,matrix,budget) {
  const startCount = budget.segments;
  const delta = element.end.map((n,i) => n-element.start[i]),localLength = Math.hypot(...delta),t = delta.map(n => n/localLength);
  const linear = [matrix[0],matrix[1],matrix[2],matrix[3],0,0],v = apply(linear,delta),length = Math.hypot(...v);
  if (!(length > 0) || !Number.isFinite(length)) fail('LIMIT_EXCEEDED','Line cannot be split at this coordinate precision',{limit:'linePrecision'});
  const u = v.map(n => n/length);
  const rotate = ([x,y]) => [x*u[0]+y*u[1],-x*u[1]+y*u[0]],origin = apply(matrix,element.start);
  const frame = point => rotate(point.map((n,i) => n-origin[i]));
  const r = element.strokeWidth/2,n = [-t[1]*r,t[0]*r],cap = element.lineCap;
  let footprint;
  if (cap === 'round') {
    // A line with round ends is its center segment dilated by this same ellipse.
    // Reuse the shared painted cap builder, without a world-sized raster or inverse scale.
    const disc = flattenPaint({...element,start:[0,0],end:[0,0]},linear,budget).polygons[0];
    budget.vertices(disc.length-2,startCount);
    // Preserve the true cap's central symmetry even when its arc sample count is odd.
    footprint = disc.slice(1,-1).flatMap(p => {const q = rotate(p);return [q,q.map(n => -n)];});
  } else {
    const local = cap === 'square'
      ? [[t[0]*r+n[0],t[1]*r+n[1]],[-t[0]*r+n[0],-t[1]*r+n[1]],[-t[0]*r-n[0],-t[1]*r-n[1]],[t[0]*r-n[0],t[1]*r-n[1]]]
      : [n,n.map(n => -n)];
    budget.vertices(local.length,startCount);footprint = local.map(p => rotate(apply(linear,p)));
  }
  return {frame,footprint,length,epsilon:Math.max(1e-7,128*Number.EPSILON*Math.max(1,length,...origin.map(Math.abs)))};
}
function addCut(entry,interval,budget) {
  const [lo,hi] = interval,epsilon = entry.geometry.epsilon/entry.geometry.length,next = [];let start = lo,end = hi,added = false;
  for (const [a,b] of entry.cuts) {
    budget.step();
    if (a <= lo+epsilon && b >= hi-epsilon) return false;
    if (b < start-epsilon) next.push([a,b]);
    else if (a > end+epsilon) {if (!added) {next.push([start,end]);added = true;}next.push([a,b]);}
    else {start = Math.min(start,a);end = Math.max(end,b);}
  }
  if (!added) next.push([start,end]);entry.cuts = next;return true;
}
function survivors(entry,budget) {
  const ranges = [];let start = 0;
  for (const [a,b] of entry.cuts) {budget.step();if (a > start) ranges.push([start,a]);start = b;}
  if (start < 1) ranges.push([start,1]);return ranges;
}

/** Baseline-relative partial erasure of native straight lines only. No pixel masking. */
export class LineCutTester {
  constructor(layer,zoom,{budget=new HitBudget(),maxPieces=20_000}={}) {
    this.layer = layer;this.zoom = zoom;this.budget = budget;this.maxPieces = maxPieces;this.allocated = 0;
    this.entries = [...layer.elements].reverse().filter(e => e.type === 'line').map(element => ({element,bounds:elementBounds(element,layer.offset),geometry:null,cuts:[],ids:[element.id]}));
  }
  sweep(a,b,radius) {
    const changed = [],r = radius+HIT_ERROR,z = this.zoom;
    const box = {left:(Math.min(a[0],b[0])-r)/z,top:(Math.min(a[1],b[1])-r)/z,right:(Math.max(a[0],b[0])+r)/z,bottom:(Math.max(a[1],b[1])+r)/z};
    for (const entry of this.entries) {
      this.budget.step();const {bounds,element:e} = entry;
      if (entry.cuts.length === 1 && entry.cuts[0][0] === 0 && entry.cuts[0][1] === 1) continue;
      if (!bounds || bounds.x > box.right || bounds.y > box.bottom || bounds.x+bounds.width < box.left || bounds.y+bounds.height < box.top) continue;
      entry.geometry ??= geometry(e,multiply(scale(z),multiply(translate(...this.layer.offset),e.transform)),this.budget);
      const g = entry.geometry,p = g.frame(a),q = g.frame(b);this.budget.step(2*g.footprint.length);
      const points = [];
      // Centers whose complete stroke footprint meets the swept eraser capsule.
      // This retracts new round/square caps too, so they cannot grow back into a cut.
      for (const f of g.footprint) {points.push([p[0]-f[0],p[1]-f[1]],[q[0]-f[0],q[1]-f[1]]);}
      const interval = roundedInterval(hull(points,this.budget),r,this.budget);if (!interval) continue;
      const lo = Math.max(0,interval[0]),hi = Math.min(g.length,interval[1]);
      if (hi <= lo || (hi-lo <= g.epsilon && !(lo === 0 && hi === g.length && interval[1]-interval[0] > g.epsilon))) continue;
      if (addCut(entry,[lo/g.length,hi/g.length],this.budget)) changed.push(e.id);
    }
    return changed;
  }
  changes() {
    const changes = [];let count = 0;
    for (const entry of this.entries) {
      this.budget.step();if (!entry.cuts.length) continue;
      const ranges = survivors(entry,this.budget);count += ranges.length;
      if (count > this.maxPieces) fail('LIMIT_EXCEEDED','Too many partial eraser pieces; gesture cancelled',{limit:'eraserPieces',maximum:this.maxPieces});
      while (entry.ids.length < ranges.length) {
        if (++this.allocated > this.maxPieces) fail('LIMIT_EXCEEDED','Partial eraser identity limit exceeded; gesture cancelled',{limit:'eraserPieces',maximum:this.maxPieces});
        entry.ids.push(createId());
      }
      changes.push({id:entry.element.id,ranges,ids:entry.ids.slice(0,ranges.length)});
    }
    return changes;
  }
}

/** Canonical fragment construction preserves style/matrix and native line editability. */
export function lineFragments(element,ranges,ids) {
  if (element.type !== 'line' || !Array.isArray(ranges) || !Array.isArray(ids) || ranges.length !== ids.length
    || Array.from(ids).some(id => typeof id !== 'string' || !id) || new Set(ids).size !== ids.length
    || (ids.length && ids[0] !== element.id)) fail('INVALID_ARGUMENT','Invalid partial line identities');
  let end = -1;
  for (const range of Array.from(ranges)) {
    if (!pair(range) || range[0] < 0 || range[1] > 1 || range[0] >= range[1] || range[0] <= end) fail('INVALID_ARGUMENT','Line ranges must be ordered, disjoint intervals in [0, 1]');
    end = range[1];
  }
  if (ranges.length === 1 && ranges[0][0] === 0 && ranges[0][1] === 1) return [element];
  const point = t => t === 0 ? [...element.start] : t === 1 ? [...element.end] : element.start.map((n,i) => n+(element.end[i]-n)*t);
  const pieces = ranges.map(([a,b]) => ({start:point(a),end:point(b)})).filter(p => p.start.some((n,i) => n !== p.end[i]));
  return pieces.map((piece,i) => ({...element,...piece,id:ids[i]}));
}
