import { fail } from '../errors.js';

export const cross = (a,b,c) => (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
export function polygonBounds(points) {
  let x = Infinity,y = Infinity,right = -Infinity,bottom = -Infinity;
  for (const p of points) {x = Math.min(x,p[0]);y = Math.min(y,p[1]);right = Math.max(right,p[0]);bottom = Math.max(bottom,p[1]);}
  return {x,y,width:right-x,height:bottom-y};
}
export const overlaps = (a,b,epsilon=0) => a.x <= b.x+b.width+epsilon && b.x <= a.x+a.width+epsilon && a.y <= b.y+b.height+epsilon && b.y <= a.y+a.height+epsilon;
export function area(points) {
  let sum = 0;const origin = points[0];
  for (let i = 1;i < points.length-1;i++) sum += cross(origin,points[i],points[i+1]);
  return sum/2;
}
/** Sufficient convexity check for a closed Bezier control polygon. Reject stars too. */
export function positiveConvex(points) {
  const p = points.filter((p,i) => !i || p[0] !== points[i-1][0] || p[1] !== points[i-1][1]);
  if (p.length > 1 && p[0][0] === p.at(-1)[0] && p[0][1] === p.at(-1)[1]) p.pop();
  if (p.length < 3 || !(area(p) > 0)) return false;
  let turns = 0;
  for (let i = 0;i < p.length;i++) {
    const a = p[i],b = p[(i+1)%p.length],c = p[(i+2)%p.length],u = [b[0]-a[0],b[1]-a[1]],v = [c[0]-b[0],c[1]-b[1]];
    const z = u[0]*v[1]-u[1]*v[0],dot = u[0]*v[0]+u[1]*v[1],epsilon = 256*Number.EPSILON*Math.hypot(...u)*Math.hypot(...v);
    if (z < -epsilon) return false;
    turns += Math.atan2(Math.max(0,z),dot);
  }
  return Math.abs(turns-2*Math.PI) < 1e-5;
}
/** Monotone-chain hull, with shared sort/work accounting. Sorts points in place. */
export function hull(points,budget) {
  budget.step(Math.ceil(points.length*Math.log2(Math.max(2,points.length))));
  points.sort((a,b) => a[0]-b[0] || a[1]-b[1]);
  const half = p => {const out = [];for (const q of p) {while (out.length > 1 && cross(out.at(-2),out.at(-1),q) <= 0) out.pop();out.push(q);}out.pop();return out;};
  return [...half(points),...half([...points].reverse())];
}
/** Circumscribed screen-space capsule; excess radius <= tolerance. */
export function capsule(a,b,radius,budget,tolerance=0.02) {
  const count = Math.max(12,Math.ceil(Math.PI/Math.acos(radius/(radius+tolerance))));
  if (!Number.isFinite(count) || count > 1024) fail('LIMIT_EXCEEDED','Eraser capsule is too complex');
  budget.vertices(2*count,budget.segments);
  const r = radius/Math.cos(Math.PI/count),points = [];
  for (let i = 0;i < count;i++) {const t = i*2*Math.PI/count,x = r*Math.cos(t),y = r*Math.sin(t);points.push([a[0]+x,a[1]+y],[b[0]+x,b[1]+y]);}
  return hull(points,budget);
}
/** Linear-time convex SAT via rotating support vertices. Positive epsilon includes touch. */
export function intersects(a,b,budget,epsilon=0) {
  budget.step(a.length+b.length);
  const ccw = p => area(p) < 0 ? [...p].reverse() : p;
  a = ccw(a);b = ccw(b);
  for (const [polygon,other] of [[a,b],[b,a]]) {
    let support = 0,advances = 0;
    const first = polygon[0],second = polygon[1];
    for (let j = 1;j < other.length;j++) {budget.step();if (cross(first,second,other[j]) >= cross(first,second,other[support])) support = j;}
    for (let i = 0;i < polygon.length;i++) {
      budget.step();const p = polygon[i],q = polygon[(i+1)%polygon.length],length = Math.hypot(q[0]-p[0],q[1]-p[1]);if (!length) continue;
      while (cross(p,q,other[(support+1)%other.length]) > cross(p,q,other[support])) {
        budget.step();support = (support+1)%other.length;
        if (++advances > 2*other.length+2) fail('LIMIT_EXCEEDED','Ink support geometry cannot be queried safely');
      }
      if (cross(p,q,other[support]) <= -epsilon*length) return false;
    }
  }
  return true;
}
function halfPlane(points,a,b,inside,budget) {
  const out = [];
  for (let i = 0;i < points.length;i++) {
    budget.step();const p = points[i],q = points[(i+1)%points.length],dp = cross(a,b,p),dq = cross(a,b,q),pin = inside ? dp >= 0 : dp <= 0,qin = inside ? dq >= 0 : dq <= 0;
    if (pin) out.push(p);
    if (pin !== qin) {const t = dp/(dp-dq);out.push(p.map((n,j) => n+(q[j]-n)*t));}
  }
  // Exact duplicate intersections otherwise produce zero edges in native ink.
  return out.filter((p,i) => p[0] !== out[(i+out.length-1)%out.length][0] || p[1] !== out[(i+out.length-1)%out.length][1]);
}
/** Disjoint-interior convex pieces of subject minus a CCW convex cutter. */
export function subtract(subject,cutter,budget,onVertices) {
  const pieces = [];let rest = subject;
  for (let i = 0;i < cutter.length && rest.length >= 3;i++) {
    const a = cutter[i],b = cutter[(i+1)%cutter.length],outside = halfPlane(rest,a,b,false,budget);
    if (outside.length >= 3 && Math.abs(area(outside)) > 1e-14) {onVertices(outside.length);pieces.push(outside);}
    rest = halfPlane(rest,a,b,true,budget);
  }
  return pieces;
}
/** Sweep-and-prune connectivity; SAT and all broad-phase pairs share the work cap. */
export function components(parts,budget) {
  const sorted = parts.map((part,index) => ({part,index}));budget.step(Math.ceil(parts.length*Math.log2(Math.max(2,parts.length))));
  sorted.sort((a,b) => a.part.bounds.x-b.part.bounds.x || a.index-b.index);
  const parent = parts.map((_,i) => i),root = i => {while (parent[i] !== i) {budget.step();parent[i] = parent[parent[i]];i = parent[i];}return i;};
  let active = [];
  for (const {part,index} of sorted) {
    active = active.filter(p => {budget.step();return p.part.bounds.x+p.part.bounds.width >= part.bounds.x-1e-7;});
    for (const other of active) {
      budget.step();const r = root(index),s = root(other.index);if (r === s || !overlaps(part.bounds,other.part.bounds,1e-7)) continue;
      if (intersects(part.polygon,other.part.polygon,budget,1e-7)) parent[r] = s;
    }
    active.push({part,index});
  }
  const groups = new Map();
  parts.forEach((p,i) => {const r = root(i);if (!groups.has(r)) groups.set(r,[]);groups.get(r).push(p.commands);});
  return [...groups.values()];
}
