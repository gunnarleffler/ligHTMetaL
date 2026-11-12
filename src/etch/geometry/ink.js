import { fail } from '../errors.js';
import { apply } from './matrix.js';
import { flattenBezier } from './curves.js';
import { visitStrokeOutline } from './stroke.js';
import { area, positiveConvex } from './convex.js';

export const INK_FLATNESS = 0.02; // CSS px; only intersected curved primitives are polygonized.
export const MAX_INK_PARTS = 20_000;
export function partControls(commands) {
  const points = [];
  for (const command of commands) for (let i = 1;i < command.length;i += 2) points.push([command[i],command[i+1]]);
  return points;
}
export function outlineParts(element,budget) {
  const parts = [];let part;
  const push = commands => {
    if (parts.length >= MAX_INK_PARTS) fail('LIMIT_EXCEEDED','Too many ink primitives; gesture cancelled',{limit:'inkParts',maximum:MAX_INK_PARTS});
    parts.push(commands);
  };
  if (element.type === 'ink') {for (const p of element.parts) {budget.step(p.length);push(p);}return parts;}
  visitStrokeOutline(element,command => {
    budget.step();
    if (command.slice(1).some(n => !Number.isFinite(n) || Math.abs(n) > 10_000_000)) fail('LIMIT_EXCEEDED','Ink outline exceeds native coordinate range; gesture cancelled',{limit:'inkCoordinates',maximum:10_000_000});
    if (command[0] === 'M') part = [];part.push(command);if (command[0] === 'Z') push(part);
  });
  return parts;
}
/** Carry screen AND local coordinates through subdivision and subsequent clipping. */
export function flattenPart(commands,matrix,budget,onVertices) {
  const out = [];let current;
  const vertex = p => [...apply(matrix,p),...p];
  const append = p => {onVertices(1);out.push(p);};
  for (const [op,...n] of commands) {
    budget.step();
    if (op === 'M') {current = vertex(n);append(current);}
    else if (op === 'L') {current = vertex(n);append(current);}
    else if (op === 'Q' || op === 'C') {
      const control = [current];for (let i = 0;i < n.length;i += 2) control.push(vertex(n.slice(i,i+2)));
      let first = true;
      for (const p of flattenBezier(control,{tolerance:Infinity,maxSegments:budget.maxSegmentsPerElement,accept:points => {
        budget.step();const a = points[0],b = points.at(-1);
        return points.slice(1,-1).every((p,i) => {const t = (i+1)/(points.length-1);return Math.hypot(p[0]-((1-t)*a[0]+t*b[0]),p[1]-((1-t)*a[1]+t*b[1])) <= INK_FLATNESS;});
      }})) {if (!first) append(p);first = false;}
      current = control.at(-1);
    }
  }
  if (out.length > 1 && out[0][0] === out.at(-1)[0] && out[0][1] === out.at(-1)[1]) out.pop();
  return out;
}
export function polygonCommands(polygon) {
  const points = polygon.map(p => p.slice(2));if (area(points) < 0) points.reverse();
  if (!positiveConvex(points)) fail('LIMIT_EXCEEDED','Ink cannot be split at this coordinate precision',{limit:'inkPrecision'});
  return [...points.map((p,i) => [i ? 'L' : 'M',...p]),['Z']];
}
