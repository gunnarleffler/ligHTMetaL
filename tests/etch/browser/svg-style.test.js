import {test} from 'node:test';
import assert from 'node:assert/strict';
import {useBrowser} from './fixture.js';
const fixture = useBrowser(process.env.ETCH_SVG_BROWSER ?? 'chromium');
async function setup(t) {
  const {browser,server} = fixture;
  const page = await browser.newPage(),errors = [],external = [];
  page.on('pageerror',e => errors.push(e.message));page.on('request',r => {if (!r.url().startsWith(server.origin+'/') && !r.url().startsWith('blob:'+server.origin+'/')) external.push(r.url());});
  t.after(async () => {await page.close();assert.deepEqual(errors,[]);assert.deepEqual(external,[]);});await page.goto(`${server.origin}/demo/`);
  await page.evaluate(async () => {
    window.svgXML = await import('/etch/import/svg-xml.js');window.svgStyle = await import('/etch/import/svg-style.js');window.svgColor = await import('/etch/import/svg-colors.js');window.svgCoords = await import('/etch/import/svg-coordinates.js');window.affine = await import('/etch/geometry/matrix.js');
    window.sourceSVG = body => `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100">${body}</svg>`;
    window.compareStyles = async body => {
      const source = window.sourceSVG(body),inspection = window.svgXML.inspectSVGXML(source),result = window.svgStyle.resolveSVGStyles(inspection);
      const canvas = () => {const c = document.createElement('canvas');c.width = 200;c.height = 100;return c;},actual = canvas(),expected = canvas(),url = URL.createObjectURL(new Blob([source],{type:'image/svg+xml'}));
      try {
        const image = new Image();image.src = url;await image.decode();expected.getContext('2d').drawImage(image,0,0);
        const matrices = [];
        for (const record of result.records) {
          let matrix = record.parent === null ? window.svgCoords.resolveSVGViewport(record.attributes).matrix : matrices[record.parent];
          if (record.attributes.transform) matrix = window.affine.multiply(matrix,window.svgCoords.parseSVGTransform(record.attributes.transform));matrices.push(matrix);
          if (!record.paint || record.name !== 'rect') continue;
          const attrs = record.attributes,paint = record.paint,ctx = actual.getContext('2d');ctx.setTransform(...matrix);ctx.beginPath();ctx.rect(Number(attrs.x ?? 0),Number(attrs.y ?? 0),Number(attrs.width),Number(attrs.height));
          if (paint.fill) {ctx.fillStyle = paint.fill;ctx.fill(paint.fillRule);}if (paint.stroke) {ctx.strokeStyle = paint.stroke;ctx.lineWidth = paint.strokeWidth;ctx.lineCap = paint.lineCap;ctx.lineJoin = paint.lineJoin;ctx.miterLimit = paint.miterLimit;ctx.stroke();}
        }
        const a = actual.getContext('2d').getImageData(0,0,200,100).data,b = expected.getContext('2d').getImageData(0,0,200,100).data;let total = 0,strong = 0;
        for (let i = 0;i < a.length;i += 4) {let worst = Math.abs(a[i+3]-b[i+3]);total += worst;for (let j = 0;j < 3;j++) {const d = Math.abs(a[i+j]*a[i+3]/255-b[i+j]*b[i+3]/255);total += d;worst = Math.max(worst,d);}if (worst > 32) strong++;}
        return {mean:total/a.length,strong,paints:result.records.filter(r => r.paint).map(r => r.paint)};
      }finally {URL.revokeObjectURL(url);}
    };
  });return page;
}
const matches = row => {assert.ok(row.mean < 1,JSON.stringify(row));assert.ok(row.strong < 150,JSON.stringify(row));};

test('SVG stylesheet specificity/importance/source order and inherited painter colors match native pixels',async t => {
  const page = await setup(t),row = await page.evaluate(() => window.compareStyles(`<style>rect{fill:green;stroke:#123456;stroke-width:2}.a{fill:gold}.b{fill:blue}#x{fill:purple!important}</style><g transform="translate(5 10)"><rect class="a b" x="5" y="5" width="30" height="40"/><rect class="a" id="x" x="50" y="5" width="30" height="40" style="fill:red"/><rect class="a" x="95" y="5" width="30" height="40" style="fill:orange ! important;fill:blue"/><rect x="140" y="5" width="30" height="40"/></g>`));
  matches(row);assert.deepEqual(row.paints.map(p => p.fill),['#0000FF','#800080','#FFA500','#008000']);
});
test('invalid CSS declarations including invalid important duplicates preserve valid earlier/later fallback',async t => {
  const page = await setup(t),row = await page.evaluate(() => window.compareStyles(`<style>.a{fill:red;fill:not-a-color!important;fill:blue}.b{fill:orange!important;fill:not-a-color!important}</style><rect class="a" x="5" y="5" width="40" height="40"/><rect class="b" x="55" y="5" width="40" height="40"/><rect x="105" y="5" width="40" height="40" style="fill:purple;fill:'bogus;value'!important"/>`));
  matches(row);assert.deepEqual(row.paints.map(p => p.fill),['#0000FF','#FFA500','#800080']);
});
test('currentColor stays inherited as a paint token; hidden visibility can be overridden while display/opacity zero cannot',async t => {
  const page = await setup(t),row = await page.evaluate(() => window.compareStyles(`<style>.hidden{display:none}.shown{visibility:visible}</style><g color="red" fill="currentColor"><rect x="5" y="5" width="30" height="40" color="blue"/><rect x="45" y="5" width="30" height="40"/><g visibility="hidden"><rect x="85" y="5" width="30" height="40"/><rect class="shown" color="rebeccapurple" x="125" y="5" width="30" height="40"/></g><g class="hidden"><rect x="1" y="1" width="190" height="80" fill="rgba(1,2,3,.5)"/></g><g opacity="0"><rect x="1" y="1" width="190" height="80" fill="lab(50% 0 0)"/></g></g>`));
  matches(row);assert.deepEqual(row.paints.map(p => p.fill),['#0000FF','#FF0000','#663399']);
});
test('pure sRGB color normalization agrees with browser raster colors without quantizing source alpha',async t => {
  const page = await setup(t),rows = await page.evaluate(() => {
    const ctx = document.createElement('canvas').getContext('2d');return ['aliceblue','darkslategrey','rebeccapurple','yellowgreen','#abc','rgb(100% 0% 50%)','hsl(210 50% 40%)','hsl(-30deg 80% 50%)','hsl(.5turn,100%,50%)','hsl(200grad 100% 50%)','rgb(300 -10 128)'].map(source => {ctx.clearRect(0,0,1,1);ctx.fillStyle = source;ctx.fillRect(0,0,1,1);return {source,actual:window.svgColor.parseSVGColor(source).color,expected:'#'+[...ctx.getImageData(0,0,1,1).data].slice(0,3).map(n => n.toString(16).padStart(2,'0')).join('').toUpperCase()};});
  });for (const row of rows) {
    // CSS HSL implementations can straddle an 8-bit half-step by one channel
    // (Firefox versus Chromium); named/hex/RGB colors must still match exactly.
    if (row.source.startsWith('hsl')) for (let i = 1;i < 7;i += 2) assert.ok(Math.abs(parseInt(row.actual.slice(i,i+2),16)-parseInt(row.expected.slice(i,i+2),16)) <= 1,row.source);
    else assert.equal(row.actual,row.expected,row.source);
  }
  const alpha = await page.evaluate(() => window.svgColor.parseSVGColor('rgba(1,2,3,.000001)').alpha);assert.equal(alpha,.000001);
});
test('unsupported visible styles fail without partial output and style resolution uses no DOM/layout/canvas',async t => {
  const page = await setup(t),result = await page.evaluate(() => {
    const codes = ['fill="rgba(1,2,3,.000001)"','stroke="red" stroke-dasharray="2 3"','shape-rendering="crispEdges"','filter="blur(2px)"','opacity=".5"'].map(attrs => {try {window.svgStyle.resolveSVGStyles(window.svgXML.inspectSVGXML(window.sourceSVG(`<rect ${attrs} width="30" height="30"/>`)));return 'accepted';}catch(e) {return e.code;}});
    const inspection = window.svgXML.inspectSVGXML(window.sourceSVG('<rect fill="red" width="20" height="20"/>')),original = document.createElement,originalNS = document.createElementNS;
    document.createElement = document.createElementNS = () => {throw new Error('DOM construction in styles');};
    try {const styled = window.svgStyle.resolveSVGStyles(inspection);return {codes,color:styled.records.at(-1).paint.fill};}finally {document.createElement = original;document.createElementNS = originalNS;}
  });assert.deepEqual(result.codes,Array(5).fill('UNSUPPORTED_SVG_FEATURE'));assert.equal(result.color,'#FF0000');
});
