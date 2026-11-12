import {fail} from '../errors.js';
import {IDENTITY,singularValues} from '../geometry/matrix.js';

const MAX_INPUT = 5*1024*1024,MAX_COMMANDS = 100_000,MAX_TOKENS = 1_000_000;
const WORLD = 10_000_000,TAU = 2*Math.PI;
const whitespace = c => c === ' ' || c === '\t' || c === '\r' || c === '\n';
const digit = c => c >= '0' && c <= '9';
const commandLetter = c => typeof c === 'string' && /^[MmLlHhVvCcSsQqTtAaZz]$/.test(c);
const finite = n => typeof n === 'number' && Number.isFinite(n);
function limit(name,maximum) {fail('LIMIT_EXCEEDED','SVG path safety limit exceeded',{limit:name,maximum});}
function unsafe() {fail('LIMIT_EXCEEDED','SVG path numerical range cannot be normalized safely at this precision',{limit:'svgNumericRange'});}

/** A cursor, not a regex token array: strict comma grammar and one-character arc flags. */
class Scanner {
  index = 0;tokens = 0;
  constructor(text,maximum) {this.text = text;this.maximum = maximum;}
  space() {while (whitespace(this.text[this.index])) this.index++;}
  token() {if (++this.tokens > this.maximum) limit('svgTokens',this.maximum);}
  invalid() {fail('INVALID_SVG','Invalid SVG path syntax',{offset:this.index});}
  number(comma,flag=false) {
    this.space();
    if (this.text[this.index] === ',') {if (!comma) this.invalid();this.index++;this.space();}
    const start = this.index;this.token();
    if (flag) {
      const c = this.text[this.index];if (c !== '0' && c !== '1') this.invalid();this.index++;return Number(c);
    }
    const take = () => {if (this.index-start >= 128) limit('svgNumberLength',128);return this.text[this.index++];};
    if (this.text[this.index] === '+' || this.text[this.index] === '-') take();
    let digits = 0,nonzero = false;
    const consumeDigits = () => {while (digit(this.text[this.index])) {nonzero ||= this.text[this.index] !== '0';take();digits++;}};
    consumeDigits();
    if (this.text[this.index] === '.') {take();consumeDigits();}
    if (!digits) this.invalid();
    if (this.text[this.index] === 'e' || this.text[this.index] === 'E') {
      take();if (this.text[this.index] === '+' || this.text[this.index] === '-') take();
      const before = this.index;while (digit(this.text[this.index])) take();if (this.index === before) this.invalid();
    }
    const n = Number(this.text.slice(start,this.index));
    if (!Number.isFinite(n) || n === 0 && nonzero) unsafe();
    return n;
  }
}

/** Endpoint-to-center SVG arc conversion. Cubic Hermite interpolation has a
 * conservative world-space error bound 2*R*||A||*h^4/384. Subdivision uses that
 * bound, not an unverified fixed quarter-circle approximation. Matrices stay native.
 */
function arc(start,end,rx,ry,rotation,large,sweep,tolerance,norm,emit,remaining,maximum) {
  if (start[0] === end[0] && start[1] === end[1]) return;
  rx = Math.abs(rx);ry = Math.abs(ry);
  if (!rx || !ry) {emit(['L',...end]);return;}
  const phi = (rotation%360)*Math.PI/180,cos = Math.cos(phi),sin = Math.sin(phi);
  const dx = (start[0]-end[0])/2,dy = (start[1]-end[1])/2;
  const x = cos*dx+sin*dy,y = -sin*dx+cos*dy;
  const correction = Math.hypot(x/rx,y/ry);
  if (!finite(correction) || correction === 0) unsafe();
  const corrected = correction > 1;
  if (corrected) {rx *= correction;ry *= correction;}
  if (!finite(rx) || !finite(ry)) unsafe();
  const u = x/rx,v = y/ry,q = u*u+v*v;
  if (!(q > 0) || !finite(q)) unsafe();
  // Corrected radii describe a semicircle exactly. Do not turn roundoff in q
  // into a spurious center displacement via sqrt(1-q).
  const factor = corrected ? 0 : (large === sweep ? -1 : 1)*Math.sqrt(Math.max(0,(1-q)/q));
  const cx = factor*rx*v,cy = -factor*ry*u;
  const a = [(x-cx)/rx,(y-cy)/ry],b = [(-x-cx)/rx,(-y-cy)/ry];
  const theta = Math.atan2(a[1],a[0]);
  let delta = Math.atan2(a[0]*b[1]-a[1]*b[0],a[0]*b[0]+a[1]*b[1]);
  if (sweep && delta < 0) delta += TAU;
  if (!sweep && delta > 0) delta -= TAU;
  const radius = Math.max(rx,ry),magnitude = Math.max(radius,...start.map(Math.abs),...end.map(Math.abs),Math.abs(cx),Math.abs(cy));
  // Near a diameter, center reconstruction is ill-conditioned. Refuse an arc
  // when uncertainty could consume its world-error allowance, rather than
  // silently snapping a large transformed curve to a different ellipse.
  const epsilon = 64*Number.EPSILON;
  const conditioning = !corrected || Math.abs(correction-1) <= epsilon
    ? radius*norm*epsilon/Math.sqrt(Math.max(1-q,epsilon)) : 0;
  const roundoff = epsilon*magnitude*norm+conditioning;
  if (!finite(roundoff) || roundoff >= tolerance/4 || !finite(delta) || delta === 0) unsafe();
  const effective = radius*norm;
  if (!finite(effective)) unsafe();
  const step = Math.min(Math.PI/2,Math.pow((tolerance-roundoff)*192/effective,0.25));
  const count = Math.ceil(Math.abs(delta)/step);
  if (!Number.isSafeInteger(count) || count < 1) unsafe();
  if (count > remaining) limit('svgCommands',maximum);
  const h = delta/count,U = [rx*cos,rx*sin],V = [-ry*sin,ry*cos];
  const point = t => {
    const mid = (t+theta)/2,half = (t-theta)/2;
    const dc = -2*Math.sin(mid)*Math.sin(half),ds = 2*Math.cos(mid)*Math.sin(half);
    return start.map((n,i) => n+U[i]*dc+V[i]*ds);
  };
  const tangent = t => U.map((n,i) => -n*Math.sin(t)+V[i]*Math.cos(t));
  const predicted = point(theta+delta);
  if (Math.hypot(predicted[0]-end[0],predicted[1]-end[1])*norm > roundoff) unsafe();
  let previous = start;
  for (let i = 0;i < count;i++) {
    const t0 = theta+i*h,t1 = theta+(i+1)*h;
    const next = i === count-1 ? end : point(t1),d0 = tangent(t0),d1 = tangent(t1);
    emit(['C',previous[0]+h*d0[0]/3,previous[1]+h*d0[1]/3,next[0]-h*d1[0]/3,next[1]-h*d1[1]/3,...next]);previous = next;
  }
}

/** Internal foundation only: ASCII path data -> native absolute M/L/Q/C/Z.
 * Not an XML security boundary or a public import operation. Output must still
 * undergo whole-document validation and the atomic SVG import transaction.
 */
export function normalizeSVGPath(data,options={}) {
  if (typeof data !== 'string' || !options || typeof options !== 'object' || Array.isArray(options) || Object.keys(options).some(k => !['transform','tolerance','maxCommands','maxTokens','maxInputLength'].includes(k))) fail('INVALID_ARGUMENT','Invalid SVG path normalizer arguments');
  const {transform=IDENTITY,tolerance=0.1,maxCommands=MAX_COMMANDS,maxTokens=MAX_TOKENS,maxInputLength=MAX_INPUT} = options;
  for (const [name,n,max] of [['maxCommands',maxCommands,MAX_COMMANDS],['maxTokens',maxTokens,MAX_TOKENS],['maxInputLength',maxInputLength,MAX_INPUT]]) if (!Number.isSafeInteger(n) || n < 1 || n > max) fail('INVALID_ARGUMENT','SVG path limits must be positive downward integers',{limit:name});
  if (!finite(tolerance) || tolerance <= 0 || tolerance > 0.1 || !Array.isArray(transform) || transform.length !== 6 || !transform.every(finite)) fail('INVALID_ARGUMENT','Invalid SVG path tolerance or transform');
  const [low,high] = singularValues(transform);
  if (low < 0.0001 || high > 10_000 || !finite(high)) fail('INVALID_ARGUMENT','SVG path transform is outside native scale limits');
  const norm = Math.hypot(...transform.slice(0,4));
  if (data.length > maxInputLength) limit('svgPathLength',maxInputLength);
  const s = new Scanner(data,maxTokens),out = [];
  let current = [0,0],subpath = [0,0],active = null,previous = null,cubic = null,quad = null,open = false;
  function push(c) {
    if (out.length >= maxCommands) limit('svgCommands',maxCommands);
    if (!c.slice(1).every(n => finite(n) && Math.abs(n) <= WORLD)) limit('coordinates',WORLD);
    out.push(c);
  }
  function emit(c) {
    if (!open && c[0] !== 'M') {push(['M',...current]);open = true;}
    push(c);open = c[0] !== 'Z';
  }
  while (true) {
    s.space();if (s.index === data.length) break;
    let explicit = false;
    if (commandLetter(data[s.index])) {active = data[s.index++];s.token();explicit = true;}
    else if (!active || active.toUpperCase() === 'Z') s.invalid();
    const op = active.toUpperCase(),relative = active !== op;
    if (!out.length && op !== 'M') s.invalid();
    if (op === 'Z') {
      if (open) {push(['Z']);open = false;}current = [...subpath];previous = 'Z';cubic = quad = null;continue;
    }
    let first = !explicit;
    const n = (flag=false) => {const value = s.number(first,flag);first = true;return value;};
    const pair = () => {const p = [n(),n()];return relative ? p.map((v,i) => v+current[i]) : p;};
    let end,nextCubic = null,nextQuad = null;
    if (op === 'M' || op === 'L') {
      end = pair();emit([op,...end]);if (op === 'M') {subpath = [...end];active = relative ? 'l' : 'L';}
    } else if (op === 'H' || op === 'V') {
      const axis = op === 'H' ? 0 : 1;end = [...current];end[axis] = n()+(relative ? current[axis] : 0);emit(['L',...end]);
    } else if (op === 'C' || op === 'S') {
      const c1 = op === 'C' ? pair() : ['C','S'].includes(previous) ? current.map((v,i) => 2*v-cubic[i]) : [...current];
      nextCubic = pair();end = pair();emit(['C',...c1,...nextCubic,...end]);
    } else if (op === 'Q' || op === 'T') {
      nextQuad = op === 'Q' ? pair() : ['Q','T'].includes(previous) ? current.map((v,i) => 2*v-quad[i]) : [...current];
      end = pair();emit(['Q',...nextQuad,...end]);
    } else if (op === 'A') {
      const rx = n(),ry = n(),rotation = n(),large = n(true),sweep = n(true);end = pair();
      if (!end.every(v => finite(v) && Math.abs(v) <= WORLD)) limit('coordinates',WORLD);
      arc(current,end,rx,ry,rotation,large,sweep,tolerance,norm,emit,maxCommands-out.length-(open ? 0 : 1),maxCommands);
    }
    current = end;previous = op;cubic = nextCubic;quad = nextQuad;
  }
  return out;
}
