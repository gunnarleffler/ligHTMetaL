import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeSVGGeometry as normalize} from '../../../src/etch/import/svg-geometry.js';
import {resolveSVGStyles} from '../../../src/etch/import/svg-style.js';
import {validateDocument} from '../../../src/etch/validation.js';
import {code} from './helpers.js';
const node = (name,attributes={},children=[]) => ({name,attributes,children,style:{values:{},important:[]}});
const styled = (children,attrs={}) => resolveSVGStyles({tree:node('svg',{width:'200',height:'100',...attrs},children),styleSheets:[]},{isValidDeclaration:() => true});
const run = (children,attrs={},options={}) => normalize(styled(children,attrs),options);

test('primitives and paths become validated native geometry in painter order, without source IDs/metadata',() => {
  const result = run([node('rect',{id:'source',x:'10',y:'10',width:'20',height:'20'}),node('circle',{cx:'60',cy:'30',r:'10'}),node('ellipse',{cx:'90',cy:'30',rx:'10',ry:'5'}),node('line',{x1:'10',y1:'60',x2:'40',y2:'60',stroke:'red'}),node('polyline',{points:'60,60 70,70 80,60',fill:'none',stroke:'blue'}),node('polygon',{points:'100 60 110 70 120 60'}),node('path',{d:'m140 60h20v20z'})]);
  const elements = result.document.layers[0].elements;assert.deepEqual(elements.map(e => e.type),['rect','ellipse','ellipse','line','path','path','path']);assert.equal(elements[1].rx,10);assert.equal(elements[1].ry,10);assert.notEqual(elements[0].id,'source');assert.ok(!JSON.stringify(result.document).includes('source'));assert.equal(elements[4].commands.at(-1)[0],'L');assert.equal(elements[5].commands.at(-1)[0],'Z');assert.deepEqual(validateDocument(result.document),result.document);
});
test('root viewBox and nested affine transforms stay native, preserving local stroke widths',() => {
  const result = run([node('g',{transform:'translate(5 5)'},[node('rect',{x:'20',y:'30',width:'20',height:'10',stroke:'red','stroke-width':'2',transform:'scale(1 .5)'})])],{viewBox:'10 0 100 50'});
  const e = result.document.layers[0].elements[0];assert.deepEqual(e.transform,[2,0,0,1,-10,10]);assert.equal(e.strokeWidth,2);assert.equal(e.width,20);
  const compensated = run([node('g',{transform:'scale(.00001)'},[node('rect',{width:'20',height:'20',transform:'scale(100)'})])]);assert.equal(compensated.document.layers[0].elements[0].transform[0],.001);
});
test('tight primitive bounds accept border rectangles, ellipses and butt lines without fictitious miter clipping',() => {
  for (const shape of [node('rect',{x:'1',y:'1',width:'198',height:'98',stroke:'black','stroke-width':'2'}),node('ellipse',{cx:'100',cy:'50',rx:'99',ry:'49',stroke:'black','stroke-width':'2'}),node('line',{x1:'0',y1:'50',x2:'200',y2:'50',stroke:'black','stroke-width':'10'})]) {
    const result = run([shape]);assert.ok(result.bounds.x >= -1e-10);assert.ok(result.bounds.x+result.bounds.width <= 200+1e-10);
  }
});
test('outside painted geometry, cropped slice content and approximation margins cannot lose root clipping',() => {
  for (const [children,attrs] of [[[node('rect',{x:'-1',width:'20',height:'20'})],{}],[[node('line',{x1:'0',y1:'50',x2:'200',y2:'50',stroke:'black','stroke-width':'10','stroke-linecap':'round'})],{}],[[node('rect',{width:'100',height:'100'})],{viewBox:'0 0 100 100',preserveAspectRatio:'xMidYMid slice'}]]) assert.throws(() => run(children,attrs),code('UNSUPPORTED_SVG_FEATURE'));
  assert.throws(() => run([node('path',{d:'M0 50A50 50 0 0 1 100 50'})]),code('UNSUPPORTED_SVG_FEATURE'));
});
test('arcs refine against the complete matrix and native paths remain absolute/valid',() => {
  const result = run([node('path',{d:'M30 40a20 15 30 0 1 40 0',stroke:'red',fill:'none'})]);const e = result.document.layers[0].elements[0];assert.ok(e.commands.some(c => c[0] === 'C'));assert.ok(e.commands.every(c => ['M','L','C','Q','Z'].includes(c[0])));
});
test('aggregate points/derived/elements/work are charged before collecting geometry and paths',() => {
  const paths = [node('path',{d:'M10 10L20 20'}),node('path',{d:'M30 10L40 20'})];
  for (const options of [{limits:{points:3}},{limits:{derivedSegments:3}},{limits:{elements:1}},{maxWork:1},{limits:{pointsPerElement:1}}]) assert.throws(() => run(paths,{},options),code('LIMIT_EXCEEDED'));
  assert.throws(() => run([node('polygon',{points:'10 10 20 10 20 20'})],{},{limits:{pointsPerElement:3}}),code('LIMIT_EXCEEDED'));
});
test('empty/zero geometry does not create a document; unsupported corners/caps/root transforms do not approximate',() => {
  for (const children of [[],[node('rect',{width:'0',height:'20'})],[node('circle',{r:'0'})],[node('path',{d:'M10 10'})],[node('line',{x1:'10',y1:'10',x2:'10',y2:'10',stroke:'red'})]]) assert.throws(() => run(children),code('EMPTY_IMPORT'));
  assert.throws(() => run([node('rect',{width:'20',height:'20',rx:'2'})]),code('UNSUPPORTED_SVG_FEATURE'));
  for (const [cap,type] of [['round','ellipse'],['square','rect']]) {
    assert.equal(run([node('line',{x1:'20',y1:'20',x2:'20',y2:'20',stroke:'red','stroke-linecap':cap})]).document.layers[0].elements[0].type,type);
    for (const d of ['M20 20L20 20','M20 20Z','M20 20A5 5 0 0 1 20 20']) assert.throws(() => run([node('path',{d,stroke:'red','stroke-linecap':cap})]),code('UNSUPPORTED_SVG_FEATURE'));
  }
  assert.throws(() => run([node('rect',{width:'20',height:'20'})],{transform:'rotate(10)'}),code('UNSUPPORTED_SVG_FEATURE'));
});
test('negative dimensions/singular painted transforms/native primitive ranges fail atomically',() => {
  assert.throws(() => run([node('rect',{width:'-1',height:'20'})]),code('INVALID_SVG'));
  for (const points of ['10 10L20 20','10 10Z','M10 10 20 20']) assert.throws(() => run([node('polyline',{points})]),code('INVALID_SVG'));
  assert.throws(() => run([node('rect',{width:'20',height:'20',transform:'scale(0)'})]),code('LIMIT_EXCEEDED'));
  assert.equal(run([node('rect',{width:'.001',height:'20'})]).document.layers[0].elements[0].type,'path');
});
test('fresh native IDs, no mutable input aliases, transparent background and stable viewport',() => {
  const source = styled([node('rect',{x:'10',y:'10',width:'20',height:'20'})]),before = JSON.stringify(source),first = normalize(source),second = normalize(source);assert.notEqual(first.document.layers[0].id,second.document.layers[0].id);first.document.layers[0].elements[0].transform[0] = 99;assert.equal(JSON.stringify(source),before);assert.equal(second.document.background,null);assert.deepEqual(second.viewport,{x:0,y:0,width:200,height:100});
});
