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
    await page.evaluate(() => {
      window.__largePreview = '<pre><code>' + Array(2000).fill('<span class="token keyword">const</span>').join('') + '</code></pre>spare root text';
      window.__render = () => __largePreview;
    });
    await button.click(); await preview.locator('pre:not([hidden])').waitFor();
    await page.evaluate(() => {
      const target = document.querySelector('.lightmarkdown-preview');
      window.__retainedPre = target.querySelector('pre');
      window.__retainedSpan = __retainedPre.querySelector('span');
      window.__retainedText = target.lastChild;
      window.__render = () => '<p>small</p>';
      __markdownEditor.setMarkdown('small');
    });
    await preview.getByText('small', { exact: true }).waitFor();
    assert.equal(await page.evaluate(async () => {
      let count = 0;
      const observer = new MutationObserver(records => { count += records.length; });
      observer.observe(__retainedPre, { subtree: true, attributes: true, characterData: true });
      observer.observe(__retainedText, { characterData: true });
      for (let i = 0; i < 20; i++) {
        __markdownEditor.setMarkdown('small ' + i);
        // renderPreview commits synchronous renderer results in a Promise callback.
        await Promise.resolve();
      }
      count += observer.takeRecords().length;
      observer.disconnect();
      return count;
    }), 0, 'already-cleared spare elements and Text nodes do not receive mutations');
    await page.evaluate(() => { window.__render = () => __largePreview; __markdownEditor.setMarkdown('large again'); });
    await preview.locator('pre:not([hidden])').waitFor();
    assert.equal(await page.evaluate(() => {
      const target = document.querySelector('.lightmarkdown-preview');
      return target.querySelector('pre') === __retainedPre && __retainedPre.querySelector('span') === __retainedSpan &&
        !__retainedSpan.hidden && __retainedSpan.textContent === 'const' && target.lastChild === __retainedText && __retainedText.data === 'spare root text';
    }), true, 'cleared spare nodes revive with their identity and content intact');
    await button.click();
    await page.evaluate(() => { window.__render = () => '<script>window.__bad = true</script><img src="javascript:alert(1)" alt="photo"><iframe src="https://example.invalid/frame"></iframe><a href="javascript:alert(1)" onclick="alert(1)">bad</a><pre><code class="hljs evil"><span class="hljs-keyword" style="background:url(https://example.invalid/style)">const</span></code></pre>'; });
    await button.click(); await preview.locator("code:visible").waitFor();
    assert.equal(await preview.locator("script,img,iframe,[onclick],[style],[href]").count(), 0);
    assert.equal(await preview.locator("code:visible").getAttribute("class"), "hljs");
    assert.equal(await preview.locator("span:visible").getAttribute("class"), "hljs-keyword");
    assert.match(await preview.textContent(), /\[Image: photo\]/);
    await button.click();
    await page.evaluate(() => { window.__render = () => '<pre><code><span class="token keyword evil" style="color:red" onclick="alert(1)">const</span><span class="keyword">plain</span><span class="token madeup">unknown</span></code></pre>'; });
    await button.click();
    assert.equal(await preview.locator('span:visible').nth(0).getAttribute('class'), 'token keyword');
    assert.equal(await preview.locator('span:visible').nth(1).getAttribute('class'), null);
    assert.equal(await preview.locator('span:visible').nth(2).getAttribute('class'), 'token');
    assert.equal(await preview.locator('[style],[onclick],.evil,.madeup').count(), 0);
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
