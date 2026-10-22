/* M3 code commands and prompt-free link templates, in real native DOM shapes. */
const assert = require("node:assert/strict");

async function codeChecks(browser, base, name) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  const errors = [], remote = [], dialogs = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("request", request => { if (/^https?:/.test(request.url()) && !request.url().startsWith(base + "/")) remote.push(request.url()); });
  page.on("dialog", dialog => { dialogs.push(dialog.message()); dialog.dismiss(); });
  try {
    await page.goto(base + "/tests/fixtures/markdown.html");
    await page.waitForFunction(() => window.__markdownEditor);
    const source = page.locator(".lightmarkdown-input");
    const button = title => page.getByRole("button", { name: title, exact: true });
    const get = () => page.evaluate(() => __markdownEditor.getMarkdown());
    const count = () => page.evaluate(() => __markdownChanges.length - __codeBefore);
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
      window.__codeBefore = __markdownChanges.length;
    }, { text, start, end, shape });
    const inline = [
      ["metal", 0, 5, "`metal`", "metal"],
      ["a ` b", 0, 5, "``a ` b``", "a ` b"],
      ["`metal", 0, 6, "`` `metal ``", "`metal"],
      ["  metal  ", 0, 9, "`   metal   `", "  metal  "],
      ["   ", 0, 3, "`   `", "   "],
      ["`   `", 0, 5, "   ", "   "],
      [" \t ", 0, 3, "`  \t  `", " \t "],
      ["`  \t  `", 0, 7, " \t ", " \t "],
      ["`` one`two ``", 4, 7, "one`two", "ne`"],
      ["``metal``", 4, 4, "metal", ""],
      ["``metal``", 0, 9, "metal", "metal"],
      ["`first\nsecond`", 9, 9, "first\nsecond", ""],
      ["` \n `", 0, 5, " \n ", " \n "],
      ["> ` \n>  `", 2, 9, ">  \n>  ", " \n>  "],
      [">\t` \n>\t `", 2, 9, ">\t \n>\t ", " \n>\t "],
      ["`\tmetal\t`", 3, 3, "\tmetal\t", ""],
      ["`first\nsecond`", 0, 14, "first\nsecond", "first\nsecond"],
      ["> `first\n> second`", 12, 12, "> first\n> second", ""],
      ["- `first\n  second`", 12, 12, "- first\n  second", ""],
      ["**`metal`**", 5, 5, "**metal**", ""],
      ["[metal](local)", 1, 6, "[`metal`](local)", "metal"],
      ["| `one` | two |\n|---|---|", 4, 4, "| one | two |\n|---|---|", ""],
      [">\t`metal`", 5, 5, ">\tmetal", ""],
      ["\\``one`", 4, 4, "\\`one", ""]
    ];
    const blocks = [
      ["metal", 2, 2, "```\nmetal\n```", ""],
      ["first\nsecond\nlast", 2, 9, "```\nfirst\nsecond\n```\nlast", "rst\nsec"],
      ["first\nsecond", 0, 6, "```\nfirst\n```\nsecond", "first"],
      ["", 0, 0, "```\n\n```", ""],
      ["first\n\nlast", 6, 6, "first\n```\n\n```\nlast", ""],
      ["  metal\t ", 4, 4, "```\n  metal\t \n```", ""],
      ["before ```` after", 8, 8, "`````\nbefore ```` after\n`````", ""],
      ["> metal", 4, 4, "> ```\n> metal\n> ```", ""],
      [">metal", 3, 3, ">```\n>metal\n>```", ""],
      ["- metal", 4, 4, "- ```\n  metal\n  ```", ""],
      ["12. metal", 6, 6, "12. ```\n    metal\n    ```", ""],
      ["> - metal\n>   second", 6, 15, "> - ```\n>   metal\n>   second\n>   ```", "tal\n>   s"],
      ["> first\nsecond", 2, 14, "> ```\n> first\n> second\n> ```", "first\n> second"],
      ["- first\nsecond", 2, 14, "- ```\n  first\n  second\n  ```", "first\n  second"],
      ["-\tmetal", 4, 4, "-\t```\n    metal\n    ```", ""],
      ["```js\nmetal\n```", 8, 8, "metal", ""],
      ["~~~js\nmetal\n~~~~", 0, 16, "metal", "metal"],
      ["before\n```\nmetal\n```\nafter", 8, 8, "before\nmetal\nafter", ""],
      ["```\nmetal", 6, 6, "metal", ""],
      ["```", 1, 1, "", ""],
      ["```\n```", 1, 1, "", ""],
      ["```\n\n```", 5, 5, "", ""],
      ["> ```\n> metal\n> ```", 16, 16, "> metal", ""],
      ["- ```js\n  metal\n  ```", 11, 11, "- metal", ""],
      ["> - ```\n>   metal\n>   ```", 12, 12, "> - metal", ""],
      ["- ```\n  ```", 3, 3, "- ", ""]
    ];
    for (const shape of ["blocks", "lf", "br"]) for (const [title, cases] of [["Inline Code", inline], ["Code Block", blocks]]) {
      for (const [text, start, end, expected, selection] of cases) {
        await prepare(text, start, end, shape);
        const label = `${name}/${shape}/${title}: ${JSON.stringify(text)}`;
        assert.equal(await button(title).isEnabled(), true, label + ": enabled");
        await button(title).click();
        assert.equal(await get(), expected, label);
        assert.equal(await page.evaluate(() => getSelection().toString()), selection, label + ": selection");
        assert.equal(await count(), 1, label + ": one notification");
        await page.keyboard.press("Control+z"); assert.equal(await get(), text, label + ": undo");
        await page.keyboard.press("Control+Shift+z"); assert.equal(await get(), expected, label + ": redo");
        assert.equal(await count(), 3);
      }
    }

    for (const shape of ["blocks", "lf", "br"]) {
      for (const [text, start, end = start] of [
        ["```\nliteral\n```", 7], ["<pre>\nliteral\n</pre>", 9], ["    literal", 7],
        ["[label](local)", 10], ["[label](local \"title\")", 17],
        ["[id]: /local", 7], ["body <i title='literal'>text</i>", 17],
        ["https://example.invalid/path", 10], ["<https://example.invalid>", 10],
        ["> `first\n> second`", 9], ["- `first\n  second`", 9],
        ["`metal`", 0, 4], ["first\nsecond", 0, 12], ["`first\n\nsecond`", 0, 15]
      ]) {
        await prepare(text, start, end, shape);
        assert.equal(await button("Inline Code").isDisabled(), true, `${name}/${shape}: protected ${JSON.stringify(text)}`);
        assert.equal(await button("Inline Code").getAttribute("aria-pressed"), "false");
        await page.keyboard.press("Control+`"); assert.equal(await get(), text); assert.equal(await count(), 0);
      }
      for (const [text, start, end] of [
        ["<pre>\nliteral\n</pre>", 9, 9], ["    literal", 7, 7],
        ["before\n```\nliteral\n```", 0, 17], ["- first\n- second", 2, 16],
        ["> first\nsecond\n\noutside", 2, 22]
      ]) {
        await prepare(text, start, end, shape);
        assert.equal(await button("Code Block").isDisabled(), true, `${name}/${shape}: ambiguous block ${JSON.stringify(text)}`);
        await button("Code Block").evaluate(node => node.click()); assert.equal(await get(), text); assert.equal(await count(), 0);
      }
    }
    for (const [text, at] of [["``metal``", 4], ["`metal`", 1], ["`metal`", 6], ["`first\nsecond`", 9]]) {
      await prepare(text, at);
      assert.equal(await button("Inline Code").getAttribute("aria-pressed"), "true");
      await page.keyboard.press("Control+`"); assert.equal((await get()).includes("`"), false);
    }
    for (const [text, start, end] of [["\\`one`", 2, 5], ["metal`", 0, 5]]) {
      await prepare(text, start, end); await button("Inline Code").click();
      assert.equal(await get(), text); assert.equal(await count(), 0);
      assert.match(await page.getByRole("status").textContent(), /cannot format this selection/);
    }
    for (const text of ["", "word"]) {
      const at = text ? 2 : 0;
      await prepare(text, at);
      await button("Inline Code").focus(); await page.keyboard.press("Space");
      assert.equal(await get(), text.slice(0, at) + "``" + text.slice(at));
      await page.keyboard.press("Control+`"); assert.equal(await get(), text);
      assert.equal(await count(), 2);
      await page.keyboard.press("Control+z"); assert.equal(await get(), text.slice(0, at) + "``" + text.slice(at));
      await page.keyboard.press("Control+z"); assert.equal(await get(), text);
    }
    await prepare("metal", 2);
    await page.keyboard.press("Control+`"); await page.keyboard.type("code");
    assert.equal(await get(), "me`code`tal");
    await page.keyboard.press("Control+`"); assert.equal(await get(), "mecodetal");
    for (const invalidate of ["replace", "composition", "input"]) {
      await prepare("", 0); await button("Inline Code").click();
      if (invalidate === "replace") await prepare("``", 1);
      else if (invalidate === "composition") { await source.dispatchEvent("compositionstart"); await source.dispatchEvent("compositionend"); }
      else await source.dispatchEvent("input");
      await page.keyboard.press("Control+`"); assert.equal(await get(), "````", "old empty pairs are not recognized spans");
    }
    for (const text of ["metal", "", "- metal", "> metal", "12. metal"]) {
      await prepare(text, text.length);
      await button("Code Block").focus(); await page.keyboard.press("Enter");
      assert.equal(await button("Code Block").getAttribute("aria-pressed"), "true");
      await button("Code Block").click(); assert.equal(await get(), text);
      assert.equal(await button("Code Block").getAttribute("aria-pressed"), "false");
    }
    for (const title of ["Inline Code", "Code Block", "Link"]) {
      await prepare("metal", 2); await source.dispatchEvent("compositionstart");
      assert.equal(await button(title).isDisabled(), true);
      await button(title).evaluate(node => node.click());
      await page.keyboard.press("Control+`"); await page.keyboard.press("Control+k");
      assert.equal(await get(), "metal"); assert.equal(await count(), 0);
      await source.dispatchEvent("compositionend");
    }

    for (const shape of ["blocks", "lf", "br"]) for (const [text, start, end, expected] of [
      ["", 0, 0, "[link](https://www.example.com)"],
      ["before after", 7, 7, "before [link](https://www.example.com)after"],
      ["metal", 0, 5, "[metal](https://www.example.com)"],
      ["a[b]\\c", 0, 6, "[a\\[b\\]\\\\c](https://www.example.com)"],
      ["first\nmetal\nlast", 6, 11, "first\n[metal](https://www.example.com)\nlast"]
    ]) {
      await prepare(text, start, end, shape); await page.keyboard.press("Control+k");
      const label = `${name}/${shape}: template ${JSON.stringify(text)}`;
      assert.equal(await get(), expected, label);
      assert.equal(await page.evaluate(() => getSelection().toString()), "https://www.example.com");
      assert.equal(await count(), 1);
      await page.keyboard.press("Control+z"); assert.equal(await get(), text);
      await page.keyboard.press("Control+Shift+z"); assert.equal(await get(), expected);
    }
    await prepare("label", 0, 5); await button("Link").focus(); await page.keyboard.press("Space");
    await page.keyboard.type("/local"); assert.equal(await get(), "[label](/local)");
    await prepare("first\nsecond", 0, 12); await page.keyboard.press("Control+k");
    assert.equal(await get(), "first\nsecond"); assert.equal(await count(), 0);

    // Commands leave unrelated live nodes intact. Overrides keep their own
    // eligibility, even when the named built-in is disabled in literal source.
    await prepare("metal\n\nuntouched", 2);
    await page.evaluate(() => { window.__codeTail = __markdownEditor.content.lastChild; });
    await button("Code Block").click();
    assert.equal(await page.evaluate(() => __codeTail === __markdownEditor.content.lastChild), true);
    await page.evaluate(() => {
      __markdownEditor.destroy(); window.__customCalls = 0;
      window.__markdownEditor = maiden.init({ element: document.getElementById("editor"),
        actions: ["code", "codeblock", "link"].map(name => ({ name, result: () => __customCalls++, state: () => true })),
        onChange: value => __markdownChanges.push(value) });
    });
    await prepare("<pre>\nliteral\n</pre>", 9);
    for (const title of ["Inline Code", "Code Block", "Link"]) {
      assert.equal(await button(title).isEnabled(), true); await button(title).click();
    }
    assert.equal(await page.evaluate(() => __customCalls), 3); assert.equal(await count(), 0);
    assert.deepEqual(errors, []); assert.deepEqual(remote, []); assert.deepEqual(dialogs, []);
    console.log(`${name}: M3 recognized inline/fenced code, containers, literal guards, template links, selection, callbacks and native undo/redo: ok`);
  } finally { await page.close(); }
}
module.exports = { codeChecks };
if (require.main === module) (async () => {
  const { chromium, firefox } = require("playwright");
  const { pathToFileURL } = require("node:url");
  const path = require("node:path");
  for (const [name, engine] of Object.entries({ chromium, firefox })) {
    const browser = await engine.launch();
    try { await codeChecks(browser, pathToFileURL(path.resolve(__dirname, "..")).href, name); }
    finally { await browser.close(); }
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
