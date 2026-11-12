import {apply} from '../geometry/matrix.js';
import {unionBounds} from '../geometry/paths.js';

/** Tight conservative support for straight native paths. Curve paths deliberately
 * retain the generic envelope. Miter joins are bounded locally, not by expanding
 * the entire icon by miterLimit*radius; no rasterization or supplied DOM needed.
 */
export function straightPaintedBounds(e) {
  if (!e.commands.every(c => ['M','L','Z'].includes(c[0]))) return undefined;
  const m = e.transform,r = e.stroke ? e.strokeWidth/2 : 0;let bounds = null;
  const point = p => {const [x,y] = apply(m,p);bounds = unionBounds(bounds,{x,y,width:0,height:0});};
  const disk = p => {const [cx,cy] = apply(m,p),x = r*Math.hypot(m[0],m[2]),y = r*Math.hypot(m[1],m[3]);bounds = unionBounds(bounds,{x:cx-x,y:cy-y,width:2*x,height:2*y});};
  const join = (p,u,v) => {
    if (!r) return;
    if (e.lineJoin === 'round') {disk(p);return;}
    if (e.lineJoin !== 'miter') return; // Bevel support is inside segment-end normal vertices.
    const den = 1+u[0]*v[0]+u[1]*v[1],limit = e.miterLimit;
    if (den < 128*Number.EPSILON) {
      if (limit >= 1000000) {const [cx,cy] = apply(m,p),x = r*limit*Math.hypot(m[0],m[2]),y = r*limit*Math.hypot(m[1],m[3]);bounds = unionBounds(bounds,{x:cx-x,y:cy-y,width:2*x,height:2*y});}
      return; // Otherwise the nearly reversing join necessarily bevels.
    }
    const ratio = Math.sqrt(2/den);
    if (ratio > limit+128*Number.EPSILON*Math.max(1,ratio,limit)) return;
    const x = -(u[1]+v[1])*r/den,y = (u[0]+v[0])*r/den;
    point([p[0]+x,p[1]+y]);point([p[0]-x,p[1]-y]);
  };
  const cap = (p,u,sign) => {
    if (!r || e.lineCap === 'butt') return;
    if (e.lineCap === 'round') {disk(p);return;}
    for (const side of [-1,1]) point([p[0]+r*(sign*u[0]-side*u[1]),p[1]+r*(sign*u[1]+side*u[0])]);
  };
  let start = null,current = null,first = null,last = null,drawn = false;
  const finish = closed => {
    if (first) {if (closed) join(start,last.u,first.u);else {cap(first.start,first.u,-1);cap(last.end,last.u,1);}}
    else if (drawn && r && e.lineCap === 'round') disk(start);
    first = last = null;drawn = false;
  };
  const segment = end => {
    drawn = true;const dx = end[0]-current[0],dy = end[1]-current[1],length = Math.hypot(dx,dy);
    if (length) {
      const u = [dx/length,dy/length],next = {start:current,end,u};
      if (e.fill) {point(current);point(end);}
      if (r) for (const p of [current,end]) for (const side of [-1,1]) point([p[0]-side*r*u[1],p[1]+side*r*u[0]]);
      if (last) join(current,last.u,u);else first = next;last = next;
    }
    current = end;
  };
  for (const [op,x,y] of e.commands) {
    if (op === 'M') {finish(false);start = current = [x,y];}
    else if (op === 'L') segment([x,y]);
    else {segment(start);finish(true);current = start;}
  }
  finish(false);return bounds;
}
