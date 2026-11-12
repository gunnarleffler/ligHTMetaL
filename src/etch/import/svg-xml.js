import {fail} from '../errors.js';

const SVG = 'http://www.w3.org/2000/svg',XML = 'http://www.w3.org/XML/1998/namespace',XMLNS = 'http://www.w3.org/2000/xmlns/';
const XLINK = 'http://www.w3.org/1999/xlink';
const ACTIVE_NAMESPACES = new Set(['http://www.w3.org/1999/xhtml','http://www.w3.org/1998/Math/MathML','http://www.w3.org/1999/XSL/Transform','http://www.w3.org/2001/xml-events']);
const EDITORS = new Set(['http://www.inkscape.org/namespaces/inkscape','http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd','http://ns.adobe.com/AdobeIllustrator/10.0/']);
const BLOCKED = new Set(['script','foreignobject','iframe','object','embed','link','base','animate','animatemotion','animatetransform','animatecolor','animation','set','discard','handler','listener','meta','audio','video']);
const VECTOR = new Set(['svg','g','path','line','rect','circle','ellipse','polyline','polygon']);
const INERT = new Set(['defs','metadata','title','desc']);
const PRESENTATION = new Set(['fill','stroke','color','fill-rule','stroke-width','stroke-linecap','stroke-linejoin','stroke-miterlimit','display','visibility','opacity','fill-opacity','stroke-opacity','stroke-dasharray','stroke-dashoffset','clip-path','mask','filter','vector-effect','paint-order','mix-blend-mode','isolation','marker-start','marker-mid','marker-end','overflow','shape-rendering','color-rendering','text-rendering','image-rendering']);
const DECORATIVE = new Set(['font-family','font-size','font-weight','font-style','font-stretch','font-variant','text-anchor','letter-spacing','word-spacing','line-height','enable-background']);
// These cannot affect accepted vector geometry; visible text and font-relative
// geometry are not supported. Do not reuse this omission policy for image fallback.
const decorative = name => DECORATIVE.has(name) || name === 'font' || name.startsWith('font-') || name.startsWith('-inkscape-font-');
const GEOMETRY = {
  svg:['width','height','viewBox','preserveAspectRatio','x','y','version','baseProfile'],g:[],
  path:['d','pathLength'],line:['x1','y1','x2','y2'],rect:['x','y','width','height','rx','ry'],
  circle:['cx','cy','r'],ellipse:['cx','cy','rx','ry'],polyline:['points'],polygon:['points'],
};
const DEFAULTS = {maxBytes:5*1024*1024,maxElements:20_000,maxDepth:64,maxNodes:100_000,maxAttributes:100_000,maxAttributesPerElement:256,maxRules:20_000,maxCSSItems:100_000};
const encoder = new TextEncoder();
function unsafe(reason) {fail('UNSAFE_SVG',reason);}
function invalid(reason) {fail('INVALID_SVG',reason);}
function exceeded(limit,maximum) {fail('LIMIT_EXCEEDED','SVG XML safety limit exceeded',{limit,maximum});}

/** XML lexical preflight: comments/CDATA are data, declarations and PIs are not.
 * This is not the XML parser. DOMParser still owns well-formedness checks.
 */
export function preflightSVGXML(source,maxBytes=DEFAULTS.maxBytes) {
  if (typeof source !== 'string' || !Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > DEFAULTS.maxBytes) fail('INVALID_ARGUMENT','Invalid SVG XML input or byte limit');
  if (source.length > maxBytes) exceeded('svgBytes',maxBytes);
  const bytes = encoder.encode(source).byteLength;if (bytes > maxBytes) exceeded('svgBytes',maxBytes);
  let cursor = 0;
  while ((cursor = source.indexOf('<',cursor)) !== -1) {
    if (source.startsWith('<!--',cursor) || source.startsWith('<![CDATA[',cursor)) {
      const comment = source.startsWith('<!--',cursor),end = source.indexOf(comment ? '-->' : ']]>',cursor+(comment ? 4 : 9));
      if (end < 0) invalid('Unterminated XML comment or CDATA');cursor = end+3;continue;
    }
    if (source.startsWith('<!',cursor)) unsafe('SVG document declarations and entities are not allowed');
    if (source.startsWith('<?',cursor)) {
      const declaration = (cursor === 0 || cursor === 1 && source[0] === '\ufeff') && /^<\?xml[\t\r\n ]/.test(source.slice(cursor,cursor+7));
      if (!declaration) unsafe('SVG processing instructions and external stylesheets are not allowed');
      const end = source.indexOf('?>',cursor+2);if (end < 0) invalid('Unterminated XML declaration');cursor = end+2;continue;
    }
    cursor++;
  }
  return bytes;
}

function cssSecurity(value,feature) {
  let text = '',i = 0,quote = null;
  while (i < value.length) {
    if (!quote && value.startsWith('/*',i)) {const end = value.indexOf('*/',i+2);if (end < 0) invalid('Unterminated CSS comment');i = end+2;continue;}
    const c = value[i++];
    if (quote && /[\n\r\f]/.test(c)) invalid('CSS strings cannot contain unescaped newlines');
    text += c;
    if (c === quote) quote = null;else if (!quote && (c === '"' || c === "'")) quote = c;
  }
  if (quote) invalid('Unterminated CSS string');
  // Escapes can disguise resource functions/properties. Never pass them to a
  // native CSS parser and assume a regex has checked their decoded meaning.
  if (text.includes('\\') || /@import\b|expression\s*\(|(?:^|[;\s])(?:behavior|-moz-binding)\s*:/i.test(text)) unsafe('SVG escaped or executable CSS is not supported safely');
  quote = null;
  for (let pos = 0;pos < text.length;pos++) {
    const c = text[pos];
    if (quote) {if (c === quote) quote = null;continue;}
    if (c === '"' || c === "'") {quote = c;continue;}
    if (text.slice(pos,pos+3).toLowerCase() !== 'url' || /[-\w]/.test(text[pos-1] ?? '')) continue;
    let start = pos+3;while (/\s/.test(text[start] ?? '')) start++;
    if (text[start] !== '(') continue;
    start++;while (/\s/.test(text[start] ?? '')) start++;
    const delimiter = text[start] === '"' || text[start] === "'" ? text[start++] : null;
    const end = text.indexOf(delimiter ?? ')',start);if (end < 0) invalid('Unterminated SVG resource reference');
    const ref = text.slice(start,end).trim();let close = end;
    if (delimiter) {close++;while (/\s/.test(text[close] ?? '')) close++;if (text[close] !== ')') invalid('Invalid SVG resource reference');}
    if (!ref.startsWith('#') || ref.length === 1 || /\s/.test(ref)) unsafe('SVG external or embedded resources are not allowed; use a plain vector SVG, native JSON or PNG');
    feature('localResource');pos = close;
  }
  return text;
}

function* delimited(text,separator) {
  let start = 0,quote = null,depth = 0;
  for (let i = 0;i < text.length;i++) {
    const c = text[i];
    if (quote) {if (c === quote) quote = null;continue;}
    if (c === '"' || c === "'") {quote = c;continue;}
    if (c === '(') depth++;else if (c === ')') depth = Math.max(0,depth-1);
    if (c === separator && !depth) {yield text.slice(start,i);start = i+1;}
  }
  yield text.slice(start);
}

function declarations(text,feature,account) {
  const result = Object.create(null),important = new Set(),entries = [];
  for (const entry of delimited(text,';')) {
    if (!entry.trim()) continue;account();
    const colon = entry.indexOf(':');if (colon < 1) {feature('cssDeclaration');continue;}
    const name = entry.slice(0,colon).trim().toLowerCase();let value = entry.slice(colon+1).trim();
    const priority = /![\t\r\n ]*important\s*$/i.test(value);if (priority) value = value.replace(/![\t\r\n ]*important\s*$/i,'').trim();
    if (!value) {feature('cssDeclaration');continue;}
    if (decorative(name)) continue;
    if (!PRESENTATION.has(name)) {feature('cssProperty');continue;}
    entries.push({name,value,important:priority});
    if (!important.has(name) || priority) result[name] = value;
    if (priority) important.add(name);
  }
  return {values:result,important:[...important],entries};
}

const identifier = /^[-_a-zA-Z\u0080-\uffff][-\w\u0080-\uffff]*$/u;
function stylesheet(text,feature,rules,limits,account) {
  let cursor = 0;
  while (cursor < text.length) {
    while (/\s/.test(text[cursor] ?? '') && cursor < text.length) cursor++;
    if (cursor === text.length) break;
    const open = text.indexOf('{',cursor),close = text.indexOf('}',open+1);
    if (open < 0 || close < 0 || text.indexOf('{',open+1) >= 0 && text.indexOf('{',open+1) < close) {feature('cssRule');return;}
    const selectors = [];
    for (const raw of delimited(text.slice(cursor,open),',')) {
      account();const value = raw.trim(),prefix = value[0],name = prefix === '.' || prefix === '#' ? value.slice(1) : value;
      if (!identifier.test(name)) feature('cssSelector');
      else selectors.push({kind:prefix === '.' ? 'class' : prefix === '#' ? 'id' : 'tag',name});
    }
    if (rules.length >= limits.maxRules) exceeded('svgRules',limits.maxRules);
    rules.push({selectors,declarations:declarations(text.slice(open+1,close),feature,account)});cursor = close+1;
  }
}

/** Iterative DOM walk with constant traversal storage, not a sibling-sized queue. */
function* walkXML(root) {
  let node = root,depth = 0;
  while (node) {
    yield {node,depth};
    if (node.firstChild) {node = node.firstChild;depth += node.nodeType === 1 ? 1 : 0;continue;}
    while (node && !node.nextSibling) {depth -= node.nodeType === 1 ? 1 : 0;node = node.parentNode;}
    if (node) {depth -= node.nodeType === 1 ? 1 : 0;node = node.nextSibling;depth += node.nodeType === 1 ? 1 : 0;}
  }
}

/** Internal XML boundary, NOT a sanitizer or complete geometry importer.
 * Returns newly built data only. Source nodes never leave this function or enter
 * the live DOM; successful inspection still needs style/geometry/native validation.
 */
function inspect(source,options={},deferAppearance=false) {
  if (!options || typeof options !== 'object' || Array.isArray(options) || Object.keys(options).some(k => ![...Object.keys(DEFAULTS),'DOMParser'].includes(k))) fail('INVALID_ARGUMENT','Invalid SVG XML options');
  const limits = {...DEFAULTS};
  for (const key of Object.keys(DEFAULTS)) if (options[key] !== undefined) {
    if (!Number.isSafeInteger(options[key]) || options[key] < 1 || options[key] > limits[key]) fail('INVALID_ARGUMENT','SVG limits must be positive downward integers',{limit:key});limits[key] = options[key];
  }
  const bytes = preflightSVGXML(source,limits.maxBytes);
  const Parser = options.DOMParser ?? globalThis.DOMParser;
  if (typeof Parser !== 'function') fail('INVALID_ARGUMENT','SVG inspection requires a browser XML DOMParser');
  const doc = new Parser().parseFromString(source,'image/svg+xml'),root = doc.documentElement;
  if (!root || root.localName === 'parsererror' || ['http://www.mozilla.org/newlayout/xml/parsererror.xml','http://www.w3.org/1999/xhtml'].some(ns => doc.getElementsByTagNameNS(ns,'parsererror').length)) invalid('SVG XML is not well formed');
  // Common pasted/inline snippets omit xmlns. Interpret only an unprefixed root
  // with NO explicit namespace as SVG; an explicit wrong/empty namespace is not repaired.
  const inferred = root.namespaceURI === null && root.prefix === null && !root.hasAttribute('xmlns');
  if (root.localName !== 'svg' || root.namespaceURI !== SVG && !inferred) invalid('Expected an SVG namespace document root');
  const isSVG = node => node.namespaceURI === SVG || inferred && node.namespaceURI === null && node.prefix === null;
  const features = new Map(),ids = new Set(),rules = [];
  let elements = 0,nodes = 0,attributes = 0,cssItems = 0;
  const cssItem = () => {if (++cssItems > limits.maxCSSItems) exceeded('svgCSSItems',limits.maxCSSItems);};
  const feature = (kind,el) => {if (!features.has(kind)) features.set(kind,{feature:kind,element:el.localName.slice(0,64)});};
  // Pass one always checks the COMPLETE tree, including unsupported/hidden/unused
  // content. An early unsupported feature must not hide a later unsafe payload.
  for (const {node,depth} of walkXML(doc)) {
    if (++nodes > limits.maxNodes) exceeded('svgNodes',limits.maxNodes);
    if (node.nodeType === 7 || node.nodeType === 10 || node.nodeType === 5) unsafe('SVG processing instructions and declarations are not allowed');
    if (node.nodeType === 1) {
      if (++elements > limits.maxElements) exceeded('svgElements',limits.maxElements);
      if (depth > limits.maxDepth) exceeded('svgDepth',limits.maxDepth);
      if (ACTIVE_NAMESPACES.has(node.namespaceURI) || node.localName.toLowerCase() === 'style' && !isSVG(node)) unsafe('SVG embedded active namespaces are not allowed');
      if (BLOCKED.has(node.localName.toLowerCase())) unsafe('SVG executable or embedded document content is not allowed');
      if (node.attributes.length > limits.maxAttributesPerElement) exceeded('svgAttributesPerElement',limits.maxAttributesPerElement);
      for (const attr of node.attributes) {
        if (++attributes > limits.maxAttributes) exceeded('svgAttributes',limits.maxAttributes);
        if (attr.namespaceURI === XMLNS) continue; // Namespace identifiers are not resource URLs/events.
        if (ACTIVE_NAMESPACES.has(attr.namespaceURI)) unsafe('SVG active namespace attributes are not allowed');
        if (/^on/i.test(attr.localName) || attr.namespaceURI === XML && attr.localName === 'base') unsafe('SVG event handlers and base URLs are not allowed');
        if (attr.localName === 'href' || attr.localName === 'src') {
          const value = attr.value.trim();if (!value.startsWith('#') || value.length === 1 || /\s/.test(value)) unsafe('SVG external or embedded resources are not allowed; use a plain vector SVG, native JSON or PNG');
        }
        if (!attr.namespaceURI && (attr.name === 'style' || PRESENTATION.has(attr.localName))) cssSecurity(attr.value,() => {});
        if (!attr.namespaceURI && attr.localName === 'id') {if (ids.has(attr.value)) invalid('SVG IDs must be unique');ids.add(attr.value);}
      }
      if (isSVG(node) && node.localName === 'style') {
        if (node.children.length) invalid('SVG style elements must contain CSS text only');
        cssSecurity(node.textContent,() => {});
      }
    }
  }
  // Pass two builds plain records; metadata/unused definitions are omitted only
  // AFTER all descendants passed the security walk. Style sheets are global.
  const work = [{node:root,parent:null,inert:false,metadata:false}];let tree;
  while (work.length) {
    const {node,parent,inert,metadata} = work.pop(),name = node.localName,svg = isSVG(node);
    const descriptive = metadata || svg && ['metadata','title','desc'].includes(name) || !svg && EDITORS.has(node.namespaceURI);
    const ignored = inert || svg && INERT.has(name) || !svg && EDITORS.has(node.namespaceURI);
    const pending = [];
    const addFeature = kind => feature(kind,node);
    const appearance = kind => {
      if (!deferAppearance) addFeature(kind);
      else if (kind !== 'localResource') pending.push(kind); // Visible resource paints/effects are rejected by the style stage.
    };
    if (svg && name === 'style') {
      if (descriptive) addFeature('stylesheetInMetadata');
      if (node.children.length) invalid('SVG style elements must contain CSS text only');
      for (const attr of node.attributes) {
        if (attr.namespaceURI === XMLNS || attr.namespaceURI === XML || EDITORS.has(attr.namespaceURI) || ['id','type','media','title'].includes(attr.name)) continue;
        addFeature('stylesheetAttribute');
      }
      if (node.hasAttribute('type') && node.getAttribute('type').trim().toLowerCase() !== 'text/css') addFeature('stylesheetType');
      if (node.hasAttribute('media') && !['','all'].includes(node.getAttribute('media').trim().toLowerCase())) addFeature('stylesheetMedia');
      stylesheet(cssSecurity(node.textContent,kind => {if (!deferAppearance || kind !== 'localResource') addFeature(kind);}),addFeature,rules,limits,cssItem);
    }
    let record = null;
    if (!ignored && !(svg && name === 'style')) {
      const supported = svg && VECTOR.has(name) && (name !== 'svg' || node === root);
      if (!svg) appearance('elementNamespace');
      else if (!supported) appearance(name === 'svg' ? 'nestedViewport' : 'element:'+name.slice(0,64));
      if (supported || deferAppearance) {
        if (parent && !['svg','g'].includes(parent.name)) appearance('nestedGraphics');
        record = {name,attributes:Object.create(null),style:{values:Object.create(null),important:[]},children:[],...(deferAppearance ? {features:pending} : {})};
        if (parent) parent.children.push(record);else tree = record;
        for (const attr of node.attributes) {
          const key = attr.localName;
          if (attr.namespaceURI === XMLNS || attr.namespaceURI === XML && ['space','lang'].includes(key) || EDITORS.has(attr.namespaceURI)) continue;
          if (attr.namespaceURI) {appearance(attr.namespaceURI === XLINK && key === 'href' ? 'localResource' : 'attributeNamespace');continue;}
          if (key === 'style') record.style = declarations(cssSecurity(attr.value,appearance),appearance,cssItem);
          else if (['id','class','transform'].includes(key) || PRESENTATION.has(key) || (GEOMETRY[name] ?? []).includes(key)) record.attributes[key] = PRESENTATION.has(key) ? cssSecurity(attr.value,appearance) : attr.value;
          else if (key.startsWith('aria-') || key.startsWith('data-') || ['role','focusable','tabindex'].includes(key) || decorative(key)) continue;
          else appearance('attribute:'+key.slice(0,64));
        }
      }
    }
    for (let i = node.children.length-1;i >= 0;i--) work.push({node:node.children[i],parent:record ?? parent,inert:ignored,metadata:descriptive});
  }
  if (features.size) fail('UNSUPPORTED_SVG_FEATURE','SVG needs features not yet supported as editable vectors; export a plain SVG or use PNG/native JSON',{features:[...features.values()].slice(0,64),featureCount:features.size});
  return {tree,styleSheets:rules,stats:{bytes,elements,nodes,attributes,cssItems,namespaceInferred:inferred}};
}

export function inspectSVGXML(source,options={}) {return inspect(source,options);}
/** Import pipeline only: full security is identical/unconditional; unsupported
 * appearance is attached to records so computed invisibility can omit it safely.
 * This result MUST pass the style and native geometry stages before insertion.
 */
export function inspectSVGXMLForImport(source,options={}) {return inspect(source,options,true);}
