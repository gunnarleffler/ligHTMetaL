import { fail } from './errors.js';
import { normalizeBackground } from './background.js';
import { singularValues } from './geometry/matrix.js';
import { elementBounds } from './geometry/paths.js';
import { MAX_STROKE_SEGMENTS, visitStrokeOutline } from './geometry/stroke.js';
import { MAX_INK_PARTS, partControls } from './geometry/ink.js';
import { positiveConvex } from './geometry/convex.js';
import { base64ByteLength, bytesFromBase64, inspectRaster } from './raster.js';

export const DEFAULT_LIMITS = Object.freeze({
  layers: 128, elements: 20_000, pointsPerElement: 100_000, points: 1_000_000,
  derivedSegmentsPerElement: MAX_STROKE_SEGMENTS, derivedSegments: 2_000_000,
  assets: 64, assetBytes: 64*1024*1024, jsonBytes: 128*1024*1024,
  rasterDimension: 8192, assetPixels: 16_777_216, totalPixels: 33_554_432,
});
const WORLD = 10_000_000;
const COMMAND_LENGTHS = Object.freeze({M:3,L:3,Q:5,C:7,Z:1});
const encoder = new TextEncoder();
// Only outputs minted here qualify. A frozen caller-supplied object is not proof
// of validation; snapshots mutated before freezing must also miss this cache.
const checkedAssets = new WeakMap();

export function resolveLimits(overrides = {}) {
  object(overrides, 'limits', 'INVALID_ARGUMENT');
  const result = { ...DEFAULT_LIMITS };
  for (const [name, value] of Object.entries(overrides)) {
    if (!Object.hasOwn(result, name) || !Number.isSafeInteger(value) || value < 1 || value > result[name]) {
      fail('INVALID_ARGUMENT', 'Limits must be known positive integers no greater than defaults', { limit: name });
    }
    result[name] = value;
  }
  return Object.freeze(result);
}

function invalid(path, message) { fail('INVALID_DOCUMENT', message, { path }); }
function object(value, path, code = 'INVALID_DOCUMENT') {
  if (value === null || typeof value !== 'object' || Array.isArray(value)
      || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    fail(code, 'Expected a plain object', { path });
  }
}
function array(value, path) {
  if (!Array.isArray(value)) invalid(path, 'Expected an array');
  return value;
}
function number(value, path, min = -WORLD, max = WORLD) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    invalid(path, `Expected a finite number in [${min}, ${max}]`);
  }
  return Object.is(value, -0) ? 0 : value;
}
function tuple(value, size, path, min = -WORLD, max = WORLD) {
  array(value, path);
  if (value.length !== size) invalid(path, `Expected ${size} numbers`);
  return Array.from(value, (n, i) => number(n, `${path}[${i}]`, min, max));
}
function bool(value, path) {
  if (typeof value !== 'boolean') invalid(path, 'Expected a boolean');
  return value;
}
function text(value, path, min, max) {
  if (typeof value !== 'string' || value.length < min || value.length > max) invalid(path, 'Invalid text length');
  return value;
}
function choice(value, values, path) {
  if (!values.includes(value)) invalid(path, 'Unsupported value');
  return value;
}
function color(value, path) {
  if (value === null) return null;
  if (typeof value !== 'string' || !/^#[\da-f]{6}$/i.test(value)) invalid(path, 'Expected null or opaque #RRGGBB');
  return value.toUpperCase();
}
function limit(value, maximum, name) {
  if (value > maximum) fail('LIMIT_EXCEEDED', `Exceeded ${name} limit`, { limit: name, maximum, actual: value });
}

/** Checks dimensions before allocating a decoded pixel buffer. Browser decode is still required. */
export function inspectPNG(data, path = 'asset.data') {
  if (typeof data !== 'string' || data.length % 4 !== 0
      || !/^[A-Za-z0-9+/]*={0,2}$/.test(data)) {
    invalid(path, 'Expected padded base64 PNG bytes');
  }
  const byteLength = base64ByteLength(data);
  if (byteLength < 45) invalid(path, 'Truncated PNG');
  const header = Uint8Array.from(atob(data.slice(0, 44)), c => c.charCodeAt(0));
  const signature = [137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82];
  if (!signature.every((v, i) => header[i] === v)) invalid(path, 'Expected a PNG signature and IHDR');
  const view = new DataView(header.buffer);
  const width = view.getUint32(16), height = view.getUint32(20);
  if (!width || !height) invalid(path, 'PNG dimensions must be positive');
  // Inspect chunk headers with tiny base64 slices; do not decode a large asset just
  // to reject animation/truncation before allocating browser pixel buffers.
  const range = (offset,count) => {
    const start = Math.floor(offset/3),text = atob(data.slice(start*4,Math.ceil((offset+count)/3)*4));
    return Uint8Array.from(text.slice(offset-start*3,offset-start*3+count),c => c.charCodeAt(0));
  };
  let ended = false,chunks = 0;
  for (let i = 8;i < byteLength;) {
    if (++chunks > 10000 || i+12 > byteLength) invalid(path,'Invalid or excessive PNG chunks');
    const bytes = range(i,8),length = new DataView(bytes.buffer).getUint32(0),type = String.fromCharCode(...bytes.subarray(4));
    if (i+12+length > byteLength) invalid(path,'Truncated PNG chunk');
    if (type === 'IHDR' && i !== 8) invalid(path,'PNG must have exactly one IHDR');
    if (['acTL','fcTL','fdAT'].includes(type)) invalid(path,'Native PNG assets must be still images');
    i += 12+length;
    if (type === 'IEND') {ended = length === 0 && i === byteLength;break;}
  }
  if (!ended) invalid(path,'PNG has no complete IEND');
  return { width, height, byteLength };
}

/** Construct fresh whitelisted v1 data. No DOM, migration guesses, or silent element loss. */
export function validateDocument(input, overrides = {}) {
  const limits = resolveLimits(overrides);
  if (typeof input === 'string') {
    limit(input.length, limits.jsonBytes, 'jsonBytes');
    limit(encoder.encode(input).byteLength, limits.jsonBytes, 'jsonBytes');
    try { input = JSON.parse(input); } catch { invalid('$', 'Invalid JSON'); }
  }
  object(input, '$');
  if (input.format !== 'lightmetal-etch') invalid('format', 'Not an Etch document');
  if (input.version !== 1) fail('UNSUPPORTED_VERSION', 'Only Etch document version 1 is supported', { version: typeof input.version === 'number' ? input.version : null });
  const ids = new Set();
  const id = (value, path) => {
    text(value, path, 1, Infinity);
    if (ids.has(value)) invalid(path, 'Duplicate document ID');
    ids.add(value); return value;
  };
  let pointCount = 0, elementCount = 0, assetBytes = 0, totalPixels = 0, derivedCount = 0, encodedAssetBytes = 0;
  const accountPoints = (count) => {
    limit(count, limits.pointsPerElement, 'pointsPerElement');
    pointCount += count; limit(pointCount, limits.points, 'points');
  };
  const assetMap = new Map();
  array(input.assets, 'assets'); limit(input.assets.length, limits.assets, 'assets');
  const assets = Array.from(input.assets, (asset, i) => {
    const p = `assets[${i}]`; object(asset, p);
    const assetId = id(asset.id, `${p}.id`);
    if (!['image/png','image/webp'].includes(asset.mime)) invalid(`${p}.mime`, 'Native assets must be PNG or static WebP');
    // Check encoded size before scanning base64 or decoding even a header.
    if (typeof asset.data !== 'string') invalid(`${p}.data`, 'Expected base64');
    limit(asset.data.length, Math.ceil(limits.assetBytes/3)*4, 'assetBytes');
    const checked = checkedAssets.get(asset);
    let info = checked && Object.isFrozen(asset)
      && Object.getOwnPropertyDescriptor(asset,'data')?.value === checked.data
      && Object.getOwnPropertyDescriptor(asset,'mime')?.value === checked.mime ? checked.info : null;
    if (!info) {
      if (asset.mime === 'image/png') info = inspectPNG(asset.data, `${p}.data`);
      else {
        if (asset.data.length%4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(asset.data)) invalid(`${p}.data`,'Expected padded base64 WebP bytes');
        info = inspectRaster(bytesFromBase64(asset.data),{code:'INVALID_DOCUMENT',allowJPEG:false,allowAnimation:false});
        if (info.mime !== asset.mime) invalid(`${p}.mime`,'Asset MIME disagrees with its bytes');
      }
    }
    const width = number(asset.width, `${p}.width`, 1, WORLD);
    const height = number(asset.height, `${p}.height`, 1, WORLD);
    limit(Math.max(width, height), limits.rasterDimension, 'rasterDimension');
    if (!Number.isInteger(width) || !Number.isInteger(height) || info.width !== width || info.height !== height) invalid(p, 'Raster and asset dimensions disagree');
    limit(width*height, limits.assetPixels, 'assetPixels');
    assetBytes += info.byteLength; totalPixels += width*height;
    limit(assetBytes, limits.assetBytes, 'assetBytes'); limit(totalPixels, limits.totalPixels, 'totalPixels');
    const result = { id: assetId, mime: asset.mime, width, height, data: asset.data };
    checkedAssets.set(result,{mime:result.mime,data:result.data,info});
    encodedAssetBytes += result.data.length;
    assetMap.set(assetId, result); return result;
  });
  function element(value, p, offset) {
    object(value, p);
    const transform = tuple(value.transform, 6, `${p}.transform`);
    for (let i = 0; i < 4; i++) number(transform[i], `${p}.transform[${i}]`, -10_000, 10_000);
    const [small, large] = singularValues(transform);
    if (small < 0.0001 || large > 10_000) invalid(`${p}.transform`, 'Singular or out-of-range affine scale');
    const e = { id: id(value.id, `${p}.id`), type: value.type, transform };
    let complexity = 0;
    const n = (key, min = -WORLD, max = WORLD) => number(value[key], `${p}.${key}`, min, max);
    const dimension = key => n(key, 0.01, 1_000_000);
    const pair = key => tuple(value[key], 2, `${p}.${key}`);
    const paint = (fillAllowed) => {
      if (fillAllowed) e.fill = color(value.fill, `${p}.fill`);
      e.stroke = color(value.stroke, `${p}.stroke`);
      e.strokeWidth = e.stroke ? dimension('strokeWidth') : 0;
      if (!e.fill && !e.stroke) invalid(p, 'Vector element has neither fill nor stroke');
    };
    const cap = () => { e.lineCap = choice(value.lineCap, ['butt','round','square'], `${p}.lineCap`); };
    const join = () => {
      e.lineJoin = choice(value.lineJoin, ['miter','round','bevel'], `${p}.lineJoin`);
      e.miterLimit = n('miterLimit', 1, Number.MAX_VALUE);
    };
    switch (e.type) {
      case 'stroke': case 'highlight':
        if (e.type === 'highlight') {
          e.opacity = n('opacity',0.05,1);
          if (value.pressure !== false) invalid(p,'Highlighter pressure must be false');
        }
        array(value.points, `${p}.points`); accountPoints(value.points.length);
        if (!value.points.length) invalid(p, 'A stroke needs at least one sample');
        e.pressure = bool(value.pressure, `${p}.pressure`);
        e.points = Array.from(value.points, (point, i) => {
          const result = tuple(point, 3, `${p}.points[${i}]`);
          result[2] = number(result[2], `${p}.points[${i}][2]`, 0, 1);
          if (!e.pressure) result[2] = 1;
          return result;
        });
        e.color = color(value.color, `${p}.color`);
        if (!e.color) invalid(p, 'Stroke color cannot be null');
        e.width = dimension('width');
        // Stop on the remaining aggregate allowance, not just the per-element cap.
        // Otherwise many tiny stored strokes could each expand to half a million commands.
        {
          const remaining = limits.derivedSegments-derivedCount;
          const budget = Math.min(limits.derivedSegmentsPerElement,remaining);
          try { complexity = visitStrokeOutline(e,undefined,{maxSegments:budget}); }
          catch (error) {
            if (error.code !== 'LIMIT_EXCEEDED' || error.details.limit !== 'derivedSegments') throw error;
            const name = remaining < limits.derivedSegmentsPerElement ? 'derivedSegments' : 'derivedSegmentsPerElement';
            fail('LIMIT_EXCEEDED','Pressure outline is too complex',{limit:name,maximum:limits[name]});
          }
        }
        break;
      case 'ink': {
        e.color = color(value.color, `${p}.color`);
        if (!e.color) invalid(p,'Ink color cannot be null');
        array(value.parts,`${p}.parts`);limit(value.parts.length,MAX_INK_PARTS,'inkParts');
        if (!value.parts.length) invalid(p,'Ink needs at least one painted part');
        let count = 0;
        for (const [i,part] of Array.from(value.parts).entries()) {array(part,`${p}.parts[${i}]`);count += part.length;}
        accountPoints(count);complexity = count;
        e.parts = Array.from(value.parts,(part,i) => {
          const pp = `${p}.parts[${i}]`;
          if (part.length < 3) invalid(pp,'Ink parts must be closed convex subpaths');
          const commands = Array.from(part,(command,j) => {
            const cp = `${pp}[${j}]`;array(command,cp);
            const op = command[0];
            if (!Object.hasOwn(COMMAND_LENGTHS,op) || command.length !== COMMAND_LENGTHS[op] || (j === 0 ? op !== 'M' : j === part.length-1 ? op !== 'Z' : !['L','Q','C'].includes(op))) invalid(cp,'Invalid ink command');
            return [op,...Array.from(command.slice(1),(v,k) => number(v,`${cp}[${k+1}]`))];
          });
          if (!positiveConvex(partControls(commands))) invalid(pp,'Ink parts require positive convex control polygons');
          return commands;
        });
        break;
      }
      case 'line':
        e.start = pair('start'); e.end = pair('end'); paint(false); cap();
        if (e.start[0] === e.end[0] && e.start[1] === e.end[1]) invalid(p, 'Degenerate line');
        complexity = 2;
        break;
      case 'rect':
        e.x = n('x'); e.y = n('y'); e.width = dimension('width'); e.height = dimension('height');
        paint(true); join(); complexity = 5; break;
      case 'ellipse':
        e.cx = n('cx'); e.cy = n('cy'); e.rx = dimension('rx'); e.ry = dimension('ry'); paint(true); complexity = 4; break;
      case 'path': {
        array(value.commands, `${p}.commands`); accountPoints(value.commands.length);
        let open = false;
        e.commands = Array.from(value.commands, (command, i) => {
          const cp = `${p}.commands[${i}]`; array(command, cp);
          const op = command[0];
          if (!Object.hasOwn(COMMAND_LENGTHS, op) || command.length !== COMMAND_LENGTHS[op]) invalid(cp, 'Invalid native path command');
          if (op !== 'M' && !open) invalid(cp, 'A subpath must begin with M, including after Z');
          open = op !== 'Z';
          return [op, ...Array.from(command.slice(1), (v, j) => number(v, `${cp}[${j+1}]`))];
        });
        paint(true); cap(); join();
        e.fillRule = choice(value.fillRule, ['nonzero','evenodd'], `${p}.fillRule`);
        complexity = e.commands.length; break;
      }
      case 'image':
        e.assetId = text(value.assetId, `${p}.assetId`, 1, Infinity);
        if (!assetMap.has(e.assetId)) invalid(`${p}.assetId`, 'Missing image asset');
        e.x = n('x'); e.y = n('y'); e.width = dimension('width'); e.height = dimension('height');
        e.alt = text(value.alt, `${p}.alt`, 0, Infinity); break;
      default: invalid(`${p}.type`, 'Unknown element type');
    }
    limit(complexity,limits.derivedSegmentsPerElement,'derivedSegmentsPerElement');
    derivedCount += complexity; limit(derivedCount,limits.derivedSegments,'derivedSegments');
    const bounds = elementBounds(e, offset);
    if (bounds && [bounds.x, bounds.y, bounds.x+bounds.width, bounds.y+bounds.height].some(v => !Number.isFinite(v) || Math.abs(v) > WORLD)) {
      invalid(p, 'Transformed painted bounds exceed the world range');
    }
    return e;
  }
  array(input.layers, 'layers'); limit(input.layers.length, limits.layers, 'layers');
  if (!input.layers.length) invalid('layers', 'A document needs at least one layer');
  const layers = Array.from(input.layers, (layer, i) => {
    const p = `layers[${i}]`; object(layer, p);
    const result = { id: id(layer.id, `${p}.id`), name: text(layer.name, `${p}.name`, 1, 80),
      visible: bool(layer.visible, `${p}.visible`), locked: bool(layer.locked, `${p}.locked`),
      offset: tuple(layer.offset, 2, `${p}.offset`) };
    array(layer.elements, `${p}.elements`);
    elementCount += layer.elements.length; limit(elementCount, limits.elements, 'elements');
    result.elements = Array.from(layer.elements, (e, j) => element(e, `${p}.elements[${j}]`, result.offset));
    return result;
  });
  const result = { format: 'lightmetal-etch', version: 1, background: normalizeBackground(input.background), layers, assets };
  // Validated base64 is ASCII with no JSON escapes. Count it exactly without
  // copying/re-encoding megabytes of unchanged image bytes on every wet frame.
  const envelope = {...result,assets:assets.map(asset => ({...asset,data:''}))};
  limit(encoder.encode(JSON.stringify(envelope)).byteLength+encodedAssetBytes, limits.jsonBytes, 'jsonBytes');
  return result;
}
