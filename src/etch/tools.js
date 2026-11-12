import { fail } from './errors.js';

export const SHAPE_TOOLS = Object.freeze(['line','arrow','rect','ellipse']);
export const isShapeTool = tool => SHAPE_TOOLS.includes(tool);
export const isLineTool = tool => tool === 'line' || tool === 'arrow';
const color = value => typeof value === 'string' && /^#[\da-f]{6}$/i.test(value);
const width = value => typeof value === 'number' && Number.isFinite(value) && value >= 0.5 && value <= 64;

/** Per-editor session preferences, never document/layer/history state. */
export class ToolSession {
  #tool;
  #shapeTool = 'rect';
  #settings = {
    hand:{},select:{},'move-layer':{},eraser:{radius:10,mode:'partial'},pen:{color:'#24292F',width:3,pressure:true},highlighter:{color:'#FDE047',width:20,opacity:0.35},line:{stroke:'#24292F',strokeWidth:2},
    arrow:{stroke:'#24292F',strokeWidth:2},rect:{stroke:'#24292F',strokeWidth:2,fill:null},ellipse:{stroke:'#24292F',strokeWidth:2,fill:null},
  };
  #drawWithTouch;
  constructor({readOnly = false,drawWithTouch = true,onChange = () => {}} = {}) {
    this.#tool = readOnly ? 'hand' : 'pen'; this.#drawWithTouch = drawWithTouch; this.onChange = onChange;
  }
  getTool() { return this.#tool; }
  getShapeTool() { return this.#shapeTool; }
  setTool(tool) {
    this.getSettings(tool);
    if (tool === this.#tool) return;
    this.#tool = tool;
    if (isShapeTool(tool)) this.#shapeTool = tool;
    this.onChange();
  }
  getSettings(tool) {
    if (typeof tool !== 'string' || !Object.hasOwn(this.#settings,tool)) fail('INVALID_ARGUMENT','Unknown or unimplemented tool');
    return {...this.#settings[tool]};
  }
  setSettings(tool,patch) {
    const current = this.getSettings(tool);
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)
      || Object.keys(patch).some(key => !Object.hasOwn(current,key))) fail('INVALID_ARGUMENT','Unsupported tool settings');
    const next = {...current,...patch};
    if (tool === 'pen' && (!color(next.color) || !width(next.width) || typeof next.pressure !== 'boolean')) {
      fail('INVALID_ARGUMENT','Pen requires an opaque #RRGGBB color, width in [0.5, 64] and boolean pressure');
    }
    if (tool === 'highlighter' && (!color(next.color) || !width(next.width) || !Number.isFinite(next.opacity) || next.opacity < 0.05 || next.opacity > 1)) {
      fail('INVALID_ARGUMENT','Highlighter requires an opaque #RRGGBB color, width in [0.5, 64] and opacity in [0.05, 1]');
    }
    if (tool === 'eraser' && (typeof next.radius !== 'number' || !Number.isFinite(next.radius) || next.radius < 1 || next.radius > 128 || !['object','partial'].includes(next.mode))) {
      fail('INVALID_ARGUMENT','Eraser requires radius in [1, 128] CSS pixels and mode object or partial');
    }
    if (isShapeTool(tool) && (!width(next.strokeWidth)
      || !(color(next.stroke) || (!isLineTool(tool) && next.stroke === null))
      || (!isLineTool(tool) && !(color(next.fill) || next.fill === null))
      || (next.stroke === null && next.fill === null))) {
      fail('INVALID_ARGUMENT','Shapes require opaque paints, width in [0.5, 64], and at least one paint; lines require a border');
    }
    for (const key of ['color','stroke','fill']) if (typeof next[key] === 'string') next[key] = next[key].toUpperCase();
    if (Object.keys(next).every(key => next[key] === current[key])) return;
    this.#settings[tool] = next; this.onChange();
  }
  getDrawWithTouch() { return this.#drawWithTouch; }
  setDrawWithTouch(value) {
    if (typeof value !== 'boolean') fail('INVALID_ARGUMENT','Draw with finger must be boolean');
    if (value === this.#drawWithTouch) return;
    this.#drawWithTouch = value; this.onChange();
  }
}
