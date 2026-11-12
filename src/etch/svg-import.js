import {fail} from './errors.js';
import {readUTF8Blob} from './text-input.js';
import {resolveLimits} from './validation.js';
import {multiply} from './geometry/matrix.js';
import {inspectSVGXMLForImport} from './import/svg-xml.js';
import {resolveSVGStyles} from './import/svg-style.js';
import {parseSVGLength,parseSVGTransform,resolveSVGRootCoordinates} from './import/svg-coordinates.js';
import {normalizeSVGPath} from './import/svg-path.js';
import {normalizeSVGGeometry} from './import/svg-geometry.js';

export const MAX_SVG_INPUT_BYTES = 5*1024*1024;
const cancelled = signal => {if (signal?.aborted) fail('CANCELLED','SVG import cancelled');};
function tooLarge(maximum) {fail('LIMIT_EXCEEDED','SVG exceeds the input byte limit',{limit:'svgBytes',maximum});}

/** Bounded, abortable UTF-8 file read. Canonical Blob operations bypass overridden
 * text/size methods; byte cap is checked BEFORE reading or decoding file contents.
 */
export async function readSVGInput(value,limits={},signal) {
  const maximum = Math.min(MAX_SVG_INPUT_BYTES,resolveLimits(limits).jsonBytes);cancelled(signal);
  if (typeof value === 'string') {
    if (value.length > maximum || new TextEncoder().encode(value).byteLength > maximum) tooLarge(maximum);
    return value;
  }
  return readUTF8Blob(value,{maximum,signal,invalidCode:'INVALID_SVG',label:'SVG'});
}

// Only prove simple no-area paths. Complex cancellation/self-intersections are
// retained, not guessed away. Small temporary command arrays have fixed limits.
function simpleEmptyFill(data) {
  if (data.length > 2048) return false;
  let commands;try {commands = normalizeSVGPath(data,{maxCommands:64,maxTokens:512});}catch {return false;}
  let points = [];
  const empty = () => {
    if (points.length <= 2) return true;
    const [x,y] = points[0],other = points.find(p => p[0] !== x || p[1] !== y);if (!other) return true;
    if (points.every(p => p[0] === x) || points.every(p => p[1] === y)) return true;
    // Integer products/differences stay below 2^53 (native coordinates <=10m).
    return points.every(p => p.every(Number.isInteger)) && points.every(([a,b]) => (other[0]-x)*(b-y) === (other[1]-y)*(a-x));
  };
  for (const [op,...coords] of commands) {
    if (op === 'M') {if (!empty()) return false;points = [[...coords]];}
    else if (op !== 'Z') for (let i = 0;i < coords.length;i += 2) points.push(coords.slice(i,i+2));
  }
  return empty();
}

/** Full mandatory import conversion. No source markup is rendered/attached; no
 * raster fallback. Unsupported appearance decisions follow computed invisibility.
 */
export function parseSVGForImport(source,limits={},environment={}) {
  limits = resolveLimits(limits);
  const inspection = inspectSVGXMLForImport(source,{maxBytes:Math.min(MAX_SVG_INPUT_BYTES,limits.jsonBytes),DOMParser:environment.DOMParser ?? globalThis.DOMParser});
  const parents = new WeakMap(),matrices = new WeakMap(),stack = [inspection.tree];
  while (stack.length) {const node = stack.pop();for (const child of node.children) {parents.set(child,node);stack.push(child);}}
  const matrixOf = node => {
    if (matrices.has(node)) return matrices.get(node);
    const parent = parents.get(node),matrix = parent ? multiply(matrixOf(parent),parseSVGTransform(node.attributes.transform ?? '')) : resolveSVGRootCoordinates(node.attributes).matrix;
    matrices.set(node,matrix);return matrix;
  };
  const zero = (a,key,defaultZero=true) => {
    if (a[key] === undefined) return defaultZero;
    try {return parseSVGLength(a[key],{percentBase:1}) === 0;}catch {return false;}
  };
  const isGeometryEmpty = (node,computed) => {
    const a = node.attributes;
    if (node.name === 'rect' && (zero(a,'width') || zero(a,'height')) || node.name === 'circle' && zero(a,'r') || node.name === 'ellipse' && (zero(a,'rx') || zero(a,'ry'))) return true;
    const matrix = matrixOf(node);
    // An exactly zero linear column is unambiguously noninvertible, not a
    // near-singular determinant rounded to zero. Noninvertible SVGs do not paint.
    if (matrix[0] === 0 && matrix[1] === 0 || matrix[2] === 0 && matrix[3] === 0) return true;
    if (node.name === 'line' && computed['stroke-linecap'].trim().toLowerCase() === 'butt') {
      try {if (['x','y'].every(axis => parseSVGLength(a[axis+'1'] ?? '0') === parseSVGLength(a[axis+'2'] ?? '0'))) return true;}catch {}
    }
    const noStroke = computed.stroke.trim().toLowerCase() === 'none' || zero(computed,'stroke-width',false) || Number(computed['stroke-opacity']) === 0;
    if (noStroke && ['path','polygon','polyline'].includes(node.name)) {
      if (node.name !== 'path' && /[^0-9eE+.,\-\t\r\n ]/.test(a.points ?? '')) return false;
      const data = node.name === 'path' ? a.d ?? '' : (a.points ?? '').trim() ? 'M'+a.points : '';
      if (!data.trim() || simpleEmptyFill(data)) return true;
    }
    return false;
  };
  const styled = resolveSVGStyles(inspection,{isGeometryEmpty});
  return normalizeSVGGeometry(styled,{limits});
}
