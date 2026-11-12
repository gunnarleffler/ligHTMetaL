// src/etch/errors.js
var EtchError = class extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "EtchError";
    this.code = code;
    this.details = structuredClone(details);
  }
};
function fail(code, message, details) {
  throw new EtchError(code, message, details);
}

// src/etch/background.js
var MAX_PAPER_LINES = 5e4;
var PAPER_STYLES = Object.freeze({
  dots: Object.freeze({ name: "Dot grid", color: "#FFFFFF", line: "#B8C5D6", dots: true }),
  graph: Object.freeze({ name: "Graph paper", color: "#FFFFFF", line: "#D5DFED" }),
  ruled: Object.freeze({ name: "Ruled paper", color: "#FFFFFF", line: "#B8CDE6" }),
  engineering: Object.freeze({ name: "Engineering paper", color: "#F1F7E9", line: "#CFDEC5", major: "#9EB895" })
});
function normalizeBackground(value2, code = "INVALID_DOCUMENT", strict = false) {
  if (value2 === null) return null;
  if (typeof value2 === "string" && /^#[\da-f]{6}$/i.test(value2)) return value2.toUpperCase();
  if (!value2 || typeof value2 !== "object" || Array.isArray(value2) || ![Object.prototype, null].includes(Object.getPrototypeOf(value2)) || typeof value2.type !== "string" || !Object.hasOwn(PAPER_STYLES, value2.type) || !Number.isInteger(value2.spacing) || value2.spacing < 8 || value2.spacing > 128 || strict && Object.keys(value2).some((key) => !["type", "spacing"].includes(key))) {
    fail(code, "Background requires null, opaque #RRGGBB, or paper {type:dots|graph|ruled|engineering, spacing:integer 8\u2013128}", { path: "background" });
  }
  return { type: value2.type, spacing: value2.spacing };
}
function describeBackground(value2) {
  return value2 === null ? "transparent" : typeof value2 === "string" ? value2 : `${PAPER_STYLES[value2.type].name} (${value2.spacing} world units)`;
}
function paperGrid(paper) {
  const style = PAPER_STYLES[paper.type];
  const groups = [{ color: style.line, width: 0.5, spacing: paper.spacing, vertical: paper.type !== "ruled" }];
  if (style.major) groups.push({ color: style.major, width: 1, spacing: paper.spacing * 5, vertical: true });
  return { color: style.color, size: paper.spacing * (style.major ? 5 : 1), groups, dots: Boolean(style.dots) };
}
function paperBands(paper, { width: width2, height, scale: scale2, pan }) {
  const grid = paperGrid(paper), bands = [];
  let work = 0;
  for (const group of grid.groups) {
    const step = group.spacing * scale2, lineWidth = group.width * scale2;
    if (!Number.isFinite(step) || step <= 0) fail("LIMIT_EXCEEDED", "Paper scale exceeds numeric limits", { limit: "paperLines", maximum: MAX_PAPER_LINES });
    for (const axis of group.vertical ? [0, 1] : [1]) {
      const count = Math.ceil((axis === 0 ? width2 : height) / step) + 2;
      work += count;
      if (work > MAX_PAPER_LINES) fail("LIMIT_EXCEEDED", "Paper grid is too dense for this output; reduce crop size or increase spacing", { limit: "paperLines", maximum: MAX_PAPER_LINES });
      bands.push({ axis, count, step, lineWidth, color: group.color, start: (pan[axis] % step + step) % step - step });
    }
  }
  if (grid.dots) {
    const count = bands[0].count * bands[1].count;
    if (count > MAX_PAPER_LINES) fail("LIMIT_EXCEEDED", "Dot grid is too dense for this output; reduce crop size or increase spacing", { limit: "paperLines", maximum: MAX_PAPER_LINES });
  }
  return { color: grid.color, bands, dots: grid.dots };
}

// src/etch/geometry/matrix.js
var IDENTITY = Object.freeze([1, 0, 0, 1, 0, 0]);
var translate = (x, y) => [1, 0, 0, 1, x, y];
var scale = (x, y = x) => [x, 0, 0, y, 0, 0];
function multiply([a, b, c, d, e, f], [g, h, i, j, k, l]) {
  return [
    a * g + c * h,
    b * g + d * h,
    a * i + c * j,
    b * i + d * j,
    a * k + c * l + e,
    b * k + d * l + f
  ];
}
function apply([a, b, c, d, e, f], [x, y]) {
  return [a * x + c * y + e, b * x + d * y + f];
}
function inverse([a, b, c, d, e, f]) {
  const det = a * d - b * c;
  if (!Number.isFinite(det) || det === 0) throw new RangeError("Singular affine matrix");
  return [d / det, -b / det, -c / det, a / det, (c * f - d * e) / det, (b * e - a * f) / det];
}
function singularValues([a, b, c, d]) {
  const sum = a * a + b * b + c * c + d * d;
  const det = a * d - b * c;
  const high = Math.sqrt(Math.max(0, (sum + Math.sqrt(Math.max(0, sum * sum - 4 * det * det))) / 2));
  return [high === 0 ? 0 : Math.abs(det) / high, high];
}
function transformBounds(matrix, bounds) {
  if (!bounds) return null;
  const { x, y, width: width2, height } = bounds;
  const points = [[x, y], [x + width2, y], [x, y + height], [x + width2, y + height]].map((p) => apply(matrix, p));
  const xs = points.map((p) => p[0]), ys = points.map((p) => p[1]);
  const left = Math.min(...xs), top = Math.min(...ys);
  return { x: left, y: top, width: Math.max(...xs) - left, height: Math.max(...ys) - top };
}
function screenToWorld([x, y], { zoom, pan }) {
  return [(x - pan[0]) / zoom, (y - pan[1]) / zoom];
}

// src/etch/geometry/curves.js
function* flattenBezier(points, { tolerance = 0.2, maxStep = Infinity, maxSegments = 5e5, accept = () => true } = {}) {
  const stack = [{ points, depth: 0 }];
  let work = 0, segments = 0;
  yield points[0];
  while (stack.length) {
    if (++work > maxSegments * 2) fail("LIMIT_EXCEEDED", "Curve subdivision work limit exceeded", { limit: "derivedSegments", maximum: maxSegments });
    const { points: p, depth } = stack.pop(), first = p[0], last = p.at(-1);
    let deviation = 0;
    for (let i = 1; i < p.length - 1; i++) {
      const t = i / (p.length - 1);
      deviation = Math.max(deviation, Math.hypot(...p[i].map((n, j) => n - ((1 - t) * first[j] + t * last[j]))));
    }
    if (deviation <= tolerance && Math.hypot(last[0] - first[0], last[1] - first[1]) <= maxStep && accept(p)) {
      if (++segments > maxSegments) fail("LIMIT_EXCEEDED", "Curve segment limit exceeded", { limit: "derivedSegments", maximum: maxSegments });
      yield last;
      continue;
    }
    if (depth >= 48) fail("LIMIT_EXCEEDED", "Curve cannot be subdivided safely", { limit: "curveDepth", maximum: 48 });
    const left = [first], right = [last];
    let row = p;
    while (row.length > 1) {
      const next = [];
      for (let i = 0; i < row.length - 1; i++) next.push(row[i].map((n, j) => (n + row[i + 1][j]) / 2));
      left.push(next[0]);
      right.push(next.at(-1));
      row = next;
    }
    stack.push({ points: right.reverse(), depth: depth + 1 }, { points: left, depth: depth + 1 });
  }
}

// src/etch/geometry/stroke.js
var MAX_STROKE_SEGMENTS = 5e5;
var TOLERANCE = 0.2;
var midpoint = (a, b) => a.map((n, i) => (n + b[i]) / 2);
function* strokeSegments(points) {
  if (points.length < 2) return;
  if (points.length === 2) {
    yield [points[0], points[1]];
    return;
  }
  let start = midpoint(points[0], points[1]);
  yield [points[0], start];
  for (let i = 1; i < points.length - 1; i++) {
    const end = midpoint(points[i], points[i + 1]);
    yield [start, points[i], end];
    start = end;
  }
  yield [start, points.at(-1)];
}
function visitStrokeOutline(stroke, emit, { maxSegments = MAX_STROKE_SEGMENTS } = {}) {
  let count = 0;
  const account = (amount) => {
    if (count + amount > maxSegments) fail("LIMIT_EXCEEDED", "Pressure outline is too complex", { limit: "derivedSegments", maximum: maxSegments });
    count += amount;
  };
  const radiusPoint = ([x, y, p]) => [x, y, stroke.width / 2 * (stroke.pressure ? 0.2 + 0.8 * p : 1)];
  function disc([x, y, r]) {
    const safeAngle = Math.min(Math.PI / 2, Math.pow(TOLERANCE * 1e3 / r, 1 / 6));
    const parts = 4 * Math.max(1, Math.ceil(Math.PI / 2 / safeAngle));
    account(parts + 2);
    if (!emit) return;
    const step = 2 * Math.PI / parts, k = 4 / 3 * Math.tan(step / 4);
    emit(["M", x + r, y]);
    for (let i = 0; i < parts; i++) {
      const a = i * step, b = (i + 1) * step;
      emit([
        "C",
        x + r * (Math.cos(a) - k * Math.sin(a)),
        y + r * (Math.sin(a) + k * Math.cos(a)),
        x + r * (Math.cos(b) + k * Math.sin(b)),
        y + r * (Math.sin(b) - k * Math.cos(b)),
        x + r * Math.cos(b),
        y + r * Math.sin(b)
      ]);
    }
    emit(["Z"]);
  }
  let previous = radiusPoint(stroke.points[0]);
  disc(previous);
  for (const segment of strokeSegments(stroke.points)) {
    const curve = segment.map(radiusPoint);
    const maxStep = Math.min(...curve.map((p) => p[2])) / 2;
    let first = true;
    for (const point of flattenBezier(curve, { tolerance: TOLERANCE, maxStep, maxSegments })) {
      if (first) {
        first = false;
        continue;
      }
      const [x, y, r] = point, [px, py, pr] = previous;
      const length = Math.hypot(x - px, y - py);
      if (length) {
        account(5);
        if (emit) {
          const nx = -(y - py) / length, ny = (x - px) / length;
          emit(["M", px - nx * pr, py - ny * pr]);
          emit(["L", x - nx * r, y - ny * r]);
          emit(["L", x + nx * r, y + ny * r]);
          emit(["L", px + nx * pr, py + ny * pr]);
          emit(["Z"]);
        }
      }
      if (length || r !== pr) disc(point);
      previous = point;
    }
  }
  return count;
}

// src/etch/geometry/paths.js
var immutableData = /* @__PURE__ */ new WeakSet();
var checking = /* @__PURE__ */ new WeakSet();
var localBoundsCache = /* @__PURE__ */ new WeakMap();
var visibleBoundsCache = /* @__PURE__ */ new WeakMap();
var allBoundsCache = /* @__PURE__ */ new WeakMap();
function deeplyImmutable(value2) {
  if (value2 === null || typeof value2 !== "object") return typeof value2 !== "function";
  if (immutableData.has(value2)) return true;
  if (!Object.isFrozen(value2) || checking.has(value2)) return false;
  if (![Object.prototype, Array.prototype, null].includes(Object.getPrototypeOf(value2))) return false;
  checking.add(value2);
  const safe = Reflect.ownKeys(value2).every((key) => {
    const d = Object.getOwnPropertyDescriptor(value2, key);
    return Object.hasOwn(d, "value") && deeplyImmutable(d.value);
  });
  checking.delete(value2);
  if (safe) immutableData.add(value2);
  return safe;
}
function reuseBounds(cache, value2, calculate) {
  if (!deeplyImmutable(value2)) return calculate();
  if (!cache.has(value2)) cache.set(value2, calculate());
  const bounds = cache.get(value2);
  return bounds && { ...bounds };
}
function unionBounds(a, b) {
  if (!a) return b && { ...b };
  if (!b) return { ...a };
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
  return {
    x,
    y,
    width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y
  };
}
function expandBounds(b, padding) {
  return b && { x: b.x - padding, y: b.y - padding, width: b.width + 2 * padding, height: b.height + 2 * padding };
}
function pointBounds(x, y) {
  return { x, y, width: 0, height: 0 };
}
function roots(a, b, c) {
  if (Math.abs(a) < 1e-15) return b === 0 ? [] : [-c / b];
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return [];
  const q = -0.5 * (b + (b < 0 ? -1 : 1) * Math.sqrt(discriminant));
  return q === 0 ? [-b / (2 * a)] : [q / a, c / q];
}
function pathBounds(commands) {
  let current = [0, 0], start = current, bounds = null, drawn = false;
  const include = ([x, y]) => {
    bounds = unionBounds(bounds, pointBounds(x, y));
  };
  for (const [op, ...n] of commands) {
    if (op === "M") {
      current = n;
      start = n;
      drawn = false;
      continue;
    }
    if (op === "Z" && !drawn) continue;
    drawn = true;
    const end = op === "Z" ? start : n.slice(-2);
    include(current);
    include(end);
    if (op === "Q" || op === "C") {
      const candidates = [];
      for (let axis = 0; axis < 2; axis++) {
        const p = current[axis], q = n[axis], r = n[axis + 2];
        if (op === "Q") {
          const denominator = p - 2 * q + r;
          if (denominator !== 0) candidates.push((p - q) / denominator);
        } else {
          const s = n[axis + 4];
          candidates.push(...roots(-p + 3 * q - 3 * r + s, 2 * (p - 2 * q + r), q - p));
        }
      }
      for (const t of candidates) {
        if (!(t > 0 && t < 1)) continue;
        const u = 1 - t;
        include([0, 1].map((axis) => op === "Q" ? u * u * current[axis] + 2 * u * t * n[axis] + t * t * end[axis] : u * u * u * current[axis] + 3 * u * u * t * n[axis] + 3 * u * t * t * n[axis + 2] + t * t * t * end[axis]));
      }
    }
    current = end;
  }
  return bounds;
}
function localPaintedBounds(element) {
  return reuseBounds(localBoundsCache, element, () => calculateLocalBounds(element));
}
function calculateLocalBounds(element) {
  const e = element;
  let b;
  switch (e.type) {
    case "stroke":
    case "highlight": {
      b = null;
      for (const [x, y] of e.points) b = unionBounds(b, pointBounds(x, y));
      return expandBounds(b, e.width / 2);
    }
    case "ink":
      b = null;
      for (const part of e.parts) b = unionBounds(b, pathBounds(part));
      return b;
    case "line":
      b = unionBounds(pointBounds(...e.start), pointBounds(...e.end));
      break;
    case "rect":
    case "image":
      b = { x: e.x, y: e.y, width: e.width, height: e.height };
      break;
    case "ellipse":
      b = { x: e.cx - e.rx, y: e.cy - e.ry, width: 2 * e.rx, height: 2 * e.ry };
      break;
    case "path":
      b = pathBounds(e.commands);
      break;
    default:
      throw new TypeError("Unknown geometry type");
  }
  if (e.stroke) {
    const factor = Math.max(
      e.lineJoin === "miter" ? e.miterLimit : 1,
      e.lineCap === "square" ? Math.SQRT2 : 1
    );
    b = expandBounds(b, e.strokeWidth / 2 * factor);
  }
  return b;
}
function elementBounds(element, offset = [0, 0]) {
  return transformBounds(multiply(translate(...offset), element.transform), localPaintedBounds(element));
}
function traceCommand(target, [op, ...n]) {
  switch (op) {
    case "M":
      target.moveTo(...n);
      break;
    case "L":
      target.lineTo(...n);
      break;
    case "Q":
      target.quadraticCurveTo(...n);
      break;
    case "C":
      target.bezierCurveTo(...n);
      break;
    case "Z":
      target.closePath();
      break;
    default:
      throw new TypeError("Unknown native path command");
  }
}
function traceElementPath(target, element) {
  const e = element;
  switch (e.type) {
    case "stroke":
    case "highlight":
      return visitStrokeOutline(e, (command) => traceCommand(target, command));
    case "ink": {
      let count = 0;
      for (const part of e.parts) for (const command of part) {
        traceCommand(target, command);
        count++;
      }
      return count;
    }
    case "path":
      for (const command of e.commands) traceCommand(target, command);
      return e.commands.length;
    case "line":
      target.moveTo(...e.start);
      target.lineTo(...e.end);
      return 2;
    case "rect":
      target.rect(e.x, e.y, e.width, e.height);
      return 5;
    case "ellipse":
      target.ellipse(e.cx, e.cy, e.rx, e.ry, 0, 0, 2 * Math.PI);
      return 4;
    default:
      throw new TypeError("Element has no vector path");
  }
}
function documentBounds(document, { visibleOnly = true } = {}) {
  return reuseBounds(visibleOnly ? visibleBoundsCache : allBoundsCache, document, () => {
    let bounds = null;
    for (const layer of document.layers) {
      if (visibleOnly && !layer.visible) continue;
      for (const element of layer.elements) bounds = unionBounds(bounds, elementBounds(element, layer.offset));
    }
    return bounds;
  });
}

// src/etch/geometry/convex.js
var cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
function polygonBounds(points) {
  let x = Infinity, y = Infinity, right = -Infinity, bottom = -Infinity;
  for (const p of points) {
    x = Math.min(x, p[0]);
    y = Math.min(y, p[1]);
    right = Math.max(right, p[0]);
    bottom = Math.max(bottom, p[1]);
  }
  return { x, y, width: right - x, height: bottom - y };
}
var overlaps = (a, b, epsilon = 0) => a.x <= b.x + b.width + epsilon && b.x <= a.x + a.width + epsilon && a.y <= b.y + b.height + epsilon && b.y <= a.y + a.height + epsilon;
function area(points) {
  let sum = 0;
  const origin = points[0];
  for (let i = 1; i < points.length - 1; i++) sum += cross(origin, points[i], points[i + 1]);
  return sum / 2;
}
function positiveConvex(points) {
  const p = points.filter((p2, i) => !i || p2[0] !== points[i - 1][0] || p2[1] !== points[i - 1][1]);
  if (p.length > 1 && p[0][0] === p.at(-1)[0] && p[0][1] === p.at(-1)[1]) p.pop();
  if (p.length < 3 || !(area(p) > 0)) return false;
  let turns = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i], b = p[(i + 1) % p.length], c = p[(i + 2) % p.length], u = [b[0] - a[0], b[1] - a[1]], v = [c[0] - b[0], c[1] - b[1]];
    const z = u[0] * v[1] - u[1] * v[0], dot2 = u[0] * v[0] + u[1] * v[1], epsilon = 256 * Number.EPSILON * Math.hypot(...u) * Math.hypot(...v);
    if (z < -epsilon) return false;
    turns += Math.atan2(Math.max(0, z), dot2);
  }
  return Math.abs(turns - 2 * Math.PI) < 1e-5;
}
function hull(points, budget) {
  budget.step(Math.ceil(points.length * Math.log2(Math.max(2, points.length))));
  points.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const half = (p) => {
    const out = [];
    for (const q of p) {
      while (out.length > 1 && cross(out.at(-2), out.at(-1), q) <= 0) out.pop();
      out.push(q);
    }
    out.pop();
    return out;
  };
  return [...half(points), ...half([...points].reverse())];
}
function capsule(a, b, radius, budget, tolerance = 0.02) {
  const count = Math.max(12, Math.ceil(Math.PI / Math.acos(radius / (radius + tolerance))));
  if (!Number.isFinite(count) || count > 1024) fail("LIMIT_EXCEEDED", "Eraser capsule is too complex");
  budget.vertices(2 * count, budget.segments);
  const r = radius / Math.cos(Math.PI / count), points = [];
  for (let i = 0; i < count; i++) {
    const t = i * 2 * Math.PI / count, x = r * Math.cos(t), y = r * Math.sin(t);
    points.push([a[0] + x, a[1] + y], [b[0] + x, b[1] + y]);
  }
  return hull(points, budget);
}
function intersects(a, b, budget, epsilon = 0) {
  budget.step(a.length + b.length);
  const ccw = (p) => area(p) < 0 ? [...p].reverse() : p;
  a = ccw(a);
  b = ccw(b);
  for (const [polygon, other] of [[a, b], [b, a]]) {
    let support = 0, advances = 0;
    const first = polygon[0], second = polygon[1];
    for (let j = 1; j < other.length; j++) {
      budget.step();
      if (cross(first, second, other[j]) >= cross(first, second, other[support])) support = j;
    }
    for (let i = 0; i < polygon.length; i++) {
      budget.step();
      const p = polygon[i], q = polygon[(i + 1) % polygon.length], length = Math.hypot(q[0] - p[0], q[1] - p[1]);
      if (!length) continue;
      while (cross(p, q, other[(support + 1) % other.length]) > cross(p, q, other[support])) {
        budget.step();
        support = (support + 1) % other.length;
        if (++advances > 2 * other.length + 2) fail("LIMIT_EXCEEDED", "Ink support geometry cannot be queried safely");
      }
      if (cross(p, q, other[support]) <= -epsilon * length) return false;
    }
  }
  return true;
}
function halfPlane(points, a, b, inside, budget) {
  const out = [];
  for (let i = 0; i < points.length; i++) {
    budget.step();
    const p = points[i], q = points[(i + 1) % points.length], dp = cross(a, b, p), dq = cross(a, b, q), pin = inside ? dp >= 0 : dp <= 0, qin = inside ? dq >= 0 : dq <= 0;
    if (pin) out.push(p);
    if (pin !== qin) {
      const t = dp / (dp - dq);
      out.push(p.map((n, j) => n + (q[j] - n) * t));
    }
  }
  return out.filter((p, i) => p[0] !== out[(i + out.length - 1) % out.length][0] || p[1] !== out[(i + out.length - 1) % out.length][1]);
}
function subtract(subject, cutter, budget, onVertices) {
  const pieces = [];
  let rest = subject;
  for (let i = 0; i < cutter.length && rest.length >= 3; i++) {
    const a = cutter[i], b = cutter[(i + 1) % cutter.length], outside = halfPlane(rest, a, b, false, budget);
    if (outside.length >= 3 && Math.abs(area(outside)) > 1e-14) {
      onVertices(outside.length);
      pieces.push(outside);
    }
    rest = halfPlane(rest, a, b, true, budget);
  }
  return pieces;
}
function components(parts, budget) {
  const sorted = parts.map((part, index) => ({ part, index }));
  budget.step(Math.ceil(parts.length * Math.log2(Math.max(2, parts.length))));
  sorted.sort((a, b) => a.part.bounds.x - b.part.bounds.x || a.index - b.index);
  const parent = parts.map((_, i) => i), root = (i) => {
    while (parent[i] !== i) {
      budget.step();
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  let active = [];
  for (const { part, index } of sorted) {
    active = active.filter((p) => {
      budget.step();
      return p.part.bounds.x + p.part.bounds.width >= part.bounds.x - 1e-7;
    });
    for (const other of active) {
      budget.step();
      const r = root(index), s = root(other.index);
      if (r === s || !overlaps(part.bounds, other.part.bounds, 1e-7)) continue;
      if (intersects(part.polygon, other.part.polygon, budget, 1e-7)) parent[r] = s;
    }
    active.push({ part, index });
  }
  const groups = /* @__PURE__ */ new Map();
  parts.forEach((p, i) => {
    const r = root(i);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(p.commands);
  });
  return [...groups.values()];
}

// src/etch/geometry/ink.js
var INK_FLATNESS = 0.02;
var MAX_INK_PARTS = 2e4;
function partControls(commands) {
  const points = [];
  for (const command of commands) for (let i = 1; i < command.length; i += 2) points.push([command[i], command[i + 1]]);
  return points;
}
function outlineParts(element, budget) {
  const parts = [];
  let part;
  const push = (commands) => {
    if (parts.length >= MAX_INK_PARTS) fail("LIMIT_EXCEEDED", "Too many ink primitives; gesture cancelled", { limit: "inkParts", maximum: MAX_INK_PARTS });
    parts.push(commands);
  };
  if (element.type === "ink") {
    for (const p of element.parts) {
      budget.step(p.length);
      push(p);
    }
    return parts;
  }
  visitStrokeOutline(element, (command) => {
    budget.step();
    if (command.slice(1).some((n) => !Number.isFinite(n) || Math.abs(n) > 1e7)) fail("LIMIT_EXCEEDED", "Ink outline exceeds native coordinate range; gesture cancelled", { limit: "inkCoordinates", maximum: 1e7 });
    if (command[0] === "M") part = [];
    part.push(command);
    if (command[0] === "Z") push(part);
  });
  return parts;
}
function flattenPart(commands, matrix, budget, onVertices) {
  const out = [];
  let current;
  const vertex = (p) => [...apply(matrix, p), ...p];
  const append = (p) => {
    onVertices(1);
    out.push(p);
  };
  for (const [op, ...n] of commands) {
    budget.step();
    if (op === "M") {
      current = vertex(n);
      append(current);
    } else if (op === "L") {
      current = vertex(n);
      append(current);
    } else if (op === "Q" || op === "C") {
      const control = [current];
      for (let i = 0; i < n.length; i += 2) control.push(vertex(n.slice(i, i + 2)));
      let first = true;
      for (const p of flattenBezier(control, { tolerance: Infinity, maxSegments: budget.maxSegmentsPerElement, accept: (points) => {
        budget.step();
        const a = points[0], b = points.at(-1);
        return points.slice(1, -1).every((p2, i) => {
          const t = (i + 1) / (points.length - 1);
          return Math.hypot(p2[0] - ((1 - t) * a[0] + t * b[0]), p2[1] - ((1 - t) * a[1] + t * b[1])) <= INK_FLATNESS;
        });
      } })) {
        if (!first) append(p);
        first = false;
      }
      current = control.at(-1);
    }
  }
  if (out.length > 1 && out[0][0] === out.at(-1)[0] && out[0][1] === out.at(-1)[1]) out.pop();
  return out;
}
function polygonCommands(polygon) {
  const points = polygon.map((p) => p.slice(2));
  if (area(points) < 0) points.reverse();
  if (!positiveConvex(points)) fail("LIMIT_EXCEEDED", "Ink cannot be split at this coordinate precision", { limit: "inkPrecision" });
  return [...points.map((p, i) => [i ? "L" : "M", ...p]), ["Z"]];
}

// src/etch/raster.js
var MAX_IMAGE_BYTES = 20 * 1024 * 1024;
var base64ByteLength = (data) => data.length / 4 * 3 - (data.endsWith("==") ? 2 : data.endsWith("=") ? 1 : 0);
function bytesFromBase64(data) {
  const out = new Uint8Array(base64ByteLength(data));
  let offset = 0;
  for (let i = 0; i < data.length; i += 32768) {
    const text2 = atob(data.slice(i, i + 32768));
    for (let j = 0; j < text2.length; j++) out[offset++] = text2.charCodeAt(j);
  }
  return out;
}
function base64FromBytes(bytes) {
  const chunks = [];
  for (let i = 0; i < bytes.length; i += 16384) chunks.push(String.fromCharCode(...bytes.subarray(i, i + 16384)));
  return btoa(chunks.join(""));
}
function inspectRaster(bytes, { code = "DECODE_FAILED", allowJPEG = true, allowAnimation = true } = {}) {
  const bad = (message) => fail(code, message), v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), text2 = (i, s) => [...s].every((c, j) => bytes[i + j] === c.charCodeAt(0));
  const finish = (mime, width2, height, extra = {}) => {
    if (!width2 || !height) bad("Image dimensions must be positive");
    return { mime, width: width2, height, byteLength: bytes.length, ...extra };
  };
  if (bytes.length >= 33 && [137, 80, 78, 71, 13, 10, 26, 10].every((n, i) => bytes[i] === n)) {
    if (v.getUint32(8) !== 13 || !text2(12, "IHDR")) bad("Invalid PNG header");
    let ended = false, animated = false, count = 0;
    for (let i = 8; i < bytes.length; ) {
      if (++count > 1e4 || i + 12 > bytes.length) bad("Invalid or excessive PNG chunks");
      const length = v.getUint32(i), isEnd = text2(i + 4, "IEND");
      if (i + 12 + length > bytes.length) bad("Truncated PNG chunk");
      if (text2(i + 4, "IHDR") && i !== 8) bad("PNG must have exactly one IHDR");
      if (text2(i + 4, "acTL") || text2(i + 4, "fcTL") || text2(i + 4, "fdAT")) animated = true;
      i += 12 + length;
      if (isEnd) {
        ended = length === 0 && i === bytes.length;
        break;
      }
    }
    if (!ended) bad("PNG has no complete IEND");
    if (animated && !allowAnimation) bad("Animated PNG is not supported; choose a still image");
    return finish("image/png", v.getUint32(16), v.getUint32(20));
  }
  if (bytes.length >= 20 && text2(0, "RIFF") && text2(8, "WEBP")) {
    if (v.getUint32(4, true) + 8 !== bytes.length) bad("WebP container length disagrees with its bytes");
    let dimensions = null, coded = null, animated = false, count = 0;
    for (let i = 12; i < bytes.length; ) {
      if (++count > 1e4) bad("Too many WebP chunks");
      if (i + 8 > bytes.length) bad("Truncated WebP chunk");
      const length = v.getUint32(i + 4, true), p = i + 8, end = p + length;
      if (end > bytes.length || end + length % 2 > bytes.length) bad("Truncated WebP payload");
      if (text2(i, "VP8X")) {
        if (length !== 10 || dimensions || i !== 12) bad("Invalid extended WebP header");
        const u24 = (p2) => bytes[p2] + bytes[p2 + 1] * 256 + bytes[p2 + 2] * 65536;
        dimensions = [u24(p + 4) + 1, u24(p + 7) + 1];
        animated ||= Boolean(bytes[p] & 2);
      } else if (text2(i, "ANIM") || text2(i, "ANMF")) animated = true;
      else if (text2(i, "VP8 ")) {
        if (length < 10 || bytes[p] & 1 || ![157, 1, 42].every((n, j) => bytes[p + 3 + j] === n) || coded) bad("Invalid WebP key frame");
        coded = [v.getUint16(p + 6, true) & 16383, v.getUint16(p + 8, true) & 16383];
      } else if (text2(i, "VP8L")) {
        if (length < 5 || bytes[p] !== 47 || coded) bad("Invalid lossless WebP header");
        const bits = v.getUint32(p + 1, true);
        if (bits >>> 29) bad("Unsupported lossless WebP version");
        coded = [(bits & 16383) + 1, (bits >>> 14 & 16383) + 1];
      }
      i = end + length % 2;
    }
    if (animated && !allowAnimation) bad("Animated WebP is not supported; choose a still image");
    if (!coded && !animated || !dimensions && !coded) bad("WebP has no image");
    if (!animated && dimensions && coded && dimensions.some((n, i) => n !== coded[i])) bad("WebP frame dimensions disagree");
    return finish("image/webp", ...dimensions ?? coded, { animated });
  }
  if (allowJPEG && bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216) {
    let dimensions = null, orientation = 1, segments = 0;
    for (let i = 2; i < bytes.length; ) {
      if (++segments > 1e4) bad("Too many JPEG header segments");
      if (bytes[i++] !== 255) bad("Invalid JPEG marker");
      while (bytes[i] === 255) i++;
      const marker = bytes[i++];
      if (marker === 218 || marker === 217) break;
      if (marker === 1 || marker >= 208 && marker <= 215) continue;
      if (i + 2 > bytes.length) bad("Truncated JPEG segment");
      const length = v.getUint16(i), end = i + length;
      if (length < 2 || end > bytes.length) bad("Truncated JPEG segment");
      if (marker >= 192 && marker <= 207 && ![196, 200, 204].includes(marker)) {
        if (length < 8 || dimensions) bad("Invalid or repeated JPEG frame");
        dimensions = [v.getUint16(i + 5), v.getUint16(i + 3)];
      }
      if (marker === 225 && length >= 16 && text2(i + 2, "Exif\0\0")) {
        const t = i + 8, little = text2(t, "II"), big = text2(t, "MM");
        if ((little || big) && v.getUint16(t + 2, little) === 42) {
          const at = t + v.getUint32(t + 4, little);
          if (at >= t && at + 2 <= end) {
            const count = v.getUint16(at, little);
            if (count <= (end - at - 2) / 12) for (let j = 0; j < count; j++) {
              const p = at + 2 + j * 12;
              if (v.getUint16(p, little) === 274 && v.getUint16(p + 2, little) === 3 && v.getUint32(p + 4, little) === 1) orientation = v.getUint16(p + 8, little);
            }
          }
        }
      }
      i = end;
    }
    if (!dimensions || orientation < 1 || orientation > 8) bad("Invalid JPEG dimensions/orientation");
    return finish("image/jpeg", ...dimensions, { orientation });
  }
  bad("Choose a PNG, JPEG or WebP image; SVG and other file types are not accepted");
}
function imageOptions(options = {}) {
  if (!options || typeof options !== "object" || Array.isArray(options) || Object.keys(options).some((k) => !["format", "quality"].includes(k))) fail("INVALID_ARGUMENT", "Image options accept format and quality only");
  const format = options.format === void 0 ? "webp" : options.format, quality = options.quality === void 0 ? 0.8 : options.quality;
  if (!["png", "webp"].includes(format) || typeof quality !== "number" || !Number.isFinite(quality) || quality < 0 || quality > 1) fail("INVALID_ARGUMENT", "Image format must be png/webp and quality in [0, 1]");
  return { format, quality };
}
function checkImageSize(info, limits, retainedPixels = 0, extraPixels = 0) {
  for (const [actual, maximum, limit4] of [[Math.max(info.width, info.height), limits.rasterDimension, "rasterDimension"], [info.width * info.height, limits.assetPixels, "assetPixels"], [retainedPixels + 2 * info.width * info.height + extraPixels, limits.totalPixels, "totalPixels"]]) {
    if (actual > maximum) fail("LIMIT_EXCEEDED", "Image exceeds raster safety limits (including temporary and Undo resources)", { limit: limit4, maximum, actual });
  }
}

// src/etch/validation.js
var DEFAULT_LIMITS = Object.freeze({
  layers: 128,
  elements: 2e4,
  pointsPerElement: 1e5,
  points: 1e6,
  derivedSegmentsPerElement: MAX_STROKE_SEGMENTS,
  derivedSegments: 2e6,
  assets: 64,
  assetBytes: 64 * 1024 * 1024,
  jsonBytes: 128 * 1024 * 1024,
  rasterDimension: 8192,
  assetPixels: 16777216,
  totalPixels: 33554432
});
var WORLD = 1e7;
var COMMAND_LENGTHS = Object.freeze({ M: 3, L: 3, Q: 5, C: 7, Z: 1 });
var encoder = new TextEncoder();
var checkedAssets = /* @__PURE__ */ new WeakMap();
function resolveLimits(overrides = {}) {
  object(overrides, "limits", "INVALID_ARGUMENT");
  const result = { ...DEFAULT_LIMITS };
  for (const [name, value2] of Object.entries(overrides)) {
    if (!Object.hasOwn(result, name) || !Number.isSafeInteger(value2) || value2 < 1 || value2 > result[name]) {
      fail("INVALID_ARGUMENT", "Limits must be known positive integers no greater than defaults", { limit: name });
    }
    result[name] = value2;
  }
  return Object.freeze(result);
}
function invalid(path, message) {
  fail("INVALID_DOCUMENT", message, { path });
}
function object(value2, path, code = "INVALID_DOCUMENT") {
  if (value2 === null || typeof value2 !== "object" || Array.isArray(value2) || ![Object.prototype, null].includes(Object.getPrototypeOf(value2))) {
    fail(code, "Expected a plain object", { path });
  }
}
function array(value2, path) {
  if (!Array.isArray(value2)) invalid(path, "Expected an array");
  return value2;
}
function number(value2, path, min = -WORLD, max = WORLD) {
  if (typeof value2 !== "number" || !Number.isFinite(value2) || value2 < min || value2 > max) {
    invalid(path, `Expected a finite number in [${min}, ${max}]`);
  }
  return Object.is(value2, -0) ? 0 : value2;
}
function tuple(value2, size, path, min = -WORLD, max = WORLD) {
  array(value2, path);
  if (value2.length !== size) invalid(path, `Expected ${size} numbers`);
  return Array.from(value2, (n, i) => number(n, `${path}[${i}]`, min, max));
}
function bool(value2, path) {
  if (typeof value2 !== "boolean") invalid(path, "Expected a boolean");
  return value2;
}
function text(value2, path, min, max) {
  if (typeof value2 !== "string" || value2.length < min || value2.length > max) invalid(path, "Invalid text length");
  return value2;
}
function choice(value2, values, path) {
  if (!values.includes(value2)) invalid(path, "Unsupported value");
  return value2;
}
function color(value2, path) {
  if (value2 === null) return null;
  if (typeof value2 !== "string" || !/^#[\da-f]{6}$/i.test(value2)) invalid(path, "Expected null or opaque #RRGGBB");
  return value2.toUpperCase();
}
function limit(value2, maximum, name) {
  if (value2 > maximum) fail("LIMIT_EXCEEDED", `Exceeded ${name} limit`, { limit: name, maximum, actual: value2 });
}
function inspectPNG(data, path = "asset.data") {
  if (typeof data !== "string" || data.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(data)) {
    invalid(path, "Expected padded base64 PNG bytes");
  }
  const byteLength = base64ByteLength(data);
  if (byteLength < 45) invalid(path, "Truncated PNG");
  const header = Uint8Array.from(atob(data.slice(0, 44)), (c) => c.charCodeAt(0));
  const signature = [137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82];
  if (!signature.every((v, i) => header[i] === v)) invalid(path, "Expected a PNG signature and IHDR");
  const view = new DataView(header.buffer);
  const width2 = view.getUint32(16), height = view.getUint32(20);
  if (!width2 || !height) invalid(path, "PNG dimensions must be positive");
  const range = (offset, count) => {
    const start = Math.floor(offset / 3), text2 = atob(data.slice(start * 4, Math.ceil((offset + count) / 3) * 4));
    return Uint8Array.from(text2.slice(offset - start * 3, offset - start * 3 + count), (c) => c.charCodeAt(0));
  };
  let ended = false, chunks = 0;
  for (let i = 8; i < byteLength; ) {
    if (++chunks > 1e4 || i + 12 > byteLength) invalid(path, "Invalid or excessive PNG chunks");
    const bytes = range(i, 8), length = new DataView(bytes.buffer).getUint32(0), type = String.fromCharCode(...bytes.subarray(4));
    if (i + 12 + length > byteLength) invalid(path, "Truncated PNG chunk");
    if (type === "IHDR" && i !== 8) invalid(path, "PNG must have exactly one IHDR");
    if (["acTL", "fcTL", "fdAT"].includes(type)) invalid(path, "Native PNG assets must be still images");
    i += 12 + length;
    if (type === "IEND") {
      ended = length === 0 && i === byteLength;
      break;
    }
  }
  if (!ended) invalid(path, "PNG has no complete IEND");
  return { width: width2, height, byteLength };
}
function validateDocument(input2, overrides = {}) {
  const limits = resolveLimits(overrides);
  if (typeof input2 === "string") {
    limit(input2.length, limits.jsonBytes, "jsonBytes");
    limit(encoder.encode(input2).byteLength, limits.jsonBytes, "jsonBytes");
    try {
      input2 = JSON.parse(input2);
    } catch {
      invalid("$", "Invalid JSON");
    }
  }
  object(input2, "$");
  if (input2.format !== "lightmetal-etch") invalid("format", "Not an Etch document");
  if (input2.version !== 1) fail("UNSUPPORTED_VERSION", "Only Etch document version 1 is supported", { version: typeof input2.version === "number" ? input2.version : null });
  const ids = /* @__PURE__ */ new Set();
  const id = (value2, path) => {
    text(value2, path, 1, Infinity);
    if (ids.has(value2)) invalid(path, "Duplicate document ID");
    ids.add(value2);
    return value2;
  };
  let pointCount = 0, elementCount = 0, assetBytes = 0, totalPixels = 0, derivedCount = 0, encodedAssetBytes = 0;
  const accountPoints = (count) => {
    limit(count, limits.pointsPerElement, "pointsPerElement");
    pointCount += count;
    limit(pointCount, limits.points, "points");
  };
  const assetMap = /* @__PURE__ */ new Map();
  array(input2.assets, "assets");
  limit(input2.assets.length, limits.assets, "assets");
  const assets = Array.from(input2.assets, (asset, i) => {
    const p = `assets[${i}]`;
    object(asset, p);
    const assetId = id(asset.id, `${p}.id`);
    if (!["image/png", "image/webp"].includes(asset.mime)) invalid(`${p}.mime`, "Native assets must be PNG or static WebP");
    if (typeof asset.data !== "string") invalid(`${p}.data`, "Expected base64");
    limit(asset.data.length, Math.ceil(limits.assetBytes / 3) * 4, "assetBytes");
    const checked = checkedAssets.get(asset);
    let info = checked && Object.isFrozen(asset) && Object.getOwnPropertyDescriptor(asset, "data")?.value === checked.data && Object.getOwnPropertyDescriptor(asset, "mime")?.value === checked.mime ? checked.info : null;
    if (!info) {
      if (asset.mime === "image/png") info = inspectPNG(asset.data, `${p}.data`);
      else {
        if (asset.data.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(asset.data)) invalid(`${p}.data`, "Expected padded base64 WebP bytes");
        info = inspectRaster(bytesFromBase64(asset.data), { code: "INVALID_DOCUMENT", allowJPEG: false, allowAnimation: false });
        if (info.mime !== asset.mime) invalid(`${p}.mime`, "Asset MIME disagrees with its bytes");
      }
    }
    const width2 = number(asset.width, `${p}.width`, 1, WORLD);
    const height = number(asset.height, `${p}.height`, 1, WORLD);
    limit(Math.max(width2, height), limits.rasterDimension, "rasterDimension");
    if (!Number.isInteger(width2) || !Number.isInteger(height) || info.width !== width2 || info.height !== height) invalid(p, "Raster and asset dimensions disagree");
    limit(width2 * height, limits.assetPixels, "assetPixels");
    assetBytes += info.byteLength;
    totalPixels += width2 * height;
    limit(assetBytes, limits.assetBytes, "assetBytes");
    limit(totalPixels, limits.totalPixels, "totalPixels");
    const result2 = { id: assetId, mime: asset.mime, width: width2, height, data: asset.data };
    checkedAssets.set(result2, { mime: result2.mime, data: result2.data, info });
    encodedAssetBytes += result2.data.length;
    assetMap.set(assetId, result2);
    return result2;
  });
  function element(value2, p, offset) {
    object(value2, p);
    const transform = tuple(value2.transform, 6, `${p}.transform`);
    for (let i = 0; i < 4; i++) number(transform[i], `${p}.transform[${i}]`, -1e4, 1e4);
    const [small, large] = singularValues(transform);
    if (small < 1e-4 || large > 1e4) invalid(`${p}.transform`, "Singular or out-of-range affine scale");
    const e = { id: id(value2.id, `${p}.id`), type: value2.type, transform };
    let complexity = 0;
    const n = (key, min = -WORLD, max = WORLD) => number(value2[key], `${p}.${key}`, min, max);
    const dimension = (key) => n(key, 0.01, 1e6);
    const pair2 = (key) => tuple(value2[key], 2, `${p}.${key}`);
    const paint3 = (fillAllowed) => {
      if (fillAllowed) e.fill = color(value2.fill, `${p}.fill`);
      e.stroke = color(value2.stroke, `${p}.stroke`);
      e.strokeWidth = e.stroke ? dimension("strokeWidth") : 0;
      if (!e.fill && !e.stroke) invalid(p, "Vector element has neither fill nor stroke");
    };
    const cap = () => {
      e.lineCap = choice(value2.lineCap, ["butt", "round", "square"], `${p}.lineCap`);
    };
    const join = () => {
      e.lineJoin = choice(value2.lineJoin, ["miter", "round", "bevel"], `${p}.lineJoin`);
      e.miterLimit = n("miterLimit", 1, Number.MAX_VALUE);
    };
    switch (e.type) {
      case "stroke":
      case "highlight":
        if (e.type === "highlight") {
          e.opacity = n("opacity", 0.05, 1);
          if (value2.pressure !== false) invalid(p, "Highlighter pressure must be false");
        }
        array(value2.points, `${p}.points`);
        accountPoints(value2.points.length);
        if (!value2.points.length) invalid(p, "A stroke needs at least one sample");
        e.pressure = bool(value2.pressure, `${p}.pressure`);
        e.points = Array.from(value2.points, (point, i) => {
          const result2 = tuple(point, 3, `${p}.points[${i}]`);
          result2[2] = number(result2[2], `${p}.points[${i}][2]`, 0, 1);
          if (!e.pressure) result2[2] = 1;
          return result2;
        });
        e.color = color(value2.color, `${p}.color`);
        if (!e.color) invalid(p, "Stroke color cannot be null");
        e.width = dimension("width");
        {
          const remaining = limits.derivedSegments - derivedCount;
          const budget = Math.min(limits.derivedSegmentsPerElement, remaining);
          try {
            complexity = visitStrokeOutline(e, void 0, { maxSegments: budget });
          } catch (error) {
            if (error.code !== "LIMIT_EXCEEDED" || error.details.limit !== "derivedSegments") throw error;
            const name = remaining < limits.derivedSegmentsPerElement ? "derivedSegments" : "derivedSegmentsPerElement";
            fail("LIMIT_EXCEEDED", "Pressure outline is too complex", { limit: name, maximum: limits[name] });
          }
        }
        break;
      case "ink": {
        e.color = color(value2.color, `${p}.color`);
        if (!e.color) invalid(p, "Ink color cannot be null");
        array(value2.parts, `${p}.parts`);
        limit(value2.parts.length, MAX_INK_PARTS, "inkParts");
        if (!value2.parts.length) invalid(p, "Ink needs at least one painted part");
        let count = 0;
        for (const [i, part] of Array.from(value2.parts).entries()) {
          array(part, `${p}.parts[${i}]`);
          count += part.length;
        }
        accountPoints(count);
        complexity = count;
        e.parts = Array.from(value2.parts, (part, i) => {
          const pp = `${p}.parts[${i}]`;
          if (part.length < 3) invalid(pp, "Ink parts must be closed convex subpaths");
          const commands = Array.from(part, (command, j) => {
            const cp = `${pp}[${j}]`;
            array(command, cp);
            const op = command[0];
            if (!Object.hasOwn(COMMAND_LENGTHS, op) || command.length !== COMMAND_LENGTHS[op] || (j === 0 ? op !== "M" : j === part.length - 1 ? op !== "Z" : !["L", "Q", "C"].includes(op))) invalid(cp, "Invalid ink command");
            return [op, ...Array.from(command.slice(1), (v, k) => number(v, `${cp}[${k + 1}]`))];
          });
          if (!positiveConvex(partControls(commands))) invalid(pp, "Ink parts require positive convex control polygons");
          return commands;
        });
        break;
      }
      case "line":
        e.start = pair2("start");
        e.end = pair2("end");
        paint3(false);
        cap();
        if (e.start[0] === e.end[0] && e.start[1] === e.end[1]) invalid(p, "Degenerate line");
        complexity = 2;
        break;
      case "rect":
        e.x = n("x");
        e.y = n("y");
        e.width = dimension("width");
        e.height = dimension("height");
        paint3(true);
        join();
        complexity = 5;
        break;
      case "ellipse":
        e.cx = n("cx");
        e.cy = n("cy");
        e.rx = dimension("rx");
        e.ry = dimension("ry");
        paint3(true);
        complexity = 4;
        break;
      case "path": {
        array(value2.commands, `${p}.commands`);
        accountPoints(value2.commands.length);
        let open = false;
        e.commands = Array.from(value2.commands, (command, i) => {
          const cp = `${p}.commands[${i}]`;
          array(command, cp);
          const op = command[0];
          if (!Object.hasOwn(COMMAND_LENGTHS, op) || command.length !== COMMAND_LENGTHS[op]) invalid(cp, "Invalid native path command");
          if (op !== "M" && !open) invalid(cp, "A subpath must begin with M, including after Z");
          open = op !== "Z";
          return [op, ...Array.from(command.slice(1), (v, j) => number(v, `${cp}[${j + 1}]`))];
        });
        paint3(true);
        cap();
        join();
        e.fillRule = choice(value2.fillRule, ["nonzero", "evenodd"], `${p}.fillRule`);
        complexity = e.commands.length;
        break;
      }
      case "image":
        e.assetId = text(value2.assetId, `${p}.assetId`, 1, Infinity);
        if (!assetMap.has(e.assetId)) invalid(`${p}.assetId`, "Missing image asset");
        e.x = n("x");
        e.y = n("y");
        e.width = dimension("width");
        e.height = dimension("height");
        e.alt = text(value2.alt, `${p}.alt`, 0, Infinity);
        break;
      default:
        invalid(`${p}.type`, "Unknown element type");
    }
    limit(complexity, limits.derivedSegmentsPerElement, "derivedSegmentsPerElement");
    derivedCount += complexity;
    limit(derivedCount, limits.derivedSegments, "derivedSegments");
    const bounds = elementBounds(e, offset);
    if (bounds && [bounds.x, bounds.y, bounds.x + bounds.width, bounds.y + bounds.height].some((v) => !Number.isFinite(v) || Math.abs(v) > WORLD)) {
      invalid(p, "Transformed painted bounds exceed the world range");
    }
    return e;
  }
  array(input2.layers, "layers");
  limit(input2.layers.length, limits.layers, "layers");
  if (!input2.layers.length) invalid("layers", "A document needs at least one layer");
  const layers = Array.from(input2.layers, (layer, i) => {
    const p = `layers[${i}]`;
    object(layer, p);
    const result2 = {
      id: id(layer.id, `${p}.id`),
      name: text(layer.name, `${p}.name`, 1, 80),
      visible: bool(layer.visible, `${p}.visible`),
      locked: bool(layer.locked, `${p}.locked`),
      offset: tuple(layer.offset, 2, `${p}.offset`)
    };
    array(layer.elements, `${p}.elements`);
    elementCount += layer.elements.length;
    limit(elementCount, limits.elements, "elements");
    result2.elements = Array.from(layer.elements, (e, j) => element(e, `${p}.elements[${j}]`, result2.offset));
    return result2;
  });
  const result = { format: "lightmetal-etch", version: 1, background: normalizeBackground(input2.background), layers, assets };
  const envelope = { ...result, assets: assets.map((asset) => ({ ...asset, data: "" })) };
  limit(encoder.encode(JSON.stringify(envelope)).byteLength + encodedAssetBytes, limits.jsonBytes, "jsonBytes");
  return result;
}

// src/etch/document.js
var fallbackCounter = 0;
function createId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return `etch-${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}-${++fallbackCounter}`;
}
function emptyLayer(name = "Layer 1") {
  return { id: createId(), name, visible: true, locked: false, offset: [0, 0], elements: [] };
}
function emptyDocument() {
  return { format: "lightmetal-etch", version: 1, background: null, layers: [emptyLayer()], assets: [] };
}
function freezeDocument(value2) {
  if (value2 && typeof value2 === "object" && !Object.isFrozen(value2)) {
    for (const child of Object.values(value2)) freezeDocument(child);
    Object.freeze(value2);
  }
  return value2;
}
function referencedAssetIds(document) {
  const ids = /* @__PURE__ */ new Set();
  for (const layer of document.layers) for (const e of layer.elements) if (e.type === "image") ids.add(e.assetId);
  return ids;
}
function snapshot(document) {
  const used = referencedAssetIds(document);
  return structuredClone({ ...document, assets: document.assets.filter((a) => used.has(a.id)) });
}
function preferredLayer(document) {
  return document.layers.findLast((l) => l.visible && !l.locked)?.id ?? document.layers.at(-1).id;
}

// src/etch/history.js
function valueBytes(value2) {
  if (typeof value2 === "string") return 2 * value2.length;
  if (!value2 || typeof value2 !== "object") return 8;
  return 32 + Object.values(value2).reduce((sum, v) => sum + valueBytes(v), 0);
}
function deltaBytes(before, after) {
  if (before === after) return 0;
  if (!before || !after || typeof before !== "object" || typeof after !== "object") {
    return valueBytes(before) + valueBytes(after);
  }
  const keys = /* @__PURE__ */ new Set([...Object.keys(before), ...Object.keys(after)]);
  let bytes = 32;
  for (const key of keys) bytes += deltaBytes(before[key], after[key]);
  return bytes;
}
var History = class {
  #undo = [];
  #redo = [];
  constructor({ maxCommands = 200, maxBytes = 64 * 1024 * 1024 } = {}) {
    if (!Number.isSafeInteger(maxCommands) || maxCommands < 1 || !Number.isSafeInteger(maxBytes) || maxBytes < 1) {
      fail("INVALID_ARGUMENT", "History limits must be positive integers");
    }
    this.maxCommands = maxCommands;
    this.maxBytes = maxBytes;
  }
  push(before, after, label, session = {}) {
    if (before === after) return false;
    this.#redo = [];
    this.#undo.push({ before, after, label, ...session, bytes: deltaBytes(before, after) });
    let bytes = this.#undo.reduce((sum, e) => sum + e.bytes, 0);
    while (this.#undo.length > this.maxCommands || bytes > this.maxBytes && this.#undo.length > 1) {
      bytes -= this.#undo.shift().bytes;
    }
    return true;
  }
  undo() {
    const entry = this.#undo.pop();
    if (entry) this.#redo.push(entry);
    return entry ?? null;
  }
  redo() {
    const entry = this.#redo.pop();
    if (entry) this.#undo.push(entry);
    return entry ?? null;
  }
  clear() {
    this.#undo = [];
    this.#redo = [];
  }
  getState() {
    return {
      canUndo: this.#undo.length > 0,
      canRedo: this.#redo.length > 0,
      undoLabel: this.#undo.at(-1)?.label ?? null,
      redoLabel: this.#redo.at(-1)?.label ?? null
    };
  }
  /** Resources referenced by either side of every retained command must stay alive. */
  documents() {
    return [...this.#undo, ...this.#redo].flatMap((e) => [e.before, e.after]);
  }
};

// src/etch/events.js
var Emitter = class {
  #listeners = /* @__PURE__ */ new Map();
  #dispatching = false;
  #pending = [];
  #draining = false;
  #generation = 0;
  constructor(report = (error) => {
    if (typeof globalThis.reportError === "function") globalThis.reportError(error);
    else console.error(error);
  }) {
    this.report = report;
  }
  on(name, callback) {
    const listeners = this.#listeners.get(name) ?? /* @__PURE__ */ new Set();
    listeners.add(callback);
    this.#listeners.set(name, listeners);
    return () => {
      listeners.delete(callback);
    };
  }
  get dispatching() {
    return this.#dispatching;
  }
  defer(action, cancel) {
    this.#pending.push({ action, cancel });
  }
  emitBatch(events) {
    const generation = this.#generation;
    this.#dispatching = true;
    try {
      for (const [name, payload] of events) {
        if (generation !== this.#generation) break;
        for (const listener of [...this.#listeners.get(name) ?? []]) {
          if (generation !== this.#generation) break;
          try {
            listener(structuredClone(payload));
          } catch (error) {
            queueMicrotask(() => this.report(error));
          }
        }
      }
    } finally {
      this.#dispatching = false;
    }
    if (!this.#draining) {
      this.#draining = true;
      try {
        while (this.#pending.length) {
          try {
            this.#pending.shift().action();
          } catch (error) {
            queueMicrotask(() => this.report(error));
          }
        }
      } finally {
        this.#draining = false;
      }
    }
  }
  clear(reason) {
    this.#generation++;
    this.#listeners.clear();
    const pending = this.#pending;
    this.#pending = [];
    for (const { cancel } of pending) {
      try {
        cancel?.(reason);
      } catch (error) {
        queueMicrotask(() => this.report(error));
      }
    }
  }
};

// src/etch/assets.js
async function decodeImageBlob(blob, signal) {
  if (signal.aborted) fail("CANCELLED", "Image decoding cancelled");
  let image, url;
  const close = () => {
    if (typeof image?.close === "function") image.close();
    else image?.removeAttribute("src");
  };
  const abort = () => image?.removeAttribute?.("src");
  try {
    if (typeof globalThis.createImageBitmap === "function") image = await globalThis.createImageBitmap(blob, { imageOrientation: "from-image" });
    else {
      url = URL.createObjectURL(blob);
      image = new Image();
      signal.addEventListener("abort", abort, { once: true });
      image.src = url;
      await image.decode();
    }
    if (signal.aborted) fail("CANCELLED", "Image decoding cancelled");
    return { image, close };
  } catch (error) {
    close();
    if (signal.aborted) fail("CANCELLED", "Image decoding cancelled");
    if (error instanceof EtchError) throw error;
    fail("DECODE_FAILED", "Could not decode image");
  } finally {
    if (url) URL.revokeObjectURL(url);
    signal.removeEventListener("abort", abort);
  }
}
async function decodeRaster(asset, signal) {
  const resource = await decodeImageBlob(new Blob([bytesFromBase64(asset.data)], { type: asset.mime }), signal);
  const { image } = resource;
  if ((image.naturalWidth ?? image.width) !== asset.width || (image.naturalHeight ?? image.height) !== asset.height) {
    resource.close();
    fail("DECODE_FAILED", "Decoded raster dimensions disagree with its header");
  }
  return resource;
}
var AssetPool = class _AssetPool {
  #resources = /* @__PURE__ */ new Map();
  get(id) {
    return this.#resources.get(id)?.image;
  }
  add(id, resource) {
    this.#resources.set(id, resource);
  }
  /** Atomic ownership transfer after a complete import has decoded successfully. */
  transferTo(target) {
    if (!(target instanceof _AssetPool) || target === this) fail("INVALID_ARGUMENT", "Invalid asset pool transfer");
    for (const id of this.#resources.keys()) if (target.#resources.has(id)) fail("INVALID_ARGUMENT", "Imported asset ID collision");
    for (const [id, resource] of this.#resources) target.#resources.set(id, resource);
    this.#resources.clear();
  }
  retain(documents) {
    const ids = /* @__PURE__ */ new Set();
    for (const doc of documents) for (const id of referencedAssetIds(doc)) ids.add(id);
    for (const [id, resource] of this.#resources) if (!ids.has(id)) {
      resource.close();
      this.#resources.delete(id);
    }
  }
  dispose() {
    for (const resource of this.#resources.values()) resource.close();
    this.#resources.clear();
  }
};
async function decodeAssets(document, signal, decode = decodeRaster) {
  const pool = new AssetPool();
  try {
    for (const asset of document.assets) {
      if (signal.aborted) fail("CANCELLED", "Asset decoding cancelled");
      pool.add(asset.id, await decode(asset, signal));
      if (signal.aborted) fail("CANCELLED", "Asset decoding cancelled");
    }
    return pool;
  } catch (error) {
    pool.dispose();
    if (signal.aborted) fail("CANCELLED", "Asset decoding cancelled");
    if (error instanceof EtchError) throw error;
    fail("DECODE_FAILED", "Could not decode native raster asset");
  }
}

// src/etch/geometry/hit-test.js
var HIT_ERROR = 0.25;
var FLAT = HIT_ERROR / 4;
var sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
var dot = (a, b) => a[0] * b[0] + a[1] * b[1];
var cross2 = (a, b) => a[0] * b[1] - a[1] * b[0];
var unit = (v) => {
  const d = Math.hypot(...v);
  return d ? v.map((n) => n / d) : null;
};
var normal = (t) => [-t[1], t[0]];
var shifted = (p, n, r) => [p[0] + n[0] * r, p[1] + n[1] * r];
var clamp = (n) => Math.max(0, Math.min(1, n));
var HitBudget = class {
  constructor({ maxSegmentsPerElement = 5e5, maxSegments = 2e6, maxWork = 2e7 } = {}) {
    Object.assign(this, { maxSegmentsPerElement, maxSegments, maxWork, segments: 0, work: 0 });
  }
  step(n = 1) {
    if ((this.work += n) > this.maxWork) fail("LIMIT_EXCEEDED", "Eraser hit-test work limit exceeded; gesture cancelled", { limit: "hitWork", maximum: this.maxWork });
  }
  vertices(n, start) {
    this.step(n);
    this.segments += n;
    if (this.segments - start > this.maxSegmentsPerElement) fail("LIMIT_EXCEEDED", "Element hit geometry is too complex", { limit: "hitSegmentsPerElement", maximum: this.maxSegmentsPerElement });
    if (this.segments > this.maxSegments) fail("LIMIT_EXCEEDED", "Gesture hit geometry is too complex", { limit: "hitSegments", maximum: this.maxSegments });
  }
};
function pointSegment(p, a, b) {
  const d = sub(b, a), length = dot(d, d), t = length ? clamp(dot(sub(p, a), d) / length) : 0;
  const q = [a[0] + t * d[0], a[1] + t * d[1]], v = sub(p, q);
  return { distance: dot(v, v), q };
}
function segmentDistance(a, b, c, d) {
  const u = sub(b, a), v = sub(d, c), w = sub(c, a), den = cross2(u, v);
  if (den !== 0) {
    const t = cross2(w, v) / den, s = cross2(w, u) / den;
    if (t >= 0 && t <= 1 && s >= 0 && s <= 1) return { distance: 0, q: [c[0] + s * v[0], c[1] + s * v[1]] };
  }
  const candidates = [pointSegment(a, c, d), pointSegment(b, c, d)];
  for (const p of [c, d]) candidates.push({ distance: pointSegment(p, a, b).distance, q: p });
  return candidates.reduce((best, next) => next.distance < best.distance ? next : best);
}
function* edges(contours, budget) {
  for (const points of contours) for (let i = 0; i < points.length; i++) {
    budget.step();
    yield [points[i], points[(i + 1) % points.length]];
  }
}
function winding(contours, p, budget) {
  let n = 0;
  for (const [a, b] of edges(contours, budget)) {
    const side = cross2(sub(b, a), sub(p, a));
    if (a[1] <= p[1] && b[1] > p[1] && side > 0) n++;
    else if (a[1] > p[1] && b[1] <= p[1] && side < 0) n--;
  }
  return n;
}
var filled = (n, rule) => rule === "evenodd" ? Math.abs(n) % 2 === 1 : n !== 0;
function fillHit(contours, rule, a, b, r, budget) {
  if (filled(winding(contours, a, budget), rule) || filled(winding(contours, b, budget), rule)) return true;
  for (const [c, d] of edges(contours, budget)) {
    const v = sub(d, c), length = Math.hypot(...v);
    if (!length) continue;
    const nearest = segmentDistance(a, b, c, d);
    if (nearest.distance > r * r) continue;
    const t = dot(sub(nearest.q, c), v) / (length * length), margin = Math.min(1e-6, 1e-3 / length);
    const s = Math.max(margin, Math.min(1 - margin, t)), q = [c[0] + s * v[0], c[1] + s * v[1]];
    if (filled(winding(contours, q, budget), rule)) return true;
    let multiplicity = 0;
    for (const [p, z] of edges(contours, budget)) {
      const e = sub(z, p), el = Math.hypot(...e);
      if (!el) continue;
      const epsilon = 32 * Number.EPSILON * Math.max(1, Math.abs(q[0]), Math.abs(q[1]));
      if (Math.abs(cross2(v, e)) > 32 * Number.EPSILON * length * el) continue;
      if (pointSegment(q, p, z).distance > epsilon * epsilon) continue;
      multiplicity += dot(v, e) > 0 ? 1 : -1;
    }
    if (filled(multiplicity, rule)) return true;
  }
  return false;
}
function polygonHit(points, a, b, r, budget) {
  if (winding([points], a, budget) || winding([points], b, budget)) return true;
  for (const [c, d] of edges([points], budget)) if (segmentDistance(a, b, c, d).distance <= r * r) return true;
  return false;
}
function flattenPaint(element, matrix, budget = new HitBudget()) {
  const startCount = budget.segments, contours = [], polygons = [], paths = [];
  const radius = element.stroke ? element.strokeWidth / 2 : 0, operator = singularValues(matrix)[1];
  let path = null, current = null;
  const record = (points) => {
    budget.vertices(points.length, startCount);
    return points.map((p) => apply(matrix, p));
  };
  const polygon = (points) => {
    if (points.length >= 3) polygons.push(record(points));
  };
  function arc2(center, r, from, angle) {
    const errorRadius = Math.max(r * operator, FLAT), step = Math.min(Math.PI / 4, 2 * Math.acos(Math.max(-1, 1 - FLAT / errorRadius)));
    const count = Math.max(1, Math.ceil(Math.abs(angle) / step));
    budget.vertices(count + 2, startCount);
    const points = [apply(matrix, center)];
    for (let i = 0; i <= count; i++) points.push(apply(matrix, [center[0] + r * Math.cos(from + angle * i / count), center[1] + r * Math.sin(from + angle * i / count)]));
    polygons.push(points);
  }
  function begin(p) {
    budget.vertices(1, startCount);
    path = { points: [p], runs: [], closed: false, drawn: false };
    paths.push(path);
    current = p;
  }
  function run(segments, end) {
    path.drawn = true;
    path.runs.push(segments);
    for (const segment of segments) path.points.push(segment.b);
    current = end;
  }
  function line(p) {
    const t = unit(sub(p, current));
    budget.vertices(1, startCount);
    run(t ? [{ a: current, b: p, ta: t, tb: t }] : [], p);
  }
  function curve(control) {
    const original = [current, ...control], degree = original.length - 1;
    const derivatives = original.slice(1).map((p, i) => sub(p, original[i]));
    const tangent = (t) => {
      let row = derivatives;
      while (row.length > 1) row = row.slice(1).map((p, i) => [(1 - t) * row[i][0] + t * p[0], (1 - t) * row[i][1] + t * p[1]]);
      return unit(row[0]) ?? unit(t < 0.5 ? sub(original.find((p) => p[0] !== original[0][0] || p[1] !== original[0][1]) ?? original.at(-1), original[0]) : sub(original.at(-1), [...original].reverse().find((p) => p[0] !== original.at(-1)[0] || p[1] !== original.at(-1)[1]) ?? original[0]));
    };
    const accept = (points) => {
      budget.step();
      const screen = points.map((p) => apply(matrix, p)), first = screen[0], last = screen.at(-1);
      for (let i = 1; i < screen.length - 1; i++) {
        const t = i / (screen.length - 1);
        if (Math.hypot(screen[i][0] - ((1 - t) * first[0] + t * last[0]), screen[i][1] - ((1 - t) * first[1] + t * last[1])) > FLAT) return false;
      }
      if (radius) {
        const chord = unit(sub(points.at(-1), points[0]));
        for (let i = 1; i < points.length; i++) {
          const edge = unit(sub(points[i], points[i - 1]));
          if (!edge) continue;
          if (!chord || radius * operator * (1 - Math.min(1, dot(edge, chord))) > FLAT) return false;
        }
      }
      return true;
    };
    const segments = [];
    let previous = null;
    for (const p of flattenBezier(original.map((p2, i) => [...p2, i / degree]), { tolerance: Infinity, accept, maxSegments: budget.maxSegmentsPerElement })) {
      const point = p.slice(0, 2), t = tangent(p[2]);
      if (previous && t && previous.t) {
        budget.vertices(1, startCount);
        segments.push({ a: previous.point, b: point, ta: previous.t, tb: t });
      }
      budget.step();
      previous = { point, t };
    }
    run(segments, original.at(-1));
  }
  const sink = {
    moveTo(x, y) {
      begin([x, y]);
    },
    lineTo(x, y) {
      line([x, y]);
    },
    quadraticCurveTo(x, y, a, b) {
      curve([[x, y], [a, b]]);
    },
    bezierCurveTo(x, y, a, b, c, d) {
      curve([[x, y], [a, b], [c, d]]);
    },
    closePath() {
      if (current[0] !== path.points[0][0] || current[1] !== path.points[0][1]) line(path.points[0]);
      path.closed = true;
      current = path.points[0];
    },
    rect(x, y, w, h) {
      begin([x, y]);
      line([x + w, y]);
      line([x + w, y + h]);
      line([x, y + h]);
      this.closePath();
    },
    ellipse(cx, cy, rx, ry) {
      begin([cx + rx, cy]);
      const segments = [];
      const point = (a) => [cx + rx * Math.cos(a), cy + ry * Math.sin(a)];
      const tangent = (a) => unit([-rx * Math.sin(a), ry * Math.cos(a)]);
      function subdivide(a, b, depth = 0) {
        budget.step();
        const m = (a + b) / 2, p = point(a), q = point(b), mid = point(m), s = apply(matrix, p), t = apply(matrix, q), u = apply(matrix, mid);
        const normalError = radius * operator * Math.max(1 - dot(tangent(a), tangent(m)), 1 - dot(tangent(b), tangent(m)));
        if (Math.hypot(u[0] - (s[0] + t[0]) / 2, u[1] - (s[1] + t[1]) / 2) > FLAT || normalError > FLAT) {
          if (depth >= 48) fail("LIMIT_EXCEEDED", "Ellipse hit geometry cannot be subdivided safely");
          subdivide(a, m, depth + 1);
          subdivide(m, b, depth + 1);
          return;
        }
        budget.vertices(1, startCount);
        segments.push({ a: p, b: q, ta: tangent(a), tb: tangent(b) });
      }
      for (let i = 0; i < 4; i++) subdivide(i * Math.PI / 2, (i + 1) * Math.PI / 2);
      segments.at(-1).b = path.points[0];
      segments.at(-1).tb = [0, 1];
      run(segments, path.points[0]);
      path.closed = true;
    }
  };
  if (element.type === "image") {
    const { x, y, width: w, height: h } = element;
    polygon([[x, y], [x + w, y], [x + w, y + h], [x, y + h]]);
  } else traceElementPath(sink, element);
  const fill = ["stroke", "highlight", "ink"].includes(element.type) ? element.color : element.fill;
  for (const p of paths) {
    let join = function(point, a, b) {
      const turn = Math.atan2(cross2(a, b), dot(a, b));
      if (Math.abs(turn) < 1e-12) return;
      const side = turn > 0 ? -1 : 1, n0 = normal(a).map((n) => n * side), n1 = normal(b).map((n) => n * side);
      const first = shifted(point, n0, radius), last = shifted(point, n1, radius), style = element.lineJoin ?? "round";
      if (style === "round") arc2(point, radius, Math.atan2(n0[1], n0[0]), turn);
      else if (style === "miter" && 1 / Math.cos(turn / 2) <= (element.miterLimit ?? 4)) {
        const factor = radius / (1 + dot(a, b));
        polygon([point, first, [point[0] + (n0[0] + n1[0]) * factor, point[1] + (n0[1] + n1[1]) * factor], last]);
      } else polygon([point, first, last]);
    };
    if (fill && p.drawn && p.points.length >= 3) {
      (element.type === "ink" ? polygons : contours).push(record(p.points));
    }
    if (!radius) continue;
    const runs = p.runs.filter((run2) => run2.length);
    for (const run2 of runs) for (const s of run2) {
      const na = normal(s.ta), nb = normal(s.tb);
      polygon([shifted(s.a, na, radius), shifted(s.b, nb, radius), shifted(s.b, nb, -radius), shifted(s.a, na, -radius)]);
    }
    for (let i = 1; i < runs.length; i++) join(runs[i][0].a, runs[i - 1].at(-1).tb, runs[i][0].ta);
    if (p.closed && runs.length) join(runs[0][0].a, runs.at(-1).at(-1).tb, runs[0][0].ta);
    else if (runs.length) {
      const first = runs[0][0], last = runs.at(-1).at(-1), cap = element.lineCap ?? "butt";
      for (const [point, t, sign] of [[first.a, first.ta, -1], [last.b, last.tb, 1]]) {
        const n = normal(t);
        if (cap === "round") arc2(point, radius, Math.atan2(n[1], n[0]) + (sign === 1 ? Math.PI : 0), Math.PI);
        else if (cap === "square") {
          const a = shifted(point, n, radius), b = shifted(point, n, -radius);
          polygon([a, b, shifted(b, t, sign * radius), shifted(a, t, sign * radius)]);
        }
      }
    } else if (p.drawn) {
      if (element.lineCap === "round") arc2(p.points[0], radius, 0, 2 * Math.PI);
      else if (element.lineCap === "square") {
        const [x, y] = p.points[0];
        polygon([[x - radius, y - radius], [x + radius, y - radius], [x + radius, y + radius], [x - radius, y + radius]]);
      }
    }
  }
  return { contours, polygons, fillRule: element.fillRule ?? "nonzero" };
}
var SweptHitTester = class {
  constructor(layer, zoom, { budget = new HitBudget(), exact = () => false } = {}) {
    this.budget = budget;
    this.exact = exact;
    this.zoom = zoom;
    this.offset = layer.offset;
    this.cache = /* @__PURE__ */ new Map();
    this.remaining = new Map([...layer.elements].reverse().map((e) => [e, elementBounds(e, layer.offset)]));
  }
  sweep(a, b, radius) {
    const hits = [], r = radius + HIT_ERROR, z = this.zoom;
    const box = { left: (Math.min(a[0], b[0]) - r) / z, top: (Math.min(a[1], b[1]) - r) / z, right: (Math.max(a[0], b[0]) + r) / z, bottom: (Math.max(a[1], b[1]) + r) / z };
    for (const [e, bounds] of this.remaining) {
      this.budget.step();
      if (!bounds || bounds.x > box.right || bounds.y > box.bottom || bounds.x + bounds.width < box.left || bounds.y + bounds.height < box.top) continue;
      const matrix = multiply(scale(z), multiply(translate(...this.offset), e.transform));
      let hit = e.type !== "image" && (this.exact(e, matrix, a, this.budget) || this.exact(e, matrix, b, this.budget));
      if (!hit) {
        let geometry2 = this.cache.get(e);
        if (!geometry2) {
          geometry2 = flattenPaint(e, matrix, this.budget);
          this.cache.set(e, geometry2);
        }
        hit = geometry2.polygons.some((p) => polygonHit(p, a, b, r, this.budget)) || fillHit(geometry2.contours, geometry2.fillRule, a, b, r, this.budget);
      }
      if (hit) {
        hits.push(e.id);
        this.remaining.delete(e);
        this.cache.delete(e);
      }
    }
    return hits;
  }
};

// src/etch/geometry/line-cut.js
var pair = (value2) => Array.isArray(value2) && value2.length === 2 && Array.from(value2).every(Number.isFinite);
function polygonInterval(points, budget) {
  let lo = Infinity, hi = -Infinity;
  const include = (x) => {
    lo = Math.min(lo, x);
    hi = Math.max(hi, x);
  };
  for (let i = 0; i < points.length; i++) {
    budget.step();
    const p = points[i], q = points[(i + 1) % points.length];
    if (p[1] === 0) include(p[0]);
    if (p[1] < 0 && q[1] > 0 || p[1] > 0 && q[1] < 0) include(p[0] + (q[0] - p[0]) * -p[1] / (q[1] - p[1]));
  }
  return lo <= hi ? [lo, hi] : null;
}
function roundedInterval(points, radius, budget) {
  let lo = Infinity, hi = -Infinity;
  const include = (interval) => {
    if (interval) {
      lo = Math.min(lo, interval[0]);
      hi = Math.max(hi, interval[1]);
    }
  };
  if (points.length > 2) include(polygonInterval(points, budget));
  for (let i = 0; i < points.length; i++) {
    budget.step();
    const p = points[i], q = points[(i + 1) % points.length], y = Math.abs(p[1]);
    if (y <= radius) {
      const dx2 = Math.sqrt(Math.max(0, (radius - y) * (radius + y)));
      include([p[0] - dx2, p[0] + dx2]);
    }
    const dx = q[0] - p[0], dy = q[1] - p[1], length = Math.hypot(dx, dy);
    if (!length) continue;
    const x = -dy / length * radius, z = dx / length * radius;
    include(polygonInterval([[p[0] - x, p[1] - z], [q[0] - x, q[1] - z], [q[0] + x, q[1] + z], [p[0] + x, p[1] + z]], budget));
  }
  return lo <= hi ? [lo, hi] : null;
}
function geometry(element, matrix, budget) {
  const startCount = budget.segments;
  const delta = element.end.map((n2, i) => n2 - element.start[i]), localLength = Math.hypot(...delta), t = delta.map((n2) => n2 / localLength);
  const linear = [matrix[0], matrix[1], matrix[2], matrix[3], 0, 0], v = apply(linear, delta), length = Math.hypot(...v);
  if (!(length > 0) || !Number.isFinite(length)) fail("LIMIT_EXCEEDED", "Line cannot be split at this coordinate precision", { limit: "linePrecision" });
  const u = v.map((n2) => n2 / length);
  const rotate = ([x, y]) => [x * u[0] + y * u[1], -x * u[1] + y * u[0]], origin = apply(matrix, element.start);
  const frame = (point) => rotate(point.map((n2, i) => n2 - origin[i]));
  const r = element.strokeWidth / 2, n = [-t[1] * r, t[0] * r], cap = element.lineCap;
  let footprint;
  if (cap === "round") {
    const disc = flattenPaint({ ...element, start: [0, 0], end: [0, 0] }, linear, budget).polygons[0];
    budget.vertices(disc.length - 2, startCount);
    footprint = disc.slice(1, -1).flatMap((p) => {
      const q = rotate(p);
      return [q, q.map((n2) => -n2)];
    });
  } else {
    const local = cap === "square" ? [[t[0] * r + n[0], t[1] * r + n[1]], [-t[0] * r + n[0], -t[1] * r + n[1]], [-t[0] * r - n[0], -t[1] * r - n[1]], [t[0] * r - n[0], t[1] * r - n[1]]] : [n, n.map((n2) => -n2)];
    budget.vertices(local.length, startCount);
    footprint = local.map((p) => rotate(apply(linear, p)));
  }
  return { frame, footprint, length, epsilon: Math.max(1e-7, 128 * Number.EPSILON * Math.max(1, length, ...origin.map(Math.abs))) };
}
function addCut(entry, interval, budget) {
  const [lo, hi] = interval, epsilon = entry.geometry.epsilon / entry.geometry.length, next = [];
  let start = lo, end = hi, added = false;
  for (const [a, b] of entry.cuts) {
    budget.step();
    if (a <= lo + epsilon && b >= hi - epsilon) return false;
    if (b < start - epsilon) next.push([a, b]);
    else if (a > end + epsilon) {
      if (!added) {
        next.push([start, end]);
        added = true;
      }
      next.push([a, b]);
    } else {
      start = Math.min(start, a);
      end = Math.max(end, b);
    }
  }
  if (!added) next.push([start, end]);
  entry.cuts = next;
  return true;
}
function survivors(entry, budget) {
  const ranges = [];
  let start = 0;
  for (const [a, b] of entry.cuts) {
    budget.step();
    if (a > start) ranges.push([start, a]);
    start = b;
  }
  if (start < 1) ranges.push([start, 1]);
  return ranges;
}
var LineCutTester = class {
  constructor(layer, zoom, { budget = new HitBudget(), maxPieces = 2e4 } = {}) {
    this.layer = layer;
    this.zoom = zoom;
    this.budget = budget;
    this.maxPieces = maxPieces;
    this.allocated = 0;
    this.entries = [...layer.elements].reverse().filter((e) => e.type === "line").map((element) => ({ element, bounds: elementBounds(element, layer.offset), geometry: null, cuts: [], ids: [element.id] }));
  }
  sweep(a, b, radius) {
    const changed = [], r = radius + HIT_ERROR, z = this.zoom;
    const box = { left: (Math.min(a[0], b[0]) - r) / z, top: (Math.min(a[1], b[1]) - r) / z, right: (Math.max(a[0], b[0]) + r) / z, bottom: (Math.max(a[1], b[1]) + r) / z };
    for (const entry of this.entries) {
      this.budget.step();
      const { bounds, element: e } = entry;
      if (entry.cuts.length === 1 && entry.cuts[0][0] === 0 && entry.cuts[0][1] === 1) continue;
      if (!bounds || bounds.x > box.right || bounds.y > box.bottom || bounds.x + bounds.width < box.left || bounds.y + bounds.height < box.top) continue;
      entry.geometry ??= geometry(e, multiply(scale(z), multiply(translate(...this.layer.offset), e.transform)), this.budget);
      const g = entry.geometry, p = g.frame(a), q = g.frame(b);
      this.budget.step(2 * g.footprint.length);
      const points = [];
      for (const f of g.footprint) {
        points.push([p[0] - f[0], p[1] - f[1]], [q[0] - f[0], q[1] - f[1]]);
      }
      const interval = roundedInterval(hull(points, this.budget), r, this.budget);
      if (!interval) continue;
      const lo = Math.max(0, interval[0]), hi = Math.min(g.length, interval[1]);
      if (hi <= lo || hi - lo <= g.epsilon && !(lo === 0 && hi === g.length && interval[1] - interval[0] > g.epsilon)) continue;
      if (addCut(entry, [lo / g.length, hi / g.length], this.budget)) changed.push(e.id);
    }
    return changed;
  }
  changes() {
    const changes = [];
    let count = 0;
    for (const entry of this.entries) {
      this.budget.step();
      if (!entry.cuts.length) continue;
      const ranges = survivors(entry, this.budget);
      count += ranges.length;
      if (count > this.maxPieces) fail("LIMIT_EXCEEDED", "Too many partial eraser pieces; gesture cancelled", { limit: "eraserPieces", maximum: this.maxPieces });
      while (entry.ids.length < ranges.length) {
        if (++this.allocated > this.maxPieces) fail("LIMIT_EXCEEDED", "Partial eraser identity limit exceeded; gesture cancelled", { limit: "eraserPieces", maximum: this.maxPieces });
        entry.ids.push(createId());
      }
      changes.push({ id: entry.element.id, ranges, ids: entry.ids.slice(0, ranges.length) });
    }
    return changes;
  }
};
function lineFragments(element, ranges, ids) {
  if (element.type !== "line" || !Array.isArray(ranges) || !Array.isArray(ids) || ranges.length !== ids.length || Array.from(ids).some((id) => typeof id !== "string" || !id) || new Set(ids).size !== ids.length || ids.length && ids[0] !== element.id) fail("INVALID_ARGUMENT", "Invalid partial line identities");
  let end = -1;
  for (const range of Array.from(ranges)) {
    if (!pair(range) || range[0] < 0 || range[1] > 1 || range[0] >= range[1] || range[0] <= end) fail("INVALID_ARGUMENT", "Line ranges must be ordered, disjoint intervals in [0, 1]");
    end = range[1];
  }
  if (ranges.length === 1 && ranges[0][0] === 0 && ranges[0][1] === 1) return [element];
  const point = (t) => t === 0 ? [...element.start] : t === 1 ? [...element.end] : element.start.map((n, i) => n + (element.end[i] - n) * t);
  const pieces = ranges.map(([a, b]) => ({ start: point(a), end: point(b) })).filter((p) => p.start.some((n, i) => n !== p.end[i]));
  return pieces.map((piece, i) => ({ ...element, ...piece, id: ids[i] }));
}

// src/etch/native-import.js
function planDocumentImport(input2, { document, target, center, limits, name = "Imported drawing", reservedIds = [], id = createId }) {
  if (!Array.isArray(center) || center.length !== 2 || !Array.from(center).every(Number.isFinite)) fail("INVALID_ARGUMENT", "Import center must be a finite pair");
  if (typeof name !== "string" || !name.length || name.length > 80) fail("INVALID_ARGUMENT", "Import name must contain 1\u201380 characters");
  const source = validateDocument(input2, limits), bounds = documentBounds(source);
  const visible = source.layers.filter((l) => l.visible), hidden = source.layers.filter((l) => !l.visible);
  if (!bounds || bounds.width <= 0 || bounds.height <= 0) fail("EMPTY_IMPORT", "Drawing has no visible painted geometry to import");
  const usedIds = new Set(reservedIds);
  for (const d of [document, source]) {
    for (const a of d.assets) usedIds.add(a.id);
    for (const l of d.layers) {
      usedIds.add(l.id);
      for (const e of l.elements) usedIds.add(e.id);
    }
  }
  const fresh = () => {
    for (let i = 0; i < 16; i++) {
      const value2 = id();
      if (typeof value2 === "string" && value2.length && !usedIds.has(value2)) {
        usedIds.add(value2);
        return value2;
      }
    }
    fail("LIMIT_EXCEEDED", "Could not allocate a unique imported ID");
  };
  const wanted = referencedAssetIds({ layers: visible });
  const assetIds = /* @__PURE__ */ new Map(), assets = source.assets.filter((a) => wanted.has(a.id)).map((a) => {
    const next2 = fresh();
    assetIds.set(a.id, next2);
    return { ...a, id: next2 };
  });
  const elements = visible.flatMap((l) => l.elements.map((e) => ({
    ...e,
    id: fresh(),
    transform: multiply(translate(...l.offset), e.transform),
    ...e.type === "image" ? { assetId: assetIds.get(e.assetId) } : {}
  })));
  const layer = { id: fresh(), name, visible: true, locked: false, offset: center.map((n, i) => n - ([bounds.x, bounds.y][i] + [bounds.width, bounds.height][i] / 2)), elements };
  const index = document.layers.findIndex((l) => l.id === target);
  if (index < 0) fail("CANCELLED", "Import insertion layer no longer exists");
  const layers = [...document.layers];
  layers.splice(index + 1, 0, layer);
  const retained = referencedAssetIds(document);
  const parsed = validateDocument({ ...document, layers, assets: [...document.assets.filter((a) => retained.has(a.id)), ...assets] }, limits);
  const imported = parsed.layers[index + 1], newIds = new Set(assets.map((a) => a.id)), importedAssets = parsed.assets.filter((a) => newIds.has(a.id));
  const next = { ...document, layers: layers.map((l) => l === layer ? imported : l), assets: parsed.assets };
  const warnings = [];
  if (hidden.length) warnings.push({ code: "HIDDEN_LAYERS_OMITTED", layers: hidden.map((l) => ({ id: l.id, name: l.name })) });
  if (source.background !== null) warnings.push({ code: "BACKGROUND_OMITTED", ...typeof source.background === "string" ? { color: source.background } : { background: source.background } });
  return {
    document: next,
    layerId: imported.id,
    assets: importedAssets,
    decodeDocument: { format: "lightmetal-etch", version: 1, background: null, layers: [imported], assets: importedAssets },
    summary: {
      name,
      visibleLayers: visible.length,
      hiddenLayers: hidden.length,
      elements: elements.length,
      assets: assets.length,
      bounds: { ...bounds },
      warnings
    },
    warnings
  };
}

// src/etch/state.js
var EVENT_NAMES = ["change", "load", "viewchange", "selectionchange", "historychange", "error"];
var EditorState = class {
  #document = freezeDocument(emptyDocument());
  #active = preferredLayer(this.#document);
  #selection = [];
  #session = createId();
  #sequence = 0;
  #destroyed = false;
  #pending = null;
  #pool = new AssetPool();
  #history;
  #events;
  #decode;
  #limits;
  #readOnly;
  #rasterReservations = /* @__PURE__ */ new Map();
  constructor({ readOnly = false, limits = {}, history = {}, decode = decodeAssets, reportError } = {}) {
    if (typeof readOnly !== "boolean") fail("INVALID_ARGUMENT", "readOnly must be boolean");
    this.#readOnly = readOnly;
    this.#limits = resolveLimits(limits);
    this.#history = new History(history);
    this.#events = new Emitter(reportError);
    this.#decode = decode;
  }
  #alive() {
    if (this.#destroyed) fail("DESTROYED", "This editor has been destroyed");
  }
  #editable() {
    this.#alive();
    if (this.#readOnly) fail("READ_ONLY", "This editor is read-only");
    if (this.#pending) fail("BUSY", "A document operation is pending");
  }
  #run(action, content = true) {
    if (content) this.#editable();
    else this.#alive();
    if (this.#events.dispatching) {
      this.#events.defer(() => this.#run(action, content));
      return;
    }
    return action();
  }
  #layer(id) {
    const layer = this.#document.layers.find((l) => l.id === id);
    if (!layer) fail("INVALID_ARGUMENT", "Unknown layer ID");
    return layer;
  }
  #unlocked(id, geometry2 = false) {
    const layer = this.#layer(id);
    if (layer.locked || geometry2 && !layer.visible) fail("LAYER_NOT_EDITABLE", "Layer must be visible and unlocked for geometry edits, and unlocked for structural edits");
    return layer;
  }
  #selectionPayload() {
    return { activeLayerId: this.#active, elementIds: [...this.#selection] };
  }
  #reconcile() {
    if (!this.#document.layers.some((l) => l.id === this.#active)) this.#active = preferredLayer(this.#document);
    const layer = this.#layer(this.#active);
    if (!layer.visible || layer.locked) {
      this.#selection = [];
      return;
    }
    if (!this.#selection.length) return;
    const elementIds = new Set(layer.elements.map((e) => e.id));
    this.#selection = this.#selection.filter((id) => elementIds.has(id));
  }
  #retain() {
    this.#pool.retain([this.#document, ...this.#history.documents()]);
  }
  #commit(next, label, { active = this.#active, clearSelection = false, source = "edit" } = {}) {
    if (next === this.#document) return;
    validateDocument(next, this.#limits);
    const beforeSelection = JSON.stringify(this.#selectionPayload());
    const before = this.#document, activeBefore = this.#active;
    this.#document = freezeDocument(next);
    this.#active = active;
    if (clearSelection) this.#selection = [];
    this.#reconcile();
    this.#history.push(before, this.#document, label, this.#active === activeBefore ? {} : { activeBefore, activeAfter: this.#active });
    this.#sequence++;
    this.#retain();
    const events = [
      ["change", { revision: this.getRevision(), label, source }],
      ["historychange", this.#history.getState()]
    ];
    if (beforeSelection !== JSON.stringify(this.#selectionPayload())) events.push(["selectionchange", this.#selectionPayload()]);
    this.#events.emitBatch(events);
  }
  #replaceLayer(id, replacement, label, options) {
    this.#commit({ ...this.#document, layers: this.#document.layers.map((l) => l.id === id ? replacement : l) }, label, options);
  }
  get document() {
    this.#alive();
    return this.#document;
  }
  get busy() {
    this.#alive();
    return this.#pending !== null;
  }
  get readOnly() {
    this.#alive();
    return this.#readOnly;
  }
  get assets() {
    this.#alive();
    return this.#pool;
  }
  getRevision() {
    this.#alive();
    return `${this.#session}:${this.#sequence}`;
  }
  getActiveLayer() {
    this.#alive();
    return this.#active;
  }
  getSelection() {
    this.#alive();
    return [...this.#selection];
  }
  save() {
    this.#alive();
    return snapshot(this.#document);
  }
  canUndo() {
    this.#alive();
    return this.#history.getState().canUndo;
  }
  canRedo() {
    this.#alive();
    return this.#history.getState().canRedo;
  }
  on(name, callback) {
    this.#alive();
    if (!EVENT_NAMES.includes(name) || typeof callback !== "function") fail("INVALID_ARGUMENT", "Unknown event or invalid listener");
    return this.#events.on(name, callback);
  }
  // Let browser-owned session mutations respect the same reentrant event boundary.
  runSession(action) {
    return this.#run(action, false);
  }
  async runSessionAsync(action) {
    this.#alive();
    if (this.#events.dispatching) return new Promise((resolve, reject) => {
      this.#events.defer(() => this.runSessionAsync(action).then(resolve, reject), reject);
    });
    return action();
  }
  notifyViewChange(view) {
    this.#run(() => this.#events.emitBatch([["viewchange", view]]), false);
  }
  notifyUIError(error) {
    this.#run(() => this.#events.emitBatch([["error", { code: error.code, message: error.message, details: error.details }]]), false);
  }
  async load(input2) {
    this.#alive();
    if (this.#events.dispatching) return new Promise((resolve, reject) => {
      this.#events.defer(() => this.load(input2).then(resolve, reject), reject);
    });
    this.cancel();
    const controller = new AbortController();
    this.#pending = controller;
    let pool, releasePixels;
    try {
      const next = freezeDocument(validateDocument(input2, this.#limits));
      const pixels = next.assets.reduce((sum, asset) => sum + asset.width * asset.height, 0);
      if (pixels) releasePixels = this.reserveRasterPixels(pixels);
      pool = await this.#decode(next, controller.signal);
      if (controller.signal.aborted || this.#destroyed || this.#pending !== controller) fail("CANCELLED", "Document load was superseded or cancelled");
      this.#pool.dispose();
      this.#pool = pool;
      pool = null;
      this.#document = next;
      this.#active = preferredLayer(next);
      this.#selection = [];
      this.#history.clear();
      this.#sequence++;
      this.#pending = null;
      this.#retain();
      this.#events.emitBatch([
        ["load", { revision: this.getRevision() }],
        ["historychange", this.#history.getState()],
        ["selectionchange", this.#selectionPayload()]
      ]);
    } catch (error) {
      pool?.dispose();
      if (controller.signal.aborted) fail("CANCELLED", "Document load was superseded or cancelled");
      throw error;
    } finally {
      releasePixels?.();
      if (this.#pending === controller) this.#pending = null;
    }
  }
  #retainedImages() {
    const assets = /* @__PURE__ */ new Map();
    for (const doc of [this.#document, ...this.#history.documents()]) {
      const used = referencedAssetIds(doc);
      for (const a of doc.assets) if (used.has(a.id)) assets.set(a.id, a);
    }
    let bytes = 0, pixels = 0;
    for (const a of assets.values()) {
      bytes += base64ByteLength(a.data);
      pixels += a.width * a.height;
    }
    return { count: assets.size, bytes, pixels };
  }
  /** Internal transient pixel ledger shared by import surfaces and PNG export jobs. */
  availableRasterPixels() {
    this.#alive();
    let reserved = 0;
    for (const pixels of this.#rasterReservations.values()) reserved += pixels;
    return Math.max(0, this.#limits.totalPixels - this.#retainedImages().pixels - reserved);
  }
  reserveRasterPixels(pixels) {
    this.#alive();
    if (!Number.isSafeInteger(pixels) || pixels < 1) fail("INVALID_ARGUMENT", "Raster reservation must be positive integer pixels");
    const available = this.availableRasterPixels();
    if (pixels > available) fail("LIMIT_EXCEEDED", "Raster safety allowance is in use by artwork, Undo history or pending operations", { limit: "totalPixels", maximum: this.#limits.totalPixels, available, requested: pixels });
    const key = /* @__PURE__ */ Symbol();
    this.#rasterReservations.set(key, pixels);
    return () => this.#rasterReservations.delete(key);
  }
  captureVectorExport() {
    this.#alive();
    return { document: this.#document, revision: this.getRevision(), limits: { ...this.#limits } };
  }
  captureExport() {
    this.#alive();
    return {
      document: this.#document,
      revision: this.getRevision(),
      assets: this.#pool,
      limits: { ...this.#limits },
      availablePixels: this.availableRasterPixels()
    };
  }
  async beginImageImport(center) {
    this.#editable();
    if (this.#events.dispatching) return new Promise((resolve, reject) => this.#events.defer(() => this.beginImageImport(center).then(resolve, reject), reject));
    if (!Array.isArray(center) || center.length !== 2 || Array.from(center).some((n) => !Number.isFinite(n))) fail("INVALID_ARGUMENT", "Import center must be a finite pair");
    const retained = this.#retainedImages();
    if (retained.count >= this.#limits.assets) fail("LIMIT_EXCEEDED", "Image asset limit reached, including Undo history", { limit: "assets", maximum: this.#limits.assets });
    if (this.#document.layers.length >= this.#limits.layers) fail("LIMIT_EXCEEDED", "Layer limit reached", { limit: "layers", maximum: this.#limits.layers });
    const controller = new AbortController();
    this.#pending = controller;
    return { document: this.#document, target: this.#active, center: [...center], layerId: createId(), elementId: createId(), controller, signal: controller.signal, limits: { ...this.#limits }, retained, reservePixels: (pixels) => this.reserveRasterPixels(pixels) };
  }
  #imageDestination(context, asset, name) {
    this.#alive();
    if (context.signal.aborted || this.#pending !== context.controller || context.document !== this.#document) fail("CANCELLED", "Image import baseline changed or cancelled");
    this.#name(name);
    const retained = this.#retainedImages(), bytes = typeof asset?.data === "string" ? base64ByteLength(asset.data) : 0;
    if (retained.bytes + bytes > this.#limits.assetBytes || retained.pixels + asset?.width * asset?.height > this.#limits.totalPixels) fail("LIMIT_EXCEEDED", "Image exceeds retained resource allowance");
    const layer = { id: context.layerId, name, visible: true, locked: false, offset: [...context.center], elements: [{ id: context.elementId, type: "image", transform: [1, 0, 0, 1, 0, 0], assetId: asset?.id, x: -asset?.width / 2, y: -asset?.height / 2, width: asset?.width, height: asset?.height, alt: name }] };
    const layers = [...this.#document.layers];
    layers.splice(layers.findIndex((l) => l.id === context.target) + 1, 0, layer);
    const used = referencedAssetIds(this.#document);
    const next = { ...this.#document, layers, assets: [...this.#document.assets.filter((a) => used.has(a.id)), asset] };
    const parsed = validateDocument(next, this.#limits);
    return { ...next, layers: layers.map((l) => l === layer ? parsed.layers.find((p) => p.id === l.id) : l), assets: parsed.assets };
  }
  previewImageImport(context, asset, name = "Image") {
    this.#imageDestination(context, asset, name);
  }
  async commitImageImport(context, asset, resource, name = "Image") {
    if (this.#events.dispatching) return new Promise((resolve, reject) => this.#events.defer(
      () => this.commitImageImport(context, asset, resource, name).then(resolve, reject),
      (error) => {
        try {
          resource?.close?.();
        } finally {
          reject(error);
        }
      }
    ));
    let added = false;
    try {
      const next = this.#imageDestination(context, asset, name);
      if (!resource || typeof resource.close !== "function" || !resource.image) fail("INVALID_ARGUMENT", "Image import needs an owned decoded resource");
      this.#pool.add(asset.id, resource);
      added = true;
      this.#pending = null;
      const revision = `${this.#session}:${this.#sequence + 1}`;
      this.#commit(next, "Import image", { active: context.layerId, clearSelection: true, source: "import" });
      return { layerId: context.layerId, revision, warnings: [] };
    } catch (error) {
      if (added) this.#retain();
      else resource?.close?.();
      if (this.#pending === context.controller) {
        context.controller.abort();
        this.#pending = null;
      }
      throw error;
    }
  }
  cancelImageImport(context) {
    if (this.#pending === context.controller) {
      context.controller.abort();
      this.#pending = null;
    }
  }
  #beginDocumentImport(center) {
    if (!Array.isArray(center) || center.length !== 2 || !Array.from(center).every(Number.isFinite)) fail("INVALID_ARGUMENT", "Import center must be a finite pair");
    if (this.#document.layers.length >= this.#limits.layers) fail("LIMIT_EXCEEDED", "Layer limit reached", { limit: "layers", maximum: this.#limits.layers });
    const controller = new AbortController();
    this.#pending = controller;
    const context = {
      document: this.#document,
      target: this.#active,
      center: [...center],
      controller,
      signal: controller.signal,
      limits: { ...this.#limits },
      plan: null,
      pool: null,
      release: null,
      decoding: false,
      started: false
    };
    context.dispose = () => {
      context.pool?.dispose();
      context.pool = null;
      context.plan = null;
      if (!context.decoding) {
        context.release?.();
        context.release = null;
      }
    };
    controller.signal.addEventListener("abort", context.dispose, { once: true });
    return context;
  }
  async beginDocumentImport(center) {
    this.#editable();
    if (this.#events.dispatching) return new Promise((resolve, reject) => this.#events.defer(() => this.beginDocumentImport(center).then(resolve, reject), reject));
    return this.#beginDocumentImport(center);
  }
  #checkDocumentImport(context) {
    if (context.signal.aborted || this.#destroyed || this.#pending !== context.controller || context.document !== this.#document) fail("CANCELLED", "Drawing import baseline changed or cancelled");
  }
  async prepareDocumentImport(context, input2, name = "Imported drawing") {
    this.#checkDocumentImport(context);
    if (context.started) fail("BUSY", "Drawing import is already prepared or preparing");
    context.started = true;
    let pool;
    try {
      const reservedIds = /* @__PURE__ */ new Set();
      for (const d of [this.#document, ...this.#history.documents()]) {
        for (const a of d.assets) reservedIds.add(a.id);
        for (const l of d.layers) {
          reservedIds.add(l.id);
          for (const e of l.elements) reservedIds.add(e.id);
        }
      }
      const plan = freezeDocument(planDocumentImport(input2, {
        document: context.document,
        target: context.target,
        center: context.center,
        limits: this.#limits,
        name,
        reservedIds
      }));
      const retained = this.#retainedImages(), bytes = plan.assets.reduce((sum, a) => sum + base64ByteLength(a.data), 0);
      if (retained.count + plan.assets.length > this.#limits.assets || retained.bytes + bytes > this.#limits.assetBytes) fail("LIMIT_EXCEEDED", "Drawing exceeds image allowance including Undo history");
      const pixels = plan.assets.reduce((sum, a) => sum + a.width * a.height, 0);
      if (pixels) context.release = this.reserveRasterPixels(pixels);
      context.decoding = true;
      pool = await this.#decode(plan.decodeDocument, context.signal);
      this.#checkDocumentImport(context);
      context.pool = pool;
      pool = null;
      context.plan = plan;
      return structuredClone(plan.summary);
    } catch (error) {
      const cancelled3 = context.signal.aborted || this.#destroyed || this.#pending !== context.controller;
      this.cancelDocumentImport(context);
      if (cancelled3) fail("CANCELLED", "Drawing import cancelled");
      throw error;
    } finally {
      pool?.dispose();
      context.decoding = false;
      if (!context.pool) {
        context.release?.();
        context.release = null;
      }
    }
  }
  async commitDocumentImport(context) {
    if (this.#events.dispatching) return new Promise((resolve, reject) => this.#events.defer(() => this.commitDocumentImport(context).then(resolve, reject), reject));
    let transferred = false;
    try {
      this.#checkDocumentImport(context);
      if (!context.plan || !context.pool) fail("INVALID_ARGUMENT", "Drawing import has no ready summary");
      const { document, layerId, warnings } = context.plan, result = { layerId, revision: `${this.#session}:${this.#sequence + 1}`, warnings: structuredClone(warnings) };
      context.pool.transferTo(this.#pool);
      transferred = true;
      context.pool = null;
      context.release?.();
      context.release = null;
      this.#pending = null;
      this.#commit(document, "Import drawing", { active: layerId, clearSelection: true, source: "import" });
      context.plan = null;
      return result;
    } catch (error) {
      if (transferred) this.#retain();
      this.cancelDocumentImport(context);
      throw error;
    }
  }
  cancelDocumentImport(context) {
    if (this.#pending === context.controller) {
      this.#pending = null;
      context.controller.abort();
    }
    context.dispose();
  }
  async importDocument(input2, center) {
    this.#editable();
    if (this.#events.dispatching) return new Promise((resolve, reject) => this.#events.defer(() => this.importDocument(input2, center).then(resolve, reject), reject));
    const context = this.#beginDocumentImport(center);
    try {
      await this.prepareDocumentImport(context, input2);
      return await this.commitDocumentImport(context);
    } finally {
      this.cancelDocumentImport(context);
    }
  }
  cancel() {
    this.#alive();
    this.#pending?.abort();
    this.#pending = null;
  }
  setActiveLayer(id) {
    return this.#run(() => {
      this.#layer(id);
      if (id === this.#active) return;
      this.#active = id;
      this.#selection = [];
      this.#events.emitBatch([["selectionchange", this.#selectionPayload()]]);
    }, false);
  }
  setSelection(ids) {
    return this.#run(() => {
      const layer = this.#layer(this.#active);
      const uniqueArray = Array.isArray(ids) && new Set(ids).size === ids.length;
      const elementIds = new Set(uniqueArray && ids.length ? layer.elements.map((e) => e.id) : []);
      if (!uniqueArray || ids.some((id) => !elementIds.has(id))) fail("INVALID_ARGUMENT", "Selection IDs must exist uniquely in the active layer");
      if (ids.length && (!layer.visible || layer.locked)) fail("LAYER_NOT_EDITABLE", "Selection requires an editable layer");
      if (JSON.stringify(ids) === JSON.stringify(this.#selection)) return;
      this.#selection = [...ids];
      this.#events.emitBatch([["selectionchange", this.#selectionPayload()]]);
    }, false);
  }
  createLayer({ name } = {}) {
    const layer = emptyLayer();
    this.#run(() => {
      if (name === void 0) {
        let n = 1;
        while (this.#document.layers.some((l) => l.name === `Layer ${n}`)) n++;
        layer.name = `Layer ${n}`;
      } else {
        this.#name(name);
        layer.name = name;
      }
      const layers = [...this.#document.layers];
      layers.splice(layers.findIndex((l) => l.id === this.#active) + 1, 0, layer);
      this.#commit({ ...this.#document, layers }, "New layer", { active: layer.id, clearSelection: true });
    });
    return layer.id;
  }
  #name(name) {
    if (typeof name !== "string" || name.length < 1 || name.length > 80) fail("INVALID_ARGUMENT", "Layer name must contain 1\u201380 characters");
  }
  renameLayer(id, name) {
    return this.#run(() => {
      this.#name(name);
      const layer = this.#unlocked(id);
      if (layer.name !== name) this.#replaceLayer(id, { ...layer, name }, "Rename layer");
    });
  }
  setLayerVisibility(id, visible) {
    return this.#setLayerFlag(id, "visible", visible, "Layer visibility");
  }
  setLayerLocked(id, locked) {
    return this.#setLayerFlag(id, "locked", locked, "Layer lock");
  }
  #setLayerFlag(id, key, value2, label) {
    return this.#run(() => {
      if (typeof value2 !== "boolean") fail("INVALID_ARGUMENT", "Expected boolean layer state");
      const layer = this.#layer(id);
      if (layer[key] !== value2) this.#replaceLayer(id, { ...layer, [key]: value2 }, label, { clearSelection: true });
    });
  }
  reorderLayer(id, index) {
    return this.#run(() => {
      const layer = this.#unlocked(id), layers = [...this.#document.layers];
      if (!Number.isInteger(index) || index < 0 || index >= layers.length) fail("INVALID_ARGUMENT", "Layer index is out of range");
      const old = layers.indexOf(layer);
      if (old === index) return;
      layers.splice(old, 1);
      layers.splice(index, 0, layer);
      this.#commit({ ...this.#document, layers }, "Reorder layer", { clearSelection: true });
    });
  }
  deleteLayer(id) {
    return this.#run(() => {
      this.#unlocked(id);
      const oldIndex = this.#document.layers.findIndex((l) => l.id === id);
      const layers = this.#document.layers.filter((l) => l.id !== id);
      if (!layers.length) layers.push(emptyLayer());
      const active = this.#active === id ? layers[Math.min(oldIndex, layers.length - 1)].id : this.#active;
      this.#commit({ ...this.#document, layers }, "Delete layer", { active, clearSelection: true });
    });
  }
  translateLayer(id, delta) {
    return this.#run(() => {
      const next = this.#translatedLayer(this.#unlocked(id, true), delta);
      if (next) this.#replaceLayer(id, next, "Move layer");
    });
  }
  rotateLayer(id = this.#active) {
    return this.#run(() => this.#rotateElements(this.#unlocked(id, true), null, "Rotate layer"));
  }
  rotateSelection() {
    return this.#run(() => this.#rotateElements(this.#unlocked(this.#active, true), new Set(this.#selection), "Rotate selection"));
  }
  #rotateElements(layer, ids, label) {
    let bounds = null;
    for (const element of layer.elements) if (!ids || ids.has(element.id)) bounds = unionBounds(bounds, elementBounds(element));
    if (!bounds) return;
    const cx = bounds.x + bounds.width / 2, cy = bounds.y + bounds.height / 2;
    const rotation2 = [0, 1, -1, 0, cx + cy, cy - cx];
    const elements = layer.elements.map((e) => !ids || ids.has(e.id) ? { ...e, transform: multiply(rotation2, e.transform).map((n) => n === 0 ? 0 : n) } : e);
    this.#replaceLayer(layer.id, { ...layer, elements }, label);
  }
  #translatedLayer(layer, delta) {
    if (!Array.isArray(delta) || delta.length !== 2 || Array.from(delta).some((n) => typeof n !== "number" || !Number.isFinite(n))) fail("INVALID_ARGUMENT", "Translation must be a finite [dx, dy] pair");
    const offset = layer.offset.map((n, i) => n + delta[i]);
    return offset.every((n, i) => n === layer.offset[i]) ? null : { ...layer, offset };
  }
  /** Internal whole-layer gesture seam. Never rewrite element geometry/matrices. */
  prepareLayerMove() {
    this.#editable();
    return { document: this.#document, layer: this.#unlocked(this.#active, true), tool: "move-layer" };
  }
  #layerMoveDestination(context, delta) {
    this.#editable();
    if (context.document !== this.#document || context.layer.id !== this.#active) fail("CANCELLED", "Layer move baseline changed");
    const layer = this.#translatedLayer(this.#unlocked(this.#active, true), delta);
    if (!layer) return null;
    const next = { ...this.#document, layers: this.#document.layers.map((l) => l.id === layer.id ? layer : l) };
    const parsed = validateDocument(next, this.#limits);
    return { ...layer, offset: parsed.layers.find((l) => l.id === layer.id).offset };
  }
  previewLayerMove(context, delta) {
    const layer = this.#layerMoveDestination(context, delta);
    return layer ? { layerId: layer.id, offset: [...layer.offset], elements: layer.elements } : null;
  }
  commitLayerMove(context, delta) {
    return this.#run(() => {
      const layer = this.#layerMoveDestination(context, delta);
      if (layer) this.#replaceLayer(layer.id, layer, "Move layer");
    });
  }
  /** Selection movement shares the immutable document baseline and full destination validation. */
  prepareSelectionMove() {
    this.#editable();
    return { document: this.#document, layer: this.#unlocked(this.#active, true), ids: this.getSelection(), tool: "select" };
  }
  #selectionMoveDestination(context, delta) {
    if (!Array.isArray(delta) || delta.length !== 2 || !Array.from(delta).every(Number.isFinite)) fail("INVALID_ARGUMENT", "Translation must be a finite pair");
    return this.#selectionTransformDestination(context, translate(...delta));
  }
  #selectionTransformDestination(context, matrix) {
    this.#editable();
    if (context.document !== this.#document || context.layer.id !== this.#active) fail("CANCELLED", "Selection baseline changed");
    if (!Array.isArray(matrix) || matrix.length !== 6 || !Array.from(matrix).every(Number.isFinite) || matrix[0] <= 0 || matrix[3] <= 0 || matrix[1] !== 0 || matrix[2] !== 0) fail("INVALID_ARGUMENT", "Selection transform requires positive axis scales and finite translation");
    if (!context.ids.length || matrix.every((n, i) => n === [1, 0, 0, 1, 0, 0][i])) return null;
    const ids = new Set(context.ids), layer = this.#unlocked(this.#active, true);
    const next = { ...layer, elements: layer.elements.map((e) => ids.has(e.id) ? { ...e, transform: multiply(matrix, e.transform) } : e) };
    validateDocument({ ...this.#document, layers: this.#document.layers.map((l) => l.id === layer.id ? next : l) }, this.#limits);
    return next;
  }
  previewSelectionMove(context, delta) {
    const layer = this.#selectionMoveDestination(context, delta);
    return layer ? { layerId: layer.id, elements: layer.elements } : null;
  }
  commitSelectionMove(context, delta) {
    return this.#run(() => {
      const layer = this.#selectionMoveDestination(context, delta);
      if (layer) this.#replaceLayer(layer.id, layer, "Move selection");
    });
  }
  previewSelectionResize(context, matrix) {
    const layer = this.#selectionTransformDestination(context, matrix);
    return layer ? { layerId: layer.id, elements: layer.elements } : null;
  }
  commitSelectionResize(context, matrix) {
    return this.#run(() => {
      const layer = this.#selectionTransformDestination(context, matrix);
      if (layer) this.#replaceLayer(layer.id, layer, "Resize selection");
    });
  }
  mergeDown(id = this.#active) {
    this.#editable();
    const initialIndex = this.#document.layers.findIndex((l) => l.id === id);
    const surviving = this.#document.layers[initialIndex - 1]?.id;
    this.#run(() => {
      const upper = this.#unlocked(id, true);
      const layers = [...this.#document.layers], index = layers.indexOf(upper);
      if (!index) fail("INVALID_ARGUMENT", "There is no lower layer to merge into");
      const lower2 = this.#unlocked(layers[index - 1].id, true);
      const offset = translate(upper.offset[0] - lower2.offset[0], upper.offset[1] - lower2.offset[1]);
      const elements = [...lower2.elements, ...upper.elements.map((e) => ({ ...e, transform: multiply(offset, e.transform) }))];
      layers.splice(index - 1, 2, { ...lower2, elements });
      this.#commit({ ...this.#document, layers }, "Merge down", { active: lower2.id, clearSelection: true });
    });
    return surviving;
  }
  /** Internal removal seam: no stored point/element capacity is required. */
  prepareErase(mode = "object") {
    this.#editable();
    if (!["object", "partial"].includes(mode)) fail("INVALID_ARGUMENT", "Unknown eraser mode");
    return { document: this.#document, layer: this.#unlocked(this.#active, true), tool: "eraser", mode, maxSamples: this.#limits.pointsPerElement };
  }
  #eraseLayer(context, mode) {
    this.#editable();
    if (context.document !== this.#document || context.layer.id !== this.#active) fail("CANCELLED", "Eraser baseline changed");
    if (context.mode !== mode) fail("INVALID_ARGUMENT", "Eraser mode does not match its baseline");
    return this.#unlocked(this.#active, true);
  }
  #eraseDestination(context, ids) {
    const layer = this.#eraseLayer(context, "object");
    if (!Array.isArray(ids) || Array.from(ids).some((id) => typeof id !== "string") || new Set(ids).size !== ids.length) fail("INVALID_ARGUMENT", "Eraser IDs must be a unique array");
    const removed = new Set(ids);
    for (const e of layer.elements) removed.delete(e.id);
    if (removed.size) fail("INVALID_ARGUMENT", "Eraser can only remove active-layer elements");
    if (!ids.length) return null;
    const hits = new Set(ids), next = { ...layer, elements: layer.elements.filter((e) => !hits.has(e.id)) };
    validateDocument({ ...this.#document, layers: this.#document.layers.map((l) => l === layer ? next : l) }, this.#limits);
    return next;
  }
  previewErase(context, ids) {
    const layer = this.#eraseDestination(context, ids);
    return layer ? { layerId: layer.id, elements: layer.elements } : null;
  }
  commitErase(context, ids) {
    return this.#run(() => {
      const layer = this.#eraseDestination(context, ids);
      if (layer) this.#replaceLayer(layer.id, layer, "Erase objects");
    });
  }
  #partialEraseDestination(context, changes) {
    const layer = this.#eraseLayer(context, "partial");
    if (!Array.isArray(changes)) fail("INVALID_ARGUMENT", "Partial eraser changes must be an array");
    const replacements = /* @__PURE__ */ new Map(), originals = new Map(layer.elements.map((e) => [e.id, e]));
    const oldIds = new Set(this.#document.assets.map((a) => a.id));
    for (const l of this.#document.layers) {
      oldIds.add(l.id);
      for (const e of l.elements) oldIds.add(e.id);
    }
    for (const change of Array.from(changes)) {
      if (!change || typeof change !== "object" || replacements.has(change.id) || !["line", "stroke", "ink"].includes(originals.get(change.id)?.type)) fail("INVALID_ARGUMENT", "Partial eraser can only replace unique active-layer lines or ink");
      const original = originals.get(change.id);
      let pieces;
      if (original.type === "line") pieces = lineFragments(original, change.ranges, change.ids);
      else {
        if (!Array.isArray(change.groups) || !Array.isArray(change.ids) || change.groups.length !== change.ids.length || Array.from(change.ids).some((id) => typeof id !== "string" || !id) || new Set(change.ids).size !== change.ids.length || change.ids.length && change.ids[0] !== original.id) fail("INVALID_ARGUMENT", "Invalid partial ink identities");
        if (change.groups.length > this.#limits.elements) fail("LIMIT_EXCEEDED", "Too many ink pieces", { limit: "elements", maximum: this.#limits.elements });
        pieces = Array.from(change.groups, (parts, i) => ({ id: change.ids[i], type: "ink", transform: original.transform, color: original.color, parts }));
      }
      if (change.ids.slice(1).some((id) => oldIds.has(id))) fail("INVALID_ARGUMENT", "New eraser pieces require fresh IDs");
      replacements.set(original.id, pieces);
    }
    const changed = [...replacements].some(([id, pieces]) => pieces.length !== 1 || pieces[0] !== originals.get(id));
    if (!changed) return null;
    const next = { ...layer, elements: layer.elements.flatMap((e) => replacements.get(e.id) ?? [e]) };
    const parsed = validateDocument({ ...this.#document, layers: this.#document.layers.map((l) => l === layer ? next : l) }, this.#limits);
    const canonical = new Map(parsed.layers.find((l) => l.id === layer.id).elements.map((e) => [e.id, e]));
    const fresh = new Set([...replacements.values()].flat().filter((e) => e.type === "ink"));
    return { ...next, elements: next.elements.map((e) => fresh.has(e) ? canonical.get(e.id) : e) };
  }
  previewPartialErase(context, changes) {
    const layer = this.#partialEraseDestination(context, changes);
    return layer ? { layerId: layer.id, elements: layer.elements } : null;
  }
  commitPartialErase(context, changes) {
    return this.#run(() => {
      const layer = this.#partialEraseDestination(context, changes);
      if (layer) this.#replaceLayer(layer.id, layer, changes.some((c) => c.groups) ? "Partially erase ink" : "Partially erase lines");
    });
  }
  /** Internal append gesture seam; Arrow paths consume stored command slots. */
  prepareDrawing(tool) {
    if (!["pen", "highlighter", "line", "arrow", "rect", "ellipse"].includes(tool)) fail("INVALID_ARGUMENT", "Unimplemented drawing tool");
    this.#editable();
    const layer = this.#unlocked(this.#active, true);
    let points = 0, elements = 0;
    for (const l of this.#document.layers) for (const e of l.elements) {
      elements++;
      points += ["stroke", "highlight"].includes(e.type) ? e.points.length : e.type === "path" ? e.commands.length : e.type === "ink" ? e.parts.reduce((n, p) => n + p.length, 0) : 0;
    }
    if (elements >= this.#limits.elements) fail("LIMIT_EXCEEDED", "Element limit reached", { limit: "elements", maximum: this.#limits.elements });
    const maxPoints = Math.min(this.#limits.pointsPerElement, this.#limits.points - points);
    if (["pen", "highlighter"].includes(tool) && maxPoints < 1) fail("LIMIT_EXCEEDED", "Document sample limit reached", { limit: "points", maximum: this.#limits.points });
    const limit4 = this.#limits.points - points < this.#limits.pointsPerElement ? "points" : "pointsPerElement";
    return { document: this.#document, layer, tool, maxPoints, sampleLimit: { limit: limit4, maximum: this.#limits[limit4] } };
  }
  #drawingDestination(context, element) {
    this.#editable();
    if (context.document !== this.#document || context.layer.id !== this.#active) fail("CANCELLED", "Drawing baseline changed");
    const layer = this.#unlocked(this.#active, true);
    if (element === null) return null;
    if (element.type !== (context.tool === "pen" ? "stroke" : context.tool === "highlighter" ? "highlight" : context.tool === "arrow" ? "path" : context.tool)) fail("INVALID_ARGUMENT", "Element does not match the gesture tool");
    const next = { ...this.#document, layers: this.#document.layers.map((l) => l === layer ? { ...l, elements: [...l.elements, element] } : l) };
    const parsed = validateDocument(next, this.#limits);
    return parsed.layers.find((l) => l.id === layer.id).elements.at(-1);
  }
  previewDrawing(context, element) {
    const canonical = this.#drawingDestination(context, element);
    return canonical ? { layerId: context.layer.id, elements: [...context.layer.elements, canonical] } : null;
  }
  commitDrawing(context, element) {
    return this.#run(() => {
      const canonical = this.#drawingDestination(context, element), layer = context.layer;
      if (!canonical) return;
      const label = { pen: "Pen stroke", highlighter: "Highlighter stroke", line: "Draw line", arrow: "Draw arrow", rect: "Draw rectangle", ellipse: "Draw ellipse" }[context.tool];
      this.#replaceLayer(layer.id, { ...layer, elements: [...layer.elements, canonical] }, label, { clearSelection: true });
    });
  }
  deleteSelection() {
    return this.#run(() => {
      const ids = new Set(this.#selection);
      if (!ids.size) return;
      const layer = this.#unlocked(this.#active, true);
      this.#replaceLayer(layer.id, { ...layer, elements: layer.elements.filter((e) => !ids.has(e.id)) }, "Delete selection", { clearSelection: true });
    });
  }
  setBackground(value2) {
    return this.#run(() => {
      const background = normalizeBackground(value2, "INVALID_ARGUMENT", true);
      if (JSON.stringify(background) !== JSON.stringify(this.#document.background)) this.#commit({ ...this.#document, background }, "Background");
    });
  }
  undo() {
    return this.#stepHistory("undo");
  }
  redo() {
    return this.#stepHistory("redo");
  }
  #stepHistory(source) {
    return this.#run(() => {
      const entry = this.#history[source]();
      if (!entry) return;
      const oldSelection = JSON.stringify(this.#selectionPayload());
      this.#document = source === "undo" ? entry.before : entry.after;
      this.#active = (source === "undo" ? entry.activeBefore : entry.activeAfter) ?? this.#active;
      this.#reconcile();
      this.#sequence++;
      this.#retain();
      const events = [["change", { revision: this.getRevision(), label: entry.label, source }], ["historychange", this.#history.getState()]];
      if (oldSelection !== JSON.stringify(this.#selectionPayload())) events.push(["selectionchange", this.#selectionPayload()]);
      this.#events.emitBatch(events);
    });
  }
  destroy() {
    if (this.#destroyed) return;
    this.cancel();
    this.#destroyed = true;
    this.#events.clear(new EtchError("CANCELLED", "Queued operation cancelled by destruction"));
    this.#history.clear();
    this.#pool.dispose();
    this.#document = null;
    this.#selection = [];
    this.#rasterReservations.clear();
  }
};

// src/etch/tools.js
var SHAPE_TOOLS = Object.freeze(["line", "arrow", "rect", "ellipse"]);
var isShapeTool = (tool) => SHAPE_TOOLS.includes(tool);
var isLineTool = (tool) => tool === "line" || tool === "arrow";
var color2 = (value2) => typeof value2 === "string" && /^#[\da-f]{6}$/i.test(value2);
var width = (value2) => typeof value2 === "number" && Number.isFinite(value2) && value2 >= 0.5 && value2 <= 64;
var ToolSession = class {
  #tool;
  #shapeTool = "rect";
  #settings = {
    hand: {},
    select: {},
    "move-layer": {},
    eraser: { radius: 10, mode: "partial" },
    pen: { color: "#24292F", width: 3, pressure: true },
    highlighter: { color: "#FDE047", width: 20, opacity: 0.35 },
    line: { stroke: "#24292F", strokeWidth: 2 },
    arrow: { stroke: "#24292F", strokeWidth: 2 },
    rect: { stroke: "#24292F", strokeWidth: 2, fill: null },
    ellipse: { stroke: "#24292F", strokeWidth: 2, fill: null }
  };
  #drawWithTouch;
  constructor({ readOnly = false, drawWithTouch = true, onChange = () => {
  } } = {}) {
    this.#tool = readOnly ? "hand" : "pen";
    this.#drawWithTouch = drawWithTouch;
    this.onChange = onChange;
  }
  getTool() {
    return this.#tool;
  }
  getShapeTool() {
    return this.#shapeTool;
  }
  setTool(tool) {
    this.getSettings(tool);
    if (tool === this.#tool) return;
    this.#tool = tool;
    if (isShapeTool(tool)) this.#shapeTool = tool;
    this.onChange();
  }
  getSettings(tool) {
    if (typeof tool !== "string" || !Object.hasOwn(this.#settings, tool)) fail("INVALID_ARGUMENT", "Unknown or unimplemented tool");
    return { ...this.#settings[tool] };
  }
  setSettings(tool, patch) {
    const current = this.getSettings(tool);
    if (!patch || typeof patch !== "object" || Array.isArray(patch) || Object.keys(patch).some((key) => !Object.hasOwn(current, key))) fail("INVALID_ARGUMENT", "Unsupported tool settings");
    const next = { ...current, ...patch };
    if (tool === "pen" && (!color2(next.color) || !width(next.width) || typeof next.pressure !== "boolean")) {
      fail("INVALID_ARGUMENT", "Pen requires an opaque #RRGGBB color, width in [0.5, 64] and boolean pressure");
    }
    if (tool === "highlighter" && (!color2(next.color) || !width(next.width) || !Number.isFinite(next.opacity) || next.opacity < 0.05 || next.opacity > 1)) {
      fail("INVALID_ARGUMENT", "Highlighter requires an opaque #RRGGBB color, width in [0.5, 64] and opacity in [0.05, 1]");
    }
    if (tool === "eraser" && (typeof next.radius !== "number" || !Number.isFinite(next.radius) || next.radius < 1 || next.radius > 128 || !["object", "partial"].includes(next.mode))) {
      fail("INVALID_ARGUMENT", "Eraser requires radius in [1, 128] CSS pixels and mode object or partial");
    }
    if (isShapeTool(tool) && (!width(next.strokeWidth) || !(color2(next.stroke) || !isLineTool(tool) && next.stroke === null) || !isLineTool(tool) && !(color2(next.fill) || next.fill === null) || next.stroke === null && next.fill === null)) {
      fail("INVALID_ARGUMENT", "Shapes require opaque paints, width in [0.5, 64], and at least one paint; lines require a border");
    }
    for (const key of ["color", "stroke", "fill"]) if (typeof next[key] === "string") next[key] = next[key].toUpperCase();
    if (Object.keys(next).every((key) => next[key] === current[key])) return;
    this.#settings[tool] = next;
    this.onChange();
  }
  getDrawWithTouch() {
    return this.#drawWithTouch;
  }
  setDrawWithTouch(value2) {
    if (typeof value2 !== "boolean") fail("INVALID_ARGUMENT", "Draw with finger must be boolean");
    if (value2 === this.#drawWithTouch) return;
    this.#drawWithTouch = value2;
    this.onChange();
  }
};

// src/etch/export-bounds.js
var finite = (n) => typeof n === "number" && Number.isFinite(n);
var object2 = (value2) => value2 && typeof value2 === "object" && !Array.isArray(value2);
function exportBounds(document, { padding = 16, bounds: raw } = {}) {
  if (!finite(padding) || padding < 0) fail("INVALID_ARGUMENT", "Export padding must be a non-negative finite number");
  if (raw !== void 0 && (!object2(raw) || Object.keys(raw).some((k) => !["x", "y", "width", "height"].includes(k)) || !["x", "y", "width", "height"].every((k) => finite(raw[k])) || raw.width <= 0 || raw.height <= 0)) fail("INVALID_ARGUMENT", "Export bounds require finite x/y and positive width/height");
  if (raw === void 0) {
    const painted = documentBounds(document);
    raw = painted && painted.width > 0 && painted.height > 0 ? painted : { x: -128, y: -128, width: 256, height: 256 };
  }
  const bounds = { x: raw.x - padding, y: raw.y - padding, width: raw.width + 2 * padding, height: raw.height + 2 * padding };
  if (!Object.values(bounds).every(finite) || !finite(bounds.x + bounds.width) || !finite(bounds.y + bounds.height)) fail("INVALID_ARGUMENT", "Export bounds overflow supported coordinates");
  return bounds;
}

// src/etch/ui/sidebar-resize.js
function createSidebarResize(root, body, sidebar, onStart) {
  const doc = root.ownerDocument, win = doc.defaultView;
  const handle = doc.createElement("div");
  handle.className = "etch-sidebar-resize";
  handle.tabIndex = 0;
  for (const [name, value2] of Object.entries({ role: "separator", "aria-label": "Resize sidebar", "aria-orientation": "vertical", "aria-controls": sidebar.id })) handle.setAttribute(name, value2);
  handle.title = "Drag to resize sidebar \xB7 Left/Right: resize \xB7 Home/End: limits \xB7 Enter or double-click: reset";
  sidebar.prepend(handle);
  let requested = null, drag = null, destroyed = false;
  const limits = () => {
    const max = Math.max(0, Math.min(400, body.clientWidth - 40));
    return { min: Math.min(200, max), max };
  };
  const clamp3 = (width2) => {
    const { min, max } = limits();
    return Math.max(min, Math.min(max, width2));
  };
  function update() {
    const { min, max } = limits();
    handle.setAttribute("aria-valuemin", String(Math.round(min)));
    handle.setAttribute("aria-valuemax", String(Math.round(max)));
    handle.setAttribute("aria-valuenow", String(Math.round(sidebar.getBoundingClientRect().width)));
    handle.setAttribute("aria-valuetext", `${handle.getAttribute("aria-valuenow")} pixels`);
  }
  function set(width2) {
    requested = width2;
    if (width2 === null) sidebar.style.removeProperty("--etch-session-sidebar-width");
    else sidebar.style.setProperty("--etch-session-sidebar-width", `${width2}px`);
    update();
  }
  function finish(commit) {
    if (!drag) return;
    const previous = drag;
    drag = null;
    root.classList.remove("etch-sidebar-resizing");
    if (!commit) set(previous.requested);
    if (handle.hasPointerCapture(previous.id)) handle.releasePointerCapture(previous.id);
  }
  function reset() {
    if (destroyed) return;
    finish(false);
    onStart();
    set(240);
  }
  handle.addEventListener("pointerdown", (event) => {
    if (destroyed || drag || event.button !== 0) return;
    event.preventDefault();
    onStart();
    handle.focus({ preventScroll: true });
    drag = { id: event.pointerId, x: event.clientX, width: sidebar.getBoundingClientRect().width, requested };
    handle.setPointerCapture(event.pointerId);
    root.classList.add("etch-sidebar-resizing");
  });
  handle.addEventListener("pointermove", (event) => {
    if (destroyed || !drag || event.pointerId !== drag.id) return;
    if (!handle.hasPointerCapture(event.pointerId)) {
      finish(false);
      return;
    }
    set(clamp3(drag.width + drag.x - event.clientX));
  });
  handle.addEventListener("pointerup", (event) => {
    if (destroyed || !drag || event.pointerId !== drag.id) return;
    if (!handle.hasPointerCapture(event.pointerId)) {
      finish(false);
      return;
    }
    set(clamp3(drag.width + drag.x - event.clientX));
    finish(true);
  });
  for (const type of ["pointercancel", "lostpointercapture"]) handle.addEventListener(type, (event) => {
    if (drag?.id === event.pointerId) finish(false);
  });
  handle.addEventListener("dblclick", reset);
  handle.addEventListener("keydown", (event) => {
    if (destroyed) return;
    if (!["ArrowLeft", "ArrowRight", "Home", "End", "Enter", "Escape"].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.key === "Escape") {
      finish(false);
      return;
    }
    if (event.key === "Enter") {
      reset();
      return;
    }
    finish(false);
    onStart();
    const { min, max } = limits(), step = event.shiftKey ? 50 : 10;
    set(event.key === "Home" ? min : event.key === "End" ? max : clamp3(sidebar.getBoundingClientRect().width + (event.key === "ArrowLeft" ? step : -step)));
  });
  const cancel = () => finish(false);
  handle.addEventListener("blur", cancel);
  win.addEventListener("blur", cancel);
  const observer = new win.ResizeObserver((entries2) => {
    if (destroyed) return;
    if (entries2.some((entry) => entry.target === body)) finish(false);
    update();
  });
  observer.observe(body);
  observer.observe(sidebar);
  return {
    cancel,
    destroy() {
      destroyed = true;
      finish(false);
      observer.disconnect();
      win.removeEventListener("blur", cancel);
      handle.remove();
    }
  };
}

// src/etch/text-input.js
async function readUTF8Blob(value2, { maximum, signal, invalidCode, label }) {
  if (!Number.isSafeInteger(maximum) || maximum < 1 || maximum > DEFAULT_LIMITS.jsonBytes) fail("INVALID_ARGUMENT", "Invalid text input byte limit");
  const cancelled3 = () => {
    if (signal?.aborted) fail("CANCELLED", `${label} import cancelled`);
  };
  const tooLarge2 = () => fail("LIMIT_EXCEEDED", `${label} exceeds the input byte limit`, { limit: invalidCode === "INVALID_SVG" ? "svgBytes" : "jsonBytes", maximum });
  cancelled3();
  let size;
  try {
    size = Object.getOwnPropertyDescriptor(Blob.prototype, "size").get.call(value2);
  } catch {
    fail("INVALID_ARGUMENT", `${label} input must be a Blob/File`);
  }
  if (size > maximum) tooLarge2();
  const reader = Blob.prototype.stream.call(value2).getReader(), decoder = new TextDecoder("utf-8", { fatal: true }), parts = [];
  let bytes = 0;
  const abort = () => {
    reader.cancel().catch(() => {
    });
  };
  signal?.addEventListener("abort", abort, { once: true });
  try {
    while (true) {
      cancelled3();
      const { done, value: chunk } = await reader.read();
      cancelled3();
      if (done) break;
      bytes += chunk.byteLength;
      if (bytes > maximum) tooLarge2();
      parts.push(decoder.decode(chunk, { stream: true }));
    }
    parts.push(decoder.decode());
    return parts.join("");
  } catch (error) {
    cancelled3();
    if (error instanceof EtchError) throw error;
    fail(invalidCode, `${label} files must contain valid UTF-8 text`);
  } finally {
    signal?.removeEventListener("abort", abort);
    await reader.cancel().catch(() => {
    });
    reader.releaseLock();
  }
}

// src/etch/ui/shell.js
var ICONS = {
  undo: ["M9 5 4 10l5 5", "M4 10h9a6 6 0 0 1 0 12"],
  redo: ["m15 5 5 5-5 5", "M20 10h-9a6 6 0 0 0 0 12"],
  sidebar: ["M3 4h18v16H3z", "M14 4v16", "M17 8h1M17 12h1M17 16h1"],
  plus: ["M12 5v14M5 12h14"],
  more: ["M5 12h.1M12 12h.1M19 12h.1"],
  background: ["M4 4h16v16H4z", "M4 4l16 16M12 4l8 8M4 12l8 8"],
  merge: ["M6 3v5c0 4 12 4 12 8v5", "M18 3v18", "m14 17 4 4 4-4"],
  rotate: ["M20 10a8 8 0 1 0-2 8", "M20 3v7h-7"],
  fullscreen: ["M8 3H3v5M16 3h5v5M21 16v5h-5M8 21H3v-5"],
  up: ["M12 20V4m-6 6 6-6 6 6"],
  down: ["M12 4v16m-6-6 6 6 6-6"],
  trash: ["M3 6h18M9 6V3h6v3", "m5 6 1 15h12l1-15", "M10 10v7M14 10v7"],
  image: ["M3 4h18v16H3z", "m3 16 5-5 4 4 3-3 6 6", "M14 8h1"],
  document: ["M6 3h8l4 4v7M14 3v5h5M6 3v18h6", "M14 18h8m-3-3 3 3-3 3"],
  download: ["M12 3v12m-5-5 5 5 5-5", "M4 16v5h16v-5"],
  svg: ["M5 3h9l5 5v13H5Z", "M14 3v6h5", "m10 12-3 3 3 3m4-6 3 3-3 3"],
  hand: ["M7 12V6a2 2 0 0 1 4 0v5-7a2 2 0 0 1 4 0v7-5a2 2 0 0 1 4 0v9c0 5-3 7-7 7-3 0-5-2-7-5l-2-4a2 2 0 0 1 3-2l2 2"],
  select: ["M5 3v17l5-5 4 7 3-2-4-7 7-1Z"],
  pen: ["m4 16-1 5 5-1L21 7l-5-5Z", "m13 5 6 6M4 16l4 4"],
  highlighter: ["m5 12 8-9 8 7-8 9Z", "m5 12-2 7 5-1M4 22h16", "m10 6 8 7"],
  shapes: ["M3 3h10v10H3z", "M20 14a6 6 0 1 1-6-6", "m15 9 6-6"],
  line: ["M4 20 20 4"],
  arrow: ["M4 20 20 4", "M9 4h11v11"],
  rect: ["M4 5h16v14H4z"],
  ellipse: ["M21 12a9 7 0 1 1-18 0 9 7 0 1 1 18 0"],
  chevron: ["m7 10 5 5 5-5"],
  eraser: ["m3 15 10-12 8 7-9 11H9Z", "m7 10 9 8M12 21h9"],
  move: ["M12 3v18M3 12h18", "m8 7 4-4 4 4M8 17l4 4 4-4M7 8l-4 4 4 4m10-8 4 4-4 4"],
  fit: ["M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5", "M9 9h6v6H9z"],
  actual: ["M16 10a6 6 0 1 1-12 0 6 6 0 1 1 12 0", "m15 15 6 6"],
  eye: ["M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z", "M9 12a3 3 0 1 0 6 0 3 3 0 1 0-6 0"],
  "eye-off": ["m3 3 18 18", "M10 5h2c6 0 10 7 10 7a22 22 0 0 1-3 4", "M6 6a24 24 0 0 0-4 6s4 7 10 7c2 0 4-1 5-2", "M9 9a4 4 0 0 0 6 6"],
  lock: ["M5 10h14v11H5z", "M8 10V7a4 4 0 0 1 8 0v3", "M12 14v3"],
  unlock: ["M5 10h14v11H5z", "M8 10V7a4 4 0 0 1 8 0", "M12 14v3"]
};
function createShell(container, state, api, onError, { sidebarOpen: initialSidebarOpen = false } = {}) {
  const doc = container.ownerDocument;
  const node = (tag, className, text2) => {
    const element = doc.createElement(tag);
    if (className) element.className = className;
    if (text2) element.textContent = text2;
    return element;
  };
  function icon(name) {
    const svg = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
    for (const [key, value2] of Object.entries({
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": "1.7",
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
      "aria-hidden": "true",
      focusable: "false"
    })) {
      svg.setAttribute(key, value2);
    }
    for (const d of ICONS[name]) {
      const path = doc.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", d);
      svg.append(path);
    }
    return svg;
  }
  const root = node("section", "etch");
  root.setAttribute("aria-label", "Etch sketch editor");
  root.tabIndex = 0;
  const toolbar = node("div", "etch-toolbar");
  toolbar.setAttribute("role", "toolbar");
  toolbar.setAttribute("aria-label", "Editor actions");
  const toolbarContents = node("div", "etch-toolbar-scroll");
  toolbar.append(toolbarContents);
  const status = node("div", "etch-status");
  status.setAttribute("role", "group");
  status.setAttribute("aria-label", "Editor status");
  const statusContext = node("span", "etch-status-context"), statusMessage = node("span", "etch-status-message", "Ready"), statusMetrics = node("span", "etch-status-metrics");
  statusMessage.setAttribute("role", "status");
  statusMessage.setAttribute("aria-live", "polite");
  const exportSize = node("span", "etch-export-size"), statusZoom = node("span", "etch-status-zoom", "100%");
  statusZoom.setAttribute("aria-label", "Zoom 100%");
  statusMetrics.append(exportSize, statusZoom);
  status.append(statusContext, statusMessage, statusMetrics);
  let boundsDocument = null, layersDocument = null, layersBlocked = null;
  let destroyed = false;
  let sidebarOpen = initialSidebarOpen, lastTool = null, quickOpen = false;
  const hasQuickControls = (tool) => ["pen", "highlighter", "eraser"].includes(tool) || isShapeTool(tool);
  const inkTool = () => api.getTool() === "highlighter" ? "highlighter" : "pen";
  function selectTool(tool, { toggle: toggle2 = false } = {}) {
    const open = hasQuickControls(tool) && !(toggle2 && api.getTool() === tool && quickOpen);
    api.setTool(tool);
    quickOpen = open;
    refreshTools();
  }
  function run(action) {
    if (destroyed) return;
    try {
      Promise.resolve(action()).catch(report);
    } catch (error) {
      report(error);
    }
  }
  function report(error) {
    if (destroyed) return;
    announce(error.message, { error: true });
    onError(error);
  }
  function button(label, action, parent, iconName, text2 = false) {
    const el = node("button", `etch-button${text2 ? "" : " etch-icon-button"}`);
    el.type = "button";
    el.setAttribute("aria-label", label);
    el.title = label;
    if (iconName) el.append(icon(iconName));
    if (text2) el.append(node("span", "", label));
    el.addEventListener("click", () => run(action));
    parent.append(el);
    return el;
  }
  function positionMenu(menu, button2) {
    const anchor = button2.getBoundingClientRect(), bounds = menu.getBoundingClientRect(), win = doc.defaultView;
    menu.style.left = `${Math.max(4, Math.min(anchor.left, win.innerWidth - bounds.width - 4))}px`;
    menu.style.top = `${Math.max(4, Math.min(anchor.bottom + 4, win.innerHeight - bounds.height - 4))}px`;
  }
  function toolbarGroup(label) {
    const group = node("div", "etch-toolbar-group");
    group.setAttribute("role", "group");
    group.setAttribute("aria-label", label);
    toolbarContents.append(group);
    return group;
  }
  const historyGroup = toolbarGroup("History"), navigationGroup = toolbarGroup("Navigation"), drawingGroup = toolbarGroup("Drawing"), documentGroup = toolbarGroup("Document"), viewGroup = toolbarGroup("View"), zoomGroup = toolbarGroup("Zoom");
  const undoButton = button("Undo", () => api.undo(), historyGroup, "undo");
  undoButton.title = "Undo (Ctrl/Cmd + Z)";
  const redoButton = button("Redo", () => api.redo(), historyGroup, "redo");
  redoButton.title = "Redo (Ctrl/Cmd + Shift + Z / Ctrl + Y)";
  const hand = button("Hand / Pan", () => api.setTool("hand"), navigationGroup, "hand");
  hand.classList.add("etch-tool");
  hand.title = "Hand / Pan (H or Space)";
  const select = button("Select", () => api.setTool("select"), navigationGroup, "select");
  select.classList.add("etch-tool");
  const moveLayer = button("Move Layer", () => api.setTool("move-layer"), navigationGroup, "move");
  moveLayer.classList.add("etch-tool");
  const pen = button("Pen", () => selectTool("pen", { toggle: true }), drawingGroup, "pen");
  pen.classList.add("etch-tool");
  const highlighter = button("Highlighter", () => selectTool("highlighter", { toggle: true }), drawingGroup, "highlighter");
  highlighter.classList.add("etch-tool");
  highlighter.title = "Highlighter (K)";
  const eraser = button("Eraser", () => selectTool("eraser", { toggle: true }), drawingGroup, "eraser");
  eraser.classList.add("etch-tool");
  const shapeSplit = node("div", "etch-shape-split");
  drawingGroup.append(shapeSplit);
  const shapes = button("Shapes", () => selectTool(api.getShapeTool(), { toggle: true }), shapeSplit, "rect");
  shapes.classList.add("etch-tool");
  const shapeChooser = button("Choose shape", () => {
    if (shapeMenu.matches(":popover-open")) shapeMenu.hidePopover();
    else {
      shapeMenu.showPopover();
      shapeChooser.setAttribute("aria-expanded", "true");
      positionMenu(shapeMenu, shapeChooser);
      shapeMenu.querySelector(`[data-shape="${api.getShapeTool()}"]`).focus();
    }
  }, shapeSplit, "chevron");
  const shapeMenu = node("div", "etch-shape-menu");
  shapeMenu.id = `etch-shapes-${createId()}`;
  shapeMenu.setAttribute("popover", "auto");
  shapeMenu.setAttribute("role", "group");
  shapeMenu.setAttribute("aria-label", "Choose shape");
  root.append(shapeMenu);
  shapeChooser.setAttribute("aria-controls", shapeMenu.id);
  shapeChooser.setAttribute("aria-expanded", "false");
  const shapeChoices = /* @__PURE__ */ new Map();
  for (const [tool, label] of [["line", "Line (L)"], ["arrow", "Arrow (A)"], ["rect", "Rectangle (R)"], ["ellipse", "Ellipse (O)"]]) {
    const choice4 = button(label, () => {
      selectTool(tool);
      shapeMenu.hidePopover();
      shapes.focus();
    }, shapeMenu, tool, true);
    choice4.dataset.shape = tool;
    shapeChoices.set(tool, choice4);
  }
  shapeMenu.addEventListener("toggle", () => shapeChooser.setAttribute("aria-expanded", String(shapeMenu.matches(":popover-open"))));
  shapeMenu.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      shapeMenu.hidePopover();
      shapeChooser.focus();
    }
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      event.stopPropagation();
      const choices = [...shapeChoices.values()], index = choices.indexOf(doc.activeElement);
      choices[event.key === "Home" ? 0 : event.key === "End" ? choices.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + choices.length) % choices.length].focus();
    }
  });
  const rotate = button("Rotate clockwise 90\xB0", () => state.getSelection().length ? api.rotateSelection() : api.rotateLayer(), viewGroup, "rotate");
  const fullscreen = button("Fullscreen", () => api.setExpanded(!api.getViewState().expanded), viewGroup, "fullscreen");
  fullscreen.setAttribute("aria-pressed", "false");
  const fit = button("Fit drawing", () => api.fit(), zoomGroup, "fit");
  fit.title = "Fit drawing (0)";
  const actual = button("100%", () => api.actualSize(), zoomGroup, "actual");
  actual.title = "Actual size (1)";
  const zoomLabel = node("span", "etch-zoom", "100%");
  zoomLabel.setAttribute("aria-label", "Zoom");
  zoomGroup.append(zoomLabel);
  const toggle = button("Toggle sidebar", () => setSidebarOpen(!sidebarOpen), toolbar, "sidebar");
  toggle.classList.add("etch-sidebar-toggle");
  toggle.setAttribute("aria-expanded", String(sidebarOpen));
  toggle.title = sidebarOpen ? "Hide sidebar" : "Show sidebar";
  const body = node("div", "etch-body");
  const viewport = node("div", "etch-viewport");
  viewport.setAttribute("role", "group");
  viewport.setAttribute("aria-label", "Sketch viewport");
  viewport.tabIndex = 0;
  const message = node("div", "etch-empty");
  const emptyHeading = node("strong", "", "Start drawing"), emptyHelp = node("p", "", "Choose a tool above, or drag an image here.");
  const emptyActions = node("div", "etch-empty-actions");
  message.append(emptyHeading, emptyHelp, emptyActions);
  const summary = node("span", "etch-sr-only");
  summary.id = `etch-summary-${createId()}`;
  viewport.setAttribute("aria-describedby", summary.id);
  viewport.append(message, summary);
  const scrim = node("button", "etch-sidebar-scrim");
  scrim.type = "button";
  scrim.tabIndex = -1;
  scrim.setAttribute("aria-label", "Close sidebar");
  scrim.hidden = !sidebarOpen;
  scrim.addEventListener("click", () => setSidebarOpen(false));
  const sidebar = node("aside", "etch-sidebar");
  sidebar.id = `etch-sidebar-${createId()}`;
  sidebar.setAttribute("aria-label", "Editor sidebar");
  sidebar.hidden = !sidebarOpen;
  toggle.setAttribute("aria-controls", sidebar.id);
  const layerSection = node("section", "etch-layer-section");
  layerSection.setAttribute("aria-label", "Layer management");
  const header = node("div", "etch-sidebar-header");
  const layerTitle = node("div", "etch-sidebar-title"), layerHeading = node("h2", "etch-sidebar-heading");
  layerTitle.append(layerHeading);
  const layersDisclosure = button("Layers", () => {
    const open = layersDisclosure.getAttribute("aria-expanded") !== "true";
    layersDisclosure.setAttribute("aria-expanded", String(open));
    layers.hidden = layerActions.hidden = !open;
  }, layerHeading, "chevron", true);
  layersDisclosure.classList.add("etch-disclosure");
  layersDisclosure.setAttribute("aria-expanded", "true");
  const titleActions = node("div", "etch-sidebar-title-actions");
  layerTitle.append(titleActions);
  const nativeFile = node("input");
  nativeFile.type = "file";
  nativeFile.accept = ".etch.json,.json,application/vnd.lightmetal.etch+json,application/json";
  nativeFile.hidden = true;
  nativeFile.setAttribute("aria-label", "Choose Etch drawing");
  root.append(nativeFile);
  const nativeImportButton = button("Import drawing", () => {
    nativeFile.value = "";
    nativeFile.click();
  }, titleActions, "document");
  nativeImportButton.title = "Import native Etch drawing as one new layer";
  const svgFile = node("input");
  svgFile.type = "file";
  svgFile.accept = ".svg,image/svg+xml";
  svgFile.hidden = true;
  svgFile.setAttribute("aria-label", "Choose SVG drawing");
  root.append(svgFile);
  const svgImportButton = button("Import SVG", () => {
    svgFile.value = "";
    svgFile.click();
  }, titleActions, "svg");
  svgImportButton.title = "Import supported SVG as one editable layer";
  const backgroundButton = button("Document background", () => openBackgroundDialog(), documentGroup, "background");
  const exportButton = button("Export", () => {
  }, documentGroup, "download", true);
  const exportMenu = node("div", "etch-export-menu");
  exportMenu.id = `etch-export-${createId()}`;
  exportMenu.tabIndex = -1;
  exportMenu.setAttribute("popover", "auto");
  exportMenu.setAttribute("role", "group");
  exportMenu.setAttribute("aria-label", "Export drawing");
  root.append(exportMenu);
  exportButton.setAttribute("popovertarget", exportMenu.id);
  exportButton.setAttribute("aria-controls", exportMenu.id);
  exportButton.setAttribute("aria-expanded", "false");
  let exporting = false;
  const downloadURLs = /* @__PURE__ */ new Map();
  function closeExportMenu() {
    if (exportMenu.matches(":popover-open")) exportMenu.hidePopover();
    if (!destroyed) exportButton.focus({ preventScroll: true });
  }
  function downloadExport(blob, name) {
    if (destroyed) return;
    const win = doc.defaultView, url = win.URL.createObjectURL(blob), anchor = node("a");
    downloadURLs.set(url, null);
    anchor.href = url;
    anchor.download = name;
    anchor.hidden = true;
    root.append(anchor);
    try {
      anchor.click();
    } finally {
      anchor.remove();
      if (downloadURLs.has(url)) downloadURLs.set(url, win.setTimeout(() => {
        win.URL.revokeObjectURL(url);
        downloadURLs.delete(url);
      }, 0));
    }
  }
  async function exportDrawing(format) {
    if (exporting || destroyed) return;
    closeExportMenu();
    exporting = true;
    exportPNGButton.disabled = exportSVGButton.disabled = true;
    exportButton.setAttribute("aria-busy", "true");
    announce(`Exporting ${format}\u2026`);
    try {
      let blob;
      if (format === "PNG") {
        let result;
        try {
          result = await api.exportPNG();
        } catch (error) {
          if (destroyed) return;
          const scale2 = error.details?.suggestedScale;
          if (error.code !== "EXPORT_TOO_LARGE" || !Number.isFinite(scale2) || scale2 <= 0) throw error;
          if (!doc.defaultView.confirm(`This drawing is too large to export at 100%. Download PNG at ${(scale2 * 100).toPrecision(3)}% instead? The editable drawing stays unchanged.`)) {
            announce("PNG export cancelled");
            return;
          }
          result = await api.exportPNG({ scale: scale2 });
        }
        blob = result.blob;
      } else {
        const { svg } = api.exportSVG();
        blob = new doc.defaultView.Blob([svg], { type: "image/svg+xml;charset=utf-8" });
      }
      if (destroyed) return;
      downloadExport(blob, format === "PNG" ? "drawing.png" : "drawing.svg");
      announce(`${format} download started`);
    } finally {
      exporting = false;
      if (!destroyed) {
        exportPNGButton.disabled = exportSVGButton.disabled = false;
        exportButton.setAttribute("aria-busy", "false");
      }
    }
  }
  const exportPNGButton = button("Export PNG", () => exportDrawing("PNG"), exportMenu, "image", true);
  exportPNGButton.autofocus = true;
  const exportSVGButton = button("Export SVG", () => exportDrawing("SVG"), exportMenu, "svg", true);
  exportMenu.addEventListener("beforetoggle", (event) => {
    if (event.newState === "open") exportMenu.toggleAttribute("autofocus", exporting);
  });
  exportMenu.addEventListener("toggle", () => {
    if (destroyed) return;
    const open = exportMenu.matches(":popover-open");
    exportButton.setAttribute("aria-expanded", String(open));
    if (open) positionMenu(exportMenu, exportButton);
  });
  exportMenu.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closeExportMenu();
    }
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      event.stopPropagation();
      const choices = [exportPNGButton, exportSVGButton].filter((el) => !el.disabled), index = choices.indexOf(doc.activeElement);
      choices[event.key === "Home" ? 0 : event.key === "End" ? choices.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + choices.length) % choices.length]?.focus();
    }
  });
  const layerOptionsButton = button("Layer options", () => openLayerDialog(state.getActiveLayer()), titleActions, "more");
  header.append(layerTitle);
  const layerActions = node("div", "etch-layer-actions");
  header.append(layerActions);
  const newButton = button("New layer", () => api.createLayer(), layerActions, "plus", true);
  const file = node("input");
  file.type = "file";
  file.accept = "image/png,image/jpeg,image/webp";
  file.hidden = true;
  file.setAttribute("aria-label", "Choose local image");
  root.append(file);
  const importButton = button("Import image", () => {
    file.value = "";
    file.click();
  }, layerActions, "image", true);
  const emptyDrawing = button("Import drawing to start", () => {
    nativeFile.value = "";
    nativeFile.click();
  }, emptyActions, "document", true);
  emptyDrawing.lastChild.textContent = "Import drawing";
  const emptyImage = button("Import image to start", () => {
    file.value = "";
    file.click();
  }, emptyActions, "image", true);
  emptyImage.lastChild.textContent = "Import image";
  const layers = node("div", "etch-layers");
  layers.setAttribute("role", "group");
  layers.setAttribute("aria-label", "Layers, topmost first");
  layers.id = `etch-layers-${createId()}`;
  layersDisclosure.setAttribute("aria-controls", layers.id);
  layerSection.append(header, layers);
  sidebar.append(layerSection);
  const properties = node("section", "etch-tool-properties");
  properties.setAttribute("aria-label", "Pen properties");
  const propertiesTitle = node("h2", "etch-sidebar-heading"), propertyContent = node("div", "etch-properties-content");
  propertyContent.id = `etch-properties-${createId()}`;
  const propertiesDisclosure = button("Pen properties", () => {
    const open = propertiesDisclosure.getAttribute("aria-expanded") !== "true";
    propertiesDisclosure.setAttribute("aria-expanded", String(open));
    propertyContent.hidden = !open;
  }, propertiesTitle, "chevron", true);
  propertiesDisclosure.classList.add("etch-disclosure");
  propertiesDisclosure.setAttribute("aria-expanded", "true");
  propertiesDisclosure.setAttribute("aria-controls", propertyContent.id);
  const moveTarget = node("p", "etch-move-target");
  properties.append(propertiesTitle, propertyContent);
  propertyContent.append(moveTarget);
  const fields = node("div", "etch-pen-fields");
  const color3 = node("input");
  color3.type = "color";
  color3.setAttribute("aria-label", "Pen color");
  const width2 = node("input");
  width2.type = "number";
  width2.min = "0.5";
  width2.max = "64";
  width2.step = "0.5";
  width2.setAttribute("aria-label", "Pen width");
  width2.title = "Width in world units, independent of zoom";
  for (const [text2, input2] of [["Color", color3], ["Width", width2]]) {
    const label = node("label", "etch-property-field");
    label.append(node("span", "", text2), input2);
    fields.append(label);
  }
  const widthSlider = node("input");
  widthSlider.type = "range";
  widthSlider.min = width2.min;
  widthSlider.max = width2.max;
  widthSlider.step = width2.step;
  widthSlider.setAttribute("aria-label", "Pen width slider");
  const widthControl = node("div", "etch-width-control"), widthLabel = width2.parentElement, widthField = node("div", "etch-property-field");
  width2.id = `etch-pen-width-${createId()}`;
  widthLabel.htmlFor = width2.id;
  widthLabel.classList.remove("etch-property-field");
  widthLabel.replaceWith(widthField);
  widthField.append(widthLabel, widthControl);
  widthControl.append(widthSlider, width2);
  widthSlider.addEventListener("input", () => run(() => api.setToolSettings(inkTool(), { width: Number(widthSlider.value) })));
  const strokePreview = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
  strokePreview.classList.add("etch-stroke-preview");
  strokePreview.setAttribute("viewBox", "0 0 180 80");
  strokePreview.setAttribute("role", "img");
  const previewPath = doc.createElementNS("http://www.w3.org/2000/svg", "path");
  strokePreview.append(previewPath);
  const previewLabel = node("div", "etch-property-field");
  previewLabel.append(node("span", "", "Stroke preview"), strokePreview);
  fields.append(previewLabel);
  let previewWidth = null;
  color3.addEventListener("input", () => run(() => api.setToolSettings(inkTool(), { color: color3.value })));
  width2.addEventListener("change", () => run(() => {
    try {
      api.setToolSettings(inkTool(), { width: Number(width2.value) });
    } finally {
      refreshTools();
    }
  }));
  const pressure = node("input");
  pressure.type = "checkbox";
  pressure.setAttribute("aria-label", "Pen pressure width");
  const pressureLabel = node("label", "etch-finger");
  pressureLabel.append(pressure, node("span", "", "Pressure width"));
  pressureLabel.title = "Vary new stylus strokes with pressure. Off uses constant width; mouse and finger always use constant width.";
  pressure.addEventListener("change", () => run(() => api.setToolSettings("pen", { pressure: pressure.checked })));
  const opacity2 = node("input");
  opacity2.type = "number";
  opacity2.min = "5";
  opacity2.max = "100";
  opacity2.step = "1";
  opacity2.setAttribute("aria-label", "Highlighter opacity percent");
  const opacityLabel = node("label", "etch-property-field");
  opacityLabel.append(node("span", "", "Opacity (%)"), opacity2);
  opacity2.addEventListener("change", () => run(() => {
    try {
      api.setToolSettings("highlighter", { opacity: Number(opacity2.value) / 100 });
    } finally {
      refreshTools();
    }
  }));
  fields.append(pressureLabel, opacityLabel);
  const shapeType = node("select");
  shapeType.setAttribute("aria-label", "Shape type");
  const shapeNames = { line: "Line", arrow: "Arrow", rect: "Rectangle", ellipse: "Ellipse" };
  for (const tool of SHAPE_TOOLS) {
    const option = node("option", "", shapeNames[tool]);
    option.value = tool;
    shapeType.append(option);
  }
  shapeType.addEventListener("change", () => run(() => api.setTool(shapeType.value)));
  const shapeTypeLabel = node("label", "etch-property-field");
  shapeTypeLabel.append(node("span", "", "Type"), shapeType);
  shapeType.title = "Hold Shift to constrain lines, squares and circles";
  const shapeLayout = node("div", "etch-shape-fields"), shapeFields = node("div", "etch-shape-panels"), shapeControls = /* @__PURE__ */ new Map();
  let displayedShape = null;
  shapeLayout.append(shapeTypeLabel, shapeFields);
  for (const tool of SHAPE_TOOLS) {
    const panel = node("div", "etch-shape-panel");
    const border = node("input");
    border.type = "checkbox";
    const fillEnabled = node("input");
    fillEnabled.type = "checkbox";
    const borderColor = node("input");
    borderColor.type = "color";
    borderColor.value = "#24292f";
    const borderWidth = node("input");
    borderWidth.type = "number";
    borderWidth.min = "0.5";
    borderWidth.max = "64";
    borderWidth.step = "0.5";
    borderWidth.title = "Border width in world units, independent of zoom";
    const fillColor = node("input");
    fillColor.type = "color";
    fillColor.value = "#dbeafe";
    borderColor.setAttribute("aria-label", "Border color");
    fillColor.setAttribute("aria-label", "Fill color");
    borderWidth.setAttribute("aria-label", "Border width");
    const widthLabel2 = node("label", "etch-property-field");
    widthLabel2.append(node("span", "", "Width (world)"), borderWidth);
    panel.append(widthLabel2);
    const paints = node("div", "etch-shape-paints");
    for (const [text2, enabled, paint3] of [["Border", border, borderColor], ...isLineTool(tool) ? [] : [["Fill", fillEnabled, fillColor]]]) {
      const group = node("div", "etch-property-field etch-shape-paint");
      if (isLineTool(tool)) group.append(node("span", "", text2));
      else {
        const label = node("label", "etch-paint-toggle");
        label.append(enabled, node("span", "", text2));
        group.append(label);
      }
      group.append(paint3);
      paints.append(group);
    }
    panel.append(paints);
    const update = (patch) => run(() => {
      try {
        api.setToolSettings(tool, patch);
      } finally {
        refreshTools();
      }
    });
    borderColor.addEventListener("input", () => update({ stroke: borderColor.value }));
    borderWidth.addEventListener("change", () => update({ strokeWidth: Number(borderWidth.value) }));
    if (!isLineTool(tool)) {
      fillEnabled.title = "Uncheck for no fill; at least a border or fill is required";
      border.title = "At least a border or fill is required";
      border.addEventListener("change", () => update({ stroke: border.checked ? borderColor.value : null }));
      fillEnabled.addEventListener("change", () => update({ fill: fillEnabled.checked ? fillColor.value : null }));
      fillColor.addEventListener("input", () => update({ fill: fillColor.value }));
    }
    shapeControls.set(tool, { panel, border, fillEnabled, borderColor, borderWidth, fillColor });
  }
  const eraserFields = node("div", "etch-eraser-fields"), radius = node("input");
  radius.type = "number";
  radius.min = "1";
  radius.max = "128";
  radius.step = "1";
  radius.setAttribute("aria-label", "Eraser radius");
  radius.title = "Radius in CSS pixels; stays the same size at every zoom";
  const eraserMode = node("select");
  eraserMode.setAttribute("aria-label", "Eraser mode");
  for (const [value2, text2] of [["object", "Whole object"], ["partial", "Partial (Pen + lines)"]]) {
    const option = node("option", "", text2);
    option.value = value2;
    eraserMode.append(option);
  }
  eraserMode.addEventListener("change", () => run(() => api.setToolSettings("eraser", { mode: eraserMode.value })));
  const modeLabel = node("label", "etch-property-field");
  modeLabel.append(node("span", "", "Mode"), eraserMode);
  const radiusLabel = node("label", "etch-property-field");
  radiusLabel.append(node("span", "", "Radius (screen px)"), radius);
  eraserFields.append(modeLabel, radiusLabel);
  radius.addEventListener("change", () => run(() => {
    try {
      api.setToolSettings("eraser", { radius: Number(radius.value) });
    } finally {
      refreshTools();
    }
  }));
  const finger = node("input");
  finger.type = "checkbox";
  const fingerLabel = node("label", "etch-finger");
  fingerLabel.append(finger, node("span", "", "Draw with finger"));
  finger.addEventListener("change", () => run(() => api.setDrawWithTouch(finger.checked)));
  const rotateSelection = button("Rotate selection clockwise 90\xB0", () => api.rotateSelection(), propertyContent, "rotate", true);
  const toolNote = node("p", "etch-tool-note");
  propertyContent.append(fields, shapeLayout, eraserFields, fingerLabel, toolNote);
  sidebar.append(properties);
  const quick = node("div", "etch-quick-toolbar");
  quick.id = `etch-quick-${createId()}`;
  quick.setAttribute("role", "toolbar");
  quick.setAttribute("aria-label", "Tool quick controls");
  quick.hidden = true;
  const quickTitle = node("strong", "etch-quick-title");
  quick.append(quickTitle);
  for (const control of [pen, highlighter, eraser, shapes]) {
    control.setAttribute("aria-controls", quick.id);
    control.setAttribute("aria-expanded", "false");
  }
  const quickShapes = shapeType.cloneNode(true);
  quickShapes.setAttribute("aria-label", "Quick shape");
  quick.append(quickShapes);
  quickShapes.addEventListener("change", () => run(() => selectTool(quickShapes.value)));
  const quickPaint = node("div", "etch-quick-group");
  quickPaint.setAttribute("role", "group");
  quickPaint.setAttribute("aria-label", "Stroke colors");
  quick.append(quickPaint);
  const swatches = /* @__PURE__ */ new Map();
  const extraColors = node("div", "etch-quick-group");
  extraColors.id = `etch-colors-${createId()}`;
  extraColors.hidden = true;
  function quickUpdate(patch) {
    api.setToolSettings(api.getTool(), patch);
  }
  function paintPatch(value2) {
    return ["pen", "highlighter"].includes(api.getTool()) ? { color: value2 } : { stroke: value2 };
  }
  for (const [index, value2] of ["#24292F", "#FDE047", "#EF4444", "#F59E0B", "#22C55E", "#3B82F6", "#8B5CF6", "#EC4899", "#FFFFFF", "#64748B", "#78350F", "#14B8A6", "#DBEAFE", "#FDE68A", "#FDA4AF", "#A3E635", "#6366F1"].entries()) {
    const swatch = button(`Stroke color ${value2}`, () => quickUpdate(paintPatch(value2)), index < 8 ? quickPaint : extraColors, null);
    swatch.classList.add("etch-color-swatch");
    swatch.style.setProperty("--etch-swatch", value2);
    swatches.set(value2, swatch);
  }
  const moreColors = button("More colors", () => {
    extraColors.hidden = !extraColors.hidden;
    moreColors.setAttribute("aria-expanded", String(!extraColors.hidden));
  }, quickPaint, "more");
  moreColors.setAttribute("aria-controls", extraColors.id);
  moreColors.setAttribute("aria-expanded", "false");
  quickPaint.append(extraColors);
  const quickColor = node("input");
  quickColor.type = "color";
  quickColor.setAttribute("aria-label", "Custom stroke color");
  quickColor.title = "Custom stroke color";
  quickPaint.append(quickColor);
  quickColor.addEventListener("input", () => run(() => quickUpdate(paintPatch(quickColor.value))));
  const quickWidths = node("div", "etch-quick-group");
  quickWidths.setAttribute("role", "group");
  quickWidths.setAttribute("aria-label", "Width presets");
  quick.append(quickWidths);
  const widthPresets = /* @__PURE__ */ new Map();
  for (const value2 of [1, 3, 6, 12, 8, 16, 24, 40]) {
    const preset = button(`Stroke width ${value2}`, () => quickUpdate(["pen", "highlighter"].includes(api.getTool()) ? { width: value2 } : { strokeWidth: value2 }), quickWidths, null);
    const mark = node("span", "etch-width-mark");
    mark.style.height = `${Math.min(28, value2)}px`;
    preset.append(mark);
    widthPresets.set(value2, preset);
  }
  const quickPreview = strokePreview.cloneNode(true);
  quickPreview.classList.remove("etch-stroke-preview");
  quickPreview.classList.add("etch-quick-preview");
  quick.append(quickPreview);
  const quickPressure = pressure.cloneNode();
  quickPressure.setAttribute("aria-label", "Quick pressure width");
  const quickPressureLabel = node("label", "etch-quick-group");
  quickPressureLabel.title = pressureLabel.title;
  quickPressureLabel.append(quickPressure, node("span", "", "Pressure width"));
  quick.append(quickPressureLabel);
  quickPressure.addEventListener("change", () => run(() => api.setToolSettings("pen", { pressure: quickPressure.checked })));
  const quickOpacity = node("input");
  quickOpacity.type = "range";
  quickOpacity.min = "5";
  quickOpacity.max = "100";
  quickOpacity.step = "1";
  quickOpacity.setAttribute("aria-label", "Quick opacity percent");
  const quickOpacityLabel = node("label", "etch-quick-group"), quickOpacityValue = node("span");
  quickOpacityLabel.append(quickOpacityValue, quickOpacity);
  quick.append(quickOpacityLabel);
  quickOpacity.addEventListener("input", () => run(() => api.setToolSettings("highlighter", { opacity: Number(quickOpacity.value) / 100 })));
  const quickBorderLabel = node("label", "etch-quick-group"), quickBorder = node("input");
  quickBorder.type = "checkbox";
  quickBorder.setAttribute("aria-label", "Quick shape border");
  quickBorderLabel.append(quickBorder, node("span", "", "Border"));
  quick.append(quickBorderLabel);
  quickBorder.addEventListener("change", () => run(() => quickUpdate({ stroke: quickBorder.checked ? shapeControls.get(api.getTool()).borderColor.value : null })));
  const quickFillLabel = node("label", "etch-quick-group"), quickFill = node("input");
  quickFill.type = "checkbox";
  quickFill.setAttribute("aria-label", "Quick shape fill");
  quickFillLabel.append(quickFill, node("span", "", "Fill"));
  quick.append(quickFillLabel);
  quickFill.addEventListener("change", () => run(() => quickUpdate({ fill: quickFill.checked ? shapeControls.get(api.getTool()).fillColor.value : null })));
  const quickFillColor = node("input");
  quickFillColor.type = "color";
  quickFillColor.setAttribute("aria-label", "Quick fill color");
  quick.append(quickFillColor);
  quickFillColor.addEventListener("input", () => run(() => quickUpdate({ fill: quickFillColor.value })));
  const quickSizes = node("div", "etch-quick-group");
  quickSizes.setAttribute("role", "group");
  quickSizes.setAttribute("aria-label", "Eraser radius presets");
  quick.append(quickSizes);
  const sizePresets = /* @__PURE__ */ new Map();
  for (const value2 of [5, 10, 20, 40]) {
    const preset = button(`Eraser radius ${value2} pixels`, () => quickUpdate({ radius: value2 }), quickSizes, null);
    const mark = node("span", "etch-size-mark");
    mark.style.width = mark.style.height = `${Math.min(28, value2 + 4)}px`;
    preset.append(mark);
    sizePresets.set(value2, preset);
  }
  const quickMode = eraserMode.cloneNode(true);
  quickMode.setAttribute("aria-label", "Quick erasing mode");
  quick.append(quickMode);
  quickMode.addEventListener("change", () => run(() => quickUpdate({ mode: quickMode.value })));
  body.append(viewport, scrim, sidebar);
  root.append(toolbar, quick, body, status);
  container.append(root);
  const sidebarResize = createSidebarResize(root, body, sidebar, () => api.cancelGesture());
  const imageDialog = node("dialog", "etch-dialog etch-image-dialog");
  imageDialog.setAttribute("aria-labelledby", `etch-image-title-${createId()}`);
  const imageTitle = node("h2", "", "Import image");
  imageTitle.id = imageDialog.getAttribute("aria-labelledby");
  const imagePreview = node("canvas", "etch-image-preview");
  imagePreview.width = imagePreview.height = 0;
  imagePreview.setAttribute("aria-label", "Encoded image preview");
  const imageFormat = node("select");
  imageFormat.setAttribute("aria-label", "Image format");
  for (const [value2, text2] of [["webp", "WebP \u2014 smaller file"], ["png", "PNG \u2014 lossless"]]) {
    const option = node("option", "", text2);
    option.value = value2;
    imageFormat.append(option);
  }
  const imageQuality = node("input");
  imageQuality.type = "number";
  imageQuality.min = "0";
  imageQuality.max = "100";
  imageQuality.step = "1";
  imageQuality.value = "80";
  imageQuality.setAttribute("aria-label", "WebP quality");
  const formatLabel = node("label", "etch-property-field");
  formatLabel.append(node("span", "", "Format"), imageFormat);
  const qualityLabel = node("label", "etch-property-field");
  qualityLabel.append(node("span", "", "WebP quality (0\u2013100)"), imageQuality);
  const imageDetails = node("p", "etch-image-details"), imageError = node("p", "etch-image-error");
  imageError.setAttribute("role", "alert");
  imageDetails.setAttribute("role", "status");
  const imageHelp = node("p", "etch-image-help", "Local only\u2014nothing is uploaded. Original dimensions stay unchanged. PNG is lossless; browser compression effort is automatic. After import, lock the image layer and choose New layer to draw above it. Use Fit drawing for large pictures.");
  const imageActions = node("div", "etch-image-actions");
  button("Cancel import", () => closeImageDialog(), imageActions, null, true);
  const imageConfirm = button("Import as layer", async () => {
    const flow = imageFlow;
    if (!flow?.ready) return;
    imageConfirm.disabled = true;
    try {
      await flow.session.commit();
      closeImageDialog();
      announce("Image imported. Use Fit drawing, lock the image layer, then add a new layer to draw above.");
    } catch (error) {
      if (error.code !== "CANCELLED") report(error);
      closeImageDialog();
    }
  }, imageActions, null, true);
  imageDialog.append(imageTitle, imagePreview, formatLabel, qualityLabel, imageDetails, imageError, imageHelp, imageActions);
  root.append(imageDialog);
  const layerDialog = node("dialog", "etch-dialog etch-layer-dialog"), layerDialogTitle = node("h2", "", "Edit layer");
  layerDialogTitle.id = `etch-layer-title-${createId()}`;
  layerDialog.id = `etch-layer-dialog-${createId()}`;
  layerDialog.setAttribute("aria-labelledby", layerDialogTitle.id);
  layerOptionsButton.setAttribute("aria-haspopup", "dialog");
  layerOptionsButton.setAttribute("aria-controls", layerDialog.id);
  const nameForm = node("form"), nameLabel = node("label", "etch-property-field"), nameInput = node("input");
  nameInput.type = "text";
  nameInput.maxLength = 80;
  nameInput.setAttribute("aria-label", "Layer name");
  nameLabel.append(node("span", "", "Layer name (1\u201380 characters)"), nameInput);
  nameForm.append(nameLabel);
  const rename = button("Rename layer", () => {
  }, nameForm, null, true);
  rename.type = "submit";
  const layerError = node("p", "etch-image-error");
  layerError.setAttribute("role", "alert");
  const stacking = node("div", "etch-layer-stacking");
  const moveUp = button("Move layer up", () => moveDialogLayer(1), stacking, "up", true);
  const moveDown = button("Move layer down", () => moveDialogLayer(-1), stacking, "down", true);
  const rotateLayer = button("Rotate layer clockwise 90\xB0", () => {
    layerError.textContent = "";
    try {
      api.rotateLayer(optionsLayerId);
    } catch (error) {
      layerError.textContent = error.message;
      throw error;
    }
  }, stacking, "rotate", true);
  const mergeHelp = node("p", "etch-layer-help");
  mergeHelp.id = `etch-merge-help-${createId()}`;
  const merge = button("Merge Down", () => mergeDialogLayer(), stacking, "merge", true);
  merge.setAttribute("aria-describedby", mergeHelp.id);
  const layerDone = node("div", "etch-image-actions");
  button("Done", () => closeLayerDialog(), layerDone, null, true);
  layerDialog.append(layerDialogTitle, nameForm, layerError, node("p", "etch-layer-help", "Higher layers draw above lower ones. Each rename, move, rotation or merge is undoable. Rotate turns all artwork on this layer together; click again for another 90\xB0."), stacking, mergeHelp, layerDone);
  root.append(layerDialog);
  let optionsLayerId = null;
  function closeLayerDialog(restoreFocus = true) {
    optionsLayerId = null;
    if (layerDialog.open) layerDialog.close();
    if (restoreFocus && sidebarOpen && !destroyed) (layerOptionsButton.disabled ? layers.querySelector('.etch-layer-select[aria-pressed="true"]') : layerOptionsButton)?.focus({ preventScroll: true });
  }
  function refreshLayerDialog() {
    if (!layerDialog.open) return;
    const index = state.document.layers.findIndex((l) => l.id === optionsLayerId), layer = state.document.layers[index];
    if (!layer || state.busy || state.readOnly || layer.locked) {
      closeLayerDialog(false);
      return;
    }
    layerDialogTitle.textContent = `Edit layer: ${layer.name}`;
    moveUp.disabled = index === state.document.layers.length - 1;
    moveDown.disabled = index === 0;
    rotateLayer.disabled = !layer.visible || !layer.elements.length;
    const { lower: lower2, reason } = mergeTarget(layer.id);
    merge.disabled = Boolean(reason);
    merge.title = reason || `Merge \u201C${layer.name}\u201D into \u201C${lower2.name}\u201D`;
    mergeHelp.textContent = reason || `Merge \u201C${layer.name}\u201D into \u201C${lower2.name}\u201D. The lower layer keeps its name; artwork stays editable. Undo restores both layers.`;
  }
  function mergeTarget(id) {
    const index = state.document.layers.findIndex((l) => l.id === id), upper = state.document.layers[index], lower2 = state.document.layers[index - 1];
    const reason = state.readOnly ? "Read-only: layers cannot be merged." : state.busy ? "Wait for the current operation before merging." : !upper ? "This layer is no longer available." : !lower2 ? "No lower layer to merge into." : !upper.visible ? `Show \u201C${upper.name}\u201D before merging.` : upper.locked ? `Unlock \u201C${upper.name}\u201D before merging.` : !lower2.visible ? `Show \u201C${lower2.name}\u201D before merging.` : lower2.locked ? `Unlock \u201C${lower2.name}\u201D before merging.` : "";
    return { upper, lower: lower2, reason };
  }
  function mergeDialogLayer() {
    const target = optionsLayerId, { upper, lower: lower2, reason } = mergeTarget(target);
    if (reason) {
      refreshLayerDialog();
      return;
    }
    layerError.textContent = "";
    try {
      api.mergeDown(target);
    } catch (error) {
      layerError.textContent = error.message;
      throw error;
    }
    closeLayerDialog();
    announce(`Merged \u201C${upper.name}\u201D into \u201C${lower2.name}\u201D. Undo restores both layers.`);
  }
  function openLayerDialog(id) {
    const layer = state.document.layers.find((l) => l.id === id);
    if (!layer || state.busy || state.readOnly || layer.locked) return;
    api.cancel();
    optionsLayerId = id;
    nameInput.value = layer.name;
    layerError.textContent = "";
    layerDialog.showModal();
    refreshLayerDialog();
    nameInput.focus();
    nameInput.select();
  }
  function moveDialogLayer(delta) {
    const index = state.document.layers.findIndex((l) => l.id === optionsLayerId), target = index + delta;
    if (index < 0 || target < 0 || target >= state.document.layers.length) return;
    api.reorderLayer(optionsLayerId, target);
    announce(delta > 0 ? "Layer moved up" : "Layer moved down");
  }
  nameForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const name = nameInput.value.trim();
    if (!name || name.length > 80) {
      layerError.textContent = "Enter a layer name containing 1\u201380 characters.";
      nameInput.focus();
      return;
    }
    run(() => {
      if (!optionsLayerId) return;
      api.renameLayer(optionsLayerId, name);
      closeLayerDialog();
      announce("Layer renamed");
    });
  });
  layerDialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeLayerDialog();
  });
  const backgroundDialog = node("dialog", "etch-dialog etch-background-dialog"), backgroundTitle = node("h2", "", "Document background");
  backgroundTitle.id = `etch-background-title-${createId()}`;
  backgroundDialog.id = `etch-background-dialog-${createId()}`;
  backgroundDialog.setAttribute("aria-labelledby", backgroundTitle.id);
  backgroundButton.setAttribute("aria-haspopup", "dialog");
  backgroundButton.setAttribute("aria-controls", backgroundDialog.id);
  const backgroundForm = node("form");
  backgroundForm.noValidate = true;
  const backgroundMode = node("select");
  backgroundMode.setAttribute("aria-label", "Background mode");
  for (const [value2, text2] of [["transparent", "Transparent"], ["solid", "Solid color"], ["offwhite", "Off-white"], ...Object.entries(PAPER_STYLES).map(([type, style]) => [type, style.name])]) {
    const option = node("option", "", text2);
    option.value = value2;
    backgroundMode.append(option);
  }
  const backgroundModeLabel = node("label", "etch-property-field");
  backgroundModeLabel.append(node("span", "", "Background"), backgroundMode);
  const backgroundColor = node("input");
  backgroundColor.type = "color";
  backgroundColor.setAttribute("aria-label", "Background color");
  const backgroundHex = node("input");
  backgroundHex.type = "text";
  backgroundHex.maxLength = 7;
  backgroundHex.spellcheck = false;
  backgroundHex.autocomplete = "off";
  backgroundHex.setAttribute("aria-label", "Background hex color");
  const backgroundPaints = node("div", "etch-background-paints");
  backgroundPaints.append(backgroundColor, backgroundHex);
  const backgroundPaintLabel = node("div", "etch-property-field");
  backgroundPaintLabel.append(node("span", "", "Color (#RRGGBB)"), backgroundPaints);
  const backgroundSpacing = node("input");
  backgroundSpacing.type = "number";
  backgroundSpacing.min = "8";
  backgroundSpacing.max = "128";
  backgroundSpacing.step = "1";
  backgroundSpacing.setAttribute("aria-label", "Paper spacing");
  const backgroundSpacingLabel = node("label", "etch-property-field");
  backgroundSpacingLabel.append(node("span", "", "Grid / line spacing (world units, 8\u2013128)"), backgroundSpacing);
  const backgroundPreview = node("div", "etch-background-preview"), backgroundSample = node("span", "etch-background-sample"), backgroundDescription = node("span");
  backgroundSample.setAttribute("aria-hidden", "true");
  backgroundDescription.setAttribute("role", "status");
  backgroundPreview.append(backgroundSample, backgroundDescription);
  const backgroundError = node("p", "etch-image-error");
  backgroundError.setAttribute("role", "alert");
  const backgroundHelp = node("p", "etch-image-help", "Saved behind all artwork and included in PNG/SVG exports. Paper dots and lines zoom with the drawing; engineering paper has heavier lines every five squares. An opaque photo covers paper beneath it. Changes preview on the document without editing it. Cancel or Escape restores the original. Transparent may look white here; PNG keeps its alpha. Apply makes one undoable edit.");
  const backgroundActions = node("div", "etch-image-actions");
  button("Cancel background", () => closeBackgroundDialog(), backgroundActions, null, true);
  const backgroundApply = button("Apply background", () => {
  }, backgroundActions, null, true);
  backgroundApply.type = "submit";
  backgroundForm.append(backgroundModeLabel, backgroundPaintLabel, backgroundSpacingLabel, backgroundPreview, backgroundError, backgroundHelp, backgroundActions);
  backgroundDialog.append(backgroundTitle, backgroundForm);
  root.append(backgroundDialog);
  let backgroundBaseline = null, lastBackgroundColor = "#FFFFFF", lastPaperSpacing = 24;
  const validBackgroundHex = (value2) => /^#[\da-f]{6}$/i.test(value2);
  function updateBackgroundDraft() {
    if (destroyed) return;
    if (backgroundMode.value === "offwhite") backgroundHex.value = backgroundColor.value = "#FAF8F2";
    const mode = backgroundMode.value, transparent = mode === "transparent", paper = Object.hasOwn(PAPER_STYLES, mode), spacing = Number(backgroundSpacing.value);
    const valid = paper ? Boolean(backgroundSpacing.value) && Number.isInteger(spacing) && spacing >= 8 && spacing <= 128 : transparent || validBackgroundHex(backgroundHex.value);
    backgroundColor.disabled = backgroundHex.disabled = mode !== "solid";
    backgroundPaintLabel.hidden = paper;
    backgroundSpacingLabel.hidden = !paper;
    backgroundSpacing.disabled = !paper;
    backgroundApply.disabled = !valid || state.readOnly || state.busy;
    backgroundError.textContent = valid ? "" : paper ? "Enter an integer spacing from 8 to 128 world units." : "Enter an opaque color as #RRGGBB (six hex digits).";
    backgroundSample.style.background = "";
    backgroundSample.classList.toggle("etch-background-transparent", transparent || !valid);
    if (paper && valid) {
      const grid = paperGrid({ type: mode, spacing }), images = [], sizes = [];
      if (grid.dots) {
        images.push(`radial-gradient(circle at center, ${grid.groups[0].color} 0.5px, transparent 0.5px)`);
        sizes.push(`${spacing / 2}px ${spacing / 2}px`);
      } else for (const group of [...grid.groups].reverse()) for (const direction of group.vertical ? ["right", "bottom"] : ["bottom"]) {
        images.push(`linear-gradient(to ${direction}, ${group.color} ${group.width / 2}px, transparent ${group.width / 2}px)`);
        sizes.push(`${group.spacing / 2}px ${group.spacing / 2}px`);
      }
      Object.assign(backgroundSample.style, { backgroundColor: grid.color, backgroundImage: images.join(","), backgroundSize: sizes.join(",") });
    } else if (!transparent && valid) backgroundSample.style.backgroundColor = backgroundHex.value;
    backgroundDescription.textContent = !valid ? "Invalid background" : transparent ? "Transparent \u2014 exports with alpha" : paper ? describeBackground({ type: mode, spacing }) : backgroundHex.value.toUpperCase();
    api.previewBackground(valid && backgroundBaseline === state.document && !state.readOnly && !state.busy ? transparent ? null : paper ? { type: mode, spacing } : backgroundHex.value.toUpperCase() : void 0);
  }
  function closeBackgroundDialog(restoreFocus = true) {
    api.previewBackground(void 0);
    backgroundBaseline = null;
    if (backgroundDialog.open) backgroundDialog.close();
    if (restoreFocus && !destroyed && !backgroundButton.disabled) backgroundButton.focus({ preventScroll: true });
  }
  function refreshBackgroundDialog() {
    if (backgroundDialog.open && (backgroundBaseline !== state.document || state.readOnly || state.busy)) closeBackgroundDialog(false);
  }
  function openBackgroundDialog() {
    if (state.readOnly || state.busy) return;
    api.cancel();
    backgroundBaseline = state.document;
    const value2 = state.document.background, paper = value2 !== null && typeof value2 === "object";
    if (typeof value2 === "string") lastBackgroundColor = value2;
    if (paper) lastPaperSpacing = value2.spacing;
    backgroundMode.value = value2 === null ? "transparent" : paper ? value2.type : value2 === "#FAF8F2" ? "offwhite" : "solid";
    backgroundHex.value = backgroundColor.value = lastBackgroundColor;
    backgroundSpacing.value = String(lastPaperSpacing);
    updateBackgroundDraft();
    backgroundDialog.showModal();
    backgroundMode.focus();
  }
  backgroundMode.addEventListener("change", updateBackgroundDraft);
  backgroundSpacing.addEventListener("input", updateBackgroundDraft);
  backgroundColor.addEventListener("input", () => {
    backgroundHex.value = backgroundColor.value.toUpperCase();
    updateBackgroundDraft();
  });
  backgroundHex.addEventListener("input", () => {
    if (validBackgroundHex(backgroundHex.value)) backgroundColor.value = backgroundHex.value;
    updateBackgroundDraft();
  });
  backgroundForm.addEventListener("submit", (event) => {
    event.preventDefault();
    run(() => {
      if (!backgroundDialog.open || backgroundBaseline !== state.document || state.readOnly || state.busy) {
        refreshBackgroundDialog();
        return;
      }
      updateBackgroundDraft();
      if (backgroundApply.disabled) return;
      const mode = backgroundMode.value, value2 = mode === "transparent" ? null : ["solid", "offwhite"].includes(mode) ? backgroundHex.value.toUpperCase() : { type: mode, spacing: Number(backgroundSpacing.value) };
      try {
        api.setBackground(value2);
      } catch (error) {
        backgroundError.textContent = error.message;
        throw error;
      }
      if (typeof value2 === "string") lastBackgroundColor = value2;
      else if (value2) lastPaperSpacing = value2.spacing;
      closeBackgroundDialog();
      announce(`Document background: ${describeBackground(value2)}`);
    });
  });
  backgroundDialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeBackgroundDialog();
  });
  const nativeDialog = node("dialog", "etch-dialog etch-native-dialog"), nativeTitle = node("h2", "", "Import Etch drawing");
  nativeTitle.id = `etch-native-title-${createId()}`;
  nativeDialog.id = `etch-native-dialog-${createId()}`;
  nativeDialog.setAttribute("aria-labelledby", nativeTitle.id);
  for (const control of [nativeImportButton, svgImportButton, emptyDrawing]) {
    control.setAttribute("aria-haspopup", "dialog");
    control.setAttribute("aria-controls", nativeDialog.id);
  }
  const nativeDetails = node("p", "etch-native-details");
  nativeDetails.setAttribute("role", "status");
  const nativeWarnings = node("ul", "etch-native-warnings");
  nativeWarnings.setAttribute("aria-label", "Import omissions");
  const nativeHelp = node("p", "etch-image-help", "Creates one visible unlocked layer above the captured layer, centered in the captured view at original scale. Source locks are ignored. Only visible source layers are included; source background is omitted. Use load/reopen to preserve all layers and background. Nothing is uploaded. Fit afterwards if needed.");
  const nativeActions = node("div", "etch-image-actions");
  button("Cancel drawing import", () => closeNativeDialog(), nativeActions, null, true);
  const nativeConfirm = button("Import as one layer", async () => {
    const flow = nativeFlow;
    if (!flow?.ready) return;
    nativeConfirm.disabled = true;
    try {
      await flow.session.commit();
      closeNativeDialog();
      announce("Drawing imported as one editable layer. Fit drawing if needed.");
    } catch (error) {
      if (error.code !== "CANCELLED") report(error);
      closeNativeDialog();
    }
  }, nativeActions, null, true);
  nativeDialog.append(nativeTitle, nativeDetails, nativeWarnings, nativeHelp, nativeActions);
  root.append(nativeDialog);
  const nativeHelpText = nativeHelp.textContent;
  const svgHelpText = "Imports supported SVG vectors as one visible unlocked editable layer above the captured layer, at original scale in the captured view. Your document background stays unchanged. Nothing is uploaded. Unsupported text, images, gradients, clipping or effects are rejected rather than silently stripped. Export PNG in your drawing app and use Import image for unsupported artwork; there is no automatic image fallback. Fit afterwards if needed.";
  let nativeFlow = null;
  function closeNativeDialog(restoreFocus = true) {
    const flow = nativeFlow;
    nativeFlow = null;
    flow?.session?.cancel();
    if (nativeDialog.open) nativeDialog.close();
    const origin = flow?.kind === "svg" ? svgImportButton : nativeImportButton;
    if (restoreFocus && sidebarOpen && !destroyed && !origin.disabled) origin.focus({ preventScroll: true });
  }
  nativeDialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeNativeDialog();
  });
  function importDrawingFile(chooser, kind) {
    chooser.addEventListener("change", () => run(async () => {
      const blob = chooser.files[0];
      chooser.value = "";
      if (!blob) return;
      closeNativeDialog(false);
      const flow = { session: null, ready: false, preparing: false, kind };
      nativeFlow = flow;
      nativeTitle.textContent = kind === "svg" ? "Import SVG drawing" : "Import Etch drawing";
      nativeHelp.textContent = kind === "svg" ? svgHelpText : nativeHelpText;
      nativeConfirm.disabled = true;
      nativeWarnings.replaceChildren();
      nativeDetails.textContent = "Reading and validating local drawing\u2026";
      nativeDialog.showModal();
      try {
        flow.session = await (kind === "svg" ? api.beginSVGSession() : api.beginDocumentSession());
        if (nativeFlow !== flow) {
          flow.session.cancel();
          return;
        }
        flow.session.signal.addEventListener("abort", () => {
          if (nativeFlow === flow) closeNativeDialog();
        }, { once: true });
        if (flow.session.signal.aborted) {
          closeNativeDialog();
          return;
        }
        const maximum = kind === "svg" ? Math.min(5 * 1024 * 1024, flow.session.limits.jsonBytes) : flow.session.limits.jsonBytes;
        if (blob.size > maximum) fail("LIMIT_EXCEEDED", kind === "svg" ? "SVG exceeds the 5 MiB input limit (or lower host limit)" : "Drawing file exceeds the native JSON size limit", { limit: kind === "svg" ? "svgBytes" : "jsonBytes", maximum });
        const value2 = kind === "svg" ? blob : await readUTF8Blob(blob, { maximum, signal: flow.session.signal, invalidCode: "INVALID_DOCUMENT", label: "Drawing" });
        if (nativeFlow !== flow || flow.session.signal.aborted) return;
        const name = blob.name.replace(kind === "svg" ? /\.svg$/i : /(?:\.etch)?\.json$/i, "").trim().slice(0, 80) || (kind === "svg" ? "Imported SVG" : "Imported drawing");
        flow.preparing = true;
        const summary2 = await flow.session.prepare(value2, name);
        if (nativeFlow !== flow) return;
        nativeDetails.textContent = `${summary2.name}: ${summary2.visibleLayers} visible source layer(s), ${summary2.elements} editable mark(s), ${summary2.assets} image asset(s). Painted size ${summary2.bounds.width.toFixed(2)} \xD7 ${summary2.bounds.height.toFixed(2)} world units. ${(blob.size / 1024).toFixed(1)} KiB source.`;
        const items = [];
        for (const warning of summary2.warnings) {
          if (warning.code === "HIDDEN_LAYERS_OMITTED") for (const layer of warning.layers) items.push(node("li", "", `Hidden layer omitted: \u201C${layer.name}\u201D.`));
          if (warning.code === "BACKGROUND_OMITTED") items.push(node("li", "", `Source background ${describeBackground(warning.background ?? warning.color)} is omitted; your document background stays unchanged.`));
        }
        if (kind === "svg") items.push(node("li", "", `SVG viewport ${summary2.svgViewport.width.toFixed(2)} \xD7 ${summary2.svgViewport.height.toFixed(2)} world units. No unsupported artwork was silently omitted.`));
        else if (!items.length) items.push(node("li", "", "No hidden layers or source background to omit."));
        nativeWarnings.replaceChildren(...items);
        flow.ready = true;
        nativeConfirm.disabled = false;
      } catch (error) {
        if (nativeFlow !== flow) {
          if (flow.preparing && !destroyed && error.code !== "CANCELLED") report(error);
          return;
        }
        closeNativeDialog();
        if (error.code !== "CANCELLED") report(error);
      }
    }));
  }
  importDrawingFile(nativeFile, "native");
  importDrawingFile(svgFile, "svg");
  let imageFlow = null, imageSettings = { format: "webp", quality: 0.8 };
  function closeImageDialog() {
    const flow = imageFlow;
    imageFlow = null;
    flow?.session?.cancel();
    if (imageDialog.open) imageDialog.close();
    imagePreview.width = imagePreview.height = 0;
  }
  async function updateImagePreview() {
    const flow = imageFlow;
    if (!flow?.source || flow.encoding) return;
    const quality = imageFormat.value === "png" ? Math.round(imageSettings.quality * 100) : Number(imageQuality.value);
    if (imageFormat.value === "webp" && (!imageQuality.value || !Number.isInteger(quality) || quality < 0 || quality > 100)) {
      imageError.textContent = "Quality must be in [0, 100]";
      imageConfirm.disabled = true;
      return;
    }
    flow.encoding = true;
    flow.ready = false;
    imageConfirm.disabled = true;
    imageFormat.disabled = imageQuality.disabled = true;
    imageError.textContent = "";
    imageDetails.textContent = "Encoding preview\u2026";
    try {
      const settings = { format: imageFormat.value, quality: quality / 100 };
      let preview;
      try {
        preview = await flow.session.encode(settings);
      } catch (error) {
        if (imageFlow !== flow) return;
        if (settings.format !== "webp" || error.code !== "INVALID_ARGUMENT" || error.details?.encoder !== "webp" || error.details.supported !== false) throw error;
        imageFormat.options[0].disabled = true;
        imageFormat.value = "png";
        settings.format = "png";
        imageSettings = { ...imageSettings, format: "png" };
        imageDetails.textContent = "WebP encoding unavailable; preparing PNG preview\u2026";
        preview = await flow.session.encode(settings);
      }
      if (imageFlow !== flow) return;
      imageSettings = settings;
      const ratio = Math.min(1, 240 / preview.width, 160 / preview.height);
      imagePreview.width = Math.max(1, Math.round(preview.width * ratio));
      imagePreview.height = Math.max(1, Math.round(preview.height * ratio));
      imagePreview.getContext("2d").drawImage(preview.image, 0, 0, imagePreview.width, imagePreview.height);
      imageDetails.textContent = `${preview.width} \xD7 ${preview.height} px \xB7 ${preview.mime === "image/webp" ? `WebP quality ${quality}` : `PNG lossless${imageFormat.options[0].disabled ? " (WebP encoding unavailable)" : ""}`} \xB7 ${(preview.bytes / 1024).toFixed(1)} KiB encoded (${(Math.ceil(preview.bytes / 3) * 4 / 1024).toFixed(1)} KiB base64)`;
      flow.ready = true;
      imageConfirm.disabled = false;
    } catch (error) {
      if (imageFlow !== flow) return;
      if (error.code !== "CANCELLED") imageError.textContent = error.message;
      imageDetails.textContent = "No image has been imported.";
    } finally {
      flow.encoding = false;
      if (imageFlow === flow) {
        imageFormat.disabled = false;
        imageQuality.disabled = imageFormat.value !== "webp";
      }
    }
  }
  imageFormat.addEventListener("change", () => run(updateImagePreview));
  imageQuality.addEventListener("change", () => run(updateImagePreview));
  imageDialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeImageDialog();
  });
  async function openImage(blob) {
    if (state.readOnly) fail("READ_ONLY", "This editor is read-only");
    if (state.busy) fail("BUSY", "Wait for the current operation before importing an image");
    closeImageDialog();
    const flow = { session: null, source: null, encoding: false, ready: false };
    imageFlow = flow;
    imageFormat.value = imageSettings.format;
    imageQuality.value = String(Math.round(imageSettings.quality * 100));
    imageFormat.disabled = imageQuality.disabled = imageConfirm.disabled = true;
    imageDetails.textContent = "Reading local image\u2026";
    imageError.textContent = "";
    imageDialog.showModal();
    try {
      flow.session = await api.beginImageSession();
      if (imageFlow !== flow) {
        flow.session.cancel();
        return;
      }
      flow.session.signal.addEventListener("abort", () => {
        if (imageFlow === flow) closeImageDialog();
      }, { once: true });
      flow.source = await flow.session.prepare(blob, true);
      if (imageFlow === flow) await updateImagePreview();
    } catch (error) {
      if (imageFlow !== flow) return;
      closeImageDialog();
      if (error.code !== "CANCELLED") report(error);
    }
  }
  file.addEventListener("change", () => {
    const blob = file.files[0];
    file.value = "";
    if (blob) run(() => openImage(blob));
  });
  viewport.addEventListener("dragover", (event) => {
    if (!event.dataTransfer?.types.includes("Files")) return;
    event.preventDefault();
    const available = !state.readOnly && !state.busy && !root.querySelector("dialog[open]");
    event.dataTransfer.dropEffect = available ? "copy" : "none";
    if (available && !viewport.classList.contains("etch-drop-target")) api.cancelGesture();
    viewport.classList.toggle("etch-drop-target", available);
  });
  viewport.addEventListener("dragleave", (event) => {
    if (!viewport.contains(event.relatedTarget)) viewport.classList.remove("etch-drop-target");
  });
  viewport.addEventListener("drop", (event) => {
    if (!event.dataTransfer?.types.includes("Files")) return;
    event.preventDefault();
    viewport.classList.remove("etch-drop-target");
    run(() => {
      if (state.readOnly) fail("READ_ONLY", "This editor is read-only");
      if (state.busy || root.querySelector("dialog[open]")) fail("BUSY", "Close the current dialog or wait for the current operation before dropping an image");
      const files = event.dataTransfer.files;
      if (files.length !== 1) fail("INVALID_ARGUMENT", "Drop one PNG, JPEG or WebP image at a time");
      const blob = files[0];
      if (!["image/png", "image/jpeg", "image/webp"].includes(blob.type) && !/\.(png|jpe?g|webp)$/i.test(blob.name)) fail("INVALID_ARGUMENT", "Drop a PNG, JPEG or WebP image. Use Import SVG or Import drawing for vector/native files.");
      return openImage(blob);
    });
  });
  function setSidebarOpen(open) {
    if (!open) sidebarResize.cancel();
    sidebarOpen = open;
    sidebar.hidden = !open;
    scrim.hidden = !open;
    toggle.setAttribute("aria-expanded", String(open));
    toggle.title = open ? "Hide sidebar" : "Show sidebar";
    if (!open) toggle.focus({ preventScroll: true });
  }
  function announce(text2, { error = false } = {}) {
    if (destroyed) return;
    if (["move-layer", "eraser"].includes(api.getTool())) text2 += ` \xB7 Layer: ${state.document.layers.find((l) => l.id === state.getActiveLayer()).name}`;
    statusMessage.textContent = status.title = text2;
    status.dataset.error = String(error);
  }
  function refreshTools() {
    if (destroyed) return;
    const tool = api.getTool(), highlighting = tool === "highlighter", drawingInk = tool === "pen" || highlighting, settings = api.getToolSettings(inkTool()), shape = isShapeTool(tool), moving = tool === "move-layer", erasing = tool === "eraser", selecting = tool === "select";
    const layer = state.document.layers.find((l) => l.id === state.getActiveLayer());
    const blocked = state.readOnly || state.busy;
    const action = moving ? "move" : erasing ? "erase" : "draw";
    const reason = state.readOnly ? "Read-only: use Hand to navigate." : state.busy ? "Loading: use Hand to navigate." : !layer.visible ? `Active layer is hidden. Show it to ${action}.` : layer.locked ? `Active layer is locked. Unlock it to ${action}.` : "";
    hand.setAttribute("aria-pressed", String(tool === "hand"));
    pen.setAttribute("aria-pressed", String(tool === "pen"));
    select.setAttribute("aria-pressed", String(tool === "select"));
    select.title = reason || "Select (V): pick, marquee or drag objects \xB7 Shift toggles/adds";
    select.disabled = pen.disabled = highlighter.disabled = eraser.disabled = shapes.disabled = moveLayer.disabled = blocked || !layer.visible || layer.locked;
    pen.title = reason || "Pen (P/B)";
    highlighter.setAttribute("aria-pressed", String(highlighting));
    highlighter.title = reason || "Highlighter (K): constant-width translucent strokes";
    const eraserSettings = api.getToolSettings("eraser"), partial = eraserSettings.mode === "partial";
    eraser.setAttribute("aria-pressed", String(erasing));
    eraser.title = reason || (partial ? "Eraser (E): cut gaps in Pen strokes and lines on the selected layer" : "Eraser (E): remove whole marks from the selected layer");
    moveLayer.setAttribute("aria-pressed", String(moving));
    moveLayer.title = reason || "Move Layer (M): drag only the selected layer; Hand pans the view";
    shapes.setAttribute("aria-pressed", String(shape));
    shapes.title = reason || `Shapes: ${shapeNames[api.getShapeTool()]} (L/A/R/O) \xB7 use the chevron to choose`;
    if (shapes.dataset.shape !== api.getShapeTool()) {
      shapes.replaceChildren(icon(api.getShapeTool()));
      shapes.dataset.shape = api.getShapeTool();
    }
    shapeChooser.disabled = shapes.disabled;
    if (shapeChooser.disabled && shapeMenu.matches(":popover-open")) shapeMenu.hidePopover();
    for (const [name, choice4] of shapeChoices) {
      choice4.disabled = shapes.disabled;
      choice4.setAttribute("aria-pressed", String(name === api.getShapeTool()));
    }
    properties.hidden = !drawingInk && !shape && !moving && !erasing && !selecting;
    const propertyName = selecting ? "Selection properties" : moving ? "Move Layer properties" : erasing ? "Eraser properties" : shape ? "Shape properties" : highlighting ? "Highlighter properties" : "Pen properties";
    propertiesDisclosure.lastChild.textContent = propertyName;
    propertiesDisclosure.setAttribute("aria-label", propertyName);
    propertiesDisclosure.title = propertyName;
    properties.setAttribute("aria-label", propertyName);
    moveTarget.hidden = !moving && !erasing;
    moveTarget.textContent = moveTarget.title = `Layer: ${layer.name}`;
    eraserFields.hidden = !erasing;
    radius.value = String(eraserSettings.radius);
    eraserMode.value = eraserSettings.mode;
    radius.disabled = eraserMode.disabled = blocked;
    const hasSelection = state.getSelection().length > 0;
    rotate.disabled = blocked || !layer.visible || layer.locked || !layer.elements.length;
    rotate.title = hasSelection ? "Rotate selected objects clockwise 90\xB0" : "Rotate active layer clockwise 90\xB0";
    rotateSelection.hidden = !selecting;
    rotateSelection.disabled = blocked || !layer.visible || layer.locked || !hasSelection;
    fields.hidden = !drawingInk;
    shapeLayout.hidden = !shape;
    shapeType.value = api.getShapeTool();
    shapeType.disabled = blocked;
    const nextShape = shape ? tool : null;
    if (displayedShape !== nextShape) {
      shapeFields.replaceChildren(...nextShape ? [shapeControls.get(nextShape).panel] : []);
      displayedShape = nextShape;
    }
    for (const [name, c] of shapeControls) {
      const s = api.getToolSettings(name);
      if (s.stroke) c.borderColor.value = s.stroke;
      if (s.fill) c.fillColor.value = s.fill;
      c.borderWidth.value = String(s.strokeWidth);
      c.border.checked = s.stroke !== null;
      c.fillEnabled.checked = Boolean(s.fill);
      c.border.disabled = blocked || !s.fill;
      c.fillEnabled.disabled = blocked || s.stroke === null;
      c.borderColor.disabled = c.borderWidth.disabled = blocked || s.stroke === null;
      c.fillColor.disabled = blocked || !s.fill;
    }
    widthSlider.disabled = color3.disabled = width2.disabled = finger.disabled = pressure.disabled = opacity2.disabled = blocked;
    const inkName = highlighting ? "Highlighter" : "Pen";
    color3.setAttribute("aria-label", `${inkName} color`);
    width2.setAttribute("aria-label", `${inkName} width`);
    widthSlider.setAttribute("aria-label", `${inkName} width slider`);
    pressureLabel.hidden = highlighting;
    opacityLabel.hidden = !highlighting;
    pressure.checked = api.getToolSettings("pen").pressure;
    opacity2.value = String(Math.round((settings.opacity ?? 1) * 100));
    color3.value = settings.color;
    width2.value = String(settings.width);
    finger.checked = api.getDrawWithTouch();
    widthSlider.value = String(settings.width);
    if (previewWidth !== settings.width) {
      const previewCommands = [];
      visitStrokeOutline({ width: settings.width, pressure: false, points: [[36, 40, 1], [144, 40, 1]] }, (command) => previewCommands.push(command.join(" ")));
      previewPath.setAttribute("d", previewCommands.join(" "));
      previewWidth = settings.width;
    }
    previewPath.setAttribute("fill", settings.color);
    previewPath.setAttribute("fill-opacity", String(settings.opacity ?? 1));
    strokePreview.setAttribute("aria-label", `${inkName} stroke: ${settings.width} world units, ${settings.color}${highlighting ? `, ${Math.round(settings.opacity * 100)}% opacity` : ""}`);
    fingerLabel.lastChild.textContent = selecting ? "Select with finger" : moving ? "Move with finger" : erasing ? "Erase with finger" : "Draw with finger";
    toolNote.hidden = shape && !reason;
    toolNote.textContent = reason || (selecting ? "Pick or marquee marks; Shift toggles/adds. Drag a mark to move, or a handle to resize. Image corners keep aspect; Shift unlocks (locks other corners). Side handles scale one axis. Arrows nudge; Shift nudges 10. Escape cancels, then clears. Delete removes selection." : moving ? "Drag anywhere to move this layer. On small screens, close the sidebar first. Hand pans the whole view." : erasing ? partial ? "Cuts gaps in Pen strokes and straight lines. Surviving ink stays editable. Highlights, shapes, paths and images stay untouched. One Undo restores the whole drag." : "Removes whole marks on this layer, including images. Drag or tap; undo restores them. Close the sidebar on small screens." : highlighting ? "Constant width \xB7 separate strokes build color \xB7 new marks only" : "New marks only \xB7 width in world units");
    if (moving || erasing) announce(reason || (moving ? "Move Layer" : partial ? "Partial eraser \xB7 Pen + lines" : "Eraser"));
    else if (["move-layer", "eraser"].includes(lastTool)) announce("Ready");
    if (lastTool !== null && lastTool !== tool) quickOpen = false;
    quick.hidden = !quickOpen || !hasQuickControls(tool);
    quickTitle.textContent = erasing ? "Eraser" : shape ? shapeNames[tool] : inkName;
    for (const [control, active] of [[pen, tool === "pen"], [highlighter, highlighting], [eraser, erasing], [shapes, shape]]) control.setAttribute("aria-expanded", String(active && !quick.hidden));
    quickShapes.hidden = !shape;
    quickShapes.value = api.getShapeTool();
    quickPaint.hidden = quickWidths.hidden = erasing;
    quickPreview.hidden = !drawingInk;
    quickPressureLabel.hidden = tool !== "pen";
    quickPressure.checked = pressure.checked;
    quickOpacityLabel.hidden = !highlighting;
    quickOpacity.value = opacity2.value;
    quickOpacityValue.textContent = `Opacity ${opacity2.value}%`;
    quickSizes.hidden = quickMode.hidden = !erasing;
    quickMode.value = eraserSettings.mode;
    quickBorderLabel.hidden = quickFillLabel.hidden = quickFillColor.hidden = !shape || isLineTool(tool);
    const current = shape ? api.getToolSettings(tool) : settings;
    const currentColor = shape ? current.stroke : settings.color;
    quickColor.value = currentColor || (shape ? shapeControls.get(tool).borderColor.value : settings.color);
    for (const [value2, swatch] of swatches) swatch.setAttribute("aria-pressed", String(value2 === currentColor?.toUpperCase()));
    for (const [value2, preset] of widthPresets) {
      preset.hidden = !(highlighting ? [8, 16, 24, 40] : [1, 3, 6, 12]).includes(value2);
      preset.setAttribute("aria-pressed", String(value2 === (shape ? current.strokeWidth : settings.width)));
    }
    for (const [value2, preset] of sizePresets) preset.setAttribute("aria-pressed", String(value2 === eraserSettings.radius));
    quickPreview.firstChild.setAttribute("d", previewPath.getAttribute("d"));
    quickPreview.firstChild.setAttribute("fill", settings.color);
    quickPreview.firstChild.setAttribute("fill-opacity", String(settings.opacity ?? 1));
    quickPreview.setAttribute("aria-label", strokePreview.getAttribute("aria-label"));
    if (shape) {
      quickBorder.checked = current.stroke !== null;
      quickFill.checked = Boolean(current.fill);
      quickFillColor.value = current.fill || shapeControls.get(tool).fillColor.value;
    }
    for (const control of quick.querySelectorAll("button,input,select")) control.disabled = blocked;
    if (shape) {
      quickBorder.disabled = blocked || !current.fill;
      quickFill.disabled = blocked || current.stroke === null;
      quickFillColor.disabled = blocked || !current.fill;
      quickColor.disabled = blocked || current.stroke === null;
      for (const preset of widthPresets.values()) preset.disabled = blocked || current.stroke === null;
      for (const swatch of swatches.values()) swatch.disabled = blocked || current.stroke === null;
    }
    lastTool = tool;
    viewport.dataset.tool = tool;
    viewport.dataset.drawBlocked = String(Boolean(reason));
    const toolNames = { hand: "Hand", select: "Select", pen: "Pen", highlighter: "Highlighter", eraser: "Eraser", "move-layer": "Move Layer", line: "Line", arrow: "Arrow", rect: "Rectangle", ellipse: "Ellipse" };
    statusContext.textContent = `${toolNames[tool]} \xB7 ${layer.name}`;
    statusContext.title = statusContext.textContent;
    const hiddenArtwork = state.document.layers.some((layer2) => layer2.elements.length);
    emptyHeading.textContent = hiddenArtwork ? "No visible artwork" : state.readOnly ? "No artwork to display" : "Start drawing";
    emptyHelp.textContent = hiddenArtwork ? "Show a layer in Layers to see your drawing." : state.readOnly ? "Load an Etch document to view it. Drag to pan; Ctrl/Cmd + wheel to zoom." : "Choose a tool above, or drag a PNG, JPEG or WebP image here.";
    emptyActions.hidden = state.readOnly;
    emptyDrawing.disabled = emptyImage.disabled = blocked;
  }
  function refresh() {
    if (destroyed) return;
    refreshTools();
    const blocked = state.readOnly || state.busy;
    root.setAttribute("aria-busy", String(state.busy));
    newButton.disabled = importButton.disabled = nativeImportButton.disabled = svgImportButton.disabled = backgroundButton.disabled = blocked;
    backgroundButton.title = blocked ? state.readOnly ? "Read-only document background" : "Wait for the current operation" : `Document background: ${describeBackground(state.document.background)}`;
    refreshBackgroundDialog();
    const activeLayer = state.document.layers.find((l) => l.id === state.getActiveLayer());
    layerOptionsButton.disabled = blocked || activeLayer.locked;
    layerOptionsButton.title = activeLayer.locked ? `Unlock ${activeLayer.name} to edit its options` : `Rename, reorder or merge ${activeLayer.name}`;
    refreshLayerDialog();
    if (boundsDocument !== state.document) {
      message.hidden = documentBounds(state.document) !== null;
      const bounds = exportBounds(state.document), number5 = (n) => String(Number(n.toFixed(2)));
      exportSize.textContent = `Export ${number5(bounds.width)} \xD7 ${number5(bounds.height)}`;
      exportSize.title = `Default export surface: ${number5(bounds.width)} \xD7 ${number5(bounds.height)} world units; origin (${number5(bounds.x)}, ${number5(bounds.y)}), including 16 units of padding. Custom export options may differ.`;
      exportSize.setAttribute("aria-label", exportSize.title);
      summary.textContent = state.document.layers.map((layer) => {
        const types = /* @__PURE__ */ new Map(), descriptions = [];
        let images = 0;
        for (const element of layer.elements) {
          types.set(element.type, (types.get(element.type) ?? 0) + 1);
          if (element.type === "image") {
            if (++images <= 8) descriptions.push(element.alt.slice(0, 120) || "Unlabeled image");
          }
        }
        const counts = [...types].map(([type, count]) => `${count} ${type}`).join(", ");
        return `${layer.name}: ${layer.elements.length} marks${counts ? ` (${counts})` : ""}${layer.visible ? "" : ", hidden"}${layer.locked ? ", locked" : ""}` + (images ? `. Images: ${descriptions.join("; ")}${images > 8 ? `; and ${images - 8} more` : ""}` : "");
      }).join(". ");
      boundsDocument = state.document;
    }
    undoButton.disabled = blocked || !state.canUndo();
    redoButton.disabled = blocked || !state.canRedo();
    if (layersDocument === state.document && layersBlocked === blocked) {
      for (const button2 of layers.querySelectorAll(".etch-layer-select")) button2.setAttribute("aria-pressed", String(button2.dataset.etchLayerId === state.getActiveLayer()));
      return;
    }
    const focusKey = root.contains(doc.activeElement) ? doc.activeElement.dataset.etchFocus : void 0;
    const frag = doc.createDocumentFragment();
    for (const layer of [...state.document.layers].reverse()) {
      const row = node("div", "etch-layer");
      const select2 = button(`${layer.name} (${layer.elements.length})`, () => api.setActiveLayer(layer.id), row, null, true);
      select2.classList.add("etch-layer-select");
      select2.replaceChildren(
        node("span", "etch-layer-indicator"),
        node("span", "etch-layer-name", layer.name),
        node("span", "etch-layer-count", String(layer.elements.length))
      );
      select2.firstChild.setAttribute("aria-hidden", "true");
      select2.setAttribute("aria-pressed", String(state.getActiveLayer() === layer.id));
      select2.dataset.etchFocus = `${layer.id}:select`;
      select2.dataset.etchLayerId = layer.id;
      const visible = button(
        `${layer.visible ? "Hide" : "Show"} ${layer.name}`,
        () => api.setLayerVisibility(layer.id, !layer.visible),
        row,
        layer.visible ? "eye" : "eye-off"
      );
      visible.disabled = blocked;
      visible.dataset.etchFocus = `${layer.id}:visible`;
      const lock = button(
        `${layer.locked ? "Unlock" : "Lock"} ${layer.name}`,
        () => api.setLayerLocked(layer.id, !layer.locked),
        row,
        layer.locked ? "lock" : "unlock"
      );
      lock.disabled = blocked;
      lock.dataset.etchFocus = `${layer.id}:lock`;
      const remove = button(`Delete layer ${layer.name}`, () => {
        if (layer.elements.length && !doc.defaultView.confirm(`Delete layer \u201C${layer.name}\u201D and its ${layer.elements.length} mark(s)? You can undo this.`)) return;
        api.deleteLayer(layer.id);
        announce(`Deleted layer \u201C${layer.name}\u201D. Undo restores it.`);
      }, row, "trash");
      remove.classList.add("etch-layer-delete");
      remove.disabled = blocked || layer.locked;
      remove.title = layer.locked ? `Unlock ${layer.name} before deleting it` : `Delete layer ${layer.name}`;
      remove.dataset.etchFocus = `${layer.id}:delete`;
      frag.append(row);
    }
    layers.replaceChildren(frag);
    layersDocument = state.document;
    layersBlocked = blocked;
    if (focusKey && sidebarOpen) {
      const buttons = [...layers.querySelectorAll("button")];
      (buttons.find((el) => el.dataset.etchFocus === focusKey) ?? buttons.find((el) => el.dataset.etchFocus === `${state.getActiveLayer()}:select`))?.focus({ preventScroll: true });
    }
  }
  function keydown(event) {
    if (event.key === "Escape" && exportMenu.matches(":popover-open")) {
      event.preventDefault();
      event.stopPropagation();
      closeExportMenu();
      return;
    }
    if (event.key === "Escape" && (imageDialog.open || layerDialog.open || backgroundDialog.open || nativeDialog.open)) return;
    if (event.key === "F2" && event.target.closest(".etch-layer-select")) {
      event.preventDefault();
      run(() => openLayerDialog(event.target.closest(".etch-layer-select").dataset.etchLayerId));
      return;
    }
    if (event.target.closest(".etch-shape-menu, .etch-export-menu")) return;
    if (event.target.closest('dialog[open], input, textarea, select, [contenteditable]:not([contenteditable="false"])')) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
      if (state.readOnly || state.busy) return;
      event.preventDefault();
      run(() => event.shiftKey ? api.redo() : api.undo());
    } else if (event.ctrlKey && event.key.toLowerCase() === "y") {
      if (state.readOnly || state.busy) return;
      event.preventDefault();
      run(() => api.redo());
    } else if (event.key === "Escape") {
      if (api.getTool() === "select" && event.target === viewport) return;
      event.preventDefault();
      run(() => api.cancel());
      if (sidebarOpen) setSidebarOpen(false);
    }
  }
  root.addEventListener("keydown", keydown);
  refresh();
  return {
    root,
    viewport,
    refresh,
    refreshTools,
    selectTool,
    closeBackgroundDialog,
    updateView({ zoom, expanded }) {
      if (destroyed) return;
      zoomLabel.textContent = `${Math.round(zoom * 100)}%`;
      statusZoom.textContent = zoomLabel.textContent;
      statusZoom.setAttribute("aria-label", `Zoom ${statusZoom.textContent}`);
      if (fullscreen.getAttribute("aria-pressed") !== String(expanded) && exportMenu.matches(":popover-open")) exportMenu.hidePopover();
      fullscreen.setAttribute("aria-pressed", String(expanded));
      fullscreen.setAttribute("aria-label", expanded ? "Exit fullscreen" : "Fullscreen");
      fullscreen.title = expanded ? "Exit fullscreen (Escape)" : "Fullscreen";
    },
    announce,
    destroy() {
      destroyed = true;
      for (const [url, timer] of downloadURLs) {
        if (timer !== null) doc.defaultView.clearTimeout(timer);
        doc.defaultView.URL.revokeObjectURL(url);
      }
      downloadURLs.clear();
      boundsDocument = layersDocument = null;
      sidebarResize.destroy();
      closeImageDialog();
      closeLayerDialog(false);
      closeBackgroundDialog(false);
      closeNativeDialog(false);
      root.removeEventListener("keydown", keydown);
      root.remove();
    }
  };
}

// src/etch/viewport.js
var MIN_ZOOM = 0.1;
var MAX_ZOOM = 8;
var clampZoom = (value2) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value2));
var Viewport = class {
  #zoom = 1;
  #pan = [0, 0];
  #expanded = false;
  #lastSize = [0, 0];
  width = 0;
  height = 0;
  constructor(onChange = () => {
  }) {
    this.onChange = onChange;
  }
  get() {
    return { zoom: this.#zoom, pan: [...this.#pan], expanded: this.#expanded };
  }
  setExpanded(value2) {
    if (value2 === this.#expanded) return;
    this.#expanded = value2;
    this.onChange();
  }
  set(value2) {
    if (!value2 || typeof value2 !== "object" || Array.isArray(value2) || Object.keys(value2).some((key) => !["zoom", "pan"].includes(key))) fail("INVALID_ARGUMENT", "View accepts zoom and pan only");
    const zoom = Object.hasOwn(value2, "zoom") ? value2.zoom : this.#zoom;
    const pan = Object.hasOwn(value2, "pan") ? value2.pan : this.#pan;
    if (typeof zoom !== "number" || !Number.isFinite(zoom) || zoom < MIN_ZOOM || zoom > MAX_ZOOM || !Array.isArray(pan) || pan.length !== 2 || Array.from(pan).some((n) => typeof n !== "number" || !Number.isFinite(n) || !Number.isFinite(n / zoom))) {
      fail("INVALID_ARGUMENT", "View requires zoom in [0.1, 8] and a finite [x, y] pan");
    }
    if (zoom === this.#zoom && pan.every((n, i) => n === this.#pan[i])) return;
    this.#zoom = zoom;
    this.#pan = [...pan];
    this.onChange();
  }
  resize(width2, height) {
    if (width2 === this.width && height === this.height) return false;
    this.width = width2;
    this.height = height;
    if (width2 > 0 && height > 0) {
      const [w, h] = this.#lastSize;
      this.#lastSize = [width2, height];
      this.set({ pan: [this.#pan[0] + (width2 - w) / 2, this.#pan[1] + (height - h) / 2] });
    }
    return true;
  }
  panBy(dx, dy) {
    this.set({ pan: [this.#pan[0] + dx, this.#pan[1] + dy] });
  }
  zoomAt(zoom, anchor = [this.width / 2, this.height / 2]) {
    const next = clampZoom(zoom), ratio = next / this.#zoom;
    this.set({ zoom: next, pan: anchor.map((n, i) => n - (n - this.#pan[i]) * ratio) });
  }
  fit(bounds) {
    if (!(this.width > 0 && this.height > 0)) return;
    if (!bounds) {
      this.set({ zoom: 1, pan: [this.width / 2, this.height / 2] });
      return;
    }
    const zoom = clampZoom(Math.min(
      Math.max(1, this.width - 48) / Math.max(bounds.width, 1e-8),
      Math.max(1, this.height - 48) / Math.max(bounds.height, 1e-8)
    ));
    this.set({ zoom, pan: [this.width / 2 - (bounds.x + bounds.width / 2) * zoom, this.height / 2 - (bounds.y + bounds.height / 2) * zoom] });
  }
};

// src/etch/fullscreen.js
var owners = /* @__PURE__ */ new WeakMap();
function createFullscreen(root, { onBeforeChange, onChange, onError }) {
  const doc = root.ownerDocument, window = doc.defaultView;
  let expanded = false, desired = false, native = false, destroyed = false, pending = null, saved = null, exiting = false, popover = false;
  const controller = { setExpanded, destroy };
  function capture() {
    const body = doc.body, html = doc.documentElement;
    const touch = window.navigator.maxTouchPoints > 0 || window.matchMedia("(any-pointer: coarse)").matches;
    const properties = ["overflow-x", "overflow-y", "overscroll-behavior-x", "overscroll-behavior-y"];
    const styles = [[html, properties], [body, [...properties, ...touch ? ["position", "top", "left", "width"] : []]]].map(([element, names2]) => ({ element, values: names2.map((name) => [name, element.style.getPropertyValue(name), element.style.getPropertyPriority(name)]) }));
    saved = {
      focus: doc.activeElement,
      x: window.scrollX,
      y: window.scrollY,
      touch,
      styles,
      role: root.getAttribute("role"),
      modal: root.getAttribute("aria-modal"),
      popover: root.getAttribute("popover"),
      inert: []
    };
    for (const element of [html, body]) {
      element.style.setProperty("overflow", "hidden", "important");
      element.style.setProperty("overscroll-behavior", "none", "important");
    }
    if (touch) {
      for (const [name, value2] of [["position", "fixed"], ["top", `${-saved.y}px`], ["left", `${-saved.x}px`], ["width", "100%"]]) body.style.setProperty(name, value2, "important");
    }
    for (let node = root; node.parentElement; node = node.parentElement) {
      for (const sibling of node.parentElement.children) if (sibling !== node && !sibling.hasAttribute("inert")) {
        sibling.setAttribute("inert", "");
        saved.inert.push(sibling);
      }
      if (node.parentElement === body) break;
    }
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "true");
  }
  function publish(value2) {
    if (expanded === value2) return;
    expanded = value2;
    if (!destroyed) onChange(value2);
  }
  function restore() {
    if (popover) {
      root.hidePopover();
      popover = false;
    }
    root.classList.remove("etch-expanded");
    native = false;
    if (owners.get(doc) === controller) owners.delete(doc);
    if (!saved) return;
    const previous = saved;
    saved = null;
    for (const { element, values } of previous.styles) {
      for (const [name] of values) element.style.removeProperty(name);
      for (const [name, value2, priority] of values) if (value2) element.style.setProperty(name, value2, priority);
    }
    for (const node of previous.inert) node.removeAttribute("inert");
    for (const [name, value2] of [["role", previous.role], ["aria-modal", previous.modal], ["popover", previous.popover]]) {
      if (value2 === null) root.removeAttribute(name);
      else root.setAttribute(name, value2);
    }
    if (previous.focus?.isConnected) previous.focus.focus({ preventScroll: true });
    window.scrollTo({ left: previous.x, top: previous.y, behavior: "instant" });
  }
  async function exitNative() {
    if (doc.fullscreenElement !== root) return;
    exiting = true;
    try {
      await doc.exitFullscreen();
    } catch {
      if (doc.fullscreenElement === root) fail("INVALID_ARGUMENT", "Could not exit fullscreen; press Escape or use the browser fullscreen controls");
    } finally {
      exiting = false;
    }
  }
  async function reconcile() {
    try {
      while (!destroyed && desired !== expanded) {
        if (desired) {
          let other;
          while ((other = owners.get(doc)) && other !== controller) await other.setExpanded(false);
          if (destroyed || !desired) break;
          owners.set(doc, controller);
          onBeforeChange();
          capture();
          if (!saved.touch && typeof root.requestFullscreen === "function" && doc.fullscreenEnabled !== false) {
            try {
              await root.requestFullscreen();
            } catch {
            }
          }
          if (destroyed || !desired) {
            await exitNative();
            restore();
            break;
          }
          native = doc.fullscreenElement === root;
          root.classList.add("etch-expanded");
          if (!native && typeof root.showPopover === "function") {
            root.setAttribute("popover", "manual");
            root.showPopover();
            popover = true;
          }
          publish(true);
          root.focus({ preventScroll: true });
        } else {
          onBeforeChange();
          await exitNative();
          restore();
          publish(false);
        }
      }
      if (destroyed) fail("CANCELLED", "Fullscreen transition cancelled by destruction");
    } catch (error) {
      if (doc.fullscreenElement === root && !destroyed) {
        native = true;
        root.classList.add("etch-expanded");
        publish(true);
      } else {
        restore();
        publish(false);
      }
      desired = expanded;
      throw error;
    }
  }
  function setExpanded(value2) {
    if (destroyed) fail("DESTROYED", "This editor has been destroyed");
    desired = value2;
    if (pending) return pending;
    if (desired === expanded) return Promise.resolve();
    pending = (async () => {
      try {
        do {
          await reconcile();
        } while (!destroyed && desired !== expanded);
      } finally {
        pending = null;
      }
    })();
    return pending;
  }
  function fullscreenChanged() {
    if (native && doc.fullscreenElement !== root && !exiting) {
      desired = false;
      onBeforeChange();
      restore();
      publish(false);
    }
  }
  function keydown(event) {
    if (!expanded || !root.contains(event.target) || root.querySelector("dialog[open], .etch-shape-menu:popover-open, .etch-export-menu:popover-open")) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setExpanded(false).catch(onError);
    } else if (event.key === "Tab") {
      const controls = [...root.querySelectorAll('button,input,select,textarea,a[href],[tabindex],[contenteditable="true"]')].filter((node) => !node.disabled && node.tabIndex >= 0 && node.getClientRects().length && !node.closest("[inert]"));
      const first = controls[0] ?? root, last = controls.at(-1) ?? root;
      if (event.shiftKey && (doc.activeElement === first || doc.activeElement === root)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (doc.activeElement === last || doc.activeElement === root)) {
        event.preventDefault();
        first.focus();
      }
    }
  }
  function destroy() {
    if (destroyed) return;
    destroyed = true;
    desired = false;
    doc.removeEventListener("fullscreenchange", fullscreenChanged);
    doc.removeEventListener("keydown", keydown, true);
    exitNative().catch(onError);
    restore();
    expanded = false;
  }
  doc.addEventListener("fullscreenchange", fullscreenChanged);
  doc.addEventListener("keydown", keydown, true);
  return controller;
}

// src/etch/rendering/scheduler.js
function createScheduler(window, callback) {
  let frame = null, destroyed = false;
  return {
    request() {
      if (destroyed || frame !== null) return;
      frame = window.requestAnimationFrame(() => {
        frame = null;
        if (!destroyed) callback();
      });
    },
    destroy() {
      destroyed = true;
      if (frame !== null) window.cancelAnimationFrame(frame);
      frame = null;
    }
  };
}

// src/etch/geometry/selection.js
var RESIZE_HANDLES = Object.freeze([
  ["nw", 0, 0],
  ["ne", 1, 0],
  ["se", 1, 1],
  ["sw", 0, 1],
  ["n", 0.5, 0],
  ["e", 1, 0.5],
  ["s", 0.5, 1],
  ["w", 0, 0.5]
].map(Object.freeze));
function selectionBounds(layer, ids) {
  const selected = new Set(ids);
  let bounds = null;
  for (const element of layer.elements) if (selected.has(element.id)) bounds = unionBounds(bounds, elementBounds(element, layer.offset));
  return bounds;
}
function interactionBounds(bounds, zoom) {
  if (!bounds) return null;
  const width2 = Math.max(bounds.width, 8 / zoom), height = Math.max(bounds.height, 8 / zoom);
  return { x: bounds.x + (bounds.width - width2) / 2, y: bounds.y + (bounds.height - height) / 2, width: width2, height };
}
function handlePosition(bounds, [, u, v]) {
  return [bounds.x + u * bounds.width, bounds.y + v * bounds.height];
}
function pickResizeHandle(bounds, view, screen, pointerType = "mouse") {
  if (!bounds) return null;
  const radius = pointerType === "touch" ? 12 : 8;
  let closest = null, distance = Infinity;
  for (const handle of RESIZE_HANDLES) {
    const point = handlePosition(bounds, handle).map((n, i) => n * view.zoom + view.pan[i]);
    const delta = point.map((n, i) => Math.abs(n - screen[i]));
    const d = Math.hypot(...delta);
    if (delta.every((n) => n <= radius) && d < distance) {
      closest = handle;
      distance = d;
    }
  }
  return closest;
}

// src/etch/rendering/canvas.js
var PathCache = class {
  #entries = /* @__PURE__ */ new Map();
  #segments = 0;
  constructor(Path2D, { maxSegments = 5e5, maxEntries = 2048 } = {}) {
    this.Path2D = Path2D;
    this.maxSegments = maxSegments;
    this.maxEntries = maxEntries;
  }
  get(element, { retain = true, onWork } = {}) {
    let entry = this.#entries.get(element);
    if (entry) {
      onWork?.(entry.segments);
      this.#entries.delete(element);
      this.#entries.set(element, entry);
      return entry.path;
    }
    const path = new this.Path2D(), segments = traceElementPath(path, element);
    onWork?.(segments);
    entry = { path, segments };
    if (retain && segments <= this.maxSegments) {
      while (this.#entries.size && (this.#segments + segments > this.maxSegments || this.#entries.size >= this.maxEntries)) {
        const key = this.#entries.keys().next().value;
        this.#segments -= this.#entries.get(key).segments;
        this.#entries.delete(key);
      }
      this.#entries.set(element, entry);
      this.#segments += segments;
    }
    return path;
  }
  clear() {
    this.#entries.clear();
    this.#segments = 0;
  }
};
function renderScene(context, document, { width: width2, height, dpr = 1, view, assets, cache, preview = null, background = document.background }) {
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.globalAlpha = 1;
  context.globalCompositeOperation = "source-over";
  context.clearRect(0, 0, context.canvas.width, context.canvas.height);
  if (background) {
    const paper = typeof background === "object" ? paperBands(background, {
      width: context.canvas.width,
      height: context.canvas.height,
      scale: dpr * view.zoom,
      pan: view.pan.map((n) => n * dpr)
    }) : null;
    context.fillStyle = paper ? paper.color : background;
    context.fillRect(0, 0, context.canvas.width, context.canvas.height);
    if (paper?.dots) {
      const [x, y] = paper.bands;
      context.fillStyle = x.color;
      for (let i = 0; i < x.count; i++) for (let j = 0; j < y.count; j++) {
        context.beginPath();
        context.arc(x.start + i * x.step, y.start + j * y.step, dpr * view.zoom, 0, Math.PI * 2);
        context.fill();
      }
    } else if (paper) for (const band of paper.bands) {
      context.fillStyle = band.color;
      for (let i = 0; i < band.count; i++) {
        const position = band.start + i * band.step - band.lineWidth / 2;
        if (band.axis === 0) context.fillRect(position, 0, band.lineWidth, context.canvas.height);
        else context.fillRect(0, position, context.canvas.width, band.lineWidth);
      }
    }
  }
  const z = view.zoom, [px, py] = view.pan;
  const base = [dpr * z, 0, 0, dpr * z, dpr * px, dpr * py];
  const worldViewport = { left: -px / z, top: -py / z, right: (width2 - px) / z, bottom: (height - py) / z };
  for (const layer of document.layers) {
    if (!layer.visible) continue;
    const virtual = preview?.layerId === layer.id ? preview : null;
    const offset = virtual?.offset ?? layer.offset;
    const originals = virtual ? new Set(layer.elements) : null;
    const layerMatrix = multiply(base, translate(...offset));
    for (const element of virtual?.elements ?? layer.elements) {
      const bounds = elementBounds(element, offset);
      if (!bounds || bounds.x + bounds.width < worldViewport.left || bounds.y + bounds.height < worldViewport.top || bounds.x > worldViewport.right || bounds.y > worldViewport.bottom) continue;
      context.globalAlpha = element.type === "highlight" ? element.opacity : 1;
      context.setTransform(...multiply(layerMatrix, element.transform));
      if (element.type === "image") {
        const image = assets.get(element.assetId);
        if (!image) fail("DECODE_FAILED", "Image resource is not available");
        context.drawImage(image, element.x, element.y, element.width, element.height);
        continue;
      }
      const path = cache.get(element, { retain: !originals || originals.has(element) });
      const fill = ["stroke", "highlight", "ink"].includes(element.type) ? element.color : element.fill;
      if (fill) {
        context.fillStyle = fill;
        context.fill(path, element.fillRule ?? "nonzero");
      }
      if (element.stroke) {
        context.strokeStyle = element.stroke;
        context.lineWidth = element.strokeWidth;
        context.lineCap = element.lineCap ?? "butt";
        context.lineJoin = element.lineJoin ?? "round";
        context.miterLimit = element.miterLimit ?? 4;
        context.stroke(path);
      }
    }
  }
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.globalAlpha = 1;
}
function createCanvasRenderer(viewport, state, view, { onViewChange, onResize, onError, isSelectionTool = () => false }) {
  const doc = viewport.ownerDocument, window = doc.defaultView;
  const committed = doc.createElement("canvas"), live = doc.createElement("canvas");
  committed.className = "etch-canvas etch-committed";
  live.className = "etch-canvas etch-live";
  committed.setAttribute("aria-hidden", "true");
  live.setAttribute("aria-hidden", "true");
  const mainContext = committed.getContext("2d"), liveContext = live.getContext("2d");
  if (!mainContext || !liveContext) fail("INVALID_ARGUMENT", "Etch requires Canvas 2D support");
  live.hidden = true;
  viewport.prepend(committed, live);
  const outlines = [doc.createElement("span"), doc.createElement("span")];
  for (const outline of outlines) {
    outline.className = "etch-selection-outline";
    outline.hidden = true;
    outline.setAttribute("aria-hidden", "true");
    viewport.append(outline);
  }
  const handles = RESIZE_HANDLES.map(([name]) => {
    const handle = doc.createElement("span");
    handle.className = "etch-selection-handle";
    handle.dataset.handle = name;
    handle.hidden = true;
    handle.setAttribute("aria-hidden", "true");
    viewport.append(handle);
    return handle;
  });
  const cache = new PathCache(window.Path2D);
  let destroyed = false, viewDirty = true, preview = null, liveDirty = false, dpr = 0, media = null;
  let backgroundPreview, backgroundDocument = null;
  const scheduler = createScheduler(window, draw);
  function invalidate(changedView = false) {
    viewDirty ||= changedView;
    scheduler.request();
  }
  function watchDPR() {
    media?.removeEventListener("change", dprChanged);
    media = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
    media.addEventListener("change", dprChanged);
  }
  function dprChanged() {
    watchDPR();
    invalidate();
  }
  function measure() {
    const { width: width2, height } = viewport.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    const available = width2 > 0 && height > 0;
    const w = available ? Math.round(width2 * ratio) : 0, h = available ? Math.round(height * ratio) : 0;
    if (w > 8192 || h > 8192 || w * h > 16777216) fail("LIMIT_EXCEEDED", "Viewport backing canvas exceeds safety limits", { limit: "viewportPixels", maximum: 16777216 });
    const changed = view.resize(width2, height);
    if (changed || ratio !== dpr) {
      dpr = ratio;
      onResize?.();
    }
    for (const canvas of [committed, live]) {
      if (canvas.width !== w) canvas.width = w;
      if (canvas.height !== h) canvas.height = h;
    }
    return { width: width2, height };
  }
  function draw() {
    if (destroyed) return;
    try {
      const { width: width2, height } = measure();
      if (backgroundDocument !== state.document) {
        backgroundPreview = void 0;
        backgroundDocument = null;
      }
      const previewing = preview !== null || backgroundPreview !== void 0;
      if (width2 > 0 && height > 0) {
        const replacement = typeof preview === "function" ? preview() : preview;
        const options = { width: width2, height, dpr, view: view.get(), assets: state.assets, cache, preview: replacement, background: backgroundPreview };
        const context = previewing ? liveContext : mainContext;
        renderScene(context, state.document, options);
        const layer = state.document.layers.find((l) => l.id === state.getActiveLayer());
        const virtual = replacement?.layerId === layer.id ? replacement : null;
        const selectedLayer = virtual ? { ...layer, elements: virtual.elements ?? layer.elements, offset: virtual.offset ?? layer.offset } : layer;
        let bounds = selectionBounds(selectedLayer, state.getSelection());
        const current = view.get(), selecting = isSelectionTool() && !state.readOnly && !state.busy;
        if (selecting) bounds = interactionBounds(bounds, current.zoom);
        handles.forEach((handle, i) => {
          handle.hidden = !selecting || !bounds || Boolean(replacement?.marquee);
          if (!handle.hidden) {
            const point = handlePosition(bounds, RESIZE_HANDLES[i]);
            handle.style.left = `${point[0] * current.zoom + current.pan[0]}px`;
            handle.style.top = `${point[1] * current.zoom + current.pan[1]}px`;
          }
        });
        [bounds, replacement?.marquee].forEach((b, i) => {
          const outline = outlines[i];
          outline.hidden = !b;
          if (b) Object.assign(outline.style, { left: `${b.x * current.zoom + current.pan[0]}px`, top: `${b.y * current.zoom + current.pan[1]}px`, width: `${b.width * current.zoom}px`, height: `${b.height * current.zoom}px` });
        });
        if (previewing) liveDirty = true;
        else if (liveDirty) {
          liveContext.setTransform(1, 0, 0, 1, 0, 0);
          liveContext.clearRect(0, 0, live.width, live.height);
          liveDirty = false;
        }
      }
      committed.hidden = previewing;
      live.hidden = !previewing;
      if (viewDirty) {
        viewDirty = false;
        onViewChange(view.get());
      }
    } catch (error) {
      for (const outline of [...outlines, ...handles]) outline.hidden = true;
      if (preview || backgroundPreview !== void 0) {
        preview = null;
        backgroundPreview = void 0;
        backgroundDocument = null;
        committed.hidden = false;
        live.hidden = true;
        liveContext.setTransform(1, 0, 0, 1, 0, 0);
        liveContext.clearRect(0, 0, live.width, live.height);
        liveDirty = false;
      }
      onError(error);
    }
  }
  const observer = new window.ResizeObserver(() => invalidate());
  observer.observe(viewport);
  watchDPR();
  window.addEventListener("resize", invalidateResize);
  function invalidateResize() {
    invalidate();
  }
  try {
    measure();
  } catch (error) {
    onError(error);
  }
  invalidate();
  return {
    invalidate,
    // Exact paint membership supplements the swept, flattened tolerance band.
    // CSS-space query matrix intentionally excludes both pan and backing-store DPR.
    hitPoint(element, matrix, point, budget) {
      const path = cache.get(element, { onWork: (n) => budget.step(n) }), fill = ["stroke", "highlight", "ink"].includes(element.type) ? element.color : element.fill;
      liveContext.save();
      try {
        liveContext.setTransform(...matrix);
        if (fill && liveContext.isPointInPath(path, ...point, element.fillRule ?? "nonzero")) return true;
        if (!element.stroke) return false;
        liveContext.lineWidth = element.strokeWidth;
        liveContext.lineCap = element.lineCap ?? "butt";
        liveContext.lineJoin = element.lineJoin ?? "round";
        liveContext.miterLimit = element.miterLimit ?? 4;
        return liveContext.isPointInStroke(path, ...point);
      } finally {
        liveContext.restore();
      }
    },
    setBackgroundPreview(value2) {
      if (destroyed) return;
      backgroundPreview = value2;
      backgroundDocument = value2 === void 0 ? null : state.document;
      invalidate();
    },
    setPreview(value2) {
      preview = value2;
      invalidate();
    },
    clearPreview() {
      if (preview) {
        preview = null;
        invalidate();
      }
    },
    resetCache() {
      cache.clear();
      preview = null;
      backgroundPreview = void 0;
      backgroundDocument = null;
      invalidate();
    },
    destroy() {
      destroyed = true;
      scheduler.destroy();
      observer.disconnect();
      media?.removeEventListener("change", dprChanged);
      window.removeEventListener("resize", invalidateResize);
      cache.clear();
      committed.width = committed.height = live.width = live.height = 0;
      committed.remove();
      live.remove();
      for (const outline of [...outlines, ...handles]) outline.remove();
    }
  };
}

// src/etch/input/gesture-guard.js
function installGestureGuard(root, isExpanded) {
  const win = root.ownerDocument.defaultView, listeners = [];
  let contact = null;
  const element = (target) => target?.nodeType === 1 ? target : target?.parentElement;
  const viewport = (target) => Boolean(element(target)?.closest(".etch-viewport"));
  function listen(name, handler, options) {
    root.addEventListener(name, handler, options);
    listeners.push(() => root.removeEventListener(name, handler, options));
  }
  function remember(event) {
    const touch = event.touches.length === 1 ? event.touches[0] : null;
    contact = touch ? { id: touch.identifier, x: touch.clientX, y: touch.clientY } : null;
  }
  function canScroll(target, dx, dy) {
    const horizontal = Math.abs(dx) > Math.abs(dy), delta = horizontal ? dx : dy;
    if (!delta) return true;
    for (let node = element(target); node && node !== root; node = node.parentElement) {
      const style = win.getComputedStyle(node), overflow = horizontal ? style.overflowX : style.overflowY;
      const maximum = horizontal ? node.scrollWidth - node.clientWidth : node.scrollHeight - node.clientHeight;
      if (!["auto", "scroll"].includes(overflow) || maximum <= 1) continue;
      const position = horizontal ? node.scrollLeft : node.scrollTop, rtl = horizontal && style.direction === "rtl";
      const low = rtl ? -maximum : 0, high = rtl ? 0 : maximum;
      return delta > 0 ? position > low + 0.5 : position < high - 0.5;
    }
    return false;
  }
  listen("touchstart", remember, { passive: true });
  listen("touchmove", (event) => {
    const touches = Array.from(event.touches), touch = touches.length === 1 ? touches[0] : null;
    const owned = viewport(event.target) || touches.some((t) => viewport(t.target));
    if (owned || touches.length > 1 && isExpanded()) {
      if (event.cancelable) event.preventDefault();
      remember(event);
      return;
    }
    if (!touch || !contact || touch.identifier !== contact.id) {
      remember(event);
      return;
    }
    const dx = touch.clientX - contact.x, dy = touch.clientY - contact.y;
    remember(event);
    if (element(event.target)?.closest('input,textarea,select,[contenteditable="true"]')) return;
    if (!canScroll(event.target, dx, dy) && event.cancelable) event.preventDefault();
  }, { passive: false });
  for (const name of ["touchend", "touchcancel"]) listen(name, remember, { passive: true });
  for (const name of ["gesturestart", "gesturechange", "gestureend"]) listen(name, (event) => {
    if ((viewport(event.target) || isExpanded()) && event.cancelable) event.preventDefault();
  }, { passive: false });
  return () => {
    contact = null;
    for (const remove of listeners) remove();
  };
}

// src/etch/input/pen.js
var PenInput = class {
  #points = [];
  #filtered = null;
  #lastSample = null;
  #lastKeptScreen = null;
  #screen = null;
  constructor({ tool = "pen", pointerType, view, offset, settings, maxPoints, sampleLimit = { limit: "pointsPerElement", maximum: maxPoints } }) {
    this.tool = tool;
    this.pressure = pointerType === "pen" && tool !== "highlighter" && settings.pressure !== false;
    this.pointerType = pointerType;
    this.view = view;
    this.offset = offset;
    this.settings = { ...settings };
    this.maxPoints = maxPoints;
    this.sampleLimit = sampleLimit;
    this.id = createId();
  }
  get lastScreen() {
    return this.#screen && [...this.#screen];
  }
  add(event, screen, final = false) {
    if (!screen.every(Number.isFinite) || !Number.isFinite(event.timeStamp)) fail("INVALID_ARGUMENT", "Pointer coordinates and timestamp must be finite");
    const signature = [...screen, event.pressure, event.timeStamp];
    const duplicate = this.#lastSample && signature.every((n, i) => n === this.#lastSample[i]);
    if (duplicate && !final) return;
    this.#lastSample = signature;
    this.#screen = [...screen];
    const point = screenToWorld(screen, this.view).map((n, i) => n - this.offset[i]);
    if (point.some((n) => !Number.isFinite(n) || Math.abs(n) > 1e7)) fail("INVALID_ARGUMENT", "Pointer exceeds supported world coordinates");
    let pressure = 1;
    if (this.pressure) {
      const raw = Number.isFinite(event.pressure) ? Math.max(0, Math.min(1, event.pressure)) : null;
      if (this.#filtered === null) this.#filtered = raw > 0 ? raw : 0.5;
      else if (!duplicate && !(final && (raw === null || raw === 0))) this.#filtered = 0.35 * (raw ?? this.#filtered) + 0.65 * this.#filtered;
      pressure = this.#filtered;
    }
    const previous = this.#points.at(-1);
    if (previous) {
      const delta = Math.abs(pressure - previous[2]);
      if (point[0] === previous[0] && point[1] === previous[1] && delta < 1e-12) return;
      if (!final && Math.hypot(screen[0] - this.#lastKeptScreen[0], screen[1] - this.#lastKeptScreen[1]) < 0.25 && delta < 0.01) return;
    }
    if (this.#points.length >= this.maxPoints) fail("LIMIT_EXCEEDED", "Stroke sample limit reached; this stroke was cancelled", this.sampleLimit);
    this.#points.push([...point, pressure]);
    this.#lastKeptScreen = [...screen];
  }
  element() {
    return {
      id: this.id,
      type: this.tool === "highlighter" ? "highlight" : "stroke",
      transform: [1, 0, 0, 1, 0, 0],
      points: this.#points.map((p) => [...p]),
      color: this.settings.color,
      width: this.settings.width,
      pressure: this.pressure,
      ...this.tool === "highlighter" ? { opacity: this.settings.opacity } : {}
    };
  }
};

// src/etch/input/shapes.js
var ShapeInput = class {
  #start = null;
  #end = null;
  #screen = null;
  #constrained = false;
  constructor({ tool, view, offset, settings }) {
    if (!isShapeTool(tool)) fail("INVALID_ARGUMENT", "Expected line, arrow, rectangle or ellipse tool");
    this.tool = tool;
    this.view = view;
    this.offset = offset;
    this.settings = { ...settings };
    this.id = createId();
  }
  get lastScreen() {
    return this.#screen && [...this.#screen];
  }
  setConstrained(value2) {
    this.#constrained = Boolean(value2);
  }
  add(event, screen) {
    if (!screen.every(Number.isFinite)) fail("INVALID_ARGUMENT", "Pointer coordinates must be finite");
    const point = screenToWorld(screen, this.view).map((n, i) => n - this.offset[i]);
    if (point.some((n) => !Number.isFinite(n) || Math.abs(n) > 1e7)) fail("INVALID_ARGUMENT", "Pointer exceeds supported world coordinates");
    this.#screen = [...screen];
    this.#start ??= point;
    this.#end = point;
    this.setConstrained(event.shiftKey);
  }
  element() {
    if (!this.#start) return null;
    const [sx, sy] = this.#start;
    let dx = this.#end[0] - sx, dy = this.#end[1] - sy;
    if (this.#constrained) {
      if (isLineTool(this.tool)) {
        const length = Math.hypot(dx, dy), angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * Math.PI / 4;
        dx = Math.cos(angle) * length;
        dy = Math.sin(angle) * length;
      } else {
        const side = Math.max(Math.abs(dx), Math.abs(dy));
        dx = (Math.sign(dx) || 1) * side;
        dy = (Math.sign(dy) || 1) * side;
      }
    }
    if (isLineTool(this.tool) ? Math.hypot(dx, dy) * this.view.zoom < 2 : Math.min(Math.abs(dx), Math.abs(dy)) * this.view.zoom < 2) return null;
    const { stroke, strokeWidth, fill } = this.settings;
    const e = { id: this.id, type: this.tool, transform: [1, 0, 0, 1, 0, 0], stroke, strokeWidth: stroke ? strokeWidth : 0 };
    if (this.tool === "line") return { ...e, start: [sx, sy], end: [sx + dx, sy + dy], lineCap: "round" };
    if (this.tool === "arrow") {
      const length = Math.hypot(dx, dy), ux = dx / length, uy = dy / length;
      const head = Math.min(length, Math.max(12, 4 * strokeWidth)), half = head / 2;
      const ex = sx + dx, ey = sy + dy, bx = ex - head * ux, by = ey - head * uy;
      return {
        ...e,
        type: "path",
        fill: null,
        fillRule: "nonzero",
        lineCap: "round",
        lineJoin: "round",
        miterLimit: 4,
        commands: [["M", sx, sy], ["L", ex, ey], ["M", bx - half * uy, by + half * ux], ["L", ex, ey], ["L", bx + half * uy, by - half * ux]]
      };
    }
    const x = Math.min(sx, sx + dx), y = Math.min(sy, sy + dy), width2 = Math.abs(dx), height = Math.abs(dy);
    if (this.tool === "rect") return { ...e, x, y, width: width2, height, fill, lineJoin: "round", miterLimit: 4 };
    return { ...e, cx: x + width2 / 2, cy: y + height / 2, rx: width2 / 2, ry: height / 2, fill };
  }
};

// src/etch/input/layer-move.js
var LayerMoveInput = class {
  #start = null;
  #screen = null;
  #zoom;
  constructor({ view }) {
    this.#zoom = view.zoom;
  }
  get lastScreen() {
    return this.#screen && [...this.#screen];
  }
  add(_event, screen) {
    if (!Array.isArray(screen) || screen.length !== 2 || !Array.from(screen).every(Number.isFinite)) fail("INVALID_ARGUMENT", "Pointer coordinates must be finite");
    this.#start ??= [...screen];
    this.#screen = [...screen];
  }
  delta() {
    if (!this.#start) return [0, 0];
    const delta = this.#screen.map((n, i) => n - this.#start[i]);
    return Math.hypot(...delta) < 2 ? [0, 0] : delta.map((n) => n / this.#zoom);
  }
};

// src/etch/geometry/ink-cut.js
var InkCutTester = class {
  constructor(layer, zoom, { budget = new HitBudget(), maxPieces = 2e4 } = {}) {
    Object.assign(this, { layer, zoom, budget, maxPieces, allocated: 0 });
    this.entries = [...layer.elements].reverse().filter((e) => ["stroke", "ink"].includes(e.type)).map((element) => ({ element, bounds: elementBounds(element, layer.offset), parts: null, vertices: 0, dirty: false, groups: null, ids: [element.id] }));
  }
  vertices(entry, n) {
    this.budget.vertices(n, this.budget.segments - entry.vertices);
    entry.vertices += n;
  }
  build(entry) {
    const matrix = multiply(scale(this.zoom), multiply(translate(...this.layer.offset), entry.element.transform));
    entry.matrix = matrix;
    entry.parts = outlineParts(entry.element, this.budget).map((commands) => {
      const controls = partControls(commands);
      this.vertices(entry, controls.length);
      return { commands, bounds: polygonBounds(controls.map((p) => apply(matrix, p))), polygon: null };
    });
  }
  polygon(entry, part) {
    return part.polygon ??= flattenPart(part.commands, entry.matrix, this.budget, (n) => this.vertices(entry, n));
  }
  sweep(a, b, radius) {
    const r = radius + HIT_ERROR, z = this.zoom, screenBox = { x: Math.min(a[0], b[0]) - r - 0.02, y: Math.min(a[1], b[1]) - r - 0.02, width: Math.abs(a[0] - b[0]) + 2 * (r + 0.02), height: Math.abs(a[1] - b[1]) + 2 * (r + 0.02) };
    const worldBox = { x: screenBox.x / z, y: screenBox.y / z, width: screenBox.width / z, height: screenBox.height / z }, changed = [];
    let cutter;
    for (const entry of this.entries) {
      this.budget.step();
      if (!entry.bounds || !overlaps(entry.bounds, worldBox) || entry.parts?.length === 0) continue;
      if (!entry.parts) this.build(entry);
      const next = [];
      let hit = false;
      for (const part of entry.parts) {
        this.budget.step();
        if (!overlaps(part.bounds, screenBox)) {
          next.push(part);
          continue;
        }
        cutter ??= capsule(a, b, r, this.budget);
        const polygon = this.polygon(entry, part);
        const epsilon = Math.max(1e-8, 32 * Number.EPSILON * Math.max(1, Math.abs(part.bounds.x), Math.abs(part.bounds.y)));
        if (!intersects(polygon, cutter, this.budget, -epsilon)) {
          next.push(part);
          continue;
        }
        hit = true;
        const pieces = subtract(polygon, cutter, this.budget, (n) => this.vertices(entry, n));
        for (const polygon2 of pieces) next.push({ polygon: polygon2, commands: polygonCommands(polygon2), bounds: polygonBounds(polygon2) });
        if (next.length > MAX_INK_PARTS) fail("LIMIT_EXCEEDED", "Too many ink primitives; gesture cancelled", { limit: "inkParts", maximum: MAX_INK_PARTS });
      }
      if (next.length > MAX_INK_PARTS) fail("LIMIT_EXCEEDED", "Too many ink primitives; gesture cancelled", { limit: "inkParts", maximum: MAX_INK_PARTS });
      if (hit) {
        entry.parts = next;
        entry.dirty = true;
        entry.groups = null;
        changed.push(entry.element.id);
      }
    }
    return changed;
  }
  changes() {
    const changes = [];
    let count = 0;
    for (const entry of this.entries) {
      this.budget.step();
      if (!entry.dirty) continue;
      if (!entry.groups) {
        for (const part of entry.parts) this.polygon(entry, part);
        entry.groups = components(entry.parts, this.budget);
      }
      count += entry.groups.length;
      if (count > this.maxPieces) fail("LIMIT_EXCEEDED", "Too many partial eraser pieces; gesture cancelled", { limit: "eraserPieces", maximum: this.maxPieces });
      while (entry.ids.length < entry.groups.length) {
        if (++this.allocated > this.maxPieces) fail("LIMIT_EXCEEDED", "Partial eraser identity limit exceeded; gesture cancelled", { limit: "eraserPieces", maximum: this.maxPieces });
        entry.ids.push(createId());
      }
      changes.push({ id: entry.element.id, groups: entry.groups.map((group) => group.map((commands) => commands.map((c) => [...c]))), ids: entry.ids.slice(0, entry.groups.length) });
    }
    return changes;
  }
};
var PartialCutTester = class {
  constructor(layer, zoom, { budget = new HitBudget(), maxPieces = 2e4 } = {}) {
    this.budget = budget;
    this.maxPieces = maxPieces;
    this.lines = new LineCutTester(layer, zoom, { budget, maxPieces });
    this.ink = new InkCutTester(layer, zoom, { budget, maxPieces });
  }
  sweep(a, b, radius) {
    return [...this.lines.sweep(a, b, radius), ...this.ink.sweep(a, b, radius)];
  }
  changes() {
    const changes = [...this.lines.changes(), ...this.ink.changes()];
    const count = changes.reduce((n, c) => n + c.ids.length, 0);
    if (count > this.maxPieces || this.lines.allocated + this.ink.allocated > this.maxPieces) fail("LIMIT_EXCEEDED", "Too many partial eraser pieces; gesture cancelled", { limit: "eraserPieces", maximum: this.maxPieces });
    return changes;
  }
};

// src/etch/input/eraser.js
var EraserInput = class {
  #pending = [];
  #hits = /* @__PURE__ */ new Set();
  #last = null;
  #processed = null;
  #screen = null;
  #samples = 0;
  constructor({ layer, view, settings, maxSamples = 1e5, tester, exact }) {
    this.view = { zoom: view.zoom, pan: [...view.pan] };
    this.radius = settings.radius;
    this.maxSamples = maxSamples;
    this.mode = settings.mode ?? "object";
    this.tester = tester ?? (this.mode === "partial" ? new PartialCutTester(layer, view.zoom) : new SweptHitTester(layer, view.zoom, { exact }));
  }
  get lastScreen() {
    return this.#screen && [...this.#screen];
  }
  add(event, screen) {
    if (!Array.isArray(screen) || screen.length !== 2 || Array.from(screen).some((n) => !Number.isFinite(n))) fail("INVALID_ARGUMENT", "Pointer coordinates must be a finite pair");
    const point = screen.map((n, i) => n - this.view.pan[i]);
    if (point.some((n) => !Number.isFinite(n) || Math.abs(n / this.view.zoom) > 1e7)) fail("INVALID_ARGUMENT", "Pointer exceeds supported world coordinates");
    this.#screen = [...screen];
    if (this.#last && point.every((n, i) => n === this.#last[i])) return;
    if (++this.#samples > this.maxSamples) fail("LIMIT_EXCEEDED", "Eraser sample limit reached; gesture cancelled", { limit: "pointsPerElement", maximum: this.maxSamples });
    this.#pending.push(point);
    this.#last = point;
  }
  #flush() {
    for (const point of this.#pending) {
      for (const id of this.tester.sweep(this.#processed ?? point, point, this.radius)) this.#hits.add(id);
      this.#processed = point;
    }
    this.#pending = [];
  }
  ids() {
    if (this.mode !== "object") fail("INVALID_ARGUMENT", "Partial eraser returns line changes, not removed object IDs");
    this.#flush();
    return [...this.#hits];
  }
  changes() {
    if (this.mode !== "partial") fail("INVALID_ARGUMENT", "Object eraser returns removed IDs, not line changes");
    this.#flush();
    return this.tester.changes();
  }
};

// src/etch/input/selection.js
function pickElement(layer, view, screen, exact) {
  const point = screen.map((n, i) => n - view.pan[i]);
  return new SweptHitTester(layer, view.zoom, { exact }).sweep(point, point, 0)[0] ?? null;
}
var SelectionResizeInput = class extends LayerMoveInput {
  constructor({ view, layer, selection, bounds, handle }) {
    super({ view });
    this.layer = layer;
    this.bounds = { ...bounds };
    this.handle = handle;
    const ids = new Set(selection);
    this.elements = layer.elements.filter((e) => ids.has(e.id));
    this.image = this.elements.length === 1 && this.elements[0].type === "image";
    this.constrained = false;
  }
  add(event, screen) {
    super.add(event, screen);
    if (typeof event.shiftKey === "boolean") this.constrained = event.shiftKey;
  }
  setConstrained(value2) {
    this.constrained = value2;
  }
  matrix() {
    const delta = this.delta();
    if (delta.every((n) => n === 0)) return [...IDENTITY];
    const [, u, v] = this.handle, b = this.bounds;
    const anchor = [b.x + (1 - u) * b.width, b.y + (1 - v) * b.height];
    let sx = u === 0.5 ? 1 : 1 + delta[0] / ((2 * u - 1) * b.width);
    let sy = v === 0.5 ? 1 : 1 + delta[1] / ((2 * v - 1) * b.height);
    const uniform = u !== 0.5 && v !== 0.5 && this.image !== this.constrained;
    if (uniform) sx = sy = Math.abs(sx - 1) >= Math.abs(sy - 1) ? sx : sy;
    sx = Math.max(1e-8, sx);
    sy = Math.max(1e-8, sy);
    const stable = (x, y) => this.elements.every((e) => singularValues(multiply(scale(x, y), e.transform))[0] >= 1e-4);
    if (!stable(sx, sy)) {
      let low = 0, high = 1;
      for (let i = 0; i < 50; i++) {
        const t = (low + high) / 2;
        if (stable(1 + (sx - 1) * t, 1 + (sy - 1) * t)) low = t;
        else high = t;
      }
      sx = 1 + (sx - 1) * low;
      sy = 1 + (sy - 1) * low;
    }
    const pivot = anchor.map((n, i) => n - this.layer.offset[i]);
    return multiply(translate(...pivot), multiply(scale(sx, sy), translate(-pivot[0], -pivot[1])));
  }
};
var SelectionInput = class extends LayerMoveInput {
  constructor({ view, layer, start, marquee, additive, selection }) {
    super({ view });
    this.view = view;
    this.layer = layer;
    this.start = start;
    this.marquee = marquee;
    this.additive = additive;
    this.selection = selection;
  }
  bounds() {
    const a = this.start.map((n, i) => (n - this.view.pan[i]) / this.view.zoom);
    const b = this.lastScreen.map((n, i) => (n - this.view.pan[i]) / this.view.zoom);
    return { x: Math.min(a[0], b[0]), y: Math.min(a[1], b[1]), width: Math.abs(a[0] - b[0]), height: Math.abs(a[1] - b[1]) };
  }
  ids() {
    const ids = new Set(this.additive ? this.selection : []);
    if (Math.hypot(...this.lastScreen.map((n, i) => n - this.start[i])) < 2) return [...ids];
    const box = this.bounds();
    for (const element of this.layer.elements) {
      const b = elementBounds(element, this.layer.offset);
      if (b && b.x >= box.x && b.y >= box.y && b.x + b.width <= box.x + box.width && b.y + b.height <= box.y + box.height) ids.add(element.id);
    }
    return [...ids];
  }
};

// src/etch/input/controller.js
function createInputController(viewport, root, view, { state, tools, renderer, fit, setTool, onError }) {
  const window = viewport.ownerDocument.defaultView, pointers = /* @__PURE__ */ new Map(), listeners = [];
  let base = null, drawing = null, space = false, destroyed = false, hover = null;
  const cursor = viewport.ownerDocument.createElement("span");
  cursor.className = "etch-eraser-cursor";
  cursor.hidden = true;
  cursor.setAttribute("aria-hidden", "true");
  viewport.append(cursor);
  const barrel = (event) => event.pointerType === "pen" && (event.button === 5 || Boolean(event.buttons & 32));
  function refreshCursor() {
    const layer = state.document.layers.find((l) => l.id === state.getActiveLayer());
    const erasing = drawing?.context.tool === "eraser" || !drawing && tools.getTool() === "eraser";
    const show = erasing && hover?.inside && (hover.type !== "touch" || drawing) && !space && !base && !state.readOnly && !state.busy && layer.visible && !layer.locked;
    cursor.hidden = !show;
    if (show) {
      const radius = drawing?.input.radius ?? tools.getSettings("eraser").radius;
      cursor.style.width = cursor.style.height = `${2 * radius}px`;
      cursor.style.transform = `translate(${hover.screen[0] - radius}px,${hover.screen[1] - radius}px)`;
    }
  }
  function track(event) {
    if (drawing && drawing.id !== event.pointerId) return;
    const rect = viewport.getBoundingClientRect(), screen = local(event, rect);
    hover = { screen, type: event.pointerType, inside: screen[0] >= 0 && screen[1] >= 0 && screen[0] <= rect.width && screen[1] <= rect.height };
    refreshCursor();
  }
  const local = (event, rect = viewport.getBoundingClientRect()) => [event.clientX - rect.left, event.clientY - rect.top];
  const listen = (target, name, callback, options) => {
    const guarded = (event) => {
      if (destroyed) return;
      try {
        callback(event);
      } catch (error) {
        cancel();
        onError(error);
      }
    };
    target.addEventListener(name, guarded, options);
    listeners.push(() => target.removeEventListener(name, guarded, options));
  };
  function release(id) {
    if (viewport.hasPointerCapture(id)) viewport.releasePointerCapture(id);
  }
  function endDrawing(releaseCapture = true) {
    const old = drawing;
    drawing = null;
    viewport.classList.remove("etch-drawing", "etch-moving-layer", "etch-erasing", "etch-resizing");
    renderer.clearPreview();
    if (old && releaseCapture) release(old.id);
    return old;
  }
  function rebase() {
    const points = [...pointers.values()].slice(0, 2).map((p) => p.position);
    base = points.length ? { view: view.get(), points } : null;
    viewport.classList.toggle("etch-panning", points.length > 0);
    refreshCursor();
  }
  function cancel() {
    endDrawing();
    const ids = [...pointers.keys()];
    pointers.clear();
    for (const id of ids) release(id);
    rebase();
  }
  function reset() {
    hover = null;
    space = false;
    viewport.classList.remove("etch-temporary-hand");
    cancel();
  }
  function navigate(event) {
    pointers.set(event.pointerId, { type: event.pointerType, position: local(event) });
    viewport.setPointerCapture(event.pointerId);
    rebase();
  }
  function begin(event, forcedTool) {
    const tool = forcedTool ?? tools.getTool(), moving = tool === "move-layer", erasing = tool === "eraser", settings = tools.getSettings(tool);
    if (tool === "select") {
      const initial = state.prepareSelectionMove(), start = local(event), selection = state.getSelection();
      const currentView = view.get(), bounds = interactionBounds(selectionBounds(initial.layer, selection), currentView.zoom);
      const handle = pickResizeHandle(bounds, currentView, start, event.pointerType);
      if (handle) {
        const input4 = new SelectionResizeInput({ view: currentView, layer: initial.layer, selection, bounds, handle });
        input4.add(event, start);
        drawing = { id: event.pointerId, type: event.pointerType, input: input4, context: initial, commit: () => state.commitSelectionResize(initial, input4.matrix()) };
        viewport.setPointerCapture(event.pointerId);
        viewport.classList.add("etch-resizing");
        viewport.style.setProperty("--etch-resize-cursor", `${handle[0]}-resize`);
        renderer.setPreview(() => state.previewSelectionResize(initial, input4.matrix()));
        return;
      }
      const hit = pickElement(initial.layer, view.get(), start, (...args) => renderer.hitPoint(...args));
      if (hit) state.setSelection(event.shiftKey ? selection.includes(hit) ? selection.filter((id) => id !== hit) : [...selection, hit] : selection.includes(hit) ? selection : [hit]);
      const context2 = state.prepareSelectionMove();
      if (hit && !context2.ids.includes(hit)) context2.ids = [];
      const input3 = new SelectionInput({ view: view.get(), layer: context2.layer, start, marquee: !hit, additive: event.shiftKey, selection });
      input3.add(event, start);
      drawing = {
        id: event.pointerId,
        type: event.pointerType,
        input: input3,
        context: context2,
        commit: () => input3.marquee ? state.setSelection(input3.ids()) : state.commitSelectionMove(context2, input3.delta())
      };
      viewport.setPointerCapture(event.pointerId);
      renderer.setPreview(() => input3.marquee ? { marquee: input3.bounds() } : state.previewSelectionMove(context2, input3.delta()));
      return;
    }
    const partial = erasing && settings.mode === "partial";
    const context = erasing ? state.prepareErase(settings.mode) : moving ? state.prepareLayerMove() : state.prepareDrawing(tool);
    const Input = erasing ? EraserInput : moving ? LayerMoveInput : ["pen", "highlighter"].includes(tool) ? PenInput : ShapeInput;
    const input2 = new Input({
      tool,
      pointerType: event.pointerType,
      view: view.get(),
      offset: context.layer.offset,
      layer: context.layer,
      settings,
      maxPoints: context.maxPoints,
      sampleLimit: context.sampleLimit,
      maxSamples: context.maxSamples,
      exact: (...args) => renderer.hitPoint(...args)
    });
    input2.add(event, local(event));
    drawing = {
      id: event.pointerId,
      type: event.pointerType,
      input: input2,
      context,
      commit: () => partial ? state.commitPartialErase(context, input2.changes()) : erasing ? state.commitErase(context, input2.ids()) : moving ? state.commitLayerMove(context, input2.delta()) : state.commitDrawing(context, input2.element())
    };
    viewport.setPointerCapture(event.pointerId);
    viewport.classList.add(erasing ? "etch-erasing" : moving ? "etch-moving-layer" : "etch-drawing");
    renderer.setPreview(() => partial ? state.previewPartialErase(context, input2.changes()) : erasing ? state.previewErase(context, input2.ids()) : moving ? state.previewLayerMove(context, input2.delta()) : state.previewDrawing(context, input2.element()));
    track(event);
  }
  function samples(event, final = false) {
    const batch = ["pen", "eraser"].includes(drawing.context.tool) && typeof event.getCoalescedEvents === "function" ? event.getCoalescedEvents() : [];
    const rect = viewport.getBoundingClientRect();
    for (const sample of batch) if (sample.pointerId === drawing.id) drawing.input.add(sample, local(sample, rect));
    drawing.input.add(event, local(event, rect), final);
    renderer.invalidate();
  }
  listen(viewport, "pointerdown", (event) => {
    if (event.target.closest("button,input,select,textarea,a[href]")) return;
    if (event.pointerType === "mouse" && ![0, 1].includes(event.button)) return;
    if (event.pointerType === "pen" && event.button !== 0 && !barrel(event)) return;
    if (drawing?.type === "pen" || event.pointerType === "touch" && [...pointers.values()].some((p) => p.type === "pen")) return;
    event.preventDefault();
    viewport.focus({ preventScroll: true });
    track(event);
    if (drawing) {
      if (event.pointerType === "pen") cancel();
      else if (drawing.type === "touch" && event.pointerType === "touch") {
        const old = endDrawing(false);
        pointers.set(old.id, { type: "touch", position: old.input.lastScreen });
        navigate(event);
        return;
      } else return;
    }
    if (event.pointerType === "pen") cancel();
    if (pointers.size) {
      navigate(event);
      return;
    }
    const touchNavigation = event.pointerType === "touch" && !tools.getDrawWithTouch();
    if (tools.getTool() === "hand" && !barrel(event) || space || event.button === 1 || touchNavigation || state.readOnly || state.busy) navigate(event);
    else begin(event, barrel(event) ? "eraser" : void 0);
  });
  listen(viewport, "pointermove", (event) => {
    if (drawing?.type === "pen" && drawing.id !== event.pointerId) return;
    track(event);
    if (drawing?.id === event.pointerId) {
      if (!viewport.hasPointerCapture(event.pointerId)) {
        cancel();
        return;
      }
      if (drawing.type === "pen" && barrel(event) && drawing.context.tool !== "eraser") {
        endDrawing(false);
        begin(event, "eraser");
        return;
      }
      const buttons = drawing.context.tool === "eraser" && drawing.type === "pen" ? 33 : 1;
      if (["mouse", "pen"].includes(drawing.type) && !(event.buttons & buttons)) {
        cancel();
        return;
      }
      samples(event);
      return;
    }
    const pointer = pointers.get(event.pointerId);
    if (!pointer) return;
    if (pointer.type === "pen" && barrel(event) && !space && !state.readOnly && !state.busy) {
      pointers.delete(event.pointerId);
      rebase();
      begin(event, "eraser");
      return;
    }
    if (event.pointerType === "mouse" && event.buttons === 0) {
      cancel();
      return;
    }
    pointer.position = local(event);
    const points = [...pointers.values()].slice(0, 2).map((p) => p.position);
    if (points.length === 1) view.set({ pan: base.view.pan.map((n, i) => n + points[0][i] - base.points[0][i]) });
    else {
      const center = points[0].map((n, i) => (n + points[1][i]) / 2), oldCenter = base.points[0].map((n, i) => (n + base.points[1][i]) / 2);
      const distance = Math.hypot(points[1][0] - points[0][0], points[1][1] - points[0][1]);
      const oldDistance = Math.hypot(base.points[1][0] - base.points[0][0], base.points[1][1] - base.points[0][1]);
      const zoom = oldDistance > 0.01 ? clampZoom(base.view.zoom * distance / oldDistance) : base.view.zoom;
      view.set({ zoom, pan: center.map((n, i) => n - (oldCenter[i] - base.view.pan[i]) / base.view.zoom * zoom) });
    }
  });
  listen(viewport, "pointerup", (event) => {
    if (drawing?.id === event.pointerId) {
      if (!viewport.hasPointerCapture(event.pointerId)) {
        cancel();
        return;
      }
      samples(event, true);
      track(event);
      const old = endDrawing();
      old.commit();
      refreshCursor();
      return;
    }
    if (!pointers.delete(event.pointerId)) return;
    release(event.pointerId);
    rebase();
  });
  for (const name of ["pointercancel", "lostpointercapture"]) listen(viewport, name, (event) => {
    if (drawing?.id === event.pointerId || pointers.has(event.pointerId)) cancel();
  });
  listen(viewport, "pointerleave", (event) => {
    if (!drawing || drawing.id === event.pointerId) {
      hover = null;
      refreshCursor();
    }
  });
  listen(window, "blur", reset);
  listen(root, "focusout", (event) => {
    if (!root.contains(event.relatedTarget)) reset();
  });
  listen(viewport, "wheel", (event) => {
    if (event.defaultPrevented) return;
    if (drawing || pointers.size) {
      event.preventDefault();
      return;
    }
    const unit2 = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? view.height : 1;
    const dx = event.deltaX * unit2, dy = event.deltaY * unit2;
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
    event.preventDefault();
    if (event.ctrlKey || event.metaKey) view.zoomAt(view.get().zoom * Math.exp(-Math.max(-1e3, Math.min(1e3, dy)) * 2e-3), local(event));
    else view.panBy(-dx, -dy);
  }, { passive: false });
  listen(root, "keydown", (event) => {
    if (event.defaultPrevented || event.target.closest('.etch-shape-menu,.etch-export-menu,input,textarea,select,dialog[open],[contenteditable]:not([contenteditable="false"])')) return;
    if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === "a" && tools.getTool() === "select") {
      const layer = state.document.layers.find((l) => l.id === state.getActiveLayer());
      if (!state.readOnly && !state.busy && layer.visible && !layer.locked) {
        event.preventDefault();
        cancel();
        state.setSelection(layer.elements.map((e) => e.id));
      }
      return;
    }
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    switch (event.key.toLowerCase()) {
      case "+":
      case "=":
        event.preventDefault();
        cancel();
        view.zoomAt(view.get().zoom * 1.2);
        break;
      case "-":
        event.preventDefault();
        cancel();
        view.zoomAt(view.get().zoom / 1.2);
        break;
      case "0":
        event.preventDefault();
        fit();
        break;
      case "1":
        event.preventDefault();
        cancel();
        view.zoomAt(1);
        break;
      case "h":
        event.preventDefault();
        setTool("hand");
        break;
      case "v":
      case "p":
      case "b":
      case "k":
      case "e":
      case "l":
      case "a":
      case "r":
      case "o":
      case "m": {
        const layer = state.document.layers.find((l) => l.id === state.getActiveLayer());
        const tool = { v: "select", p: "pen", b: "pen", k: "highlighter", e: "eraser", l: "line", a: "arrow", r: "rect", o: "ellipse", m: "move-layer" }[event.key.toLowerCase()];
        if (!state.readOnly && !state.busy && layer.visible && !layer.locked) {
          event.preventDefault();
          setTool(tool);
        }
        break;
      }
      case "arrowleft":
      case "arrowright":
      case "arrowup":
      case "arrowdown": {
        const layer = state.document.layers.find((l) => l.id === state.getActiveLayer());
        if (tools.getTool() === "select" && state.getSelection().length && !state.readOnly && !state.busy && layer.visible && !layer.locked) {
          event.preventDefault();
          cancel();
          const step = event.shiftKey ? 10 : 1;
          const direction = { arrowleft: [-1, 0], arrowright: [1, 0], arrowup: [0, -1], arrowdown: [0, 1] }[event.key.toLowerCase()];
          state.commitSelectionMove(state.prepareSelectionMove(), direction.map((n) => n * step));
        }
        break;
      }
      case "shift":
        if (drawing?.input.setConstrained) {
          drawing.input.setConstrained(true);
          renderer.invalidate();
        }
        break;
      case " ":
        if (event.target === viewport || event.target === root) {
          event.preventDefault();
          if (!space) {
            cancel();
            space = true;
            viewport.classList.add("etch-temporary-hand");
            refreshCursor();
          }
        }
        break;
      case "delete":
      case "backspace":
        if (state.getSelection().length && !state.readOnly && !state.busy) {
          event.preventDefault();
          cancel();
          state.deleteSelection();
        }
        break;
      case "escape": {
        const active = Boolean(drawing || pointers.size);
        cancel();
        if (!active) state.setSelection([]);
        break;
      }
    }
  });
  listen(window, "keyup", (event) => {
    if (event.key === " " && space) {
      space = false;
      viewport.classList.remove("etch-temporary-hand");
      refreshCursor();
    }
    if (event.key === "Shift" && drawing?.input.setConstrained) {
      drawing.input.setConstrained(false);
      renderer.invalidate();
    }
  });
  listen(viewport, "dragstart", (event) => event.preventDefault());
  for (const name of ["contextmenu", "selectstart"]) listen(viewport, name, (event) => {
    if (!event.target.closest?.("button,input,select,textarea,a[href],[contenteditable]")) event.preventDefault();
  });
  const removeGestureGuard = installGestureGuard(root, () => view.get().expanded);
  return { cancel, refreshCursor, destroy() {
    if (destroyed) return;
    reset();
    destroyed = true;
    removeGestureGuard();
    cursor.remove();
    for (const off of listeners) off();
  } };
}

// src/etch/image-import.js
var cancelled = (signal) => {
  if (signal.aborted) fail("CANCELLED", "Image import cancelled");
};
function reusablePNG(bytes) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = false;
  for (let i = 8; i < bytes.length; ) {
    if (i + 12 > bytes.length) return false;
    const length = v.getUint32(i), type = String.fromCharCode(...bytes.subarray(i + 4, i + 8));
    if (i + 12 + length > bytes.length || ["acTL", "fcTL", "fdAT", "eXIf"].includes(type)) return false;
    i += 12 + length;
    if (type === "IEND") {
      end = i === bytes.length;
      break;
    }
  }
  return end;
}
async function prepareRaster(blob, context, doc, { thumbnail = false } = {}) {
  const { signal, limits, retained } = context;
  let source, canvas, releasePixels, disposed = false, encoding = false;
  const release = () => {
    releasePixels?.();
    releasePixels = null;
  };
  const close = () => {
    disposed = true;
    source?.close();
    source = null;
    if (canvas) {
      canvas.width = canvas.height = 0;
      canvas = null;
    }
    if (!encoding) release();
  };
  try {
    cancelled(signal);
    if (!blob || !Number.isSafeInteger(blob.size) || blob.size < 1 || typeof blob.arrayBuffer !== "function") fail("INVALID_ARGUMENT", "Choose a non-empty PNG, JPEG or WebP file/blob");
    if (blob.size > MAX_IMAGE_BYTES) fail("LIMIT_EXCEEDED", "Image files must be at most 20 MiB", { limit: "imageBytes", maximum: MAX_IMAGE_BYTES });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    cancelled(signal);
    if (bytes.length !== blob.size || bytes.length > MAX_IMAGE_BYTES) fail("LIMIT_EXCEEDED", "Image byte length exceeds its declared limit", { limit: "imageBytes", maximum: MAX_IMAGE_BYTES });
    const info = inspectRaster(bytes, { allowAnimation: false }), originalPNG = info.mime === "image/png" && reusablePNG(bytes) ? new Blob([bytes], { type: "image/png" }) : null, thumb = (w, h) => {
      const r = Math.min(1, 240 / w, 160 / h);
      return Math.max(1, Math.round(w * r)) * Math.max(1, Math.round(h * r));
    };
    const extraPixels = thumbnail ? Math.max(thumb(info.width, info.height), thumb(info.height, info.width)) : 0;
    checkImageSize(info, limits, retained.pixels, extraPixels);
    releasePixels = context.reservePixels(2 * info.width * info.height + extraPixels);
    source = await decodeImageBlob(new Blob([bytes], { type: info.mime }), signal);
    cancelled(signal);
    const width2 = source.image.naturalWidth ?? source.image.width, height = source.image.naturalHeight ?? source.image.height;
    if (!(width2 === info.width && height === info.height || width2 === info.height && height === info.width)) fail("DECODE_FAILED", "Decoded image dimensions disagree with its header");
    checkImageSize({ width: width2, height }, limits, retained.pixels, extraPixels);
    canvas = doc.createElement("canvas");
    canvas.width = width2;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) fail("DECODE_FAILED", "Canvas image conversion is unavailable");
    ctx.drawImage(source.image, 0, 0);
    source.close();
    source = null;
    return {
      width: width2,
      height,
      originalBytes: bytes.length,
      name: typeof blob.name === "string" ? blob.name.replace(/\.[^.]*$/, "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 80) || "Image" : "Image",
      close,
      async encode(options) {
        const { format, quality } = imageOptions(options);
        cancelled(signal);
        if (disposed) fail("CANCELLED", "Image source disposed");
        if (encoding) fail("BUSY", "Image encoding is already pending");
        encoding = true;
        let resource;
        try {
          const mime = `image/${format}`, encoded = format === "png" && originalPNG ? originalPNG : await new Promise((resolve, reject) => {
            try {
              canvas.toBlob((value2) => value2 ? resolve(value2) : reject(new EtchError("DECODE_FAILED", "Browser could not encode image")), mime, quality);
            } catch (error) {
              reject(error);
            }
          });
          cancelled(signal);
          if (disposed) fail("CANCELLED", "Image source disposed");
          if (encoded.type !== mime) fail("INVALID_ARGUMENT", "This browser cannot encode WebP; choose PNG \u2014 lossless", { encoder: "webp", supported: false });
          const maximum = limits.assetBytes - retained.bytes;
          if (encoded.size > maximum) fail("LIMIT_EXCEEDED", "Encoded image exceeds asset byte allowance, including Undo history", { limit: "assetBytes", maximum, actual: encoded.size });
          const data = new Uint8Array(await encoded.arrayBuffer());
          cancelled(signal);
          const header = inspectRaster(data, { allowJPEG: false, allowAnimation: false });
          if (header.mime !== mime || header.width !== width2 || header.height !== height) fail("DECODE_FAILED", "Encoded image dimensions/type disagree");
          resource = await decodeImageBlob(encoded, signal);
          cancelled(signal);
          const asset = { id: createId(), mime, width: width2, height, data: base64FromBytes(data) };
          return { asset, resource, bytes: encoded.size };
        } catch (error) {
          resource?.close();
          if (signal.aborted || disposed) fail("CANCELLED", "Image import cancelled");
          if (error instanceof EtchError) throw error;
          fail("DECODE_FAILED", "Could not convert image");
        } finally {
          encoding = false;
          if (disposed) release();
        }
      }
    };
  } catch (error) {
    close();
    if (signal.aborted) fail("CANCELLED", "Image import cancelled");
    if (error instanceof EtchError) throw error;
    fail("DECODE_FAILED", "Could not prepare image");
  }
}

// src/etch/png-export.js
var finite2 = (n) => typeof n === "number" && Number.isFinite(n);
var object3 = (value2) => value2 && typeof value2 === "object" && !Array.isArray(value2);
function planPNG(document, options = {}, limits = { rasterDimension: 8192, assetPixels: 16777216 }, availablePixels = 33554432) {
  if (!object3(options) || Object.keys(options).some((k) => !["bounds", "padding", "scale"].includes(k))) fail("INVALID_ARGUMENT", "PNG options accept bounds, padding and scale only");
  const { padding = 16, scale: scale2 = 1 } = options;
  if (!finite2(padding) || padding < 0 || !finite2(scale2) || scale2 <= 0) fail("INVALID_ARGUMENT", "PNG padding must be non-negative and scale must be positive finite numbers");
  const bounds = exportBounds(document, { padding, bounds: options.bounds });
  const maximumDimension = Math.min(8192, limits.rasterDimension), maximumPixels = Math.max(0, Math.min(16777216, limits.assetPixels, Math.floor(availablePixels / 2)));
  const dimensions = (s) => [Math.max(1, Math.ceil(bounds.width * s)), Math.max(1, Math.ceil(bounds.height * s))];
  const fits = (s) => {
    const [w, h] = dimensions(s);
    return w <= maximumDimension && h <= maximumDimension && w * h <= maximumPixels;
  };
  if (!fits(scale2)) {
    let lo = 0, hi = Math.min(scale2, maximumDimension / bounds.width, maximumDimension / bounds.height, Math.sqrt(maximumPixels) / Math.sqrt(bounds.width) / Math.sqrt(bounds.height));
    if (maximumPixels >= 1) for (let i = 0; i < 64; i++) {
      const mid = lo + (hi - lo) / 2;
      if (fits(mid)) lo = mid;
      else hi = mid;
    }
    fail("EXPORT_TOO_LARGE", "PNG exceeds available raster limits; reduce scale/bounds or wait for pending raster operations", { maximumDimension, maximumPixels, suggestedScale: lo });
  }
  const [width2, height] = dimensions(scale2), pan = [-bounds.x * scale2, -bounds.y * scale2];
  if (!pan.every(finite2)) fail("INVALID_ARGUMENT", "Export coordinates overflow the output transform");
  return { bounds, width: width2, height, pixels: width2 * height, view: { zoom: scale2, pan } };
}
function createPNGExporter(doc, state) {
  const jobs = /* @__PURE__ */ new Set();
  let destroyed = false;
  function dispose(job) {
    if (!jobs.delete(job)) return;
    try {
      job.canvas.width = job.canvas.height = 0;
    } finally {
      job.release();
    }
  }
  return {
    async exportPNG(options) {
      let captured = state.captureExport();
      const revision = captured.revision;
      if (destroyed) fail("DESTROYED", "This editor has been destroyed");
      if (jobs.size >= 4) fail("BUSY", "At most four PNG exports may encode concurrently");
      const plan = planPNG(captured.document, options, captured.limits, captured.availablePixels);
      const release = state.reserveRasterPixels(2 * plan.pixels);
      let job;
      try {
        const canvas = doc.createElement("canvas");
        job = { canvas, release, reject: null };
        jobs.add(job);
        canvas.width = plan.width;
        canvas.height = plan.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) fail("EXPORT_TOO_LARGE", "Could not allocate PNG canvas; use a lower scale", { suggestedScale: plan.view.zoom / 2 });
        const cache = new PathCache(doc.defaultView.Path2D, { maxSegments: 0, maxEntries: 0 });
        renderScene(ctx, captured.document, { width: plan.width, height: plan.height, view: plan.view, assets: captured.assets, cache });
        captured = null;
        if (destroyed) fail("CANCELLED", "PNG export cancelled by destruction");
        const result = await new Promise((resolve, reject) => {
          job.reject = reject;
          try {
            canvas.toBlob((blob) => {
              if (!jobs.has(job)) return;
              if (!blob || blob.type !== "image/png") reject(new EtchError("DECODE_FAILED", "Browser could not encode PNG; try a smaller export"));
              else resolve({ blob, revision });
            }, "image/png");
          } catch {
            reject(new EtchError("DECODE_FAILED", "Could not encode PNG; check browser canvas/image support"));
          }
        });
        if (destroyed) fail("CANCELLED", "PNG export cancelled by destruction");
        return result;
      } catch (error) {
        if (error instanceof EtchError) throw error;
        fail("DECODE_FAILED", "Could not render PNG; check browser canvas/image support");
      } finally {
        if (job) dispose(job);
        else release();
      }
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      for (const job of [...jobs]) {
        job.reject?.(new EtchError("CANCELLED", "PNG export cancelled by destruction"));
        dispose(job);
      }
    }
  };
}

// src/etch/svg-export.js
var MAX_SVG_BYTES = 128 * 1024 * 1024;
var arity = { M: 2, L: 2, Q: 4, C: 6, Z: 0 };
var number2 = (n) => {
  if (typeof n !== "number" || !Number.isFinite(n)) fail("INVALID_DOCUMENT", "SVG geometry must be finite");
  return String(n);
};
var numbers = (values) => values.map(number2).join(" ");
function escapeXML(value2) {
  const entities = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" };
  return String(value2).replace(/[&<>"'\u0000-\u001f\u007f-\u{10ffff}]/gu, (c) => {
    if (entities[c]) return entities[c];
    const n = c.codePointAt(0);
    if (!(n === 9 || n === 10 || n === 13 || n >= 32 && n <= 55295 || n >= 57344 && n <= 65533 || n >= 65536 && n <= 1114111)) fail("INVALID_DOCUMENT", "Invalid XML character");
    return `&#${n};`;
  });
}
var Writer = class {
  #chunks = [];
  #buffer = "";
  #bytes = 0;
  constructor(maximum) {
    this.maximum = maximum;
  }
  check(size) {
    if (size > this.maximum - this.#bytes) fail("EXPORT_TOO_LARGE", "SVG exceeds its text-size safety limit; reduce visible content or use PNG", { limit: "svgBytes", maximum: this.maximum });
  }
  append(text2) {
    this.check(text2.length);
    this.#bytes += text2.length;
    for (let i = 0; i < text2.length; ) {
      const size = Math.min(16384 - this.#buffer.length, text2.length - i);
      this.#buffer += text2.slice(i, i + size);
      i += size;
      if (this.#buffer.length === 16384) {
        this.#chunks.push(this.#buffer);
        this.#buffer = "";
      }
    }
  }
  escaped(value2) {
    const text2 = String(value2);
    this.check(text2.length);
    if (text2.length <= 4096) {
      this.append(escapeXML(text2));
      return;
    }
    for (let i = 0; i < text2.length; i += 4096) this.append(escapeXML(text2.slice(i, i + 4096)));
  }
  attr(name, value2) {
    this.append(` ${name}="`);
    this.escaped(value2);
    this.append('"');
  }
  finish() {
    this.#chunks.push(this.#buffer);
    return this.#chunks.join("");
  }
};
function paint(value2) {
  if (value2 === null) return "none";
  if (typeof value2 !== "string" || !/^#[0-9a-f]{6}$/i.test(value2)) fail("INVALID_DOCUMENT", "SVG paint must be opaque hex or null");
  return value2;
}
function choice2(value2, allowed) {
  if (!allowed.includes(value2)) fail("INVALID_DOCUMENT", "Unsupported SVG presentation value");
  return value2;
}
function serializeSVG(document, options = {}, overrides = {}) {
  if (!options || typeof options !== "object" || Array.isArray(options) || Object.keys(options).some((k) => !["bounds", "padding"].includes(k))) fail("INVALID_ARGUMENT", "SVG options accept bounds and padding only");
  const limits = resolveLimits(overrides), bounds = exportBounds(document, options);
  const w = new Writer(Math.min(MAX_SVG_BYTES, limits.jsonBytes));
  const assets = new Map(document.assets.map((asset) => [asset.id, asset]));
  let total = 0, elementCount = 0;
  function account(count) {
    total += count;
    elementCount += count;
    if (total > limits.derivedSegments || elementCount > limits.derivedSegmentsPerElement) {
      const limit4 = total > limits.derivedSegments ? "derivedSegments" : "derivedSegmentsPerElement";
      fail("EXPORT_TOO_LARGE", "SVG exceeds its geometry safety limit", { limit: limit4, maximum: limits[limit4] });
    }
  }
  function command(c) {
    if (!Object.hasOwn(arity, c[0]) || c.length !== arity[c[0]] + 1) fail("INVALID_DOCUMENT", "Invalid native path command");
    account(1);
    w.append(c[0] + numbers(c.slice(1)) + " ");
  }
  function presentation(e, outline = false) {
    w.attr("fill", paint(outline ? e.color : e.type === "line" ? null : e.fill));
    w.attr("fill-rule", outline ? "nonzero" : choice2(e.fillRule ?? "nonzero", ["nonzero", "evenodd"]));
    w.attr("stroke", outline ? "none" : paint(e.stroke));
    if (!outline && e.stroke !== null) {
      w.attr("stroke-width", number2(e.strokeWidth));
      w.attr("stroke-linecap", choice2(e.lineCap ?? "butt", ["butt", "round", "square"]));
      w.attr("stroke-linejoin", choice2(e.lineJoin ?? "round", ["miter", "round", "bevel"]));
      w.attr("stroke-miterlimit", number2(e.miterLimit ?? 4));
    }
  }
  w.append('<svg xmlns="http://www.w3.org/2000/svg"');
  w.attr("width", number2(bounds.width));
  w.attr("height", number2(bounds.height));
  w.attr("viewBox", numbers([bounds.x, bounds.y, bounds.width, bounds.height]));
  w.append(' overflow="hidden">');
  if (document.background !== null) {
    const paper = typeof document.background === "object" ? paperGrid(normalizeBackground(document.background)) : null;
    if (paper) {
      const bands = paperBands(document.background, { width: paper.size, height: paper.size, scale: 1, pan: [-bounds.x, -bounds.y] }).bands;
      w.append('<defs><pattern id="etch-paper" patternUnits="userSpaceOnUse"');
      w.attr("x", number2(bounds.x));
      w.attr("y", number2(bounds.y));
      w.attr("width", number2(paper.size));
      w.attr("height", number2(paper.size));
      w.attr("viewBox", numbers([0, 0, paper.size, paper.size]));
      w.append(">");
      w.append('<rect x="0" y="0"');
      w.attr("width", number2(paper.size));
      w.attr("height", number2(paper.size));
      w.attr("fill", paper.color);
      w.append("/>");
      if (paper.dots) {
        const [x, y] = bands;
        for (let i = 0; i < x.count; i++) for (let j = 0; j < y.count; j++) {
          w.append("<circle");
          w.attr("cx", number2(x.start + i * x.step));
          w.attr("cy", number2(y.start + j * y.step));
          w.attr("r", "1");
          w.attr("fill", x.color);
          w.append("/>");
        }
      } else for (const group of paper.groups) {
        const commands = [];
        for (const band of bands.filter((b) => b.color === group.color)) for (let i = 0; i < band.count; i++) {
          const p = band.start + i * band.step;
          commands.push(band.axis === 0 ? `M${number2(p)} 0V${number2(paper.size)}` : `M0 ${number2(p)}H${number2(paper.size)}`);
        }
        w.append("<path");
        w.attr("d", commands.join(" "));
        w.attr("fill", "none");
        w.attr("stroke", group.color);
        w.attr("stroke-width", number2(group.width));
        w.append("/>");
      }
      w.append("</pattern></defs>");
    }
    w.append("<rect");
    for (const key of ["x", "y", "width", "height"]) w.attr(key, number2(bounds[key]));
    w.attr("fill", paper ? "url(#etch-paper)" : paint(document.background));
    w.append(' stroke="none"/>');
  }
  for (const layer of document.layers) {
    if (!layer.visible) continue;
    w.append("<g");
    w.attr("transform", `translate(${numbers(layer.offset)})`);
    w.append(">");
    for (const e of layer.elements) {
      elementCount = 0;
      const type = ["stroke", "highlight", "ink", "path"].includes(e.type) ? "path" : e.type;
      if (!["path", "line", "rect", "ellipse", "image"].includes(type)) fail("INVALID_DOCUMENT", "Unknown native element type");
      w.append(`<${type}`);
      w.attr("transform", `matrix(${numbers(e.transform)})`);
      if (e.type === "highlight") w.attr("opacity", number2(e.opacity));
      if (type === "path") {
        presentation(e, e.type !== "path");
        w.append(' d="');
        if (e.type === "stroke" || e.type === "highlight") visitStrokeOutline(e, command);
        else if (e.type === "ink") {
          for (const part of e.parts) for (const c of part) command(c);
        } else for (const c of e.commands) command(c);
        w.append('"');
      } else if (type === "image") {
        const asset = assets.get(e.assetId);
        if (!asset || !["image/png", "image/webp"].includes(asset.mime) || typeof asset.data !== "string") fail("INVALID_DOCUMENT", "SVG image asset is missing or unsupported");
        for (const key of ["x", "y", "width", "height"]) w.attr(key, number2(e[key]));
        w.append(' preserveAspectRatio="none" href="data:');
        w.escaped(asset.mime);
        w.append(";base64,");
        w.escaped(asset.data);
        w.append('"');
      } else {
        presentation(e);
        if (type === "line") {
          account(2);
          for (const [key, value2] of [["x1", e.start[0]], ["y1", e.start[1]], ["x2", e.end[0]], ["y2", e.end[1]]]) w.attr(key, number2(value2));
        } else {
          account(type === "rect" ? 5 : 4);
          for (const key of type === "rect" ? ["x", "y", "width", "height"] : ["cx", "cy", "rx", "ry"]) w.attr(key, number2(e[key]));
        }
      }
      w.append("/>");
    }
    w.append("</g>");
  }
  w.append("</svg>");
  return w.finish();
}

// src/etch/import/svg-xml.js
var SVG = "http://www.w3.org/2000/svg";
var XML = "http://www.w3.org/XML/1998/namespace";
var XMLNS = "http://www.w3.org/2000/xmlns/";
var XLINK = "http://www.w3.org/1999/xlink";
var ACTIVE_NAMESPACES = /* @__PURE__ */ new Set(["http://www.w3.org/1999/xhtml", "http://www.w3.org/1998/Math/MathML", "http://www.w3.org/1999/XSL/Transform", "http://www.w3.org/2001/xml-events"]);
var EDITORS = /* @__PURE__ */ new Set(["http://www.inkscape.org/namespaces/inkscape", "http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd", "http://ns.adobe.com/AdobeIllustrator/10.0/"]);
var BLOCKED = /* @__PURE__ */ new Set(["script", "foreignobject", "iframe", "object", "embed", "link", "base", "animate", "animatemotion", "animatetransform", "animatecolor", "animation", "set", "discard", "handler", "listener", "meta", "audio", "video"]);
var VECTOR = /* @__PURE__ */ new Set(["svg", "g", "path", "line", "rect", "circle", "ellipse", "polyline", "polygon"]);
var INERT = /* @__PURE__ */ new Set(["defs", "metadata", "title", "desc"]);
var PRESENTATION = /* @__PURE__ */ new Set(["fill", "stroke", "color", "fill-rule", "stroke-width", "stroke-linecap", "stroke-linejoin", "stroke-miterlimit", "display", "visibility", "opacity", "fill-opacity", "stroke-opacity", "stroke-dasharray", "stroke-dashoffset", "clip-path", "mask", "filter", "vector-effect", "paint-order", "mix-blend-mode", "isolation", "marker-start", "marker-mid", "marker-end", "overflow", "shape-rendering", "color-rendering", "text-rendering", "image-rendering"]);
var DECORATIVE = /* @__PURE__ */ new Set(["font-family", "font-size", "font-weight", "font-style", "font-stretch", "font-variant", "text-anchor", "letter-spacing", "word-spacing", "line-height", "enable-background"]);
var decorative = (name) => DECORATIVE.has(name) || name === "font" || name.startsWith("font-") || name.startsWith("-inkscape-font-");
var GEOMETRY = {
  svg: ["width", "height", "viewBox", "preserveAspectRatio", "x", "y", "version", "baseProfile"],
  g: [],
  path: ["d", "pathLength"],
  line: ["x1", "y1", "x2", "y2"],
  rect: ["x", "y", "width", "height", "rx", "ry"],
  circle: ["cx", "cy", "r"],
  ellipse: ["cx", "cy", "rx", "ry"],
  polyline: ["points"],
  polygon: ["points"]
};
var DEFAULTS = { maxBytes: 5 * 1024 * 1024, maxElements: 2e4, maxDepth: 64, maxNodes: 1e5, maxAttributes: 1e5, maxAttributesPerElement: 256, maxRules: 2e4, maxCSSItems: 1e5 };
var encoder2 = new TextEncoder();
function unsafe(reason) {
  fail("UNSAFE_SVG", reason);
}
function invalid2(reason) {
  fail("INVALID_SVG", reason);
}
function exceeded(limit4, maximum) {
  fail("LIMIT_EXCEEDED", "SVG XML safety limit exceeded", { limit: limit4, maximum });
}
function preflightSVGXML(source, maxBytes = DEFAULTS.maxBytes) {
  if (typeof source !== "string" || !Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > DEFAULTS.maxBytes) fail("INVALID_ARGUMENT", "Invalid SVG XML input or byte limit");
  if (source.length > maxBytes) exceeded("svgBytes", maxBytes);
  const bytes = encoder2.encode(source).byteLength;
  if (bytes > maxBytes) exceeded("svgBytes", maxBytes);
  let cursor = 0;
  while ((cursor = source.indexOf("<", cursor)) !== -1) {
    if (source.startsWith("<!--", cursor) || source.startsWith("<![CDATA[", cursor)) {
      const comment = source.startsWith("<!--", cursor), end = source.indexOf(comment ? "-->" : "]]>", cursor + (comment ? 4 : 9));
      if (end < 0) invalid2("Unterminated XML comment or CDATA");
      cursor = end + 3;
      continue;
    }
    if (source.startsWith("<!", cursor)) unsafe("SVG document declarations and entities are not allowed");
    if (source.startsWith("<?", cursor)) {
      const declaration = (cursor === 0 || cursor === 1 && source[0] === "\uFEFF") && /^<\?xml[\t\r\n ]/.test(source.slice(cursor, cursor + 7));
      if (!declaration) unsafe("SVG processing instructions and external stylesheets are not allowed");
      const end = source.indexOf("?>", cursor + 2);
      if (end < 0) invalid2("Unterminated XML declaration");
      cursor = end + 2;
      continue;
    }
    cursor++;
  }
  return bytes;
}
function cssSecurity(value2, feature) {
  let text2 = "", i = 0, quote = null;
  while (i < value2.length) {
    if (!quote && value2.startsWith("/*", i)) {
      const end = value2.indexOf("*/", i + 2);
      if (end < 0) invalid2("Unterminated CSS comment");
      i = end + 2;
      continue;
    }
    const c = value2[i++];
    if (quote && /[\n\r\f]/.test(c)) invalid2("CSS strings cannot contain unescaped newlines");
    text2 += c;
    if (c === quote) quote = null;
    else if (!quote && (c === '"' || c === "'")) quote = c;
  }
  if (quote) invalid2("Unterminated CSS string");
  if (text2.includes("\\") || /@import\b|expression\s*\(|(?:^|[;\s])(?:behavior|-moz-binding)\s*:/i.test(text2)) unsafe("SVG escaped or executable CSS is not supported safely");
  quote = null;
  for (let pos = 0; pos < text2.length; pos++) {
    const c = text2[pos];
    if (quote) {
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      continue;
    }
    if (text2.slice(pos, pos + 3).toLowerCase() !== "url" || /[-\w]/.test(text2[pos - 1] ?? "")) continue;
    let start = pos + 3;
    while (/\s/.test(text2[start] ?? "")) start++;
    if (text2[start] !== "(") continue;
    start++;
    while (/\s/.test(text2[start] ?? "")) start++;
    const delimiter = text2[start] === '"' || text2[start] === "'" ? text2[start++] : null;
    const end = text2.indexOf(delimiter ?? ")", start);
    if (end < 0) invalid2("Unterminated SVG resource reference");
    const ref = text2.slice(start, end).trim();
    let close = end;
    if (delimiter) {
      close++;
      while (/\s/.test(text2[close] ?? "")) close++;
      if (text2[close] !== ")") invalid2("Invalid SVG resource reference");
    }
    if (!ref.startsWith("#") || ref.length === 1 || /\s/.test(ref)) unsafe("SVG external or embedded resources are not allowed; use a plain vector SVG, native JSON or PNG");
    feature("localResource");
    pos = close;
  }
  return text2;
}
function* delimited(text2, separator) {
  let start = 0, quote = null, depth = 0;
  for (let i = 0; i < text2.length; i++) {
    const c = text2[i];
    if (quote) {
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      continue;
    }
    if (c === "(") depth++;
    else if (c === ")") depth = Math.max(0, depth - 1);
    if (c === separator && !depth) {
      yield text2.slice(start, i);
      start = i + 1;
    }
  }
  yield text2.slice(start);
}
function declarations(text2, feature, account) {
  const result = /* @__PURE__ */ Object.create(null), important = /* @__PURE__ */ new Set(), entries2 = [];
  for (const entry of delimited(text2, ";")) {
    if (!entry.trim()) continue;
    account();
    const colon = entry.indexOf(":");
    if (colon < 1) {
      feature("cssDeclaration");
      continue;
    }
    const name = entry.slice(0, colon).trim().toLowerCase();
    let value2 = entry.slice(colon + 1).trim();
    const priority = /![\t\r\n ]*important\s*$/i.test(value2);
    if (priority) value2 = value2.replace(/![\t\r\n ]*important\s*$/i, "").trim();
    if (!value2) {
      feature("cssDeclaration");
      continue;
    }
    if (decorative(name)) continue;
    if (!PRESENTATION.has(name)) {
      feature("cssProperty");
      continue;
    }
    entries2.push({ name, value: value2, important: priority });
    if (!important.has(name) || priority) result[name] = value2;
    if (priority) important.add(name);
  }
  return { values: result, important: [...important], entries: entries2 };
}
var identifier = /^[-_a-zA-Z\u0080-\uffff][-\w\u0080-\uffff]*$/u;
function stylesheet(text2, feature, rules, limits, account) {
  let cursor = 0;
  while (cursor < text2.length) {
    while (/\s/.test(text2[cursor] ?? "") && cursor < text2.length) cursor++;
    if (cursor === text2.length) break;
    const open = text2.indexOf("{", cursor), close = text2.indexOf("}", open + 1);
    if (open < 0 || close < 0 || text2.indexOf("{", open + 1) >= 0 && text2.indexOf("{", open + 1) < close) {
      feature("cssRule");
      return;
    }
    const selectors = [];
    for (const raw of delimited(text2.slice(cursor, open), ",")) {
      account();
      const value2 = raw.trim(), prefix = value2[0], name = prefix === "." || prefix === "#" ? value2.slice(1) : value2;
      if (!identifier.test(name)) feature("cssSelector");
      else selectors.push({ kind: prefix === "." ? "class" : prefix === "#" ? "id" : "tag", name });
    }
    if (rules.length >= limits.maxRules) exceeded("svgRules", limits.maxRules);
    rules.push({ selectors, declarations: declarations(text2.slice(open + 1, close), feature, account) });
    cursor = close + 1;
  }
}
function* walkXML(root) {
  let node = root, depth = 0;
  while (node) {
    yield { node, depth };
    if (node.firstChild) {
      node = node.firstChild;
      depth += node.nodeType === 1 ? 1 : 0;
      continue;
    }
    while (node && !node.nextSibling) {
      depth -= node.nodeType === 1 ? 1 : 0;
      node = node.parentNode;
    }
    if (node) {
      depth -= node.nodeType === 1 ? 1 : 0;
      node = node.nextSibling;
      depth += node.nodeType === 1 ? 1 : 0;
    }
  }
}
function inspect(source, options = {}, deferAppearance = false) {
  if (!options || typeof options !== "object" || Array.isArray(options) || Object.keys(options).some((k) => ![...Object.keys(DEFAULTS), "DOMParser"].includes(k))) fail("INVALID_ARGUMENT", "Invalid SVG XML options");
  const limits = { ...DEFAULTS };
  for (const key of Object.keys(DEFAULTS)) if (options[key] !== void 0) {
    if (!Number.isSafeInteger(options[key]) || options[key] < 1 || options[key] > limits[key]) fail("INVALID_ARGUMENT", "SVG limits must be positive downward integers", { limit: key });
    limits[key] = options[key];
  }
  const bytes = preflightSVGXML(source, limits.maxBytes);
  const Parser = options.DOMParser ?? globalThis.DOMParser;
  if (typeof Parser !== "function") fail("INVALID_ARGUMENT", "SVG inspection requires a browser XML DOMParser");
  const doc = new Parser().parseFromString(source, "image/svg+xml"), root = doc.documentElement;
  if (!root || root.localName === "parsererror" || ["http://www.mozilla.org/newlayout/xml/parsererror.xml", "http://www.w3.org/1999/xhtml"].some((ns) => doc.getElementsByTagNameNS(ns, "parsererror").length)) invalid2("SVG XML is not well formed");
  const inferred = root.namespaceURI === null && root.prefix === null && !root.hasAttribute("xmlns");
  if (root.localName !== "svg" || root.namespaceURI !== SVG && !inferred) invalid2("Expected an SVG namespace document root");
  const isSVG = (node) => node.namespaceURI === SVG || inferred && node.namespaceURI === null && node.prefix === null;
  const features = /* @__PURE__ */ new Map(), ids = /* @__PURE__ */ new Set(), rules = [];
  let elements = 0, nodes = 0, attributes = 0, cssItems = 0;
  const cssItem = () => {
    if (++cssItems > limits.maxCSSItems) exceeded("svgCSSItems", limits.maxCSSItems);
  };
  const feature = (kind, el) => {
    if (!features.has(kind)) features.set(kind, { feature: kind, element: el.localName.slice(0, 64) });
  };
  for (const { node, depth } of walkXML(doc)) {
    if (++nodes > limits.maxNodes) exceeded("svgNodes", limits.maxNodes);
    if (node.nodeType === 7 || node.nodeType === 10 || node.nodeType === 5) unsafe("SVG processing instructions and declarations are not allowed");
    if (node.nodeType === 1) {
      if (++elements > limits.maxElements) exceeded("svgElements", limits.maxElements);
      if (depth > limits.maxDepth) exceeded("svgDepth", limits.maxDepth);
      if (ACTIVE_NAMESPACES.has(node.namespaceURI) || node.localName.toLowerCase() === "style" && !isSVG(node)) unsafe("SVG embedded active namespaces are not allowed");
      if (BLOCKED.has(node.localName.toLowerCase())) unsafe("SVG executable or embedded document content is not allowed");
      if (node.attributes.length > limits.maxAttributesPerElement) exceeded("svgAttributesPerElement", limits.maxAttributesPerElement);
      for (const attr of node.attributes) {
        if (++attributes > limits.maxAttributes) exceeded("svgAttributes", limits.maxAttributes);
        if (attr.namespaceURI === XMLNS) continue;
        if (ACTIVE_NAMESPACES.has(attr.namespaceURI)) unsafe("SVG active namespace attributes are not allowed");
        if (/^on/i.test(attr.localName) || attr.namespaceURI === XML && attr.localName === "base") unsafe("SVG event handlers and base URLs are not allowed");
        if (attr.localName === "href" || attr.localName === "src") {
          const value2 = attr.value.trim();
          if (!value2.startsWith("#") || value2.length === 1 || /\s/.test(value2)) unsafe("SVG external or embedded resources are not allowed; use a plain vector SVG, native JSON or PNG");
        }
        if (!attr.namespaceURI && (attr.name === "style" || PRESENTATION.has(attr.localName))) cssSecurity(attr.value, () => {
        });
        if (!attr.namespaceURI && attr.localName === "id") {
          if (ids.has(attr.value)) invalid2("SVG IDs must be unique");
          ids.add(attr.value);
        }
      }
      if (isSVG(node) && node.localName === "style") {
        if (node.children.length) invalid2("SVG style elements must contain CSS text only");
        cssSecurity(node.textContent, () => {
        });
      }
    }
  }
  const work = [{ node: root, parent: null, inert: false, metadata: false }];
  let tree;
  while (work.length) {
    const { node, parent, inert, metadata } = work.pop(), name = node.localName, svg = isSVG(node);
    const descriptive = metadata || svg && ["metadata", "title", "desc"].includes(name) || !svg && EDITORS.has(node.namespaceURI);
    const ignored = inert || svg && INERT.has(name) || !svg && EDITORS.has(node.namespaceURI);
    const pending = [];
    const addFeature = (kind) => feature(kind, node);
    const appearance = (kind) => {
      if (!deferAppearance) addFeature(kind);
      else if (kind !== "localResource") pending.push(kind);
    };
    if (svg && name === "style") {
      if (descriptive) addFeature("stylesheetInMetadata");
      if (node.children.length) invalid2("SVG style elements must contain CSS text only");
      for (const attr of node.attributes) {
        if (attr.namespaceURI === XMLNS || attr.namespaceURI === XML || EDITORS.has(attr.namespaceURI) || ["id", "type", "media", "title"].includes(attr.name)) continue;
        addFeature("stylesheetAttribute");
      }
      if (node.hasAttribute("type") && node.getAttribute("type").trim().toLowerCase() !== "text/css") addFeature("stylesheetType");
      if (node.hasAttribute("media") && !["", "all"].includes(node.getAttribute("media").trim().toLowerCase())) addFeature("stylesheetMedia");
      stylesheet(cssSecurity(node.textContent, (kind) => {
        if (!deferAppearance || kind !== "localResource") addFeature(kind);
      }), addFeature, rules, limits, cssItem);
    }
    let record = null;
    if (!ignored && !(svg && name === "style")) {
      const supported = svg && VECTOR.has(name) && (name !== "svg" || node === root);
      if (!svg) appearance("elementNamespace");
      else if (!supported) appearance(name === "svg" ? "nestedViewport" : "element:" + name.slice(0, 64));
      if (supported || deferAppearance) {
        if (parent && !["svg", "g"].includes(parent.name)) appearance("nestedGraphics");
        record = { name, attributes: /* @__PURE__ */ Object.create(null), style: { values: /* @__PURE__ */ Object.create(null), important: [] }, children: [], ...deferAppearance ? { features: pending } : {} };
        if (parent) parent.children.push(record);
        else tree = record;
        for (const attr of node.attributes) {
          const key = attr.localName;
          if (attr.namespaceURI === XMLNS || attr.namespaceURI === XML && ["space", "lang"].includes(key) || EDITORS.has(attr.namespaceURI)) continue;
          if (attr.namespaceURI) {
            appearance(attr.namespaceURI === XLINK && key === "href" ? "localResource" : "attributeNamespace");
            continue;
          }
          if (key === "style") record.style = declarations(cssSecurity(attr.value, appearance), appearance, cssItem);
          else if (["id", "class", "transform"].includes(key) || PRESENTATION.has(key) || (GEOMETRY[name] ?? []).includes(key)) record.attributes[key] = PRESENTATION.has(key) ? cssSecurity(attr.value, appearance) : attr.value;
          else if (key.startsWith("aria-") || key.startsWith("data-") || ["role", "focusable", "tabindex"].includes(key) || decorative(key)) continue;
          else appearance("attribute:" + key.slice(0, 64));
        }
      }
    }
    for (let i = node.children.length - 1; i >= 0; i--) work.push({ node: node.children[i], parent: record ?? parent, inert: ignored, metadata: descriptive });
  }
  if (features.size) fail("UNSUPPORTED_SVG_FEATURE", "SVG needs features not yet supported as editable vectors; export a plain SVG or use PNG/native JSON", { features: [...features.values()].slice(0, 64), featureCount: features.size });
  return { tree, styleSheets: rules, stats: { bytes, elements, nodes, attributes, cssItems, namespaceInferred: inferred } };
}
function inspectSVGXMLForImport(source, options = {}) {
  return inspect(source, options, true);
}

// src/etch/import/svg-colors.js
var names = new Map(`aliceblue:f0f8ff antiquewhite:faebd7 aqua:00ffff aquamarine:7fffd4 azure:f0ffff beige:f5f5dc bisque:ffe4c4 black:000000 blanchedalmond:ffebcd blue:0000ff blueviolet:8a2be2 brown:a52a2a burlywood:deb887 cadetblue:5f9ea0 chartreuse:7fff00 chocolate:d2691e coral:ff7f50 cornflowerblue:6495ed cornsilk:fff8dc crimson:dc143c cyan:00ffff darkblue:00008b darkcyan:008b8b darkgoldenrod:b8860b darkgray:a9a9a9 darkgreen:006400 darkgrey:a9a9a9 darkkhaki:bdb76b darkmagenta:8b008b darkolivegreen:556b2f darkorange:ff8c00 darkorchid:9932cc darkred:8b0000 darksalmon:e9967a darkseagreen:8fbc8f darkslateblue:483d8b darkslategray:2f4f4f darkslategrey:2f4f4f darkturquoise:00ced1 darkviolet:9400d3 deeppink:ff1493 deepskyblue:00bfff dimgray:696969 dimgrey:696969 dodgerblue:1e90ff firebrick:b22222 floralwhite:fffaf0 forestgreen:228b22 fuchsia:ff00ff gainsboro:dcdcdc ghostwhite:f8f8ff gold:ffd700 goldenrod:daa520 gray:808080 green:008000 greenyellow:adff2f grey:808080 honeydew:f0fff0 hotpink:ff69b4 indianred:cd5c5c indigo:4b0082 ivory:fffff0 khaki:f0e68c lavender:e6e6fa lavenderblush:fff0f5 lawngreen:7cfc00 lemonchiffon:fffacd lightblue:add8e6 lightcoral:f08080 lightcyan:e0ffff lightgoldenrodyellow:fafad2 lightgray:d3d3d3 lightgreen:90ee90 lightgrey:d3d3d3 lightpink:ffb6c1 lightsalmon:ffa07a lightseagreen:20b2aa lightskyblue:87cefa lightslategray:778899 lightslategrey:778899 lightsteelblue:b0c4de lightyellow:ffffe0 lime:00ff00 limegreen:32cd32 linen:faf0e6 magenta:ff00ff maroon:800000 mediumaquamarine:66cdaa mediumblue:0000cd mediumorchid:ba55d3 mediumpurple:9370db mediumseagreen:3cb371 mediumslateblue:7b68ee mediumspringgreen:00fa9a mediumturquoise:48d1cc mediumvioletred:c71585 midnightblue:191970 mintcream:f5fffa mistyrose:ffe4e1 moccasin:ffe4b5 navajowhite:ffdead navy:000080 oldlace:fdf5e6 olive:808000 olivedrab:6b8e23 orange:ffa500 orangered:ff4500 orchid:da70d6 palegoldenrod:eee8aa palegreen:98fb98 paleturquoise:afeeee palevioletred:db7093 papayawhip:ffefd5 peachpuff:ffdab9 peru:cd853f pink:ffc0cb plum:dda0dd powderblue:b0e0e6 purple:800080 rebeccapurple:663399 red:ff0000 rosybrown:bc8f8f royalblue:4169e1 saddlebrown:8b4513 salmon:fa8072 sandybrown:f4a460 seagreen:2e8b57 seashell:fff5ee sienna:a0522d silver:c0c0c0 skyblue:87ceeb slateblue:6a5acd slategray:708090 slategrey:708090 snow:fffafa springgreen:00ff7f steelblue:4682b4 tan:d2b48c teal:008080 thistle:d8bfd8 tomato:ff6347 turquoise:40e0d0 violet:ee82ee wheat:f5deb3 white:ffffff whitesmoke:f5f5f5 yellow:ffff00 yellowgreen:9acd32`.split(" ").map((pair2) => pair2.split(":")));
var trim = (s) => s.replace(/^[\t\r\n ]+|[\t\r\n ]+$/g, "");
var number3 = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;
var clamp2 = (n) => Math.min(1, Math.max(0, n));
function unsupported() {
  fail("UNSUPPORTED_SVG_FEATURE", "SVG color needs unsupported color syntax or a host-dependent color", { features: [{ feature: "colorSyntax" }] });
}
function value(token) {
  const suffix = token.endsWith("%"), raw = suffix ? token.slice(0, -1) : token;
  if (raw.length > 128 || !number3.test(raw) || !Number.isFinite(Number(raw))) unsupported();
  return Number(raw) / (suffix ? 100 : 1);
}
var hex = (rgb) => "#" + rgb.map((n) => Math.round(clamp2(n) * 255).toString(16).padStart(2, "0")).join("").toUpperCase();
function parseSVGColor(source) {
  if (typeof source !== "string") fail("INVALID_ARGUMENT", "SVG color must be a string");
  if (source.length > 512) fail("LIMIT_EXCEEDED", "SVG color input limit exceeded", { limit: "svgColorLength", maximum: 512 });
  const text2 = trim(source).toLowerCase();
  if (text2 === "transparent") return { color: "#000000", alpha: 0 };
  if (names.has(text2)) return { color: "#" + names.get(text2).toUpperCase(), alpha: 1 };
  if (/^#[\da-f]+$/.test(text2)) {
    let raw = text2.slice(1);
    if ([3, 4].includes(raw.length)) raw = [...raw].map((c) => c + c).join("");
    if (![6, 8].includes(raw.length)) unsupported();
    return { color: "#" + raw.slice(0, 6).toUpperCase(), alpha: raw.length === 8 ? parseInt(raw.slice(6), 16) / 255 : 1 };
  }
  const match = /^(rgb|rgba|hsl|hsla)\(([^()]*)\)$/.exec(text2);
  if (!match) unsupported();
  const comma = match[2].includes(",");
  let channels, alpha = 1;
  if (comma) {
    if (match[2].includes("/")) unsupported();
    channels = match[2].split(",").map(trim);
    if (![3, 4].includes(channels.length)) unsupported();
    if (channels.length === 4) alpha = clamp2(value(channels.pop()));
  } else {
    const parts = match[2].split("/");
    if (parts.length > 2) unsupported();
    if (parts.length === 2) alpha = clamp2(value(trim(parts[1])));
    channels = trim(parts[0]).split(/[\t\r\n ]+/);
    if (channels.length !== 3) unsupported();
  }
  if (match[1].startsWith("rgb")) {
    if (comma && channels.some((c) => c.endsWith("%")) && !channels.every((c) => c.endsWith("%"))) unsupported();
    return { color: hex(channels.map((c) => c.endsWith("%") ? value(c) : value(c) / 255)), alpha };
  }
  if (!channels[1].endsWith("%") || !channels[2].endsWith("%")) unsupported();
  const hue = /^(.*?)(deg|grad|rad|turn)?$/.exec(channels[0]);
  if (!number3.test(hue[1])) unsupported();
  const degrees = value(hue[1]) * ({ deg: 1, grad: 0.9, rad: 180 / Math.PI, turn: 360 }[hue[2]] ?? 1);
  if (!Number.isFinite(degrees)) unsupported();
  const h = (degrees % 360 + 360) % 360 / 30, s = clamp2(value(channels[1])), l = clamp2(value(channels[2])), a = s * Math.min(l, 1 - l);
  const channel = (n) => {
    const k = (n + h) % 12;
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return { color: hex([channel(0), channel(8), channel(4)]), alpha };
}

// src/etch/import/svg-coordinates.js
var WORLD2 = 1e7;
var MAX_INPUT = 65536;
var MAX_TRANSFORMS = 2e3;
var ws = (c) => c === " " || c === "	" || c === "\r" || c === "\n";
var digit = (c) => c >= "0" && c <= "9";
function invalid3() {
  fail("INVALID_SVG", "Invalid SVG coordinate syntax");
}
function limit2(name, maximum) {
  fail("LIMIT_EXCEEDED", "SVG coordinate safety limit exceeded", { limit: name, maximum });
}
function numeric() {
  limit2("svgNumericRange", WORLD2);
}
function unsupported2(feature) {
  fail("UNSUPPORTED_SVG_FEATURE", "SVG coordinate feature is outside the editable vector subset", { features: [{ feature }] });
}
function input(value2) {
  if (typeof value2 !== "string") fail("INVALID_ARGUMENT", "SVG coordinate input must be a string");
  if (value2.length > MAX_INPUT) limit2("svgCoordinateLength", MAX_INPUT);
}
var Cursor = class {
  pos = 0;
  constructor(text2) {
    input(text2);
    this.text = text2;
  }
  space() {
    while (ws(this.text[this.pos])) this.pos++;
  }
  number(comma = false) {
    this.space();
    if (this.text[this.pos] === ",") {
      if (!comma) invalid3();
      this.pos++;
      this.space();
    }
    const start = this.pos;
    let nonzero = false, digits = 0;
    const take = () => {
      if (this.pos - start >= 128) limit2("svgNumberLength", 128);
      return this.text[this.pos++];
    };
    if (this.text[this.pos] === "+" || this.text[this.pos] === "-") take();
    const decimal = () => {
      while (digit(this.text[this.pos])) {
        nonzero ||= this.text[this.pos] !== "0";
        digits++;
        take();
      }
    };
    decimal();
    if (this.text[this.pos] === ".") {
      take();
      decimal();
    }
    if (!digits) invalid3();
    if ((this.text[this.pos] === "e" || this.text[this.pos] === "E") && (digit(this.text[this.pos + 1]) || this.text[this.pos + 1] === "+" || this.text[this.pos + 1] === "-")) {
      take();
      if (this.text[this.pos] === "+" || this.text[this.pos] === "-") take();
      const before = this.pos;
      while (digit(this.text[this.pos])) take();
      if (this.pos === before) invalid3();
    }
    const value2 = Number(this.text.slice(start, this.pos));
    if (!Number.isFinite(value2) || Math.abs(value2) > WORLD2 || value2 === 0 && nonzero) numeric();
    return value2;
  }
};
function validateSVGImportMatrix(matrix) {
  if (!Array.isArray(matrix) || matrix.length !== 6 || !matrix.every(Number.isFinite)) numeric();
  const [low, high] = singularValues(matrix);
  if (low < 1e-4 || high > 1e4 || !Number.isFinite(high) || matrix.some((n) => Math.abs(n) > WORLD2)) fail("LIMIT_EXCEEDED", "SVG accumulated transform is outside native ranges", { limit: "svgTransformRange", minScale: 1e-4, maxScale: 1e4, maxCoordinate: WORLD2 });
  return [...matrix];
}
function boundedMatrix(matrix) {
  if (!matrix.every(Number.isFinite) || matrix.some((n) => Math.abs(n) > WORLD2)) numeric();
  return matrix;
}
function rotation(degrees) {
  const angle = degrees % 360 * Math.PI / 180;
  let c = Math.cos(angle), s = Math.sin(angle);
  if (degrees % 90 === 0) {
    const i = (degrees / 90 % 4 + 4) % 4;
    c = [1, 0, -1, 0][i];
    s = [0, 1, 0, -1][i];
  }
  return [c, s, -s, c, 0, 0];
}
function parseSVGTransform(text2, options = {}) {
  input(text2);
  if (!options || typeof options !== "object" || Array.isArray(options) || Object.keys(options).some((k) => k !== "maxTransforms")) fail("INVALID_ARGUMENT", "Invalid SVG transform options");
  const { maxTransforms = MAX_TRANSFORMS } = options;
  if (!Number.isSafeInteger(maxTransforms) || maxTransforms < 1 || maxTransforms > MAX_TRANSFORMS) fail("INVALID_ARGUMENT", "SVG transform limit must be a positive downward integer");
  if (text2.trim() === "none") return [...IDENTITY];
  const cursor = new Cursor(text2);
  let matrix = [...IDENTITY], count = 0;
  cursor.space();
  while (cursor.pos < text2.length) {
    if (++count > maxTransforms) limit2("svgTransforms", maxTransforms);
    const start = cursor.pos;
    while (/[A-Za-z]/.test(text2[cursor.pos] ?? "")) cursor.pos++;
    const name = text2.slice(start, cursor.pos);
    if (!["matrix", "translate", "scale", "rotate", "skewX", "skewY"].includes(name)) invalid3();
    cursor.space();
    if (text2[cursor.pos++] !== "(") invalid3();
    cursor.space();
    const values = [];
    while (text2[cursor.pos] !== ")") {
      if (values.length >= 6) invalid3();
      values.push(cursor.number(values.length > 0));
      cursor.space();
    }
    cursor.pos++;
    let next;
    const [a, b, c] = values;
    if (name === "matrix" && values.length === 6) next = values;
    else if (name === "translate" && [1, 2].includes(values.length)) next = [1, 0, 0, 1, a, b ?? 0];
    else if (name === "scale" && [1, 2].includes(values.length)) next = [a, 0, 0, b ?? a, 0, 0];
    else if (name === "rotate" && [1, 3].includes(values.length)) {
      next = rotation(a);
      if (values.length === 3) next = multiply(multiply([1, 0, 0, 1, b, c], next), [1, 0, 0, 1, -b, -c]);
    } else if ((name === "skewX" || name === "skewY") && values.length === 1) {
      const skew = Math.tan(a % 180 * Math.PI / 180);
      next = name === "skewX" ? [1, 0, skew, 1, 0, 0] : [1, skew, 0, 1, 0, 0];
    } else invalid3();
    matrix = boundedMatrix(multiply(matrix, boundedMatrix(next)));
    cursor.space();
    if (text2[cursor.pos] === ",") {
      cursor.pos++;
      cursor.space();
      if (cursor.pos === text2.length) invalid3();
    }
  }
  return matrix;
}
var UNITS = { px: 1, in: 96, cm: 96 / 2.54, mm: 96 / 25.4, q: 96 / 101.6, pt: 96 / 72, pc: 16 };
function parseSVGLength(text2, options = {}) {
  if (!options || typeof options !== "object" || Array.isArray(options) || Object.keys(options).some((k) => k !== "percentBase")) fail("INVALID_ARGUMENT", "Invalid SVG length options");
  const { percentBase } = options;
  if (percentBase !== void 0 && (!Number.isFinite(percentBase) || percentBase < 0 || percentBase > WORLD2)) fail("INVALID_ARGUMENT", "Invalid SVG percentage base");
  const cursor = new Cursor(text2), value2 = cursor.number();
  const start = cursor.pos;
  while (/[A-Za-z%]/.test(text2[cursor.pos] ?? "")) cursor.pos++;
  const unit2 = text2.slice(start, cursor.pos).toLowerCase();
  cursor.space();
  if (cursor.pos !== text2.length) invalid3();
  let factor = 1;
  if (unit2 === "%") {
    if (percentBase === void 0) unsupported2("percentageLength");
    factor = percentBase / 100;
  } else if (unit2) {
    if (!Object.hasOwn(UNITS, unit2)) unsupported2("lengthUnit");
    factor = UNITS[unit2];
  }
  const result = value2 * factor;
  if (!Number.isFinite(result) || Math.abs(result) > WORLD2 || result === 0 && value2 !== 0 && factor !== 0) numeric();
  return result;
}
function viewBox(text2) {
  const cursor = new Cursor(text2), values = [];
  for (let i = 0; i < 4; i++) values.push(cursor.number(i > 0));
  cursor.space();
  if (cursor.pos !== text2.length || values[2] < 0 || values[3] < 0) invalid3();
  if (!values[2] || !values[3]) fail("EMPTY_IMPORT", "SVG viewBox has no painted viewport");
  return values;
}
function resolveSVGViewport(attributes) {
  if (!attributes || typeof attributes !== "object" || Array.isArray(attributes)) fail("INVALID_ARGUMENT", "SVG viewport attributes must be an object");
  const get = (key) => Object.hasOwn(attributes, key) ? attributes[key] : void 0;
  const box = get("viewBox") === void 0 ? null : viewBox(get("viewBox"));
  const rawWidth = get("width"), rawHeight = get("height");
  let width2 = rawWidth === void 0 ? void 0 : parseSVGLength(rawWidth, { percentBase: box?.[2] });
  let height = rawHeight === void 0 ? void 0 : parseSVGLength(rawHeight, { percentBase: box?.[3] });
  if (width2 !== void 0 && width2 < 0 || height !== void 0 && height < 0) invalid3();
  if (width2 === 0 || height === 0) fail("EMPTY_IMPORT", "SVG root has no painted viewport");
  if (box) {
    if (width2 === void 0 && height === void 0) [width2, height] = box.slice(2);
    else if (width2 === void 0) width2 = height * (box[2] / box[3]);
    else if (height === void 0) height = width2 * (box[3] / box[2]);
  } else {
    width2 ??= 300;
    height ??= 150;
  }
  if (!Number.isFinite(width2) || !Number.isFinite(height) || width2 > WORLD2 || height > WORLD2 || width2 <= 0 || height <= 0) numeric();
  const rawAspect = get("preserveAspectRatio") ?? "xMidYMid meet";
  input(rawAspect);
  const aspect = /^[\t\r\n ]*(?:defer[\t\r\n ]+)?(none|x(?:Min|Mid|Max)Y(?:Min|Mid|Max))(?:[\t\r\n ]+(meet|slice))?[\t\r\n ]*$/.exec(rawAspect);
  if (!aspect) invalid3();
  let matrix = [...IDENTITY];
  if (box) {
    const [x, y, w, h] = box, sx = width2 / w, sy = height / h;
    if (aspect[1] === "none") matrix = [sx, 0, 0, sy, -x * sx, -y * sy];
    else {
      const scale2 = aspect[2] === "slice" ? Math.max(sx, sy) : Math.min(sx, sy);
      const ax = { Min: 0, Mid: 0.5, Max: 1 }[aspect[1].slice(1, 4)], ay = { Min: 0, Mid: 0.5, Max: 1 }[aspect[1].slice(5, 8)];
      matrix = [scale2, 0, 0, scale2, (width2 - w * scale2) * ax - x * scale2, (height - h * scale2) * ay - y * scale2];
    }
  }
  return { width: width2, height, viewBox: box ? [...box] : null, matrix: boundedMatrix(matrix), viewport: { x: 0, y: 0, width: width2, height } };
}
function resolveSVGRootCoordinates(attributes) {
  const result = resolveSVGViewport(attributes), x = result.width / 2, y = result.height / 2;
  const rootTransform = multiply(multiply([1, 0, 0, 1, x, y], parseSVGTransform(attributes.transform ?? "")), [1, 0, 0, 1, -x, -y]);
  return { ...result, beforeRootMatrix: [...result.matrix], rootTransform, matrix: boundedMatrix(multiply(rootTransform, result.matrix)) };
}

// src/etch/import/svg-style.js
var INITIAL = Object.freeze({ color: "black", fill: "black", stroke: "none", "fill-rule": "nonzero", "stroke-width": "1", "stroke-linecap": "butt", "stroke-linejoin": "miter", "stroke-miterlimit": "4", display: "inline", visibility: "visible", opacity: "1", "fill-opacity": "1", "stroke-opacity": "1", "stroke-dasharray": "none", "stroke-dashoffset": "0", "clip-path": "none", mask: "none", filter: "none", "vector-effect": "none", "paint-order": "normal", "mix-blend-mode": "normal", isolation: "auto", "marker-start": "none", "marker-mid": "none", "marker-end": "none", overflow: "visible", "shape-rendering": "auto", "color-rendering": "auto", "text-rendering": "auto", "image-rendering": "auto" });
var NONINHERITED = /* @__PURE__ */ new Set(["display", "opacity", "clip-path", "mask", "filter", "vector-effect", "mix-blend-mode", "isolation", "overflow"]);
var LIMITS = { maxNodes: 2e4, maxDepth: 64, maxSelectors: 1e5, maxClasses: 1e5, maxWork: 1e6 };
var SHAPES = /* @__PURE__ */ new Set(["path", "line", "rect", "circle", "ellipse", "polyline", "polygon"]);
var lower = (value2) => value2.trim().toLowerCase();
function unsupported3(feature) {
  fail("UNSUPPORTED_SVG_FEATURE", "SVG appearance is outside the editable vector subset", { features: [{ feature }] });
}
function exceeded2(limit4, maximum) {
  fail("LIMIT_EXCEEDED", "SVG style safety limit exceeded", { limit: limit4, maximum });
}
function entries(declarations2) {
  return declarations2?.entries ?? Object.entries(declarations2?.values ?? {}).map(([name, value2]) => ({ name, value: value2, important: declarations2.important?.includes(name) ?? false }));
}
var number4 = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;
function scalar(text2, percentage = false) {
  text2 = text2.trim();
  const percent = text2.endsWith("%");
  if (percent && !percentage) unsupported3("numericStyle");
  const token = percent ? text2.slice(0, -1) : text2;
  if (token.length > 128 || !number4.test(token) || !Number.isFinite(Number(token))) unsupported3("numericStyle");
  return Number(token) / (percent ? 100 : 1);
}
var opacity = (value2) => Math.max(0, Math.min(1, scalar(value2, true)));
function choice3(value2, allowed, feature) {
  value2 = lower(value2);
  if (!allowed.includes(value2)) unsupported3(feature);
  return value2;
}
function paint2(value2, color3, alpha) {
  if (lower(value2) === "none" || alpha === 0) return null;
  const parsed = parseSVGColor(lower(value2) === "currentcolor" ? color3 : value2), combined = parsed.alpha * alpha;
  if (!combined) return null;
  if (combined !== 1) unsupported3("partialAlpha");
  return parsed.color;
}
function nativePaint(computed, name) {
  const fill = name === "line" ? null : paint2(computed.fill, computed.color, opacity(computed["fill-opacity"]));
  let stroke = null, strokeWidth = 0;
  if (lower(computed.stroke) !== "none" && opacity(computed["stroke-opacity"]) > 0) {
    if (/[()]/.test(computed["stroke-width"])) unsupported3("strokeWidth");
    strokeWidth = parseSVGLength(computed["stroke-width"]);
    if (strokeWidth < 0) unsupported3("strokeWidth");
    if (strokeWidth) stroke = paint2(computed.stroke, computed.color, opacity(computed["stroke-opacity"]));
    if (stroke && (strokeWidth < 0.01 || strokeWidth > 1e6)) fail("LIMIT_EXCEEDED", "SVG stroke width is outside the native editable range (.01\u20131000000)", { limit: "svgStrokeWidth", minimum: 0.01, maximum: 1e6 });
  }
  const retainedChoice = (value2, allowed, feature, active, fallback) => allowed.includes(lower(value2)) ? lower(value2) : active ? choice3(value2, allowed, feature) : fallback;
  const lineCap = retainedChoice(computed["stroke-linecap"], ["butt", "round", "square"], "strokeLinecap", stroke, "butt");
  const lineJoin = retainedChoice(computed["stroke-linejoin"], ["miter", "round", "bevel"], "strokeLinejoin", stroke, "miter");
  const rawMiter = computed["stroke-miterlimit"].trim();
  const miterLimit = stroke ? scalar(rawMiter) : rawMiter.length <= 128 && number4.test(rawMiter) && Number.isFinite(Number(rawMiter)) && Number(rawMiter) >= 1 ? Number(rawMiter) : 4;
  if (miterLimit < 1) unsupported3("strokeMiterlimit");
  return { fill, stroke, strokeWidth: stroke ? strokeWidth : 0, lineCap, lineJoin, miterLimit, fillRule: retainedChoice(computed["fill-rule"], ["nonzero", "evenodd"], "fillRule", fill, "nonzero") };
}
function effects(record) {
  const { computed, paint: paint3 } = record;
  for (const key of ["clip-path", "mask", "filter"]) if (lower(computed[key]) !== "none") unsupported3(key);
  if (lower(computed["mix-blend-mode"]) !== "normal" || lower(computed.isolation) !== "auto") unsupported3("compositing");
  if (![0, 1].includes(opacity(computed.opacity))) unsupported3("groupOpacity");
  choice3(computed.display, ["inline", "block"], "display");
  choice3(computed.overflow, ["visible", "hidden", "clip"], "overflow");
  if (SHAPES.has(record.name)) {
    for (const key of ["vector-effect", "marker-start", "marker-mid", "marker-end"]) if (lower(computed[key]) !== "none") unsupported3(key);
    if (paint3?.stroke && lower(computed["stroke-dasharray"]) !== "none") unsupported3("stroke-dasharray");
    if (paint3?.fill || paint3?.stroke) {
      choice3(computed["shape-rendering"], ["auto", "geometricprecision"], "shapeRendering");
      choice3(computed["color-rendering"], ["auto"], "colorRendering");
      if (paint3.fill && paint3.stroke && !["normal", "fill", "fill stroke", "fill stroke markers"].includes(lower(computed["paint-order"]).replace(/\s+/g, " "))) unsupported3("paintOrder");
    }
  }
}
function resolveSVGStyles(inspection, options = {}) {
  if (!inspection?.tree || !Array.isArray(inspection.styleSheets) || !options || typeof options !== "object" || Array.isArray(options) || Object.keys(options).some((k) => ![...Object.keys(LIMITS), "isValidDeclaration", "isGeometryEmpty"].includes(k))) fail("INVALID_ARGUMENT", "Invalid SVG style input/options");
  if (options.isGeometryEmpty !== void 0 && typeof options.isGeometryEmpty !== "function") fail("INVALID_ARGUMENT", "SVG geometry predicate must be a function");
  const limits = { ...LIMITS };
  for (const key of Object.keys(limits)) if (options[key] !== void 0) {
    if (!Number.isSafeInteger(options[key]) || options[key] < 1 || options[key] > limits[key]) fail("INVALID_ARGUMENT", "SVG style limits must be positive downward integers", { limit: key });
    limits[key] = options[key];
  }
  const valid = options.isValidDeclaration ?? (globalThis.CSS?.supports ? (name, value2) => globalThis.CSS.supports(name, value2) : null);
  if (typeof valid !== "function") fail("INVALID_ARGUMENT", "SVG styles require CSS declaration validation");
  let work = 0, selectors = 0, classes = 0;
  const charge = () => {
    if (++work > limits.maxWork) exceeded2("svgStyleWork", limits.maxWork);
  };
  const validEntries = (declaration) => entries(declaration).filter((entry) => {
    charge();
    if (!Object.hasOwn(INITIAL, entry.name) || typeof entry.value !== "string") unsupported3("cssProperty");
    return valid(entry.name, entry.value);
  });
  const index = { tag: /* @__PURE__ */ new Map(), class: /* @__PURE__ */ new Map(), id: /* @__PURE__ */ new Map() };
  inspection.styleSheets.forEach((rule, order) => {
    const declarations2 = validEntries(rule.declarations);
    for (const selector of rule.selectors) {
      if (++selectors > limits.maxSelectors) exceeded2("svgStyleSelectors", limits.maxSelectors);
      if (!Object.hasOwn(index, selector.kind) || typeof selector.name !== "string") unsupported3("cssSelector");
      const map = index[selector.kind], list = map.get(selector.name) ?? [];
      list.push({ declarations: declarations2, order, specificity: { tag: 1, class: 10, id: 100 }[selector.kind] });
      map.set(selector.name, list);
    }
  });
  const records = [], stack = [{ node: inspection.tree, parent: null, depth: 1 }];
  while (stack.length) {
    const { node, parent, depth } = stack.pop();
    if (records.length >= limits.maxNodes) exceeded2("svgStyleNodes", limits.maxNodes);
    if (depth > limits.maxDepth) exceeded2("svgStyleDepth", limits.maxDepth);
    charge();
    const attrs = node.attributes, ancestor = parent === null ? null : records[parent], winners = /* @__PURE__ */ new Map();
    const offer = (name, value2, important, specificity, order) => {
      charge();
      const rank = [important ? 1 : 0, specificity, order], old = winners.get(name);
      if (!old || rank[0] > old.rank[0] || rank[0] === old.rank[0] && (rank[1] > old.rank[1] || rank[1] === old.rank[1] && rank[2] >= old.rank[2])) winners.set(name, { value: value2, rank });
    };
    for (const [name, value2] of Object.entries(attrs)) if (Object.hasOwn(INITIAL, name)) {
      charge();
      if (valid(name, value2)) offer(name, value2, false, 0, -1);
    }
    const apply2 = (list) => {
      for (const rule of list ?? []) {
        charge();
        for (const entry of rule.declarations) offer(entry.name, entry.value, entry.important, rule.specificity, rule.order);
      }
    };
    apply2(index.tag.get(node.name));
    if (attrs.id !== void 0) apply2(index.id.get(attrs.id));
    const tokens = /[^\t\r\n\f ]+/g, seen = /* @__PURE__ */ new Set();
    let token;
    while (token = tokens.exec(attrs.class ?? "")) {
      if (++classes > limits.maxClasses) exceeded2("svgStyleClasses", limits.maxClasses);
      if (!seen.has(token[0])) {
        seen.add(token[0]);
        apply2(index.class.get(token[0]));
      }
    }
    for (const entry of validEntries(node.style)) offer(entry.name, entry.value, entry.important, 1e3, inspection.styleSheets.length);
    const computed = /* @__PURE__ */ Object.create(null);
    for (const [name, initial] of Object.entries(INITIAL)) {
      charge();
      const value2 = winners.get(name)?.value, key = value2 === void 0 ? "unset" : lower(value2), inherited = ancestor?.computed[name] ?? initial;
      if (["revert", "revert-layer"].includes(key)) unsupported3("cssRevert");
      computed[name] = key === "inherit" ? inherited : key === "initial" ? initial : key === "unset" ? NONINHERITED.has(name) ? initial : inherited : value2;
    }
    if (lower(computed.color) === "currentcolor") computed.color = ancestor?.computed.color ?? INITIAL.color;
    const hidden = lower(computed.display) === "none" || opacity(computed.opacity) === 0;
    const visible = !hidden && choice3(computed.visibility, ["visible", "hidden", "collapse"], "visibility") === "visible";
    const known = SHAPES.has(node.name) || ["svg", "g"].includes(node.name);
    if (!hidden && lower(computed.filter) !== "none") unsupported3("filter");
    if (!hidden && lower(computed["vector-effect"]) !== "none") unsupported3("vector-effect");
    if (!hidden && node.name === "use") unsupported3("element:use");
    if (visible && node.features?.length) unsupported3(node.features[0]);
    if (visible && !known) unsupported3("element");
    if (visible && SHAPES.has(node.name)) {
      for (const key of ["marker-start", "marker-mid", "marker-end"]) if (lower(computed[key]) !== "none") unsupported3(key);
    }
    const empty = visible && SHAPES.has(node.name) && options.isGeometryEmpty?.(node, computed);
    const paint3 = visible && SHAPES.has(node.name) && !empty ? nativePaint(computed, node.name) : null;
    const position = records.length;
    records.push({ name: node.name, attributes: { ...attrs }, computed, parent, hidden, visible, paint: paint3, features: [...node.features ?? []], known, active: !!(paint3?.fill || paint3?.stroke) });
    if (!hidden) for (let i = node.children.length - 1; i >= 0; i--) stack.push({ node: node.children[i], parent: position, depth: depth + 1 });
  }
  for (let i = records.length - 1; i >= 0; i--) {
    const record = records[i];
    if (record.active) {
      if (!record.known || record.features.length) unsupported3(record.features[0] ?? "element");
      effects(record);
      if (record.parent !== null) records[record.parent].active = true;
    }
  }
  return { records, stats: { nodes: records.length, selectors, classes, work } };
}

// src/etch/import/svg-path.js
var MAX_INPUT2 = 5 * 1024 * 1024;
var MAX_COMMANDS = 1e5;
var MAX_TOKENS = 1e6;
var WORLD3 = 1e7;
var TAU = 2 * Math.PI;
var whitespace = (c) => c === " " || c === "	" || c === "\r" || c === "\n";
var digit2 = (c) => c >= "0" && c <= "9";
var commandLetter = (c) => typeof c === "string" && /^[MmLlHhVvCcSsQqTtAaZz]$/.test(c);
var finite3 = (n) => typeof n === "number" && Number.isFinite(n);
function limit3(name, maximum) {
  fail("LIMIT_EXCEEDED", "SVG path safety limit exceeded", { limit: name, maximum });
}
function unsafe2() {
  fail("LIMIT_EXCEEDED", "SVG path numerical range cannot be normalized safely at this precision", { limit: "svgNumericRange" });
}
var Scanner = class {
  index = 0;
  tokens = 0;
  constructor(text2, maximum) {
    this.text = text2;
    this.maximum = maximum;
  }
  space() {
    while (whitespace(this.text[this.index])) this.index++;
  }
  token() {
    if (++this.tokens > this.maximum) limit3("svgTokens", this.maximum);
  }
  invalid() {
    fail("INVALID_SVG", "Invalid SVG path syntax", { offset: this.index });
  }
  number(comma, flag = false) {
    this.space();
    if (this.text[this.index] === ",") {
      if (!comma) this.invalid();
      this.index++;
      this.space();
    }
    const start = this.index;
    this.token();
    if (flag) {
      const c = this.text[this.index];
      if (c !== "0" && c !== "1") this.invalid();
      this.index++;
      return Number(c);
    }
    const take = () => {
      if (this.index - start >= 128) limit3("svgNumberLength", 128);
      return this.text[this.index++];
    };
    if (this.text[this.index] === "+" || this.text[this.index] === "-") take();
    let digits = 0, nonzero = false;
    const consumeDigits = () => {
      while (digit2(this.text[this.index])) {
        nonzero ||= this.text[this.index] !== "0";
        take();
        digits++;
      }
    };
    consumeDigits();
    if (this.text[this.index] === ".") {
      take();
      consumeDigits();
    }
    if (!digits) this.invalid();
    if (this.text[this.index] === "e" || this.text[this.index] === "E") {
      take();
      if (this.text[this.index] === "+" || this.text[this.index] === "-") take();
      const before = this.index;
      while (digit2(this.text[this.index])) take();
      if (this.index === before) this.invalid();
    }
    const n = Number(this.text.slice(start, this.index));
    if (!Number.isFinite(n) || n === 0 && nonzero) unsafe2();
    return n;
  }
};
function arc(start, end, rx, ry, rotation2, large, sweep, tolerance, norm, emit, remaining, maximum) {
  if (start[0] === end[0] && start[1] === end[1]) return;
  rx = Math.abs(rx);
  ry = Math.abs(ry);
  if (!rx || !ry) {
    emit(["L", ...end]);
    return;
  }
  const phi = rotation2 % 360 * Math.PI / 180, cos = Math.cos(phi), sin = Math.sin(phi);
  const dx = (start[0] - end[0]) / 2, dy = (start[1] - end[1]) / 2;
  const x = cos * dx + sin * dy, y = -sin * dx + cos * dy;
  const correction = Math.hypot(x / rx, y / ry);
  if (!finite3(correction) || correction === 0) unsafe2();
  const corrected = correction > 1;
  if (corrected) {
    rx *= correction;
    ry *= correction;
  }
  if (!finite3(rx) || !finite3(ry)) unsafe2();
  const u = x / rx, v = y / ry, q = u * u + v * v;
  if (!(q > 0) || !finite3(q)) unsafe2();
  const factor = corrected ? 0 : (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, (1 - q) / q));
  const cx = factor * rx * v, cy = -factor * ry * u;
  const a = [(x - cx) / rx, (y - cy) / ry], b = [(-x - cx) / rx, (-y - cy) / ry];
  const theta = Math.atan2(a[1], a[0]);
  let delta = Math.atan2(a[0] * b[1] - a[1] * b[0], a[0] * b[0] + a[1] * b[1]);
  if (sweep && delta < 0) delta += TAU;
  if (!sweep && delta > 0) delta -= TAU;
  const radius = Math.max(rx, ry), magnitude = Math.max(radius, ...start.map(Math.abs), ...end.map(Math.abs), Math.abs(cx), Math.abs(cy));
  const epsilon = 64 * Number.EPSILON;
  const conditioning = !corrected || Math.abs(correction - 1) <= epsilon ? radius * norm * epsilon / Math.sqrt(Math.max(1 - q, epsilon)) : 0;
  const roundoff = epsilon * magnitude * norm + conditioning;
  if (!finite3(roundoff) || roundoff >= tolerance / 4 || !finite3(delta) || delta === 0) unsafe2();
  const effective = radius * norm;
  if (!finite3(effective)) unsafe2();
  const step = Math.min(Math.PI / 2, Math.pow((tolerance - roundoff) * 192 / effective, 0.25));
  const count = Math.ceil(Math.abs(delta) / step);
  if (!Number.isSafeInteger(count) || count < 1) unsafe2();
  if (count > remaining) limit3("svgCommands", maximum);
  const h = delta / count, U = [rx * cos, rx * sin], V = [-ry * sin, ry * cos];
  const point = (t) => {
    const mid = (t + theta) / 2, half = (t - theta) / 2;
    const dc = -2 * Math.sin(mid) * Math.sin(half), ds = 2 * Math.cos(mid) * Math.sin(half);
    return start.map((n, i) => n + U[i] * dc + V[i] * ds);
  };
  const tangent = (t) => U.map((n, i) => -n * Math.sin(t) + V[i] * Math.cos(t));
  const predicted = point(theta + delta);
  if (Math.hypot(predicted[0] - end[0], predicted[1] - end[1]) * norm > roundoff) unsafe2();
  let previous = start;
  for (let i = 0; i < count; i++) {
    const t0 = theta + i * h, t1 = theta + (i + 1) * h;
    const next = i === count - 1 ? end : point(t1), d0 = tangent(t0), d1 = tangent(t1);
    emit(["C", previous[0] + h * d0[0] / 3, previous[1] + h * d0[1] / 3, next[0] - h * d1[0] / 3, next[1] - h * d1[1] / 3, ...next]);
    previous = next;
  }
}
function normalizeSVGPath(data, options = {}) {
  if (typeof data !== "string" || !options || typeof options !== "object" || Array.isArray(options) || Object.keys(options).some((k) => !["transform", "tolerance", "maxCommands", "maxTokens", "maxInputLength"].includes(k))) fail("INVALID_ARGUMENT", "Invalid SVG path normalizer arguments");
  const { transform = IDENTITY, tolerance = 0.1, maxCommands = MAX_COMMANDS, maxTokens = MAX_TOKENS, maxInputLength = MAX_INPUT2 } = options;
  for (const [name, n, max] of [["maxCommands", maxCommands, MAX_COMMANDS], ["maxTokens", maxTokens, MAX_TOKENS], ["maxInputLength", maxInputLength, MAX_INPUT2]]) if (!Number.isSafeInteger(n) || n < 1 || n > max) fail("INVALID_ARGUMENT", "SVG path limits must be positive downward integers", { limit: name });
  if (!finite3(tolerance) || tolerance <= 0 || tolerance > 0.1 || !Array.isArray(transform) || transform.length !== 6 || !transform.every(finite3)) fail("INVALID_ARGUMENT", "Invalid SVG path tolerance or transform");
  const [low, high] = singularValues(transform);
  if (low < 1e-4 || high > 1e4 || !finite3(high)) fail("INVALID_ARGUMENT", "SVG path transform is outside native scale limits");
  const norm = Math.hypot(...transform.slice(0, 4));
  if (data.length > maxInputLength) limit3("svgPathLength", maxInputLength);
  const s = new Scanner(data, maxTokens), out = [];
  let current = [0, 0], subpath = [0, 0], active = null, previous = null, cubic = null, quad = null, open = false;
  function push(c) {
    if (out.length >= maxCommands) limit3("svgCommands", maxCommands);
    if (!c.slice(1).every((n) => finite3(n) && Math.abs(n) <= WORLD3)) limit3("coordinates", WORLD3);
    out.push(c);
  }
  function emit(c) {
    if (!open && c[0] !== "M") {
      push(["M", ...current]);
      open = true;
    }
    push(c);
    open = c[0] !== "Z";
  }
  while (true) {
    s.space();
    if (s.index === data.length) break;
    let explicit = false;
    if (commandLetter(data[s.index])) {
      active = data[s.index++];
      s.token();
      explicit = true;
    } else if (!active || active.toUpperCase() === "Z") s.invalid();
    const op = active.toUpperCase(), relative = active !== op;
    if (!out.length && op !== "M") s.invalid();
    if (op === "Z") {
      if (open) {
        push(["Z"]);
        open = false;
      }
      current = [...subpath];
      previous = "Z";
      cubic = quad = null;
      continue;
    }
    let first = !explicit;
    const n = (flag = false) => {
      const value2 = s.number(first, flag);
      first = true;
      return value2;
    };
    const pair2 = () => {
      const p = [n(), n()];
      return relative ? p.map((v, i) => v + current[i]) : p;
    };
    let end, nextCubic = null, nextQuad = null;
    if (op === "M" || op === "L") {
      end = pair2();
      emit([op, ...end]);
      if (op === "M") {
        subpath = [...end];
        active = relative ? "l" : "L";
      }
    } else if (op === "H" || op === "V") {
      const axis = op === "H" ? 0 : 1;
      end = [...current];
      end[axis] = n() + (relative ? current[axis] : 0);
      emit(["L", ...end]);
    } else if (op === "C" || op === "S") {
      const c1 = op === "C" ? pair2() : ["C", "S"].includes(previous) ? current.map((v, i) => 2 * v - cubic[i]) : [...current];
      nextCubic = pair2();
      end = pair2();
      emit(["C", ...c1, ...nextCubic, ...end]);
    } else if (op === "Q" || op === "T") {
      nextQuad = op === "Q" ? pair2() : ["Q", "T"].includes(previous) ? current.map((v, i) => 2 * v - quad[i]) : [...current];
      end = pair2();
      emit(["Q", ...nextQuad, ...end]);
    } else if (op === "A") {
      const rx = n(), ry = n(), rotation2 = n(), large = n(true), sweep = n(true);
      end = pair2();
      if (!end.every((v) => finite3(v) && Math.abs(v) <= WORLD3)) limit3("coordinates", WORLD3);
      arc(current, end, rx, ry, rotation2, large, sweep, tolerance, norm, emit, maxCommands - out.length - (open ? 0 : 1), maxCommands);
    }
    current = end;
    previous = op;
    cubic = nextCubic;
    quad = nextQuad;
  }
  return out;
}

// src/etch/import/svg-straight-bounds.js
function straightPaintedBounds(e) {
  if (!e.commands.every((c) => ["M", "L", "Z"].includes(c[0]))) return void 0;
  const m = e.transform, r = e.stroke ? e.strokeWidth / 2 : 0;
  let bounds = null;
  const point = (p) => {
    const [x, y] = apply(m, p);
    bounds = unionBounds(bounds, { x, y, width: 0, height: 0 });
  };
  const disk = (p) => {
    const [cx, cy] = apply(m, p), x = r * Math.hypot(m[0], m[2]), y = r * Math.hypot(m[1], m[3]);
    bounds = unionBounds(bounds, { x: cx - x, y: cy - y, width: 2 * x, height: 2 * y });
  };
  const join = (p, u, v) => {
    if (!r) return;
    if (e.lineJoin === "round") {
      disk(p);
      return;
    }
    if (e.lineJoin !== "miter") return;
    const den = 1 + u[0] * v[0] + u[1] * v[1], limit4 = e.miterLimit;
    if (den < 128 * Number.EPSILON) {
      if (limit4 >= 1e6) {
        const [cx, cy] = apply(m, p), x2 = r * limit4 * Math.hypot(m[0], m[2]), y2 = r * limit4 * Math.hypot(m[1], m[3]);
        bounds = unionBounds(bounds, { x: cx - x2, y: cy - y2, width: 2 * x2, height: 2 * y2 });
      }
      return;
    }
    const ratio = Math.sqrt(2 / den);
    if (ratio > limit4 + 128 * Number.EPSILON * Math.max(1, ratio, limit4)) return;
    const x = -(u[1] + v[1]) * r / den, y = (u[0] + v[0]) * r / den;
    point([p[0] + x, p[1] + y]);
    point([p[0] - x, p[1] - y]);
  };
  const cap = (p, u, sign) => {
    if (!r || e.lineCap === "butt") return;
    if (e.lineCap === "round") {
      disk(p);
      return;
    }
    for (const side of [-1, 1]) point([p[0] + r * (sign * u[0] - side * u[1]), p[1] + r * (sign * u[1] + side * u[0])]);
  };
  let start = null, current = null, first = null, last = null, drawn = false;
  const finish = (closed) => {
    if (first) {
      if (closed) join(start, last.u, first.u);
      else {
        cap(first.start, first.u, -1);
        cap(last.end, last.u, 1);
      }
    } else if (drawn && r && e.lineCap === "round") disk(start);
    first = last = null;
    drawn = false;
  };
  const segment = (end) => {
    drawn = true;
    const dx = end[0] - current[0], dy = end[1] - current[1], length = Math.hypot(dx, dy);
    if (length) {
      const u = [dx / length, dy / length], next = { start: current, end, u };
      if (e.fill) {
        point(current);
        point(end);
      }
      if (r) for (const p of [current, end]) for (const side of [-1, 1]) point([p[0] - side * r * u[1], p[1] + side * r * u[0]]);
      if (last) join(current, last.u, u);
      else first = next;
      last = next;
    }
    current = end;
  };
  for (const [op, x, y] of e.commands) {
    if (op === "M") {
      finish(false);
      start = current = [x, y];
    } else if (op === "L") segment([x, y]);
    else {
      segment(start);
      finish(true);
      current = start;
    }
  }
  finish(false);
  return bounds;
}

// src/etch/import/svg-geometry.js
function unsupported4(feature) {
  fail("UNSUPPORTED_SVG_FEATURE", "SVG geometry requires features outside the editable vector subset", { features: [{ feature }] });
}
function exceeded3(limit4, maximum) {
  fail("LIMIT_EXCEEDED", "SVG geometry limit exceeded", { limit: limit4, maximum });
}
function invalid4() {
  fail("INVALID_SVG", "Invalid SVG primitive geometry");
}
var MIN = 0.01;
var MAX = 1e6;
var MAX_WORK = 10 * 1024 * 1024;
function paintedBounds(element) {
  const e = element, m = e.transform, r = e.stroke ? e.strokeWidth / 2 : 0;
  if (e.type === "ellipse") {
    const [cx, cy] = apply(m, [e.cx, e.cy]), x = Math.hypot(m[0] * e.rx, m[2] * e.ry) + r * Math.hypot(m[0], m[2]), y = Math.hypot(m[1] * e.rx, m[3] * e.ry) + r * Math.hypot(m[1], m[3]);
    return { x: cx - x, y: cy - y, width: 2 * x, height: 2 * y };
  }
  if (e.type === "rect") {
    if (!r) return transformBounds(m, { x: e.x, y: e.y, width: e.width, height: e.height });
    if (e.lineJoin !== "round") return transformBounds(m, { x: e.x - r, y: e.y - r, width: e.width + 2 * r, height: e.height + 2 * r });
    const b = transformBounds(m, { x: e.x, y: e.y, width: e.width, height: e.height }), x = r * Math.hypot(m[0], m[2]), y = r * Math.hypot(m[1], m[3]);
    return { x: b.x - x, y: b.y - y, width: b.width + 2 * x, height: b.height + 2 * y };
  }
  if (e.type === "line") {
    const start = apply(m, e.start), end = apply(m, e.end), base = { x: Math.min(start[0], end[0]), y: Math.min(start[1], end[1]), width: Math.abs(start[0] - end[0]), height: Math.abs(start[1] - end[1]) };
    const dx = e.end[0] - e.start[0], dy = e.end[1] - e.start[1], length = Math.hypot(dx, dy), u = [dx / length, dy / length], n = [-u[1], u[0]];
    let x, y;
    if (e.lineCap === "round") {
      x = r * Math.hypot(m[0], m[2]);
      y = r * Math.hypot(m[1], m[3]);
    } else {
      x = r * Math.abs(m[0] * n[0] + m[2] * n[1]);
      y = r * Math.abs(m[1] * n[0] + m[3] * n[1]);
      if (e.lineCap === "square") {
        x += r * Math.abs(m[0] * u[0] + m[2] * u[1]);
        y += r * Math.abs(m[1] * u[0] + m[3] * u[1]);
      }
    }
    return { x: base.x - x, y: base.y - y, width: base.width + 2 * x, height: base.height + 2 * y };
  }
  if (e.type === "path") {
    const bounds = straightPaintedBounds(e);
    if (bounds !== void 0) return bounds;
  }
  return elementBounds(e);
}
function normalizeSVGGeometry(styled, options = {}) {
  if (!styled || !Array.isArray(styled.records) || !styled.records.length || !options || typeof options !== "object" || Array.isArray(options) || Object.keys(options).some((k) => !["limits", "maxWork"].includes(k))) fail("INVALID_ARGUMENT", "Invalid SVG geometry input/options");
  const limits = resolveLimits(options.limits), maxWork = options.maxWork ?? MAX_WORK;
  if (!Number.isSafeInteger(maxWork) || maxWork < 1 || maxWork > MAX_WORK) fail("INVALID_ARGUMENT", "SVG geometry work must be a downward positive integer");
  const records = styled.records, root = records[0];
  if (records.length > 2e4) exceeded3("svgGeometryNodes", 2e4);
  if (root.name !== "svg" || root.parent !== null) fail("INVALID_ARGUMENT", "SVG geometry needs a styled root");
  if (!records.some((record) => record.paint?.fill || record.paint?.stroke)) fail("EMPTY_IMPORT", "SVG contains no painted geometry");
  const viewport = resolveSVGRootCoordinates(root.attributes);
  const rootTransformed = viewport.rootTransform.some((n, i) => n !== IDENTITY[i]);
  const matrices = [], beforeRootMatrices = [], elements = [], prefix = createId();
  let points = 0, derived = 0, work = 0, bounds = null;
  let arcTolerance = 0.1;
  if (rootTransformed) {
    try {
      const inv = inverse(viewport.rootTransform);
      arcTolerance /= Math.max(1, Math.hypot(...inv.slice(0, 4)));
    } catch {
      arcTolerance = 0;
    }
  }
  const charge = (amount) => {
    work += amount;
    if (work > maxWork) exceeded3("svgGeometryWork", maxWork);
  };
  const dimension = (value2) => {
    if (value2 < MIN || value2 > MAX) exceeded3("svgPrimitiveRange", MAX);
    return value2;
  };
  const length = (attrs, key, fallback = 0) => attrs[key] === void 0 ? fallback : parseSVGLength(attrs[key]);
  function path(data, matrix, close = false) {
    charge(data.length);
    const remaining = Math.min(limits.points - points, limits.derivedSegments - derived), reserve = close ? 1 : 0;
    const maximum = Math.min(1e5, limits.pointsPerElement, limits.derivedSegmentsPerElement, remaining) - reserve;
    if (maximum < 1) exceeded3("svgCommands", Math.max(0, remaining));
    if (/[Aa]/.test(data) && !(arcTolerance > 0)) exceeded3("svgNumericRange", 1e7);
    const commands = normalizeSVGPath(data, { transform: validateSVGImportMatrix(matrix), tolerance: arcTolerance || 0.1, maxCommands: maximum, maxTokens: Math.min(1e6, Math.max(1, maxWork - work + data.length)) });
    if (close && commands.length) commands.push(["Z"]);
    return commands;
  }
  for (let index = 0; index < records.length; index++) {
    charge(1);
    const record = records[index], a = record.attributes;
    if (record.hidden || record.active === false) continue;
    if (index && (!Number.isInteger(record.parent) || record.parent < 0 || record.parent >= index || !matrices[record.parent])) fail("INVALID_ARGUMENT", "Invalid SVG styled ancestry");
    charge((a.transform ?? "").length);
    const local = index ? parseSVGTransform(a.transform ?? "") : null;
    const matrix = index ? multiply(matrices[record.parent], local) : viewport.matrix;
    const beforeRoot = rootTransformed ? index ? multiply(beforeRootMatrices[record.parent], local) : viewport.beforeRootMatrix : matrix;
    if (!matrix.every(Number.isFinite) || matrix.some((n) => Math.abs(n) > 1e7)) exceeded3("svgNumericRange", 1e7);
    matrices[index] = matrix;
    beforeRootMatrices[index] = beforeRoot;
    const p = record.paint;
    if (!p || !p.fill && !p.stroke) continue;
    if (elements.length >= limits.elements) exceeded3("elements", limits.elements);
    const base = { id: `${prefix}-element-${elements.length + 1}`, transform: [...matrix], ...p };
    let e, cost = 0, approximation = 0, sourcePrimitive = null;
    const pathElement = (data, close = false) => {
      const commands = path(data, matrix, close);
      return { ...base, type: "path", commands };
    };
    const ellipseData = (cx, cy, rx, ry) => `M${cx + rx} ${cy}A${rx} ${ry} 0 0 1 ${cx} ${cy + ry}A${rx} ${ry} 0 0 1 ${cx - rx} ${cy}A${rx} ${ry} 0 0 1 ${cx} ${cy - ry}A${rx} ${ry} 0 0 1 ${cx + rx} ${cy}Z`;
    if (record.name === "path" || record.name === "polyline" || record.name === "polygon") {
      if (record.name !== "path" && a.points && /[^0-9eE+.,\-\t\r\n ]/.test(a.points)) invalid4();
      const data = record.name === "path" ? a.d ?? "" : a.points?.trim() ? "M" + a.points : "";
      if (!data.trim()) continue;
      const commands = path(data, matrix, record.name === "polygon");
      if (p.stroke && p.lineCap !== "butt") {
        let anchor = null, drawn = false, pointOnly = true;
        const possibleOmittedSegment = record.name !== "path" || /[LlHhVvQqTtCcSsAaZz]/.test(data);
        const check = () => {
          if (anchor && pointOnly && (drawn || possibleOmittedSegment)) unsupported4("zeroLengthPathCap");
        };
        for (const [op, ...values] of commands) {
          if (op === "M") {
            check();
            anchor = values;
            drawn = false;
            pointOnly = true;
          } else if (op !== "Z") {
            drawn = true;
            for (let i = 0; i < values.length; i += 2) if (values[i] !== anchor[0] || values[i + 1] !== anchor[1]) pointOnly = false;
          }
        }
        check();
      }
      if (!commands.some((command) => ["L", "Q", "C"].includes(command[0]))) continue;
      e = { ...base, type: "path", commands };
      cost = commands.length;
      if (record.name === "path" && /[Aa]/.test(data)) approximation = 0.1;
    } else if (record.name === "rect") {
      const width2 = length(a, "width"), height = length(a, "height"), rx = length(a, "rx"), ry = length(a, "ry");
      if (width2 < 0 || height < 0 || rx < 0 || ry < 0) invalid4();
      if (!width2 || !height) continue;
      if (rx || ry) unsupported4("roundedRect");
      const x = length(a, "x"), y = length(a, "y");
      if (width2 < MIN || height < MIN || width2 > MAX || height > MAX) e = pathElement(`M${x} ${y}L${x + width2} ${y}L${x + width2} ${y + height}L${x} ${y + height}Z`);
      else e = { ...base, type: "rect", x, y, width: dimension(width2), height: dimension(height) };
      cost = e.type === "path" ? e.commands.length : 5;
    } else if (record.name === "ellipse" || record.name === "circle") {
      const rx = length(a, record.name === "circle" ? "r" : "rx"), ry = record.name === "circle" ? rx : length(a, "ry");
      if (rx < 0 || ry < 0) invalid4();
      if (!rx || !ry) continue;
      const cx = length(a, "cx"), cy = length(a, "cy"), original = { ...base, type: "ellipse", cx, cy, rx, ry };
      if (rx < MIN || ry < MIN || rx > MAX || ry > MAX) {
        e = pathElement(ellipseData(cx, cy, rx, ry));
        sourcePrimitive = original;
      } else e = original;
      cost = e.type === "path" ? e.commands.length : 4;
    } else if (record.name === "line") {
      if (!p.stroke) continue;
      const start = [length(a, "x1"), length(a, "y1")], end = [length(a, "x2"), length(a, "y2")];
      if (start[0] === end[0] && start[1] === end[1]) {
        if (p.lineCap === "butt") continue;
        const r = p.strokeWidth / 2, [cx, cy] = start, dot2 = { ...base, fill: p.stroke, stroke: null, strokeWidth: 0 };
        if (p.lineCap === "square") {
          e = 2 * r >= MIN && 2 * r <= MAX ? { ...dot2, type: "rect", x: cx - r, y: cy - r, width: 2 * r, height: 2 * r } : { ...pathElement(`M${cx - r} ${cy - r}L${cx + r} ${cy - r}L${cx + r} ${cy + r}L${cx - r} ${cy + r}Z`), fill: p.stroke, stroke: null, strokeWidth: 0 };
          cost = 5;
        } else if (r >= MIN) {
          e = { ...dot2, type: "ellipse", cx, cy, rx: r, ry: r };
          cost = 4;
        } else {
          e = { ...pathElement(ellipseData(cx, cy, r, r)), fill: p.stroke, stroke: null, strokeWidth: 0 };
          cost = e.commands.length;
          sourcePrimitive = { ...dot2, type: "ellipse", cx, cy, rx: r, ry: r };
        }
      } else {
        e = { ...base, type: "line", start, end };
        cost = 2;
      }
    } else unsupported4("element");
    if (e.type === "path" && !e.commands.some((command) => ["L", "Q", "C"].includes(command[0]))) continue;
    e.transform = validateSVGImportMatrix(matrix);
    const pathPoints = e.type === "path" ? cost : 0;
    if (pathPoints > limits.pointsPerElement || pathPoints > limits.points - points) exceeded3("points", limits.points);
    if (cost > limits.derivedSegmentsPerElement || cost > limits.derivedSegments - derived) exceeded3("derivedSegments", limits.derivedSegments);
    const painted = unionBounds(sourcePrimitive && paintedBounds(sourcePrimitive), expandBounds(paintedBounds(e), approximation));
    if (!painted) continue;
    if (!Object.values(painted).every(Number.isFinite)) exceeded3("svgNumericRange", 1e7);
    const epsilon = 64 * Number.EPSILON * Math.max(1, viewport.width, viewport.height);
    const checkViewport = (b) => {
      if (!b || !Object.values(b).every(Number.isFinite)) exceeded3("svgNumericRange", 1e7);
      if (b.x < -epsilon || b.y < -epsilon || b.x + b.width > viewport.width + epsilon || b.y + b.height > viewport.height + epsilon) unsupported4("rootViewportClipping");
    };
    checkViewport(painted);
    if (rootTransformed) checkViewport(unionBounds(sourcePrimitive && paintedBounds({ ...sourcePrimitive, transform: beforeRoot }), expandBounds(paintedBounds({ ...e, transform: beforeRoot }), approximation)));
    points += pathPoints;
    derived += cost;
    bounds = unionBounds(bounds, painted);
    elements.push(e);
  }
  if (!elements.length) fail("EMPTY_IMPORT", "SVG contains no painted geometry");
  const document = validateDocument({ format: "lightmetal-etch", version: 1, background: null, assets: [], layers: [{ id: `${prefix}-layer`, name: "Imported SVG", visible: true, locked: false, offset: [0, 0], elements }] }, limits);
  return { document, viewport: { ...viewport.viewport }, bounds, stats: { elements: elements.length, points, derivedSegments: derived, work } };
}

// src/etch/svg-import.js
var MAX_SVG_INPUT_BYTES = 5 * 1024 * 1024;
var cancelled2 = (signal) => {
  if (signal?.aborted) fail("CANCELLED", "SVG import cancelled");
};
function tooLarge(maximum) {
  fail("LIMIT_EXCEEDED", "SVG exceeds the input byte limit", { limit: "svgBytes", maximum });
}
async function readSVGInput(value2, limits = {}, signal) {
  const maximum = Math.min(MAX_SVG_INPUT_BYTES, resolveLimits(limits).jsonBytes);
  cancelled2(signal);
  if (typeof value2 === "string") {
    if (value2.length > maximum || new TextEncoder().encode(value2).byteLength > maximum) tooLarge(maximum);
    return value2;
  }
  return readUTF8Blob(value2, { maximum, signal, invalidCode: "INVALID_SVG", label: "SVG" });
}
function simpleEmptyFill(data) {
  if (data.length > 2048) return false;
  let commands;
  try {
    commands = normalizeSVGPath(data, { maxCommands: 64, maxTokens: 512 });
  } catch {
    return false;
  }
  let points = [];
  const empty = () => {
    if (points.length <= 2) return true;
    const [x, y] = points[0], other = points.find((p) => p[0] !== x || p[1] !== y);
    if (!other) return true;
    if (points.every((p) => p[0] === x) || points.every((p) => p[1] === y)) return true;
    return points.every((p) => p.every(Number.isInteger)) && points.every(([a, b]) => (other[0] - x) * (b - y) === (other[1] - y) * (a - x));
  };
  for (const [op, ...coords] of commands) {
    if (op === "M") {
      if (!empty()) return false;
      points = [[...coords]];
    } else if (op !== "Z") for (let i = 0; i < coords.length; i += 2) points.push(coords.slice(i, i + 2));
  }
  return empty();
}
function parseSVGForImport(source, limits = {}, environment = {}) {
  limits = resolveLimits(limits);
  const inspection = inspectSVGXMLForImport(source, { maxBytes: Math.min(MAX_SVG_INPUT_BYTES, limits.jsonBytes), DOMParser: environment.DOMParser ?? globalThis.DOMParser });
  const parents = /* @__PURE__ */ new WeakMap(), matrices = /* @__PURE__ */ new WeakMap(), stack = [inspection.tree];
  while (stack.length) {
    const node = stack.pop();
    for (const child of node.children) {
      parents.set(child, node);
      stack.push(child);
    }
  }
  const matrixOf = (node) => {
    if (matrices.has(node)) return matrices.get(node);
    const parent = parents.get(node), matrix = parent ? multiply(matrixOf(parent), parseSVGTransform(node.attributes.transform ?? "")) : resolveSVGRootCoordinates(node.attributes).matrix;
    matrices.set(node, matrix);
    return matrix;
  };
  const zero = (a, key, defaultZero = true) => {
    if (a[key] === void 0) return defaultZero;
    try {
      return parseSVGLength(a[key], { percentBase: 1 }) === 0;
    } catch {
      return false;
    }
  };
  const isGeometryEmpty = (node, computed) => {
    const a = node.attributes;
    if (node.name === "rect" && (zero(a, "width") || zero(a, "height")) || node.name === "circle" && zero(a, "r") || node.name === "ellipse" && (zero(a, "rx") || zero(a, "ry"))) return true;
    const matrix = matrixOf(node);
    if (matrix[0] === 0 && matrix[1] === 0 || matrix[2] === 0 && matrix[3] === 0) return true;
    if (node.name === "line" && computed["stroke-linecap"].trim().toLowerCase() === "butt") {
      try {
        if (["x", "y"].every((axis) => parseSVGLength(a[axis + "1"] ?? "0") === parseSVGLength(a[axis + "2"] ?? "0"))) return true;
      } catch {
      }
    }
    const noStroke = computed.stroke.trim().toLowerCase() === "none" || zero(computed, "stroke-width", false) || Number(computed["stroke-opacity"]) === 0;
    if (noStroke && ["path", "polygon", "polyline"].includes(node.name)) {
      if (node.name !== "path" && /[^0-9eE+.,\-\t\r\n ]/.test(a.points ?? "")) return false;
      const data = node.name === "path" ? a.d ?? "" : (a.points ?? "").trim() ? "M" + a.points : "";
      if (!data.trim() || simpleEmptyFill(data)) return true;
    }
    return false;
  };
  const styled = resolveSVGStyles(inspection, { isGeometryEmpty });
  return normalizeSVGGeometry(styled, { limits });
}

// src/etch/index.js
function createEtch(container, options = {}) {
  if (!container || container.nodeType !== 1 || typeof container.ownerDocument?.createElement !== "function") {
    fail("INVALID_ARGUMENT", "createEtch requires a browser DOM element");
  }
  if (!options || typeof options !== "object" || Array.isArray(options)) fail("INVALID_ARGUMENT", "Expected editor options");
  if (options.drawWithTouch !== void 0 && typeof options.drawWithTouch !== "boolean") fail("INVALID_ARGUMENT", "drawWithTouch must be boolean");
  if (options.sidebarOpen !== void 0 && typeof options.sidebarOpen !== "boolean") fail("INVALID_ARGUMENT", "sidebarOpen must be boolean");
  const state = new EditorState({ readOnly: options.readOnly, limits: options.limits });
  let shell, renderer, input2, exporter, fullscreen, destroyed = false;
  const view = new Viewport(() => renderer?.invalidate(true));
  const tools = new ToolSession({ readOnly: state.readOnly, drawWithTouch: options.drawWithTouch ?? true, onChange: () => {
    shell?.refreshTools();
    input2?.refreshCursor();
    renderer?.invalidate();
  } });
  const alive = () => {
    state.getRevision();
  };
  const report = (error) => {
    if (destroyed) return;
    input2?.cancel();
    const failure = error instanceof EtchError ? error : new EtchError("INVALID_ARGUMENT", "Editor action failed");
    shell?.announce(failure.message, { error: true });
    state.notifyUIError(failure);
  };
  const api = {};
  const readers = ["save", "getRevision", "getActiveLayer", "getSelection", "canUndo", "canRedo", "on"];
  const commands = [
    "setSelection",
    "setActiveLayer",
    "createLayer",
    "renameLayer",
    "deleteLayer",
    "reorderLayer",
    "setLayerVisibility",
    "setLayerLocked",
    "translateLayer",
    "rotateLayer",
    "rotateSelection",
    "mergeDown",
    "deleteSelection",
    "setBackground",
    "undo",
    "redo"
  ];
  for (const name of readers) api[name] = (...args) => state[name](...args);
  for (const name of commands) api[name] = (...args) => {
    alive();
    input2?.cancel();
    return state[name](...args);
  };
  api.getViewState = () => {
    alive();
    return view.get();
  };
  api.setViewState = (value2) => state.runSession(() => {
    input2.cancel();
    view.set(value2);
  });
  api.setExpanded = async (value2) => {
    alive();
    if (typeof value2 !== "boolean") fail("INVALID_ARGUMENT", "Expanded state must be boolean");
    return state.runSessionAsync(() => fullscreen.setExpanded(value2));
  };
  api.fit = () => state.runSession(() => {
    input2.cancel();
    view.fit(documentBounds(state.document));
  });
  api.getTool = () => {
    alive();
    return tools.getTool();
  };
  api.setTool = (tool) => state.runSession(() => {
    input2.cancel();
    tools.setTool(tool);
  });
  api.getToolSettings = (tool) => {
    alive();
    return tools.getSettings(tool);
  };
  api.setToolSettings = (tool, patch) => state.runSession(() => tools.setSettings(tool, patch));
  api.getDrawWithTouch = () => {
    alive();
    return tools.getDrawWithTouch();
  };
  api.setDrawWithTouch = (value2) => state.runSession(() => {
    input2.cancel();
    tools.setDrawWithTouch(value2);
  });
  api.load = async (value2) => {
    alive();
    input2.cancel();
    renderer.clearPreview();
    const promise = state.load(value2);
    shell.refresh();
    input2.refreshCursor();
    try {
      return await promise;
    } finally {
      shell.refresh();
      if (!destroyed) input2.refreshCursor();
    }
  };
  const importCenter = () => {
    const current = view.get();
    return [view.width / 2, view.height / 2].map((n, i) => (n - current.pan[i]) / current.zoom);
  };
  const refreshImport = () => {
    if (!destroyed) {
      shell.refresh();
      input2.refreshCursor();
    }
  };
  async function beginImageSession() {
    alive();
    input2.cancel();
    renderer.clearPreview();
    const pending = state.beginImageImport(importCenter());
    shell.refresh();
    input2.refreshCursor();
    let context;
    try {
      context = await pending;
    } catch (error) {
      refreshImport();
      throw error;
    }
    let source = null, preview = null, closed = false;
    const dispose = () => {
      source?.close();
      source = null;
      preview?.resource.close();
      preview = null;
    };
    const cancel = () => {
      if (closed) return;
      closed = true;
      state.cancelImageImport(context);
      dispose();
      refreshImport();
    };
    context.signal.addEventListener("abort", () => {
      closed = true;
      dispose();
      refreshImport();
    }, { once: true });
    return {
      signal: context.signal,
      async prepare(blob, thumbnail = false) {
        const value2 = await prepareRaster(blob, context, container.ownerDocument, { thumbnail });
        if (closed || context.signal.aborted) {
          value2.close();
          fail("CANCELLED", "Image import cancelled");
        }
        source = value2;
        return { width: source.width, height: source.height, name: source.name, originalBytes: source.originalBytes };
      },
      async encode(options2) {
        if (closed || !source) fail("CANCELLED", "Image import cancelled");
        preview?.resource.close();
        preview = null;
        const value2 = await source.encode(options2);
        if (closed || context.signal.aborted) {
          value2.resource.close();
          fail("CANCELLED", "Image import cancelled");
        }
        try {
          state.previewImageImport(context, value2.asset, source.name);
        } catch (error) {
          value2.resource.close();
          throw error;
        }
        preview = value2;
        return { width: source.width, height: source.height, mime: value2.asset.mime, bytes: value2.bytes, image: value2.resource.image };
      },
      async commit() {
        if (closed || !preview) fail("CANCELLED", "Image import has no ready preview");
        const value2 = preview;
        preview = null;
        try {
          const result = await state.commitImageImport(context, value2.asset, value2.resource, source.name);
          closed = true;
          dispose();
          refreshImport();
          return result;
        } catch (error) {
          cancel();
          throw error;
        }
      },
      cancel
    };
  }
  api.importImage = async (blob, options2) => {
    alive();
    const settings = imageOptions(options2), session = await beginImageSession();
    try {
      await session.prepare(blob);
      await session.encode(settings);
      return await session.commit();
    } finally {
      session.cancel();
    }
  };
  async function beginDocumentSession() {
    alive();
    input2.cancel();
    renderer.clearPreview();
    const pending = state.beginDocumentImport(importCenter());
    refreshImport();
    let context;
    try {
      context = await pending;
    } catch (error) {
      refreshImport();
      throw error;
    }
    return {
      signal: context.signal,
      limits: { ...context.limits },
      prepare: (value2, name) => state.prepareDocumentImport(context, value2, name),
      async commit() {
        try {
          return await state.commitDocumentImport(context);
        } finally {
          refreshImport();
        }
      },
      cancel() {
        state.cancelDocumentImport(context);
        refreshImport();
      }
    };
  }
  api.importDocument = async (value2) => {
    alive();
    input2.cancel();
    renderer.clearPreview();
    const pending = state.importDocument(value2, importCenter());
    refreshImport();
    try {
      return await pending;
    } finally {
      refreshImport();
    }
  };
  async function beginSVGSession() {
    const session = await beginDocumentSession();
    let started = false;
    return { ...session, async prepare(value2, name = "Imported SVG") {
      if (session.signal.aborted) fail("CANCELLED", "SVG import cancelled");
      if (started) fail("BUSY", "SVG import is already preparing or prepared");
      started = true;
      try {
        const source = await readSVGInput(value2, session.limits, session.signal);
        if (session.signal.aborted) fail("CANCELLED", "SVG import cancelled");
        const result = parseSVGForImport(source, session.limits, { DOMParser: container.ownerDocument.defaultView?.DOMParser });
        if (session.signal.aborted) fail("CANCELLED", "SVG import cancelled");
        const summary = await session.prepare(result.document, name);
        return { ...summary, svgViewport: { ...result.viewport } };
      } catch (error) {
        session.cancel();
        if (error.code === "UNSUPPORTED_SVG_FEATURE") {
          const features = error.details?.features?.slice(0, 6).map((item) => item.feature).join(", ") || "appearance";
          fail(error.code, `Unsupported editable SVG: ${features}. Export PNG in your drawing app and use Import image for this artwork.`, error.details);
        }
        throw error;
      }
    } };
  }
  api.importSVG = async (value2, options2) => {
    alive();
    if (options2 !== void 0) fail("INVALID_ARGUMENT", "SVG import currently accepts editable vectors only, with no options");
    const session = await beginSVGSession();
    try {
      await session.prepare(value2);
      return await session.commit();
    } finally {
      session.cancel();
    }
  };
  api.exportSVG = (options2) => {
    alive();
    const { document, revision, limits } = state.captureVectorExport();
    return { svg: serializeSVG(document, options2, limits), revision };
  };
  api.exportPNG = async (options2) => {
    alive();
    return exporter.exportPNG(options2);
  };
  api.cancel = () => {
    state.cancel();
    input2.cancel();
    renderer.clearPreview();
    shell.closeBackgroundDialog(false);
    shell.refresh();
  };
  api.destroy = () => {
    if (destroyed) return;
    destroyed = true;
    fullscreen.destroy();
    input2.destroy();
    renderer.destroy();
    exporter.destroy();
    state.destroy();
    shell.destroy();
  };
  try {
    exporter = createPNGExporter(container.ownerDocument, state);
    shell = createShell(container, state, {
      ...api,
      cancelGesture: () => input2?.cancel(),
      previewBackground: (value2) => renderer?.setBackgroundPreview(value2),
      beginImageSession,
      beginDocumentSession,
      beginSVGSession,
      getShapeTool: () => tools.getShapeTool(),
      actualSize() {
        state.runSession(() => {
          input2.cancel();
          view.zoomAt(1);
        });
      }
    }, report, { sidebarOpen: options.sidebarOpen ?? false });
    renderer = createCanvasRenderer(shell.viewport, state, view, {
      onViewChange(value2) {
        shell.updateView(value2);
        state.notifyViewChange(value2);
      },
      onResize() {
        input2?.cancel();
      },
      onError: report,
      isSelectionTool: () => tools.getTool() === "select"
    });
    input2 = createInputController(shell.viewport, shell.root, view, { state, tools, renderer, fit: api.fit, setTool: (tool) => shell.selectTool(tool), onError: report });
    fullscreen = createFullscreen(shell.root, {
      onBeforeChange() {
        input2.cancel();
        renderer.clearPreview();
      },
      onChange(value2) {
        view.setExpanded(value2);
        shell.updateView(view.get());
      },
      onError: report
    });
  } catch (error) {
    destroyed = true;
    fullscreen?.destroy();
    input2?.destroy();
    renderer?.destroy();
    exporter?.destroy();
    state.destroy();
    shell?.destroy();
    throw error;
  }
  state.on("change", ({ label }) => {
    input2.cancel();
    renderer.invalidate();
    shell.refresh();
    shell.announce(label);
  });
  state.on("load", () => {
    input2.cancel();
    renderer.resetCache();
    shell.refresh();
    shell.announce("Document loaded");
  });
  state.on("selectionchange", () => {
    input2.cancel();
    renderer.invalidate();
    shell.refresh();
  });
  return Object.freeze(api);
}
export {
  EtchError,
  createEtch
};
