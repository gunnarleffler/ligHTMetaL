import {test} from 'node:test';
import assert from 'node:assert/strict';
import {serializeSVG,escapeXML} from '../../../src/etch/svg-export.js';
import {planPNG} from '../../../src/etch/png-export.js';
import {exportBounds} from '../../../src/etch/export-bounds.js';
import {strokeOutline} from '../../../src/etch/geometry/stroke.js';
import {EditorState} from '../../../src/etch/state.js';
import {code,fixture} from './helpers.js';

const empty = {background:null,layers:[],assets:[]};
const crop = {padding:0,bounds:{x:0,y:0,width:100,height:80}};

test('SVG empty bounds match PNG fallback and explicit fractional crops keep full precision',() => {
  const svg = serializeSVG(empty);assert.match(svg,/width="288" height="288" viewBox="-144 -144 288 288"/);assert.match(svg,/overflow="hidden"/);assert.ok(svg.endsWith('</svg>'));assert.doesNotMatch(svg,/<rect|<path/);
  assert.deepEqual(exportBounds(empty),planPNG(empty).bounds);
  assert.match(serializeSVG(empty,{bounds:{x:-0.25,y:0.125,width:2.5,height:3.75},padding:0.125}),/width="2.75" height="4" viewBox="-0.375 0 2.75 4"/);
});
test('zero-area fill-only bounds use the empty fallback in both exporters even with zero padding',() => {
  const d = fixture(),e = d.layers[0].elements.find(e => e.type === 'path');e.commands = [['M',10,0],['L',10,20]];e.stroke = null;e.strokeWidth = 0;d.layers[0].elements = [e];e.transform = [1,0,0,1,0,0];
  assert.deepEqual(exportBounds(d,{padding:0}),{x:-128,y:-128,width:256,height:256});assert.deepEqual(planPNG(d,{padding:0}).bounds,exportBounds(d,{padding:0}));
  assert.match(serializeSVG(d,{padding:0}),/width="256" height="256" viewBox="-128 -128 256 256"/);
});
test('SVG background fills the complete padded crop, not the drawing bounds',() => {
  const svg = serializeSVG({...empty,background:'#ABCDEF'},crop);
  assert.match(svg,/<rect x="0" y="0" width="100" height="80" fill="#ABCDEF" stroke="none"\/>/);
});
test('SVG uses shared painted bounds, visible locked artwork, offsets and painter order',() => {
  const d = fixture();d.layers[0].locked = true;
  d.layers.push({...structuredClone(d.layers[0]),id:'hidden',visible:false,offset:[9999,9999]});
  const bounds = exportBounds(d),svg = serializeSVG(d);
  assert.ok(svg.includes(`viewBox="${[bounds.x,bounds.y,bounds.width,bounds.height].join(' ')}"`));
  assert.equal((svg.match(/<g /g) ?? []).length,1);assert.match(svg,/transform="translate\(10 -20\)"/);
  assert.ok(svg.indexOf('<line ') < svg.indexOf('<rect '));assert.ok(svg.indexOf('<rect ') < svg.indexOf('<ellipse '));assert.ok(svg.indexOf('<ellipse ') < svg.indexOf('<image '));
});
test('SVG pressure/uniform strokes use the identical generated nonzero filled outline',() => {
  for (const pressure of [false,true]) {
    const d = fixture(),e = d.layers[0].elements[0];e.pressure = pressure;d.layers[0].elements = [e];
    const outline = strokeOutline(e).map(([op,...n]) => op+n.map(String).join(' ')+' ').join('');
    const svg = serializeSVG(d,crop);assert.ok(svg.includes(`d="${outline}"`));assert.match(svg,/fill="#112233" fill-rule="nonzero" stroke="none"/);assert.doesNotMatch(svg,/<polyline/);
  }
});
test('SVG cut ink retains separate closed parts and paths retain curves, holes and stroke presentation',() => {
  const d = fixture(),path = d.layers[0].elements.find(e => e.type === 'path');
  path.fillRule = 'evenodd';path.lineCap = 'square';path.lineJoin = 'bevel';path.miterLimit = 7;
  const parts = [[['M',0,0],['L',10,0],['L',0,10],['Z']],[['M',20,0],['L',30,0],['L',20,10],['Z']]];
  d.layers[0].elements = [path,{id:'ink',type:'ink',transform:[1,0,0,1,0,0],color:'#FF8800',parts}];
  const svg = serializeSVG(d,crop);assert.match(svg,/fill-rule="evenodd"/);assert.match(svg,/stroke-linecap="square" stroke-linejoin="bevel" stroke-miterlimit="7"/);
  assert.ok(svg.includes('M0 0 C10 0 20 30 30 30 L0 30 Z '));assert.ok(svg.includes('M0 0 L10 0 L0 10 Z M20 0 L30 0 L20 10 Z '));
});
test('SVG embeds exact image MIME/base64 and explicitly stretches native image rectangles',() => {
  const d = fixture(),e = d.layers[0].elements.find(e => e.type === 'image');d.layers[0].elements = [e];
  for (const mime of ['image/png','image/webp']) {
    d.assets[0].mime = mime;const svg = serializeSVG(d,crop);
    assert.ok(svg.includes(`href="data:${mime};base64,${d.assets[0].data}"`));assert.match(svg,/preserveAspectRatio="none"/);
    assert.doesNotMatch(svg,/xlink:|<use|<defs/);
  }
});
test('SVG emits no editing metadata, source names, IDs, image alt or executable source text',() => {
  const d = fixture(),hostile = '<script onload="evil()">&\'https://evil.invalid';
  d.layers[0].name = hostile;d.layers[0].id = hostile;
  for (const e of d.layers[0].elements) {e.id = hostile;if (e.type === 'image') e.alt = hostile;}
  const svg = serializeSVG(d,crop);assert.doesNotMatch(svg,/script|onload|evil|\bid=|\balt=|style=|class=|<metadata|<!DOCTYPE/);
  assert.equal(escapeXML('&<>"\' é🙂'),'&amp;&lt;&gt;&quot;&apos; &#233;&#128578;');
  for (const bad of ['\0','\ud800','\uffff']) assert.throws(() => escapeXML(bad),code('INVALID_DOCUMENT'));
});
test('SVG keeps shortest round-trip numbers, exponent notation, shear and tiny coordinates',() => {
  const d = fixture(),e = d.layers[0].elements.find(e => e.type === 'path');
  e.transform = [1,0.12345678901234566,0.23456789012345678,1,1e-8,-0];e.commands = [['M',1e-8,0],['Q',0.12345678901234566,2,3,4]];d.layers[0].elements = [e];
  const svg = serializeSVG(d,crop);assert.ok(svg.includes('matrix(1 0.12345678901234566 0.23456789012345677 1 1e-8 0)'));assert.ok(svg.includes('M1e-8 0 Q0.12345678901234566 2 3 4 '));
});
test('SVG rejects invalid options, overflow and PNG-only scale without returning partial output',() => {
  for (const options of [null,[],{scale:1},{other:0},{padding:null},{padding:-1},{padding:Infinity},{bounds:null},{bounds:{x:0,y:0,width:0,height:1}},{bounds:{x:0,y:0,width:1}},{bounds:{x:NaN,y:0,width:1,height:1}},{bounds:{x:1e308,y:0,width:1e308,height:1}}]) assert.throws(() => serializeSVG(empty,options),code('INVALID_ARGUMENT'));
  assert.match(serializeSVG(empty,{padding:0,bounds:{x:0,y:0,width:100000,height:100000}}),/width="100000"/); // No raster-size restriction.
});
test('SVG text budget is exact at its byte boundary and independent of raster allowances',() => {
  const svg = serializeSVG(fixture(),crop),size = Buffer.byteLength(svg);
  assert.equal(serializeSVG(fixture(),crop,{jsonBytes:size,totalPixels:1,rasterDimension:1,assetPixels:1}),svg);
  assert.throws(() => serializeSVG(fixture(),crop,{jsonBytes:size-1}),e => e.code === 'EXPORT_TOO_LARGE' && e.details.limit === 'svgBytes' && e.details.suggestedScale === undefined);
});
test('SVG geometry budgets and defensive paint/path/image allowlists reject unsupported content',() => {
  const d = fixture(),e = d.layers[0].elements.find(e => e.type === 'path');d.layers[0].elements = [e];
  assert.throws(() => serializeSVG(d,crop,{derivedSegmentsPerElement:2}),e => e.code === 'EXPORT_TOO_LARGE' && e.details.limit === 'derivedSegmentsPerElement' && e.details.maximum === 2);
  for (const fill of ['url(https://evil.invalid)','red','" onload="evil']) {const bad = structuredClone(d);bad.layers[0].elements[0].fill = fill;assert.throws(() => serializeSVG(bad,crop),code('INVALID_DOCUMENT'));}
  const bad = structuredClone(d);bad.layers[0].elements[0].commands = [['X',0,0]];assert.throws(() => serializeSVG(bad,crop),code('INVALID_DOCUMENT'));
  const image = fixture();image.assets[0].mime = 'image/svg+xml';assert.throws(() => serializeSVG(image,crop),code('INVALID_DOCUMENT'));
});
test('vector capture is committed, immutable, detached from mutable limits and guarded after destroy',async () => {
  const state = new EditorState();const before = state.captureVectorExport(),revision = state.getRevision();
  state.setBackground('#AABBCC');assert.equal(before.document.background,null);assert.equal(before.revision,revision);assert.ok(Object.isFrozen(before.document));
  before.limits.jsonBytes = 1;assert.notEqual(state.captureVectorExport().limits.jsonBytes,1);
  const svg = serializeSVG(before.document);state.destroy();assert.match(svg,/<svg /);assert.throws(() => state.captureVectorExport(),code('DESTROYED'));
});
