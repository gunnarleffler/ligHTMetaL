import { fail } from '../errors.js';
import { createId } from '../document.js';
import { apply, multiply, scale, translate } from './matrix.js';
import { elementBounds } from './paths.js';
import { HitBudget, HIT_ERROR } from './hit-test.js';
import { LineCutTester } from './line-cut.js';
import { capsule, components, intersects, overlaps, polygonBounds, subtract } from './convex.js';
import { flattenPart, MAX_INK_PARTS, outlineParts, partControls, polygonCommands } from './ink.js';

/** Subtract convex swept capsules from the actual pressure outline, never samples. */
export class InkCutTester {
  constructor(layer,zoom,{budget=new HitBudget(),maxPieces=20_000}={}) {
    Object.assign(this,{layer,zoom,budget,maxPieces,allocated:0});
    this.entries = [...layer.elements].reverse().filter(e => ['stroke','ink'].includes(e.type)).map(element => ({element,bounds:elementBounds(element,layer.offset),parts:null,vertices:0,dirty:false,groups:null,ids:[element.id]}));
  }
  vertices(entry,n) {this.budget.vertices(n,this.budget.segments-entry.vertices);entry.vertices += n;}
  build(entry) {
    const matrix = multiply(scale(this.zoom),multiply(translate(...this.layer.offset),entry.element.transform));entry.matrix = matrix;
    entry.parts = outlineParts(entry.element,this.budget).map(commands => {
      const controls = partControls(commands);this.vertices(entry,controls.length);
      return {commands,bounds:polygonBounds(controls.map(p => apply(matrix,p))),polygon:null};
    });
  }
  polygon(entry,part) {return part.polygon ??= flattenPart(part.commands,entry.matrix,this.budget,n => this.vertices(entry,n));}
  sweep(a,b,radius) {
    const r = radius+HIT_ERROR,z = this.zoom,screenBox = {x:Math.min(a[0],b[0])-r-0.02,y:Math.min(a[1],b[1])-r-0.02,width:Math.abs(a[0]-b[0])+2*(r+0.02),height:Math.abs(a[1]-b[1])+2*(r+0.02)};
    const worldBox = {x:screenBox.x/z,y:screenBox.y/z,width:screenBox.width/z,height:screenBox.height/z},changed = [];let cutter;
    for (const entry of this.entries) {
      this.budget.step();if (!entry.bounds || !overlaps(entry.bounds,worldBox) || entry.parts?.length === 0) continue;
      if (!entry.parts) this.build(entry);
      const next = [];let hit = false;
      for (const part of entry.parts) {
        this.budget.step();
        if (!overlaps(part.bounds,screenBox)) {next.push(part);continue;}
        cutter ??= capsule(a,b,r,this.budget);
        const polygon = this.polygon(entry,part);
        const epsilon = Math.max(1e-8,32*Number.EPSILON*Math.max(1,Math.abs(part.bounds.x),Math.abs(part.bounds.y)));
        if (!intersects(polygon,cutter,this.budget,-epsilon)) {next.push(part);continue;}
        hit = true;
        const pieces = subtract(polygon,cutter,this.budget,n => this.vertices(entry,n));
        for (const polygon of pieces) next.push({polygon,commands:polygonCommands(polygon),bounds:polygonBounds(polygon)});
        if (next.length > MAX_INK_PARTS) fail('LIMIT_EXCEEDED','Too many ink primitives; gesture cancelled',{limit:'inkParts',maximum:MAX_INK_PARTS});
      }
      if (next.length > MAX_INK_PARTS) fail('LIMIT_EXCEEDED','Too many ink primitives; gesture cancelled',{limit:'inkParts',maximum:MAX_INK_PARTS});
      if (hit) {entry.parts = next;entry.dirty = true;entry.groups = null;changed.push(entry.element.id);}
    }
    return changed;
  }
  changes() {
    const changes = [];let count = 0;
    for (const entry of this.entries) {
      this.budget.step();if (!entry.dirty) continue;
      if (!entry.groups) {
        for (const part of entry.parts) this.polygon(entry,part);
        entry.groups = components(entry.parts,this.budget);
      }
      count += entry.groups.length;
      if (count > this.maxPieces) fail('LIMIT_EXCEEDED','Too many partial eraser pieces; gesture cancelled',{limit:'eraserPieces',maximum:this.maxPieces});
      while (entry.ids.length < entry.groups.length) {
        if (++this.allocated > this.maxPieces) fail('LIMIT_EXCEEDED','Partial eraser identity limit exceeded; gesture cancelled',{limit:'eraserPieces',maximum:this.maxPieces});
        entry.ids.push(createId());
      }
      changes.push({id:entry.element.id,groups:entry.groups.map(group => group.map(commands => commands.map(c => [...c]))),ids:entry.ids.slice(0,entry.groups.length)});
    }
    return changes;
  }
}

/** Line and freehand cutting share ALL gesture budgets, rather than doubling them. */
export class PartialCutTester {
  constructor(layer,zoom,{budget=new HitBudget(),maxPieces=20_000}={}) {
    this.budget = budget;this.maxPieces = maxPieces;
    this.lines = new LineCutTester(layer,zoom,{budget,maxPieces});this.ink = new InkCutTester(layer,zoom,{budget,maxPieces});
  }
  sweep(a,b,radius) {return [...this.lines.sweep(a,b,radius),...this.ink.sweep(a,b,radius)];}
  changes() {
    const changes = [...this.lines.changes(),...this.ink.changes()];
    const count = changes.reduce((n,c) => n+c.ids.length,0);
    if (count > this.maxPieces || this.lines.allocated+this.ink.allocated > this.maxPieces) fail('LIMIT_EXCEEDED','Too many partial eraser pieces; gesture cancelled',{limit:'eraserPieces',maximum:this.maxPieces});
    return changes;
  }
}
