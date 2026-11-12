import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseSVGTransform as transform,parseSVGLength as length,resolveSVGViewport as viewport,validateSVGImportMatrix as validate} from '../../../src/etch/import/svg-coordinates.js';
import {multiply,apply} from '../../../src/etch/geometry/matrix.js';
import {code} from './helpers.js';
const close = (a,b) => {assert.equal(a.length,b.length);a.forEach((n,i) => assert.ok(Math.abs(n-b[i]) <= 1e-10*Math.max(1,Math.abs(b[i])),`${a} != ${b}`));};

test('SVG transforms preserve order, compact arguments, defaults and fresh identity',() => {
  close(transform('translate(10-20)scale(2),rotate(90)'),[0,2,-2,0,10,-20]);
  close(transform('matrix(1 2 3 4 5 6)'),[1,2,3,4,5,6]);
  close(transform('translate(.5.25) scale(2,3)'),[2,0,0,3,.5,.25]);
  const identity = transform(' \n ');identity[0] = 9;assert.deepEqual(transform(''),[1,0,0,1,0,0]);assert.deepEqual(transform('none'),[1,0,0,1,0,0]);
});
test('rotate around pivot, reflections, shears and large reduced angles retain affine geometry',() => {
  close(apply(transform('rotate(90,10,20)'),[10,21]),[9,20]);
  close(transform('scale(-2 3) skewX(45) skewY(-45)'),multiply([-2,0,0,3,0,0],multiply([1,0,1,1,0,0],[1,-1,0,1,0,0])));
  close(transform('rotate(360090)'),transform('rotate(90)'));
});
test('native ranges apply to full matrices, not individual local/prefix transforms',() => {
  close(validate(transform('scale(.00001)scale(100)')),[.001,0,0,.001,0,0]);
  close(validate(multiply(transform('scale(.00001)'),transform('scale(100)'))),[.001,0,0,.001,0,0]);
  assert.deepEqual(transform('scale(0)'),[0,0,0,0,0,0]);
  for (const matrix of [transform('scale(0)'),transform('scale(.00001)'),transform('scale(10001)'),[1,0,0,1,10000001,0],[1,0,0,1,NaN,0]]) assert.throws(() => validate(matrix),code('LIMIT_EXCEEDED'));
});
test('transform syntax rejects malformed packs, CSS syntax and trailing garbage',() => {
  for (const source of ['translate()','translate(1,)','translate(,1)','translate(1,,2)','translate(1 2 3)','rotate(20 10)','matrix(1 0 0 1 0)','scale(1),',',scale(1)','Translate(1)','translate(1px)','rotate(10deg)','skew(1)','translate(1e+)','scale(Infinity)','scale(1);scale(2)','scale(1'] ) assert.throws(() => transform(source),code('INVALID_SVG'),source);
});
test('transform input/count/numeric/token limits fail without partial matrices',() => {
  for (const source of ['scale(1e999)','scale(1e-999)','translate(10000001)','skewX(90)','scale(10000000)scale(2)']) assert.throws(() => transform(source),code('LIMIT_EXCEEDED'),source);
  assert.throws(() => transform(' '.repeat(65537)),code('LIMIT_EXCEEDED'));
  assert.throws(() => transform(`translate(${ '0'.repeat(129) })`),code('LIMIT_EXCEEDED'));
  assert.throws(() => transform('scale(1)scale(1)',{maxTransforms:1}),code('LIMIT_EXCEEDED'));
  for (const options of [null,[],{maxTransforms:2001},{maxTransforms:0},{unknown:1}]) assert.throws(() => transform('',options),code('INVALID_ARGUMENT'));
});
test('lengths resolve unitless/px and physical CSS units at 96px/in',() => {
  for (const source of ['96','96px','1in','2.54cm','25.4mm','101.6Q','72pt','6pc',' 9.6e1PX ']) close([length(source)],[96]);
  close([length('-2mm')],[-192/25.4]);assert.equal(length('50%',{percentBase:80}),40);
});
test('length syntax/context/units and numeric range reject instead of using host layout',() => {
  for (const source of ['1em','1ex','2rem','10vh','50%']) assert.throws(() => length(source),code('UNSUPPORTED_SVG_FEATURE'));
  for (const source of ['','10 px','1,2','calc(1px + 2px)','NaN','1px garbage']) assert.throws(() => length(source),code('INVALID_SVG'));
  for (const source of ['1e999px','1e-999px','10000000in']) assert.throws(() => length(source),code('LIMIT_EXCEEDED'));
  assert.throws(() => length('1%',{percentBase:Infinity}),code('INVALID_ARGUMENT'));
});
test('root defaults and intrinsic dimensions/ratios do not depend on host viewport',() => {
  assert.deepEqual(viewport({}),{width:300,height:150,viewBox:null,matrix:[1,0,0,1,0,0],viewport:{x:0,y:0,width:300,height:150}});
  assert.equal(viewport({width:'100'}).height,150);
  assert.equal(viewport({viewBox:'10 20 80 40'}).width,80);
  assert.equal(viewport({viewBox:'10 20 80 40',width:'200'}).height,100);
  assert.equal(viewport({viewBox:'10 20 80 40',height:'100'}).width,200);
  close(viewport({viewBox:'10 20 80 40',width:'50%',height:'200%'}).matrix,[.5,0,0,.5,-5,20]);
  assert.throws(() => viewport({width:'100%'}),code('UNSUPPORTED_SVG_FEATURE'));
});
test('viewBox meet/slice/none and all nine alignments have explicit viewport mapping',() => {
  for (const [x,ax] of [['Min',0],['Mid',.5],['Max',1]]) for (const [y,ay] of [['Min',0],['Mid',.5],['Max',1]]) {
    const attrs = {width:'200',height:'100',viewBox:'10 20 40 40',preserveAspectRatio:`x${x}Y${y} meet`};
    close(viewport(attrs).matrix,[2.5,0,0,2.5,100*ax-25,-50]);
    close(viewport({...attrs,preserveAspectRatio:`x${x}Y${y} slice`}).matrix,[5,0,0,5,-50,-100*ay-100]);
  }
  close(viewport({width:'200',height:'100',viewBox:'10 20 40 40',preserveAspectRatio:'defer none slice'}).matrix,[5,0,0,2.5,-50,-50]);
});
test('zero viewport/viewBox is empty; negative/malformed sizes are invalid',() => {
  for (const attrs of [{width:'0'},{height:'0'},{viewBox:'0 0 0 20'},{viewBox:'0 0 10 0'}]) assert.throws(() => viewport(attrs),code('EMPTY_IMPORT'));
  for (const attrs of [{width:'-1'},{height:'-1'},{viewBox:'0 0 -1 20'},{viewBox:'0 0 20'},{viewBox:'0 0 20 20,'},{preserveAspectRatio:'xMiddleYMiddle'},{preserveAspectRatio:'xMidYMid garbage'}]) assert.throws(() => viewport(attrs),code('INVALID_SVG'));
  assert.throws(() => viewport({viewBox:'0 0 1 1e-300',height:'100'}),code('LIMIT_EXCEEDED'));
});
test('viewport results do not alias source or each other; coordinate helpers are DOM free',() => {
  const source = Object.freeze({viewBox:'10 20 40 40',width:'200',height:'100'}),a = viewport(source);a.matrix[0] = 99;a.viewBox[0] = 99;
  close(viewport(source).matrix,[2.5,0,0,2.5,25,-50]);assert.equal(viewport(source).viewBox[0],10);
});
