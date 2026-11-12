import {fail} from './errors.js';

const MAX_PAPER_LINES = 50_000;

export const PAPER_STYLES = Object.freeze({
  dots:Object.freeze({name:'Dot grid',color:'#FFFFFF',line:'#B8C5D6',dots:true}),
  graph:Object.freeze({name:'Graph paper',color:'#FFFFFF',line:'#D5DFED'}),
  ruled:Object.freeze({name:'Ruled paper',color:'#FFFFFF',line:'#B8CDE6'}),
  engineering:Object.freeze({name:'Engineering paper',color:'#F1F7E9',line:'#CFDEC5',major:'#9EB895'}),
});

/** Whitelisted native data; public setters additionally reject unknown option keys. */
export function normalizeBackground(value,code='INVALID_DOCUMENT',strict=false) {
  if (value === null) return null;
  if (typeof value === 'string' && /^#[\da-f]{6}$/i.test(value)) return value.toUpperCase();
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || ![Object.prototype,null].includes(Object.getPrototypeOf(value))
    || typeof value.type !== 'string' || !Object.hasOwn(PAPER_STYLES,value.type) || !Number.isInteger(value.spacing) || value.spacing < 8 || value.spacing > 128
    || (strict && Object.keys(value).some(key => !['type','spacing'].includes(key)))) {
    fail(code,'Background requires null, opaque #RRGGBB, or paper {type:dots|graph|ruled|engineering, spacing:integer 8–128}',{path:'background'});
  }
  return {type:value.type,spacing:value.spacing};
}

export function describeBackground(value) {
  return value === null ? 'transparent' : typeof value === 'string' ? value : `${PAPER_STYLES[value.type].name} (${value.spacing} world units)`;
}

/** Shared world-space colors, spacing and line widths for Canvas, previews and SVG. */
export function paperGrid(paper) {
  const style = PAPER_STYLES[paper.type];
  const groups = [{color:style.line,width:0.5,spacing:paper.spacing,vertical:paper.type !== 'ruled'}];
  if (style.major) groups.push({color:style.major,width:1,spacing:paper.spacing*5,vertical:true});
  return {color:style.color,size:paper.spacing*(style.major ? 5 : 1),groups,dots:Boolean(style.dots)};
}

/** Screen-space plans avoid incrementing huge world coordinates or allocating tiles.
 * Reject pathological PNG crops before enumerating grid lines. Normal supported
 * viewport dimensions/zoom and minimum spacing stay below this work ceiling.
 */
export function paperBands(paper,{width,height,scale,pan}) {
  const grid = paperGrid(paper),bands = [];let work = 0;
  for (const group of grid.groups) {
    const step = group.spacing*scale,lineWidth = group.width*scale;
    if (!Number.isFinite(step) || step <= 0) fail('LIMIT_EXCEEDED','Paper scale exceeds numeric limits',{limit:'paperLines',maximum:MAX_PAPER_LINES});
    for (const axis of group.vertical ? [0,1] : [1]) {
      const count = Math.ceil((axis === 0 ? width : height)/step)+2;
      work += count;
      if (work > MAX_PAPER_LINES) fail('LIMIT_EXCEEDED','Paper grid is too dense for this output; reduce crop size or increase spacing',{limit:'paperLines',maximum:MAX_PAPER_LINES});
      bands.push({axis,count,step,lineWidth,color:group.color,start:((pan[axis]%step)+step)%step-step});
    }
  }
  if (grid.dots) {
    const count = bands[0].count*bands[1].count;
    if (count > MAX_PAPER_LINES) fail('LIMIT_EXCEEDED','Dot grid is too dense for this output; reduce crop size or increase spacing',{limit:'paperLines',maximum:MAX_PAPER_LINES});
  }
  return {color:grid.color,bands,dots:grid.dots};
}
