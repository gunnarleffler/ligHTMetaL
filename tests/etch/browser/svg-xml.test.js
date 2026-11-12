import {test} from 'node:test';
import assert from 'node:assert/strict';
import {useBrowser} from './fixture.js';
const fixture = useBrowser(process.env.ETCH_SVG_BROWSER ?? 'chromium');
const wrap = content => `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">${content}</svg>`;
async function pageFor(t) {
  const {browser,server} = fixture;
  const page = await browser.newPage(),external = [],errors = [];
  page.on('request',r => {if (!r.url().startsWith(server.origin+'/')) external.push(r.url());});page.on('pageerror',e => errors.push(e.message));
  t.after(async () => {await page.waitForTimeout(100);await page.close();assert.deepEqual(external,[]);assert.deepEqual(errors,[]);});await page.goto(`${server.origin}/demo/`);
  await page.evaluate(async () => {window.inspectSVG = (await import('/etch/import/svg-xml.js')).inspectSVGXML;window.svgExecution = 0;});return page;
}
const inspect = (page,source,options={}) => page.evaluate(({source,options}) => {try {return {value:window.inspectSVG(source,options)};}catch(e) {return {code:e.code,details:e.details};}},{source,options});

test('plain/prefixed SVG XML declarations and safe entity references yield detached data, never source DOM',async t => {
  const page = await pageFor(t),source = '<?xml version="1.0" encoding="UTF-8"?><s:svg xmlns:s="http://www.w3.org/2000/svg" xmlns:href="urn:description" xmlns:onload="urn:editor-only" width="100" height="50" viewBox="0 0 100 50"><s:title>Tom &amp; Jane</s:title><s:path id="a" d="M0 0L&#49;0 20" fill="#123456" shape-rendering="crispEdges"/></s:svg>';
  const result = await inspect(page,source);assert.equal(result.value.tree.name,'svg');assert.equal(result.value.tree.children.length,1);assert.equal(result.value.tree.children[0].attributes.d,'M0 0L10 20');assert.equal(result.value.tree.children[0].attributes['shape-rendering'],'crispEdges');
  assert.equal(await page.evaluate(() => {const v = window.inspectSVG('<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>');return JSON.stringify(v).includes('ownerDocument') || v.tree instanceof Node;}),false);
});
test('pasted SVG snippets may omit xmlns, but explicit namespace changes are not guessed away',async t => {
  const page = await pageFor(t),result = await inspect(page,'<svg viewBox="0 0 24 24"><style>.icon{fill:red}</style><path class="icon" d="M0 0L10 10"/></svg>');
  assert.equal(result.value.stats.namespaceInferred,true);assert.equal(result.value.tree.children[0].name,'path');assert.equal(result.value.styleSheets.length,1);
  assert.equal((await inspect(page,'<svg xmlns=""><path/></svg>')).code,'INVALID_SVG');
  assert.equal((await inspect(page,wrap('<g xmlns=""><path/></g>'))).code,'UNSUPPORTED_SVG_FEATURE');
  assert.equal((await inspect(page,'<svg><defs><style>@import "https://evil.invalid/a";</style></defs></svg>')).code,'UNSAFE_SVG');
});
test('Inkscape editor metadata, RDF descriptive URLs, generator comments and unused definitions work without hand-cleaning',async t => {
  const page = await pageFor(t),source = `<?xml version="1.0"?>
  <!-- Generator and harmless sample: <!DOCTYPE svg> -->
  <svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd" xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:dc="http://purl.org/dc/elements/1.1/" inkscape:version="1.3" xml:space="preserve" width="100mm" viewBox="0 0 100 100">
  <metadata><rdf:RDF><rdf:Description rdf:about="https://example.invalid/art"><dc:description><![CDATA[<script> is descriptive text]]></dc:description></rdf:Description></rdf:RDF></metadata>
  <sodipodi:namedview inkscape:zoom="2"/><defs><linearGradient id="unused"><stop stop-color="#fff"/></linearGradient></defs>
  <g inkscape:label="Layer 1" inkscape:groupmode="layer" transform="translate(2 3)"><rect width="20" height="30" fill="#123456"/></g></svg>`;
  const result = await inspect(page,source);assert.ok(result.value);assert.equal(result.value.tree.children.length,1);assert.equal(result.value.tree.children[0].name,'g');assert.equal(result.value.tree.children[0].attributes.transform,'translate(2 3)');
});
test('common Illustrator-style class palettes and inline important/duplicate declarations are parsed, not silently dropped',async t => {
  const page = await pageFor(t),source = wrap('<style type="text/css"><![CDATA[/* palette */ .st0, .st1 {fill:#123456;stroke:none} #accent {stroke:rgb(1, 2, 3)} path {stroke-width:2}]]></style><g><path class="st0" id="accent" d="M0 0L20 20" style="font-family:Arial;-inkscape-font-specification:Arial;fill:red!important; fill:blue; stroke : green;stroke:black!important;stroke:white;"/></g>');
  const result = await inspect(page,source),record = result.value.tree.children[0].children[0];assert.equal(result.value.styleSheets.length,3);assert.deepEqual(result.value.styleSheets[0].selectors,[{kind:'class',name:'st0'},{kind:'class',name:'st1'}]);assert.equal(record.attributes.class,'st0');assert.equal(record.style.values.fill,'red');assert.equal(record.style.values.stroke,'black');assert.deepEqual(record.style.important,['fill','stroke']);
});
test('unsafe content is rejected throughout hidden/metadata/unused/unsupported trees, never executed or fetched',async t => {
  const page = await pageFor(t);
  const payloads = ['<script>window.svgExecution++</script>','<g display="none"><path onload="window.svgExecution++"/></g>','<metadata><x:script xmlns:x="urn:foreign">bad</x:script></metadata>','<defs><image href="https://evil.invalid/a.png"/></defs>','<defs><image xlink:href="&#x68;ttps://evil.invalid/a.png"/></defs>','<defs><animateColor attributeName="fill" to="red"/></defs>','<rect style="fill:u&#114;l(https://evil.invalid/x)"/>','<foreignObject><div xmlns="http://www.w3.org/1999/xhtml">HTML</div></foreignObject>','<g xml:base="https://evil.invalid/"><use href="#x"/></g>','<defs><filter><feImage xlink:href="//evil.invalid/x"/></filter></defs>','<text>Unsupported first</text><animate attributeName="href" to="https://evil.invalid"/>','<metadata><img xmlns="http://www.w3.org/1999/xhtml" src="https://evil.invalid/x"/></metadata>','<metadata><style xmlns="http://www.w3.org/1999/xhtml">@import "https://evil.invalid/a";</style></metadata>','<g xmlns:ev="http://www.w3.org/2001/xml-events" ev:event="click"/>','<rect fill="url(https://evil.invalid/x)"/>','<defs><path style="fill:url(&quot;/*https://evil.invalid*/#a&quot;)"/></defs>','<style>@import "https://evil.invalid/x.css";</style>','<path style="fill:u\\72l(https://evil.invalid/x)"/>','<image href="data:image/svg+xml;base64,AAAA"/>','<use href=""/>'];
  for (const source of payloads) assert.equal((await inspect(page,wrap(source))).code,'UNSAFE_SVG',source);
  assert.equal(await page.evaluate(() => window.svgExecution),0);
  // A CSS bad-string ends at newline in the native tokenizer; do not let our
  // quote tracking hide a resource that the native parser would see afterwards.
  assert.equal((await inspect(page,wrap('<defs><style><![CDATA[.x{font-family:\'broken\n;fill:url(https://evil.invalid/x);\'}]]></style></defs>'))).code,'INVALID_SVG');
});
test('DOCTYPE/entities/PIs cannot reach DOMParser, including external DTD and stylesheet requests',async t => {
  const page = await pageFor(t),results = await page.evaluate(sources => {const Original = DOMParser;let calls = 0;class Parser {constructor() {calls++;return new Original();}}const codes = sources.map(source => {try {window.inspectSVG(source,{DOMParser:Parser});}catch(e) {return e.code;}});return {calls,codes};},['<!DOCTYPE svg SYSTEM "https://evil.invalid/x.dtd">'+wrap(''),'<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///etc/passwd">]>'+wrap('&x;'),'<?xml-stylesheet href="https://evil.invalid/x.css"?>'+wrap('')]);
  assert.equal(results.calls,0);assert.deepEqual(results.codes,['UNSAFE_SVG','UNSAFE_SVG','UNSAFE_SVG']);
});
test('unsupported appearance produces bounded actionable diagnostics instead of changed artwork',async t => {
  const page = await pageFor(t);
  for (const source of ['<text x="1" y="2">Hello</text>','<path mystery="x"/>','<svg width="20"/>','<style>.st0:hover {fill:red}</style><path class="st0"/>','<path fill="url(#gradient)"/><defs><linearGradient id="gradient"/></defs>','<style media="print">path {fill:red}</style>','<metadata><style>path {fill:red}</style></metadata>','<x:thing xmlns:x="urn:unknown"/>']) {
    const result = await inspect(page,wrap(source));assert.equal(result.code,'UNSUPPORTED_SVG_FEATURE',source);assert.ok(result.details.features.length > 0);assert.ok(result.details.features.length <= 64);
  }
});
test('well-formedness/root/duplicate IDs are enforced without confusing benign descriptive text with code',async t => {
  const page = await pageFor(t);
  for (const source of ['<svg>','<svg xmlns="http://www.w3.org/2000/svg"><metadata>','<html/>','<svg xmlns="urn:not-svg"/>',wrap('<g id="a"/><path id="a"/>'),wrap('<path x="1" x="2"/>')]) assert.equal((await inspect(page,source)).code,'INVALID_SVG',source);
  assert.ok((await inspect(page,wrap('<title>&lt;script onload="x"&gt;</title><desc><![CDATA[<?xml-stylesheet?>]]></desc><rect width="10" height="10"/>'))).value);
});
test('XML element/node/depth/attribute/CSS budgets are downward and fail before building oversized output',async t => {
  const page = await pageFor(t);
  for (const [source,options,limit] of [[wrap('<g/>'),{maxElements:1},'svgElements'],[wrap('<g/>'),{maxDepth:1},'svgDepth'],[wrap('<g/>'),{maxNodes:2},'svgNodes'],[wrap('<rect x="0" y="0" width="10" height="10"/>'),{maxAttributesPerElement:3},'svgAttributesPerElement'],[wrap('<g/>'),{maxAttributes:1},'svgAttributes'],[wrap('<style>path{fill:red}rect{fill:blue}</style>'),{maxRules:1},'svgRules'],[wrap('<style>.a,.b,.c{fill:red}</style>'),{maxCSSItems:2},'svgCSSItems']]) {
    const result = await inspect(page,source,options);assert.equal(result.code,'LIMIT_EXCEEDED');assert.equal(result.details.limit,limit);
  }
  const result = await inspect(page,wrap('<g/>'),{maxDepth:2,maxElements:2,maxNodes:3,maxAttributes:2});assert.ok(result.value);assert.equal(result.value.stats.elements,2);
});
