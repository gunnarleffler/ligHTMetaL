/* ligHTMetaL::MeltDown remains optional; the MaiDEn demo supplies its renderer. */
const assert = require("node:assert/strict");
const path = require("node:path");
const { buildSync } = require("esbuild");
async function meltdownChecks(browser, base, name) {
  const page = await browser.newPage();
  const errors = [], requests = []; let monitor = false;
  page.on("pageerror", error => errors.push(error.message));
  page.on("request", request => { if (monitor) requests.push(request.url()); });
  try {
    await page.goto(base + "/tests/fixtures/markdown.html");
    await page.waitForFunction(() => window.__markdownEditor);
    for (const file of ["MeltDown.js", "MeltDown.min.js", "MeltDown.esm.js"]) {
      if (file.endsWith(".esm.js")) {
        await page.evaluate(async url => { window.__meltParse = (await import(url)).parse; }, base + "/dist/" + file);
      } else {
        await page.addScriptTag({ url: base + "/dist/" + file });
        await page.evaluate(() => { window.__meltParse = meltDown.parse; });
      }
      assert.equal(await page.evaluate(() => __meltParse("# Hello")), '<h1 id="hello">Hello</h1>');
      assert.equal(await page.evaluate(() => __meltParse('<script>alert(1)</script>').includes('<script>')), false);
      const headings = await page.evaluate(() => ['# `<tag>`', '# <tag>', '# Caf&#233;', '# Caf&eacute;'].map(source => {
        const output = document.createElement('div'); output.innerHTML = __meltParse(source);
        const heading = output.querySelector('h1');
        return { id: heading.id, text: heading.textContent };
      }));
      assert.deepEqual(headings, [
        { id: 'tag', text: '<tag>' }, { id: 'tag', text: '<tag>' },
        { id: 'café', text: 'Café' }, { id: 'caf', text: 'Café' }
      ], file + ': heading IDs distinguish literal text and the documented entity policy');
      assert.deepEqual(await page.evaluate(() => {
        const output = document.createElement('div');
        output.innerHTML = __meltParse('_Visit https://example.com/a_b_');
        return { italic: !!output.querySelector('em'), href: output.querySelector('a').getAttribute('href'), text: output.textContent };
      }), { italic: true, href: 'https://example.com/a_b', text: 'Visit https://example.com/a_b' });
    }
    for (const mode of ["inline", "iframe"]) {
      monitor = false;
      await page.goto(base + (mode === "iframe" ? "/examples/markdown-iframe.html" : "/examples/markdown.html"));
      if (mode === "iframe") await page.waitForFunction(() => !document.getElementById("read-markdown").disabled);
      else await page.waitForFunction(() => window.__markdownEditor);
      const view = mode === "iframe" ? page.frames().find(frame => frame.parentFrame() === page.mainFrame()) : page;
      await view.evaluate(() => {
        __markdownEditor.setMarkdown('# MeltDown\n\n**Hello** and ~~goodbye~~.\n\n- [x] Done\n\n| A | B |\n| --- | --- |\n| one | two |\n\n```js\nconst answer = 42;\n```\n\n<img src="https://example.invalid/html">\n\n![photo](https://example.invalid/photo.png)');
        const source = __markdownEditor.content; source.focus();
        source.ownerDocument.getSelection().collapse(source.firstChild.firstChild, 2);
        window.__meltNodes = Array.from(source.childNodes); window.__meltText = __markdownEditor.getMarkdown();
      });
      monitor = true;
      const preview = view.getByRole("region", { name: "Markdown preview" });
      const button = view.getByRole("button", { name: "Preview", exact: true });
      await button.click(); await preview.getByRole("heading", { name: "MeltDown", exact: true }).waitFor();
      assert.equal(await preview.locator("strong").textContent(), "Hello");
      assert.equal(await preview.locator("table tbody td").count(), 2);
      assert.match(await preview.textContent(), /☑\s+Done/);
      assert.match(await preview.textContent(), /<img src=/);
      assert.equal(await preview.locator("img,script,iframe,input").count(), 0);
      assert.match(await preview.textContent(), /\[Image: photo\]/);
      await button.click();
      assert.equal(await view.evaluate(() => __markdownEditor.getMarkdown() === __meltText && __meltNodes.every((node, i) => node === __markdownEditor.content.childNodes[i]) && __markdownEditor.content.ownerDocument.getSelection().focusOffset === 2), true);
    }
    monitor = false;
    await page.goto(base + "/tests/fixtures/markdown.html");
    await page.waitForFunction(() => window.__markdownEditor);
    const adapter = buildSync({ entryPoints: [path.join(__dirname, "fixtures/meltdown-highlight.js")], bundle: true, format: "iife", globalName: "testHighlight", write: false }).outputFiles[0].text;
    await page.addScriptTag({ content: adapter });
    await page.evaluate(() => {
      __markdownEditor.destroy();
      window.__markdownEditor = __initMarkdown({ element: document.getElementById("editor"), preview: { render: testHighlight.render } });
      __markdownEditor.setMarkdown('```js\nconst answer = 42;\n```\n\n```bash\necho "hello"\n```\n\n```unknown\n<tag>\n```');
    });
    monitor = true;
    await page.getByRole("button", { name: "Preview", exact: true }).click();
    const highlighted = page.getByRole("region", { name: "Markdown preview" });
    await highlighted.locator(".token.keyword").first().waitFor();
    assert.ok(await highlighted.locator(".language-bash span").count() > 0);
    assert.equal(await highlighted.locator(".language-unknown").textContent(), "<tag>");
    assert.equal(await highlighted.locator(".language-unknown span").count(), 0);
    assert.deepEqual(errors, []); assert.deepEqual(requests, []);
    console.log(name + ": ligHTMetaL::MeltDown standalone/minified/ESM, MaiDEn standard/optional iframe preview, inert output/no requests and source restoration: ok");
  } finally { await page.close(); }
}
module.exports = { meltdownChecks };
