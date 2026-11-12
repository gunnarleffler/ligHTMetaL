import {fail} from './errors.js';
import {documentBounds} from './geometry/paths.js';

const finite = n => typeof n === 'number' && Number.isFinite(n);
const object = value => value && typeof value === 'object' && !Array.isArray(value);

/** Common world-space crop/padding contract; no view, DPR or raster allocation. */
export function exportBounds(document,{padding=16,bounds:raw}={}) {
  if (!finite(padding) || padding < 0) fail('INVALID_ARGUMENT','Export padding must be a non-negative finite number');
  if (raw !== undefined && (!object(raw) || Object.keys(raw).some(k => !['x','y','width','height'].includes(k)) || !['x','y','width','height'].every(k => finite(raw[k])) || raw.width <= 0 || raw.height <= 0)) fail('INVALID_ARGUMENT','Export bounds require finite x/y and positive width/height');
  if (raw === undefined) {
    const painted = documentBounds(document);
    // A fill-only collinear path can have bounds but no painted area. Never emit
    // a zero-sized SVG viewport when padding is explicitly zero.
    raw = painted && painted.width > 0 && painted.height > 0 ? painted : {x:-128,y:-128,width:256,height:256};
  }
  const bounds = {x:raw.x-padding,y:raw.y-padding,width:raw.width+2*padding,height:raw.height+2*padding};
  if (!Object.values(bounds).every(finite) || !finite(bounds.x+bounds.width) || !finite(bounds.y+bounds.height)) fail('INVALID_ARGUMENT','Export bounds overflow supported coordinates');
  return bounds;
}
