/** Canvas/SVG matrices, applied right to left. No browser globals. */
export const IDENTITY = Object.freeze([1, 0, 0, 1, 0, 0]);
export const translate = (x, y) => [1, 0, 0, 1, x, y];
export const scale = (x, y = x) => [x, 0, 0, y, 0, 0];

export function multiply([a, b, c, d, e, f], [g, h, i, j, k, l]) {
  return [a*g + c*h, b*g + d*h, a*i + c*j, b*i + d*j,
    a*k + c*l + e, b*k + d*l + f];
}

export function apply([a, b, c, d, e, f], [x, y]) {
  return [a*x + c*y + e, b*x + d*y + f];
}

export function inverse([a, b, c, d, e, f]) {
  const det = a*d - b*c;
  if (!Number.isFinite(det) || det === 0) throw new RangeError('Singular affine matrix');
  return [d/det, -b/det, -c/det, a/det, (c*f - d*e)/det, (b*e - a*f)/det];
}

/** Stable singular values of the 2x2 linear part, smallest first. */
export function singularValues([a, b, c, d]) {
  const sum = a*a + b*b + c*c + d*d;
  const det = a*d - b*c;
  const high = Math.sqrt(Math.max(0, (sum + Math.sqrt(Math.max(0, sum*sum - 4*det*det))) / 2));
  return [high === 0 ? 0 : Math.abs(det) / high, high];
}

export function transformBounds(matrix, bounds) {
  if (!bounds) return null;
  const { x, y, width, height } = bounds;
  const points = [[x,y], [x+width,y], [x,y+height], [x+width,y+height]].map(p => apply(matrix, p));
  const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
  const left = Math.min(...xs), top = Math.min(...ys);
  return { x: left, y: top, width: Math.max(...xs)-left, height: Math.max(...ys)-top };
}

export function screenToWorld([x, y], { zoom, pan }) {
  return [(x-pan[0])/zoom, (y-pan[1])/zoom];
}

export function worldToScreen([x, y], { zoom, pan }) {
  return [x*zoom+pan[0], y*zoom+pan[1]];
}
