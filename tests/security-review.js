/* Security regressions and observational review results.
 * Run after building: NODE_PATH=$(npm root -g) node tests/security-review.js
 * Use --json for a detailed report. Failures or unsafe normal paths exit nonzero.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium, firefox } = require("playwright");
const { markdownSecurityChecks } = require("./security-markdown");
const ROOT = path.resolve(__dirname, "..");
const PNG = fs.readFileSync(path.join(ROOT, "examples/images/tiny.png"));
const DATA = `data:image/png;base64,${PNG.toString("base64")}`;
const sentinel = "window.__sentinel++";
const badImage = `<img src="/missing" onerror="${sentinel}">`;
const payloads = [
  ["script/style/handlers", `<script>${sentinel}</script><style>body{display:none}</style>${badImage}<b onclick="${sentinel}">keep</b>`],
  ["mixed-case handlers", `<IMG SRC=/missing OnErRoR="${sentinel}"><p OnClick="${sentinel}">keep</p>`],
  ["encoded handler", `<img src=/missing onerror="window&#46;__sentinel++">`],
  ["encoded scheme", `<a href="&#106;avascript:${sentinel}">link</a>`],
  ["control-character scheme", `<a href="java&#9;script:${sentinel}">link</a><img src="java&#10;script:${sentinel}">`],
  ["leading closing tags", `</div></body><script>${sentinel}</script>${badImage}<p>tail</p>`],
  ["full document", `<!doctype html><html><head><script>${sentinel}</script></head><body>${badImage}<p>body</p></body></html>`],
  ["iframe/object/embed", `<iframe srcdoc="<script>${sentinel}</script>"></iframe><object data="javascript:${sentinel}"></object><embed src="data:text/html,evil">`],
  ["form controls", `<form action="javascript:${sentinel}"><input name=content><button formaction="javascript:${sentinel}">go</button>${badImage}</form>`],
  ["template", `<template>${badImage}<script>${sentinel}</script></template><p>outside</p>`],
  ["SVG", `<svg onload="${sentinel}"><a xlink:href="javascript:${sentinel}">link</a><foreignObject>${badImage}</foreignObject></svg>`],
  ["MathML", `<math><mtext>${badImage}</mtext><annotation-xml encoding="text/html">${badImage}</annotation-xml></math>`],
  ["namespace repair", `<svg><p><style><g title="</style>${badImage}">text</g></svg>`],
  ["MathML mutation", `<math><mtext><table><mglyph><style><!--</style><img title="--><img src=/missing onerror='${sentinel}'>">`],
  ["form mutation", `<form><math><mtext></form><form><mglyph><style></math>${badImage}`],
  ["noscript", `<noscript><p title="</noscript>${badImage}">text</p></noscript>`],
  ["textarea/xmp/plaintext", `<textarea>${badImage}</textarea><xmp>${badImage}</xmp><plaintext>${badImage}`],
  ["table parser repair", `<table><tr><td>${badImage}</td></tr><svg><script>${sentinel}</script></svg></table>`],
  ["bare table fragments", `<td onclick="${sentinel}">cell</td><colgroup><col onload="${sentinel}"></colgroup>`],
  ["unexpected URL attributes", `<img src=/tiny.png srcset="/missing 2x" poster=/missing><a action="javascript:${sentinel}" xlink:href="javascript:${sentinel}">link</a><p srcdoc="evil">text</p>`],
  ["style/class stripping", `<p class=evil style="background:url(/missing)" data-x=x contenteditable=false tabindex=0>keep</p>`],
  ["unknown children", `<unknown-tag><script>${sentinel}</script><b onclick="${sentinel}">keep</b>${badImage}</unknown-tag>`],
  ["malformed comment", `<!--><img src=/missing onerror="${sentinel}"><!-- -->`],
  ["data image import", `<img src="${DATA}">`],
  ["positive formatting", `<h2>heading</h2><p><b>bold</b> <i>italic</i> <a href=/safe>link</a></p>`],
  ["positive table", '<table><caption>Tasks</caption><colgroup><col span=2></colgroup><thead><tr><th id=header scope=col colspan=2>Group</th></tr></thead><tbody><tr><td headers=header>One</td><td>Two</td></tr></tbody></table>'],
  ["clobbering IDs", '<table><tr><td id=__editor>one</td><td id=content>two</td><td id=__proto__>three</td><td id=constructor>four</td></tr></table>']
];
const urls = [
  "javascript:window.__sentinel++", " JAVASCRIPT:window.__sentinel++ ",
  "java\tscript:window.__sentinel++", "java\nscript:window.__sentinel++",
  "vbscript:msgbox(1)", "file:///tmp/test", "blob:http://localhost/example",
  "data:text/html,<script>window.__sentinel++</script>",
  "mailto:me@example.com", "/tiny.png", "tiny.png", "//127.0.0.1:1/image",
  "https://example.invalid/image", DATA,
  ...["jpeg", "gif", "webp"].map((type) => DATA.replace("image/png", `image/${type}`)),
  "data:image/png;base64,====",
  "data:image/png;base64,", "data:image/png;base64,not base64",
  "data:image/not-a-format;base64,AAAA",
  `data:image/svg+xml;base64,${Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" onload="${sentinel}"/>`).toString("base64")}`,
  '/tiny.png?x=" onerror="window.__sentinel++',
  "/tiny.png?x=&quot; onerror=&quot;window.__sentinel++"
];

async function createEditor(page, options = {}) {
  await page.evaluate((settings) => {
    window.__editor?.destroy();
    document.getElementById("review-host")?.remove();
    const host = document.createElement("div");
    host.id = "review-host";
    host.className = "lightmetal";
    document.body.appendChild(host);
    window.__sentinel = 0;
    window.__editor = (window.__factory || lightmetal.init)({ element: host, ...settings });
  }, options);
}

async function inspectDOM(page) {
  return page.evaluate(async () => {
    const editor = window.__editor;
    const settle = (root) => Promise.all(Array.from(root.querySelectorAll("img"), (img) =>
      img.complete ? Promise.resolve() : new Promise((resolve) => {
        img.addEventListener("load", resolve, { once: true });
        img.addEventListener("error", resolve, { once: true });
      })
    ));
    await settle(editor.content);
    const executionsAfterInsertion = window.__sentinel;
    const first = editor.getHTML();
    const reparse = document.createElement("div");
    document.body.appendChild(reparse);
    reparse.innerHTML = first;
    await settle(reparse);
    const executionsAfterReparse = window.__sentinel;
    const roots = [editor.content, reparse];
    const violations = [];
    const blocked = "script,style,iframe,object,embed,svg,math,form,input,button,template";
    for (const root of roots) {
      for (const el of root.querySelectorAll("*")) {
        if (el.matches(blocked)) violations.push(el.tagName);
        if (el.namespaceURI !== "http://www.w3.org/1999/xhtml") violations.push(`namespace:${el.tagName}`);
        for (const attr of el.attributes) {
          if (/^on/i.test(attr.name) || ["srcdoc", "srcset", "style", "class", "action", "xlink:href"].includes(attr.name)) {
            violations.push(`${el.tagName}:${attr.name}`);
          }
          if (["href", "src"].includes(attr.name)) {
            const url = new URL(attr.value, document.baseURI);
            const supportedData = attr.name === "src" && /^data:image\/(?:jpeg|png|gif|webp);base64,/i.test(attr.value);
            if (!["http:", "https:"].includes(url.protocol) && !(attr.name === "href" && url.protocol === "mailto:") && !supportedData) {
              violations.push(`${el.tagName}:${attr.name}:${url.protocol}`);
            }
          }
        }
        // Trigger common non-resource handlers without navigating links.
        for (const event of ["click", "mouseover", "focus", "load", "error"]) {
          el.dispatchEvent(new Event(event));
        }
      }
    }
    const result = {
      html: first, violations, executions: window.__sentinel,
      executionsAfterInsertion, executionsAfterReparse,
      editorIntact: editor.element === document.getElementById("review-host") && typeof editor.setHTML === "function"
    };
    reparse.remove();
    return result;
  });
}

async function runReview(engine, name, base) {
  const browser = await engine.launch();
  const report = { browser: name, version: browser.version(), imports: [], urls: [], files: [], drops: [], async: [] };
  try {
    const page = await browser.newPage();
    const requests = [];
    page.on("request", (req) => requests.push(req.url()));
    // Never send review traffic to a third-party host.
    const frameOrigin = base.replace("127.0.0.1", "localhost");
    await page.route("**/*", (route) => route.request().url().startsWith(base + "/") ||
      route.request().url().startsWith(frameOrigin + "/") || route.request().url().startsWith("data:")
      ? route.continue() : route.abort());
    await page.goto(base);
    for (const route of ["setHTML", "paste"]) {
      for (const [label, html] of payloads) {
        await createEditor(page);
        const before = requests.length;
        const error = await page.evaluate(({ route, html }) => {
          try {
            if (route === "setHTML") window.__editor.setHTML(html);
            else {
              const content = window.__editor.content;
              content.focus();
              const selection = document.getSelection();
              const range = document.createRange();
              range.selectNodeContents(content);
              selection.removeAllRanges();
              selection.addRange(range);
              const data = new DataTransfer();
              data.setData("text/html", html);
              const event = new Event("paste", { bubbles: true, cancelable: true });
              Object.defineProperty(event, "clipboardData", { value: data });
              content.dispatchEvent(event);
            }
            return null;
          } catch (error) { return error.message; }
        }, { route, html });
        report.imports.push({ route, label, error, ...await inspectDOM(page), requests: requests.slice(before) });
      }
    }

    for (const url of urls) {
      await createEditor(page);
      const image = await page.evaluate(async (url) => {
        const accepted = await window.__editor.insertImage(url);
        const img = window.__editor.content.querySelector("img");
        if (img && !img.complete) await new Promise((resolve) => {
          img.addEventListener("load", resolve, { once: true });
          img.addEventListener("error", resolve, { once: true });
        });
        return {
          accepted, html: window.__editor.getHTML(), executions: window.__sentinel,
          handlers: img ? Array.from(img.attributes).filter((a) => /^on/i.test(a.name)).length : 0,
          naturalWidth: img?.naturalWidth,
          error: window.__editor.element.querySelector(".lightmetal-error")?.textContent
        };
      }, url);
      await createEditor(page);
      const imported = await page.evaluate((url) => {
        const root = document.createElement("div");
        const link = document.createElement("a");
        link.href = url;
        link.textContent = "link";
        const img = document.createElement("img");
        img.setAttribute("src", url);
        root.append(link, img);
        window.__editor.setHTML(root.innerHTML);
        return window.__editor.getHTML();
      }, url);
      await createEditor(page);
      // Install the hook in the browser; functions cannot cross Playwright.
      await page.evaluate((url) => {
        window.__editor.destroy();
        window.__editor = lightmetal.init({
          element: document.getElementById("review-host"), images: { onInsert: async () => url }
        });
      }, url);
      const upload = await page.evaluate(async () => ({
        accepted: await window.__editor.insertImage(new File(["x"], "test.png", { type: "image/png" })),
        html: window.__editor.getHTML()
      }));
      report.urls.push({ url, image, imported, upload });
    }

    // Image prompt runs its URL validator, unlike the link prompt below.
    await createEditor(page);
    page.once("dialog", (dialog) => dialog.accept("javascript:window.__sentinel++"));
    await page.locator('#review-host button[title="Image"]').click();
    report.imagePrompt = await page.evaluate(() => ({
      html: window.__editor.getHTML(), executions: window.__sentinel,
      error: window.__editor.element.querySelector(".lightmetal-error")?.textContent
    }));

    // Real toolbar prompt and link activation in a non-editable preview.
    await createEditor(page);
    await page.evaluate(() => {
      window.__editor.setHTML("<p>click me</p>");
      window.__editor.content.focus();
      const range = document.createRange();
      range.selectNodeContents(window.__editor.content.firstChild);
      const selection = document.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    });
    page.once("dialog", (dialog) => dialog.accept("javascript:window.__sentinel++"));
    await page.locator('#review-host button[title="Link"]').click();
    const linkHTML = await page.evaluate(() => window.__editor.getHTML());
    await page.evaluate(() => {
      const preview = document.createElement("div");
      preview.id = "review-preview";
      preview.innerHTML = window.__editor.getHTML();
      document.body.appendChild(preview);
    });
    if (await page.locator("#review-preview a").count()) await page.locator("#review-preview a").click();
    await page.waitForFunction(() => window.__sentinel > 0 || !document.querySelector("#review-preview a[href^='javascript:']"));
    report.link = { html: linkHTML, executions: await page.evaluate(() => window.__sentinel) };
    await page.evaluate(() => document.getElementById("review-preview").remove());

    // Exercise native HTML drop, not just a synthetic drop handler.
    for (const options of [{}, { images: { dragDrop: false } }, { images: { enabled: false } }]) {
      await createEditor(page, options);
      await page.evaluate((html) => {
        document.getElementById("review-drag")?.remove();
        const source = document.createElement("div");
        source.id = "review-drag";
        source.draggable = true;
        source.textContent = "Drag here";
        source.addEventListener("dragstart", (event) => {
          event.dataTransfer.setData("text/html", html);
          event.dataTransfer.setData("text/plain", "drop me");
        });
        document.body.insertBefore(source, document.body.firstChild);
      }, `<b onclick="${sentinel}">drop me</b><a href="javascript:${sentinel}">link</a>${badImage}`);
      await page.locator("#review-drag").dragTo(page.locator("#review-host .lightmetal-content"));
      report.drops.push({ options, ...await inspectDOM(page) });
    }
    await page.evaluate(() => document.getElementById("review-drag").remove());

    // Repeat from a separate-origin frame (localhost versus 127.0.0.1).
    report.frameDrops = [];
    for (const options of [{}, { images: { dragDrop: false } }, { images: { enabled: false } }]) {
      await createEditor(page, options);
      await page.evaluate((origin) => {
        const iframe = document.createElement("iframe");
        iframe.id = "review-frame";
        iframe.setAttribute("sandbox", "allow-scripts allow-same-origin");
        iframe.src = origin + "/drag";
        document.body.insertBefore(iframe, document.body.firstChild);
        window.__dropLog = null;
        window.__editor.content.addEventListener("drop", (event) => {
          window.__dropLog = {
            html: event.dataTransfer.getData("text/html"),
            text: event.dataTransfer.getData("text/plain"), trusted: event.isTrusted
          };
        }, { once: true });
      }, frameOrigin);
      await page.frameLocator("#review-frame").locator("#drag-source").dragTo(
        page.locator("#review-host .lightmetal-content")
      );
      report.frameDrops.push({
        options, ...await inspectDOM(page),
        sourceStarted: await page.frameLocator("#review-frame").locator("#drag-source").getAttribute("data-started"),
        drop: await page.evaluate(() => window.__dropLog)
      });
      await page.evaluate(() => document.getElementById("review-frame").remove());
    }

    for (const format of ["iife", "esm"]) {
      await page.evaluate(async (format) => {
        window.__factory = format === "esm" ? (await import("/dist/lightmetal.esm.js")).init : lightmetal.init;
      }, format);
      const fileCases = [
        { label: "valid PNG", type: "image/png", name: "test.png", bytes: Array.from(PNG) },
        { label: "no MIME, PNG extension", type: "", name: "test.png", bytes: Array.from(PNG) },
        { label: "no MIME, misleading extension", type: "", name: "test.png", bytes: [60, 115, 118, 103, 62] },
        { label: "wrong MIME", type: "text/plain", name: "test.png", bytes: [1] },
        { label: "claimed PNG, HTML bytes", type: "image/png", name: "test.png", bytes: [60, 115, 118, 103, 62] },
        { label: "zero bytes", type: "image/png", name: "empty.png", bytes: [] },
        { label: "just below limit", type: "image/png", name: "test.png", bytes: Array(99).fill(0) },
        { label: "at limit", type: "image/png", name: "test.png", bytes: Array(100).fill(0) },
        { label: "above limit", type: "image/png", name: "test.png", bytes: Array(101).fill(0) },
        { label: "injection file name", type: "image/png", name: 'x" onerror="window.__sentinel++.png', bytes: Array.from(PNG) }
      ];
      for (const entry of fileCases) {
        await createEditor(page, { images: { maxSize: 100 } });
        const result = await page.evaluate(async (entry) => ({
          accepted: await window.__editor.insertImage(new File([new Uint8Array(entry.bytes)], entry.name, { type: entry.type })),
          html: window.__editor.getHTML(),
          error: window.__editor.element.querySelector(".lightmetal-error")?.textContent,
          executions: window.__sentinel
        }), entry);
        report.files.push({ format, label: entry.label, ...result });
      }
      await createEditor(page);
      report.files.push(await page.evaluate(async ({ format, data }) => {
        window.__editor.destroy();
        window.__editor = window.__factory({
          element: document.getElementById("review-host"), images: { onInsert: async () => data }
        });
        return {
          format, label: "no MIME with upload hook",
          accepted: await window.__editor.insertImage(new File(["x"], "test.png", { type: "" })),
          error: window.__editor.element.querySelector(".lightmetal-error")?.textContent
        };
      }, { format, data: DATA }));
    }
    await page.evaluate(() => { window.__factory = lightmetal.init; });

    for (const state of ["source", "destroy", "reject", "invalid-result"]) {
      await createEditor(page);
      const result = await page.evaluate(async ({ state, data }) => {
        const host = window.__editor.element;
        window.__editor.destroy();
        let finish;
        let fail;
        const pending = new Promise((resolve, reject) => { finish = resolve; fail = reject; });
        const editor = lightmetal.init({ element: host, images: { onInsert: () => pending } });
        window.__editor = editor;
        editor.setHTML("<p>keep</p>");
        const result = editor.insertImage(new File(["x"], "test.png", { type: "image/png" }));
        if (state === "source") host.querySelector('button[title="Source"]').click();
        if (state === "destroy") editor.destroy();
        if (state === "reject") fail(new Error('<img src=x onerror="window.__sentinel++">'));
        else finish(state === "invalid-result" ? { url: data } : data);
        return {
          accepted: await result, html: editor.getHTML(), children: host.childElementCount,
          error: host.querySelector(".lightmetal-error")?.textContent,
          errorHTML: host.querySelector(".lightmetal-error")?.innerHTML,
          executions: window.__sentinel
        };
      }, { state, data: DATA });
      report.async.push({ state, ...result });
    }

    const bypass = [];
    for (const mode of ["raw", "source"]) {
      await createEditor(page, mode === "raw" ? { rawMode: true } : {});
      const result = await page.evaluate(async (mode) => {
        const editor = window.__editor;
        const payload = '<b onclick="window.__sentinel++">intentional bypass</b>';
        if (mode === "raw") editor.setHTML(payload);
        else {
          editor.element.querySelector('button[title="Source"]').click();
          editor.source.value = payload;
          editor.element.querySelector('button[title="Source"]').click();
        }
        editor.content.querySelector("b").dispatchEvent(new Event("click"));
        return {
          html: editor.getHTML(), executions: window.__sentinel,
          rejectedImage: await editor.insertImage("javascript:window.__sentinel++") === false
        };
      }, mode);
      bypass.push({ mode, ...result });
    }
    report.bypass = bypass;

    report.unrestricted = [];
    for (const format of ["iife", "esm"]) {
      await page.evaluate(async (format) => {
        window.__factory = format === "esm" ? (await import("/dist/lightmetal.esm.js")).init : lightmetal.init;
      }, format);
      await createEditor(page, { unrestrictedMode: true, images: { maxSize: 1 } });
      const result = await page.evaluate(async (data) => {
        const editor = window.__editor;
        editor.setHTML('<script>window.__trustedScript = true</script><iframe></iframe><b onclick="window.__sentinel++">trusted</b>');
        const preserved = editor.getHTML();
        editor.content.querySelector("b").dispatchEvent(new Event("click"));
        const scriptImage = await editor.insertImage("javascript:window.__sentinel++");
        const svgFile = await editor.insertImage(new File([
          '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>'
        ], "trusted.svg", { type: "image/svg+xml" }));
        const missingMIME = await editor.insertImage(new File(["x"], "trusted.bin"));
        const form = new DataTransfer();
        form.setData("text/html", '<b onclick="window.__sentinel++">paste bypass</b>');
        const event = new Event("paste", { bubbles: true, cancelable: true });
        Object.defineProperty(event, "clipboardData", { value: form });
        editor.content.dispatchEvent(event);
        const pastePrevented = event.defaultPrevented;
        editor.element.querySelector('button[title="Source"]').click();
        const sourceRejected = await editor.insertImage(data) === false;
        editor.destroy();
        const destroyRejected = await editor.insertImage(data) === false;
        return { preserved, scriptImage, svgFile, missingMIME, pastePrevented,
          sourceRejected, destroyRejected, executions: window.__sentinel };
      }, DATA);
      await createEditor(page, { unrestrictedMode: true });
      result.uploadJavascript = await page.evaluate(async () => {
        window.__editor.destroy();
        window.__editor = window.__factory({
          element: document.getElementById("review-host"), unrestrictedMode: true,
          images: { maxSize: 1, onInsert: async () => "javascript:window.__sentinel++" }
        });
        return window.__editor.insertImage(new File(["trusted"], "trusted.txt", { type: "text/plain" }));
      });
      await page.evaluate(() => {
        window.__editor.setHTML("<p>trusted link</p>");
        window.__editor.content.focus();
        const range = document.createRange();
        range.selectNodeContents(window.__editor.content.firstChild);
        document.getSelection().removeAllRanges();
        document.getSelection().addRange(range);
      });
      page.once("dialog", (dialog) => dialog.accept("javascript:window.__sentinel++"));
      await page.locator('#review-host button[title="Link"]').click();
      result.linkHTML = await page.evaluate(() => window.__editor.getHTML());
      await page.evaluate(() => { window.__editor.content.contentEditable = "false"; });
      await page.locator("#review-host .lightmetal-content a").click();
      await page.waitForFunction(() => window.__sentinel > 0);
      result.linkExecutions = await page.evaluate(() => window.__sentinel);
      report.unrestricted.push({ format, ...result });
    }
    await page.evaluate(() => { window.__factory = lightmetal.init; });

    // Explicit feature switches still apply, even to trusted unrestricted input.
    await createEditor(page, { unrestrictedMode: true, images: { enabled: false } });
    report.unrestrictedDisabled = await page.evaluate(async () =>
      window.__editor.insertImage("javascript:window.__sentinel++"));
    await createEditor(page, { unrestrictedMode: true, images: { allowBase64: false } });
    report.unrestrictedBase64Disabled = await page.evaluate(async (data) => window.__editor.insertImage(data), DATA);

    // Normal imports strip base64 when the feature is disabled.
    await createEditor(page, { images: { allowBase64: false } });
    report.importBase64Disabled = await page.evaluate((data) => {
      window.__editor.setHTML(`<img src="${data}">`);
      return window.__editor.content.querySelector("img").hasAttribute("src");
    }, DATA);

    await createEditor(page, { images: { enabled: false, allowURL: false, allowBase64: false } });
    report.disabled = await page.evaluate(async () => ({
      accepted: await window.__editor.insertImage("/tiny.png"), html: window.__editor.getHTML()
    }));
    await createEditor(page);
    report.uploadBase64Disabled = await page.evaluate(async (data) => {
      window.__editor.destroy();
      window.__editor = lightmetal.init({
        element: document.getElementById("review-host"),
        images: { allowBase64: false, onInsert: async () => data }
      });
      return { accepted: await window.__editor.insertImage(new File(["x"], "test.png", { type: "image/png" })) };
    }, DATA);
    await page.evaluate(() => window.__editor.destroy());
    await page.close();

    const filePage = await browser.newPage();
    await filePage.goto("file://" + path.join(ROOT, "examples/html.html"));
    await createEditor(filePage);
    report.fileProtocol = await filePage.evaluate(async (data) => {
      window.__editor.setHTML('<a href="relative">relative</a><a href="mailto:me@example.com">mail</a><img src="relative">');
      const html = window.__editor.getHTML();
      return {
        html, relativeImage: await window.__editor.insertImage("relative.png"),
        dataImage: await window.__editor.insertImage(data)
      };
    }, DATA);
    await filePage.close();
    report.markdown = await markdownSecurityChecks(browser, base, payloads);
    return report;
  } finally { await browser.close(); }
}

async function main() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname === "/") {
      res.setHeader("Content-Type", "text/html");
      res.end('<!doctype html><link rel="stylesheet" href="/dist/lightmetal.css"><script src="/dist/lightmetal.js"></script>');
    } else if (url.pathname === "/drag") {
      const payload = `<b onclick="${sentinel}">drop me</b><a href="javascript:${sentinel}">link</a>${badImage}`;
      res.setHeader("Content-Type", "text/html");
      res.end(`<!doctype html><div id="drag-source" draggable="true">Drag from untrusted frame</div>
        <script>document.getElementById("drag-source").addEventListener("dragstart", (event) => {
          event.target.dataset.started = "true";
          event.dataTransfer.setData("text/html", ${JSON.stringify(payload)});
          event.dataTransfer.setData("text/plain", "drop me");
        });</script>`);
    } else if (url.pathname === "/tiny.png") {
      res.setHeader("Content-Type", "image/png");
      res.end(PNG);
    } else if (/^\/dist\/(?:lightmetal|maiden|MeltDown|polish)(?:\.esm|\.min)?\.(?:js|css)$/.test(url.pathname)) {
      res.setHeader("Content-Type", url.pathname.endsWith(".css") ? "text/css" : "text/javascript");
      res.end(fs.readFileSync(path.join(ROOT, url.pathname)));
    } else { res.writeHead(404).end(); }
  });
  try {
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const reports = [];
    for (const [engine, name] of [[chromium, "chromium"], [firefox, "firefox"]]) {
      reports.push(await runReview(engine, name, base));
    }
    if (process.argv.includes("--json")) console.log(JSON.stringify(reports, null, 2));
    else for (const report of reports) {
      console.log(`security ${report.browser}: ${report.imports.length} import/paste cases, ` +
        `${report.urls.length} URL cases, ${report.files.length} file cases, modes and native drops checked; ` +
        `${report.markdown.previewCases} preview/split cases, ${report.markdown.renderingCases} parser/highlighter cases, ` +
        `${report.markdown.destinationCases} Markdown URL cases, ${report.markdown.sourceCases} source cases`);
    }
    for (const report of reports) {
      assert.equal(report.link.executions, 0, "Normal link prompt must reject JavaScript URLs");
      assert.ok(!report.link.html.includes("javascript:"));
      assert.equal(report.disabled.accepted, false, "Disabled images must reject API insertion");
      assert.equal(report.uploadBase64Disabled.accepted, false);
      assert.equal(report.importBase64Disabled, false);
      assert.equal(report.imagePrompt.executions, 0);
      assert.ok(!report.imagePrompt.html.includes("javascript:"));
      for (const entry of report.async) {
        assert.equal(entry.accepted, false, `Async insertion must reject ${entry.state}`);
        assert.equal(entry.html, "<p>keep</p>");
        assert.equal(entry.executions, 0);
        assert.ok(!entry.errorHTML || !entry.errorHTML.includes("<img"), "Errors must remain text");
        if (entry.state === "destroy") assert.equal(entry.children, 0);
      }
      assert.equal(report.fileProtocol.relativeImage, false);
      assert.equal(report.fileProtocol.dataImage, true);
      assert.ok(!report.fileProtocol.html.includes('href="relative"'));
      assert.ok(!report.fileProtocol.html.includes('src="relative"'));
      for (const entry of report.files) {
        const expected = !["wrong MIME", "zero bytes", "above limit"].includes(entry.label);
        assert.equal(entry.accepted, expected, `${entry.format}/${entry.label}`);
        if ("executions" in entry) assert.equal(entry.executions, 0);
      }
      for (const entry of report.imports) assert.equal(entry.editorIntact, true, `${entry.route}/${entry.label}`);
      for (const entry of report.imports.filter((e) => e.label === "positive formatting")) {
        for (const markup of ['<h2>heading</h2>', '<b>bold</b>', '<i>italic</i>', 'href="/safe"']) assert.ok(entry.html.includes(markup));
      }
      for (const entry of report.imports.filter((e) => e.label === "positive table")) {
        for (const markup of ['<caption>Tasks</caption>', '<col span="2">', 'id="header"', 'scope="col"', 'headers="header"']) assert.ok(entry.html.includes(markup));
      }
      for (const entry of report.imports.filter((e) => e.label === "data image import")) {
        assert.ok(entry.html.includes(DATA), "Base64 images must survive import/paste");
      }
      for (const entry of report.imports.filter((e) => e.label === "leading closing tags")) {
        assert.ok(entry.html.includes("tail"), "Closing wrapper must not discard trailing content");
      }
      for (const entry of report.files.filter((e) => e.label.startsWith("no MIME, PNG") || e.label === "no MIME with upload hook")) {
        assert.equal(entry.accepted, true, `MIME fallback failed in ${entry.format}`);
      }
      for (const entry of report.urls) {
        const expected = entry.url.startsWith("data:") ?
          ["png", "jpeg", "gif", "webp"].some((type) => entry.url === DATA.replace("image/png", `image/${type}`)) :
          ["http:", "https:"].includes(new URL(entry.url, base).protocol);
        assert.equal(entry.image.accepted, expected, `Unexpected image policy: ${entry.url}`);
        assert.equal(entry.upload.accepted, expected, `Unexpected upload policy: ${entry.url}`);
        assert.equal(entry.image.executions, 0);
        assert.equal(entry.image.handlers, 0);
      }
      for (const entry of report.bypass) {
        assert.equal(entry.executions, 1);
        assert.equal(entry.rejectedImage, true, "Raw/Source do not disable image URL checks");
      }
      for (const entry of report.unrestricted) {
        assert.ok(entry.preserved.includes("<script>") && entry.preserved.includes("<iframe>"));
        assert.equal(entry.scriptImage, true);
        assert.equal(entry.svgFile, true);
        assert.equal(entry.missingMIME, true);
        assert.equal(entry.uploadJavascript, true);
        assert.equal(entry.pastePrevented, false);
        assert.equal(entry.sourceRejected, true);
        assert.equal(entry.destroyRejected, true);
        assert.equal(entry.executions, 1);
        assert.equal(entry.linkExecutions, 1);
      }
      assert.equal(report.unrestrictedDisabled, false);
      assert.equal(report.unrestrictedBase64Disabled, false);
    }
    const unsafeImport = reports.some((report) => report.imports.some((entry) =>
      entry.error || entry.violations.length || entry.executions));
    const unsafeDrop = reports.some((report) => [...report.drops, ...report.frameDrops].some((entry) =>
      entry.violations.length || entry.executionsAfterInsertion));
    const unsafeLink = reports.some((report) => report.link.executions);
    if (unsafeImport || unsafeDrop || unsafeLink) process.exitCode = 1;
  } finally { await new Promise((resolve) => server.close(resolve)); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
