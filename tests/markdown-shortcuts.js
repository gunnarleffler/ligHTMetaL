/* Per-editor command shortcuts and honest tooltip/ARIA hints, in real browsers. */
const assert = require("node:assert/strict");

async function shortcutChecks(browser, base, name) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  const errors = [], remote = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("request", request => { if (/^https?:/.test(request.url()) && !request.url().startsWith(base + "/")) remote.push(request.url()); });
  try {
    await page.goto(base + "/tests/fixtures/markdown.html");
    await page.waitForFunction(() => window.__markdownEditor);
    const source = page.locator("#editor .lightmarkdown-input");
    const toolbar = page.getByRole("group", { name: "Markdown formatting" });
    const button = title => toolbar.getByRole("button", { name: title, exact: true });
    const get = () => page.evaluate(() => __markdownEditor.getMarkdown());
    const count = () => page.evaluate(() => __markdownChanges.length - __shortcutBefore);
    const mount = settings => page.evaluate(settings => {
      __markdownEditor.destroy();
      window.__markdownEditor = __initMarkdown({ element: document.getElementById("editor"), ...settings,
        onChange: value => __markdownChanges.push(value) });
    }, settings);
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
      source.dispatchEvent(new Event("focus")); window.__shortcutBefore = __markdownChanges.length;
    }, { text, start, end, shape });
    const dispatch = (init = {}, options = {}) => source.evaluate((source, { init, options }) => {
      const event = new KeyboardEvent("keydown", { key: "b", ctrlKey: true, bubbles: true, cancelable: true, ...init });
      if (options.prevented) event.preventDefault();
      if (options.altGraph) Object.defineProperty(event, "getModifierState", { value: key => key === "AltGraph" });
      source.dispatchEvent(event); return event.defaultPrevented;
    }, { init, options });

    assert.equal(await button("Bold").getAttribute("title"), "Bold (Ctrl/Cmd+B)");
    assert.equal(await button("Bold").getAttribute("aria-keyshortcuts"), "Control+b Meta+b");
    assert.equal(await button("Italic").getAttribute("title"), "Italic (Ctrl/Cmd+I)");
    assert.equal(await button("Link").getAttribute("aria-keyshortcuts"), "Control+k Meta+k");
    assert.equal(await button("Inline Code").getAttribute("aria-keyshortcuts"), "Control+` Meta+`");
    assert.equal(await button("Code Block").getAttribute("aria-keyshortcuts"), null);
    assert.equal(await button("Image").getAttribute("aria-keyshortcuts"), null);
    assert.equal(await button("Table").getAttribute("aria-keyshortcuts"), null);
    assert.equal(await toolbar.getByRole("button").count(), 19);
    for (const shape of ["blocks", "lf", "br"]) for (const [chord, expected, selected] of [
      ["Control+b", "**metal**", "metal"], ["Meta+b", "**metal**", "metal"],
      ["Control+i", "*metal*", "metal"], ["Control+`", "`metal`", "metal"],
      ["Control+k", "[metal](https://www.example.com)", "https://www.example.com"]
    ]) {
      await prepare("metal", 0, 5, shape); await page.keyboard.press(chord);
      assert.equal(await get(), expected, `${name}/${shape}/${chord}`);
      assert.equal(await page.evaluate(() => getSelection().toString()), selected);
      assert.equal(await count(), 1);
      await page.keyboard.press("Control+z"); assert.equal(await get(), "metal");
      await page.keyboard.press("Control+Shift+z"); assert.equal(await get(), expected);
    }
    await mount({ shortcuts: { bold: "Alt+Shift+b", italic: false } });
    assert.equal(await button("Bold").getAttribute("title"), "Bold (Alt+Shift+B)");
    assert.equal(await button("Bold").getAttribute("aria-keyshortcuts"), "Alt+Shift+b");
    assert.equal(await button("Italic").getAttribute("title"), "Italic");
    assert.equal(await button("Italic").getAttribute("aria-keyshortcuts"), null);
    await prepare("metal"); await page.keyboard.press("Control+b"); await page.keyboard.press("Control+i");
    assert.equal(await get(), "metal"); assert.equal(await count(), 0);
    await page.keyboard.press("Alt+Shift+b"); assert.equal(await get(), "**metal**"); assert.equal(await count(), 1);
    await prepare("metal"); await button("Italic").click(); assert.equal(await get(), "*metal*", "disabling a shortcut does not disable its button");
    await mount({ shortcuts: { bold: "Mod+i", italic: "Mod+b" } });
    await prepare("metal"); await page.keyboard.press("Control+b"); assert.equal(await get(), "*metal*", "atomic swaps do not conflict with replaced defaults");
    await mount({ shortcuts: false }); await prepare("metal");
    for (const key of ["b", "i", "u", "k", "`"]) {
      const prevented = await dispatch({ key });
      assert.equal(prevented, ["b", "i", "u"].includes(key));
    }
    assert.equal(await get(), "metal"); assert.equal(await count(), 0);
    assert.equal(await source.locator("b,strong,i,em,u").count(), 0);
    assert.equal(await toolbar.locator("[aria-keyshortcuts]").count(), 0);
    await button("Bold").click(); assert.equal(await get(), "**metal**");

    // Explicit bindings can invoke a built-in with no corresponding toolbar control.
    await mount({ actions: [], shortcuts: { codeblock: "Alt+Shift+c", bold: "Mod+b" } });
    assert.equal(await toolbar.count(), 0, "hidden toolbar stays hidden");
    await prepare("metal", 2, 2); await page.keyboard.press("Alt+Shift+c");
    assert.equal(await get(), "```\nmetal\n```"); assert.equal(await count(), 1);
    await page.keyboard.press("Alt+Shift+c"); assert.equal(await get(), "metal"); assert.equal(await count(), 2);
    await page.keyboard.press("Control+z"); assert.equal(await get(), "```\nmetal\n```");
    await page.keyboard.press("Control+z"); assert.equal(await get(), "metal");
    await prepare("metal"); await page.keyboard.press("Control+b"); assert.equal(await get(), "**metal**");
    await prepare("```\nliteral\n```", 7, 7); await page.keyboard.press("Control+b");
    assert.equal(await get(), "```\nliteral\n```"); assert.equal(await count(), 0);

    await mount({});
    for (const [init, options] of [
      [{}, { prevented: true }], [{ isComposing: true }, {}], [{ keyCode: 229 }, {}],
      [{ ctrlKey: true, altKey: true }, { altGraph: true }], [{ shiftKey: true }, {}], [{ altKey: true }, {}]
    ]) {
      await prepare("metal"); await dispatch(init, options); assert.equal(await get(), "metal"); assert.equal(await count(), 0);
    }
    await prepare("metal"); await source.dispatchEvent("compositionstart");
    assert.equal(await dispatch(), false); assert.equal(await get(), "metal"); assert.equal(await count(), 0);
    await source.dispatchEvent("compositionend");
    // Capture-phase application handlers own prevented events, including Enter.
    await prepare("metal");
    await page.evaluate(() => {
      window.__preventShortcut = event => event.preventDefault();
      __markdownEditor.content.addEventListener("keydown", __preventShortcut, true);
    });
    await page.keyboard.press("Control+b"); await page.keyboard.press("Enter");
    assert.equal(await get(), "metal"); assert.equal(await count(), 0);
    await page.evaluate(() => __markdownEditor.content.removeEventListener("keydown", __preventShortcut, true));
    await page.evaluate(() => { const outside = document.createElement("textarea"); outside.id = "shortcut-outside"; document.body.append(outside); outside.focus(); });
    assert.equal(await dispatch(), false, "synthetic key on an unfocused source must not steal focus");
    assert.equal(await get(), "metal");
    await page.locator("#shortcut-outside").press("Control+b"); assert.equal(await get(), "metal");
    await button("Bold").focus(); await page.keyboard.press("Control+b"); assert.equal(await get(), "metal", "toolbar focus is not writing focus");
    await source.focus();
    for (const key of ["z", "y", "p", "l", "f"]) assert.equal(await dispatch({ key }), false, `unassigned browser/native ${key} stays native`);
    await page.keyboard.press("Escape"); await page.keyboard.press("Shift+Tab");
    assert.equal(await toolbar.locator("button:enabled").last().evaluate(node => node === document.activeElement), true);
    await prepare("metal", 2, 2); await page.keyboard.press("Tab"); assert.equal(await get(), "    metal");
    await prepare("metal", 2, 2); await page.keyboard.press("Enter"); assert.equal(await get(), "me\ntal");

    // Custom results, duplicate toolbar names, aliases, per-instance snapshots and teardown.
    const custom = await page.evaluate(() => {
      __markdownEditor.destroy(); window.__shortcutCalls = [];
      const config = { bold: "Control+Shift+e", stamp: "Alt+Shift+s" };
      window.__markdownEditor = __initMarkdown({ element: document.getElementById("editor"), actions: [
        { name: "bold", title: "Heavy", result: api => { __shortcutCalls.push("first"); api.insertText("FIRST"); } },
        { name: "bold", title: "Other", result: () => __shortcutCalls.push("second") }, "|",
        { name: "stamp", title: "Stamp", result: api => { __shortcutCalls.push("stamp"); api.insertText("STAMP"); }, state: () => true }
      ], shortcuts: config, onChange: value => __markdownChanges.push(value) });
      config.bold = "Alt+q";
      return [...__markdownEditor.element.querySelectorAll("button")].map(button => [button.getAttribute("aria-label"), button.title, button.textContent, button.getAttribute("aria-keyshortcuts")]);
    });
    assert.equal(custom[0][1], "Heavy (Ctrl+Shift+E)"); assert.equal(custom[1][3], null);
    assert.deepEqual(custom[2], ["Stamp", "Stamp (Alt+Shift+S)", "Stamp", "Alt+Shift+s"]);
    await prepare("metal"); await page.keyboard.press("Control+Shift+e"); assert.equal(await get(), "FIRST"); assert.equal(await count(), 1);
    await prepare("metal"); await page.keyboard.press("Alt+Shift+s"); assert.equal(await get(), "STAMP"); assert.equal(await count(), 1);
    await button("Other").click(); assert.deepEqual(await page.evaluate(() => __shortcutCalls), ["first", "stamp", "second"]);
    assert.equal(await button("Stamp").getAttribute("aria-pressed"), "true");
    const isolation = await page.evaluate(() => {
      const host = document.createElement("div"); host.id = "shortcut-second"; document.body.append(host);
      window.__shortcutSecond = __initMarkdown({ element: host, shortcuts: { bold: "Alt+Shift+b" } });
      __shortcutSecond.setMarkdown("other");
      const range = document.createRange(); range.selectNodeContents(__shortcutSecond.content);
      __shortcutSecond.content.focus(); getSelection().removeAllRanges(); getSelection().addRange(range);
      return __markdownEditor.getMarkdown();
    });
    await page.keyboard.press("Alt+Shift+b"); assert.equal(await page.evaluate(() => __shortcutSecond.getMarkdown()), "**other**");
    assert.equal(await get(), isolation);
    await page.evaluate(() => { __shortcutSecond.destroy(); document.getElementById("shortcut-second").remove(); });
    await mount({ shortcuts: { bold: "Cmd+b", italic: "Alt+Space", code: "Control+Plus" } });
    await prepare("metal"); assert.equal(await dispatch({ ctrlKey: false, metaKey: true }), true); assert.equal(await get(), "**metal**");
    await prepare("metal"); await dispatch({ key: " ", ctrlKey: false, altKey: true }); assert.equal(await get(), "*metal*");
    await prepare("metal"); await dispatch({ key: "+" }); assert.equal(await get(), "`metal`");
    assert.equal(await button("Italic").getAttribute("aria-keyshortcuts"), "Alt+Space");
    const destroyed = await page.evaluate(() => {
      const api = __markdownEditor, content = api.content; api.destroy();
      const event = new KeyboardEvent("keydown", { key: "b", metaKey: true, bubbles: true, cancelable: true }); content.dispatchEvent(event);
      return { text: api.getMarkdown(), cancelled: event.defaultPrevented };
    });
    assert.deepEqual(destroyed, { text: "`metal`", cancelled: false });

    const validation = await page.evaluate(() => {
      const host = document.createElement("div"); host.className = "app"; const owned = document.createElement("span"); host.append(owned); document.body.append(host);
      const cases = [true, [], "Mod+b", new Date(), { unknown: "Mod+b" }, { bold: true }, { bold: null }, { bold: [] },
        { bold: "" }, { bold: "b" }, { bold: "Shift+b" }, { bold: "Mod+Ctrl+b" }, { bold: "Ctrl+Control+b" },
        { bold: "Mod+Enter" }, { bold: "Alt+Tab" }, { bold: "Alt+Escape" }, { bold: "Mod+z" }, { bold: "Ctrl+Shift+y" },
        { bold: "Mod+b", italic: "Ctrl+b" }, { bold: "Ctrl+NoSuchKey" }, { bold: "Ctrl++" }];
      const failures = cases.map(shortcuts => {
        let failed = false; try { __initMarkdown({ element: host, shortcuts }); } catch (error) { failed = error instanceof TypeError; }
        return failed && host.childNodes.length === 1 && host.firstChild === owned && host.className === "app";
      });
      const api = __initMarkdown({ element: host, shortcuts: null }); api.destroy();
      const preserved = host.childNodes.length === 1 && host.firstChild === owned && host.className === "app"; host.remove();
      return { failures, preserved };
    });
    assert.ok(validation.failures.every(Boolean)); assert.equal(validation.preserved, true);

    // Bindings, toolbar, selection, and native history all belong to the frame.
    {
      await page.goto(base + "/examples/markdown-iframe.html");
      await page.waitForFunction(() => !document.getElementById("read-markdown").disabled);
      const view = page.frameLocator("#isolated-editor"), input = view.locator(".lightmarkdown-input");
      await input.evaluate(source => {
        const win = source.ownerDocument.defaultView, host = source.closest(".lightmarkdown");
        win.__markdownEditor.destroy();
        win.__markdownEditor = win.maiden.init({ element: host, shortcuts: { codeblock: "Alt+Shift+c" } });
        win.__markdownEditor.setMarkdown("metal");
      });
      await input.focus(); await page.keyboard.press("Alt+Shift+c");
      const read = () => input.evaluate(source => source.ownerDocument.defaultView.__markdownEditor.getMarkdown());
      assert.equal(await read(), "```\nmetal\n```", "whole-editor iframe shortcut");
      await page.keyboard.press("Control+z"); assert.equal(await read(), "metal");
      const bar = view.getByRole("group", { name: "Markdown formatting" });
      assert.equal(await bar.getByRole("button", { name: "Code Block", exact: true }).getAttribute("aria-keyshortcuts"), "Alt+Shift+c");
      await input.focus(); await page.keyboard.press("Escape"); await page.keyboard.press("Shift+Tab");
      const last = bar.locator("button:enabled").last();
      assert.equal(await last.evaluate(node => node === node.ownerDocument.activeElement), true);
    }
    assert.deepEqual(errors, []); assert.deepEqual(remote, []);
    console.log(`${name}: configurable/default/keyboard-only shortcuts, hints, validation, guards, history and whole-editor iframe ownership: ok`);
  } finally { await page.close(); }
}
module.exports = { shortcutChecks };
if (require.main === module) (async () => {
  const { chromium, firefox } = require("playwright");
  const { pathToFileURL } = require("node:url");
  const path = require("node:path");
  for (const [name, engine] of Object.entries({ chromium, firefox })) {
    const browser = await engine.launch();
    try { await shortcutChecks(browser, pathToFileURL(path.resolve(__dirname, "..")).href, name); }
    finally { await browser.close(); }
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
