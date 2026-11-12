import {test} from 'node:test';
import assert from 'node:assert/strict';
import {straightPaintedBounds as bounds} from '../../../src/etch/import/svg-straight-bounds.js';
const element = (commands,extra={}) => ({type:'path',commands,transform:[1,0,0,1,0,0],fill:null,stroke:'#000000',strokeWidth:2,lineCap:'butt',lineJoin:'miter',miterLimit:4,...extra});
const near = (a,b) => {for (const key of ['x','y','width','height']) assert.ok(Math.abs(a[key]-b[key]) < 1e-10,`${JSON.stringify(a)} != ${JSON.stringify(b)}`);};
test('straight border paths use actual local miters rather than global miter-limit padding',() => {
  near(bounds(element([['M',1,1],['L',199,1],['L',199,99],['L',1,99],['Z']])),{x:0,y:0,width:200,height:100});
});
test('open butt/round/square caps and reflected/sheared support are explicit',() => {
  const commands = [['M',0,50],['L',200,50]];near(bounds(element(commands,{strokeWidth:10})),{x:0,y:45,width:200,height:10});
  for (const cap of ['round','square']) near(bounds(element(commands,{strokeWidth:10,lineCap:cap})),{x:-5,y:45,width:210,height:10});
  near(bounds(element(commands,{strokeWidth:10,transform:[-1,0,.5,1,300,0]})),{x:122.5,y:45,width:205,height:10});
});
test('miter, bevel and round join supports differ at the actual vertex',() => {
  const commands = [['M',10,50],['L',50,10],['L',90,50]];
  const miter = bounds(element(commands,{strokeWidth:10})),bevel = bounds(element(commands,{strokeWidth:10,miterLimit:1})),round = bounds(element(commands,{strokeWidth:10,lineJoin:'round'}));
  assert.ok(Math.abs(miter.y-(10-5*Math.SQRT2)) < 1e-10);assert.ok(Math.abs(bevel.y-(10-5/Math.SQRT2)) < 1e-10);assert.equal(round.y,5);
});
test('isolated moves do not create paint, round point strokes do, and curves defer to conservative generic bounds',() => {
  assert.equal(bounds(element([['M',100,100]])),null);near(bounds(element([['M',50,50],['L',50,50]],{lineCap:'round',strokeWidth:10})),{x:45,y:45,width:10,height:10});
  assert.equal(bounds(element([['M',0,0],['Q',20,20,40,0]])),undefined);
});
test('nearly reversing high-miter joins stay conservative and bounded by the configured miter limit',() => {
  const commands = [['M',0,0],['L',10,0],['L',0,1e-12]],low = bounds(element(commands)),high = bounds(element(commands,{miterLimit:1000000}));
  assert.ok(Object.values(low).every(Number.isFinite));assert.ok(high.width >= low.width);assert.ok(high.height >= low.height);
});
