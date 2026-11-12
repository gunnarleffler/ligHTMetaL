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
    const {inspectSVGXML} = await import('/etch/import/svg-xml.js'),{resolveSVGStyles} = await import('/etch/import/svg-style.js'),{normalizeSVGGeometry} = await import('/etch/import/svg-geometry.js'),{serializeSVG} = await import('/etch/svg-export.js');
    window.convertSVG = (source,options) => normalizeSVGGeometry(resolveSVGStyles(inspectSVGXML(source)),options);
    window.wrapSVG = body => `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200">${body}</svg>`;
    window.compareGeometry = async source => {
      const result = window.convertSVG(source),svg = serializeSVG(result.document,{bounds:result.viewport,padding:0});
      const pixels = async text => {const url = URL.createObjectURL(new Blob([text],{type:'image/svg+xml'}));try {const image = new Image();image.src = url;await image.decode();const canvas = document.createElement('canvas');canvas.width = result.viewport.width;canvas.height = result.viewport.height;const ctx = canvas.getContext('2d');ctx.drawImage(image,0,0);return ctx.getImageData(0,0,canvas.width,canvas.height).data;}finally {URL.revokeObjectURL(url);}};
      const a = await pixels(source),b = await pixels(svg);let total = 0,strong = 0;
      for (let i = 0;i < a.length;i += 4) {let worst = Math.abs(a[i+3]-b[i+3]);total += worst;for (let j = 0;j < 3;j++) {const d = Math.abs(a[i+j]*a[i+3]/255-b[i+j]*b[i+3]/255);total += d;worst = Math.max(worst,d);}if (worst > 32) strong++;}
      return {mean:total/a.length,strong,types:result.document.layers[0].elements.map(e => e.type),stats:result.stats};
    };
  });return page;
}
test('XML/styles/coordinates/primitives/arcs normalize into native document and re-export with matching pixels',async t => {
  const page = await setup(t),row = await page.evaluate(() => window.compareGeometry(`<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200" viewBox="0 0 150 100"><style>.blue{fill:royalblue}.outline{fill:none;stroke:#123456;stroke-width:2;stroke-linejoin:round}</style><g transform="translate(5 5)"><rect class="blue" x="5" y="5" width="30" height="20"/><circle cx="60" cy="20" r="10" fill="orange"/><ellipse cx="100" cy="20" rx="15" ry="8" fill="purple" transform="rotate(10 100 20)"/><line x1="10" y1="45" x2="40" y2="45" stroke="red" stroke-width="3" stroke-linecap="square"/><polyline class="outline" points="50 40 65 55 80 40"/><polygon fill="limegreen" points="95 40 110 55 125 40"/><path class="outline" d="M15 70a20 12 20 0 1 40 0"/><g transform="matrix(-1 .1 .2 1 130 0)"><path fill="gold" d="M20 65h30v15h-30z"/></g></g></svg>`));
  assert.deepEqual(row.types,['rect','ellipse','ellipse','line','path','path','path','path']);assert.ok(row.mean < 1.5,JSON.stringify(row));assert.ok(row.strong < 500,JSON.stringify(row));
});
test('viewport-edge primitive strokes retain pixels without false miter-envelope clipping',async t => {
  const page = await setup(t);
  for (const body of ['<rect x="1" y="1" width="298" height="198" fill="none" stroke="red" stroke-width="2"/>','<ellipse cx="150" cy="100" rx="149" ry="99" fill="none" stroke="blue" stroke-width="2"/>','<line x1="0" y1="100" x2="300" y2="100" stroke="black" stroke-width="10"/>']) {
    const row = await page.evaluate(body => window.compareGeometry(window.wrapSVG(body)),body);assert.ok(row.mean < .1,JSON.stringify(row));assert.ok(row.strong < 30,JSON.stringify(row));
  }
});
test('root clipping, aggregate budgets, root transforms and nested graphical content reject without partial model',async t => {
  const page = await setup(t),results = await page.evaluate(() => {
    const attempts = [[window.wrapSVG('<rect x="-1" width="20" height="20"/>'),{}],[window.wrapSVG('<path d="M10 10L20 20"/><path d="M30 10L40 20"/>'),{limits:{points:3}}],['<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200" transform="rotate(10)"><rect width="20" height="20"/></svg>',{}],[window.wrapSVG('<rect width="20" height="20"><path d="M50 50h30v30z"/></rect>'),{}]];
    return attempts.map(([source,options]) => {try {window.convertSVG(source,options);return 'accepted';}catch(e) {return e.code;}});
  });assert.deepEqual(results,['UNSUPPORTED_SVG_FEATURE','LIMIT_EXCEEDED','UNSUPPORTED_SVG_FEATURE','UNSUPPORTED_SVG_FEATURE']);
});
