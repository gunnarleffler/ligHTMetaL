import {test} from 'node:test';
import assert from 'node:assert/strict';
import {flattenBezier} from '../../../src/etch/geometry/curves.js';
import {strokeSegments,strokeOutline,visitStrokeOutline} from '../../../src/etch/geometry/stroke.js';
import {Viewport} from '../../../src/etch/viewport.js';
import {pathBounds,traceElementPath} from '../../../src/etch/geometry/paths.js';
import {code} from './helpers.js';
const near = (a,b) => assert.ok(Math.abs(a-b) < 1e-8,`${a} != ${b}`);
const stroke = (points,extra = {}) => ({type:'stroke',points,width:10,pressure:true,...extra});

test('midpoint smoothing interpolates geometry and pressure without altering input', () => {
  const points = [[0,0,0],[10,20,0.5],[30,10,1]], original = structuredClone(points);
  assert.deepEqual([...strokeSegments(points)],[[points[0],[5,10,0.25]],[[5,10,0.25],points[1],[20,15,0.75]],[[20,15,0.75],points[2]]]);
  assert.deepEqual(points,original);
  assert.deepEqual([...strokeSegments(points.slice(0,2))],[[points[0],points[1]]]);
});
test('flattening preserves endpoints and bounds spatial/radius steps, with finite work', () => {
  const points = [[0,0,1],[10,100,3],[100,0,5]];
  const result = [...flattenBezier(points,{maxStep:2})];
  assert.deepEqual(result[0],points[0]); assert.deepEqual(result.at(-1),points.at(-1));
  for (let i = 1; i < result.length; i++) assert.ok(Math.hypot(result[i][0]-result[i-1][0],result[i][1]-result[i-1][1]) <= 2);
  assert.throws(() => [...flattenBezier([[0,0],[1e6,1e6]],{maxStep:0.001,maxSegments:50})],code('LIMIT_EXCEEDED'));
});
test('stroke dots, constant pressure and duplicate points produce deterministic filled outlines', () => {
  const dot = strokeOutline(stroke([[10,20,0.5]]));
  const b = pathBounds(dot);
  near(b.x,7); near(b.y,17); near(b.width,6); near(b.height,6);
  assert.deepEqual(strokeOutline(stroke([[10,20,0.5],[10,20,0.5]])),dot);
  const uniform = strokeOutline(stroke([[10,20,0]],{pressure:false}));
  near(pathBounds(uniform).width,10);
  assert.deepEqual(strokeOutline(stroke([[10,20,0.5]])),dot);
});
test('pressure changes, sharp reversals and repeated locations retain round coverage', () => {
  const s = stroke([[0,0,0],[20,0,1],[0,0,1],[0,0,0.1]]), commands = strokeOutline(s);
  assert.ok(commands.length > 20);
  assert.ok(commands.every(c => ['M','L','C','Z'].includes(c[0]) && c.slice(1).every(Number.isFinite)));
  const bounds = pathBounds(commands);
  // Midpoint smoothing need not pass through the raw control sample at [0,0,1].
  assert.ok(bounds.x < -3 && bounds.x+bounds.width >= 18); near(bounds.height,10);
  assert.equal(visitStrokeOutline(s),commands.length);
  assert.throws(() => strokeOutline(s,{maxSegments:20}),code('LIMIT_EXCEEDED'));
});
test('generated subpaths use the same winding, and native ellipse tracing stays analytic', () => {
  const commands = strokeOutline(stroke([[0,0,0.5],[30,0,1]]));
  for (let i = 0; i < commands.length; i++) if (commands[i][0] === 'M' && commands[i+1]?.[0] === 'L') {
    const p = commands.slice(i,i+4).map(c => c.slice(1));
    let area = 0;
    for (let j = 0; j < 4; j++) area += p[j][0]*p[(j+1)%4][1]-p[(j+1)%4][0]*p[j][1];
    assert.ok(area > 0);
  }
  let call;
  traceElementPath({ellipse:(...args) => {call=args;}},{type:'ellipse',cx:2,cy:3,rx:4,ry:5});
  assert.deepEqual(call,[2,3,4,5,0,0,2*Math.PI]);
});
test('viewport resize and 100% preserve world center; zero-size intervals do not lose it', () => {
  const v = new Viewport(); v.resize(800,400);
  assert.deepEqual(v.get(),{zoom:1,pan:[400,200],expanded:false});
  v.set({zoom:2,pan:[100,120]});
  const center = [(400-100)/2,(200-120)/2];
  v.resize(600,300); v.resize(0,0); v.resize(1000,500);
  near((500-v.get().pan[0])/v.get().zoom,center[0]); near((250-v.get().pan[1])/v.get().zoom,center[1]);
  v.zoomAt(1); near(500-v.get().pan[0],center[0]); near(250-v.get().pan[1],center[1]);
});
test('zoom anchors, fit padding/clamps, no-ops and detached view snapshots', () => {
  let changes = 0; const v = new Viewport(() => changes++); v.resize(800,400);
  const before = v.get(), anchor = [100,80]; v.zoomAt(4,anchor);
  near((anchor[0]-v.get().pan[0])/4,anchor[0]-before.pan[0]);
  near((anchor[1]-v.get().pan[1])/4,anchor[1]-before.pan[1]);
  v.fit({x:-100,y:-50,width:200,height:100}); near(v.get().zoom,3.52);
  v.fit(null); assert.deepEqual(v.get(),before);
  const count = changes; v.set({zoom:1,pan:[400,200]}); assert.equal(changes,count);
  const copy = v.get(); copy.pan[0] = 999; assert.equal(v.get().pan[0],400);
  v.setExpanded(true);assert.deepEqual(v.get(),{...before,expanded:true});assert.equal(changes,count+1);
  v.setExpanded(true);assert.equal(changes,count+1);
  v.setExpanded(false);assert.deepEqual(v.get(),before);assert.equal(changes,count+2);
  for (const value of [{zoom:0},{zoom:9},{pan:[NaN,0]},{pan:[0]},{expanded:true}]) assert.throws(() => v.set(value),code('INVALID_ARGUMENT'));
});
