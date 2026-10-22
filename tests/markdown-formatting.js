/* M3 Bold/Italic/Strike commands use recognized pairs, not marker-shaped text. */
const assert = require("node:assert/strict");

async function formattingChecks(browser, base, name) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  const errors = [], remote = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("request", request => { if (/^https?:/.test(request.url()) && !request.url().startsWith(base + "/")) remote.push(request.url()); });
  try {
    await page.goto(base + "/tests/fixtures/markdown.html");
    await page.waitForFunction(() => window.__markdownEditor);
    const source = page.locator(".lightmarkdown-input");
    const button = title => page.getByRole("button", { name: title, exact: true });
    const get = () => page.evaluate(() => __markdownEditor.getMarkdown());
    const count = () => page.evaluate(() => __markdownChanges.length - __formatBefore);
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
      source.dispatchEvent(new Event("focus"));
      window.__formatBefore = __markdownChanges.length;
    }, { text, start, end, shape });
    const cases = [
      ["Bold", "Alpha beta 🦊", 0, 5, "**Alpha** beta 🦊", "Alpha"],
      ["Italic", "  metal\t ", 0, 9, "  *metal*\t ", "metal"],
      ["Strike-through", "metal", 0, 5, "~~metal~~", "metal"],
      ["Bold", "__metal__", 4, 4, "metal", ""],
      ["Italic", "_metal_", 3, 3, "metal", ""],
      ["Italic", "\\*literal\\*", 0, 11, "*\\*literal\\**", "\\*literal\\*"],
      ["Strike-through", "~metal~", 3, 3, "metal", ""],
      ["Strike-through", "~~metal~~", 0, 9, "metal", "metal"],
      ["Italic", "***metal***", 5, 5, "**metal**", ""],
      ["Bold", "***metal***", 5, 5, "*metal*", ""],
      ["Bold", "***metal***", 0, 11, "*metal*", "*metal*"],
      ["Italic", "***metal***", 0, 11, "**metal**", "**metal**"],
      ["Bold", "****metal****", 6, 6, "**metal**", ""],
      ["Bold", "**outer __inner__ end**", 12, 12, "**outer inner end**", ""],
      ["Bold", "**metal**", 3, 6, "metal", "eta"],
      ["Italic", "*metal*", 0, 7, "metal", "metal"],
      ["Bold", "*metal*", 0, 7, "***metal***", "*metal*"],
      ["Italic", "**metal**", 0, 9, "***metal***", "**metal**"],
      ["Bold", "  **metal**  ", 0, 13, "  metal  ", "  metal  "],
      ["Italic", "*first\nsecond*", 9, 9, "first\nsecond", ""],
      ["Italic", "*first\nsecond*", 0, 14, "first\nsecond", "first\nsecond"],
      ["Bold", "> **first\n> second**", 14, 14, "> first\n> second", ""],
      ["Bold", "- **first\n  second**", 14, 14, "- first\n  second", ""],
      ["Italic", "Title *metal*\n---", 9, 9, "Title metal\n---", ""],
      ["Bold", "> - ## __metal__ ###", 11, 11, "> - ## metal ###", ""],
      ["Italic", "- [ ] *metal*", 9, 9, "- [ ] metal", ""],
      ["Bold", "[**metal**](path(one) \"title\")", 5, 5, "[metal](path(one) \"title\")", ""],
      ["Italic", "[*metal*][id]\n\n[id]: /local", 4, 4, "[metal][id]\n\n[id]: /local", ""],
      ["Bold", "[metal](local)", 1, 6, "[**metal**](local)", "metal"],
      ["Italic", "![metal](local)", 2, 7, "![*metal*](local)", "metal"],
      ["Bold", "before `code` after", 7, 13, "before **`code`** after", "`code`"],
      ["Bold", "body <i>metal</i>", 8, 13, "body <i>**metal**</i>", "metal"],
      ["Bold", "| **one** | two |\n|---|---|", 5, 5, "| one | two |\n|---|---|", ""],
      ["Bold", "word__plain__word", 6, 11, "word__**plain**__word", "plain"],
      ["Bold", "🦊 café 日本語", 0, 2, "**🦊** café 日本語", "🦊"],
      ["Bold", ">\t__metal__", 6, 6, ">\tmetal", ""],
      ["Italic", "-\t_metal_", 5, 5, "-\tmetal", ""]
    ];
    for (const shape of ["blocks", "lf", "br"]) for (const [title, text, start, end, expected, selection] of cases) {
      await prepare(text, start, end, shape);
      await button(title).click();
      const label = `${name}/${shape}/${title}: ${JSON.stringify(text)}`;
      assert.equal(await get(), expected, label);
      assert.equal(await page.evaluate(() => getSelection().toString()), selection, label + ": selection");
      assert.equal(await count(), 1, label + ": one notification");
      await page.keyboard.press("Control+z"); assert.equal(await get(), text, label + ": undo");
      await page.keyboard.press("Control+Shift+z"); assert.equal(await get(), expected, label + ": redo");
      assert.equal(await count(), 3, label + ": undo/redo notifications");
    }

    const blocked = [
      ["`**literal**`", 5, 5], ["**`literal`**", 5, 5], ["before `literal`", 9, 12],
      ["[label](path**secret**)", 16, 16], ["[label](local \"**title**\")", 19, 19],
      ["[**label**][**id**]\n\n[**id**]: /local", 15, 15],
      ["body <i title='**literal**'>text</i>", 20, 20],
      ["<pre>\n**literal**\n</pre>", 10, 10], ["```\n**literal**\n```", 8, 8],
      ["    **literal**", 8, 8], ["[id]: path**secret**", 15, 15],
      ["https://example.invalid/x**literal**/tail", 28, 28],
      ["<https://example.invalid/x**literal**>", 28, 28],
      ["mail me@example.invalid now", 10, 10],
      ["first\nsecond", 0, 12], ["**first\n\nsecond**", 0, 17],
      ["> **first\n> second**", 10, 10], ["- **first\n  second**", 10, 10],
      ["plain", 1, 1, true], ["  \t ", 0, 4]
    ];
    for (const shape of ["blocks", "lf", "br"]) for (const [text, start, end, composing] of blocked) {
      await prepare(text, start, end, shape);
      if (composing) await source.dispatchEvent("compositionstart");
      for (const title of ["Bold", "Italic", "Strike-through"]) {
        assert.equal(await button(title).isDisabled(), true, `${name}/${shape}: protected ${JSON.stringify(text)}`);
        assert.equal(await button(title).getAttribute("aria-pressed"), "false");
        await button(title).evaluate(node => node.click());
      }
      // Shortcuts must respect the same guard even though invoke bypasses the
      // button's disabled DOM behavior. No browser rich-text fallback is allowed.
      await page.keyboard.press("Control+b"); await page.keyboard.press("Control+i");
      assert.equal(await get(), text); assert.equal(await count(), 0);
      if (composing) await source.dispatchEvent("compositionend");
    }

    for (const [title, text, at] of [["Bold", "__metal__", 4], ["Italic", "***metal***", 5], ["Strike-through", "~metal~", 3]]) {
      await prepare(text, at);
      assert.equal(await button(title).getAttribute("aria-pressed"), "true");
    }
    // Invalid or colliding delimiters stay literal. Never strip marker-shaped
    // text just because the selected string begins and ends with stars/tildes.
    for (const [title, text, start = 0] of [["Bold", "** spaced **"], ["Italic", "* spaced *"], ["Strike-through", "~~~literal~~~"], ["Bold", "bravo🦊", 5]]) {
      await prepare(text, start, text.length);
      if (await button(title).isEnabled()) {
        await button(title).click();
        assert.match(await page.getByRole("status").textContent(), /cannot format this selection/);
        assert.equal(await page.getByRole("status").isVisible(), true);
      }
      assert.equal(await get(), text); assert.equal(await count(), 0);
    }

    for (const [title, marker] of [["Bold", "**"], ["Italic", "*"], ["Strike-through", "~~"]]) for (const text of ["", "word"]) {
      const at = text ? 2 : 0;
      await prepare(text, at);
      await button(title).focus(); await page.keyboard.press("Space");
      assert.equal(await get(), text.slice(0, at) + marker.repeat(2) + text.slice(at));
      assert.equal(await page.evaluate(() => getSelection().isCollapsed), true);
      assert.equal(await button(title).isEnabled(), true, "empty pairs remain removable even when they look like fences");
      await button(title).click(); assert.equal(await get(), text);
      assert.equal(await count(), 2);
      await page.keyboard.press("Control+z"); assert.equal(await get(), text.slice(0, at) + marker.repeat(2) + text.slice(at));
      await page.keyboard.press("Control+z"); assert.equal(await get(), text);
    }
    await prepare("word", 2);
    await page.keyboard.press("Control+b"); await page.keyboard.type("metal");
    assert.equal(await get(), "wo**metal**rd");
    await page.keyboard.press("Control+b"); assert.equal(await get(), "wometalrd");
    await prepare("**word**", 4);
    await page.keyboard.press("Control+i"); assert.equal(await get(), "**wo**rd**");
    await page.keyboard.press("Control+i"); assert.equal(await get(), "**word**");

    for (const at of [2, 7]) {
      await prepare("**metal**", at);
      assert.equal(await button("Bold").getAttribute("aria-pressed"), "true");
      await page.keyboard.press("Control+b"); assert.equal(await get(), "metal");
      assert.equal(await count(), 1);
    }
    // Empty-pair affordances cannot leak through document replacement or
    // composition into a real tilde fence. Native history stays authoritative.
    for (const invalidate of ["replace", "composition", "input"]) {
      await prepare("", 0);
      await button("Strike-through").click(); assert.equal(await get(), "~~~~");
      if (invalidate === "replace") {
        await prepare("~~~~", 2);
      } else if (invalidate === "composition") {
        await source.dispatchEvent("compositionstart"); await source.dispatchEvent("compositionend");
      } else {
        await source.dispatchEvent("input");
      }
      assert.equal(await button("Strike-through").isDisabled(), true);
      assert.equal(await button("Bold").isDisabled(), true);
      assert.equal(await get(), "~~~~");
    }

    // Commands do not touch following source nodes, and custom results retain
    // their own eligibility even inside contexts blocked for built-in commands.
    await prepare("__metal__\n\nuntouched", 4);
    await page.evaluate(() => { window.__formatTail = __markdownEditor.content.lastChild; });
    await button("Bold").click();
    assert.equal(await page.evaluate(() => __formatTail === __markdownEditor.content.lastChild), true);
    await page.evaluate(() => {
      __markdownEditor.destroy();
      window.__customCalls = 0;
      window.__markdownEditor = maiden.init({ element: document.getElementById("editor"),
        actions: [{ name: "bold", result: () => __customCalls++, state: () => true }], onChange: value => __markdownChanges.push(value) });
    });
    await prepare("`literal`", 4);
    assert.equal(await button("Bold").isEnabled(), true);
    await button("Bold").click();
    assert.equal(await page.evaluate(() => __customCalls), 1);
    assert.equal(await get(), "`literal`"); assert.equal(await count(), 0);
    assert.deepEqual(errors, []); assert.deepEqual(remote, []);
    console.log(`${name}: M3 inline formatting, recognized nested/soft-line pairs, literal guards, selection, callbacks and native undo/redo: ok`);
  } finally { await page.close(); }
}
module.exports = { formattingChecks };
if (require.main === module) (async () => {
  const { chromium, firefox } = require("playwright");
  const { pathToFileURL } = require("node:url");
  const path = require("node:path");
  for (const [name, engine] of Object.entries({ chromium, firefox })) {
    const browser = await engine.launch();
    try { await formattingChecks(browser, pathToFileURL(path.resolve(__dirname, "..")).href, name); }
    finally { await browser.close(); }
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
