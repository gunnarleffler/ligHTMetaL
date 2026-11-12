import {fail} from '../errors.js';
import {parseSVGColor} from './svg-colors.js';
import {parseSVGLength} from './svg-coordinates.js';

const INITIAL = Object.freeze({color:'black',fill:'black',stroke:'none','fill-rule':'nonzero','stroke-width':'1','stroke-linecap':'butt','stroke-linejoin':'miter','stroke-miterlimit':'4',display:'inline',visibility:'visible',opacity:'1','fill-opacity':'1','stroke-opacity':'1','stroke-dasharray':'none','stroke-dashoffset':'0','clip-path':'none',mask:'none',filter:'none','vector-effect':'none','paint-order':'normal','mix-blend-mode':'normal',isolation:'auto','marker-start':'none','marker-mid':'none','marker-end':'none',overflow:'visible','shape-rendering':'auto','color-rendering':'auto','text-rendering':'auto','image-rendering':'auto'});
const NONINHERITED = new Set(['display','opacity','clip-path','mask','filter','vector-effect','mix-blend-mode','isolation','overflow']);
const LIMITS = {maxNodes:20000,maxDepth:64,maxSelectors:100000,maxClasses:100000,maxWork:1000000};
const SHAPES = new Set(['path','line','rect','circle','ellipse','polyline','polygon']);
const lower = value => value.trim().toLowerCase();
function unsupported(feature) {fail('UNSUPPORTED_SVG_FEATURE','SVG appearance is outside the editable vector subset',{features:[{feature}]});}
function exceeded(limit,maximum) {fail('LIMIT_EXCEEDED','SVG style safety limit exceeded',{limit,maximum});}
function entries(declarations) {
  return declarations?.entries ?? Object.entries(declarations?.values ?? {}).map(([name,value]) => ({name,value,important:declarations.important?.includes(name) ?? false}));
}
const number = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;
function scalar(text,percentage=false) {
  text = text.trim();const percent = text.endsWith('%');if (percent && !percentage) unsupported('numericStyle');
  const token = percent ? text.slice(0,-1) : text;
  if (token.length > 128 || !number.test(token) || !Number.isFinite(Number(token))) unsupported('numericStyle');
  return Number(token)/(percent ? 100 : 1);
}
const opacity = value => Math.max(0,Math.min(1,scalar(value,true)));
function choice(value,allowed,feature) {value = lower(value);if (!allowed.includes(value)) unsupported(feature);return value;}
function paint(value,color,alpha) {
  if (lower(value) === 'none' || alpha === 0) return null;
  const parsed = parseSVGColor(lower(value) === 'currentcolor' ? color : value),combined = parsed.alpha*alpha;
  if (!combined) return null;if (combined !== 1) unsupported('partialAlpha');return parsed.color;
}
function nativePaint(computed,name) {
  const fill = name === 'line' ? null : paint(computed.fill,computed.color,opacity(computed['fill-opacity']));
  let stroke = null,strokeWidth = 0;
  if (lower(computed.stroke) !== 'none' && opacity(computed['stroke-opacity']) > 0) {
    if (/[()]/.test(computed['stroke-width'])) unsupported('strokeWidth');
    strokeWidth = parseSVGLength(computed['stroke-width']);if (strokeWidth < 0) unsupported('strokeWidth');
    if (strokeWidth) stroke = paint(computed.stroke,computed.color,opacity(computed['stroke-opacity']));
    if (stroke && (strokeWidth < .01 || strokeWidth > 1000000)) fail('LIMIT_EXCEEDED','SVG stroke width is outside the native editable range (.01–1000000)',{limit:'svgStrokeWidth',minimum:.01,maximum:1000000});
  }
  const retainedChoice = (value,allowed,feature,active,fallback) => allowed.includes(lower(value)) ? lower(value) : active ? choice(value,allowed,feature) : fallback;
  const lineCap = retainedChoice(computed['stroke-linecap'],['butt','round','square'],'strokeLinecap',stroke,'butt');
  const lineJoin = retainedChoice(computed['stroke-linejoin'],['miter','round','bevel'],'strokeLinejoin',stroke,'miter');
  const rawMiter = computed['stroke-miterlimit'].trim();
  const miterLimit = stroke ? scalar(rawMiter) : rawMiter.length <= 128 && number.test(rawMiter) && Number.isFinite(Number(rawMiter)) && Number(rawMiter) >= 1 ? Number(rawMiter) : 4;
  if (miterLimit < 1) unsupported('strokeMiterlimit');
  return {fill,stroke,strokeWidth:stroke ? strokeWidth : 0,lineCap,lineJoin,miterLimit,fillRule:retainedChoice(computed['fill-rule'],['nonzero','evenodd'],'fillRule',fill,'nonzero')};
}
function effects(record) {
  const {computed,paint} = record;
  for (const key of ['clip-path','mask','filter']) if (lower(computed[key]) !== 'none') unsupported(key);
  if (lower(computed['mix-blend-mode']) !== 'normal' || lower(computed.isolation) !== 'auto') unsupported('compositing');
  if (![0,1].includes(opacity(computed.opacity))) unsupported('groupOpacity');
  choice(computed.display,['inline','block'],'display');choice(computed.overflow,['visible','hidden','clip'],'overflow');
  if (SHAPES.has(record.name)) {
    for (const key of ['vector-effect','marker-start','marker-mid','marker-end']) if (lower(computed[key]) !== 'none') unsupported(key);
    if (paint?.stroke && lower(computed['stroke-dasharray']) !== 'none') unsupported('stroke-dasharray');
    if (paint?.fill || paint?.stroke) {
      choice(computed['shape-rendering'],['auto','geometricprecision'],'shapeRendering');choice(computed['color-rendering'],['auto'],'colorRendering');
      if (paint.fill && paint.stroke && !['normal','fill','fill stroke','fill stroke markers'].includes(lower(computed['paint-order']).replace(/\s+/g,' '))) unsupported('paintOrder');
    }
  }
  // Dash offset has no effect without a dash array. Text/image rendering hints
  // likewise cannot affect this non-text/non-image profile.
}

/** Internal style stage for SECURITY-CHECKED XML records, not an XML/DOM sanitizer.
 * CSS.supports validates declarations (not security) so invalid later declarations
 * do not erase earlier valid ones. Native values still pass the strict parser below.
 * No supplied DOM, stylesheet, selector or color enters a browser rendering API.
 */
export function resolveSVGStyles(inspection,options={}) {
  if (!inspection?.tree || !Array.isArray(inspection.styleSheets) || !options || typeof options !== 'object' || Array.isArray(options) || Object.keys(options).some(k => ![...Object.keys(LIMITS),'isValidDeclaration','isGeometryEmpty'].includes(k))) fail('INVALID_ARGUMENT','Invalid SVG style input/options');
  if (options.isGeometryEmpty !== undefined && typeof options.isGeometryEmpty !== 'function') fail('INVALID_ARGUMENT','SVG geometry predicate must be a function');
  const limits = {...LIMITS};for (const key of Object.keys(limits)) if (options[key] !== undefined) {
    if (!Number.isSafeInteger(options[key]) || options[key] < 1 || options[key] > limits[key]) fail('INVALID_ARGUMENT','SVG style limits must be positive downward integers',{limit:key});limits[key] = options[key];
  }
  const valid = options.isValidDeclaration ?? (globalThis.CSS?.supports ? (name,value) => globalThis.CSS.supports(name,value) : null);
  if (typeof valid !== 'function') fail('INVALID_ARGUMENT','SVG styles require CSS declaration validation');
  let work = 0,selectors = 0,classes = 0;
  const charge = () => {if (++work > limits.maxWork) exceeded('svgStyleWork',limits.maxWork);};
  const validEntries = declaration => entries(declaration).filter(entry => {
    charge();if (!Object.hasOwn(INITIAL,entry.name) || typeof entry.value !== 'string') unsupported('cssProperty');return valid(entry.name,entry.value);
  });
  const index = {tag:new Map(),class:new Map(),id:new Map()};
  inspection.styleSheets.forEach((rule,order) => {
    const declarations = validEntries(rule.declarations);
    for (const selector of rule.selectors) {
      if (++selectors > limits.maxSelectors) exceeded('svgStyleSelectors',limits.maxSelectors);
      if (!Object.hasOwn(index,selector.kind) || typeof selector.name !== 'string') unsupported('cssSelector');
      const map = index[selector.kind],list = map.get(selector.name) ?? [];list.push({declarations,order,specificity:{tag:1,class:10,id:100}[selector.kind]});map.set(selector.name,list);
    }
  });
  const records = [],stack = [{node:inspection.tree,parent:null,depth:1}];
  while (stack.length) {
    const {node,parent,depth} = stack.pop();if (records.length >= limits.maxNodes) exceeded('svgStyleNodes',limits.maxNodes);if (depth > limits.maxDepth) exceeded('svgStyleDepth',limits.maxDepth);
    charge();const attrs = node.attributes,ancestor = parent === null ? null : records[parent],winners = new Map();
    const offer = (name,value,important,specificity,order) => {
      charge();const rank = [important ? 1 : 0,specificity,order],old = winners.get(name);
      if (!old || rank[0] > old.rank[0] || rank[0] === old.rank[0] && (rank[1] > old.rank[1] || rank[1] === old.rank[1] && rank[2] >= old.rank[2])) winners.set(name,{value,rank});
    };
    for (const [name,value] of Object.entries(attrs)) if (Object.hasOwn(INITIAL,name)) {charge();if (valid(name,value)) offer(name,value,false,0,-1);}
    const apply = list => {for (const rule of list ?? []) {charge();for (const entry of rule.declarations) offer(entry.name,entry.value,entry.important,rule.specificity,rule.order);}};
    apply(index.tag.get(node.name));if (attrs.id !== undefined) apply(index.id.get(attrs.id));
    // Streaming class tokens with a hard aggregate counter; do not split a huge
    // attacker-controlled class attribute into an unbounded token array.
    const tokens = /[^\t\r\n\f ]+/g,seen = new Set();let token;
    while ((token = tokens.exec(attrs.class ?? ''))) {
      if (++classes > limits.maxClasses) exceeded('svgStyleClasses',limits.maxClasses);
      if (!seen.has(token[0])) {seen.add(token[0]);apply(index.class.get(token[0]));}
    }
    for (const entry of validEntries(node.style)) offer(entry.name,entry.value,entry.important,1000,inspection.styleSheets.length);
    const computed = Object.create(null);
    for (const [name,initial] of Object.entries(INITIAL)) {
      charge();const value = winners.get(name)?.value,key = value === undefined ? 'unset' : lower(value),inherited = ancestor?.computed[name] ?? initial;
      if (['revert','revert-layer'].includes(key)) unsupported('cssRevert');
      computed[name] = key === 'inherit' ? inherited : key === 'initial' ? initial : key === 'unset' ? NONINHERITED.has(name) ? initial : inherited : value;
    }
    if (lower(computed.color) === 'currentcolor') computed.color = ancestor?.computed.color ?? INITIAL.color;
    const hidden = lower(computed.display) === 'none' || opacity(computed.opacity) === 0;
    const visible = !hidden && choice(computed.visibility,['visible','hidden','collapse'],'visibility') === 'visible';
    const known = SHAPES.has(node.name) || ['svg','g'].includes(node.name);
    if (!hidden && lower(computed.filter) !== 'none') unsupported('filter'); // Filters can generate paint even without SourceGraphic.
    if (!hidden && lower(computed['vector-effect']) !== 'none') unsupported('vector-effect');
    if (!hidden && node.name === 'use') unsupported('element:use'); // Referenced descendants may override visibility:hidden.
    if (visible && node.features?.length) unsupported(node.features[0]);
    if (visible && !known) unsupported('element');
    if (visible && SHAPES.has(node.name)) for (const key of ['marker-start','marker-mid','marker-end']) if (lower(computed[key]) !== 'none') unsupported(key); // Markers may paint with fill/stroke:none.
    const empty = visible && SHAPES.has(node.name) && options.isGeometryEmpty?.(node,computed);
    const paint = visible && SHAPES.has(node.name) && !empty ? nativePaint(computed,node.name) : null;
    const position = records.length;
    records.push({name:node.name,attributes:{...attrs},computed,parent,hidden,visible,paint,features:[...(node.features ?? [])],known,active:!!(paint?.fill || paint?.stroke)});
    if (!hidden) for (let i = node.children.length-1;i >= 0;i--) stack.push({node:node.children[i],parent:position,depth:depth+1});
  }
  // Group effects also matter when a hidden-visibility parent has visible children.
  for (let i = records.length-1;i >= 0;i--) {
    const record = records[i];if (record.active) {if (!record.known || record.features.length) unsupported(record.features[0] ?? 'element');effects(record);if (record.parent !== null) records[record.parent].active = true;}
  }
  return {records,stats:{nodes:records.length,selectors,classes,work}};
}
