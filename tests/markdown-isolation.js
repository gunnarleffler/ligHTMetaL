/* M1 diagnostic experiment, deliberately separate from the production suite.
 * NODE_PATH=$(npm root -g) node tests/markdown-isolation.js
 * Optional: --serve, --firefox or --chromium, --surface, --plaintext, --profile.
 * --surface focuses the parent-toolbar candidate, including integration checks.
 * Uses current dist files without patching the library. --serve prints a URL.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { chromium, firefox } = require("playwright");
const ROOT = path.resolve(__dirname, "..");
const FIXTURE = "/tests/fixtures/markdown-isolation.html";
const PLAINTEXT = process.argv.includes("--plaintext");
const SURFACE = process.argv.includes("--surface");

async function checks(browser, base, name) {
  const observations = { browser: name, version: browser.version(), contentEditable: PLAINTEXT ? "plaintext-only" : "true", history: {}, grouping: {}, paste: {}, csp: [] };
  async function open(mode, callback = "text", file = false) {
    const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
    const errors = [], violations = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => {
      if (/Content.Security.Policy|Refused to (execute|load|apply)/i.test(message.text())) violations.push(message.text());
    });
    page.on("request", request => {
      if (/^https?:/.test(request.url()) && new URL(request.url()).origin !== new URL(base).origin) errors.push("Remote request: " + request.url());
    });
    await page.goto((file ? pathToFileURL(ROOT + FIXTURE).href : base + FIXTURE) + `?mode=${mode}&callback=${callback}&plaintext=${PLAINTEXT ? 1 : 0}`);
    await page.waitForFunction(() => window.__experiment?.ready || window.__experiment?.error);
    assert.equal(await page.evaluate(() => __experiment.error), undefined);
    assert.equal(await page.evaluate(() => __experiment.editors.a.content.contentEditable), PLAINTEXT ? "plaintext-only" : "true");
    assert.deepEqual(violations, [], "Fixture initialization must work under the strict CSP");
    await page.evaluate(() => {
      __experiment.policyEvents = [];
      for (const doc of new Set([document, ...Object.values(__experiment.editors).map(api => api.content.ownerDocument)])) {
        doc.addEventListener("securitypolicyviolation", event => __experiment.policyEvents.push({
          directive: event.effectiveDirective, blocked: event.blockedURI, sample: event.sample,
          phase: __experiment.phase || "editing"
        }));
      }
    });
    const view = id => mode !== "inline" ? page.frameLocator("#frame-" + id) : page.locator("#host-" + id);
    const source = id => view(id).locator(".lightmarkdown-input");
    const button = (id, title) => (mode === "surface" ? page.locator("#host-" + id) : view(id)).getByRole("button", { name: title, exact: true });
    const get = id => page.evaluate(id => __experiment.editors[id].getMarkdown(), id);
    const set = (id, text) => page.evaluate(({ id, text }) => __experiment.editors[id].setMarkdown(text), { id, text });
    const select = (id, start, end = start) => page.evaluate(({ id, start, end }) => {
      const content = __experiment.editors[id].content;
      const doc = content.ownerDocument, range = doc.createRange();
      const text = content.firstElementChild.firstChild;
      range.setStart(text, start); range.setEnd(text, end);
      content.focus(); doc.getSelection().removeAllRanges(); doc.getSelection().addRange(range);
    }, { id, start, end });
    const active = id => page.evaluate(id => {
      const node = __experiment.editors[id].content.ownerDocument.activeElement;
      return { tag: node.tagName, title: node.getAttribute("aria-label") || node.title };
    }, id);
    return { page, view, source, button, get, set, select, active, async close() {
      assert.deepEqual(errors, []);
      if (violations.length) observations.csp.push({ mode, callback, file, messages: [...new Set(violations)],
        events: await page.evaluate(() => __experiment.policyEvents) });
      await page.close();
    } };
  }

  if (process.argv.includes("--profile")) {
    observations.performance = [];
    // Cold pages, ASCII byte sizes, and the fixture's persistent raw-output
    // callback. These are diagnostic samples, not product limits or p95 latency.
    for (const mode of SURFACE ? ["surface"] : ["inline", "surface"]) {
      for (const kib of [20, 200]) {
        const h = await open(mode);
        const line = "Paragraph **bold** with a [link](relative) and `code`.\n";
        const text = line.repeat(Math.ceil(kib * 1024 / line.length)).slice(0, kib * 1024);
        const timing = await h.page.evaluate(text => {
          const api = __experiment.editors.a;
          const start = performance.now(); api.setMarkdown(text); const set = performance.now();
          api.content.getBoundingClientRect(); const layout = performance.now();
          const read = api.getMarkdown(); const get = performance.now();
          const doc = api.content.ownerDocument, range = doc.createRange();
          range.selectNodeContents(api.content); range.collapse(false); api.content.focus();
          doc.getSelection().removeAllRanges(); doc.getSelection().addRange(range);
          const beforeInsert = performance.now(); api.insertText("x"); const afterInsert = performance.now();
          return { setMs: set - start, layoutMs: layout - set, getMs: get - layout, insertMs: afterInsert - beforeInsert,
            readMatches: read === text, insertMatches: api.getMarkdown() === text + "x", lines: api.content.children.length,
            stageElements: api.content.parentElement.getElementsByTagName("*").length };
        }, text);
        assert.equal(timing.readMatches, true); assert.equal(timing.insertMatches, true);
        observations.performance.push({ mode, kib, ...timing });
        console.log(`${name} ${mode} ${kib} KiB: set ${timing.setMs.toFixed(1)}ms; insertText ${timing.insertMs.toFixed(1)}ms`);
        await h.close();
      }
    }
    return observations;
  }

  for (const mode of SURFACE ? ["surface"] : ["inline", "isolated", "surface"]) {
    const h = await open(mode);
    await h.select("a", 0); await h.page.keyboard.type("alpha ");
    await h.select("b", 0); await h.page.keyboard.type("beta ");
    await h.button("a", "Undo").click();
    const result = { a: await h.get("a"), b: await h.get("b") };
    observations.history[mode] = result;
    // Baseline is diagnostic: an eventual browser improvement should not fail it.
    if (mode !== "inline") assert.deepEqual(result, { a: "body a", b: "beta body b" });
    else assert.ok(result.a !== "alpha body a" || result.b !== "beta body b");
    await h.button("a", "Redo").click();
    assert.equal(await h.get("a"), "alpha body a"); assert.equal(await h.get("b"), "beta body b");
    await h.page.locator("#outside").focus(); await h.page.keyboard.press("End"); await h.page.keyboard.type("!");
    await h.button("a", "Undo").click();
    if (mode !== "inline") {
      assert.equal(await h.get("a"), "body a");
      assert.equal(await h.page.locator("#outside").textContent(), "outside!");
      assert.equal(await h.get("b"), "beta body b");
      await h.button("a", "Redo").click();
      await h.page.locator("#outside").focus(); await h.page.keyboard.press("Control+z");
      assert.equal(await h.page.locator("#outside").textContent(), "outside");
      assert.equal(await h.get("a"), "alpha body a");
    }
    await h.close();

    observations.grouping[mode] = {};
    for (const callback of ["text", "remove", "textarea"]) {
      const h = await open(mode, callback);
      await h.select("a", 0); await h.page.keyboard.type("grouped typing ");
      const typed = await h.get("a");
      assert.equal(typed, "grouped typing body a");
      await h.page.keyboard.press("Control+z");
      const undone = await h.get("a");
      observations.grouping[mode][callback] = undone;
      assert.notEqual(undone, typed);
      if (mode !== "inline" || callback === "text") assert.equal(undone, "body a");
      await h.page.keyboard.press("Control+Shift+z"); assert.equal(await h.get("a"), typed);
      assert.equal(await h.get("b"), "body b");
      await h.close();
    }

    const p = await open(mode);
    const pasted = "## Pasted 🦊\nbody **bold**\n\n";
    await p.set("a", ""); await p.source("a").focus();
    await p.source("a").evaluate((node, text) => {
      const data = new DataTransfer(); data.setData("text/plain", text);
      const event = new ClipboardEvent("paste", { bubbles: true, cancelable: true });
      Object.defineProperty(event, "clipboardData", { value: data }); node.dispatchEvent(event);
    }, pasted);
    assert.equal(await p.get("a"), pasted);
    observations.paste[mode] = await p.source("a").evaluate(node => {
      const win = node.ownerDocument.defaultView;
      const paint = node.previousElementSibling;
      const blocks = [...paint.children].filter(child => !child.hidden).map(child => child.firstElementChild);
      const deltas = [...node.children].map((child, index) => {
        const a = child.getBoundingClientRect(), b = blocks[index].getBoundingClientRect();
        return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.width - b.width), Math.abs(a.height - b.height));
      });
      return { blocks: node.children.length, headingFont: win.getComputedStyle(node.firstElementChild).fontSize,
        bodyFont: win.getComputedStyle(node).fontSize, maxGeometryDelta: Math.max(0, ...deltas), html: node.innerHTML };
    });
    assert.ok(Number.isFinite(observations.paste[mode].maxGeometryDelta));
    // Retain this diagnostic measurement across modes. The production suite
    // asserts paste geometry; isolation itself is not a layout fix.
    observations.paste[mode].geometryAligned = observations.paste[mode].maxGeometryDelta < 1;
    await p.page.evaluate(() => { __experiment.phase = "replace pasted heading"; });
    await p.page.keyboard.press("Control+a"); await p.page.keyboard.type("one");
    await p.page.keyboard.press("Enter"); await p.page.keyboard.type("two");
    assert.equal(await p.get("a"), "one\ntwo");
    await p.page.evaluate(() => { __experiment.phase = "merge native paragraphs"; });
    await p.page.keyboard.press("Home"); await p.page.keyboard.press("Backspace");
    assert.equal(await p.get("a"), "onetwo");
    await p.page.keyboard.press("Control+z"); assert.equal(await p.get("a"), "one\ntwo");
    await p.page.keyboard.press("Control+Shift+z"); assert.equal(await p.get("a"), "onetwo");
    await p.page.evaluate(() => { __experiment.phase = "Unicode formatting and undo"; });
    for (const [start, end, expected] of [[0, 2, "**🦊** e\u0301 tail"], [3, 5, "🦊 **e\u0301** tail"]]) {
      await p.set("a", "🦊 e\u0301 tail"); await p.select("a", start, end); await p.button("a", "Bold").click();
      assert.equal(await p.get("a"), expected);
      await p.page.keyboard.press("Control+z"); assert.equal(await p.get("a"), "🦊 e\u0301 tail");
    }
    await p.source("a").dispatchEvent("compositionstart");
    assert.equal(await p.set("a", "late"), false);
    assert.equal(await p.page.evaluate(() => __experiment.editors.a.insertText("late")), false);
    assert.equal(await p.button("a", "Bold").isDisabled(), true);
    await p.source("a").dispatchEvent("compositionend");
    assert.equal(await p.get("a"), "🦊 e\u0301 tail");
    await p.close();
    console.log(`${name} ${mode}: history, callback grouping, paste fidelity, paragraph joins, UTF-16 commands and composition guards checked; paste geometry measured`);
  }

  // Deliberately test parent-owned integrations, not just events inside a frame.
  const integrationMode = SURFACE ? "surface" : "isolated";
  observations.integrationMode = integrationMode;
  const h = await open(integrationMode, "remove");
  async function nextBold(id) {
    if (SURFACE) {
      for (let steps = 1; steps <= 2; steps++) {
        await h.page.keyboard.press("Tab");
        if (await h.button(id, "Bold").evaluate(node => node === document.activeElement)) return steps;
      }
      assert.fail("Parent toolbar must be reachable from the preceding writing surface");
    }
    await h.page.keyboard.press("Tab");
    let steps = 1;
    // Firefox can first focus the editing document's body. Record that extra
    // stop rather than pretending its tab sequence matches Chromium's.
    if ((await h.active(id)).tag === "BODY") {
      assert.equal(await h.page.evaluate(() => document.activeElement.id), "frame-" + id);
      await h.page.keyboard.press("Tab"); steps++;
    }
    assert.deepEqual(await h.active(id), { tag: "BUTTON", title: "Bold" });
    return steps;
  }
  await h.page.locator("#before").focus();
  observations.focus = { entryTabs: await nextBold("a") };
  await h.source("a").focus(); await h.page.keyboard.press("Escape"); await h.page.keyboard.press("Shift+Tab");
  const last = h.button("a", "Redo").locator("..").locator("button:enabled").last();
  if (SURFACE && !await last.evaluate(node => node === node.ownerDocument.activeElement)) await h.page.keyboard.press("Shift+Tab");
  assert.equal(await last.evaluate(node => node === node.ownerDocument.activeElement), true);
  await h.source("a").focus(); await h.page.keyboard.press("Escape"); observations.focus.betweenTabs = await nextBold("b");
  await h.source("b").focus(); await h.page.keyboard.press("Escape"); await h.page.keyboard.press("Tab");
  if (SURFACE && !await h.page.locator("#after").evaluate(node => node === document.activeElement)) await h.page.keyboard.press("Tab");
  assert.equal(await h.page.locator("#after").evaluate(node => node === document.activeElement), true);
  for (const skin of ["", "bootstrap", "material-classic", "material-outline", "frost", "patina", "sterling"]) {
    for (const palette of ["light", "dark"]) {
      await h.page.evaluate(({ skin, palette }) => __experiment.appearance(skin, palette), { skin, palette });
      const colors = await h.page.evaluate(async () => {
        const result = [];
        for (const api of Object.values(__experiment.editors)) {
          const doc = api.content.ownerDocument;
          await Promise.all(doc.getAnimations().map(animation => animation.finished.catch(() => {})));
          const style = doc.defaultView.getComputedStyle(api.content.closest(".lightmetal"));
          const parentStyle = api.element.ownerDocument.defaultView.getComputedStyle(api.element);
          result.push({ bg: style.getPropertyValue("--lightmetal-bg").trim(), fg: style.getPropertyValue("--lightmetal-color").trim(),
            parentBg: parentStyle.getPropertyValue("--lightmetal-bg").trim() });
        }
        return result;
      });
      assert.deepEqual(colors[0], colors[1]); assert.ok(colors[0].bg && colors[0].fg);
      assert.equal(colors[0].bg, colors[0].parentBg);
    }
  }
  await h.page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await h.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  for (const id of ["a", "b"]) {
    assert.equal(await h.view(id).getByRole("textbox", { name: "Markdown source" }).count(), 1);
    assert.ok(await h.page.locator("#frame-" + id).getAttribute("title"));
    assert.equal(await h.source(id).evaluate(node => node.ownerDocument.documentElement.scrollWidth <= node.ownerDocument.defaultView.innerWidth), true);
  }
  if (SURFACE) {
    assert.equal(await h.page.evaluate(() => __experiment.editors.a.element === document.getElementById("host-a")), true);
    assert.equal(await h.page.evaluate(() => __experiment.editors.a.element.contains(__experiment.editors.a.content)), false);
  } else assert.equal(await h.page.evaluate(() => {
    try { maiden.init({ element: __experiment.editors.a.element }); return false; }
    catch (error) { return error instanceof TypeError; }
  }), true, "Parent-realm init still refuses a foreign-document host; this is not a drop-in integration");
  const teardown = await h.page.evaluate(async () => {
    const old = __experiment.editors.a, text = old.getMarkdown();
    __experiment.destroy("a");
    const count = __experiment.changes.length;
    old.content.dispatchEvent(new Event("input"));
    const guarded = old.setMarkdown("late") === false && old.insertText("late") === false && __experiment.changes.length === count;
    await __experiment.mount("a");
    return { text, final: old.getMarkdown(), guarded, frames: document.querySelectorAll("iframe").length, fresh: __experiment.editors.a.getMarkdown() };
  });
  assert.deepEqual(teardown, { text: "body a", final: "body a", guarded: true, frames: 2, fresh: "body a" });
  await h.close();

  if (SURFACE) {
    const c = await open("surface");
    const initial = await c.page.evaluate(async () => {
      __experiment.destroy("a");
      const host = document.getElementById("host-a");
      host.classList.add("app-owned");
      const owned = document.createElement("span"); owned.textContent = "Application-owned content"; host.append(owned);
      window.__surfaceState = []; window.__surfaceChanges = []; window.__surfaceResult = false;
      await __experiment.mount("a", {
        actions: ["bold", { title: "Insert bang", icon: "!",
          state: api => {
            __surfaceState.push({ mount: api.element === host, toolbar: !!host.querySelector('[role="group"]'),
              foreignContent: api.content.ownerDocument !== document, text: api.getMarkdown() });
            return true;
          },
          result: api => { __surfaceResult = api === __experiment.editors.a; return api.insertText("!"); }
        }],
        classes: { actionbar: "experiment-actionbar", button: "experiment-button", content: "experiment-content", selected: "experiment-selected" },
        onChange: value => __surfaceChanges.push(value)
      });
      return { initialText: __surfaceState[0].text, state: __surfaceState.every(value => value.mount && value.toolbar && value.foreignContent),
        changes: __surfaceChanges, toolbarParent: host.querySelector('[role="group"]').ownerDocument === document };
    });
    assert.deepEqual(initial, { initialText: "", state: true, changes: ["body a"], toolbarParent: true });
    assert.equal(await c.source("a").evaluate(node => node.ownerDocument.defaultView.getComputedStyle(node).paddingLeft), "13px");
    await c.select("a", 0); await c.button("a", "Insert bang").click();
    assert.equal(await c.get("a"), "!body a");
    assert.equal(await c.page.evaluate(() => __surfaceResult), true);
    assert.equal(await c.button("a", "Insert bang").getAttribute("aria-pressed"), "true");
    assert.equal(await c.button("a", "Insert bang").evaluate(node => node.classList.contains("experiment-selected")), true);
    await c.page.keyboard.press("Control+z"); assert.equal(await c.get("a"), "body a");
    assert.deepEqual(await c.page.evaluate(() => __surfaceChanges), ["body a", "!body a", "body a"]);
    await c.source("a").dispatchEvent("compositionstart");
    await c.page.waitForFunction(() => __experiment.editors.a.element.classList.contains("lightmarkdown-composing"));
    assert.equal(await c.button("a", "Insert bang").isDisabled(), true);
    await c.source("a").dispatchEvent("compositionend");
    await c.page.waitForFunction(() => !__experiment.editors.a.element.classList.contains("lightmarkdown-composing"));
    await c.page.evaluate(() => {
      __experiment.editors.a.element.style.setProperty("--lightmarkdown-font-size", "18px");
      __experiment.editors.a.element.style.setProperty("--lightmetal-color", "#123456");
    });
    await c.page.waitForFunction(() => {
      const node = __experiment.editors.a.content, style = node.ownerDocument.defaultView.getComputedStyle(node);
      return style.fontSize === "18px" && style.caretColor === "rgb(18, 52, 86)";
    });
    const cleanup = await c.page.evaluate(() => {
      const api = __experiment.editors.a, host = api.element;
      api.destroy(); api.destroy();
      return { frames: host.querySelectorAll("iframe").length, toolbar: host.querySelector('[role="group"]') === null,
        owned: host.textContent === "Application-owned content" && host.classList.contains("app-owned"),
        classes: !host.classList.contains("lightmarkdown"), final: api.getMarkdown(), blocked: api.insertText("late") === false };
    });
    assert.deepEqual(cleanup, { frames: 0, toolbar: true, owned: true, classes: true, final: "body a", blocked: true });
    await c.close();
    observations.customIntegration = "parent API/state/result, classes, variables, composition and owned-content teardown checked";
  }

  const f = await open(integrationMode, "remove", true);
  await f.select("a", 0); await f.page.keyboard.type("file edit ");
  await f.button("a", "Undo").click(); assert.equal(await f.get("a"), "body a");
  assert.equal(await f.get("b"), "body b");
  await f.close();
  console.log(`${name}: HTTP CSP exercised (violations reported), Tab traversal, 7 skins/2 palettes, narrow layout, accessible names, teardown/remount and file:// checked`);
  return observations;
}

async function main() {
  const server = http.createServer((req, res) => {
    const file = path.resolve(ROOT, "." + new URL(req.url, "http://localhost").pathname);
    if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404).end(); return; }
    res.setHeader("Content-Type", file.endsWith(".css") ? "text/css" : file.endsWith(".html") ? "text/html" : file.endsWith(".png") ? "image/png" : "text/javascript");
    res.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'report-sample'; frame-src 'self'; img-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'self'");
    res.end(fs.readFileSync(file));
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  if (process.argv.includes("--serve")) {
    console.log("Experimental fixture: " + base + FIXTURE + "?mode=" + (SURFACE ? "surface" : "isolated") + "&callback=remove&plaintext=" + (PLAINTEXT ? 1 : 0));
    console.log("Leave this process running. Ctrl+C stops only this server.");
    return;
  }
  const observations = [];
  try {
    const engines = process.argv.includes("--firefox") ? { firefox } : process.argv.includes("--chromium") ? { chromium } : { chromium, firefox };
    for (const [name, engine] of Object.entries(engines)) {
      const browser = await engine.launch();
      try { observations.push(await checks(browser, base, name)); }
      finally { await browser.close(); }
    }
    console.log(JSON.stringify(observations, null, 2));
  } finally { await new Promise(resolve => server.close(resolve)); }
}
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
