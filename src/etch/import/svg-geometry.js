import {fail} from '../errors.js';
import {createId} from '../document.js';
import {resolveLimits,validateDocument} from '../validation.js';
import {apply,multiply,inverse,IDENTITY,transformBounds} from '../geometry/matrix.js';
import {elementBounds,expandBounds,unionBounds} from '../geometry/paths.js';
import {normalizeSVGPath} from './svg-path.js';
import {straightPaintedBounds} from './svg-straight-bounds.js';
import {parseSVGLength,parseSVGTransform,resolveSVGRootCoordinates,validateSVGImportMatrix} from './svg-coordinates.js';

function unsupported(feature) {fail('UNSUPPORTED_SVG_FEATURE','SVG geometry requires features outside the editable vector subset',{features:[{feature}]});}
function exceeded(limit,maximum) {fail('LIMIT_EXCEEDED','SVG geometry limit exceeded',{limit,maximum});}
function invalid() {fail('INVALID_SVG','Invalid SVG primitive geometry');}
const MIN = .01,MAX = 1000000,MAX_WORK = 10*1024*1024;

/** Tighter conservative bounds for native primitives and straight paths. Curved
 * path stroke bounds retain the conservative envelope, not exact painted support.
 */
function paintedBounds(element) {
  const e = element,m = e.transform,r = e.stroke ? e.strokeWidth/2 : 0;
  if (e.type === 'ellipse') {
    const [cx,cy] = apply(m,[e.cx,e.cy]),x = Math.hypot(m[0]*e.rx,m[2]*e.ry)+r*Math.hypot(m[0],m[2]),y = Math.hypot(m[1]*e.rx,m[3]*e.ry)+r*Math.hypot(m[1],m[3]);
    return {x:cx-x,y:cy-y,width:2*x,height:2*y};
  }
  if (e.type === 'rect') {
    if (!r) return transformBounds(m,{x:e.x,y:e.y,width:e.width,height:e.height});
    if (e.lineJoin !== 'round') return transformBounds(m,{x:e.x-r,y:e.y-r,width:e.width+2*r,height:e.height+2*r});
    const b = transformBounds(m,{x:e.x,y:e.y,width:e.width,height:e.height}),x = r*Math.hypot(m[0],m[2]),y = r*Math.hypot(m[1],m[3]);
    return {x:b.x-x,y:b.y-y,width:b.width+2*x,height:b.height+2*y};
  }
  if (e.type === 'line') {
    const start = apply(m,e.start),end = apply(m,e.end),base = {x:Math.min(start[0],end[0]),y:Math.min(start[1],end[1]),width:Math.abs(start[0]-end[0]),height:Math.abs(start[1]-end[1])};
    const dx = e.end[0]-e.start[0],dy = e.end[1]-e.start[1],length = Math.hypot(dx,dy),u = [dx/length,dy/length],n = [-u[1],u[0]];
    let x,y;
    if (e.lineCap === 'round') {x = r*Math.hypot(m[0],m[2]);y = r*Math.hypot(m[1],m[3]);}
    else {
      x = r*Math.abs(m[0]*n[0]+m[2]*n[1]);y = r*Math.abs(m[1]*n[0]+m[3]*n[1]);
      if (e.lineCap === 'square') {x += r*Math.abs(m[0]*u[0]+m[2]*u[1]);y += r*Math.abs(m[1]*u[0]+m[3]*u[1]);}
    }
    return {x:base.x-x,y:base.y-y,width:base.width+2*x,height:base.height+2*y};
  }
  if (e.type === 'path') {const bounds = straightPaintedBounds(e);if (bounds !== undefined) return bounds;}
  return elementBounds(e);
}

/** Internal styled-records -> VALIDATED standalone native document, not insertion.
 * Source XML/security and style stages are mandatory predecessors. Destination IDs,
 * history limits, captured placement and atomic commit still belong to native import.
 */
export function normalizeSVGGeometry(styled,options={}) {
  if (!styled || !Array.isArray(styled.records) || !styled.records.length || !options || typeof options !== 'object' || Array.isArray(options) || Object.keys(options).some(k => !['limits','maxWork'].includes(k))) fail('INVALID_ARGUMENT','Invalid SVG geometry input/options');
  const limits = resolveLimits(options.limits),maxWork = options.maxWork ?? MAX_WORK;
  if (!Number.isSafeInteger(maxWork) || maxWork < 1 || maxWork > MAX_WORK) fail('INVALID_ARGUMENT','SVG geometry work must be a downward positive integer');
  const records = styled.records,root = records[0];
  if (records.length > 20000) exceeded('svgGeometryNodes',20000);
  if (root.name !== 'svg' || root.parent !== null) fail('INVALID_ARGUMENT','SVG geometry needs a styled root');
  if (!records.some(record => record.paint?.fill || record.paint?.stroke)) fail('EMPTY_IMPORT','SVG contains no painted geometry');
  const viewport = resolveSVGRootCoordinates(root.attributes);
  const rootTransformed = viewport.rootTransform.some((n,i) => n !== IDENTITY[i]);
  const matrices = [],beforeRootMatrices = [],elements = [],prefix = createId();let points = 0,derived = 0,work = 0,bounds = null;
  let arcTolerance = .1;
  if (rootTransformed) {
    try {const inv = inverse(viewport.rootTransform);arcTolerance /= Math.max(1,Math.hypot(...inv.slice(0,4)));}
    catch {arcTolerance = 0;} // Only arc normalization needs an invertible, representable error map.
  }
  const charge = amount => {work += amount;if (work > maxWork) exceeded('svgGeometryWork',maxWork);};
  const dimension = value => {if (value < MIN || value > MAX) exceeded('svgPrimitiveRange',MAX);return value;};
  const length = (attrs,key,fallback=0) => attrs[key] === undefined ? fallback : parseSVGLength(attrs[key]);
  function path(data,matrix,close=false) {
    charge(data.length);
    const remaining = Math.min(limits.points-points,limits.derivedSegments-derived),reserve = close ? 1 : 0;
    const maximum = Math.min(100000,limits.pointsPerElement,limits.derivedSegmentsPerElement,remaining)-reserve;
    if (maximum < 1) exceeded('svgCommands',Math.max(0,remaining));
    if (/[Aa]/.test(data) && !(arcTolerance > 0)) exceeded('svgNumericRange',10000000);
    const commands = normalizeSVGPath(data,{transform:validateSVGImportMatrix(matrix),tolerance:arcTolerance || .1,maxCommands:maximum,maxTokens:Math.min(1000000,Math.max(1,maxWork-work+data.length))});
    if (close && commands.length) commands.push(['Z']);
    return commands;
  }
  for (let index = 0;index < records.length;index++) {
    charge(1);const record = records[index],a = record.attributes;
    if (record.hidden || record.active === false) continue;
    if (index && (!Number.isInteger(record.parent) || record.parent < 0 || record.parent >= index || !matrices[record.parent])) fail('INVALID_ARGUMENT','Invalid SVG styled ancestry');
    charge((a.transform ?? '').length);
    const local = index ? parseSVGTransform(a.transform ?? '') : null;
    const matrix = index ? multiply(matrices[record.parent],local) : viewport.matrix;
    const beforeRoot = rootTransformed ? index ? multiply(beforeRootMatrices[record.parent],local) : viewport.beforeRootMatrix : matrix;
    if (!matrix.every(Number.isFinite) || matrix.some(n => Math.abs(n) > 10000000)) exceeded('svgNumericRange',10000000);
    matrices[index] = matrix;beforeRootMatrices[index] = beforeRoot;
    const p = record.paint;if (!p || !p.fill && !p.stroke) continue;
    if (elements.length >= limits.elements) exceeded('elements',limits.elements);
    const base = {id:`${prefix}-element-${elements.length+1}`,transform:[...matrix],...p};
    let e,cost = 0,approximation = 0,sourcePrimitive = null;
    const pathElement = (data,close=false) => {const commands = path(data,matrix,close);return {...base,type:'path',commands};};
    const ellipseData = (cx,cy,rx,ry) => `M${cx+rx} ${cy}A${rx} ${ry} 0 0 1 ${cx} ${cy+ry}A${rx} ${ry} 0 0 1 ${cx-rx} ${cy}A${rx} ${ry} 0 0 1 ${cx} ${cy-ry}A${rx} ${ry} 0 0 1 ${cx+rx} ${cy}Z`;
    if (record.name === 'path' || record.name === 'polyline' || record.name === 'polygon') {
      if (record.name !== 'path' && a.points && /[^0-9eE+.,\-\t\r\n ]/.test(a.points)) invalid(); // points is a number list, NEVER path syntax.
      const data = record.name === 'path' ? a.d ?? '' : a.points?.trim() ? 'M'+a.points : '';
      if (!data.trim()) continue;
      const commands = path(data,matrix,record.name === 'polygon');
      if (p.stroke && p.lineCap !== 'butt') {
        let anchor = null,drawn = false,pointOnly = true;
        const possibleOmittedSegment = record.name !== 'path' || /[LlHhVvQqTtCcSsAaZz]/.test(data);
        const check = () => {if (anchor && pointOnly && (drawn || possibleOmittedSegment)) unsupported('zeroLengthPathCap');};
        for (const [op,...values] of commands) {
          if (op === 'M') {check();anchor = values;drawn = false;pointOnly = true;}
          else if (op !== 'Z') {drawn = true;for (let i = 0;i < values.length;i += 2) if (values[i] !== anchor[0] || values[i+1] !== anchor[1]) pointOnly = false;}
        }
        check(); // SVG paints round/square point subpaths (including M/Z and omitted arcs); Canvas does not.
      }
      if (!commands.some(command => ['L','Q','C'].includes(command[0]))) continue;
      e = {...base,type:'path',commands};cost = commands.length;
      if (record.name === 'path' && /[Aa]/.test(data)) approximation = .1;
    } else if (record.name === 'rect') {
      const width = length(a,'width'),height = length(a,'height'),rx = length(a,'rx'),ry = length(a,'ry');
      if (width < 0 || height < 0 || rx < 0 || ry < 0) invalid();if (!width || !height) continue;
      if (rx || ry) unsupported('roundedRect');
      const x = length(a,'x'),y = length(a,'y');
      if (width < MIN || height < MIN || width > MAX || height > MAX) e = pathElement(`M${x} ${y}L${x+width} ${y}L${x+width} ${y+height}L${x} ${y+height}Z`);
      else e = {...base,type:'rect',x,y,width:dimension(width),height:dimension(height)};
      cost = e.type === 'path' ? e.commands.length : 5;
    } else if (record.name === 'ellipse' || record.name === 'circle') {
      const rx = length(a,record.name === 'circle' ? 'r' : 'rx'),ry = record.name === 'circle' ? rx : length(a,'ry');
      if (rx < 0 || ry < 0) invalid();if (!rx || !ry) continue;
      const cx = length(a,'cx'),cy = length(a,'cy'),original = {...base,type:'ellipse',cx,cy,rx,ry};
      if (rx < MIN || ry < MIN || rx > MAX || ry > MAX) {e = pathElement(ellipseData(cx,cy,rx,ry));sourcePrimitive = original;}
      else e = original;
      cost = e.type === 'path' ? e.commands.length : 4;
    } else if (record.name === 'line') {
      if (!p.stroke) continue;
      const start = [length(a,'x1'),length(a,'y1')],end = [length(a,'x2'),length(a,'y2')];
      if (start[0] === end[0] && start[1] === end[1]) {
        if (p.lineCap === 'butt') continue;
        const r = p.strokeWidth/2,[cx,cy] = start,dot = {...base,fill:p.stroke,stroke:null,strokeWidth:0};
        if (p.lineCap === 'square') {
          e = 2*r >= MIN && 2*r <= MAX ? {...dot,type:'rect',x:cx-r,y:cy-r,width:2*r,height:2*r} : {...pathElement(`M${cx-r} ${cy-r}L${cx+r} ${cy-r}L${cx+r} ${cy+r}L${cx-r} ${cy+r}Z`),fill:p.stroke,stroke:null,strokeWidth:0};cost = 5;
        }
        else if (r >= MIN) {e = {...dot,type:'ellipse',cx,cy,rx:r,ry:r};cost = 4;}
        else {e = {...pathElement(ellipseData(cx,cy,r,r)),fill:p.stroke,stroke:null,strokeWidth:0};cost = e.commands.length;sourcePrimitive = {...dot,type:'ellipse',cx,cy,rx:r,ry:r};}
      } else {e = {...base,type:'line',start,end};cost = 2;}
    } else unsupported('element');
    if (e.type === 'path' && !e.commands.some(command => ['L','Q','C'].includes(command[0]))) continue;
    e.transform = validateSVGImportMatrix(matrix);
    const pathPoints = e.type === 'path' ? cost : 0;
    if (pathPoints > limits.pointsPerElement || pathPoints > limits.points-points) exceeded('points',limits.points);
    if (cost > limits.derivedSegmentsPerElement || cost > limits.derivedSegments-derived) exceeded('derivedSegments',limits.derivedSegments);
    const painted = unionBounds(sourcePrimitive && paintedBounds(sourcePrimitive),expandBounds(paintedBounds(e),approximation));
    if (!painted) continue;
    if (!Object.values(painted).every(Number.isFinite)) exceeded('svgNumericRange',10000000);
    // Tiny arithmetic noise only, never a pixel/arc-error allowance. Arc error is
    // explicitly expanded above, so clipping cannot be lost via approximation.
    const epsilon = 64*Number.EPSILON*Math.max(1,viewport.width,viewport.height);
    const checkViewport = b => {
      if (!b || !Object.values(b).every(Number.isFinite)) exceeded('svgNumericRange',10000000);
      if (b.x < -epsilon || b.y < -epsilon || b.x+b.width > viewport.width+epsilon || b.y+b.height > viewport.height+epsilon) unsupported('rootViewportClipping');
    };
    checkViewport(painted);
    // The root's own clip transforms with it, while the enclosing image viewport
    // stays fixed. Checking only the final matrix would resurrect source-clipped art.
    if (rootTransformed) checkViewport(unionBounds(sourcePrimitive && paintedBounds({...sourcePrimitive,transform:beforeRoot}),expandBounds(paintedBounds({...e,transform:beforeRoot}),approximation)));
    points += pathPoints;derived += cost;bounds = unionBounds(bounds,painted);elements.push(e);
  }
  if (!elements.length) fail('EMPTY_IMPORT','SVG contains no painted geometry');
  const document = validateDocument({format:'lightmetal-etch',version:1,background:null,assets:[],layers:[{id:`${prefix}-layer`,name:'Imported SVG',visible:true,locked:false,offset:[0,0],elements}]},limits);
  return {document,viewport:{...viewport.viewport},bounds,stats:{elements:elements.length,points,derivedSegments:derived,work}};
}
