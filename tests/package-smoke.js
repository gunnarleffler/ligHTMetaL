/* Pack and install without lifecycle scripts, then test the installed files.
 * Run after building: NODE_PATH=$(npm root -g) node tests/package-smoke.js
 * Pass an existing .tgz as the first argument to test that exact archive.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { chromium, firefox } = require("playwright");
const { skinNames, runSkinChecks } = require("./skins");
const { runMarkdownSmoke } = require("./markdown");
const { checkDocumentation } = require("./release-docs");

const ROOT = path.resolve(__dirname, "..");
const ARCHIVE = process.argv[2] ? path.resolve(process.argv[2]) : null;
const TEMP = fs.mkdtempSync(path.join(os.tmpdir(), "lightmetal-package-"));
const bundles = [
  "lightmetal.js", "lightmetal.min.js", "lightmetal.esm.js",
  "lightmetal.css", "lightmetal.min.css",
  "maiden.js", "maiden.min.js", "maiden.esm.js",
  "maiden.css", "maiden.min.css",
  "MeltDown.js", "MeltDown.min.js", "MeltDown.esm.js",
  "polish.js", "polish.min.js", "polish.esm.js", "polish.css", "polish.min.css",
  "etch.js", "etch.min.js", "etch.esm.js", "etch.css", "etch.min.css",
  ...skinNames.flatMap((name) => [`skins/${name}.css`, `skins/${name}.min.css`])
];

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8" });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout;
}

async function runSourceHighlightSmoke(page) {
  const result = await page.evaluate(() => {
    const source = '```\nconst answer = 42;\n```\n\nInline `const n = 1;`';
    const element = __markdownEditor.element;
    __markdownEditor.destroy();
    window.__markdownEditor = __initMarkdown({ element, sourceHighlight: __polish.highlightTokens });
    __markdownEditor.setMarkdown(source);
    const keywords = [...__markdownEditor.element.querySelectorAll('.lightmarkdown-paint .keyword')].filter(node => !node.closest('[hidden]'));
    return { source: __markdownEditor.getMarkdown(), expected: source,
      keywords: keywords.map(node => node.textContent), color: getComputedStyle(keywords[0]).color };
  });
  assert.equal(result.source, result.expected);
  assert.deepEqual(result.keywords, ['const', 'const']);
  assert.equal(result.color, 'rgb(207, 34, 46)');
  const point = await page.evaluate(() => {
    __markdownEditor.setMarkdown('- [ ] Packaged task');
    const node = __markdownEditor.content.firstChild.firstChild, range = document.createRange();
    range.setStart(node, 3); range.setEnd(node, 4);
    const rect = range.getBoundingClientRect();
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  });
  await page.mouse.click(point.x, point.y);
  assert.equal(await page.evaluate(() => __markdownEditor.getMarkdown()), '- [x] Packaged task');
  await page.keyboard.press('Control+z');
  assert.equal(await page.evaluate(() => __markdownEditor.getMarkdown()), '- [ ] Packaged task');
}

async function main() {
  let server;
  try {
    const packResult = JSON.parse(run("npm", [
      "pack", ...(ARCHIVE ? [ARCHIVE] : []), "--ignore-scripts", "--json", "--pack-destination", TEMP
    ], ROOT));
    // npm 12 keys results by package name; older versions return an array.
    const [packed] = Array.isArray(packResult) ? packResult : Object.values(packResult);
    const files = packed.files.map((file) => file.path).sort();
    const polishSources = fs.readdirSync(path.join(ROOT, 'src/polish'), { recursive: true }).filter(name => name.endsWith('.js')).map(name => 'src/polish/' + name);
    const etchSources = fs.readdirSync(path.join(ROOT, 'src/etch'), {recursive:true}).filter(name => name.endsWith('.js')).map(name => 'src/etch/' + name);
    assert.equal(etchSources.length, 48, 'Review the Etch source allowlist when adding modules');
    assert.equal(polishSources.length, 69, 'Review the poliSH source allowlist when adding modules');
    assert.deepEqual(files, [
      ...['react', 'vue'].flatMap(framework => ['index.js', 'package.json', 'README.md', 'LICENSE'].map(name => `adapters/${framework}/${name}`)),
      "CHANGELOG.md", "LICENSE", "README.md", "package.json", "ligHTMetaL.png", "docs/reference.md", "docs/frameworks.md", "docs/MeltDown.md", "docs/poliSH.md", "docs/specs/polish-spec.md",
      'docs/Etch.md', 'docs/etch-maintenance.md', 'docs/etch-security-review.md', 'docs/etch-future-work.md', 'docs/etch-verification.md', 'docs/etch-svg-fallback-audit.md', 'docs/specs/etch-spec.md', 'src/etch.js', 'src/etch.css', ...etchSources,
      'src/polish.js', 'src/polish-full.js', 'src/polish-languages.js', 'src/polish.css', ...polishSources,
      "src/MeltDown.js", "src/lightmetal.js", "src/lightmetal.css", "src/maiden.js", "src/maiden.css", "src/markdown-preview.js", "src/markdown-source-highlight.js", "src/toolbar-groups.js", "src/html-formatting.js", "src/html-toolbar-overflow.js",
      ...skinNames.map((name) => `src/skins/${name}.css`),
      ...bundles.map((name) => `dist/${name}`)
    ].sort(), "Unexpected package contents");

    fs.writeFileSync(path.join(TEMP, "package.json"), JSON.stringify({
      name: "lightmetal-package-test", version: "1.0.0", private: true
    }));
    run("npm", [
      "install", ARCHIVE || path.join(TEMP, packed.filename), "--ignore-scripts",
      "--offline", "--no-audit", "--no-fund", "--package-lock=false"
    ], TEMP);

    const installed = path.join(TEMP, "node_modules/lightmetal");
    const metadata = JSON.parse(fs.readFileSync(path.join(installed, "package.json")));
    assert.equal(metadata.version, JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"))).version);
    assert.deepEqual(checkDocumentation({ metadata, documents: Object.fromEntries(
      files.filter(file => /\.(?:md|txt)$/i.test(file)).map(file => [file, fs.readFileSync(path.join(installed, file), 'utf8')])
    ) }), [], 'Installed release documentation must match the archive version');
    assert.equal(Object.keys(metadata.dependencies || {}).length, 0);
    assert.deepEqual(metadata.peerDependenciesMeta, { react: { optional: true }, vue: { optional: true } });
    for (const framework of ['react', 'react-dom', 'vue']) {
      assert.equal(fs.existsSync(path.join(TEMP, 'node_modules', framework)), false, `Bare install must not install ${framework}`);
    }
    for (const hook of ["preinstall", "install", "postinstall", "prepare", "prepack", "postpack"]) {
      assert.equal(metadata.scripts?.[hook], undefined, `Unexpected ${hook} hook`);
    }
    for (const name of bundles) {
      assert.deepEqual(
        fs.readFileSync(path.join(installed, "dist", name)),
        fs.readFileSync(path.join(ROOT, "dist", name)),
        `${name} differs from the release bundle`
      );
    }

    assert.match(fs.readFileSync(path.join(installed, "README.md"), "utf8"), /src="https:\/\/cdn\.jsdelivr\.net\/npm\/lightmetal@latest\/ligHTMetaL\.png"/);
    assert.deepEqual(
      fs.readFileSync(path.join(installed, "ligHTMetaL.png")),
      fs.readFileSync(path.join(ROOT, "ligHTMetaL.png")),
      "README logo differs from the source asset"
    );

    // Verify the README's bundler imports with the project's existing esbuild.
    fs.writeFileSync(path.join(TEMP, "entry.js"), `
      import { init } from "lightmetal/dist/lightmetal.esm.js";
      import "lightmetal/dist/lightmetal.css";
      import "lightmetal/dist/skins/frost.css";
      import { init as initMarkdown } from "lightmetal/dist/maiden.esm.js";
      import "lightmetal/dist/maiden.css";
      import {createEtch} from 'lightmetal/dist/etch.esm.js';
      import 'lightmetal/dist/etch.css';
      window.__createEtch = createEtch;
      import { createHighlighter } from 'lightmetal/src/polish.js';
      import javascript from 'lightmetal/src/polish/languages/javascript.js';
      import 'lightmetal/dist/polish.css';
      window.__polish = createHighlighter({ languages: [javascript] });
      const markdownElement = document.getElementById("markdown-editor");
      markdownElement.classList.add("lightmetal-frost");
      window.__initMarkdown = initMarkdown;
      window.__markdownEditor = initMarkdown({ element: markdownElement });
      const element = document.getElementById("editor");
      element.classList.add("lightmetal-frost");
      window.__editor = init({ element });
    `);
    run(path.join(ROOT, "node_modules/.bin/esbuild"), [
      "entry.js", "--bundle", "--outfile=consumer.js", "--platform=browser"
    ], TEMP);

    server = http.createServer((req, res) => {
      const url = new URL(req.url, "http://localhost");
      if (url.pathname === "/") {
        const mode = url.searchParams.get("mode");
        const prefix = "/node_modules/lightmetal/dist/";
        if (url.searchParams.has('etch')) {
          const script = mode === 'esm' ? `<script type="module">import {createEtch} from '${prefix}etch.esm.js';window.__etch=createEtch(document.getElementById('etch'));</script>` : `<script src="${prefix}etch${mode === 'min' ? '.min' : ''}.js"></script><script>window.__etch=etch.createEtch(document.getElementById('etch'));</script>`;
          res.setHeader('Content-Type','text/html');
          res.end(`<!doctype html><link rel="stylesheet" href="${prefix}etch${mode === 'min' ? '.min' : ''}.css"><div id="etch" style="width:800px;height:500px"></div>${script}`);
          return;
        }
        if (url.searchParams.has('polish')) {
          const script = mode === 'esm' ? `<script type="module">
            import { createHighlighter, allLanguages } from '${prefix}polish.esm.js';
            window.__polish = createHighlighter({ languages: allLanguages });
          </script>` : `<script src="${prefix}polish${mode === 'min' ? '.min' : ''}.js"></script>
            <script>window.__polish = polish.createHighlighter({ languages: polish.allLanguages });</script>`;
          res.setHeader('Content-Type', 'text/html');
          res.end(`<!doctype html><link rel="stylesheet" href="${prefix}polish${mode === 'min' ? '.min' : ''}.css"><pre class="code theme-light"><code id="polish-code"></code></pre>${script}`);
          return;
        }
        if (url.searchParams.has("markdown")) {
          const min = mode === "min";
          const script = mode === "esm" ? `<script type="module">
            import { init } from "${prefix}maiden.esm.js";
            import { createHighlighter, allLanguages } from "${prefix}polish.esm.js";
            window.__initMarkdown = init;
            window.__polish = createHighlighter({ languages: allLanguages });
            window.__markdownEditor = init({ element: document.getElementById("editor") });
          </script>` : `<script src="${prefix}maiden${min ? ".min" : ""}.js"></script>
            <script src="${prefix}polish${min ? ".min" : ""}.js"></script>
            <script>window.__initMarkdown = maiden.init;
              window.__polish = polish.createHighlighter({ languages: polish.allLanguages });
              window.__markdownEditor = maiden.init({ element: document.getElementById("editor") });</script>`;
          res.setHeader("Content-Type", "text/html");
          res.end(`<!doctype html><link rel="stylesheet" href="${prefix}lightmetal${min ? ".min" : ""}.css">
            <link rel="stylesheet" href="${prefix}maiden${min ? ".min" : ""}.css">
            <link rel="stylesheet" href="${prefix}polish${min ? ".min" : ""}.css">
            <div id="editor" class="lightmetal"></div>${script}`);
          return;
        }
        const css = mode === "bundler" ? "/consumer.css" :
          prefix + (mode === "min" ? "lightmetal.min.css" : "lightmetal.css");
        let script;
        if (mode === "esm") {
          script = `<script type="module">
            import { init } from "${prefix}lightmetal.esm.js";
            window.__editor = init({ element: document.getElementById("editor") });
          </script>`;
        } else if (mode === "bundler") {
          script = '<script src="/consumer.js"></script>';
        } else {
          script = `<script src="${prefix}${mode === "min" ? "lightmetal.min.js" : "lightmetal.js"}"></script>
            <script>window.__editor = lightmetal.init({ element: document.getElementById("editor") });</script>`;
        }
        res.setHeader("Content-Type", "text/html");
        res.end(`<!doctype html><link rel="stylesheet" href="${css}">
          <div id="editor" class="lightmetal"></div><div id="markdown-editor"></div>${script}`);
        return;
      }
      const file = path.resolve(TEMP, "." + url.pathname);
      if (!file.startsWith(TEMP + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
        res.writeHead(404).end();
        return;
      }
      res.setHeader("Content-Type", file.endsWith(".css") ? "text/css" : "text/javascript");
      res.end(fs.readFileSync(file));
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const base = `http://127.0.0.1:${server.address().port}`;

    for (const [engine, name] of [[chromium, "chromium"], [firefox, "firefox"]]) {
      const browser = await engine.launch();
      try {
        for (const mode of ["iife", "min", "esm", "bundler"]) {
          const page = await browser.newPage();
          const errors = [];
          page.on("pageerror", (error) => errors.push(error.message));
          await page.goto(`${base}/?mode=${mode}`);
          await page.waitForFunction(() => window.__editor);
          assert.equal(await page.evaluate(() => {
            const editor = window.__editor;
            editor.setHTML("<p>Package works</p>");
            return editor.getText();
          }), "Package works");
          await page.evaluate(() => {
            const node=__editor.content; node.focus();
            const range=document.createRange(); range.selectNodeContents(node.firstElementChild);
            const selection=document.getSelection(); selection.removeAllRanges(); selection.addRange(range);
          });
          await page.locator('#editor').getByRole('button',{name:'Paragraph style',exact:true}).click();
          await page.locator('#editor').getByRole('menuitemradio',{name:'Heading 3',exact:true}).click();
          assert.equal(await page.locator('#editor .lightmetal-content h3').textContent(),'Package works');
          await page.locator('#editor').getByRole('button',{name:'Undo',exact:true}).click();
          assert.equal(await page.locator('#editor .lightmetal-content p').textContent(),'Package works');
          await page.evaluate(()=>{
            __editor.content.focus();const range=document.createRange();range.selectNodeContents(__editor.content.firstChild);
            getSelection().removeAllRanges();getSelection().addRange(range);
          });
          await page.locator('#editor').getByRole('button',{name:'Link',exact:true}).click();
          const insertion=page.locator('#editor .lightmetal-insertion-popup');
          await insertion.getByLabel('URL',{exact:true}).fill('https://example.com/package');
          await insertion.getByRole('button',{name:'Insert',exact:true}).click();
          assert.equal(await page.locator('#editor .lightmetal-content a').textContent(),'Package works');
          await page.locator('#editor').getByRole('button',{name:'Undo',exact:true}).click();
          await page.locator('#editor').getByRole('button',{name:'Image',exact:true}).click();
          await insertion.getByRole('tab',{name:'URL',exact:true}).click();
          await insertion.getByLabel('Image URL',{exact:true}).fill('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=');
          await insertion.getByLabel('Alt Text',{exact:true}).fill('Packaged image');
          await insertion.getByRole('button',{name:'Insert',exact:true}).click();
          assert.equal(await page.locator('#editor .lightmetal-content img').getAttribute('alt'),'Packaged image');
          await page.locator('#editor').getByRole('button',{name:'Undo',exact:true}).click();
          await page.locator('#editor').getByRole('button',{name:'Fullscreen',exact:true}).click();
          assert.equal(await page.locator('#editor').evaluate(node=>{const r=node.getBoundingClientRect();return Math.abs(r.x)<1&&Math.abs(r.y)<1&&Math.abs(r.width-innerWidth)<1&&Math.abs(r.height-innerHeight)<1;}),true);
          await page.keyboard.press('Escape');
          assert.equal(await page.locator('#editor').evaluate(node=>node.classList.contains('lightmetal-fullscreen')),false);
          assert.equal(await page.evaluate(() => window.__editor.insertTable(2, 2)), true);
          assert.equal(await page.locator("#editor td").count(), 4);
          await page.locator('#editor button[title="Source"]').click();
          assert.equal(await page.locator("#editor textarea").isVisible(), true);
          assert.equal(await page.evaluate(() => window.__editor.insertTable()), false);
          await page.locator('#editor button[title="Source"]').click();
          assert.equal(await page.evaluate(() =>
            getComputedStyle(window.__editor.content).height
          ), "300px", "Packaged CSS did not load");
          if (mode === "bundler") {
            await runMarkdownSmoke(page);
            await runSourceHighlightSmoke(page);
            assert.equal(await page.evaluate(() => {
              const host=document.createElement('div'); host.style.height='400px'; document.body.append(host);
              const e=window.__createEtch(host); e.setBackground('#FAF8F2');
              const background=e.save().background; e.destroy(); host.remove(); return background;
            }), '#FAF8F2');
            assert.match(await page.evaluate(() => __polish.highlight('const x = 42;', 'js')), /token keyword/);
            assert.equal(await page.evaluate(() => __polish.hasLanguage('python')), false, 'Selected-language bundle must not import the full catalog');
          }
          await page.evaluate(() => window.__editor.destroy());
          assert.equal(await page.locator("#editor").innerHTML(), "");
          assert.deepEqual(errors, []);
          await page.close();
        }
        for (const mode of ["iife", "min", "esm"]) {
          const page = await browser.newPage();
          const errors = [];
          page.on("pageerror", error => errors.push(error.message));
          await page.goto(`${base}/?markdown=1&mode=${mode}`);
          await runMarkdownSmoke(page);
          await runSourceHighlightSmoke(page);
          await page.evaluate(() => __markdownEditor.destroy());
          assert.equal(await page.locator("#editor").innerHTML(), "");
          assert.deepEqual(errors, []);
          await page.close();
        }
        for (const mode of ['iife', 'min', 'esm']) {
          const page = await browser.newPage();
          await page.goto(`${base}/?etch=1&mode=${mode}`);
          await page.waitForFunction(() => window.__etch);
          assert.deepEqual(await page.evaluate(async () => {
            const e=window.__etch;
            e.setBackground('#FAF8F2'); const saved=e.save();
            e.undo(); const undone=e.save().background;
            await e.load(saved);
            const result={version:e.save().version, background:e.save().background, undone};
            e.destroy(); e.destroy(); return result;
          }), {version:1,background:'#FAF8F2',undone:null});
          await page.goto(`${base}/?polish=1&mode=${mode}`);
          await page.waitForFunction(() => window.__polish);
          const result = await page.evaluate(() => {
            const code = document.getElementById('polish-code');
            code.innerHTML = __polish.highlight('const value = 42;', 'js');
            return { color: getComputedStyle(code.querySelector('.token.keyword')).color,
              text: code.textContent, python: __polish.hasLanguage('python'),
              escaped: __polish.highlight('<img onerror=alert(1)>', 'unknown'),
              ansi: __polish.highlight('\u001b[31mred\u001b[0m', 'ansi') };
          });
          assert.equal(result.text, 'const value = 42;');
          assert.equal(result.color, 'rgb(207, 34, 46)');
          assert.equal(result.python, true);
          assert.match(result.escaped, /&lt;img/);
          assert.match(result.ansi, /color:rgb/);
          await page.close();
        }
        await runSkinChecks(browser, `${base}/?mode=iife`, `${base}/node_modules/lightmetal/dist/`);
      } finally {
        await browser.close();
      }
      console.log(`package ${name}: HTML + Markdown + poliSH + Etch IIFE/minified/ESM/bundler, ${skinNames.length} skins (plain/minified) ok`);
    }
    console.log(`package ${metadata.version}: ${files.length} files; script-free install ok`);
    if (ARCHIVE) console.log(`Verified archive: ${ARCHIVE}`);
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    fs.rmSync(TEMP, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
