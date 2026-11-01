/* Tab indentation and one-shot Escape/Tab focus traversal in real browsers. */
const assert = require("node:assert/strict");

async function indentationChecks(browser, base, name) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  const errors = [], remote = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("request", request => { if (/^https?:/.test(request.url()) && !request.url().startsWith(base + "/")) remote.push(request.url()); });
  try {
    await page.goto(base + "/tests/fixtures/markdown.html");
    await page.waitForFunction(() => window.__markdownEditor);
    await page.evaluate(() => {
      const before = document.createElement("button"); before.id = "indent-before"; before.textContent = "Before editor";
      const after = document.createElement("button"); after.id = "indent-after"; after.textContent = "After editor";
      __markdownEditor.element.before(before); __markdownEditor.element.after(after);
      __markdownEditor.element.style.maxWidth = '390px';
    });
    const source = page.locator(".lightmarkdown-input"), hint = page.locator(".lightmarkdown-keyboard-hint");
    const get = () => page.evaluate(() => __markdownEditor.getMarkdown());
    await page.locator('#indent-before').focus();
    assert.equal(await page.locator('#editor .lightmetal-actionbar button').evaluateAll(buttons => buttons.every(button => button.tabIndex === -1)), true);
    await page.keyboard.press('Tab');
    assert.equal(await source.evaluate(node => node === document.activeElement), true, 'Forward entry skips the toolbar');
    await page.keyboard.press('Escape'); await page.keyboard.press('Shift+Tab');
    assert.equal(await page.locator('#editor .lightmetal-actionbar button:enabled').last().evaluate(node => node === document.activeElement), true, 'Toolbar remains reachable from source');
    await page.keyboard.press('Tab');
    assert.equal(await source.evaluate(node => node === document.activeElement), true);
    await page.keyboard.press('Escape'); await page.keyboard.press('Tab');
    assert.equal(await page.locator('#indent-after').evaluate(node => node === document.activeElement), true);
    await page.keyboard.press('Shift+Tab');
    assert.equal(await source.evaluate(node => node === document.activeElement), true, 'Backward entry reaches source');
    assert.equal(await get(), '', 'Focus traversal does not edit the document');
    await page.evaluate(() => {
      __markdownEditor.element.style.maxWidth = '';
      const host = document.createElement('div'); host.id = 'entry-second'; document.getElementById('indent-after').before(host);
      window.__entrySecond = __initMarkdown({ element: host, actions: ['bold'] });
    });
    await page.locator('#indent-before').focus(); await page.keyboard.press('Tab');
    await page.keyboard.press('Escape'); await page.keyboard.press('Tab');
    assert.equal(await page.locator('#entry-second .lightmarkdown-input').evaluate(node => node === document.activeElement), true, 'Tab between editors enters the next source');
    assert.equal(await page.locator('#editor .lightmetal-actionbar button').evaluateAll(buttons => buttons.every(button => button.tabIndex === -1)), true);
    await page.keyboard.press('Escape'); await page.keyboard.press('Tab');
    assert.equal(await page.locator('#indent-after').evaluate(node => node === document.activeElement), true);
    await page.evaluate(() => { __entrySecond.destroy(); document.getElementById('entry-second').remove(); });
    const count = () => page.evaluate(() => __markdownChanges.length - __indentBefore);
    const prepare = (text, start, end = start, shape = "blocks") => page.evaluate(({ text, start, end, shape }) => {
      const api = __markdownEditor; api.setMarkdown(text);
      const source = api.content;
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
      source.dispatchEvent(new Event("focus")); window.__indentBefore = __markdownChanges.length;
    }, { text, start, end, shape });
    const cases = [
      ["metal", 2, 2, "Tab", "    metal", ""],
      ["\u00a0metal", 2, 2, "Tab", "    \u00a0metal", ""],
      ["🦊 café", 0, 2, "Tab", "    🦊 café", "🦊"],
      [" metal", 3, 3, "Tab", "    metal", ""],
      ["    metal", 6, 6, "Tab", "        metal", ""],
      ["\tmetal", 3, 3, "Tab", "\t    metal", ""],
      [" \tmetal", 4, 4, "Tab", " \t    metal", ""],
      ["\t  metal", 5, 5, "Shift+Tab", "\tmetal", ""],
      [" \tmetal", 4, 4, "Shift+Tab", "metal", ""],
      ["   metal", 5, 5, "Shift+Tab", "metal", ""],
      ["    metal", 6, 6, "Shift+Tab", "metal", ""],
      ["one\ntwo\nlast", 0, 7, "Tab", "    one\n    two\nlast", "one\n    two"],
      ["one\ntwo", 0, 4, "Tab", "    one\ntwo", "one\n"],
      ["", 0, 0, "Tab", "    ", ""],
      [">metal", 3, 3, "Tab", ">     metal", ""],
      ["> metal", 4, 4, "Tab", ">     metal", ""],
      ["> \tmetal", 5, 5, "Tab", "> \t  metal", ""],
      ["> \tmetal", 5, 5, "Shift+Tab", "> metal", ""],
      [">\tmetal", 4, 4, "Tab", ">\t  metal", ""],
      [">\tmetal", 4, 4, "Shift+Tab", "> metal", ""],
      ["> first\nlazy", 10, 10, "Tab", "> first\n>     lazy", ""],
      ["> > first\n>\t\tlazy", 15, 15, "Tab", "> > first\n> >   \t    lazy", ""],
      ["> >metal", 5, 5, "Tab", "> >     metal", ""],
      ["```js\n  code\n```", 9, 9, "Tab", "```js\n    code\n```", ""],
      ["```\ncode\n```", 0, 12, "Tab", "```\n    code\n```", "```\n    code\n```"],
      ["```\n    code\n```", 9, 9, "Shift+Tab", "```\ncode\n```", ""],
      ["- ```\n\n  ```", 6, 6, "Tab", "- ```\n      \n  ```", ""],
      ["> ```\n>\n> ```", 7, 7, "Tab", "> ```\n>     \n> ```", ""],
      ["- first\n- second", 12, 12, "Tab", "- first\n  - second", ""],
      ["- first\n- second\n- third", 10, 24, "Tab", "- first\n  - second\n  - third", "second\n  - third"],
      ["- first\n  - second\n  - third", 12, 28, "Shift+Tab", "- first\n- second\n- third", "second\n- third"],
      ["- first\n  - second\n  - third", 25, 25, "Shift+Tab", "- first\n  - second\n- third", ""],
      ["- parent\n  - first\n  - second", 25, 25, "Tab", "- parent\n  - first\n    - second", ""],
      ["> - one\n> - two", 13, 13, "Tab", "> - one\n>   - two", ""],
      ["> - one\n>   - two", 15, 15, "Shift+Tab", "> - one\n> - two", ""],
      ["12) first\n- [X] next\n  continuation", 16, 16, "Tab", "12) first\n    - [X] next\n      continuation", ""],
      ["- first\n- second\nlazy", 19, 19, "Tab", "- first\n  - second\n    lazy", ""],
      ["- first\n  - second\nlazy", 20, 20, "Shift+Tab", "- first\n- second\n  lazy", ""],
      ["- first\n- second\n  - child\n    body", 12, 12, "Tab", "- first\n  - second\n    - child\n      body", ""],
      ["- first\n- second\n  ```\n  literal\n  ```", 12, 12, "Tab", "- first\n  - second\n    ```\n    literal\n    ```", ""],
      ["- first\n\n2. next", 14, 14, "Tab", "- first\n\n  2. next", ""]
    ];
    for (const shape of ["blocks", "lf", "br"]) {
      for (const [text, start, end, key, expected, selection] of cases) {
        await prepare(text, start, end, shape);
        const label = `${name}/${shape}/${key}: ${JSON.stringify(text)}`;
        await page.keyboard.press(key); assert.equal(await get(), expected, label);
        assert.equal(await page.evaluate(() => getSelection().toString()), selection, label + ": selection");
        assert.equal(await source.evaluate(node => node === document.activeElement), true, label + ": retains focus");
        assert.equal(await count(), 1, label + ": one notification");
        await page.keyboard.press("Control+z"); assert.equal(await get(), text, label + ": undo");
        await page.keyboard.press("Control+Shift+z"); assert.equal(await get(), expected, label + ": redo");
        assert.equal(await count(), 3);
      }
      for (const [text, at, key, note] of [
        ["metal", 2, "Shift+Tab"], ["```\ncode\n```", 1, "Tab"], ["<pre>\ncode\n</pre>", 8, "Tab"],
        ["- first", 4, "Tab", /preceding sibling/], ["- first", 4, "Shift+Tab", /outermost/],
        ["- first\n2. next", 12, "Tab", /preserve/],
        ["- first\n  - second\n  - third", 13, "Shift+Tab", /unselected/],
        ["- first\n  - second\n\n  later", 13, "Shift+Tab", /unselected/],
        ["- - inner", 6, "Shift+Tab", /unselected/]
      ]) {
        await prepare(text, at, at, shape); await page.keyboard.press(key);
        assert.equal(await get(), text, `${name}/${shape}: blocked ${key} ${JSON.stringify(text)}`);
        assert.equal(await count(), 0); assert.equal(await source.evaluate(node => node === document.activeElement), true);
        if (note) assert.match(await hint.textContent(), note);
      }
    }
    await prepare("- first\n\nplain", 2, 14); await page.keyboard.press("Tab");
    assert.equal(await get(), "- first\n\nplain"); assert.equal(await count(), 0);
    assert.match(await hint.textContent(), /separately/);
    await prepare("metal", 2);
    assert.equal(await hint.isVisible(), true);
    const description = await source.getAttribute("aria-describedby"); assert.equal(description, await hint.getAttribute("id"));
    assert.match(await hint.textContent(), /Esc then Tab moves focus/);
    await page.keyboard.press("Escape"); assert.match(await hint.textContent(), /Next Tab moves focus/);
    await page.keyboard.press("Tab"); assert.equal(await page.locator("#indent-after").evaluate(node => node === document.activeElement), true);
    assert.equal(await get(), "metal"); assert.equal(await count(), 0);
    await prepare("metal", 2); await page.keyboard.press("Escape"); await page.keyboard.press("Shift+Tab");
    assert.equal(await page.getByRole("group", { name: "Markdown formatting" }).locator("button:enabled").last().evaluate(node => node === document.activeElement), true);
    for (const reset of ["key", "pointer", "blur", "replace", "insert", "composition"]) {
      await prepare("metal", 2); await page.keyboard.press("Escape");
      if (reset === "key") await page.keyboard.press("ArrowRight");
      else if (reset === "pointer") await source.dispatchEvent("mousedown");
      else if (reset === "blur") { await page.locator("#indent-after").focus(); await source.focus(); }
      else if (reset === "replace") await page.evaluate(() => __markdownEditor.setMarkdown("metal"));
      else if (reset === "insert") await page.evaluate(() => __markdownEditor.insertText(""));
      else { await source.dispatchEvent("compositionstart"); await source.dispatchEvent("compositionend"); }
      await page.keyboard.press("Tab"); assert.equal(await get(), "    metal", `${name}: one-shot escape reset on ${reset}`);
      assert.equal(await source.evaluate(node => node === document.activeElement), true);
    }
    await prepare("metal", 2);
    await page.evaluate(() => {
      const button = document.createElement("button"); button.id = "indent-no-edit"; button.textContent = "Keep editing";
      button.addEventListener("mousedown", event => event.preventDefault());
      __markdownEditor.element.append(button);
    });
    await page.keyboard.press("Escape"); await page.locator("#indent-no-edit").click();
    assert.equal(await source.evaluate(node => node === document.activeElement), true);
    await page.keyboard.press("Tab"); assert.equal(await get(), "    metal", "host pointer input cancels focus escape without requiring blur");
    await prepare("metal", 2); await source.dispatchEvent("compositionstart");
    const untouched = await source.evaluate(node => {
      const event = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true, isComposing: true });
      node.dispatchEvent(event); return !event.defaultPrevented;
    });
    assert.equal(untouched, true); assert.equal(await get(), "metal"); assert.equal(await count(), 0);
    await source.dispatchEvent("compositionend");
    await prepare("metal", 2);
    await source.evaluate(node => {
      const event = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
      event.preventDefault(); node.dispatchEvent(event);
    });
    assert.equal(await count(), 0);
    // Help is per-instance UI, not saved content. Teardown removes only owned UI.
    const lifecycle = await page.evaluate(() => {
      const host = document.createElement("div"), owned = document.createElement("span"); owned.textContent = "application"; host.append(owned); document.body.append(host);
      const api = maiden.init({ element: host, actions: [] });
      const help = host.querySelector(".lightmarkdown-keyboard-hint"), id = api.content.getAttribute("aria-describedby");
      const unique = id !== __markdownEditor.content.getAttribute("aria-describedby");
      const range = document.createRange(); range.selectNodeContents(api.content); range.collapse(false);
      api.content.focus(); getSelection().removeAllRanges(); getSelection().addRange(range);
      api.content.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }));
      const text = api.getMarkdown(), content = api.content;
      api.destroy(); content.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }));
      const result = { unique, help: help.id === id, text, preserved: host.firstChild === owned && host.childNodes.length === 1, final: api.getMarkdown() };
      host.remove(); return result;
    });
    assert.deepEqual(lifecycle, { unique: true, help: true, text: "    ", preserved: true, final: "    " });
    await prepare("metal\n\nuntouched", 2);
    await page.evaluate(() => { window.__indentTail = __markdownEditor.content.lastChild; });
    await page.keyboard.press("Tab"); assert.equal(await page.evaluate(() => __indentTail === __markdownEditor.content.lastChild), true);
    assert.deepEqual(errors, []); assert.deepEqual(remote, []);

    // Keep keyboard editing and toolbar traversal inside the whole-editor frame.
    // Native cross-document traversal has its own diagnostic.
    await page.goto(base + "/examples/markdown-iframe.html");
    await page.waitForFunction(() => !document.getElementById("read-markdown").disabled);
    const view = page.frameLocator("#isolated-editor"), child = view.locator(".lightmarkdown-input");
    await child.evaluate(node => {
      const api = node.ownerDocument.defaultView.__markdownEditor; api.setMarkdown("metal");
      node.focus(); node.ownerDocument.getSelection().collapse(node.firstChild.firstChild, 0);
    });
    await page.keyboard.press("Tab");
    assert.equal(await child.evaluate(node => node.ownerDocument.defaultView.__markdownEditor.getMarkdown()), "    metal");
    await page.keyboard.press("Control+z");
    assert.equal(await child.evaluate(node => node.ownerDocument.defaultView.__markdownEditor.getMarkdown()), "metal");
    await page.keyboard.press("Escape"); await page.keyboard.press("Shift+Tab");
    assert.equal(await view.getByRole("group", { name: "Markdown formatting" }).locator("button:enabled").last().evaluate(node => node === document.activeElement), true);
    assert.equal(await view.locator(".lightmarkdown-keyboard-hint").evaluate(node => node.getBoundingClientRect().bottom <= innerHeight), true, "iframe help stays in view");
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await view.locator(".lightmarkdown-keyboard-hint").evaluate(node => node.getBoundingClientRect().bottom <= innerHeight), true, "narrow whole-editor frame keeps its keyboard help visible");
    assert.deepEqual(errors, []); assert.deepEqual(remote, []);
    console.log(`${name}: Tab/Shift+Tab columns, list subtrees, unsafe moves, code/HTML guards, history, help/lifecycle and Escape/Tab focus traversal: ok`);
  } finally { await page.close(); }
}
module.exports = { indentationChecks };
if (require.main === module) (async () => {
  const { chromium, firefox } = require("playwright");
  const { pathToFileURL } = require("node:url");
  const path = require("node:path");
  for (const [name, engine] of Object.entries({ chromium, firefox })) {
    const browser = await engine.launch();
    try { await indentationChecks(browser, pathToFileURL(path.resolve(__dirname, "..")).href, name); }
    finally { await browser.close(); }
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
