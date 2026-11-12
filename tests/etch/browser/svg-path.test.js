import {test} from 'node:test';
import assert from 'node:assert/strict';
import {useBrowser} from './fixture.js';

const name = process.env.ETCH_SVG_BROWSER ?? 'chromium';
if (!['chromium','firefox'].includes(name)) throw new Error('ETCH_SVG_BROWSER must be chromium or firefox');
const fixture = useBrowser(name);
async function pageFor(t) {
  const {browser,server} = fixture;
  const page = await browser.newPage(),errors = [],external = [];
  page.on('pageerror',e => errors.push(e.message));page.on('request',r => {if (!r.url().startsWith(server.origin+'/') && !/^(blob:|data:)/.test(r.url())) external.push(r.url());});
  t.after(async () => {await page.close();assert.deepEqual(errors,[]);assert.deepEqual(external,[]);});await page.goto(`${server.origin}/demo/`);
  await page.evaluate(async () => {
    window.parsePath = (await import('/etch/import/svg-path.js')).normalizeSVGPath;
    window.trace = (await import('/etch/geometry/paths.js')).traceCommand;
    window.pixelsSVG = async svg => {
      const url = URL.createObjectURL(new Blob([svg],{type:'image/svg+xml'})),image = new Image(),c = document.createElement('canvas');c.width = 600;c.height = 400;
      try {image.src = url;await image.decode();const ctx = c.getContext('2d');ctx.drawImage(image,0,0);return ctx.getImageData(0,0,600,400).data;}
      finally {URL.revokeObjectURL(url);image.src = '';c.width = c.height = 0;}
    };
    window.comparePixels = (a,b) => {
      let bad = 0,total = 0,painted = 0;
      for (let i = 0;i < a.length;i += 4) {if (a[i+3]) painted++;let delta = Math.abs(a[i+3]-b[i+3]);total += delta;for (let j = 0;j < 3;j++) {const d = Math.abs(a[i+j]*a[i+3]/255-b[i+j]*b[i+3]/255);total += d;delta = Math.max(delta,d);}if (delta > 30) bad++;}
      return {bad,mean:total/a.length,painted};
    };
    window.pathOracle = async (d,matrix,fill='none',rule='nonzero') => {
      // Only authored valid fixtures enter this test SVG string, never user input.
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><path d="${d}" transform="matrix(${matrix.join(' ')})" fill="${fill}" fill-rule="${rule}" stroke="#0086FF" stroke-width="3" stroke-linecap="round" stroke-linejoin="miter" stroke-miterlimit="4"/></svg>`;
      const expected = await window.pixelsSVG(svg),commands = window.parsePath(d,{transform:matrix}),c = document.createElement('canvas');c.width = 600;c.height = 400;
      try {const ctx = c.getContext('2d'),path = new Path2D();for (const command of commands) window.trace(path,command);
        ctx.setTransform(...matrix);ctx.fillStyle = fill === 'none' ? '#000000' : fill;if (fill !== 'none') ctx.fill(path,rule);ctx.strokeStyle = '#0086FF';ctx.lineWidth = 3;ctx.lineCap = 'round';ctx.lineJoin = 'miter';ctx.miterLimit = 4;ctx.stroke(path);
        return window.comparePixels(expected,ctx.getImageData(0,0,600,400).data);
      } finally {c.width = c.height = 0;}
    };
  });return page;
}
function close(result) {assert.ok(result.painted > 100,JSON.stringify(result));assert.ok(result.bad < 1200,JSON.stringify(result));assert.ok(result.mean < .5,JSON.stringify(result));}

test('SVG path normalization matches the browser SVG renderer for relative/implicit packs, smooth curves and close continuations',async t => {
  const page = await pageFor(t);
  for (const d of ['m20 20 50 10 10 50h-40v-20H20V20z','M10 20C20 0 40 0 50 20s30 20 40 0 30-20 40 0','M10 20q20-30 40 0t40 0 40 0','M10 20L70 20Zs20 40 50 60zT80 100ZL30 120','M10 10h100v100H10zM30 30v60h60V30z']) close(await page.evaluate(({d}) => window.pathOracle(d,[3,0,0,2,20,30],d.includes('M30') ? '#AA55DD' : 'none','evenodd'),{d}));
});
test('all arc flags, rotations, relative/compact flags, radii correction and zero radii match independent browser SVG rendering',async t => {
  const page = await pageFor(t);
  for (const d of ['M20 50A30 20 35 0 0 80 50','M20 50A-30 -20 35 0 0 80 50','M20 50A30 20 35 0 1 80 50','M20 50A30 20 35 1 0 80 50','M20 50A30 20 35 1 1 80 50','M20 50a20 10 80 0160 20','M20 50A1 2 0 0 1 80 50','M12.3 4.7A3 7 17 0 1 80 65.4','M20 50a0 10 0 0 1 60 20','M20 50A20 10 0 0 1 20 50L80 70']) close(await page.evaluate(d => window.pathOracle(d,[3,0,0,2,40,40]),d));
});
test('arc refinement respects shear/nonuniform/reflected transforms rather than only local-space error',async t => {
  const page = await pageFor(t);
  for (const matrix of [[8,0,0,3,40,40],[-3,.4,1,2,350,30],[2,1,1,3,10,10]]) close(await page.evaluate(matrix => window.pathOracle('M10 40A20 12 35 1 1 50 30',matrix),matrix));
});
test('exported pressure outlines normalize to validated native paths and re-export without changing painted geometry',async t => {
  const page = await pageFor(t),result = await page.evaluate(async () => {
    const {createEtch} = await import('/etch.js'),{validateDocument} = await import('/etch/validation.js');
    const card = document.createElement('div');card.style.cssText = 'width:700px;height:500px';document.body.prepend(card);const e = createEtch(card);
    try {
      const data = {format:'lightmetal-etch',version:1,background:null,assets:[],layers:[{id:'layer',name:'Layer',visible:true,locked:false,offset:[0,0],elements:[{id:'stroke',type:'stroke',transform:[1,0,0,1,0,0],points:[[50,100,.1],[200,50,1],[400,200,.4]],width:25,color:'#1266AA',pressure:true}]}]};
      await e.load(data);const options = {padding:0,bounds:{x:0,y:0,width:600,height:400}},before = e.exportSVG(options).svg;
      const source = new DOMParser().parseFromString(before,'image/svg+xml').querySelector('path').getAttribute('d'),commands = window.parsePath(source);
      data.layers[0].elements = [{id:'path',type:'path',transform:[1,0,0,1,0,0],commands,fill:'#1266AA',fillRule:'nonzero',stroke:null,strokeWidth:0,lineCap:'butt',lineJoin:'miter',miterLimit:4}];
      await e.load(validateDocument(data));const after = e.exportSVG(options).svg;
      return {...window.comparePixels(await window.pixelsSVG(before),await window.pixelsSVG(after)),count:commands.length,type:e.save().layers[0].elements[0].type};
    } finally {e.destroy();card.remove();}
  });assert.equal(result.bad,0);assert.equal(result.mean,0);assert.ok(result.painted > 5000);assert.ok(result.count > 100);assert.equal(result.type,'path');
});
test('path parsing uses no DOM, native path parser, canvas, decoder or network, and rejects bounded malformed input',async t => {
  const page = await pageFor(t),result = await page.evaluate(() => {
    const old = [window.DOMParser,window.Path2D,window.createImageBitmap,document.createElement];
    const blocked = () => {throw new Error('Parser must be pure');};window.DOMParser = window.Path2D = window.createImageBitmap = document.createElement = blocked;
    try {
      const good = window.parsePath('M0 0A10 20 30 0 1 20 20'),codes = [];
      for (const [d,options] of [['M0 0<script>',{}],['M0 0,',{}],['M0 0A100 100 0 1 1 100 100',{maxCommands:2}],['M0 0',{maxTokens:2}]]) try {window.parsePath(d,options);}catch(e) {codes.push(e.code);}
      return {count:good.length,codes};
    } finally {[window.DOMParser,window.Path2D,window.createImageBitmap,document.createElement] = old;}
  });assert.ok(result.count > 1);assert.deepEqual(result.codes,['INVALID_SVG','INVALID_SVG','LIMIT_EXCEEDED','LIMIT_EXCEEDED']);
});
