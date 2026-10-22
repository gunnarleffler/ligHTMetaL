/* M3 heading commands through native editing, including LF/BR paste shapes. */
const assert = require("node:assert/strict");

async function headingChecks(browser, base, name) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  try {
    await page.goto(base + "/tests/fixtures/markdown.html");
    await page.waitForFunction(() => window.__markdownEditor);
    await page.evaluate(() => {
      __markdownEditor.destroy();
      window.__markdownChanges = [];
      window.__markdownEditor = maiden.init({ element: document.getElementById("editor"),
        actions: ["heading1", "heading2", "heading3", "heading4", "heading5", "heading6", "paragraph", "heading", "heading-smaller", "heading-bigger", "undo", "redo"],
        onChange: value => __markdownChanges.push(value) });
    });
    const get = () => page.evaluate(() => __markdownEditor.getMarkdown());
    const button = title => page.getByRole("button", { name: title, exact: true });
    const prepare = (text, start, end = start, shape = "blocks") => page.evaluate(({ text, start, end, shape }) => {
      const api = __markdownEditor, source = api.content;
      api.setMarkdown(text);
      if (shape !== "blocks") {
        const block = document.createElement("div");
        if (shape === "lf") block.append(document.createTextNode(text));
        else text.split("\n").forEach((line, i) => {
          if (i) block.append(document.createElement("br"));
          const span = document.createElement("span"); span.append(document.createTextNode(line)); block.append(span);
        });
        block.append(document.createElement("br")); source.replaceChildren(block);
        source.dispatchEvent(new Event("input", { bubbles: true }));
      }
      function point([line, column]) {
        if (shape === "lf") return [source.firstChild.firstChild, text.split("\n").slice(0, line).reduce((n, line) => n + line.length + 1, 0) + column];
        const node = shape === "br" ? source.querySelectorAll("span")[line].firstChild : source.children[line].firstChild;
        return node.nodeName === "BR" ? [node.parentNode, 0] : [node, column];
      }
      const range = document.createRange(); range.setStart(...point(start)); range.setEnd(...point(end));
      source.focus(); getSelection().removeAllRanges(); getSelection().addRange(range);
      source.dispatchEvent(new Event("focus"));
      window.__headingBefore = __markdownChanges.length;
    }, { text, start, end, shape });

    const cases = [
      { text: "before\n  title 🦊  \nafter", start: [1, 2], end: [1, 10], action: "Heading 3", expected: "before\n  ### title 🦊  \nafter", selection: "title 🦊" },
      { text: "  ## title ###  ", start: [0, 7], action: "Paragraph", expected: "  title  ", selection: "" },
      { text: "## ###  ", start: [0, 3], action: "Paragraph", expected: "  " },
      { text: "-\t# title", start: [0, 6], action: "Heading 3", expected: "-\t### title" },
      { text: ">\t title", start: [0, 5], action: "Heading 2", expected: ">\t ## title" },
      { text: "first\n    second", start: [0, 2], end: [1, 6], action: "Heading 2", expected: "## first\n    second" },
      { text: "first\n\tsecond", start: [0, 2], end: [1, 4], action: "Heading 3", expected: "### first\n\tsecond" },
      { text: "> first\n>     second", start: [0, 4], end: [1, 8], action: "Heading 2", expected: "> ## first\n>     second" },
      { text: "- first\n      second", start: [0, 4], end: [1, 8], action: "Heading 2", expected: "- ## first\n      second" },
      { text: "first\n    second", start: [0, 2], end: [1, 6], action: "Cycle Heading", expected: "# first\n    second" },
      { text: "# first\n    ## second", start: [0, 4], end: [1, 9], action: "Paragraph", expected: "first\n    ## second" },
      { text: "   title", start: [0, 5], action: "Heading 2", expected: "   ## title" },
      { text: "## attached###", start: [0, 5], action: "Paragraph", expected: "attached###" },
      { text: "# title \\#", start: [0, 4], action: "Paragraph", expected: "title \\#" },
      { text: "#\ttitle\t ", start: [0, 3], action: "Heading 6", expected: "######\ttitle\t " },
      { text: "  ##", start: [0, 4], action: "Heading 3", expected: "  ### " },
      { text: "", start: [0, 0], action: "Heading 1", expected: "# " },
      { text: "alpha\nbeta\ngamma", start: [0, 2], end: [2, 0], action: "Heading 2", expected: "## alpha\n## beta\ngamma", selection: "pha\n## beta\n" },
      { text: "Title\n---\n\nbody", start: [1, 1], action: "Heading 3", expected: "### Title\n\nbody", selection: "" },
      { text: "Title\n---\n\nbody", start: [0, 1], end: [1, 2], action: "Heading 3", expected: "### Title\n\nbody", selection: "itle" },
      { text: "Title\n---", start: [0, 1], end: [1, 2], action: "Heading 3", expected: "### Title", selection: "itle" },
      { text: "> - Title\n>   ---\n>   tail", start: [0, 5], end: [1, 5], action: "Heading 3", expected: "> - ### Title\n>   tail", selection: "itle" },
      { text: "First\nSecond\n===", start: [1, 2], action: "Heading 2", expected: "## First\n## Second" },
      { text: "First\nSecond\n---\n\nbody", start: [0, 1], action: "Paragraph", expected: "First\nSecond\n\nbody" },
      { text: "> - Title\n>   ---\n>   tail", start: [1, 5], action: "Heading 3", expected: "> - ### Title\n>   tail" },
      { text: "> - ## title\n>   more", start: [0, 9], action: "Paragraph", expected: "> - title\n>   more" },
      { text: "- first\n  second", start: [1, 3], action: "Heading 4", expected: "- first\n  #### second" },
      { text: "> first\nsecond", start: [1, 2], action: "Heading 3", expected: "> first\n> ### second" },
      { text: "- first\n second", start: [1, 3], action: "Heading 2", expected: "- first\n  ## second" },
      { text: "- > first\nsecond", start: [1, 3], action: "Heading 4", expected: "- > first\n  > #### second" },
      { text: ">\t## title", start: [0, 6], action: "Heading 5", expected: ">\t##### title" },
      { text: "plain\n# one\n###### six", start: [0, 0], end: [2, 10], action: "Smaller Heading", expected: "# plain\n## one\nsix" },
      { text: "plain\n# one\n###### six", start: [0, 0], end: [2, 10], action: "Bigger Heading", expected: "###### plain\none\n##### six" },
      { text: "plain", start: [0, 2], action: "Cycle Heading", expected: "# plain" },
      { text: "```\n# literal\n```\nplain", start: [0, 0], end: [3, 5], action: "Heading 2", expected: "```\n# literal\n```\n## plain" },
      { text: "    # literal\n\nplain", start: [0, 0], end: [2, 5], action: "Heading 3", expected: "    # literal\n### \n### plain" },
      { text: "<pre>\n# literal\n</pre>\n\nplain", start: [0, 0], end: [4, 5], action: "Heading 1", expected: "<pre>\n# literal\n</pre>\n# \n# plain" }
    ];
    for (const shape of ["blocks", "lf", "br"]) for (const test of cases) {
      await prepare(test.text, test.start, test.end, shape);
      await button(test.action).click();
      assert.equal(await get(), test.expected, `${name}/${shape}: ${test.action} on ${JSON.stringify(test.text)}`);
      if (test.selection != null) assert.equal(await page.evaluate(() => getSelection().toString()), test.selection);
      assert.equal(await page.evaluate(() => __markdownChanges.length - __headingBefore), 1, "one command notification");
      const level = /^Heading ([1-6])$/.exec(test.action)?.[1];
      if (level) assert.equal(await button(test.action).getAttribute("aria-pressed"), "true", `${shape}: inserted headings must be recognized in ${JSON.stringify(test.text)}`);
      await page.keyboard.press("Control+z"); assert.equal(await get(), test.text, "one native undo restores source");
      await page.keyboard.press("Control+Shift+z"); assert.equal(await get(), test.expected, "native redo restores command");
    }

    // Four-column indentation stays untouched, including paragraph continuations
    // and indentation relative to a container. Tabs use Markdown column stops.
    for (const shape of ["blocks", "lf", "br"]) for (const [text, start, end = start] of [
      ["first\n    second", [1, 6]],
      ["first\n\tsecond", [1, 3]],
      ["first\n \tsecond", [1, 4]],
      ["> first\n>     second", [1, 8]],
      ["- first\n      second", [1, 8]],
      ["first\n    second\n    third", [1, 4], [2, 9]]
    ]) {
      await prepare(text, start, end, shape);
      for (const title of ["Heading 1", "Heading 2", "Heading 3", "Heading 4", "Heading 5", "Heading 6", "Paragraph", "Cycle Heading", "Smaller Heading", "Bigger Heading"]) {
        assert.equal(await button(title).isDisabled(), true, `${name}/${shape}: ${title} must skip indented lines`);
        await button(title).evaluate(node => node.click());
      }
      assert.equal(await get(), text);
      assert.equal(await page.evaluate(() => __markdownChanges.length - __headingBefore), 0, "skipped lines must not notify");
    }

    for (const [title, levels] of [["Smaller Heading", [1, 2, 3, 4, 5, 6, 0]], ["Bigger Heading", [6, 5, 4, 3, 2, 1, 0]]]) {
      await prepare("word", [0, 2]);
      for (const level of levels) {
        await button(title).click();
        assert.equal(await get(), (level ? "#".repeat(level) + " " : "") + "word");
        assert.equal(await page.evaluate(() => getSelection().isCollapsed), true, "cycles preserve a collapsed caret");
      }
    }
    // Direct setters repeat without text changes, notifications, or extra history.
    await prepare("plain", [0, 0], [0, 5]);
    await button("Heading 3").focus(); await page.keyboard.press("Enter");
    assert.equal(await get(), "### plain");
    await button("Heading 3").click();
    assert.equal(await page.evaluate(() => __markdownChanges.length - __headingBefore), 1);
    await page.keyboard.press("Control+z"); assert.equal(await get(), "plain");
    for (const [text, at, title] of [["## title", [0, 5], "Heading 2"], ["Title\n---", [1, 2], "Heading 2"], ["> - Title\n>   ===", [0, 6], "Heading 1"]]) {
      await prepare(text, at);
      await page.waitForFunction(title => [...document.querySelectorAll("button")].find(node => node.title === title).getAttribute("aria-pressed") === "true", title);
    }
    await prepare("# one\n## two", [0, 2], [1, 6]);
    assert.equal(await button("Heading 1").getAttribute("aria-pressed"), "false");
    assert.equal(await button("Heading 2").getAttribute("aria-pressed"), "false");
    for (const text of ["```\n# literal\n```", "    # literal", "<pre>\n# literal\n</pre>"]) {
      const line = text.includes("\n") ? 1 : 0;
      await prepare(text, [line, 3]);
      assert.equal(await button("Heading 2").isDisabled(), true);
      assert.equal(await button("Paragraph").isDisabled(), true);
    }
    await prepare("Title\n---", [0, 2]);
    await page.locator(".lightmarkdown-input").dispatchEvent("compositionstart");
    assert.equal(await button("Heading 2").isDisabled(), true);
    await page.locator(".lightmarkdown-input").dispatchEvent("compositionend");
    assert.equal(await button("Heading 2").isDisabled(), false);
    assert.deepEqual(errors, []);
    console.log(`${name}: M3 heading setters/cycles, Setext/container conversion, selection, state, callbacks and native undo/redo: ok`);
  } finally { await page.close(); }
}

module.exports = { headingChecks };
if (require.main === module) (async () => {
  const { chromium, firefox } = require("playwright");
  const { pathToFileURL } = require("node:url");
  const path = require("node:path");
  for (const [name, engine] of Object.entries({ chromium, firefox })) {
    const browser = await engine.launch();
    try { await headingChecks(browser, pathToFileURL(path.resolve(__dirname, "..")).href, name); }
    finally { await browser.close(); }
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
