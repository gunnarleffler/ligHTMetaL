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

const ROOT = path.resolve(__dirname, "..");
const ARCHIVE = process.argv[2] ? path.resolve(process.argv[2]) : null;
const TEMP = fs.mkdtempSync(path.join(os.tmpdir(), "lightmetal-package-"));
const bundles = [
  "lightmetal.js", "lightmetal.min.js", "lightmetal.esm.js",
  "lightmetal.css", "lightmetal.min.css",
  "maiden.js", "maiden.min.js", "maiden.esm.js",
  "maiden.css", "maiden.min.css",
  "MeltDown.js", "MeltDown.min.js", "MeltDown.esm.js",
  ...skinNames.flatMap((name) => [`skins/${name}.css`, `skins/${name}.min.css`])
];

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8" });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout;
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
    assert.deepEqual(files, [
      "CHANGELOG.md", "LICENSE", "README.md", "package.json", "ligHTMetaL.png", "docs/MeltDown.md",
      "src/MeltDown.js", "src/lightmetal.js", "src/lightmetal.css", "src/maiden.js", "src/maiden.css", "src/markdown-preview.js", "src/toolbar-groups.js",
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
    assert.equal(Object.keys(metadata.dependencies || {}).length, 0);
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

    assert.match(fs.readFileSync(path.join(installed, "README.md"), "utf8"), /src="ligHTMetaL\.png"/);
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
        if (url.searchParams.has("markdown")) {
          const min = mode === "min";
          const script = mode === "esm" ? `<script type="module">
            import { init } from "${prefix}maiden.esm.js";
            window.__initMarkdown = init;
            window.__markdownEditor = init({ element: document.getElementById("editor") });
          </script>` : `<script src="${prefix}maiden${min ? ".min" : ""}.js"></script>
            <script>window.__initMarkdown = maiden.init;
              window.__markdownEditor = maiden.init({ element: document.getElementById("editor") });</script>`;
          res.setHeader("Content-Type", "text/html");
          res.end(`<!doctype html><link rel="stylesheet" href="${prefix}lightmetal${min ? ".min" : ""}.css">
            <link rel="stylesheet" href="${prefix}maiden${min ? ".min" : ""}.css">
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
          assert.equal(await page.evaluate(() => window.__editor.insertTable(2, 2)), true);
          assert.equal(await page.locator("#editor td").count(), 4);
          await page.locator('#editor button[title="Source"]').click();
          assert.equal(await page.locator("#editor textarea").isVisible(), true);
          assert.equal(await page.evaluate(() => window.__editor.insertTable()), false);
          await page.locator('#editor button[title="Source"]').click();
          assert.equal(await page.evaluate(() =>
            getComputedStyle(window.__editor.content).height
          ), "300px", "Packaged CSS did not load");
          if (mode === "bundler") await runMarkdownSmoke(page);
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
          await page.evaluate(() => __markdownEditor.destroy());
          assert.equal(await page.locator("#editor").innerHTML(), "");
          assert.deepEqual(errors, []);
          await page.close();
        }
        await runSkinChecks(browser, `${base}/?mode=iife`, `${base}/node_modules/lightmetal/dist/`);
      } finally {
        await browser.close();
      }
      console.log(`package ${name}: HTML + Markdown IIFE/minified/ESM/bundler, ${skinNames.length} skins (plain/minified) ok`);
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
