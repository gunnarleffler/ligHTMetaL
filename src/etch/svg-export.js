import {fail} from './errors.js';
import {exportBounds} from './export-bounds.js';
import {resolveLimits} from './validation.js';
import {visitStrokeOutline} from './geometry/stroke.js';
import {normalizeBackground,paperGrid,paperBands} from './background.js';

export const MAX_SVG_BYTES = 128*1024*1024;
const arity = {M:2,L:2,Q:4,C:6,Z:0};
const number = n => {
  if (typeof n !== 'number' || !Number.isFinite(n)) fail('INVALID_DOCUMENT','SVG geometry must be finite');
  return String(n); // Shortest round-trip decimal; never round editable geometry to a fixed precision.
};
const numbers = values => values.map(number).join(' ');

/** ASCII XML escaping also makes the writer's character budget an exact UTF-8 budget. */
export function escapeXML(value) {
  const entities = {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'};
  return String(value).replace(/[&<>"'\u0000-\u001f\u007f-\u{10ffff}]/gu,c => {
    if (entities[c]) return entities[c];
    const n = c.codePointAt(0);
    if (!(n === 9 || n === 10 || n === 13 || n >= 32 && n <= 0xd7ff || n >= 0xe000 && n <= 0xfffd || n >= 0x10000 && n <= 0x10ffff)) fail('INVALID_DOCUMENT','Invalid XML character');
    return `&#${n};`;
  });
}

class Writer {
  #chunks = [];#buffer = '';#bytes = 0;
  constructor(maximum) {this.maximum = maximum;}
  check(size) {
    if (size > this.maximum-this.#bytes) fail('EXPORT_TOO_LARGE','SVG exceeds its text-size safety limit; reduce visible content or use PNG',{limit:'svgBytes',maximum:this.maximum});
  }
  append(text) {
    this.check(text.length);this.#bytes += text.length;
    for (let i = 0;i < text.length;) {
      const size = Math.min(16384-this.#buffer.length,text.length-i);
      this.#buffer += text.slice(i,i+size);i += size;
      if (this.#buffer.length === 16384) {this.#chunks.push(this.#buffer);this.#buffer = '';}
    }
  }
  escaped(value) {
    const text = String(value);this.check(text.length);
    // Large values are canonical ASCII base64. Small attribute values stay whole,
    // so a Unicode surrogate pair is never split before XML escaping.
    if (text.length <= 4096) {this.append(escapeXML(text));return;}
    for (let i = 0;i < text.length;i += 4096) this.append(escapeXML(text.slice(i,i+4096)));
  }
  attr(name,value) {this.append(` ${name}="`);this.escaped(value);this.append('"');}
  finish() {this.#chunks.push(this.#buffer);return this.#chunks.join('');}
}

function paint(value) {
  if (value === null) return 'none';
  if (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value)) fail('INVALID_DOCUMENT','SVG paint must be opaque hex or null');
  return value;
}
function choice(value,allowed) {
  if (!allowed.includes(value)) fail('INVALID_DOCUMENT','Unsupported SVG presentation value');
  return value;
}

/** Serialize an immutable, validated native document, never imported XML/DOM.
 * No canvas, decoder, asset pin, view state or raster reservation is involved.
 */
export function serializeSVG(document,options={},overrides={}) {
  if (!options || typeof options !== 'object' || Array.isArray(options) || Object.keys(options).some(k => !['bounds','padding'].includes(k))) fail('INVALID_ARGUMENT','SVG options accept bounds and padding only');
  const limits = resolveLimits(overrides),bounds = exportBounds(document,options);
  const w = new Writer(Math.min(MAX_SVG_BYTES,limits.jsonBytes));
  const assets = new Map(document.assets.map(asset => [asset.id,asset]));
  let total = 0,elementCount = 0;
  function account(count) {
    total += count;elementCount += count;
    if (total > limits.derivedSegments || elementCount > limits.derivedSegmentsPerElement) {
      const limit = total > limits.derivedSegments ? 'derivedSegments' : 'derivedSegmentsPerElement';
      fail('EXPORT_TOO_LARGE','SVG exceeds its geometry safety limit',{limit,maximum:limits[limit]});
    }
  }
  function command(c) {
    if (!Object.hasOwn(arity,c[0]) || c.length !== arity[c[0]]+1) fail('INVALID_DOCUMENT','Invalid native path command');
    account(1);w.append(c[0]+numbers(c.slice(1))+' ');
  }
  function presentation(e,outline=false) {
    w.attr('fill',paint(outline ? e.color : e.type === 'line' ? null : e.fill));
    w.attr('fill-rule',outline ? 'nonzero' : choice(e.fillRule ?? 'nonzero',['nonzero','evenodd']));
    w.attr('stroke',outline ? 'none' : paint(e.stroke));
    if (!outline && e.stroke !== null) {
      w.attr('stroke-width',number(e.strokeWidth));
      w.attr('stroke-linecap',choice(e.lineCap ?? 'butt',['butt','round','square']));
      w.attr('stroke-linejoin',choice(e.lineJoin ?? 'round',['miter','round','bevel']));
      w.attr('stroke-miterlimit',number(e.miterLimit ?? 4));
    }
  }
  w.append('<svg xmlns="http://www.w3.org/2000/svg"');
  w.attr('width',number(bounds.width));w.attr('height',number(bounds.height));
  w.attr('viewBox',numbers([bounds.x,bounds.y,bounds.width,bounds.height]));
  w.append(' overflow="hidden">');
  if (document.background !== null) {
    const paper = typeof document.background === 'object' ? paperGrid(normalizeBackground(document.background)) : null;
    if (paper) {
      // Align tile rasterization with the crop, encoding world-origin phase inside
      // the tile. Fractional crops otherwise introduce a second texture-filter blur.
      const bands = paperBands(document.background,{width:paper.size,height:paper.size,scale:1,pan:[-bounds.x,-bounds.y]}).bands;
      w.append('<defs><pattern id="etch-paper" patternUnits="userSpaceOnUse"');
      w.attr('x',number(bounds.x));w.attr('y',number(bounds.y));
      w.attr('width',number(paper.size));w.attr('height',number(paper.size));w.attr('viewBox',numbers([0,0,paper.size,paper.size]));w.append('>');
      w.append('<rect x="0" y="0"');w.attr('width',number(paper.size));w.attr('height',number(paper.size));w.attr('fill',paper.color);w.append('/>');
      if (paper.dots) {
        const [x,y] = bands;
        for (let i=0;i<x.count;i++) for (let j=0;j<y.count;j++) {
          w.append('<circle');w.attr('cx',number(x.start+i*x.step));w.attr('cy',number(y.start+j*y.step));w.attr('r','1');w.attr('fill',x.color);w.append('/>');
        }
      } else for (const group of paper.groups) {
        const commands = [];
        for (const band of bands.filter(b => b.color === group.color)) for (let i=0;i<band.count;i++) {
          const p = band.start+i*band.step;
          commands.push(band.axis === 0 ? `M${number(p)} 0V${number(paper.size)}` : `M0 ${number(p)}H${number(paper.size)}`);
        }
        w.append('<path');w.attr('d',commands.join(' '));w.attr('fill','none');w.attr('stroke',group.color);w.attr('stroke-width',number(group.width));w.append('/>');
      }
      w.append('</pattern></defs>');
    }
    w.append('<rect');for (const key of ['x','y','width','height']) w.attr(key,number(bounds[key]));
    w.attr('fill',paper ? 'url(#etch-paper)' : paint(document.background));w.append(' stroke="none"/>');
  }
  for (const layer of document.layers) {
    if (!layer.visible) continue;
    w.append('<g');w.attr('transform',`translate(${numbers(layer.offset)})`);w.append('>');
    for (const e of layer.elements) {
      elementCount = 0;
      const type = ['stroke','highlight','ink','path'].includes(e.type) ? 'path' : e.type;
      if (!['path','line','rect','ellipse','image'].includes(type)) fail('INVALID_DOCUMENT','Unknown native element type');
      w.append(`<${type}`);w.attr('transform',`matrix(${numbers(e.transform)})`);
      if (e.type === 'highlight') w.attr('opacity',number(e.opacity));
      if (type === 'path') {
        presentation(e,e.type !== 'path');w.append(' d="');
        if (e.type === 'stroke' || e.type === 'highlight') visitStrokeOutline(e,command);
        else if (e.type === 'ink') {for (const part of e.parts) for (const c of part) command(c);}
        else for (const c of e.commands) command(c);
        w.append('"');
      } else if (type === 'image') {
        const asset = assets.get(e.assetId);
        if (!asset || !['image/png','image/webp'].includes(asset.mime) || typeof asset.data !== 'string') fail('INVALID_DOCUMENT','SVG image asset is missing or unsupported');
        for (const key of ['x','y','width','height']) w.attr(key,number(e[key]));
        w.append(' preserveAspectRatio="none" href="data:');w.escaped(asset.mime);w.append(';base64,');w.escaped(asset.data);w.append('"');
      } else {
        presentation(e);
        if (type === 'line') {
          account(2);for (const [key,value] of [['x1',e.start[0]],['y1',e.start[1]],['x2',e.end[0]],['y2',e.end[1]]]) w.attr(key,number(value));
        } else {
          account(type === 'rect' ? 5 : 4);
          for (const key of type === 'rect' ? ['x','y','width','height'] : ['cx','cy','rx','ry']) w.attr(key,number(e[key]));
        }
      }
      w.append('/>');
    }
    w.append('</g>');
  }
  w.append('</svg>');return w.finish();
}
