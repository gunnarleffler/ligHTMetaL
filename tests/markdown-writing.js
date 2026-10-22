/* Recognized list/task/quote commands and Enter ergonomics in real browsers. */
const assert = require("node:assert/strict");

async function writingChecks(browser, base, name) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  const errors = [], remote = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("request", request => { if (/^https?:/.test(request.url()) && !request.url().startsWith(base + "/")) remote.push(request.url()); });
  try {
    await page.goto(base + "/tests/fixtures/markdown.html");
    await page.waitForFunction(() => window.__markdownEditor);
    await page.evaluate(() => {
      __markdownEditor.destroy();
      window.__markdownEditor = maiden.init({ element: document.getElementById("editor"),
        actions: ["ulist", "olist", "quote", "checklist", "task-toggle", "undo", "redo"],
        onChange: value => __markdownChanges.push(value) });
    });
    const source = page.locator(".lightmarkdown-input");
    const button = title => page.getByRole("button", { name: title, exact: true });
    const get = () => page.evaluate(() => __markdownEditor.getMarkdown());
    const count = () => page.evaluate(() => __markdownChanges.length - __writingBefore);
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
      source.dispatchEvent(new Event("focus")); window.__writingBefore = __markdownChanges.length;
    }, { text, start, end, shape });
    const cases = [
      ["Unordered List", "metal", 2, 2, "- metal", ""],
      ["Ordered List", "one\ntwo\nthree", 0, 13, "1. one\n2. two\n3. three", "one\n2. two\n3. three"],
      ["Unordered List", "> metal", 4, 4, "> - metal", ""],
      ["Ordered List", "> one\nsecond", 2, 12, "> 1. one\n> 2. second", "one\n> 2. second"],
      ["Unordered List", "- first\n  second", 12, 12, "first\nsecond", ""],
      ["Ordered List", "- first\n  second\n  - child", 12, 12, "1. first\n   second\n   - child", ""],
      ["Unordered List", "12) first\n    second\n    - child", 6, 6, "- first\n  second\n  - child", ""],
      ["Unordered List", "- outer\n  - inner\n    body\n- next", 14, 14, "- outer\n  inner\n  body\n- next", ""],
      ["Unordered List", "- outer\n  - inner\n    body", 0, 26, "outer\n- inner\n  body", "outer\n- inner\n  body"],
      ["Unordered List", "  - first\n    second", 6, 6, "  first\n  second", ""],
      ["Ordered List", "-\tfirst\n\tsecond", 3, 3, "1.\tfirst\n\tsecond", ""],
      ["Unordered List", "- [X] done\n  later", 8, 8, "done\nlater", ""],
      ["Ordered List", "- [X] done", 8, 8, "1. [X] done", ""],
      ["Task List", "metal", 2, 2, "- [ ] metal", ""],
      ["Task List", "- metal", 4, 4, "- [ ] metal", ""],
      ["Task List", "-", 1, 1, "- [ ] ", ""],
      ["Task List", "> 2) metal", 7, 7, "> 2) [ ] metal", ""],
      ["Task List", "- [x] metal", 7, 7, "- metal", ""],
      ["Task List", "- [\t]\tmetal", 8, 8, "- metal", ""],
      ["Task List", "- first\n  later", 12, 12, "- [ ] first\n  later", ""],
      ["Toggle Task", "- [ ] metal", 8, 8, "- [x] metal", ""],
      ["Toggle Task", "- [X] metal", 8, 8, "- [ ] metal", ""],
      ["Toggle Task", "- [ ] one\n- [x] two", 0, 19, "- [x] one\n- [x] two", "- [x] one\n- [x] two"],
      ["Toggle Task", "-\n  [ ] metal", 9, 9, "-\n  [x] metal", ""],
      ["Toggle Task", "- [X] parent\n  - [ ] child", 0, 26, "- [X] parent\n  - [x] child", "- [X] parent\n  - [x] child"],
      ["Task List", "- parent\n  - child", 0, 18, "- [ ] parent\n  - [ ] child", "- [ ] parent\n  - [ ] child"],
      ["Quote", "metal", 2, 2, "> metal", ""],
      ["Quote", "- first\n  later\n  - child", 11, 11, "> - first\n>   later\n>   - child", ""],
      ["Quote", "> - first\n>   later", 15, 15, "- first\n  later", ""],
      ["Quote", "> first\nlazy", 10, 10, "first\nlazy", ""],
      ["Quote", "> > first\n> > second", 7, 7, "> first\n> second", ""],
      ["Quote", "- parent\n  - child", 15, 15, "- parent\n  > - child", ""],
      ["Quote", "  > metal", 6, 6, "  metal", ""],
      ["Quote", ">\tmetal", 4, 4, "  metal", ""],
      ["Unordered List", "- first\n  ```\n  literal\n  ```\n\nafter", 4, 4, "first\n```\nliteral\n```\n\nafter", ""],
      ["Quote", "> first\n> ```\n> literal\n> ```", 4, 4, "first\n```\nliteral\n```", ""]
    ];
    const enters = [
      ["- metal", 7, 7, "Enter", "- metal\n- "],
      ["- \u00a0", 3, 3, "Enter", "- \u00a0\n- "],
      ["> \ufeff", 3, 3, "Enter", "> \ufeff\n> "],
      ["+ metal", 4, 4, "Enter", "+ me\n+ tal"],
      ["9) metal\n10) existing", 8, 8, "Enter", "9) metal\n10) \n10) existing"],
      ["009. metal", 10, 10, "Enter", "009. metal\n010. "],
      ["-\tmetal", 7, 7, "Enter", "-\tmetal\n-\t"],
      ["> - metal", 9, 9, "Enter", "> - metal\n> - "],
      ["- outer\n  - inner", 17, 17, "Enter", "- outer\n  - inner\n  - "],
      ["- first\n  second", 16, 16, "Enter", "- first\n  second\n- "],
      ["- first\nlazy", 12, 12, "Enter", "- first\nlazy\n- "],
      ["- [x] done", 10, 10, "Enter", "- [x] done\n- [ ] "],
      ["- [X] metal", 8, 8, "Enter", "- [X] me\n- [ ] tal"],
      ["> quote", 7, 7, "Enter", "> quote\n> "],
      ["> > quote", 9, 9, "Enter", "> > quote\n> > "],
      ["- > quote", 9, 9, "Enter", "- > quote\n  > "],
      ["- ", 2, 2, "Enter", ""],
      ["- [ ] ", 6, 6, "Enter", ""],
      ["> - [x] ", 8, 8, "Enter", "> "],
      ["- outer\n\n  - ", 13, 13, "Enter", "- outer\n\n  "],
      ["> ", 2, 2, "Enter", ""],
      ["> > ", 4, 4, "Enter", "> "],
      ["- > ", 4, 4, "Enter", "- "],
      ["- metal", 7, 7, "Shift+Enter", "- metal\n"],
      ["> quote", 4, 4, "Shift+Enter", "> qu\note"],
      ["- metal", 3, 6, "Enter", "- m\n- l"],
      ["- a  b", 3, 5, "Enter", "- a\n- b"],
      ["plain", 2, 2, "Shift+Enter", "pl\nain"]
    ];
    for (const shape of ["blocks", "lf", "br"]) {
      for (const [title, text, start, end, expected, selection] of cases) {
        await prepare(text, start, end, shape);
        const label = `${name}/${shape}/${title}: ${JSON.stringify(text)}`;
        assert.equal(await button(title).isEnabled(), true, label + ": enabled");
        await button(title).click(); assert.equal(await get(), expected, label);
        assert.equal(await page.evaluate(() => getSelection().toString()), selection, label + ": selection");
        assert.equal(await count(), 1, label + ": one notification");
        await page.keyboard.press("Control+z"); assert.equal(await get(), text, label + ": undo");
        await page.keyboard.press("Control+Shift+z"); assert.equal(await get(), expected, label + ": redo");
        assert.equal(await count(), 3, label + ": undo/redo notifications");
      }
      for (const [text, start, end, key, expected] of enters) {
        await prepare(text, start, end, shape);
        const label = `${name}/${shape}/${key}: ${JSON.stringify(text)}`;
        await page.keyboard.press(key); assert.equal(await get(), expected, label);
        assert.equal(await page.evaluate(() => getSelection().isCollapsed), true);
        assert.equal(await count(), 1, label + ": one notification");
        await page.keyboard.press("Control+z"); assert.equal(await get(), text, label + ": undo");
        await page.keyboard.press("Control+Shift+z"); assert.equal(await get(), expected, label + ": redo");
      }
      for (const [text, at] of [["```\nliteral\n```", 8], ["<pre>\nliteral\n</pre>", 9], ["    literal", 8]]) {
        await prepare(text, at, at, shape);
        for (const title of ["Unordered List", "Ordered List", "Quote", "Task List", "Toggle Task"]) {
          assert.equal(await button(title).isDisabled(), true, `${name}/${shape}: literal guard ${title}`);
          await button(title).evaluate(node => node.click());
        }
        assert.equal(await get(), text); assert.equal(await count(), 0);
      }
    }
    // Selection snapshots stay local: ordinary list types share units, while
    // quote and task controls keep their own ownership and filtering rules.
    const states = async expected => {
      await page.waitForFunction(expected => {
        const titles = ["Unordered List", "Ordered List", "Quote", "Task List", "Toggle Task"];
        return titles.every((title, index) => document.querySelector(`button[aria-label="${title}"]`).getAttribute("aria-pressed") === String(expected[index]));
      }, expected);
    };
    for (const shape of ["blocks", "lf", "br"]) {
      const mixed = "- one\n2. two";
      await prepare(mixed, 0, mixed.length, shape); await states([false, false, false, false, false]);
      await page.keyboard.press("Control+Home"); await states([true, false, false, false, false]);
      await page.keyboard.press("Control+End"); await states([false, true, false, false, false]);
      await page.keyboard.press("Control+Shift+Home"); await states([false, false, false, false, false]);
      assert.equal(await get(), mixed); assert.equal(await count(), 0);
      const tasks = "> - [X] parent\n>   - [ ] child";
      await prepare(tasks, 0, tasks.length, shape); await states([true, false, true, true, false]);
      assert.equal(await get(), tasks); assert.equal(await count(), 0);
    }
    for (const [text, at, title] of [["metal", 2, "Toggle Task"], ["- # heading", 6, "Task List"], ["- [y] metal", 8, "Toggle Task"]]) {
      await prepare(text, at); assert.equal(await button(title).isDisabled(), true);
      await button(title).evaluate(node => node.click()); assert.equal(await count(), 0);
    }
    for (const [text, at, title] of [["> metal", 5, "Quote"], ["- first\n  second", 12, "Unordered List"],
      ["12) metal", 5, "Ordered List"], ["- [x] done", 8, "Task List"], ["- [X] done", 8, "Toggle Task"]]) {
      await prepare(text, at); assert.equal(await button(title).getAttribute("aria-pressed"), "true");
    }
    for (const text of ["---", "--"]) {
      await prepare(text, 1); await button("Unordered List").click();
      assert.equal(await get(), text); assert.equal(await count(), 0);
      assert.match(await page.getByRole("status").textContent(), /cannot format this selection/);
    }
    for (const [title, text, expected, key] of [
      ["Unordered List", "metal", "- metal", "Enter"],
      ["Ordered List", "metal", "1. metal", "Space"],
      ["Quote", "metal", "> metal", "Space"],
      ["Task List", "metal", "- [ ] metal", "Space"],
      ["Toggle Task", "- [ ] metal", "- [x] metal", "Enter"]
    ]) {
      await prepare(text, text.length); await button(title).focus(); await page.keyboard.press(key);
      assert.equal(await get(), expected); assert.equal(await count(), 1);
      await page.keyboard.press("Control+z"); assert.equal(await get(), text);
    }
    await prepare("one\ntwo", 0, 4); await button("Unordered List").click(); assert.equal(await get(), "- one\ntwo");
    await prepare("- [ ] one\n- two", 0, 15); await button("Task List").click(); assert.equal(await get(), "- [ ] one\n- [ ] two");
    await prepare("- first\nsecond", 12); await button("Quote").click(); assert.equal(await get(), "> - first\n> second");
    await prepare("- metal", 7);
    await page.evaluate(() => __markdownEditor.content.dispatchEvent(new InputEvent("beforeinput", { inputType: "insertParagraph", bubbles: true, cancelable: true })));
    assert.equal(await get(), "- metal\n- "); assert.equal(await count(), 1);
    for (const mode of ["noncancelable", "prevented", "composition"]) {
      await prepare("- metal", 7);
      await page.evaluate(mode => {
        const event = new InputEvent("beforeinput", { inputType: "insertParagraph", bubbles: true,
          cancelable: mode !== "noncancelable", isComposing: mode === "composition" });
        if (mode === "prevented") event.preventDefault();
        __markdownEditor.content.dispatchEvent(event);
      }, mode);
      assert.equal(await get(), "- metal"); assert.equal(await count(), 0);
    }
    for (const title of ["Unordered List", "Task List", "Toggle Task", "Quote"]) {
      await prepare("- [ ] metal", 9); await source.dispatchEvent("compositionstart");
      assert.equal(await button(title).isDisabled(), true); await button(title).evaluate(node => node.click());
      await source.dispatchEvent("keydown", { key: "Enter", isComposing: true });
      assert.equal(await get(), "- [ ] metal"); assert.equal(await count(), 0);
      await source.dispatchEvent("compositionend");
    }
    // Native input in literal source does not gain list/task/quote markers.
    for (const [text, line, column, expected] of [
      ["```\n- literal\n```", 1, 9, "```\n- literal\n\n```"],
      ["- `literal`", 0, 6, "- `lit\neral`"],
      ["- <i title='literal'>text</i>", 0, 16, "- <i title='lite\nral'>text</i>"]
    ]) {
      const at = text.split("\n").slice(0, line).reduce((n, value) => n + value.length + 1, 0) + column;
      await prepare(text, at); await page.keyboard.press("Enter"); assert.equal(await get(), expected);
    }
    await prepare("- metal\n\nuntouched", 4);
    await page.evaluate(() => { window.__writingTail = __markdownEditor.content.lastChild; });
    await button("Ordered List").click();
    assert.equal(await page.evaluate(() => __writingTail === __markdownEditor.content.lastChild), true);
    await prepare("- metal", 7);
    await page.evaluate(() => {
      const content = __markdownEditor.content; __markdownEditor.destroy();
      content.dispatchEvent(new InputEvent("beforeinput", { inputType: "insertParagraph", bubbles: true, cancelable: true }));
      content.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    });
    assert.equal(await get(), "- metal"); assert.equal(await count(), 0);
    // Custom result/state callbacks keep application-defined behavior.
    await page.evaluate(() => {
      __markdownEditor.destroy(); window.__writingCalls = 0;
      window.__markdownEditor = maiden.init({ element: document.getElementById("editor"),
        actions: ["ulist", "quote", "checklist", "task-toggle"].map(name => ({ name, result: () => __writingCalls++, state: () => true })),
        onChange: value => __markdownChanges.push(value) });
    });
    await prepare("```\nliteral\n```", 8);
    for (const title of ["Unordered List", "Quote", "Task List", "Toggle Task"]) {
      assert.equal(await button(title).isEnabled(), true); await button(title).focus(); await page.keyboard.press("Space");
    }
    assert.equal(await page.evaluate(() => __writingCalls), 4); assert.equal(await count(), 0);
    assert.deepEqual(errors, []); assert.deepEqual(remote, []);
    console.log(`${name}: M3 list/task/quote units, continuation/exit, literal guards, selection, callbacks and native history: ok`);
  } finally { await page.close(); }
}
module.exports = { writingChecks };
if (require.main === module) (async () => {
  const { chromium, firefox } = require("playwright");
  const { pathToFileURL } = require("node:url");
  const path = require("node:path");
  for (const [name, engine] of Object.entries({ chromium, firefox })) {
    const browser = await engine.launch();
    try { await writingChecks(browser, pathToFileURL(path.resolve(__dirname, "..")).href, name); }
    finally { await browser.close(); }
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
