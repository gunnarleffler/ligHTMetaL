/* Browser smoke test for lightmetal.
 *
 * Run:  NODE_PATH=$(npm root -g) node tests/smoke.js
 *
 * Starts the Node dev server on a spare port, then loads the demo page in
 * Chromium and Firefox and checks representative editor behavior. The demo
 * loads ../dist/... relative to /, which the server maps onto dist/.
 */

const { spawn } = require("child_process");
const fs = require("fs");
const http = require("http");
const path = require("path");
const { chromium, firefox } = require("playwright");

const ROOT = path.join(__dirname, "..");
const PORT = 5059; // dedicated, so a dev server on 5000 is left alone
const BASE = `http://127.0.0.1:${PORT}`;
const CONTENT = "#editor .lightmetal-content";

function httpGet(url) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on("error", () => resolve(false));
    req.setTimeout(1000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function waitUntil(url, timeoutMs) {
  const start = Date.now();
  for (;;) {
    if (await httpGet(url)) return;
    if (Date.now() - start > timeoutMs) throw new Error("server did not start at " + url);
    await new Promise((r) => setTimeout(r, 200));
  }
}

function startServer() {
  const env = { ...process.env, LM_TEST_PORT: String(PORT) };
  const script = path.join(ROOT, "examples", "server.js");
  return spawn(process.execPath, [script], { cwd: ROOT, env: { ...env, HOST: '127.0.0.1' }, stdio: ['ignore', 'ignore', 'inherit'] });
}

async function runChecks(browser, label) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const check = (what, ok) => {
    if (!ok) throw new Error(label + ": " + what);
  };
  const innerHTML = (sel) => page.evaluate((s) => document.querySelector(s).innerHTML, sel);

  await page.goto(BASE + "/html.html");

  // The IIFE bundle exposes the API under window.lightmetal.
  const api = await page.evaluate(() => ({
    init: typeof window.lightmetal !== "undefined" && typeof window.lightmetal.init,
    exec: typeof window.lightmetal !== "undefined" && typeof window.lightmetal.exec
  }));
  check("IIFE bundle exposes init/exec", api.init === "function" && api.exec === "function");

  check(
    "toolbar renders the grouped default actions plus source",
    (await page.$$eval("#editor .lightmetal-button", (b) => b.length)) === 20
  );
  check(
    "content is contenteditable",
    await page.evaluate((s) => document.querySelector(s).isContentEditable, CONTENT)
  );

  // Typing produces HTML and fires onChange.
  await page.click(CONTENT);
  await page.keyboard.type("Hello light");
  check("typed text appears in the HTML", (await innerHTML(CONTENT)).includes("Hello light"));
  check(
    "onChange tracks content",
    await page.evaluate((s) => window.lastChange === document.querySelector(s).innerHTML, CONTENT)
  );

  // Bold wraps the selection.
  await page.evaluate((s) => {
    const node = document.querySelector(s);
    const range = document.createRange();
    range.selectNodeContents(node);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }, CONTENT);
  await page.click('.lightmetal-actionbar button[title="Bold"]');
  check("bold wraps the selection", /<(b|strong)(\s|>)/.test(await innerHTML(CONTENT)));
  check(
    "bold button shows selected state",
    await page.evaluate(
      () =>
        document
          .querySelector('.lightmetal-actionbar button[title="Bold"]')
          .classList.contains("lightmetal-button-selected")
    )
  );

  // Quote wraps the selection in a blockquote.
  await page.getByRole('button',{name:'Paragraph style',exact:true}).click();
  await page.getByRole('menuitemradio',{name:'Blockquote',exact:true}).click();
  check("quote wraps the selection", (await innerHTML(CONTENT)).includes("<blockquote>"));

  // Source mode: the toggle swaps the content for a textarea holding the
  // exact HTML.
  const beforeSource = await innerHTML(CONTENT);
  await page.click('.lightmetal-actionbar button[title="Source"]');
  check(
    "source toggle hides content and shows the textarea",
    await page.evaluate(() => {
      const editor = window.editor;
      return editor.content.hidden && !editor.source.hidden &&
        getComputedStyle(editor.content).display === "none" &&
        getComputedStyle(editor.source).display !== "none";
    })
  );
  check(
    "source starts with the exact current HTML",
    (await page.evaluate(() => window.editor.source.value)) === beforeSource
  );

  const changeCountBefore = await page.evaluate(() => window.changeCount);
  await page.keyboard.type("<br>");
  const sourceValue = await page.evaluate(() => window.editor.source.value);
  const sourceDelta = await page.evaluate((before) => window.changeCount - before, changeCountBefore);
  check(
    "source keeps the exact text as typed",
    sourceValue === beforeSource + "<br>"
  );
  check(
    "onChange fires once per input in source mode",
    sourceDelta === 4 // four typed characters, one input event each
  );
  check(
    "getHTML() reads the textarea in source mode",
    (await page.evaluate(() => window.editor.getHTML())) === sourceValue
  );
  check(
    "onChange reflects the exact source text",
    (await page.evaluate((v) => window.lastChange === v, sourceValue))
  );

  // WYSIWYG commands must not fire from source mode.
  const htmlBeforeCmd = await innerHTML(CONTENT);
  check('formatting is disabled in Source mode',await page.locator('#editor .lightmetal-actionbar button[title="Bold"]').isDisabled());
  await page.locator('#editor .lightmetal-actionbar button[title="Bold"]').evaluate(button=>button.click());
  check(
    "toolbar buttons are inert in source mode",
    (await innerHTML(CONTENT)) === htmlBeforeCmd
  );
  await page.keyboard.press("Control+b");
  check(
    "Ctrl+B does not format in source mode",
    (await page.evaluate(() => window.editor.source.value)) === sourceValue
  );

  // Switching back puts the edited HTML into the WYSIWYG view.
  const countBeforeExit = await page.evaluate(() => window.changeCount);
  await page.click('.lightmetal-actionbar button[title="Source"]');
  check(
    "switching back shows the content again",
    await page.evaluate(() => !window.editor.content.hidden && window.editor.source.hidden &&
      getComputedStyle(window.editor.content).display !== "none" &&
      getComputedStyle(window.editor.source).display === "none")
  );
  check(
    "source edits appear in WYSIWYG mode",
    (await innerHTML(CONTENT)).includes("<br>")
  );
  check(
    "onChange fires exactly once on switching back",
    (await page.evaluate((before) => window.changeCount - before, countBeforeExit)) === 1
  );
  // Handlers stay singular: one keystroke fires onChange exactly once.
  // A duplicated handler would fire it more than once.
  const beforeKeystroke = await page.evaluate(() => window.changeCount);
  await page.click("#editor .lightmetal-content");
  await page.keyboard.press("a");
  check(
    "a single keystroke fires onChange exactly once",
    (await page.evaluate(() => window.changeCount)) - beforeKeystroke === 1
  );

  // getHTML / setHTML / getText work in both modes.
  check(
    "getHTML() in WYSIWYG mode matches the content",
    (await page.evaluate(() => window.editor.getHTML())) === (await innerHTML(CONTENT))
  );
  await page.evaluate(() => window.editor.setHTML("<p>Replaced</p>"));
  check("setHTML() in WYSIWYG mode", (await innerHTML(CONTENT)).includes("Replaced"));
  check(
    "setHTML() fires onChange",
    (await page.evaluate(() => window.lastChange)).includes("Replaced")
  );
  check(
    "getText() strips tags",
    (await page.evaluate(() => {
      window.editor.setHTML("<b>Hi</b> there");
      return window.editor.getText();
    })) === "Hi there"
  );
  await page.click('.lightmetal-actionbar button[title="Source"]');
  await page.evaluate(() => window.editor.setHTML("<p>Source set</p>"));
  check(
    "setHTML() in source mode targets the textarea",
    (await page.evaluate(() => window.editor.source.value)) === "<p>Source set</p>"
  );
  check(
    "getHTML() in source mode returns the exact textarea text",
    (await page.evaluate(() => window.editor.getHTML())) === "<p>Source set</p>"
  );
  check(
    "source text is exact while source mode is active",
    (await page.evaluate(() => {
      const v = window.editor.source.value;
      window.editor.source.value = "<WeIrD tAg>x</WeIrD tAg>";
      const exact = window.editor.source.value === "<WeIrD tAg>x</WeIrD tAg>";
      window.editor.source.value = v;
      return exact;
    }))
  );

  // Source mode is optional: omit it from actions and the textarea is absent.
  await page.evaluate(() => {
    const host = document.createElement("div");
    host.id = "editor-nosource";
    document.body.appendChild(host);
    window.__noSource = window.lightmetal.init({ element: host, actions: ["bold"] });
  });
  check(
    "actions without 'source' give exactly the requested buttons",
    (await page.$$eval("#editor-nosource .lightmetal-actionbar button:not(.lightmetal-overflow-trigger)", (b) => b.length)) === 1
  );
  check(
    "actions without 'source' give no textarea",
    (await page.$("#editor-nosource .lightmetal-sources")) === null
  );
  await page.evaluate(() => window.__noSource.destroy());

  // A configured source action must still toggle back out of source mode.
  const customSource = await page.evaluate(() => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const editor = window.lightmetal.init({
      element: host,
      actions: [{ name: "source", title: "HTML source" }]
    });
    const button = host.querySelector("button");
    button.click();
    const entered = !editor.source.hidden;
    button.click();
    const exited = editor.source.hidden && !editor.content.hidden;
    editor.destroy();
    host.remove();
    return entered && exited;
  });
  check("custom source action toggles both ways", customSource);

  // A second instance edits independently.
  await page.evaluate(() => {
    const host = document.createElement("div");
    host.id = "editor-second";
    document.body.appendChild(host);
    window.__second = window.lightmetal.init({ element: host });
  });
  check(
    "second editor initializes",
    await page.evaluate(() => document.querySelector("#editor-second .lightmetal-content") !== null)
  );
  await page.click("#editor-second .lightmetal-content");
  await page.keyboard.type("second editor");
  check(
    "second editor holds its own content",
    (await innerHTML("#editor-second .lightmetal-content")).includes("second editor")
  );
  check("first editor is untouched", !(await innerHTML(CONTENT)).includes("second editor"));

  // Destroy leaves the host empty; the editor can be recreated on it.
  const destroyed = await page.evaluate(() => {
    window.__second.destroy();
    return document.querySelector("#editor-second").children.length === 0;
  });
  check("destroy empties the host element", destroyed);
  await page.evaluate(() => {
    window.__second = window.lightmetal.init({
      element: document.querySelector("#editor-second")
    });
  });
  await page.click("#editor-second .lightmetal-content");
  await page.keyboard.type("again");
  check(
    "recreated editor accepts input",
    (await innerHTML("#editor-second .lightmetal-content")).includes("again")
  );

  // The ESM build works through a native import.
  const esm = await page.evaluate(async () => {
    const mod = await import("/lightmetal.esm.js");
    const host = document.createElement("div");
    host.id = "editor-esm";
    document.body.appendChild(host);
    window.__esm = mod.init({ element: host });
    return {
      init: typeof mod.init,
      exec: typeof mod.exec,
      built: document.querySelector("#editor-esm .lightmetal-content") !== null
    };
  });
  check("ESM bundle exposes init/exec", esm.init === "function" && esm.exec === "function");
  check("ESM init builds an editor", esm.built);
  await page.evaluate(() => window.__esm.destroy());

  // The stylesheet applies.
  const styles = await page.evaluate(() => {
    const box = getComputedStyle(document.querySelector("#editor"));
    const content = getComputedStyle(
      document.querySelector("#editor .lightmetal-content")
    );
    return {
      border: box.borderTopStyle,
      radius: box.borderTopLeftRadius,
      height: content.height
    };
  });
  check("stylesheet applies", styles.border !== "none" && styles.height === "300px");
  check("editor corners are rounded", styles.radius === "10px");
  // Icons must inherit the theme text color, never raw black.
  const iconColor = await page.evaluate(() => {
    const b = document.querySelector("#editor .lightmetal-actionbar .lightmetal-button");
    return getComputedStyle(b).color;
  });
  check(
    "toolbar icons use the theme color, not black",
    iconColor === "rgb(106, 115, 125)" || iconColor === "rgb(154, 164, 178)"
  );

  // Theme classes force each theme regardless of system preference.
  const themeColors = await page.evaluate(() => {
    const probe = document.createElement("div");
    probe.classList.add("lightmetal", "lightmetal-dark");
    document.body.appendChild(probe);
    const darkBg = getComputedStyle(probe).backgroundColor;
    probe.classList.remove("lightmetal-dark");
    probe.classList.add("lightmetal-light");
    const lightBg = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return { darkBg, lightBg };
  });
  check(".lightmetal-dark forces a dark background", themeColors.darkBg === "rgb(22, 24, 28)");
  check(".lightmetal-light forces a light background", themeColors.lightBg === "rgb(255, 255, 255)");

  // The demo toggle cycles auto -> dark -> light -> auto.
  await page.click("#theme-toggle");
  const toolbarBg = () =>
    page.evaluate(
      () => getComputedStyle(document.querySelector(".lightmetal-actionbar")).backgroundColor
    );
  check("demo toggle switches to dark", (await toolbarBg()) === "rgb(30, 33, 38)");
  await page.click("#theme-toggle");
  check(
    "demo toggle overrides system dark with light",
    (await toolbarBg()) === "rgb(247, 248, 250)"
  );
  await page.click("#theme-toggle"); // back to auto (dark system)

  // The source-mode checks left the main editor in source mode; go back to
  // WYSIWYG so the image button acts.
  if (await page.evaluate(() => window.editor.source.hidden === false)) {
    await page.click('.lightmetal-actionbar button[title="Source"]');
  }

  // Pastes from outside are untrusted: rich text enters sanitized.
  const PASTED_HTML =
    '<script>document.title = "pwned"</script>' +
    '<img src=x onerror="alert(1)">' +
    '<a href="javascript:alert(1)">bad link</a>' +
    '<a href="data:text/html,evil">data link</a>' +
    '<p>plain text</p>' +
    '<unknown-tag>survives</unknown-tag>' +
    '<b onclick="alert(2)">bold stays</b>' +
    '<style>body { background: red; }</style>';
  await page.evaluate(({ payload, contentSel }) => {
    const dt = new DataTransfer();
    dt.setData("text/html", payload);
    const content = document.querySelector(contentSel);
    content.focus();
    const ev = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(ev, "clipboardData", { value: dt });
    content.dispatchEvent(ev);
  }, { payload: PASTED_HTML, contentSel: CONTENT });
  const afterPaste = await innerHTML(CONTENT);
  check(
    "paste runs no scripts",
    (await page.evaluate(() => document.title)) !== "pwned" &&
      !afterPaste.includes("<script")
  );
  check(
    "paste strips event handlers",
    !afterPaste.includes("onerror") && !afterPaste.includes("onclick")
  );
  check(
    "paste defangs dangerous URL schemes",
    !afterPaste.includes("javascript:alert") && !afterPaste.includes("data:text/html")
  );
  check("paste removes style tags", !afterPaste.includes("<style"));
  check(
    "paste keeps allowed markup",
    afterPaste.includes("<b>bold stays</b>") && afterPaste.includes("plain text")
  );
  check(
    "paste unwraps unknown tags but keeps their text",
    afterPaste.includes("survives") && !afterPaste.includes("unknown-tag")
  );

  // setHTML() is the import seam: same rules apply.
  const imported = await page.evaluate((contentSel) => {
    window.editor.setHTML('<script>window.__pwned = 1</script><b onclick="alert(3)">ok</b>');
    return {
      html: document.querySelector(contentSel).innerHTML,
      leaked: typeof window.__pwned === "number"
    };
  }, CONTENT);
  check(
    "setHTML strips scripts and handlers",
    !imported.html.includes("<script") &&
      !imported.html.includes("onclick") &&
      imported.html.includes("<b>ok</b>") &&
      !imported.leaked
  );
  check(
    "setHTML fires onChange with the cleaned HTML",
    (await page.evaluate(() => window.lastChange)) === imported.html
  );
  const urlSchemes = await page.evaluate(() => {
    window.editor.setHTML('<a href="mailto:me@example.com">email</a>' +
      '<img src="mailto:me@example.com"><img src="https://example.com/p.png">');
    return window.editor.getHTML();
  });
  check("mailto links survive but mailto image sources do not",
    urlSchemes.includes('href="mailto:me@example.com"') &&
    !urlSchemes.includes('src="mailto:') &&
    urlSchemes.includes('src="https://example.com/p.png"'));

  // Tables keep their structure and header relationships on import and paste.
  const tablePreservation = await page.evaluate(() => {
    const host = document.createElement("div");
    host.className = "lightmetal";
    document.body.appendChild(host);
    const editor = window.lightmetal.init({ element: host });
    const html = '<table style="color:red" onclick="alert(1)">' +
      '<caption>Quarterly sales</caption>' +
      '<colgroup span="2"><col span="2" width="120"></colgroup>' +
      '<thead><tr><th id="table-region" scope="col" abbr="Area">Region</th>' +
      '<th id="table-sales" scope="col">Sales</th></tr></thead>' +
      '<tbody><tr><th id="table-north" scope="row" rowspan="2">North</th>' +
      '<td headers="table-north table-sales" onmouseover="alert(2)">10</td></tr>' +
      '<tr><td headers="table-north table-sales">20</td></tr></tbody>' +
      '<tfoot><tr><td colspan="2">Total: 30</td></tr></tfoot></table>';
    const inspect = () => {
      const table = editor.content.querySelector("table");
      return !!table &&
        table.querySelector("caption")?.textContent === "Quarterly sales" &&
        table.querySelector('colgroup[span="2"] col[span="2"][width="120"]') !== null &&
        table.querySelectorAll("thead tr").length === 1 &&
        table.querySelectorAll("tbody tr").length === 2 &&
        table.querySelectorAll("tfoot tr").length === 1 &&
        table.querySelector('th[id="table-region"][scope="col"][abbr="Area"]') !== null &&
        table.querySelector('th[id="table-north"][scope="row"][rowspan="2"]') !== null &&
        table.querySelectorAll('td[headers="table-north table-sales"]').length === 2 &&
        table.querySelector('tfoot td[colspan="2"]') !== null &&
        !table.querySelector("[onmouseover]") &&
        !table.hasAttribute("onclick") && !table.hasAttribute("style");
    };
    editor.setHTML(html);
    const imported = inspect();
    const sourceButton = host.querySelector('button[title="Source"]');
    sourceButton.click();
    const source = editor.getHTML() === editor.source.value &&
      editor.source.value.includes("<thead>") && editor.source.value.includes("<tfoot>");
    sourceButton.click();
    const roundTrip = inspect();
    editor.setHTML("");
    editor.content.focus();
    const range = document.createRange();
    range.selectNodeContents(editor.content);
    range.collapse(false);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    const dt = new DataTransfer();
    dt.setData("text/html", html);
    const event = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", { value: dt });
    editor.content.dispatchEvent(event);
    const pasted = inspect();
    editor.setHTML('<p id="unrelated" scope="col" headers="table-sales" span="2">Text</p>');
    const scopedAttributes = editor.getHTML() === "<p>Text</p>";
    editor.destroy();
    host.remove();
    return { imported, source, roundTrip, pasted, scopedAttributes };
  });
  check("setHTML preserves table sections, columns, spans and accessible headers", tablePreservation.imported);
  check("source mode preserves table structure", tablePreservation.source && tablePreservation.roundTrip);
  check("paste preserves tables while stripping styles and handlers", tablePreservation.pasted);
  check("table-specific attributes stay restricted to table elements", tablePreservation.scopedAttributes);

  // Table insertion uses native input/undo and respects source mode.
  await page.evaluate(() => {
    const host = document.createElement("div");
    host.className = "lightmetal lightmetal-light";
    document.body.appendChild(host);
    window.__tableChanges = [];
    window.__tableEditor = window.lightmetal.init({
      element: host,
      actions: ["table", "source"],
      onChange: (html) => window.__tableChanges.push(html)
    });
  });
  const insertedTable = await page.evaluate(() => {
    const editor = window.__tableEditor;
    const ok = editor.insertTable(3, 4);
    return {
      ok,
      rows: editor.content.querySelectorAll("tr").length,
      cells: editor.content.querySelectorAll("td").length,
      trailingParagraph: editor.content.lastElementChild?.tagName === "DIV",
      changes: window.__tableChanges.length
    };
  });
  check("insertTable creates the requested cells and a trailing paragraph",
    insertedTable.ok && insertedTable.rows === 3 && insertedTable.cells === 12 && insertedTable.trailingParagraph);
  check("insertTable fires onChange once", insertedTable.changes === 1);
  await page.keyboard.press("Control+z");
  check("table insertion can be undone", await page.evaluate(() => !window.__tableEditor.content.querySelector("table")));
  await page.keyboard.press("Control+y");
  check("table insertion can be redone", await page.evaluate(() => window.__tableEditor.content.querySelectorAll("td").length === 12));
  await page.evaluate(() => {
    const editor = window.__tableEditor;
    editor.content.focus();
    const range = document.createRange();
    range.selectNodeContents(editor.content.querySelector("td"));
    range.collapse(true);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  });
  await page.keyboard.type("Cell text");
  check("inserted table cells accept text without losing structure", await page.evaluate(() =>
    window.__tableEditor.content.querySelector("td").textContent === "Cell text" &&
    window.__tableEditor.content.querySelectorAll("td").length === 12));
  const tableStyles = await page.evaluate(() => {
    const editor = window.__tableEditor;
    const results = [];
    editor.setHTML('<table><thead><tr><th scope="col">Header</th></tr></thead><tbody><tr><td>Cell</td></tr></tbody></table>');
    for (const theme of ["light", "dark"]) {
      editor.element.className = "lightmetal lightmetal-" + theme;
      const cell = getComputedStyle(editor.content.querySelector("td"));
      const header = getComputedStyle(editor.content.querySelector("th"));
      const toolbar = getComputedStyle(editor.element.querySelector(".lightmetal-actionbar"));
      results.push({
        border: cell.borderTopColor,
        themed: cell.borderTopColor === toolbar.borderBottomColor &&
          header.backgroundColor === toolbar.backgroundColor,
        padded: cell.paddingTop === "6px" && cell.paddingLeft === "10px" && cell.borderTopWidth === "1px",
        collapsed: getComputedStyle(editor.content.querySelector("table")).borderCollapse === "collapse"
      });
    }
    return results;
  });
  check("table borders, headers and padding follow light/dark themes",
    tableStyles.every((s) => s.themed && s.padded && s.collapsed) && tableStyles[0].border !== tableStyles[1].border);
  const rejectedTables = await page.evaluate(() => {
    const editor = window.__tableEditor;
    const before = editor.getHTML();
    const invalid = [[0, 2], [2, -1], [1.5, 2], [1001, 1], [1, 101], [101, 100], [NaN, 2], ["2", 2]];
    const rejected = invalid.every(([rows, columns]) => editor.insertTable(rows, columns) === false);
    editor.element.querySelector('button[title="Source"]').click();
    const sourceRejected = editor.insertTable(2, 2) === false && editor.getHTML() === before;
    editor.element.querySelector('button[title="Source"]').click();
    return rejected && sourceRejected && editor.getHTML() === before;
  });
  check("invalid dimensions and source-mode insertion leave content unchanged", rejectedTables);
  await page.evaluate(() => {
    window.__tableEditor.setHTML("");
    window.__tableEditor.content.focus();
    window.__tableEditor.element.querySelector('button[title="Table"]').click();
    window.__tableEditor.element.querySelector('.lightmetal-table-menu [role="menuitem"]').click();
  });
  check("table toolbar opens an insertion dropdown", await page.evaluate(() =>
    !window.__tableEditor.element.querySelector('.lightmetal-table-dropdown[role="dialog"]').hidden));
  await page.evaluate(() => window.__tableEditor.element.querySelector('[data-column="3"][data-row="2"]').click());
  check("grid inserts the requested table", await page.evaluate(() => window.__tableEditor.content.querySelectorAll("td").length === 6));
  const beforeCancel = await page.evaluate(() => window.__tableEditor.getHTML());
  await page.evaluate(() => window.__tableEditor.element.querySelector('button[title="Table"]').click());
  await page.keyboard.press("Escape");
  check("canceling table insertion leaves content unchanged", beforeCancel === await page.evaluate(() => window.__tableEditor.getHTML()));
  const destroyedTable = await page.evaluate(() => {
    const editor = window.__tableEditor;
    editor.destroy();
    editor.element.remove();
    return editor.insertTable(2, 2);
  });
  check("destroyed editors refuse table insertion", destroyedTable === false);

  await require("./table-controls.js")(page, check);
  await require("./table-insertion.js")(page, check);
  await require("./table-menu.js")(page, check);

  // rawMode passes HTML through untouched.
  const rawHTML = await page.evaluate(() => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    window.__raw = window.lightmetal.init({ element: host, rawMode: true });
    window.__raw.setHTML('<i onclick="alert(1)">raw</i>');
    return window.__raw.content.innerHTML;
  });
  check(
    "rawMode keeps event handlers as-is (no sanitization)",
    rawHTML.includes('onclick="alert(1)"')
  );
  const pasteUntouched = await page.evaluate(() => {
    const content = window.__raw.content;
    content.focus();
    const dt = new DataTransfer();
    dt.setData("text/html", '<span onmouseover="alert(2)">raw paste</span>');
    const ev = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(ev, "clipboardData", { value: dt });
    content.dispatchEvent(ev);
    return ev.defaultPrevented;
  });
  check("rawMode does not intercept rich pastes", pasteUntouched === false);
  await page.evaluate(() => {
    window.__raw.element.remove();
    window.__raw.destroy();
  });

  // Toolbar buttons are labeled and keyboard-navigable.
  const labeled = await page.evaluate(() => {
    const bold = document.querySelector('#editor .lightmetal-actionbar button[title="Bold"]');
    bold.focus();
    return { label: bold.getAttribute("aria-label"), focused: document.activeElement === bold };
  });
  check("toolbar buttons carry aria-labels", labeled.label === "Bold");
  check("toolbar buttons take keyboard focus", labeled.focused);
  await page.keyboard.press("Tab");
  check(
    "Tab walks the toolbar in order",
    (await page.evaluate(() => document.activeElement.title)) === "Italic"
  );

  // Formatting shortcuts and native undo/redo still work.
  await page.evaluate(() => {
    const host = document.createElement("div");
    host.id = "editor-keys";
    document.body.appendChild(host);
    window.__keys = window.lightmetal.init({ element: host });
  });
  const KSEL = "#editor-keys .lightmetal-content";
  const isBold = () =>
    page.evaluate(
      (s) => /<(b|strong)[\s>]/.test(document.querySelector(s).innerHTML),
      KSEL
    );
  await page.click(KSEL);
  await page.keyboard.type("shortcut");
  await page.evaluate((s) => {
    const node = document.querySelector(s);
    const sel = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(node);
    sel.removeAllRanges();
    sel.addRange(range);
    node.focus();
  }, KSEL);
  await page.keyboard.press("Control+B");
  check("Ctrl+B bolds the selection", await isBold());
  await page.keyboard.press("Control+Z");
  check(
    "Ctrl+Z undoes the bold, text stays",
    !(await isBold()) && (await innerHTML(KSEL)).includes("shortcut")
  );
  await page.keyboard.press("Control+Y");
  check("Ctrl+Y redoes the bold", await isBold());
  await page.evaluate(() => window.__keys.destroy());

  // Image insertion through the URL form.
  const changesBeforeImage = await page.evaluate(() => window.changeCount);
  await page.click('#editor .lightmetal-actionbar button[title="Image"]');
  const imageForm = page.locator('#editor .lightmetal-insertion-popup');
  await imageForm.getByRole('tab',{name:'URL',exact:true}).click();
  await imageForm.getByLabel('Image URL',{exact:true}).fill('https://example.com/pic.png');
  await imageForm.getByLabel('Alt Text',{exact:true}).fill('picture');
  await imageForm.getByRole('button',{name:'Insert',exact:true}).click();
  check(
    "URL image inserts at the cursor with an alt",
    (await innerHTML(CONTENT)).includes(
      '<img src="https://example.com/pic.png" alt="picture">'
    )
  );
  check(
    "image insertion fires onChange exactly once",
    (await page.evaluate((before) => window.changeCount - before, changesBeforeImage)) === 1
  );

  // Unsafe URL schemes are rejected without a toolbar notice.
  const htmlBeforeUnsafe = await innerHTML(CONTENT);
  await page.click('#editor .lightmetal-actionbar button[title="Image"]');
  await imageForm.getByRole('tab',{name:'URL',exact:true}).click();
  await imageForm.getByLabel('Image URL',{exact:true}).fill('javascript:alert(1)');
  check('unsafe image URL disables Insert',await imageForm.getByRole('button',{name:'Insert',exact:true}).isDisabled());
  await page.keyboard.press('Escape');
  check(
    "javascript: URLs are not inserted",
    (await innerHTML(CONTENT)) === htmlBeforeUnsafe
  );
  check(
    "rejection does not add a toolbar notice",
    (await page.locator("#editor .lightmetal-error").count()) === 0
  );

  // Programmatic insertion: a data URI lands in the editor (no prompt).
  const TINY =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAD1fJ4nAAAAEElEQVR4nGP8z8BQDwYCBGAApX49QgAAAABJRU5ErkJggg==";
  const apiOk = await page.evaluate((src) => window.editor.insertImage(src), TINY);
  check("insertImage(data URI) resolves true", apiOk === true);
  check(
    "data URI image lands in the editor",
    (await innerHTML(CONTENT)).includes('src="data:image/png;base64,')
  );
  const okUnsafe = await page.evaluate(() => window.editor.insertImage("vbscript:msgbox(1)"));
  check("insertImage rejects unsafe URL strings", okUnsafe === false);
  check(
    "programmatic rejection does not add a toolbar notice",
    (await page.locator("#editor .lightmetal-error").count()) === 0
  );

  // Programmatic images must not overwrite source edits.
  const sourceImage = await page.evaluate(async () => {
    document.querySelector('#editor button[title="Source"]').click();
    window.editor.source.value = "<p>source edit</p>";
    const before = window.editor.content.innerHTML;
    const ok = await window.editor.insertImage("https://example.com/p.png");
    const preserved = window.editor.source.value === "<p>source edit</p>" &&
      window.editor.content.innerHTML === before;
    document.querySelector('#editor button[title="Source"]').click();
    return { ok, preserved, html: window.editor.getHTML() };
  });
  check("insertImage in source mode preserves edits", !sourceImage.ok &&
    sourceImage.preserved && sourceImage.html === "<p>source edit</p>");

  // Paste an image file from the clipboard.
  const dataCount = () =>
    page.evaluate(
      () =>
        [...document.querySelectorAll("#editor img")].filter((i) =>
          i.src.startsWith("data:image/png")
        ).length
    );
  const pasteBefore = await dataCount();
  const changesBeforePaste = await page.evaluate(() => window.changeCount);
  await page.evaluate(async ({ url, contentSel }) => {
    const res = await fetch(url);
    const blob = await res.blob();
    const file = new File([blob], "tiny.png", { type: "image/png" });
    const dt = new DataTransfer();
    dt.items.add(file);
    const content = document.querySelector(contentSel);
    content.focus();
    const ev = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(ev, "clipboardData", { value: dt });
    content.dispatchEvent(ev);
  }, { url: "/img/tiny.png", contentSel: CONTENT });
  await page.waitForFunction(
    (before) =>
      [...document.querySelectorAll("#editor img")].filter((i) =>
        i.src.startsWith("data:image/png")
      ).length > before,
    pasteBefore,
    { timeout: 8000 }
  );
  check("pasted image appears with base64 src", (await dataCount()) === pasteBefore + 1);
  check(
    "pasted image fires onChange exactly once",
    (await page.evaluate((b) => window.changeCount - b, changesBeforePaste)) === 1
  );

  // Drag and drop an image file onto the editor.
  const dropBefore = await dataCount();
  await page.evaluate(async (url) => {
    const res = await fetch(url);
    const blob = await res.blob();
    const file = new File([blob], "tiny.png", { type: "image/png" });
    const dt = new DataTransfer();
    dt.items.add(file);
    const ev = new Event("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(ev, "dataTransfer", { value: dt });
    document.querySelector("#editor").dispatchEvent(ev);
  }, "/img/tiny.png");
  await page.waitForFunction(
    (before) =>
      [...document.querySelectorAll("#editor img")].filter((i) =>
        i.src.startsWith("data:image/png")
      ).length > before,
    dropBefore,
    { timeout: 8000 }
  );
  check("dropped image appears with base64 src", (await dataCount()) === dropBefore + 1);

  // Custom upload handler: files go through onInsert instead of local base64.
  // The custom editor lives in a tab, so activate it first; inserting into
  // a display:none panel cannot take focus and would fail.
  await page.click("#tab-custom");
  const uploaded = await page.evaluate(async (url) => {
    const res = await fetch(url);
    const file = new File([await res.blob()], "tiny.png", { type: "image/png" });
    return window.customEditor.insertImage(file);
  }, "/img/tiny.png");
  check("custom onInsert handler is used for files", uploaded === true);
  check(
    "uploaded image appears in the custom editor",
    (await innerHTML("#editor-custom .lightmetal-content")).includes(
      "data:image/png;base64,"
    )
  );

  // Async uploads insert at the original selection even if focus/caret moves.
  const asyncSelection = await page.evaluate(async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    let finish;
    const editor = window.lightmetal.init({ element: host, images: {
      onInsert: () => new Promise((resolve) => { finish = resolve; })
    } });
    editor.setHTML("<p>before after</p>");
    const text = editor.content.querySelector("p").firstChild;
    const range = document.createRange();
    range.setStart(text, 7);
    range.collapse(true);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    const file = new File([new Uint8Array(1)], "tiny.png", { type: "image/png" });
    const pending = editor.insertImage(file);
    const other = document.createRange();
    other.selectNodeContents(text);
    other.collapse(false);
    selection.removeAllRanges();
    selection.addRange(other);
    finish("https://example.com/p.png");
    const ok = await pending;
    const html = editor.getHTML();
    editor.destroy();
    host.remove();
    return { ok, html };
  });
  check("async upload uses original caret", asyncSelection.ok &&
    /before(?: |&nbsp;)<img src="https:\/\/example.com\/p.png"/.test(asyncSelection.html) &&
    asyncSelection.html.includes('>after</p>'));

  // A pending upload must not replace source edits after a mode switch.
  const pendingSource = await page.evaluate(async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    let finish;
    const editor = window.lightmetal.init({ element: host, images: {
      onInsert: () => new Promise((resolve) => { finish = resolve; })
    } });
    editor.setHTML("<p>original</p>");
    const file = new File([new Uint8Array(1)], "tiny.png", { type: "image/png" });
    const pending = editor.insertImage(file);
    host.querySelector('button[title="Source"]').click();
    editor.source.value = "<p>edited</p>";
    finish("https://example.com/p.png");
    const ok = await pending;
    const preserved = editor.getHTML() === "<p>edited</p>";
    editor.destroy();
    host.remove();
    return { ok, preserved };
  });
  check("pending image cannot overwrite source edits", !pendingSource.ok && pendingSource.preserved);

  // A failing upload returns false and leaves content untouched.
  await page.evaluate(() => {
    const host = document.createElement("div");
    host.id = "editor-broken";
    document.body.appendChild(host);
    window.__broken = window.lightmetal.init({
      element: host,
      images: { onInsert: async () => { throw new Error("upload failed"); } }
    });
  });
  const okBroken = await page.evaluate(async () => {
    const file = new File([new Uint8Array(69)], "tiny.png", { type: "image/png" });
    return window.__broken.insertImage(file);
  });
  check("failed upload resolves false", okBroken === false);
  check(
    "failed upload does not add a toolbar notice",
    (await page.locator("#editor-broken .lightmetal-error").count()) === 0
  );
  check(
    "failed upload leaves content intact",
    (await innerHTML("#editor-broken .lightmetal-content")) === ""
  );
  await page.evaluate(() => window.__broken.destroy());

  // Type and size validation.
  await page.evaluate(() => {
    const host = document.createElement("div");
    host.id = "editor-limit";
    document.body.appendChild(host);
    window.__limit = window.lightmetal.init({
      element: host,
      images: { maxSize: 10 }
    });
  });
  const okType = await page.evaluate(async () => {
    const bad = new File([new Uint8Array(4)], "evil.txt", { type: "text/plain" });
    return window.__limit.insertImage(bad);
  });
  check("unsupported file type is rejected", okType === false);
  check(
    "type rejection does not add a toolbar notice",
    (await page.locator("#editor-limit .lightmetal-error").count()) === 0
  );
  const okSize = await page.evaluate(async () => {
    const big = new File([new Uint8Array(2048)], "big.png", { type: "image/png" });
    return window.__limit.insertImage(big);
  });
  check("oversized image is rejected", okSize === false);
  check(
    "size rejection does not add a toolbar notice",
    (await page.locator("#editor-limit .lightmetal-error").count()) === 0
  );
  await page.evaluate(() => window.__limit.destroy());

  // A hostile custom handler that returns an unsafe URL is rejected.
  await page.evaluate(() => {
    const host = document.createElement("div");
    host.id = "editor-hostile";
    document.body.appendChild(host);
    window.__hostile = window.lightmetal.init({
      element: host,
      images: { onInsert: async () => "javascript:alert(1)" }
    });
  });
  const okHostile = await page.evaluate(async () => {
    const file = new File([new Uint8Array(4)], "tiny.png", { type: "image/png" });
    return window.__hostile.insertImage(file);
  });
  check("handler-returned unsafe URLs are rejected", okHostile === false);
  check(
    "hostile handler rejection does not add a toolbar notice",
    (await page.locator("#editor-hostile .lightmetal-error").count()) === 0
  );
  await page.evaluate(() => window.__hostile.destroy());

  // With allowURL off the popover offers Upload only.
  await page.evaluate(() => {
    const host = document.createElement("div");
    host.id = "editor-pick";
    document.body.appendChild(host);
    window.__pick = window.lightmetal.init({
      element: host,
      images: { allowURL: false }
    });
  });
  const pickersBefore = await page.$$eval("input[type=file]", (i) => i.length);
  await page.click("#editor-pick .lightmetal-actionbar button[title=Image]");
  check(
    "allowURL:false creates one hidden file picker",
    (await page.$$eval("input[type=file]", (i) => i.length)) === pickersBefore + 1
  );
  const fileBuffer = fs.readFileSync(path.join(ROOT, "examples", "images", "tiny.png"));
  await page.setInputFiles("#editor-pick input[type=file]", {
    name: "tiny.png",
    mimeType: "image/png",
    buffer: fileBuffer
  });
  await page.waitForFunction(
    () => document.querySelector("#editor-pick img") !== null,
    null,
    { timeout: 8000 }
  );
  check(
    "picked file is inserted",
    await page.evaluate(() => document.querySelector("#editor-pick img") !== null)
  );
  await page.evaluate(() => window.__pick.destroy());
  check(
    "destroy removes the hidden file picker",
    (await page.$$eval("input[type=file]", (i) => i.length)) === pickersBefore
  );

  // With images disabled the button refuses to insert.
  await page.evaluate(() => {
    const host = document.createElement("div");
    host.id = "editor-off";
    document.body.appendChild(host);
    window.__off = window.lightmetal.init({
      element: host,
      images: { enabled: false }
    });
  });
  await page.click("#editor-off .lightmetal-actionbar button[title=Image]");
  check(
    "disabled images do not add a toolbar notice",
    (await page.locator("#editor-off .lightmetal-error").count()) === 0
  );
  check(
    "disabled images insert nothing",
    (await innerHTML("#editor-off .lightmetal-content")) === ""
  );
  await page.evaluate(() => window.__off.destroy());

  // Every listener must be removed with the original callback/capture flag,
  // including lazy dropdown/file-picker handlers and document/window events.
  const listenerCleanup = await page.evaluate(() => {
    const prototype = EventTarget.prototype;
    const add = prototype.addEventListener;
    const remove = prototype.removeEventListener;
    const active = [];
    let registered = 0;
    const capture = (options) => typeof options === "boolean" ? options : !!options?.capture;
    prototype.addEventListener = function (type, handler, options) {
      active.push({ target: this, type, handler, capture: capture(options) });
      registered++;
      return add.call(this, type, handler, options);
    };
    prototype.removeEventListener = function (type, handler, options) {
      const index = active.findIndex((listener) => listener.target === this &&
        listener.type === type && listener.handler === handler && listener.capture === capture(options));
      if (index !== -1) active.splice(index, 1);
      return remove.call(this, type, handler, options);
    };
    const host = document.createElement("div");
    host.className = "lightmetal";
    document.body.appendChild(host);
    let editor;
    try {
      editor = window.lightmetal.init({
        element: host, actions: ["bold", "image", "table", "source"], images: { allowURL: false }
      });
      host.querySelector('button[title="Image"]').click();
      const imageUI = !!host.querySelector('input[type="file"]');
      host.querySelector('button[title="Table"]').click();
      host.querySelector('.lightmetal-table-menu [role="menuitem"]').click();
      const lazyUI = imageUI && !host.querySelector('input[type="file"]') &&
        host.querySelectorAll(".lightmetal-table-grid button").length === 80;
      const capturedScroll = active.some((listener) => listener.target === window &&
        listener.type === "scroll" && listener.capture);
      editor.destroy();
      editor.destroy();
      return { registered, remaining: active.length, lazyUI, capturedScroll, empty: !host.childNodes.length };
    } finally {
      editor?.destroy();
      host.remove();
      prototype.addEventListener = add;
      prototype.removeEventListener = remove;
    }
  });
  check("destroy unregisters all listeners, including lazy UI and capture-mode scroll",
    listenerCleanup.registered > 0 && listenerCleanup.remaining === 0 &&
    listenerCleanup.lazyUI && listenerCleanup.capturedScroll && listenerCleanup.empty);

  // Repeated create/destroy cycles leave no orphan editor DOM behind.
  const contentsBefore = await page.evaluate(() =>
    document.querySelectorAll(".lightmetal-content").length
  );
  await page.evaluate(() => {
    for (let i = 0; i < 100; i++) {
      const host = document.createElement("div");
      document.body.appendChild(host);
      window.lightmetal.init({ element: host }).destroy();
      host.remove();
    }
  });
  check(
    "100 create/destroy cycles leave no orphan editor DOM",
    (await page.evaluate(() => document.querySelectorAll(".lightmetal-content").length)) ===
      contentsBefore
  );

  await require("./editor-lifecycle")(page, check);
  await require("./html-formatting")(page);
  await require("./html-fullscreen")(page);

  if (errors.length) throw new Error("page errors: " + errors.join(" | "));
  console.log(label + ": ok");
  await page.close();
}

// The spec requires the demo to work with plain <script> tags and no server.
async function fileCheck() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("file://" + path.join(ROOT, "examples", "html.html"));
  const global = await page.evaluate(() => typeof window.lightmetal);
  const mainButtons = await page.locator("#editor .lightmetal-button").count();
  const customButtons = await page.locator("#editor-custom .lightmetal-button").count();
  if (errors.length) throw new Error("file:// page errors: " + errors.join(" | "));
  if (global !== "object") {
    throw new Error("file:// demo exposes " + global + ", expected object");
  }
  if (mainButtons !== 20) throw new Error("file:// demo toolbar: " + mainButtons + " buttons");
  if (customButtons !== 6) {
    throw new Error("file:// custom toolbar: " + customButtons + " buttons");
  }
  console.log("chromium file:// demo: ok");
  await page.goto("file://" + path.join(ROOT, "examples", "skins.html"));
  const gallery = await page.evaluate(() => Object.keys(window.__skinEditors));
  if (gallery.length !== 8) throw new Error("file:// skin gallery did not initialize");
  for (const [mode, background] of [["dark", "rgb(20, 36, 45)"], ["light", "rgb(255, 255, 255)"]]) {
    await page.selectOption("#palette", mode);
    const actual = await page.locator("#skin-frost .lightmetal-content").evaluate((node) => getComputedStyle(node).backgroundColor);
    if (actual !== background) throw new Error("file:// skin gallery palette failed: " + mode);
  }
  await page.selectOption("#palette", "auto");
  if (errors.length) throw new Error("file:// skin gallery errors: " + errors.join(" | "));
  console.log("chromium file:// skin gallery: ok");
  await page.close();
  await browser.close();
}

(async () => {
  const server = startServer();
  try {
    await waitUntil(BASE + "/", 20000);
    for (const [browser, label] of [
      [chromium, "chromium"],
      [firefox, "firefox"]
    ]) {
      const launched = await browser.launch();
      try {
        await require('./themes').runThemeChecks(launched);
        await require('./themes').runThemeChecks(launched, { minified: true });
        console.log(label + ' independent/shared CSS themes (plain/minified): ok');
        await require('./showcase').runShowcaseChecks(launched, BASE + '/');
        console.log(label + ' five-library showcase/navigation: ok');
        await runChecks(launched, label);
        await require("./skins").runSkinChecks(launched, BASE + "/", BASE + "/dist/");
        console.log(label + " seven skins (plain/minified): ok");
        await require("./skins").runGalleryChecks(launched, BASE + "/");
        console.log(label + " Node skin gallery/navigation: ok");
      } finally {
        await launched.close();
      }
    }
    await fileCheck();
  } finally {
    server.kill();
  }
  console.log("smoke: ok");
})().catch((e) => {
  console.error("FAIL", e);
  process.exit(1);
});
