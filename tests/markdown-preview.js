const assert = require("node:assert/strict");
async function previewChecks(browser, base, name) {
  const page = await browser.newPage();
  const errors = [], requests = []; let monitor = false;
  page.on("pageerror", error => errors.push(error.message));
  page.on("request", request => { if (monitor) requests.push(request.url()); });
  try {
    await page.goto(base + "/tests/fixtures/markdown.html");
    await page.waitForFunction(() => window.__markdownEditor);
    await page.evaluate(() => {
      __markdownEditor.destroy(); window.__renders = []; window.__changes = [];
      window.__markdownEditor = __initMarkdown({ element: document.getElementById("editor"),
        preview: { render(source) { __renders.push(source); return window.__render ? __render(source) : '<h2>Hello</h2><p><strong>world</strong></p>'; } },
        onChange: text => __changes.push(text) });
      __markdownEditor.setMarkdown("## Hello\n**world**");
      const source = __markdownEditor.content; source.focus(); getSelection().collapse(source.firstChild.firstChild, 3);
      window.__sourceNode = source.firstChild; window.__before = __changes.length;
    });
    monitor = true;
    const button = page.getByRole("button", { name: "Preview", exact: true });
    const preview = page.getByRole("region", { name: "Markdown preview" });
    await button.click(); await preview.locator("h2").waitFor();
    assert.equal(await preview.locator("strong").textContent(), "world");
    assert.equal(await button.getAttribute("aria-pressed"), "true");
    assert.equal(await page.getByRole("button", { name: "Bold", exact: true }).isDisabled(), true);
    await button.click();
    assert.equal(await page.evaluate(() => document.activeElement === __markdownEditor.content && getSelection().focusOffset === 3 && __markdownEditor.content.firstChild === __sourceNode && __changes.length === __before), true);
    await page.evaluate(() => { window.__render = () => '<script>window.__bad = true</script><img src="https://example.invalid/image" alt="photo"><iframe src="https://example.invalid/frame"></iframe><a href="javascript:alert(1)" onclick="alert(1)">bad</a><pre><code class="hljs evil"><span class="hljs-keyword" style="background:url(https://example.invalid/style)">const</span></code></pre>'; });
    await button.click(); await preview.locator("code").waitFor();
    assert.equal(await preview.locator("script,img,iframe,[onclick],[style],[href]").count(), 0);
    assert.equal(await preview.locator("code").getAttribute("class"), "hljs");
    assert.equal(await preview.locator("span").getAttribute("class"), "hljs-keyword");
    assert.match(await preview.textContent(), /\[Image: photo\]/);
    await button.click();
    await page.evaluate(() => { window.__render = () => new Promise(resolve => window.__resolve = resolve); });
    await button.click();
    await page.evaluate(() => { window.__old = __resolve; __markdownEditor.setMarkdown("new"); __old("<p>stale</p>"); __resolve("<p>latest</p>"); });
    await preview.getByText("latest", { exact: true }).waitFor();
    assert.doesNotMatch(await preview.textContent(), /stale/);
    await button.click();
    await page.evaluate(() => { window.__render = () => { throw Error("renderer failure"); }; });
    await button.click(); await preview.getByText(/could not be rendered/).waitFor();
    await button.click(); assert.equal(await page.evaluate(() => __markdownEditor.getMarkdown()), "new");
    await page.evaluate(() => { window.__render = () => new Promise(resolve => window.__resolve = resolve); });
    await button.click(); await page.evaluate(() => { __markdownEditor.destroy(); __resolve("<p>late</p>"); });
    assert.equal(await page.locator(".lightmarkdown-preview").count(), 0);
    assert.deepEqual(errors, []); assert.deepEqual(requests, []);
    console.log(name + ": configured preview, source/selection/callback preservation, safe output/no resources, highlighting classes, async stale/error/destroy: ok");
  } finally { await page.close(); }
}
module.exports = { previewChecks };
