/* Prompt-free image insertion and recognized source-URL selection. */
const assert = require("node:assert/strict");

async function imageChecks(browser, base, name) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  const errors = [], requests = [];
  let monitor = false;
  page.on("pageerror", error => errors.push(error.message));
  page.on("request", request => { if (monitor) requests.push(request.url()); });
  try {
    await page.goto(base + "/tests/fixtures/markdown.html");
    await page.waitForFunction(() => window.__markdownEditor);
    const defaultImage = page.getByRole("button", { name: "Image", exact: true });
    assert.equal(await defaultImage.count(), 1, "image belongs to the default toolbar");
    assert.equal(await defaultImage.getAttribute("aria-keyshortcuts"), null, "no new default shortcut");
    assert.deepEqual(await page.locator('#editor button').evaluateAll(nodes => nodes.slice(-7).map(node => node.getAttribute("aria-label"))), ["Link", "Image", "Table", "Undo", "Redo", "Fullscreen", "Help"]);
    await defaultImage.click();
    assert.equal(await page.evaluate(() => __markdownEditor.getMarkdown()), "![image](https://www.example.com/image.png)");
    assert.equal(await page.evaluate(() => getSelection().toString()), "https://www.example.com/image.png");
    assert.equal(await page.evaluate(() => __markdownChanges.length), 1);
    await page.keyboard.press("Control+z"); assert.equal(await page.evaluate(() => __markdownEditor.getMarkdown()), "");
    const mount = options => page.evaluate(options => {
      __markdownEditor.destroy(); window.__markdownChanges = [];
      window.__markdownEditor = __initMarkdown({ element: document.getElementById("editor"), actions: ["image", "undo", "redo"],
        shortcuts: { image: "Alt+Shift+m" }, ...options, onChange: value => __markdownChanges.push(value) });
      window.prompt = () => { throw new Error("Unexpected image prompt"); };
    }, options);
    await mount({ actions: ["bold"], shortcuts: false });
    assert.equal(await page.getByRole("button", { name: "Image", exact: true }).count(), 0, "explicit actions can omit image");
    await mount({}); monitor = true;
    const source = page.locator("#editor .lightmarkdown-input");
    const button = () => page.getByRole("group", { name: "Markdown formatting" }).getByRole("button", { name: "Image", exact: true });
    const get = () => page.evaluate(() => __markdownEditor.getMarkdown());
    const count = () => page.evaluate(() => __markdownChanges.length - __imageBefore);
    const prepare = (text, start = 0, end = text.length, shape = "blocks") => page.evaluate(({ text, start, end, shape }) => {
      const api = __markdownEditor; api.setMarkdown(text); const source = api.content;
      if (shape !== "blocks") {
        const block = document.createElement("div");
        if (shape === "lf") block.append(document.createTextNode(text));
        else text.split("\n").forEach((line, index) => {
          if (index) block.append(document.createElement("br"));
          const span = document.createElement("span"); span.append(document.createTextNode(line)); block.append(span);
        });
        block.append(document.createElement("br")); source.replaceChildren(block);
        source.dispatchEvent(new Event("input", { bubbles: true }));
      }
      function point(position) {
        if (shape === "lf") return [source.firstChild.firstChild, position];
        const before = text.slice(0, position).split("\n"), line = before.length - 1, column = before[line].length;
        const node = shape === "br" ? source.querySelectorAll("span")[line].firstChild : source.children[line].firstChild;
        return node.nodeName === "BR" ? [node.parentNode, 0] : [node, column];
      }
      const range = document.createRange(); range.setStart(...point(start)); range.setEnd(...point(end));
      source.focus(); getSelection().removeAllRanges(); getSelection().addRange(range);
      source.dispatchEvent(new Event("focus")); window.__imageBefore = __markdownChanges.length;
    }, { text, start, end, shape });
    const placeholder = "https://www.example.com/image.png";
    const image = url => `![image](${url})`;
    const urls = ["https://example.com/photo.png", "http://example.com/photo.jpg", "//cdn.example.com/a.webp", "photo.png", "../assets/a.png",
      "/assets/a.png", "www.example.com/a.png", "🦊.png", "a%20b.png", "a[b].png", "https://example.com/a?x=1&y=2",
      "javascript&colon;alert.png", "a\\b.png", "a<b>.png", "photo (large).png", "https://example.com/photo(1).png"];
    for (const shape of ["blocks", "lf", "br"]) {
      for (const url of urls) {
        await prepare(url, 0, url.length, shape);
        const escaped = url.replace(/[\\<>&]/g, "\\$&"), destination = /[ ()]/.test(escaped) ? `<${escaped}>` : escaped;
        assert.equal(await button().isEnabled(), true, `${name}/${shape}: ${url}`);
        await button().click(); assert.equal(await get(), image(destination), `${name}/${shape}: selected URL ${url}`);
        assert.equal(await page.evaluate(() => getSelection().toString()), escaped);
        assert.equal(await button().getAttribute("aria-pressed"), null);
        assert.equal(await count(), 1); assert.equal(await button().isEnabled(), true, "existing destination can be reselected");
        await page.keyboard.press("Alt+Shift+m"); assert.equal(await count(), 1);
        assert.equal(await get(), image(destination)); assert.equal(await page.evaluate(() => getSelection().toString()), escaped);
        await page.keyboard.press("Control+z"); assert.equal(await get(), url);
        await page.keyboard.press("Control+Shift+z"); assert.equal(await get(), image(destination)); assert.equal(await count(), 3);
      }
      for (const [text, start, end, expected] of [
        ["", 0, 0, image(placeholder)], ["metal", 2, 2, "me" + image(placeholder) + "tal"],
        ["- metal", 7, 7, "- metal" + image(placeholder)], ["-", 1, 1, "- " + image(placeholder)],
        ["> -", 3, 3, "> - " + image(placeholder)], ["#", 1, 1, "# " + image(placeholder)],
        ["- [X]", 5, 5, "- [X] " + image(placeholder)], [">", 1, 1, ">" + image(placeholder)],
        ["- >", 3, 3, "- >" + image(placeholder)],
        ["before photo.png after", 7, 16, "before " + image("photo.png") + " after"],
        [">\tphoto.png", 2, 11, ">\t" + image("photo.png")],
        ["- [X] photo.png", 6, 15, "- [X] " + image("photo.png")],
        ["  photo.png  ", 0, 13, image("photo.png")]
      ]) {
        await prepare(text, start, end, shape); assert.equal(await button().isEnabled(), true);
        await page.keyboard.press("Alt+Shift+m"); assert.equal(await get(), expected, `${name}/${shape}: ${JSON.stringify(text)}`);
        assert.equal(await count(), 1); await page.keyboard.press("Control+z"); assert.equal(await get(), text);
        await page.keyboard.press("Control+Shift+z"); assert.equal(await get(), expected);
      }
      for (const [text, url] of [
        ['![alt](photo.png "title")', 'photo.png'], ['![alt](<photo (large).png> \'title\')', 'photo (large).png'],
        ['![alt](a\\\\b.png?x=1\\&y=2)', 'a\\\\b.png?x=1\\&y=2'], ['![🦊 **alt**](🦊.png)', '🦊.png'],
        ['![alt]()', ''], ['![alt](<> "title")', ''], ['![alt](data:image/png;base64,AAAA)', 'data:image/png;base64,AAAA'],
        ['![]()', ''], ['![](photo.png)', 'photo.png'], ['![alt](a&amp;b.png)', 'a&amp;b.png'],
        ['## ![alt](photo.png)', 'photo.png'], ['![alt](photo.png)\n---', 'photo.png'],
        ['> - [X] ![alt](photo.png "title")', 'photo.png'], ['>\t![alt](photo.png)', 'photo.png'],
        ['1. >\t![alt](photo.png)', 'photo.png'], ['> - first\n>   ![alt](photo.png)', 'photo.png'],
        ['- parent\n    > ![alt](photo.png)', 'photo.png'], ['before ![alt\ncontinued](photo.png) after', 'photo.png'],
        ['> ![alt](\n>   <photo (large).png>\n>   "title")', 'photo (large).png'],
        ['[![alt](photo.png)](outer)', 'photo.png'], ['![![inner](inner.png)](outer.png)', 'outer.png']
      ]) {
        const imageStart = text.indexOf('!['), imageEnd = text.lastIndexOf(')') + 1;
        const positions = [[imageStart + 1, imageStart + 1], [imageStart, text.startsWith('[!') ? text.indexOf(')]') + 1 : imageEnd]];
        const urlStart = url ? text.indexOf(url) : text.indexOf('(') + (text.includes('<>') ? 2 : 1);
        positions.push([urlStart, urlStart], [urlStart, urlStart + url.length]);
        if (text.includes('title')) positions.push([text.indexOf('title') + 2, text.indexOf('title') + 2]);
        for (const [start, end] of positions) {
          await prepare(text, start, end, shape);
          await page.evaluate(() => {
            const source = __markdownEditor.content, walker = document.createTreeWalker(source, NodeFilter.SHOW_ALL);
            window.__imageNodes = []; while (walker.nextNode()) __imageNodes.push(walker.currentNode);
            window.__imageHTML = source.innerHTML;
          });
          const history = await source.evaluate(() => [document.queryCommandEnabled('undo'), document.queryCommandEnabled('redo')]);
          assert.equal(await button().isEnabled(), true, `${name}/${shape}: existing ${JSON.stringify([text, start, end])}`);
          await button().click();
          assert.equal(await get(), text); assert.equal(await count(), 0);
          assert.equal(await page.evaluate(() => getSelection().toString()), url);
          assert.equal(await source.evaluate(node => node === node.ownerDocument.activeElement), true);
          assert.equal(await page.evaluate(() => {
            const source = __markdownEditor.content, walker = document.createTreeWalker(source, NodeFilter.SHOW_ALL), nodes = [];
            while (walker.nextNode()) nodes.push(walker.currentNode);
            return source.innerHTML === __imageHTML && nodes.length === __imageNodes.length && nodes.every((node, index) => node === __imageNodes[index]);
          }), true, 'selection does not rewrite the editing DOM');
          assert.deepEqual(await source.evaluate(() => [document.queryCommandEnabled('undo'), document.queryCommandEnabled('redo')]), history);
          await page.keyboard.press('Alt+Shift+m'); assert.equal(await get(), text); assert.equal(await count(), 0);
          assert.equal(await page.evaluate(() => getSelection().toString()), url);
        }
      }
      const nested = '![![inner](inner.png)](outer.png)', caret = nested.indexOf('inner') + 1;
      await prepare(nested, caret, caret, shape); await button().click();
      assert.equal(await page.evaluate(() => getSelection().toString()), 'inner.png');
      assert.equal(await get(), nested); assert.equal(await count(), 0);
      const adjacent = 'before ![alt](old.png) after';
      for (const at of [adjacent.indexOf('!['), adjacent.indexOf(')') + 1]) {
        await prepare(adjacent, at, at, shape); await button().click();
        assert.equal(await get(), adjacent.slice(0, at) + image(placeholder) + adjacent.slice(at));
        assert.equal(await count(), 1); await page.keyboard.press('Control+z'); assert.equal(await get(), adjacent);
      }
      for (const [text, start, end = start] of [
        ["first\nsecond", 0, 12], ["```\nliteral\n```", 7], ["    literal", 7], ["<div>\nliteral\n</div>", 9],
        ["`literal`", 4], ["literal <b>text</b>", 10], ["> text", 1], ["- [x] text", 4], ["## heading", 1],
        ["[label](photo.png)", 3], ["[label](photo.png)", 0, 18],
        ["before ![alt](photo.png) after", 6, 12], ["before ![alt](photo.png) after", 10, 25],
        ["![alt](photo.png) ![other](two.png)", 0, 33], ["`![alt](photo.png)`", 5],
        ["![ref][id]\n\n[id]: photo.png", 3], ["![ref][]\n\n[ref]: photo.png", 3], ["![ref]\n\n[ref]: photo.png", 3],
        ["> ![alt\n> next](photo.png)", 9],
        ["[ref]\n\n[ref]: photo.png", 2], ["[ref]: photo.png", 8], ["<https://example.com/a.png>", 0, 27],
        ["https://example.com/a.png", 8, 19]
      ]) {
        await prepare(text, start, end, shape); assert.equal(await button().isDisabled(), true, `${name}/${shape}: protected ${text}`);
        await button().evaluate(node => node.click()); await page.keyboard.press("Alt+Shift+m");
        assert.equal(await get(), text); assert.equal(await count(), 0);
      }
    }
    for (const text of ["javascript:alert(1)", "data:image/png;base64,AAAA", "blob:https://example.com/id", "file:///tmp/a.png", "mailto:user@example.com", "ftp://example.com/a.png", "https://", "https://exa\tmple.com/a.png", "  "]) {
      await prepare(text); const history = await source.evaluate(() => [document.queryCommandEnabled("undo"), document.queryCommandEnabled("redo")]);
      await button().click(); assert.equal(await get(), text); assert.equal(await count(), 0);
      assert.match(await page.getByRole("status").textContent(), /HTTP\(S\).*relative/);
      assert.deepEqual(await source.evaluate(() => [document.queryCommandEnabled("undo"), document.queryCommandEnabled("redo")]), history);
    }
    for (const text of ["-\t\n  # child", "- \n  [x] task"]) {
      await prepare(text, 2, 2); await button().click(); assert.equal(await get(), text); assert.equal(await count(), 0);
      assert.match(await page.getByRole("status").textContent(), /surrounding Markdown/);
    }
    await prepare("photo.png\n\nuntouched", 0, 9);
    await page.evaluate(() => { window.__tail = __markdownEditor.content.lastChild; });
    await button().focus(); await page.keyboard.press("Enter");
    assert.equal(await get(), image("photo.png") + "\n\nuntouched"); assert.equal(await count(), 1);
    assert.equal(await page.evaluate(() => __tail === __markdownEditor.content.lastChild), true);
    await prepare('![alt](<photo (large).png> "title")', 3, 3);
    await button().focus(); await page.keyboard.press('Enter'); await page.keyboard.type('new.png');
    assert.equal(await get(), '![alt](<new.png> "title")'); assert.equal(await count(), 'new.png'.length);
    await page.keyboard.press('Control+z'); assert.equal(await get(), '![alt](<photo (large).png> "title")');
    await page.keyboard.press('Control+Shift+z'); assert.equal(await get(), '![alt](<new.png> "title")');
    await prepare('![alt]()', 3, 3); await button().click(); await page.keyboard.type('new.png');
    assert.equal(await get(), '![alt](new.png)'); assert.equal(await count(), 'new.png'.length);
    await page.keyboard.press('Control+z'); assert.equal(await get(), '![alt]()');
    await prepare("photo.png"); await button().click(); await page.keyboard.press('Alt+Shift+m'); await page.keyboard.type("new.png");
    assert.equal(await get(), image("new.png")); assert.equal(await count(), 1 + "new.png".length);
    await page.keyboard.press("Control+z"); assert.equal(await get(), image("photo.png"));
    await page.keyboard.press("Control+z"); assert.equal(await get(), "photo.png");
    await prepare("photo.png"); await source.dispatchEvent("compositionstart");
    assert.equal(await button().isDisabled(), true); await page.keyboard.press("Alt+Shift+m"); assert.equal(await count(), 0);
    await source.dispatchEvent("compositionend");
    await prepare('![alt](photo.png)', 3, 3); await source.dispatchEvent('compositionstart');
    assert.equal(await button().isDisabled(), true); await page.keyboard.press('Alt+Shift+m'); assert.equal(await count(), 0);
    await source.dispatchEvent('compositionend');
    await mount({ actions: [], shortcuts: { image: "Alt+Shift+m" } }); await prepare("photo.png");
    assert.equal(await page.locator('#editor [aria-label="Markdown formatting"]').evaluate(node => node.hidden), true);
    await page.keyboard.press("Alt+Shift+m"); assert.equal(await get(), image("photo.png")); assert.equal(await count(), 1);
    await page.keyboard.press('Alt+Shift+m'); assert.equal(await get(), image('photo.png')); assert.equal(await count(), 1);
    assert.equal(await page.evaluate(() => getSelection().toString()), 'photo.png');
    await page.evaluate(() => {
      __markdownEditor.destroy(); window.__customImages = 0;
      window.__markdownEditor = __initMarkdown({ element: document.getElementById("editor"), actions: [{ name: "image", state: () => true, result: () => __customImages++ }],
        onChange: value => __markdownChanges.push(value) });
    });
    await prepare("```\nliteral\n```", 7, 7); assert.equal(await button().isEnabled(), true); await button().click();
    assert.equal(await page.evaluate(() => __customImages), 1); assert.equal(await count(), 0);
    assert.equal(await button().getAttribute("aria-pressed"), "true");
    await prepare('![alt](photo.png)', 3, 3); await button().click();
    assert.equal(await page.evaluate(() => __customImages), 2); assert.equal(await count(), 0);
    assert.equal(await page.evaluate(() => getSelection().isCollapsed), true, 'custom result overrides existing-image selection');
    await page.evaluate(() => { window.__deadContent = __markdownEditor.content; __markdownEditor.destroy(); });
    assert.equal(await page.evaluate(() => !__deadContent.dispatchEvent(new KeyboardEvent("keydown", { key: "M", altKey: true, shiftKey: true, bubbles: true, cancelable: true }))), false);
    assert.equal(await page.locator("#editor img").count(), 0); monitor = false;

    for (const mode of ["whole", "surface"]) {
      await page.goto(base + (mode === "whole" ? "/examples/markdown-iframe.html" : "/examples/markdown.html?mode=isolated"));
      if (mode === "whole") {
        await page.waitForFunction(() => !document.getElementById("read-markdown").disabled);
        await page.frameLocator("#isolated-editor").locator(".lightmarkdown-input").evaluate(node => {
          const win = node.ownerDocument.defaultView, host = node.closest(".lightmarkdown"); win.__markdownEditor.destroy(); win.__imageChanges = 0;
          win.__markdownEditor = win.maiden.init({ element: host, actions: ["image", "undo", "redo"], onChange: () => win.__imageChanges++ });
          win.__markdownEditor.setMarkdown("photo.png"); win.__imageChanges = 0;
        });
      } else {
        await page.waitForFunction(() => window.__markdownEditor && __markdownMode === "isolated");
        await page.evaluate(async () => {
          __markdownEditor.destroy(); window.__imageChanges = 0;
          window.__markdownEditor = await __initMarkdownSurface({ element: document.getElementById("markdown-editor"), actions: ["image", "undo", "redo"], onChange: () => __imageChanges++ });
          __markdownEditor.setMarkdown("photo.png"); window.__imageChanges = 0;
        });
      }
      const view = page.frameLocator(mode === "whole" ? "#isolated-editor" : ".lightmarkdown-surface-frame");
      const input = view.locator(".lightmarkdown-input"), bar = (mode === "whole" ? view : page).getByRole("group", { name: "Markdown formatting" });
      const read = () => mode === "whole" ? input.evaluate(node => node.ownerDocument.defaultView.__markdownEditor.getMarkdown()) : page.evaluate(() => __markdownEditor.getMarkdown());
      await input.evaluate(node => {
        const doc = node.ownerDocument, range = doc.createRange(); range.selectNodeContents(node.firstChild);
        node.focus(); doc.getSelection().removeAllRanges(); doc.getSelection().addRange(range); node.dispatchEvent(new Event("focus"));
      });
      monitor = true; await bar.getByRole("button", { name: "Image", exact: true }).click();
      assert.equal(await read(), image("photo.png"));
      assert.equal(await input.evaluate(node => node.ownerDocument.getSelection().toString()), "photo.png");
      assert.equal(mode === "whole" ? await input.evaluate(node => node.ownerDocument.defaultView.__imageChanges) : await page.evaluate(() => __imageChanges), 1);
      await page.keyboard.press("Control+z"); assert.equal(await read(), "photo.png");
      await page.keyboard.press("Control+Shift+z"); assert.equal(await read(), image("photo.png"));
      await input.evaluate(node => {
        const doc = node.ownerDocument, range = doc.createRange(); range.setStart(node.firstChild.firstChild, 3); range.collapse(true);
        node.focus(); doc.getSelection().removeAllRanges(); doc.getSelection().addRange(range); node.dispatchEvent(new Event('focus'));
      });
      await bar.getByRole('button', { name: 'Image', exact: true }).click();
      assert.equal(await input.evaluate(node => node.ownerDocument.getSelection().toString()), 'photo.png');
      assert.equal(await read(), image('photo.png'));
      assert.equal(mode === 'whole' ? await input.evaluate(node => node.ownerDocument.defaultView.__imageChanges) : await page.evaluate(() => __imageChanges), 3);
      await page.keyboard.type('new.png'); assert.equal(await read(), image('new.png'));
      await page.keyboard.press('Control+z'); assert.equal(await read(), image('photo.png'));
      await page.keyboard.press('Control+z'); assert.equal(await read(), 'photo.png'); monitor = false;
    }
    assert.deepEqual(errors, []); assert.deepEqual(requests, []);
    console.log(`${name}: default/configurable image templates, existing URL selection without source/history edits, URL policy/escaping, boundaries, callbacks/history, composition, custom/keyboard-only and iframe paths: ok`);
  } finally { await page.close(); }
}
module.exports = { imageChecks };
if (require.main === module) (async () => {
  const { chromium, firefox } = require("playwright");
  const { pathToFileURL } = require("node:url");
  const path = require("node:path");
  for (const [name, engine] of Object.entries({ chromium, firefox })) {
    const browser = await engine.launch();
    try { await imageChecks(browser, pathToFileURL(path.resolve(__dirname, "..")).href, name); }
    finally { await browser.close(); }
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
