import {test} from 'node:test';
import assert from 'node:assert/strict';
import {useBrowser} from './fixture.js';
const fixture = useBrowser(process.env.ETCH_SVG_BROWSER ?? 'chromium');
async function setup(t) {
  const {browser,server} = fixture;
  const page = await browser.newPage(),errors = [],external = [];
  page.on('pageerror',e => errors.push(e.message));page.on('request',r => {if (!r.url().startsWith(server.origin+'/') && !r.url().startsWith('blob:'+server.origin+'/')) external.push(r.url());});
  t.after(async () => {await page.close();assert.deepEqual(errors,[]);assert.deepEqual(external,[]);});await page.goto(`${server.origin}/demo/`);
  await page.evaluate(async () => {window.coordinates = await import('/etch/import/svg-coordinates.js');window.affine = await import('/etch/geometry/matrix.js');});return page;
}
function close(actual,expected) {actual.forEach((n,i) => assert.ok(Math.abs(n-expected[i]) < 2e-6*Math.max(1,Math.abs(expected[i])),`${actual} != ${expected}`));}

test('attribute transform grammar/order agrees with native SVG matrix consolidation',async t => {
  const page = await setup(t),results = await page.evaluate(() => ['translate(10-20)scale(2)rotate(30)','matrix(1,.2,-.3,1,5,-8)','rotate(-45 20 30) skewX(12) skewY(-7)','scale(-2,.75),translate(4 9)','translate(.5.25)','rotate(360090)','scale(.00001)scale(100)'].map(source => {
    const node = document.createElementNS('http://www.w3.org/2000/svg','g');node.setAttribute('transform',source);const m = node.transform.baseVal.consolidate().matrix;return {actual:window.coordinates.parseSVGTransform(source),expected:[m.a,m.b,m.c,m.d,m.e,m.f]};
  }));for (const row of results) close(row.actual,row.expected);
});
test('viewBox mapping and all preserveAspectRatio alignments agree with SVG getCTM',async t => {
  const page = await setup(t),results = await page.evaluate(() => {
    const rows = [];
    for (const x of ['Min','Mid','Max']) for (const y of ['Min','Mid','Max']) for (const mode of ['meet','slice']) {
      const attrs = {width:'200',height:'100',viewBox:'10 20 40 40',preserveAspectRatio:`x${x}Y${y} ${mode}`};
      const root = document.createElementNS('http://www.w3.org/2000/svg','svg');for (const [k,v] of Object.entries(attrs)) root.setAttribute(k,v);const child = document.createElementNS('http://www.w3.org/2000/svg','g');root.append(child);
      root.style.cssText = 'position:fixed;left:0;top:0;width:200px;height:100px;display:block';document.body.append(root);
      root.getBoundingClientRect();
      // A child measures the user-coordinate mapping; Firefox's outer root
      // getCTM describes its viewport rather than its viewBox user coordinates.
      const m = child.getCTM();rows.push({actual:window.coordinates.resolveSVGViewport(attrs).matrix,expected:[m.a,m.b,m.c,m.d,m.e,m.f]});root.remove();
    }return rows;
  });for (const row of results) close(row.actual,row.expected);
});
test('physical root units and intrinsic viewBox ratio match standalone SVG image sizing',async t => {
  const page = await setup(t),results = await page.evaluate(async () => {
    const rows = [];
    for (const attrs of [{width:'1in',height:'72pt',viewBox:'0 0 48 48'},{width:'2.54cm',height:'25.4mm',viewBox:'0 0 48 48'},{width:'101.6Q',height:'6pc',viewBox:'0 0 48 48'},{width:'1IN',height:'96PX',viewBox:'0 0 48 48'},{width:'200',viewBox:'0 0 80 40'},{height:'100',viewBox:'0 0 80 40'},{viewBox:'0 0 90 30'}]) {
      const markup = `<svg xmlns="http://www.w3.org/2000/svg" ${Object.entries(attrs).map(([k,v]) => `${k}="${v}"`).join(' ')}><rect width="80" height="40"/></svg>`;
      const url = URL.createObjectURL(new Blob([markup],{type:'image/svg+xml'}));
      try {const image = new Image();image.src = url;await image.decode();const value = window.coordinates.resolveSVGViewport(attrs);rows.push({attrs,actual:[value.width,value.height],expected:[image.naturalWidth,image.naturalHeight]});}finally {URL.revokeObjectURL(url);}
    }return rows;
  });
  // With viewBox only, intrinsic size is an Etch policy (viewBox user dimensions),
  // not the browser replaced-element 300x150 fallback; compare aspect ratio there.
  for (const row of results) {if (Object.keys(row.attrs).length === 1) close([row.actual[0]/row.actual[1]],[row.expected[0]/row.expected[1]]);else close(row.actual,row.expected);}
});
test('viewBox + nested reflection/shear retains native stroke pixels for meet, slice and none',async t => {
  const page = await setup(t),rows = await page.evaluate(async () => {
    const results = [];
    for (const preserveAspectRatio of ['xMidYMid meet','xMaxYMin slice','none']) {
      const attrs = {width:'200',height:'120',viewBox:'0 0 80 60',preserveAspectRatio},parent = 'translate(5 10) rotate(12 20 20)',child = 'matrix(-1 .1 .25 1 55 0)';
      const source = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="120" viewBox="0 0 80 60" preserveAspectRatio="${preserveAspectRatio}"><g transform="${parent}"><path transform="${child}" d="M5 5L45 5L45 35L5 35Z" fill="#ee9933" stroke="#123456" stroke-width="3"/></g></svg>`;
      const canvas = () => {const c = document.createElement('canvas');c.width = 200;c.height = 120;return c;},expected = canvas(),actual = canvas(),url = URL.createObjectURL(new Blob([source],{type:'image/svg+xml'}));
      try {
        const image = new Image();image.src = url;await image.decode();expected.getContext('2d').drawImage(image,0,0);
        const {parseSVGTransform,resolveSVGViewport,validateSVGImportMatrix} = window.coordinates,{multiply} = window.affine;
        const matrix = validateSVGImportMatrix(multiply(resolveSVGViewport(attrs).matrix,multiply(parseSVGTransform(parent),parseSVGTransform(child))));
        const ctx = actual.getContext('2d');ctx.setTransform(...matrix);ctx.beginPath();ctx.moveTo(5,5);ctx.lineTo(45,5);ctx.lineTo(45,35);ctx.lineTo(5,35);ctx.closePath();ctx.fillStyle = '#ee9933';ctx.fill();ctx.strokeStyle = '#123456';ctx.lineWidth = 3;ctx.lineJoin = 'miter';ctx.miterLimit = 4;ctx.stroke();
        const a = actual.getContext('2d').getImageData(0,0,200,120).data,b = expected.getContext('2d').getImageData(0,0,200,120).data;let sum = 0,strong = 0,paint = 0;
        for (let i = 0;i < a.length;i += 4) {let worst = Math.abs(a[i+3]-b[i+3]);sum += worst;if (b[i+3]) paint++;
          for (let j = 0;j < 3;j++) {const d = Math.abs(a[i+j]*a[i+3]/255-b[i+j]*b[i+3]/255);sum += d;worst = Math.max(worst,d);}if (worst > 32) strong++;
        }results.push({preserveAspectRatio,mean:sum/a.length,strong,paint});
      }finally {URL.revokeObjectURL(url);}
    }return results;
  });for (const row of rows) {assert.ok(row.paint > 3000,JSON.stringify(row));assert.ok(row.mean < 1.5,JSON.stringify(row));assert.ok(row.strong < 240,JSON.stringify(row));}
});
