import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseSVGColor as color} from '../../../src/etch/import/svg-colors.js';
import {resolveSVGStyles as resolve} from '../../../src/etch/import/svg-style.js';
import {code} from './helpers.js';
const decl = (values={},important=[]) => ({values,important});
const node = (name='rect',attributes={},children=[],style=decl()) => ({name,attributes,children,style});
const sheet = (kind,name,values,important=[]) => ({selectors:[{kind,name}],declarations:decl(values,important)});
const run = (tree,sheets=[],options={}) => resolve({tree,styleSheets:sheets},{isValidDeclaration:(_name,value) => value !== 'invalid',...options});
const leaves = result => result.records.filter(r => r.paint).map(r => r.paint);

test('sRGB colors normalize names/aliases/hex and legacy or modern RGB/HSL',() => {
  for (const [source,expected] of [['rebeccapurple','#663399'],['grey','#808080'],['#123','#112233'],['rgb(100%, 0%, 50%)','#FF0080'],['rgb(255 0 128 / 100%)','#FF0080'],['hsl(300deg 100% 50%)','#FF00FF'],['hsl(.5turn,100%,50%)','#00FFFF'],['hsl(200grad 100% 50%)','#00FFFF'],['hsl(3.141592653589793rad 100% 50%)','#00FFFF'],['rgb(300 -10 128)','#FF0080']]) assert.deepEqual(color(source),{color:expected,alpha:1},source);
});
test('color alpha is preserved without raster-byte rounding; zero and short/long alpha hex work',() => {
  assert.deepEqual(color('transparent'),{color:'#000000',alpha:0});assert.deepEqual(color('#1230'),{color:'#112233',alpha:0});assert.equal(color('#12345680').alpha,128/255);
  assert.equal(color('rgba(1,2,3,.000001)').alpha,.000001);assert.equal(color('rgb(1 2 3 / 99.9999%)').alpha,.999999);
});
test('color parser excludes host-dependent colors, CSS functions/resources and malformed channels',() => {
  for (const source of ['CanvasText','currentColor','var(--x)','url(#x)','color(display-p3 1 0 0)','lab(50% 0 0)','#12','rgb(1,2)','hsl(50% 100% 50%)','hsl(20 1 1)','rgb(10%,2,3)','rgb(1 2 3 / .5 / .2)']) assert.throws(() => color(source),code('UNSUPPORTED_SVG_FEATURE'),source);
  assert.throws(() => color('x'.repeat(513)),code('LIMIT_EXCEEDED'));
});
test('SVG paint defaults are black fill/no stroke/butt/miter/4/nonzero, not drawing-tool defaults',() => {
  assert.deepEqual(leaves(run(node()))[0],{fill:'#000000',stroke:null,strokeWidth:0,lineCap:'butt',lineJoin:'miter',miterLimit:4,fillRule:'nonzero'});
  assert.equal(leaves(run(node('line')))[0].fill,null);
  const inactive = leaves(run(node('path',{fill:'none','fill-rule':'evenodd','stroke-linecap':'round','stroke-linejoin':'bevel','stroke-miterlimit':'7'})))[0];
  assert.equal(inactive.fillRule,'evenodd');assert.equal(inactive.lineCap,'round');assert.equal(inactive.lineJoin,'bevel');assert.equal(inactive.miterLimit,7);
});
test('tag/class/ID specificity, source order, inline styles and importance cascade correctly',() => {
  const tree = node('rect',{id:'x',class:'a a b',fill:'pink'},[],decl({fill:'gold'}));
  const sheets = [sheet('tag','rect',{fill:'green'}),sheet('class','a',{fill:'red'}),sheet('class','b',{fill:'blue'}),sheet('id','x',{fill:'purple'})];
  assert.equal(leaves(run(tree,sheets))[0].fill,'#FFD700');
  sheets.push(sheet('class','a',{fill:'red'},['fill']));assert.equal(leaves(run(tree,sheets))[0].fill,'#FF0000');
  tree.style.important = ['fill'];assert.equal(leaves(run(tree,sheets))[0].fill,'#FFD700');
  tree.style = decl();assert.equal(leaves(run(tree,sheets.slice(0,3)))[0].fill,'#0000FF');
});
test('invalid later declarations and invalid important declarations do not erase valid predecessors',() => {
  const tree = node('rect',{},[],{values:{fill:'invalid'},important:['fill'],entries:[{name:'fill',value:'red',important:false},{name:'fill',value:'invalid',important:true}]});
  assert.equal(leaves(run(tree))[0].fill,'#FF0000');
  tree.style.entries.push({name:'fill',value:'blue',important:false});assert.equal(leaves(run(tree))[0].fill,'#0000FF');
});
test('inheritance/currentColor are resolved at the painted element, including explicit CSS-wide keywords',() => {
  const tree = node('svg',{color:'red',fill:'currentColor','stroke-width':'4',display:'block'},[
    node('rect',{color:'blue'}),node('rect',{fill:'initial',color:'initial'}),node('rect',{fill:'unset',color:'inherit'}),node('rect',{'stroke-width':'initial',stroke:'currentColor'})]);
  const result = run(tree),paint = leaves(result);assert.deepEqual(paint.map(p => p.fill),['#0000FF','#000000','#FF0000','#FF0000']);assert.equal(paint[3].strokeWidth,1);assert.equal(result.records[1].computed.display,'inline');
});
test('display:none and opacity:0 prune subtrees; visibility:hidden allows visible descendants',() => {
  const tree = node('svg',{},[node('g',{display:'none'},[node('rect',{fill:'lab(50% 0 0)'})]),node('g',{opacity:'0'},[node('rect',{fill:'var(--x)'})]),node('g',{visibility:'hidden'},[node('rect'),node('rect',{visibility:'visible',fill:'blue'})])]);
  const result = run(tree);assert.equal(result.records.length,6);assert.equal(leaves(result).length,1);assert.equal(leaves(result)[0].fill,'#0000FF');
});
test('zero/one opacity and alpha none are retained, partial alpha never silently becomes opaque',() => {
  assert.equal(leaves(run(node('rect',{fill:'rgba(1,2,3,0)'})))[0].fill,null);
  assert.equal(leaves(run(node('rect',{fill:'lab(50% 0 0)','fill-opacity':'0'})))[0].fill,null);
  assert.equal(leaves(run(node('rect',{stroke:'rgba(1,2,3,.5)','stroke-width':'0'})))[0].stroke,null);
  for (const attrs of [{fill:'rgba(1,2,3,.000001)'},{fill:'red','fill-opacity':'.999999'},{stroke:'red','stroke-opacity':'.5'},{opacity:'.5'}]) assert.throws(() => run(node('rect',attrs)),code('UNSUPPORTED_SVG_FEATURE'));
  assert.throws(() => run(node('g',{opacity:'.5',visibility:'hidden'},[node('rect',{visibility:'visible'})])),code('UNSUPPORTED_SVG_FEATURE'));
});
test('unsupported appearance rejects, but inherited hints overridden on children are not group effects',() => {
  for (const attrs of [{filter:'blur(2px)'},{'stroke-dasharray':'2 3',stroke:'red'},{'shape-rendering':'crispEdges'},{'vector-effect':'non-scaling-stroke'},{'paint-order':'stroke fill',stroke:'red'},{isolation:'isolate'}]) assert.throws(() => run(node('rect',attrs)),code('UNSUPPORTED_SVG_FEATURE'));
  const tree = node('g',{'stroke-dasharray':'2 3','shape-rendering':'crispEdges'},[node('rect',{'stroke-dasharray':'none','shape-rendering':'auto'})]);assert.ok(run(tree));
  assert.ok(run(node('rect',{'stroke-dasharray':'2 3',stroke:'none'})));
  assert.ok(run(node('g',{opacity:'.5'},[node('rect',{fill:'none',stroke:'none'})])));
});
test('physical stroke widths normalize; percentage/relative widths and native-range violations reject',() => {
  assert.equal(leaves(run(node('rect',{stroke:'red','stroke-width':'1pt'})))[0].strokeWidth,96/72);
  for (const width of ['1%','1em']) assert.throws(() => run(node('rect',{stroke:'red','stroke-width':width})),code('UNSUPPORTED_SVG_FEATURE'));
  for (const width of ['.001','1000001']) assert.throws(() => run(node('rect',{stroke:'red','stroke-width':width})),code('LIMIT_EXCEEDED'));
});
test('indexed matching, duplicate classes, nodes/depth and aggregate work are bounded',() => {
  const tree = node('svg',{},[node('g',{},[node()])]);
  for (const options of [{maxNodes:1},{maxDepth:1},{maxWork:1}]) assert.throws(() => run(tree,[],options),code('LIMIT_EXCEEDED'));
  assert.throws(() => run(node('rect',{class:'a a a'}),[],{maxClasses:2}),code('LIMIT_EXCEEDED'));
  assert.throws(() => run(node(),[sheet('class','a',{}),sheet('class','b',{})],{maxSelectors:1}),code('LIMIT_EXCEEDED'));
  for (const options of [null,{maxWork:1000001},{unexpected:1}]) assert.throws(() => resolve({tree,styleSheets:[]},options),code('INVALID_ARGUMENT'));
});
test('style resolution does not mutate or return mutable aliases to input attributes',() => {
  const tree = node('rect',Object.freeze({fill:'red'})),before = JSON.stringify(tree),result = run(tree);result.records[0].attributes.fill = 'blue';assert.equal(JSON.stringify(tree),before);assert.equal(leaves(run(tree))[0].fill,'#FF0000');
});
