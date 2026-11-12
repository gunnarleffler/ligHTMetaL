import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IDENTITY, apply, multiply, translate, scale, inverse, singularValues, transformBounds, screenToWorld, worldToScreen } from '../../../src/etch/geometry/matrix.js';
import { pathBounds, localPaintedBounds, elementBounds, documentBounds } from '../../../src/etch/geometry/paths.js';
import { freezeDocument } from '../../../src/etch/document.js';
import { fixture } from './helpers.js';
const near = (actual, expected) => assert.ok(Math.abs(actual-expected) < 1e-8, `${actual} != ${expected}`);

test('affine composition, inversion, skew, reflections, and translations', () => {
  const e = [2,0.5,0.3,-3,20,-10], p = [-30,15];
  const world = multiply(translate(10,-5), e);
  assert.deepEqual(apply(world, p), apply(translate(10,-5), apply(e, p)));
  apply(inverse(world), apply(world,p)).forEach((n, i) => near(n, p[i]));
  multiply(inverse(e), e).forEach((n, i) => near(n, IDENTITY[i]));
  assert.throws(() => inverse([1,2,2,4,0,0]), RangeError);
});
test('stable singular values handle anisotropy at the supported limits', () => {
  const values = singularValues(scale(0.0001,10_000));
  near(values[0], 0.0001); near(values[1], 10_000);
  assert.deepEqual(singularValues([1,2,2,4,0,0]), [0,5]);
});
test('viewport conversion never mixes DPR into CSS coordinate space', () => {
  const view = { zoom: 0.25, pan: [500,300] }, point = [-50,100];
  assert.deepEqual(screenToWorld(worldToScreen(point, view), view), point);
});
test('Bezier bounds use extrema, not just endpoints or control points', () => {
  assert.deepEqual(pathBounds([['M',0,0],['Q',50,100,100,0]]), { x: 0, y: 0, width: 100, height: 50 });
  assert.deepEqual(pathBounds([['M',0,0],['C',0,100,100,100,100,0],['Z']]), { x: 0, y: 0, width: 100, height: 75 });
  assert.equal(pathBounds([['M',50,50]]), null);
  assert.equal(pathBounds([['M',50,50],['Z']]), null);
});
test('painted bounds include square caps, miter expansion, layer offsets and affine transforms', () => {
  const d = fixture(), path = d.layers[0].elements[4];
  const b = elementBounds(path, [10,-20]);
  assert.ok(b.x <= 30 && b.y <= -30 && b.x+b.width >= 60);
  assert.deepEqual(transformBounds([1,0.5,2,1,10,20], { x: 0, y: 0, width: 10, height: 5 }), { x: 10, y: 20, width: 20, height: 10 });
  const line = { ...d.layers[0].elements[1], start: [0,0], end: [1,1], lineCap: 'square', strokeWidth: 2 };
  near(elementBounds(line).width, 1+2*Math.SQRT2);
});
test('stroke dots have bounds; hidden layers are excluded from fit bounds', () => {
  const d = fixture(); d.layers[0].visible = false;
  assert.equal(documentBounds(d), null);
  assert.ok(documentBounds(d, { visibleOnly: false }));
  const stroke = { ...d.layers[0].elements[0], points: [[10,20,0.5]] };
  assert.deepEqual(elementBounds(stroke), { x: 8.5, y: 18.5, width: 3, height: 3 });
});

test('immutable bounds reuse avoids sample walks, returns detached results and applies fresh transforms/offsets', () => {
  let reads = 0;
  const points = new Proxy(Object.freeze([Object.freeze([10,20,1]),Object.freeze([30,40,1])]),{
    get(target,key,receiver) {if (key === Symbol.iterator) reads++;return Reflect.get(target,key,receiver);},
  });
  const stroke = freezeDocument({...fixture().layers[0].elements[0],points});
  const local = localPaintedBounds(stroke);assert.ok(reads > 0);reads = 0;
  local.x = -999;
  assert.deepEqual(localPaintedBounds(stroke),{x:8.5,y:18.5,width:23,height:23});assert.equal(reads,0);
  const a = elementBounds(stroke),b = elementBounds(stroke,[50,-20]);
  assert.deepEqual(b,{...a,x:a.x+50,y:a.y-20});assert.equal(reads,0);
  const moved = freezeDocument({...stroke,transform:[2,0,0,3,7,-9]});
  assert.deepEqual(elementBounds(moved),transformBounds(moved.transform,localPaintedBounds(stroke)));
});

test('mutable, shallow-frozen and accessor geometry always gets fresh bounds', () => {
  const base = fixture().layers[0].elements[0];
  for (const shallow of [false,true]) {
    const stroke = {...base,points:[[10,20,1]]};if (shallow) Object.freeze(stroke);
    const before = elementBounds(stroke);stroke.points[0][0] += 100;
    assert.equal(elementBounds(stroke).x,before.x+100);
  }
  let width = 3;
  const accessor = Object.freeze({...base,points:Object.freeze([Object.freeze([10,20,1])]),get width() {return width;}});
  assert.equal(localPaintedBounds(accessor).width,3);width = 20;assert.equal(localPaintedBounds(accessor).width,20);
  const path = Object.freeze({...fixture().layers[0].elements[4],commands:[['M',0,0],['L',10,10]]});
  const before = elementBounds(path);path.commands[1][1] = 20;
  assert.ok(elementBounds(path).width > before.width);
});

test('document bounds distinguish visibility and changed content without exposing cached values', () => {
  const d = freezeDocument(fixture()),visible = documentBounds(d),all = documentBounds(d,{visibleOnly:false});
  visible.x = -1e9;all.width = -1;
  assert.notEqual(documentBounds(d).x,visible.x);assert.notEqual(documentBounds(d,{visibleOnly:false}).width,all.width);
  const hidden = freezeDocument({...d,layers:d.layers.map(l => ({...l,visible:false}))});
  assert.equal(documentBounds(hidden),null);
  assert.deepEqual(documentBounds(hidden,{visibleOnly:false}),documentBounds(d,{visibleOnly:false}));
  const shifted = freezeDocument({...d,layers:d.layers.map(l => ({...l,offset:[l.offset[0]+100,l.offset[1]-40]}))});
  const b = documentBounds(d),expected = {...b,x:b.x+100,y:b.y-40},actual = documentBounds(shifted);
  for (const key of Object.keys(expected)) near(actual[key],expected[key]);
  const mutable = fixture(),first = documentBounds(mutable);
  mutable.layers[0].offset[0] += 10;assert.equal(documentBounds(mutable).x,first.x+10);
  let walks = 0;
  const layers = new Proxy(Object.freeze([...d.layers]),{
    get(target,key,receiver) {if (key === Symbol.iterator) walks++;return Reflect.get(target,key,receiver);},
  });
  const observed = freezeDocument({...d,layers});
  documentBounds(observed);assert.equal(walks,1);walks = 0;
  documentBounds(observed);assert.equal(walks,0);
  documentBounds(observed,{visibleOnly:false});assert.equal(walks,1);
});
