import { createId } from '../document.js';
import { fail } from '../errors.js';
import { screenToWorld } from '../geometry/matrix.js';
import { isShapeTool, isLineTool } from '../tools.js';

/** Endpoint geometry only. Coordinates/settings/view are captured independently of DPR. */
export class ShapeInput {
  #start = null;
  #end = null;
  #screen = null;
  #constrained = false;
  constructor({tool,view,offset,settings}) {
    if (!isShapeTool(tool)) fail('INVALID_ARGUMENT','Expected line, arrow, rectangle or ellipse tool');
    this.tool = tool;this.view = view;this.offset = offset;this.settings = {...settings};this.id = createId();
  }
  get lastScreen() { return this.#screen && [...this.#screen]; }
  setConstrained(value) { this.#constrained = Boolean(value); }
  add(event,screen) {
    if (!screen.every(Number.isFinite)) fail('INVALID_ARGUMENT','Pointer coordinates must be finite');
    const point = screenToWorld(screen,this.view).map((n,i) => n-this.offset[i]);
    if (point.some(n => !Number.isFinite(n) || Math.abs(n) > 10_000_000)) fail('INVALID_ARGUMENT','Pointer exceeds supported world coordinates');
    this.#screen = [...screen];this.#start ??= point;this.#end = point;this.setConstrained(event.shiftKey);
  }
  element() {
    if (!this.#start) return null;
    const [sx,sy] = this.#start;
    let dx = this.#end[0]-sx,dy = this.#end[1]-sy;
    if (this.#constrained) {
      if (isLineTool(this.tool)) {
        const length = Math.hypot(dx,dy),angle = Math.round(Math.atan2(dy,dx)/(Math.PI/4))*Math.PI/4;
        dx = Math.cos(angle)*length;dy = Math.sin(angle)*length;
      } else {
        const side = Math.max(Math.abs(dx),Math.abs(dy));
        dx = (Math.sign(dx) || 1)*side;dy = (Math.sign(dy) || 1)*side;
      }
    }
    // A line needs length; boxes need meaningful extent in BOTH axes. No tap marks.
    if (isLineTool(this.tool) ? Math.hypot(dx,dy)*this.view.zoom < 2
      : Math.min(Math.abs(dx),Math.abs(dy))*this.view.zoom < 2) return null;
    const {stroke,strokeWidth,fill} = this.settings;
    const e = {id:this.id,type:this.tool,transform:[1,0,0,1,0,0],stroke,strokeWidth:stroke ? strokeWidth : 0};
    if (this.tool === 'line') return {...e,start:[sx,sy],end:[sx+dx,sy+dy],lineCap:'round'};
    if (this.tool === 'arrow') {
      // One ordinary stroked path, not a new native type or SVG marker. The
      // open head scales with width but never extends behind the start of a short arrow.
      const length = Math.hypot(dx,dy),ux = dx/length,uy = dy/length;
      const head = Math.min(length,Math.max(12,4*strokeWidth)),half = head/2;
      const ex = sx+dx,ey = sy+dy,bx = ex-head*ux,by = ey-head*uy;
      return {...e,type:'path',fill:null,fillRule:'nonzero',lineCap:'round',lineJoin:'round',miterLimit:4,
        commands:[['M',sx,sy],['L',ex,ey],['M',bx-half*uy,by+half*ux],['L',ex,ey],['L',bx+half*uy,by-half*ux]]};
    }
    const x = Math.min(sx,sx+dx),y = Math.min(sy,sy+dy),width = Math.abs(dx),height = Math.abs(dy);
    if (this.tool === 'rect') return {...e,x,y,width,height,fill,lineJoin:'round',miterLimit:4};
    return {...e,cx:x+width/2,cy:y+height/2,rx:width/2,ry:height/2,fill};
  }
}
