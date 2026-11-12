import { fail } from '../errors.js';
import { apply, multiply, scale, translate, singularValues } from './matrix.js';
import { elementBounds, traceElementPath } from './paths.js';
import { flattenBezier } from './curves.js';

// Screen-space approximation, not a picking tolerance or an element-scale shortcut.
export const HIT_ERROR = 0.25;
const FLAT = HIT_ERROR/4;
const sub = (a,b) => [a[0]-b[0],a[1]-b[1]];
const dot = (a,b) => a[0]*b[0]+a[1]*b[1];
const cross = (a,b) => a[0]*b[1]-a[1]*b[0];
const unit = v => {const d = Math.hypot(...v);return d ? v.map(n => n/d) : null;};
const normal = t => [-t[1],t[0]];
const shifted = (p,n,r) => [p[0]+n[0]*r,p[1]+n[1]*r];
const clamp = n => Math.max(0,Math.min(1,n));

export class HitBudget {
  constructor({maxSegmentsPerElement=500_000,maxSegments=2_000_000,maxWork=20_000_000} = {}) {
    Object.assign(this,{maxSegmentsPerElement,maxSegments,maxWork,segments:0,work:0});
  }
  step(n=1) {if ((this.work += n) > this.maxWork) fail('LIMIT_EXCEEDED','Eraser hit-test work limit exceeded; gesture cancelled',{limit:'hitWork',maximum:this.maxWork});}
  vertices(n,start) {
    this.step(n);this.segments += n;
    if (this.segments-start > this.maxSegmentsPerElement) fail('LIMIT_EXCEEDED','Element hit geometry is too complex',{limit:'hitSegmentsPerElement',maximum:this.maxSegmentsPerElement});
    if (this.segments > this.maxSegments) fail('LIMIT_EXCEEDED','Gesture hit geometry is too complex',{limit:'hitSegments',maximum:this.maxSegments});
  }
}

function pointSegment(p,a,b) {
  const d = sub(b,a),length = dot(d,d),t = length ? clamp(dot(sub(p,a),d)/length) : 0;
  const q = [a[0]+t*d[0],a[1]+t*d[1]],v = sub(p,q);
  return {distance:dot(v,v),q};
}
/** Closest point on c--d to the entire a--b sweep, including crossings/zero lengths. */
function segmentDistance(a,b,c,d) {
  const u = sub(b,a),v = sub(d,c),w = sub(c,a),den = cross(u,v);
  if (den !== 0) {
    const t = cross(w,v)/den,s = cross(w,u)/den;
    if (t >= 0 && t <= 1 && s >= 0 && s <= 1) return {distance:0,q:[c[0]+s*v[0],c[1]+s*v[1]]};
  }
  const candidates = [pointSegment(a,c,d),pointSegment(b,c,d)];
  for (const p of [c,d]) candidates.push({distance:pointSegment(p,a,b).distance,q:p});
  return candidates.reduce((best,next) => next.distance < best.distance ? next : best);
}
function* edges(contours,budget) {
  for (const points of contours) for (let i = 0;i < points.length;i++) {
    budget.step();yield [points[i],points[(i+1)%points.length]];
  }
}
function winding(contours,p,budget) {
  let n = 0;
  for (const [a,b] of edges(contours,budget)) {
    const side = cross(sub(b,a),sub(p,a));
    if (a[1] <= p[1] && b[1] > p[1] && side > 0) n++;
    else if (a[1] > p[1] && b[1] <= p[1] && side < 0) n--;
  }
  return n;
}
const filled = (n,rule) => rule === 'evenodd' ? Math.abs(n)%2 === 1 : n !== 0;
function fillHit(contours,rule,a,b,r,budget) {
  if (filled(winding(contours,a,budget),rule) || filled(winding(contours,b,budget),rule)) return true;
  for (const [c,d] of edges(contours,budget)) {
    const v = sub(d,c),length = Math.hypot(...v);if (!length) continue;
    const nearest = segmentDistance(a,b,c,d);if (nearest.distance > r*r) continue;
    // Move off vertices ALONG the edge, without stepping across a potentially tiny
    // filled sliver. Coincident opposite/duplicate contours must not become paint.
    const t = dot(sub(nearest.q,c),v)/(length*length),margin = Math.min(1e-6,0.001/length);
    const s = Math.max(margin,Math.min(1-margin,t)),q = [c[0]+s*v[0],c[1]+s*v[1]];
    if (filled(winding(contours,q,budget),rule)) return true;
    let multiplicity = 0;
    for (const [p,z] of edges(contours,budget)) {
      const e = sub(z,p),el = Math.hypot(...e);if (!el) continue;
      // Only overlapping, collinear edges count; do not use a pixel-sized epsilon
      // which could collapse genuinely thin fill into an empty coincident contour.
      const epsilon = 32*Number.EPSILON*Math.max(1,Math.abs(q[0]),Math.abs(q[1]));
      if (Math.abs(cross(v,e)) > 32*Number.EPSILON*length*el) continue;
      if (pointSegment(q,p,z).distance > epsilon*epsilon) continue;
      multiplicity += dot(v,e) > 0 ? 1 : -1;
    }
    if (filled(multiplicity,rule)) return true;
  }
  return false;
}
function polygonHit(points,a,b,r,budget) {
  if (winding([points],a,budget) || winding([points],b,budget)) return true;
  for (const [c,d] of edges([points],budget)) if (segmentDistance(a,b,c,d).distance <= r*r) return true;
  return false;
}

/** Build painted polygons from the renderer's normalized commands, before affine mapping. */
export function flattenPaint(element,matrix,budget = new HitBudget()) {
  const startCount = budget.segments,contours = [],polygons = [],paths = [];
  const radius = element.stroke ? element.strokeWidth/2 : 0,operator = singularValues(matrix)[1];
  let path = null,current = null;
  const record = points => {budget.vertices(points.length,startCount);return points.map(p => apply(matrix,p));};
  const polygon = points => {if (points.length >= 3) polygons.push(record(points));};
  function arc(center,r,from,angle) {
    const errorRadius = Math.max(r*operator,FLAT),step = Math.min(Math.PI/4,2*Math.acos(Math.max(-1,1-FLAT/errorRadius)));
    const count = Math.max(1,Math.ceil(Math.abs(angle)/step));
    // Check before allocating a potentially hostile arc array.
    budget.vertices(count+2,startCount);
    const points = [apply(matrix,center)];
    for (let i = 0;i <= count;i++) points.push(apply(matrix,[center[0]+r*Math.cos(from+angle*i/count),center[1]+r*Math.sin(from+angle*i/count)]));
    polygons.push(points);
  }
  function begin(p) {budget.vertices(1,startCount);path = {points:[p],runs:[],closed:false,drawn:false};paths.push(path);current = p;}
  function run(segments,end) {
    path.drawn = true;path.runs.push(segments);
    for (const segment of segments) path.points.push(segment.b);
    current = end;
  }
  function line(p) {
    const t = unit(sub(p,current));budget.vertices(1,startCount);run(t ? [{a:current,b:p,ta:t,tb:t}] : [],p);
  }
  function curve(control) {
    const original = [current,...control],degree = original.length-1;
    const derivatives = original.slice(1).map((p,i) => sub(p,original[i]));
    const tangent = t => {
      let row = derivatives;
      while (row.length > 1) row = row.slice(1).map((p,i) => [(1-t)*row[i][0]+t*p[0],(1-t)*row[i][1]+t*p[1]]);
      return unit(row[0]) ?? unit(t < 0.5 ? sub(original.find(p => p[0] !== original[0][0] || p[1] !== original[0][1]) ?? original.at(-1),original[0])
        : sub(original.at(-1),[...original].reverse().find(p => p[0] !== original.at(-1)[0] || p[1] !== original.at(-1)[1]) ?? original[0]));
    };
    const accept = points => {
      budget.step();const screen = points.map(p => apply(matrix,p)),first = screen[0],last = screen.at(-1);
      for (let i = 1;i < screen.length-1;i++) {
        const t = i/(screen.length-1);
        if (Math.hypot(screen[i][0]-((1-t)*first[0]+t*last[0]),screen[i][1]-((1-t)*first[1]+t*last[1])) > FLAT) return false;
      }
      if (radius) {
        const chord = unit(sub(points.at(-1),points[0]));
        for (let i = 1;i < points.length;i++) {
          const edge = unit(sub(points[i],points[i-1]));if (!edge) continue;
          if (!chord || radius*operator*(1-Math.min(1,dot(edge,chord))) > FLAT) return false;
        }
      }
      return true;
    };
    const segments = [];let previous = null;
    for (const p of flattenBezier(original.map((p,i) => [...p,i/degree]),{tolerance:Infinity,accept,maxSegments:budget.maxSegmentsPerElement})) {
      const point = p.slice(0,2),t = tangent(p[2]);
      if (previous && t && previous.t) {budget.vertices(1,startCount);segments.push({a:previous.point,b:point,ta:previous.t,tb:t});}
      budget.step();previous = {point,t};
    }
    run(segments,original.at(-1));
  }
  const sink = {
    moveTo(x,y) {begin([x,y]);},lineTo(x,y) {line([x,y]);},
    quadraticCurveTo(x,y,a,b) {curve([[x,y],[a,b]]);},bezierCurveTo(x,y,a,b,c,d) {curve([[x,y],[a,b],[c,d]]);},
    closePath() {if (current[0] !== path.points[0][0] || current[1] !== path.points[0][1]) line(path.points[0]);path.closed = true;current = path.points[0];},
    rect(x,y,w,h) {begin([x,y]);line([x+w,y]);line([x+w,y+h]);line([x,y+h]);this.closePath();},
    ellipse(cx,cy,rx,ry) {
      begin([cx+rx,cy]);const segments = [];
      const point = a => [cx+rx*Math.cos(a),cy+ry*Math.sin(a)];
      const tangent = a => unit([-rx*Math.sin(a),ry*Math.cos(a)]);
      function subdivide(a,b,depth=0) {
        budget.step();const m = (a+b)/2,p = point(a),q = point(b),mid = point(m),s = apply(matrix,p),t = apply(matrix,q),u = apply(matrix,mid);
        const normalError = radius*operator*Math.max(1-dot(tangent(a),tangent(m)),1-dot(tangent(b),tangent(m)));
        if (Math.hypot(u[0]-(s[0]+t[0])/2,u[1]-(s[1]+t[1])/2) > FLAT || normalError > FLAT) {
          if (depth >= 48) fail('LIMIT_EXCEEDED','Ellipse hit geometry cannot be subdivided safely');
          subdivide(a,m,depth+1);subdivide(m,b,depth+1);return;
        }
        budget.vertices(1,startCount);segments.push({a:p,b:q,ta:tangent(a),tb:tangent(b)});
      }
      for (let i = 0;i < 4;i++) subdivide(i*Math.PI/2,(i+1)*Math.PI/2);
      segments.at(-1).b = path.points[0];segments.at(-1).tb = [0,1];run(segments,path.points[0]);path.closed = true;
    },
  };
  if (element.type === 'image') {
    const {x,y,width:w,height:h} = element;polygon([[x,y],[x+w,y],[x+w,y+h],[x,y+h]]);
  } else traceElementPath(sink,element);
  const fill = ['stroke','highlight','ink'].includes(element.type) ? element.color : element.fill;
  for (const p of paths) {
    if (fill && p.drawn && p.points.length >= 3) {
      // Validated ink is a union of positive convex parts, never cancelling contours.
      // Query each part directly instead of quadratic general winding/multiplicity work.
      (element.type === 'ink' ? polygons : contours).push(record(p.points));
    } // Canvas fills implicitly close open subpaths.
    if (!radius) continue;
    const runs = p.runs.filter(run => run.length);
    for (const run of runs) for (const s of run) {
      const na = normal(s.ta),nb = normal(s.tb);
      polygon([shifted(s.a,na,radius),shifted(s.b,nb,radius),shifted(s.b,nb,-radius),shifted(s.a,na,-radius)]);
    }
    function join(point,a,b) {
      const turn = Math.atan2(cross(a,b),dot(a,b));if (Math.abs(turn) < 1e-12) return;
      const side = turn > 0 ? -1 : 1,n0 = normal(a).map(n => n*side),n1 = normal(b).map(n => n*side);
      const first = shifted(point,n0,radius),last = shifted(point,n1,radius),style = element.lineJoin ?? 'round';
      if (style === 'round') arc(point,radius,Math.atan2(n0[1],n0[0]),turn);
      else if (style === 'miter' && 1/Math.cos(turn/2) <= (element.miterLimit ?? 4)) {
        const factor = radius/(1+dot(a,b));polygon([point,first,[point[0]+(n0[0]+n1[0])*factor,point[1]+(n0[1]+n1[1])*factor],last]);
      } else polygon([point,first,last]);
    }
    for (let i = 1;i < runs.length;i++) join(runs[i][0].a,runs[i-1].at(-1).tb,runs[i][0].ta);
    if (p.closed && runs.length) join(runs[0][0].a,runs.at(-1).at(-1).tb,runs[0][0].ta);
    else if (runs.length) {
      const first = runs[0][0],last = runs.at(-1).at(-1),cap = element.lineCap ?? 'butt';
      for (const [point,t,sign] of [[first.a,first.ta,-1],[last.b,last.tb,1]]) {
        const n = normal(t);
        if (cap === 'round') arc(point,radius,Math.atan2(n[1],n[0])+(sign === 1 ? Math.PI : 0),Math.PI);
        else if (cap === 'square') {
          const a = shifted(point,n,radius),b = shifted(point,n,-radius);polygon([a,b,shifted(b,t,sign*radius),shifted(a,t,sign*radius)]);
        }
      }
    } else if (p.drawn) {
      if (element.lineCap === 'round') arc(p.points[0],radius,0,2*Math.PI);
      else if (element.lineCap === 'square') {const [x,y] = p.points[0];polygon([[x-radius,y-radius],[x+radius,y-radius],[x+radius,y+radius],[x-radius,y+radius]]);}
    }
  }
  return {contours,polygons,fillRule:element.fillRule ?? 'nonzero'};
}

/** Per-gesture, bounded and lazily built screen geometry. Images ignore pixel alpha. */
export class SweptHitTester {
  constructor(layer,zoom,{budget = new HitBudget(),exact = () => false} = {}) {
    this.budget = budget;this.exact = exact;this.zoom = zoom;this.offset = layer.offset;this.cache = new Map();
    this.remaining = new Map([...layer.elements].reverse().map(e => [e,elementBounds(e,layer.offset)]));
  }
  sweep(a,b,radius) {
    const hits = [],r = radius+HIT_ERROR,z = this.zoom;
    const box = {left:(Math.min(a[0],b[0])-r)/z,top:(Math.min(a[1],b[1])-r)/z,right:(Math.max(a[0],b[0])+r)/z,bottom:(Math.max(a[1],b[1])+r)/z};
    for (const [e,bounds] of this.remaining) {
      this.budget.step();if (!bounds || bounds.x > box.right || bounds.y > box.bottom || bounds.x+bounds.width < box.left || bounds.y+bounds.height < box.top) continue;
      const matrix = multiply(scale(z),multiply(translate(...this.offset),e.transform));
      let hit = e.type !== 'image' && (this.exact(e,matrix,a,this.budget) || this.exact(e,matrix,b,this.budget));
      if (!hit) {
        let geometry = this.cache.get(e);
        if (!geometry) {geometry = flattenPaint(e,matrix,this.budget);this.cache.set(e,geometry);}
        hit = geometry.polygons.some(p => polygonHit(p,a,b,r,this.budget)) || fillHit(geometry.contours,geometry.fillRule,a,b,r,this.budget);
      }
      if (hit) {
        hits.push(e.id);this.remaining.delete(e);this.cache.delete(e);
      }
    }
    return hits;
  }
}
