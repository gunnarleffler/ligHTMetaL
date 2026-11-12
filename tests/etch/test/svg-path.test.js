import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeSVGPath as parse} from '../../../src/etch/import/svg-path.js';
import {validateDocument} from '../../../src/etch/validation.js';
import {fixture,code} from './helpers.js';

function bezier(start,c,t) {
  let row = [start,c.slice(1,3),c.slice(3,5),c.slice(5,7)];
  while (row.length > 1) row = row.slice(1).map((p,i) => p.map((n,j) => row[i][j]*(1-t)+n*t));
  return row[0];
}
function ellipse(cx,cy,rx,ry,rotation,theta) {
  const a = rotation*Math.PI/180,x = rx*Math.cos(theta),y = ry*Math.sin(theta);
  return [cx+x*Math.cos(a)-y*Math.sin(a),cy+x*Math.sin(a)+y*Math.cos(a)];
}
function arcError(commands,point,transform) {
  let previous = commands[0].slice(1),maximum = 0;const curves = commands.slice(1);
  for (let i = 0;i < curves.length;i++) {
    assert.equal(curves[i][0],'C');
    for (let j = 0;j <= 32;j++) {
      const p = bezier(previous,curves[i],j/32),q = point((i+j/32)/curves.length),dx = p[0]-q[0],dy = p[1]-q[1];
      maximum = Math.max(maximum,Math.hypot(transform[0]*dx+transform[2]*dy,transform[1]*dx+transform[3]*dy));
    }
    previous = curves[i].slice(-2);
  }
  return maximum;
}

test('SVG path supports empty data and strict ASCII whitespace',() => {
  assert.deepEqual(parse(''),[]);assert.deepEqual(parse(' \t\n\r'),[]);
  assert.deepEqual(parse(' M\t0\n0\rL1 2 '),[['M',0,0],['L',1,2]]);
  for (const d of ['\f','M0 0\u00a0','M0 0\u2003']) assert.throws(() => parse(d),code('INVALID_SVG'));
});
test('SVG numbers include leading dots/signs, adjacent signed/decimal values and exponents',() => {
  assert.deepEqual(parse('M.5-.25L1e2-2E-1 3.5.6 +4 +5'),[['M',.5,-.25],['L',100,-.2],['L',3.5,.6],['L',4,5]]);
  assert.deepEqual(parse('M-0 0e-9999').map(c => c.map(n => Object.is(n,-0) ? 0 : n)),[['M',0,0]]);
});
test('moveto implicit packs become lineto, relative pairs use the prior point, explicit moves start subpaths',() => {
  assert.deepEqual(parse('m1 2 3 4 5 6 m10 20 1 1'),[['M',1,2],['L',4,6],['L',9,12],['M',19,32],['L',20,33]]);
  assert.deepEqual(parse('M1,2,3,4L5,6,7,8'),[['M',1,2],['L',3,4],['L',5,6],['L',7,8]]);
});
test('H/V relative/absolute normalize to L and close restores the current point',() => {
  assert.deepEqual(parse('M10 20h5v6H3V4zl2 3z m4 5'),[['M',10,20],['L',15,20],['L',15,26],['L',3,26],['L',3,4],['Z'],['M',10,20],['L',12,23],['Z'],['M',14,25]]);
});
test('C/S reflect only compatible cubic controls, including repeated relative smooth packs',() => {
  assert.deepEqual(parse('M1 2c1 2 3 4 5 6s1 2 3 4 5 6 7 8'),[['M',1,2],['C',2,4,4,6,6,8],['C',8,10,7,10,9,12],['C',11,14,14,18,16,20]]);
  assert.deepEqual(parse('M0 0Q1 2 3 4S5 6 7 8L9 10S11 12 13 14').slice(-3),[['C',3,4,5,6,7,8],['L',9,10],['C',9,10,11,12,13,14]]);
});
test('Q/T reflect only compatible quadratic controls and reset after M, Z, C and A',() => {
  assert.deepEqual(parse('M1 2q1 2 3 4t5 6t7 8'),[['M',1,2],['Q',2,4,4,6],['Q',6,8,9,12],['Q',12,16,16,20]]);
  assert.deepEqual(parse('M0 0Q1 2 3 4Zt2 3'),[['M',0,0],['Q',1,2,3,4],['Z'],['M',0,0],['Q',0,0,2,3]]);
  assert.deepEqual(parse('M0 0Q1 2 3 4A1 1 0 0 0 3 4T5 6').at(-1),['Q',3,4,5,6]);
  assert.deepEqual(parse('M0 0C1 1 2 2 3 3T4 4').at(-1),['Q',3,3,4,4]);
});
test('post-close commands insert native-required M, repeated Z is harmless, all output validates natively',() => {
  const commands = parse('M0 0L20 0ZzS5 5 10 10Zt20 20zH30'),d = fixture(),e = d.layers[0].elements.find(e => e.type === 'path');
  e.commands = commands;d.layers[0].elements = [e];assert.doesNotThrow(() => validateDocument(d));
  assert.equal(commands.filter(c => c[0] === 'M').length,4);assert.equal(commands.filter(c => c[0] === 'Z').length,3);
});
test('arc flags are single tokens, including compact adjacent flags/coordinates',() => {
  assert.deepEqual(parse('M0 0A10 20 30 0110 20'),parse('M0 0A10 20 30 0 1 10 20'));
  assert.deepEqual(parse('M0 0A10 20 0 01.5.6'),parse('M0 0A10 20 0 0 1 .5 .6'));
  for (const d of ['M0 0A10 10 0 2 0 10 10','M0 0A10 10 0 -1 0 10 10','M0 0A10 10 0 0.0 10 10','M0 0A10 10 0 0 +1 10 10']) assert.throws(() => parse(d),code('INVALID_SVG'));
});
test('arc zero radii produce L, negative radii normalize, equal endpoints are no-op and reset smooth history',() => {
  assert.deepEqual(parse('M1 2a0 4 50 0 1 3 4'),[['M',1,2],['L',4,6]]);
  assert.deepEqual(parse('M0 0A-10 -20 0 0 1 10 10'),parse('M0 0A10 20 0 0 1 10 10'));
  assert.deepEqual(parse('M1 2A5 5 0 1 1 1 2'),[['M',1,2]]);
  assert.deepEqual(parse('M0 0C1 1 2 2 3 3A2 2 0 0 1 3 3S4 4 5 5').at(-1),['C',3,3,4,4,5,5]);
});
test('rotated elliptical arcs: every flag combination obeys transformed 0.1-world-unit error',() => {
  for (const rotation of [0,30,89,359]) for (const delta of [Math.PI/2,-Math.PI/2,Math.PI*1.5,-Math.PI*1.5]) for (const transform of [[1,0,0,1,0,0],[4,2,-3,1,500,-100],[-10000,0,0,1,0,0]]) {
    const startAngle = .4,start = ellipse(30,40,100,35,rotation,startAngle),end = ellipse(30,40,100,35,rotation,startAngle+delta);
    const d = `M${start.join(' ')}A100 35 ${rotation} ${Math.abs(delta)>Math.PI ? 1 : 0} ${delta>0 ? 1 : 0} ${end.join(' ')}`;
    const commands = parse(d,{transform}),error = arcError(commands,t => ellipse(30,40,100,35,rotation,startAngle+delta*t),transform);
    assert.ok(error <= .1,{rotation,delta,transform,error});assert.deepEqual(commands.at(-1).slice(-2),end);
  }
});
test('undersized radii are corrected before arc subdivision',() => {
  const commands = parse('M-50 0A1 2 0 0 1 50 0');
  assert.ok(arcError(commands,t => ellipse(0,0,50,100,0,Math.PI+t*Math.PI),[1,0,0,1,0,0]) <= .1);
});
test('near-diameter uncertainty at extreme world scale rejects explicitly rather than moving the center',() => {
  assert.throws(() => parse('M-1000 0A1000 1000 0 0 1 1000 0',{transform:[10000,0,0,10000,0,0]}),code('LIMIT_EXCEEDED'));
  assert.doesNotThrow(() => parse('M-1000 0A1000 1000 0 0 1 1000 0'));
});
test('tighter tolerances and larger transforms refine arc geometry instead of scaling stroke widths',() => {
  const d = 'M100 0A100 100 0 1 1 0 -100',base = parse(d),tight = parse(d,{tolerance:.0001}),scaled = parse(d,{transform:[100,0,0,100,0,0]});
  assert.ok(tight.length > base.length);assert.ok(scaled.length > base.length);assert.deepEqual(tight[0],base[0]);assert.deepEqual(scaled.at(-1).slice(-2),base.at(-1).slice(-2));
});
test('strict syntax rejects unknown commands, missing packs, units, bad separators and trailing garbage',() => {
  for (const d of ['L0 0','Z','M','M0','M,0 0','M0,,0','M0 0,','M0 0,L1 2','M0 0Z0','M0 0R1 2','M0 0L1px 2','M0 0L1e 2','M0 0L1e+ 2','M0 0L. 2','M0 0L+. 2','M0 0LNaN 2','M0 0LInfinity 2','M0 0L0x10 2','M0 0<svg>','M0 0C1 2 3 4 5','M0 0Q1 2 3','M0 0A10 20 0 0 1 10']) {
    assert.throws(() => parse(d),e => e.code === 'INVALID_SVG' && Number.isInteger(e.details.offset),d);
  }
});
test('input/token/number/output budgets fail explicitly, with no partial return or diagnostic source leakage',() => {
  for (const [d,options,expected] of [['M0 0',{maxInputLength:3},'svgPathLength'],['M0 0',{maxTokens:2},'svgTokens'],['M0 0L1 1',{maxCommands:1},'svgCommands'],[`M${'0'.repeat(129)} 0`,{},'svgNumberLength'],['M0 0A100 100 0 1 1 100 100',{maxCommands:2},'svgCommands']]) {
    assert.throws(() => parse(d,options),e => e.code === 'LIMIT_EXCEEDED' && e.details.limit === expected && !JSON.stringify(e.details).includes(d));
  }
  assert.equal(parse('M0 0',{maxCommands:1,maxTokens:3,maxInputLength:4}).length,1);
});
test('coordinate arithmetic and numerically unsafe magnitudes fail rather than emit nonfinite or inaccurate geometry',() => {
  for (const d of ['M1e309 0','M1e-400 0','M10000001 0','M10000000 0h1','M0 0A1e308 1e308 0 0 1 1 1','M0 0A1e-320 1 0 0 1 1 1']) assert.throws(() => parse(d),code('LIMIT_EXCEEDED'),d);
  assert.deepEqual(parse('M10000000 -10000000'),[['M',10000000,-10000000]]);
});
test('normalizer options are downward, finite, native-scale bounded and do not mutate caller data',() => {
  for (const options of [null,[],{other:1},{maxCommands:0},{maxTokens:1e8},{maxInputLength:1e8},{tolerance:0},{tolerance:.2},{transform:[1,0,0,1]},{transform:[0,0,0,1,0,0]},{transform:[10001,0,0,1,0,0]},{transform:[1,0,0,1,Infinity,0]}]) assert.throws(() => parse('',options),code('INVALID_ARGUMENT'));
  const options = {transform:[2,1,0,1,0,0]},copy = structuredClone(options);parse('M0 0A10 20 0 0 1 10 10',options);assert.deepEqual(options,copy);
});
