/* Focused regressions from the review at 310f328. Large paint pools live only
 * on this page, not on the page used by the syntax/API matrix. */
const assert = require("node:assert/strict");

async function reviewChecks(browser, base, name) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  try {
    await page.goto(base + "/tests/fixtures/markdown.html");
    await page.waitForFunction(() => window.__markdownEditor);
    const source = page.locator(".lightmarkdown-input");
    const get = () => page.evaluate(() => __markdownEditor.getMarkdown());
    const select = (text, line, start, end = start) => page.evaluate(({ text, line, start, end }) => {
      const api = __markdownEditor; api.setMarkdown(text);
      const node = api.content.children[line].firstChild, range = document.createRange();
      range.setStart(node, start); range.setEnd(node, end); api.content.focus();
      getSelection().removeAllRanges(); getSelection().addRange(range);
    }, { text, line, start, end });
    const click = title => page.getByRole("button", { name: title, exact: true }).click();

    // A final BR is a placeholder only at the end of its logical run, not at
    // the end of an inline span followed by more text in the same run.
    for (const [html, expected] of [
      ["<span>one<br></span><span>two</span>", "one\ntwo"],
      ["<span><em>one<br></em></span>two", "one\ntwo"],
      ["<span>one<br></span><br>", "one\n"],
      ["<span>one<br></span>", "one"],
      ["<span>one<br></span><div>two</div>", "one\ntwo"]
    ]) {
      const actual = await source.evaluate((node, html) => {
        __markdownEditor.setMarkdown("");
        node.innerHTML = "<div>" + html + "</div>";
        const before = [...node.querySelectorAll("*")];
        node.dispatchEvent(new Event("input", { bubbles: true }));
        const paint = node.previousElementSibling;
        return { text: __markdownEditor.getMarkdown(), same: before.every(child => node.contains(child)),
          height: Math.abs(node.getBoundingClientRect().height - paint.getBoundingClientRect().height) };
      }, html);
      assert.equal(actual.text, expected, name + ": nested BR export");
      assert.equal(actual.same, true);
      assert.ok(actual.height < 1);
    }
    await source.evaluate(node => {
      node.innerHTML = "<div><span>one<br></span><span>two</span></div>";
      node.dispatchEvent(new Event("input", { bubbles: true }));
      const text = node.querySelectorAll("span")[1].firstChild, range = document.createRange();
      range.setStart(text, 0); range.setEnd(text, 3); node.focus();
      getSelection().removeAllRanges(); getSelection().addRange(range);
    });
    await click("Bold"); assert.equal(await get(), "one\n**two**");
    await page.keyboard.press("Control+z"); assert.equal(await get(), "one\ntwo");
    await page.keyboard.press("Control+Shift+z"); assert.equal(await get(), "one\n**two**");
    const collapsed = await source.evaluate(node => {
      __markdownEditor.setMarkdown("");
      node.innerHTML = "<div><span>one<br></span><span>two</span></div>";
      node.dispatchEvent(new Event("input", { bubbles: true }));
      const before = node.querySelector("span").firstChild;
      const range = document.createRange(); range.setStart(node.querySelectorAll("span")[1].firstChild, 0); range.collapse(true);
      node.focus(); getSelection().removeAllRanges(); getSelection().addRange(range);
      __markdownEditor.insertText("!");
      return { text: __markdownEditor.getMarkdown(), same: before === node.firstChild.firstChild.firstChild };
    });
    assert.deepEqual(collapsed, { text: "one\n!two", same: true });
    await page.keyboard.press("Control+z"); assert.equal(await get(), "one\ntwo");

    for (const [text, start, end, expected] of [
      ["`one``two`", 2, 2, "one``two"],
      ["``one`two``", 0, 11, "one`two"],
      ["\\``one`", 4, 4, "\\`one"],
      ["`` one`two ``", 4, 7, "one`two"]
    ]) {
      await select(text, 0, start, end);
      await click("Inline Code"); assert.equal(await get(), expected, name + ": whole backtick runs");
      await page.keyboard.press("Control+z"); assert.equal(await get(), text);
      await page.keyboard.press("Control+Shift+z"); assert.equal(await get(), expected);
    }
    // An escaped neighboring backtick prevents the proposed wrapper from
    // becoming a recognized span. Leave source intact rather than add literals.
    await select("\\`one`", 0, 2, 5);
    await click("Inline Code"); assert.equal(await get(), "\\`one`");
    assert.match(await page.getByRole("status").textContent(), /cannot format this selection/);
    for (const [text, line, at, expected, end = at] of [
      ["Title\nbody", 1, 0, "Title\n\n---\n\nbody"],
      ["Title\n\nbody", 2, 0, "Title\n\n---\n\nbody"],
      ["Title\n  \nbody", 2, 0, "Title\n  \n---\n\nbody"],
      ["Title\nbody", 1, 0, "Title\n\n---\n\n", 4],
      ["body", 0, 0, "---\n\nbody"],
      ["body", 0, 2, "bo\n\n---\n\ndy"],
      ["body", 0, 4, "body\n\n---\n\n"]
    ]) {
      await select(text, line, at, end);
      await click("Horizontal Line"); assert.equal(await get(), expected);
      assert.equal(await source.locator('[data-md-heading="2"]').count(), 0);
      await page.keyboard.press("Control+z"); assert.equal(await get(), text);
      await page.keyboard.press("Control+Shift+z"); assert.equal(await get(), expected);
    }

    const callbacks = await page.evaluate(() => {
      const hosts = [document.createElement("div"), document.createElement("div")];
      hosts.forEach(host => document.body.append(host));
      const states = [0, 0], changes = [0, 0], observations = [];
      const editors = hosts.map((element, i) => maiden.init({ element,
        actions: [{ name: "bold", state: () => { states[i]++; return false; } },
          { title: "No input", result: () => {} },
          { title: "Set", result: api => api.setMarkdown("custom") },
          { title: "Set twice", result: api => {
            api.setMarkdown("custom"); observations.push(changes[i]);
            api.setMarkdown("custom"); observations.push(changes[i]);
          } }],
        onChange: () => changes[i]++ }));
      const [api] = editors;
      editors.forEach(editor => editor.setMarkdown("word"));
      const otherRange = document.createRange(); otherRange.selectNodeContents(editors[1].content); otherRange.collapse(true);
      editors[1].content.focus(); getSelection().removeAllRanges(); getSelection().addRange(otherRange);
      document.dispatchEvent(new Event("selectionchange"));
      const range = document.createRange(); range.selectNodeContents(api.content);
      api.content.focus(); getSelection().removeAllRanges(); getSelection().addRange(range);
      states.fill(0); changes.fill(0);
      hosts[0].querySelector('button[aria-label="Bold"]').click();
      const edit = { states: states.slice(), changes: changes.slice(), text: api.getMarkdown() };
      states.fill(0); document.dispatchEvent(new Event("selectionchange"));
      const selection = states.slice();
      const outside = document.createElement("textarea"); document.body.append(outside); outside.focus();
      states.fill(0); document.dispatchEvent(new Event("selectionchange"));
      const external = states.slice(); outside.remove(); api.content.focus();
      states.fill(0); hosts[0].querySelector('button[title="No input"]').click();
      const noop = states.slice();
      states.fill(0); changes.fill(0); hosts[0].querySelector('button[title="Set"]').click();
      const setter = { states: states.slice(), changes: changes.slice(), text: api.getMarkdown() };
      changes.fill(0); hosts[0].querySelector('button[title="Set twice"]').click();
      editors.forEach(editor => editor.destroy()); hosts.forEach(host => host.remove());
      return { edit, selection, external, noop, setter, observations };
    });
    assert.deepEqual(callbacks, {
      edit: { states: [1, 0], changes: [1, 0], text: "**word**" },
      selection: [1, 0], external: [0, 0], noop: [1, 0],
      setter: { states: [2, 0], changes: [1, 0], text: "custom" }, observations: [1, 2]
    }, name + ": one command render and only relevant selection state");

    const reentrant = await page.evaluate(() => {
      const host = document.createElement("div"); document.body.append(host);
      let armed = false, destroyOnState = false;
      const values = [];
      const api = maiden.init({ element: host,
        actions: [{ name: "bold", state: editor => {
          if (destroyOnState) editor.destroy();
          else if (armed) { armed = false; editor.setMarkdown("replacement"); }
          return false;
        } }],
        onChange: value => { values.push(value); if (value === "replacement!") api.destroy(); }
      });
      armed = true; api.setMarkdown("original");
      const replaced = { values: values.slice(), text: api.getMarkdown() };
      api.content.focus(); const range = document.createRange(); range.selectNodeContents(api.content); range.collapse(false);
      getSelection().removeAllRanges(); getSelection().addRange(range);
      api.insertText("!");
      const destroyed = { values: values.slice(), text: api.getMarkdown(), guarded: api.insertText("late") === false };
      host.remove();
      const secondHost = document.createElement("div"); document.body.append(secondHost);
      let notifications = 0;
      const second = maiden.init({ element: secondHost,
        actions: [{ name: "bold", state: editor => { if (destroyOnState) editor.destroy(); return false; } }],
        onChange: () => notifications++ });
      destroyOnState = true; second.setMarkdown("stop"); secondHost.remove();
      return { replaced, destroyed, stateDestroy: { text: second.getMarkdown(), notifications, guarded: second.setMarkdown("late") === false } };
    });
    assert.deepEqual(reentrant, {
      replaced: { values: ["replacement"], text: "replacement" },
      destroyed: { values: ["replacement", "replacement!"], text: "replacement!", guarded: true },
      stateDestroy: { text: "stop", notifications: 0, guarded: true }
    }, name + ": reentrant callbacks must not notify stale snapshots or edit after destroy");

    // No timing assertions. These malformed runs used to rescan every suffix.
    const unmatched = await page.evaluate(() => {
      const text = Array.from({ length: 400 }, (_, i) => "`".repeat(i + 1) + "a").join(" ");
      __markdownEditor.setMarkdown(text);
      return { same: __markdownEditor.getMarkdown() === text,
        code: document.querySelectorAll(".lightmarkdown-code:not([hidden])").length };
    });
    assert.deepEqual(unmatched, { same: true, code: 0 });

    // Keep this last: cached painter nodes intentionally follow the high-water
    // mark to preserve Chromium's native typing groups.
    const large = await page.evaluate(() => {
      const text = "*a* ".repeat(45000), before = __markdownChanges.length;
      __markdownEditor.setMarkdown(text);
      const paint = __markdownEditor.content.previousElementSibling;
      return { same: __markdownEditor.getMarkdown() === text, changes: __markdownChanges.length - before,
        italic: [...paint.querySelectorAll(".lightmarkdown-italic")].filter(node => !node.closest("[hidden]")).length,
        painted: [...paint.querySelectorAll(".lightmarkdown-run > span > span")].filter(node => !node.closest("[hidden]")).map(node => node.textContent).join("") === text };
    });
    assert.deepEqual(large, { same: true, changes: 1, italic: 45000, painted: true });
    await source.focus(); await page.keyboard.press("Control+End"); await page.keyboard.type("x");
    assert.equal(await get(), "*a* ".repeat(45000) + "x");
    await page.keyboard.press("Control+z"); assert.equal(await get(), "*a* ".repeat(45000));
    assert.deepEqual(errors, []);
    console.log(`${name}: review regressions, nested BR, code/rule commands, render ownership, inactive state, unmatched ticks and high-token line: ok`);
  } finally { await page.close(); }
}
module.exports = { reviewChecks };
