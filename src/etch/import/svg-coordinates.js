import {fail} from '../errors.js';
import {IDENTITY,multiply,singularValues} from '../geometry/matrix.js';

const WORLD = 10_000_000,MAX_INPUT = 65536,MAX_TRANSFORMS = 2000;
const ws = c => c === ' ' || c === '\t' || c === '\r' || c === '\n';
const digit = c => c >= '0' && c <= '9';
function invalid() {fail('INVALID_SVG','Invalid SVG coordinate syntax');}
function limit(name,maximum) {fail('LIMIT_EXCEEDED','SVG coordinate safety limit exceeded',{limit:name,maximum});}
function numeric() {limit('svgNumericRange',WORLD);}
function unsupported(feature) {fail('UNSUPPORTED_SVG_FEATURE','SVG coordinate feature is outside the editable vector subset',{features:[{feature}]});}
function input(value) {
  if (typeof value !== 'string') fail('INVALID_ARGUMENT','SVG coordinate input must be a string');
  if (value.length > MAX_INPUT) limit('svgCoordinateLength',MAX_INPUT);
}

/** Shared bounded ASCII number cursor; no token array/native SVG parser. */
class Cursor {
  pos = 0;
  constructor(text) {input(text);this.text = text;}
  space() {while (ws(this.text[this.pos])) this.pos++;}
  number(comma=false) {
    this.space();if (this.text[this.pos] === ',') {if (!comma) invalid();this.pos++;this.space();}
    const start = this.pos;let nonzero = false,digits = 0;
    const take = () => {if (this.pos-start >= 128) limit('svgNumberLength',128);return this.text[this.pos++];};
    if (this.text[this.pos] === '+' || this.text[this.pos] === '-') take();
    const decimal = () => {while (digit(this.text[this.pos])) {nonzero ||= this.text[this.pos] !== '0';digits++;take();}};
    decimal();if (this.text[this.pos] === '.') {take();decimal();}if (!digits) invalid();
    if ((this.text[this.pos] === 'e' || this.text[this.pos] === 'E') && (digit(this.text[this.pos+1]) || this.text[this.pos+1] === '+' || this.text[this.pos+1] === '-')) {
      take();if (this.text[this.pos] === '+' || this.text[this.pos] === '-') take();
      const before = this.pos;while (digit(this.text[this.pos])) take();if (this.pos === before) invalid();
    }
    const value = Number(this.text.slice(start,this.pos));
    if (!Number.isFinite(value) || Math.abs(value) > WORLD || value === 0 && nonzero) numeric();
    return value;
  }
}

/** Only call for the COMPLETE accumulated matrix of a painted native element.
 * Local/prefix transforms may be singular/out of scale (e.g. hidden content or
 * compensating nested scales), so parsing them must not impose this final test.
 */
export function validateSVGImportMatrix(matrix) {
  if (!Array.isArray(matrix) || matrix.length !== 6 || !matrix.every(Number.isFinite)) numeric();
  const [low,high] = singularValues(matrix);
  if (low < .0001 || high > 10000 || !Number.isFinite(high) || matrix.some(n => Math.abs(n) > WORLD)) fail('LIMIT_EXCEEDED','SVG accumulated transform is outside native ranges',{limit:'svgTransformRange',minScale:.0001,maxScale:10000,maxCoordinate:WORLD});
  return [...matrix];
}

function boundedMatrix(matrix) {
  // Prefix products remain bounded even before native singular-value validation.
  if (!matrix.every(Number.isFinite) || matrix.some(n => Math.abs(n) > WORLD)) numeric();
  return matrix;
}
function rotation(degrees) {
  const angle = (degrees%360)*Math.PI/180;
  let c = Math.cos(angle),s = Math.sin(angle);
  // Exact quadrants avoid introducing residual shears into common exported art.
  if (degrees%90 === 0) {const i = ((degrees/90)%4+4)%4;c = [1,0,-1,0][i];s = [0,1,0,-1][i];}
  return [c,s,-s,c,0,0];
}

/** SVG attribute transform lists, applied right to left; NOT CSS transforms.
 * Fresh matrix only; preserves reflections/shears, never bakes stroke widths.
 */
export function parseSVGTransform(text,options={}) {
  input(text);
  if (!options || typeof options !== 'object' || Array.isArray(options) || Object.keys(options).some(k => k !== 'maxTransforms')) fail('INVALID_ARGUMENT','Invalid SVG transform options');
  const {maxTransforms=MAX_TRANSFORMS} = options;
  if (!Number.isSafeInteger(maxTransforms) || maxTransforms < 1 || maxTransforms > MAX_TRANSFORMS) fail('INVALID_ARGUMENT','SVG transform limit must be a positive downward integer');
  if (text.trim() === 'none') return [...IDENTITY];
  const cursor = new Cursor(text);let matrix = [...IDENTITY],count = 0;
  cursor.space();
  while (cursor.pos < text.length) {
    if (++count > maxTransforms) limit('svgTransforms',maxTransforms);
    const start = cursor.pos;while (/[A-Za-z]/.test(text[cursor.pos] ?? '')) cursor.pos++;
    const name = text.slice(start,cursor.pos);
    if (!['matrix','translate','scale','rotate','skewX','skewY'].includes(name)) invalid();
    cursor.space();if (text[cursor.pos++] !== '(') invalid();cursor.space();
    const values = [];
    while (text[cursor.pos] !== ')') {
      if (values.length >= 6) invalid();values.push(cursor.number(values.length > 0));cursor.space();
    }
    cursor.pos++;
    let next;const [a,b,c] = values;
    if (name === 'matrix' && values.length === 6) next = values;
    else if (name === 'translate' && [1,2].includes(values.length)) next = [1,0,0,1,a,b ?? 0];
    else if (name === 'scale' && [1,2].includes(values.length)) next = [a,0,0,b ?? a,0,0];
    else if (name === 'rotate' && [1,3].includes(values.length)) {
      next = rotation(a);
      if (values.length === 3) next = multiply(multiply([1,0,0,1,b,c],next),[1,0,0,1,-b,-c]);
    } else if ((name === 'skewX' || name === 'skewY') && values.length === 1) {
      const skew = Math.tan((a%180)*Math.PI/180);next = name === 'skewX' ? [1,0,skew,1,0,0] : [1,skew,0,1,0,0];
    } else invalid();
    matrix = boundedMatrix(multiply(matrix,boundedMatrix(next)));
    cursor.space();if (text[cursor.pos] === ',') {cursor.pos++;cursor.space();if (cursor.pos === text.length) invalid();}
  }
  return matrix;
}

const UNITS = {px:1,in:96,cm:96/2.54,mm:96/25.4,q:96/101.6,pt:96/72,pc:16};
/** Standalone SVG length at 96 CSS px/in; percentage base is explicit, never host layout. */
export function parseSVGLength(text,options={}) {
  if (!options || typeof options !== 'object' || Array.isArray(options) || Object.keys(options).some(k => k !== 'percentBase')) fail('INVALID_ARGUMENT','Invalid SVG length options');
  const {percentBase} = options;
  if (percentBase !== undefined && (!Number.isFinite(percentBase) || percentBase < 0 || percentBase > WORLD)) fail('INVALID_ARGUMENT','Invalid SVG percentage base');
  const cursor = new Cursor(text),value = cursor.number();
  const start = cursor.pos;while (/[A-Za-z%]/.test(text[cursor.pos] ?? '')) cursor.pos++;
  const unit = text.slice(start,cursor.pos).toLowerCase();cursor.space();if (cursor.pos !== text.length) invalid();
  let factor = 1;
  if (unit === '%') {if (percentBase === undefined) unsupported('percentageLength');factor = percentBase/100;}
  else if (unit) {if (!Object.hasOwn(UNITS,unit)) unsupported('lengthUnit');factor = UNITS[unit];}
  const result = value*factor;if (!Number.isFinite(result) || Math.abs(result) > WORLD || result === 0 && value !== 0 && factor !== 0) numeric();return result;
}

function viewBox(text) {
  const cursor = new Cursor(text),values = [];
  for (let i = 0;i < 4;i++) values.push(cursor.number(i > 0));
  cursor.space();if (cursor.pos !== text.length || values[2] < 0 || values[3] < 0) invalid();
  if (!values[2] || !values[3]) fail('EMPTY_IMPORT','SVG viewBox has no painted viewport');
  return values;
}

/** Intrinsic root viewport, independent of embedding HTML, editor zoom and DPR.
 * Missing dimensions use viewBox intrinsic dimensions/ratio, else SVG's 300x150
 * fallback. Explicit root percentages use viewBox dimensions, never host layout.
 * Only resolves sizing/viewBox/PAR: root transforms, styles, clipping eligibility,
 * native ranges and aggregate geometry still require subsequent validation.
 */
export function resolveSVGViewport(attributes) {
  if (!attributes || typeof attributes !== 'object' || Array.isArray(attributes)) fail('INVALID_ARGUMENT','SVG viewport attributes must be an object');
  const get = key => Object.hasOwn(attributes,key) ? attributes[key] : undefined;
  const box = get('viewBox') === undefined ? null : viewBox(get('viewBox'));
  const rawWidth = get('width'),rawHeight = get('height');
  let width = rawWidth === undefined ? undefined : parseSVGLength(rawWidth,{percentBase:box?.[2]});
  let height = rawHeight === undefined ? undefined : parseSVGLength(rawHeight,{percentBase:box?.[3]});
  if (width !== undefined && width < 0 || height !== undefined && height < 0) invalid();
  if (width === 0 || height === 0) fail('EMPTY_IMPORT','SVG root has no painted viewport');
  if (box) {
    if (width === undefined && height === undefined) [width,height] = box.slice(2);
    else if (width === undefined) width = height*(box[2]/box[3]);
    else if (height === undefined) height = width*(box[3]/box[2]);
  } else {width ??= 300;height ??= 150;}
  if (!Number.isFinite(width) || !Number.isFinite(height) || width > WORLD || height > WORLD || width <= 0 || height <= 0) numeric();
  const rawAspect = get('preserveAspectRatio') ?? 'xMidYMid meet';input(rawAspect);
  const aspect = /^[\t\r\n ]*(?:defer[\t\r\n ]+)?(none|x(?:Min|Mid|Max)Y(?:Min|Mid|Max))(?:[\t\r\n ]+(meet|slice))?[\t\r\n ]*$/.exec(rawAspect);
  if (!aspect) invalid();
  let matrix = [...IDENTITY];
  if (box) {
    const [x,y,w,h] = box,sx = width/w,sy = height/h;
    if (aspect[1] === 'none') matrix = [sx,0,0,sy,-x*sx,-y*sy];
    else {
      const scale = aspect[2] === 'slice' ? Math.max(sx,sy) : Math.min(sx,sy);
      const ax = {Min:0,Mid:.5,Max:1}[aspect[1].slice(1,4)],ay = {Min:0,Mid:.5,Max:1}[aspect[1].slice(5,8)];
      matrix = [scale,0,0,scale,(width-w*scale)*ax-x*scale,(height-h*scale)*ay-y*scale];
    }
  }
  return {width,height,viewBox:box ? [...box] : null,matrix:boundedMatrix(matrix),viewport:{x:0,y:0,width,height}};
}

/** Outermost SVG's attribute transform uses the default 50% 50% viewport origin,
 * outside the viewBox mapping. Explicit transform-origin/box and CSS transforms
 * are not in the XML/style subset. The clipping viewport itself stays fixed.
 */
export function resolveSVGRootCoordinates(attributes) {
  const result = resolveSVGViewport(attributes),x = result.width/2,y = result.height/2;
  const rootTransform = multiply(multiply([1,0,0,1,x,y],parseSVGTransform(attributes.transform ?? '')),[1,0,0,1,-x,-y]);
  return {...result,beforeRootMatrix:[...result.matrix],rootTransform,matrix:boundedMatrix(multiply(rootTransform,result.matrix))};
}
