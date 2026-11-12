import { fail } from '../errors.js';

/**
 * Bounded de Casteljau subdivision; extra coordinates (e.g. radius) interpolate too.
 * An optional accept predicate adds screen-space/stroke-normal flatness checks.
 */
export function* flattenBezier(points, { tolerance = 0.2, maxStep = Infinity, maxSegments = 500_000, accept = () => true } = {}) {
  const stack = [{ points, depth: 0 }];
  let work = 0, segments = 0;
  yield points[0];
  while (stack.length) {
    if (++work > maxSegments*2) fail('LIMIT_EXCEEDED', 'Curve subdivision work limit exceeded', {limit:'derivedSegments',maximum:maxSegments});
    const {points: p, depth} = stack.pop(), first = p[0], last = p.at(-1);
    let deviation = 0;
    for (let i = 1; i < p.length-1; i++) {
      const t = i/(p.length-1);
      deviation = Math.max(deviation, Math.hypot(...p[i].map((n,j) => n-((1-t)*first[j]+t*last[j]))));
    }
    if (deviation <= tolerance && Math.hypot(last[0]-first[0],last[1]-first[1]) <= maxStep && accept(p)) {
      if (++segments > maxSegments) fail('LIMIT_EXCEEDED', 'Curve segment limit exceeded', {limit:'derivedSegments',maximum:maxSegments});
      yield last; continue;
    }
    if (depth >= 48) fail('LIMIT_EXCEEDED', 'Curve cannot be subdivided safely', {limit:'curveDepth',maximum:48});
    const left = [first], right = [last];
    let row = p;
    while (row.length > 1) {
      const next = [];
      for (let i = 0; i < row.length-1; i++) next.push(row[i].map((n,j) => (n+row[i+1][j])/2));
      left.push(next[0]); right.push(next.at(-1)); row = next;
    }
    stack.push({points:right.reverse(),depth:depth+1}, {points:left,depth:depth+1});
  }
}
