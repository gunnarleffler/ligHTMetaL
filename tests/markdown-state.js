/* Recognized Link boundaries and native document-owned Undo/Redo availability. */
const assert = require("node:assert/strict");

async function stateChecks(browser, base, name) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  const errors = [], remote = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("request", request => { if (/^https?:/.test(request.url()) && !request.url().startsWith(base + "/")) remote.push(request.url()); });
  try {
    const load = async () => { await page.goto(base + "/tests/fixtures/markdown.html"); await page.waitForFunction(() => window.__markdownEditor); };
    await load();
    const source = page.locator("#editor .lightmarkdown-input");
    const toolbar = page.getByRole("group", { name: "Markdown formatting" });
    const button = title => toolbar.getByRole("button", { name: title, exact: true });
    const get = () => page.evaluate(() => __markdownEditor.getMarkdown());
    const count = () => page.evaluate(() => __markdownChanges.length - __stateBefore);
    const prepare = (text, start, end = start, shape = "blocks") => page.evaluate(({ text, start, end, shape }) => {
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
      source.dispatchEvent(new Event("focus")); window.__stateBefore = __markdownChanges.length;
    }, { text, start, end, shape });
    const template = label => `[${label}](https://www.example.com)`;
    for (const shape of ["blocks", "lf", "br"]) for (const [text, start, end, expected] of [
      ["", 0, 0, template("link")], ["metal", 0, 5, template("metal")],
      ["  ", 0, 2, template("  ")], ["`metal`", 0, 7, template("`metal`")],
      ["`\tmetal\t`", 0, 9, template("`\tmetal\t`")], ["🦊 café", 0, 2, template("🦊") + " café"],
      ["first `metal`", 0, 13, template("first `metal`")],
      ["**metal**", 2, 7, "**" + template("metal") + "**"],
      ["[not a link]", 0, 12, template("\\[not a link\\]")],
      ["> metal", 4, 4, "> me" + template("link") + "tal"],
      [">\tmetal", 2, 2, ">\t" + template("link") + "metal"],
      ["- metal", 2, 2, "- " + template("link") + "metal"],
      ...["metal", "- metal", "1. metal", "- [x] metal", "> metal", "- > metal", "> - metal",
        "- first\n  metal", "- >", "- metal ", "-\tmetal", "- 🦊"].map(text =>
        [text, text.length, text.length, text + template("link")]),
      ...["1.", "> -", "- > -", "- #", "> - #", "- [x]"].map(text =>
        [text, text.length, text.length, text + " " + template("link")]),
      ["- [X] metal", 6, 11, "- [X] " + template("metal")],
      ["- [ ] metal", 5, 5, "- [ ] " + template("link") + " metal"],
      ["- [X]", 5, 5, "- [X] " + template("link")],
      ["-", 1, 1, "- " + template("link")], ["#", 1, 1, "# " + template("link")],
      [">", 1, 1, ">" + template("link")],
      ["[metal](local)", 0, 0, template("link") + "[metal](local)"],
      ["[metal](local)", 14, 14, "[metal](local)" + template("link")]
    ]) {
      await prepare(text, start, end, shape);
      const label = `${name}/${shape}: ${JSON.stringify(text)} ${start}:${end}`;
      assert.equal(await button("Link").isEnabled(), true, label);
      await page.keyboard.press("Control+k"); assert.equal(await get(), expected, label);
      assert.equal(await page.evaluate(() => getSelection().toString()), "https://www.example.com");
      assert.equal(await count(), 1); assert.equal(await button("Link").isDisabled(), true, "selected URL is not a new link label");
      await page.keyboard.press("Control+k"); assert.equal(await get(), expected); assert.equal(await count(), 1);
      await page.keyboard.press("Control+z"); assert.equal(await get(), text, label + ": undo");
      await page.keyboard.press("Control+Shift+z"); assert.equal(await get(), expected, label + ": redo");
    }
    const protectedCases = [
      ["first\nsecond", 0, 12], ["```\nliteral\n```", 7], ["```\nliteral\n```", 0, 15],
      ["    code", 6], ["text\n    continuation", 12], ["<div>\nliteral\n</div>", 9],
      ["`metal`", 3], ["`metal`", 1, 6], ["left <b>bold</b> right", 7],
      ["> metal", 1], ["- metal", 1], ["- [x] metal", 4], ["## heading", 1],
      ["[metal](local)", 3], ["[metal](local)", 1, 6], ["[metal](local)", 0, 14],
      ["[metal](local \"title\")", 18], ["![alt](image)", 3], ["![alt](image)", 0, 13],
      ["[![alt](image)](local)", 4], ["[ref]\n\n[ref]: /path", 2], ["[ref]\n\n[ref]: /path", 0, 5],
      ["[text][ref]\n\n[ref]: /path", 3], ["[ref][]\n\n[ref]: /path", 3],
      ["![ref]\n\n[ref]: /image", 3], ["[ref]: /path", 8],
      ["go <https://example.com> now", 9], ["https://example.com", 8], ["https://example.com", 0, 19],
      ["www.example.com", 4], ["mail user@example.com tail", 9], ["user@example.com", 0, 16]
    ];
    for (const shape of ["blocks", "lf", "br"]) for (const [text, start, end = start] of protectedCases) {
      await prepare(text, start, end, shape);
      const label = `${name}/${shape}: protected ${JSON.stringify(text)} ${start}:${end}`;
      assert.equal(await button("Link").isDisabled(), true, label);
      await button("Link").evaluate(node => node.click()); await page.keyboard.press("Control+k");
      assert.equal(await get(), text, label); assert.equal(await count(), 0);
    }
    for (const [text, start] of [["-\t\n  # child", 2], ["- \n  [x] task", 2]]) {
      await prepare(text, start); assert.equal(await button("Link").isEnabled(), true);
      await page.keyboard.press("Control+k"); assert.equal(await get(), text); assert.equal(await count(), 0);
      assert.match(await page.getByRole("status").textContent(), /surrounding Markdown/);
    }
    await prepare("metal\n\nuntouched", 0, 5);
    await page.evaluate(() => { window.__stateTail = __markdownEditor.content.lastChild; });
    await button("Link").focus(); await page.keyboard.press("Enter");
    assert.equal(await page.evaluate(() => __stateTail === __markdownEditor.content.lastChild), true);
    await prepare("metal", 0, 5); await source.dispatchEvent("compositionstart");
    assert.equal(await button("Link").isDisabled(), true); await page.keyboard.press("Control+k");
    assert.equal(await count(), 0); await source.dispatchEvent("compositionend");

    // Fresh document: setters are not undo steps; native history flags own state.
    await load(); await prepare("metal", 5);
    const history = async expected => {
      const state = await page.evaluate(() => ({
        native: [document.queryCommandEnabled("undo"), document.queryCommandEnabled("redo")],
        enabled: ["Undo", "Redo"].map(title => !document.querySelector(`#editor button[aria-label="${title}"]`).disabled)
      }));
      assert.deepEqual(state.enabled, state.native, `${name}: native availability`);
      if (expected) assert.deepEqual(state.enabled, expected);
    };
    await history([false, false]);
    for (const title of ["Undo", "Redo"]) {
      assert.equal(await button(title).getAttribute("aria-pressed"), null);
      await button(title).evaluate(node => node.click());
    }
    assert.equal(await count(), 0);
    await page.keyboard.type("X"); assert.equal(await get(), "metalX"); await history([true, false]);
    assert.equal(await count(), 1);
    await button("Undo").focus(); await history([true, false]); await page.keyboard.press("Enter");
    assert.equal(await get(), "metal"); await history([false, true]); assert.equal(await count(), 2);
    await button("Redo").focus(); await page.keyboard.press("Space");
    assert.equal(await get(), "metalX"); await history([true, false]); assert.equal(await count(), 3);
    await page.keyboard.press("Control+z"); await history([false, true]); assert.equal(await count(), 4);
    await page.keyboard.press("Control+Shift+z"); await history([true, false]); assert.equal(await count(), 5);
    await source.dispatchEvent("compositionstart"); assert.equal(await button("Undo").isDisabled(), true); assert.equal(await button("Redo").isDisabled(), true);
    await source.dispatchEvent("compositionend"); await history([true, false]); assert.equal(await count(), 5);
    // State-only changes must not steal focus, render callbacks, or native typing groups.
    await page.evaluate(() => {
      const note = document.createElement("textarea"); note.id = "state-note"; document.body.append(note);
      const host = document.createElement("div"); host.id = "state-other"; document.body.append(host); window.__otherStates = 0;
      window.__stateOther = __initMarkdown({ element: host, actions: [{ title: "Probe", result: () => {}, state: () => { __otherStates++; return false; } }, "undo", "redo"] });
      window.__otherBefore = __otherStates;
    });
    // Scope the original toolbar now that another instance exists.
    const original = page.locator("#editor").getByRole("group", { name: "Markdown formatting" });
    const note = page.locator("#state-note"); await note.focus(); await page.keyboard.type("app note");
    await history(); assert.equal(await count(), 5); assert.equal(await get(), "metalX");
    assert.equal(await note.evaluate(node => node === document.activeElement), true);
    assert.equal(await page.evaluate(() => __otherStates === __otherBefore), true);
    await page.keyboard.press("Control+z"); await history(); assert.equal(await count(), 5);
    await page.evaluate(() => { __stateOther.destroy(); document.getElementById("state-other").remove(); });
    await source.focus();
    await page.evaluate(() => { window.__query = document.queryCommandEnabled; document.queryCommandEnabled = () => { throw new Error("Unavailable"); }; document.dispatchEvent(new Event("focusin")); });
    assert.equal(await original.getByRole("button", { name: "Undo", exact: true }).isDisabled(), true);
    assert.equal(await original.getByRole("button", { name: "Redo", exact: true }).isDisabled(), true);
    await page.evaluate(() => { document.queryCommandEnabled = __query; document.dispatchEvent(new Event("focusin")); });
    await history(); assert.equal(await count(), 5);
    await page.keyboard.press("Escape"); await page.keyboard.press("Shift+Tab");
    assert.equal(await original.locator("button:enabled").last().evaluate(node => node === document.activeElement), true);

    // Custom result callbacks bypass built-in availability and literal guards.
    await page.evaluate(() => {
      __markdownEditor.destroy(); window.__stateCalls = [];
      window.__markdownEditor = __initMarkdown({ element: document.getElementById("editor"), actions: ["link", "undo", "redo"].map(name => ({
        name, result: () => __stateCalls.push(name), state: () => true
      })), onChange: value => __markdownChanges.push(value) });
    });
    await prepare("```\nliteral\n```", 7);
    for (const title of ["Link", "Undo", "Redo"]) {
      assert.equal(await button(title).isEnabled(), true); await button(title).click();
      assert.equal(await button(title).getAttribute("aria-pressed"), "true");
    }
    assert.deepEqual(await page.evaluate(() => __stateCalls), ["link", "undo", "redo"]); assert.equal(await count(), 0);
    for (const mode of ["whole", "surface"]) {
      await page.goto(base + (mode === "whole" ? "/examples/markdown-iframe.html" : "/examples/markdown.html?mode=isolated"));
      if (mode === "whole") await page.waitForFunction(() => !document.getElementById("read-markdown").disabled);
      else await page.waitForFunction(() => window.__markdownEditor && __markdownMode === "isolated");
      const view = page.frameLocator(mode === "whole" ? "#isolated-editor" : ".lightmarkdown-surface-frame");
      const input = view.locator(".lightmarkdown-input");
      const bar = (mode === "whole" ? view : page).getByRole("group", { name: "Markdown formatting" });
      const read = () => mode === "whole" ? input.evaluate(node => node.ownerDocument.defaultView.__markdownEditor.getMarkdown()) : page.evaluate(() => __markdownEditor.getMarkdown());
      const flags = async () => {
        const native = await input.evaluate(node => ["undo", "redo"].map(command => node.ownerDocument.queryCommandEnabled(command)));
        const enabled = await bar.locator('button[aria-label="Undo"],button[aria-label="Redo"]').evaluateAll(nodes => nodes.map(node => !node.disabled));
        assert.deepEqual(enabled, native, mode + ": child-owned native availability");
      };
      if (mode === "whole") await input.evaluate(node => node.ownerDocument.defaultView.__markdownEditor.setMarkdown("metal"));
      else await page.evaluate(() => { __markdownEditor.setMarkdown("metal"); document.getElementById("history-demo").open = true; });
      await input.evaluate(node => {
        const doc = node.ownerDocument, range = doc.createRange(); range.setStart(node.firstChild.firstChild, 5); range.collapse(true);
        node.focus(); doc.getSelection().removeAllRanges(); doc.getSelection().addRange(range);
      });
      await flags(); await page.keyboard.type("X"); assert.equal(await read(), "metalX", mode + ": native typing"); await flags();
      const undo = bar.getByRole("button", { name: "Undo", exact: true }), redo = bar.getByRole("button", { name: "Redo", exact: true });
      await undo.focus(); await flags(); await page.keyboard.press("Enter"); assert.equal(await read(), "metal"); await flags();
      await redo.focus(); await page.keyboard.press("Space"); assert.equal(await read(), "metalX"); await flags();
      const note = page.locator(mode === "whole" ? "#application-note" : "#history-note");
      await note.fill("outside"); await note.press("End"); await page.keyboard.type("!"); await flags();
      await input.focus(); await page.keyboard.press("Control+z"); assert.equal(await read(), "metal"); await flags();
      assert.equal(await note.inputValue(), "outside!", mode + ": child history leaves parent untouched");
      await page.keyboard.press("Escape"); await page.keyboard.press("Shift+Tab");
      const last = bar.locator("button:enabled").last();
      if (!await last.evaluate(node => node === node.ownerDocument.activeElement)) await page.keyboard.press("Shift+Tab");
      assert.equal(await last.evaluate(node => node === node.ownerDocument.activeElement), true);
    }
    assert.deepEqual(errors, []); assert.deepEqual(remote, []);
    console.log(`${name}: recognized Link boundaries, literal/marker guards, native history availability, state-only refresh, focus and custom overrides: ok`);
  } finally { await page.close(); }
}
module.exports = { stateChecks };
if (require.main === module) (async () => {
  const { chromium, firefox } = require("playwright");
  const { pathToFileURL } = require("node:url");
  const path = require("node:path");
  for (const [name, engine] of Object.entries({ chromium, firefox })) {
    const browser = await engine.launch();
    try { await stateChecks(browser, pathToFileURL(path.resolve(__dirname, "..")).href, name); }
    finally { await browser.close(); }
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
