/* CSS-only skin checks shared by the demo and installed-package smoke tests. */
const assert = require("node:assert/strict");

const skinNames = ["bootstrap", "material-classic", "material-outline", "frost", "patina", "sterling", "substantial"];
const expectedWidths = ["36px", "36px", "36px", "34px", "34px", "32px", "32px"];

function contrast(foreground, background, backdrop) {
  const parse = color => color.match(/[\d.]+/g).map(Number);
  const blend = (color, under) => color.slice(0, 3).map((value, index) =>
    value * (color[3] ?? 1) + under[index] * (1 - (color[3] ?? 1)));
  const bg = blend(parse(background), parse(backdrop));
  const fg = blend(parse(foreground), bg);
  const luminance = (color) => {
    const channels = color.map((value) => {
      const channel = value / 255;
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  };
  const a = luminance(fg), b = luminance(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

async function runSkinChecks(browser, url, distPrefix) {
  let plainPalettes;
  for (const minified of [false, true]) {
    const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
    const errors = [], externalRequests = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/*", (route) => {
      if (new URL(route.request().url()).origin === new URL(url).origin) return route.continue();
      externalRequests.push(route.request().url());
      return route.abort();
    });
    try {
      await page.goto(url);
      await page.waitForFunction(() => window.lightmetal?.init);
      await page.evaluate((names) => {
        window.__skinEditors = {};
        for (const name of ["default", ...names]) {
          const host = document.createElement("div");
          host.dataset.skinCheck = name;
          host.style.maxWidth = "620px";
          host.className = "lightmetal" + (name === "default" ? "" : " lightmetal-" + name);
          document.body.appendChild(host);
          window.__skinEditors[name] = window.lightmetal.init({ element: host });
        }
      }, skinNames);
      const snapshot = async () => {
        // Theme changes transition button colors. Wait for completion, not a timer.
        await page.evaluate(() => Promise.all(document.getAnimations().map((animation) => animation.finished.catch(() => {}))));
        return page.evaluate(() => {
          const entries = Object.entries(window.__skinEditors).map(([name, editor]) => {
            const style = getComputedStyle(editor.element);
            const toolbar = getComputedStyle(editor.element.querySelector(".lightmetal-actionbar"));
            const button = getComputedStyle(editor.element.querySelector(".lightmetal-button"));
            const source = getComputedStyle(editor.source);
            const content = getComputedStyle(editor.content);
            // Resolve custom-property colors through an element, including error/active surfaces.
            const probe = document.createElement("span");
            editor.element.appendChild(probe);
            probe.style.color = "var(--lightmetal-error-fg)";
            probe.style.backgroundColor = "var(--lightmetal-error-bg)";
            const error = [getComputedStyle(probe).color, getComputedStyle(probe).backgroundColor];
            probe.style.color = "var(--lightmetal-accent)";
            probe.style.backgroundColor = "var(--lightmetal-accent-soft)";
            const active = [getComputedStyle(probe).color, getComputedStyle(probe).backgroundColor];
            probe.remove();
            return [name, {
              bg: content.backgroundColor, fg: content.color, dim: button.color,
              toolbar: toolbar.backgroundColor, width: button.width, radius: style.borderTopLeftRadius,
              source: [source.backgroundColor, source.color], error, active
            }];
          });
          return Object.fromEntries(entries);
        });
      };
      const baselines = {};
      for (const colorScheme of ["light", "dark"]) {
        await page.emulateMedia({ colorScheme });
        baselines[colorScheme] = (await snapshot()).default;
      }
      for (const name of skinNames) {
        await page.addStyleTag({ url: `${distPrefix}skins/${name}${minified ? ".min" : ""}.css` });
      }
      const palettes = {};
      for (const colorScheme of ["light", "dark"]) {
        await page.emulateMedia({ colorScheme });
        palettes[colorScheme] = await snapshot();
        assert.deepEqual(palettes[colorScheme].default, baselines[colorScheme], "Skins changed an unskinned editor");
        for (const [index, name] of skinNames.entries()) {
          const style = palettes[colorScheme][name];
          assert.equal(style.width, expectedWidths[index], `${name}: skin CSS did not load`);
          assert.deepEqual(style.source, [style.bg, style.fg], `${name}: Source colors differ`);
          for (const [fg, bg] of [[style.fg, style.bg], [style.dim, style.toolbar], style.error, style.active]) {
            assert.ok(contrast(fg, bg, style.toolbar) >= 4.5, `${name}/${colorScheme}: insufficient text contrast: ${fg} on ${bg}`);
          }
        }
      }
      if (minified) assert.deepEqual(palettes, plainPalettes, "Minified skins differ from plain CSS");
      else plainPalettes = palettes;
      for (const colorScheme of ["light", "dark"]) {
        await page.emulateMedia({ colorScheme });
        for (const mode of ["auto", "light", "dark"]) {
          await page.evaluate((mode) => {
            for (const editor of Object.values(window.__skinEditors)) {
              editor.element.classList.toggle("lightmetal-light", mode === "light");
              editor.element.classList.toggle("lightmetal-dark", mode === "dark");
            }
          }, mode);
          assert.deepEqual(await snapshot(), palettes[mode === "auto" ? colorScheme : mode],
            `${colorScheme}/${mode}: pinned or system palette failed`);
        }
      }
      for (const name of ['default', ...skinNames]) {
        const host = page.locator(`[data-skin-check="${name}"]`);
        for (const mode of ["light", "dark"]) {
          await page.evaluate(({ name, mode }) => {
            const editor = window.__skinEditors[name];
            editor.element.classList.toggle("lightmetal-light", mode === "light");
            editor.element.classList.toggle("lightmetal-dark", mode === "dark");
            editor.setHTML("<p>Skin editing</p>");
          }, { name, mode });
          // Move focus before measuring/clicking: another editor's contextual
          // toolbar can disappear and shift every editor below it.
          await host.locator(".lightmetal-content").focus();
          await page.waitForFunction((name) => Object.entries(window.__skinEditors).every(([key, editor]) =>
            key === name || editor.element.querySelector(".lightmetal-tablebar").hidden), name);
          const contentHeight = await host.locator(".lightmetal-content").evaluate((node) => node.getBoundingClientRect().height);
          await page.keyboard.press("Shift+Tab"); await page.keyboard.press("Tab");
          assert.equal(await host.locator('.lightmetal-content').evaluate(node => {
            const style = getComputedStyle(node);
            return node === document.activeElement && style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) >= 2;
          }), true, `${name}/${mode}: visual editing focus is not visible`);
          await host.locator('button[title="Source"]').click();
          assert.equal(await host.locator("textarea").isVisible(), true, `${name}/${mode}/${minified}: Source did not open`);
          assert.equal(await host.locator(".lightmetal-tablebar").isHidden(), true);
          assert.equal(await host.locator("textarea").evaluate((node) => node.getBoundingClientRect().height), contentHeight);
          await page.keyboard.press("Shift+Tab"); await page.keyboard.press("Tab");
          assert.equal(await host.locator('textarea').evaluate(node => {
            const style = getComputedStyle(node);
            return node === document.activeElement && style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) >= 2;
          }), true, `${name}/${mode}: Source editing focus is not visible`);
          await host.locator("textarea").fill("<p>Source round trip</p>");
          await host.locator('button[title="Source"]').click();
          assert.equal(await host.locator("textarea").isHidden(), true);
          assert.equal(await host.locator(".lightmetal-content").innerText(), "Source round trip");
          await host.locator(".lightmetal-content").evaluate((node) => {
            const range = document.createRange();
            range.selectNodeContents(node);
            const selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(range);
          });
          await host.locator('button[title="Bold"]').click();
          await page.waitForFunction((name) => window.__skinEditors[name].element
            .querySelector('button[title="Bold"]').classList.contains("lightmetal-button-selected"), name);
          const trigger = host.getByRole("button", { name: "Table", exact: true });
          await trigger.click();
          const popup = host.getByRole("menu", { name: "Table", exact: true });
          assert.equal(await popup.isVisible(), true);
          await page.keyboard.press("Escape");
          assert.equal(await popup.isHidden(), true);
          assert.equal(await trigger.evaluate((node) => node === document.activeElement), true);
          // Test actual Tab navigation; Firefox need not mark programmatic
          // Escape-restored focus as :focus-visible.
          await page.keyboard.press("Shift+Tab");
          await page.keyboard.press("Tab");
          assert.equal(await trigger.evaluate((node) => node === document.activeElement), true);
          assert.notEqual(await trigger.evaluate((node) => getComputedStyle(node).outlineStyle), "none",
            `${name}/${mode}: keyboard focus is not visible`);
          assert.equal(await page.evaluate((name) => window.__skinEditors[name].insertTable(2, 2), name), true);
          await host.locator("td").first().click();
          assert.equal(await host.locator(".lightmetal-tablebar").isVisible(), true);
          await host.getByRole("button", { name: "Insert row below", exact: true }).click();
          assert.equal(await host.locator("tr").count(), 3);
          assert.equal(await page.evaluate((name) => window.__skinEditors[name].insertImage("javascript:alert(1)"), name), false);
          assert.equal(await host.locator(".lightmetal-error").isVisible(), true);
          // Do not let the error's later dismissal shift another test's target.
          await host.locator(".lightmetal-error").evaluate((node) => node.remove());
        }
      }
      await page.setViewportSize({ width: 390, height: 700 });
      for (const name of ['default', ...skinNames]) {
        const host = page.locator(`[data-skin-check="${name}"]`);
        assert.equal(await host.locator(".lightmetal-actionbar").evaluate((node) => {
          const style = getComputedStyle(node);
          return style.overflowX === "auto" && style.flexWrap === "nowrap" && node.getBoundingClientRect().right <= innerWidth;
        }), true, `${name}: toolbar must scroll horizontally without overflowing the page`);
        await host.evaluate(node => {
          const before = document.createElement('button'); before.id = 'skin-entry-before'; before.textContent = 'Before editor'; node.before(before);
        });
        await page.locator('#skin-entry-before').focus(); await page.keyboard.press('Tab');
        assert.equal(await host.locator('.lightmetal-content').evaluate(node => node === document.activeElement), true, `${name}: narrow Tab entry must skip the scrolling toolbar`);
        await page.locator('#skin-entry-before').evaluate(node => node.remove());
        await page.waitForFunction((name) => Object.entries(window.__skinEditors).every(([key, editor]) =>
          key === name || editor.element.querySelector(".lightmetal-tablebar").hidden), name);
        await host.getByRole("button", { name: "Table", exact: true }).click();
        const popup = host.getByRole("menu", { name: "Table", exact: true });
        const bounds = await popup.boundingBox();
        assert.ok(bounds.width > 0 && bounds.x >= 0 && bounds.x + bounds.width <= 390, `${name}: popup is clipped`);
        await page.keyboard.press("Escape");
      }
      assert.deepEqual(errors, []);
      assert.deepEqual(externalRequests, [], "Skins must not request external assets");
    } finally {
      await page.close();
    }
  }
}

async function runGalleryChecks(browser, base) {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("response", (response) => {
    if (response.status() >= 400 && ["document", "stylesheet", "script"].includes(response.request().resourceType())) {
      errors.push(`${response.status()} ${response.url()}`);
    }
  });
  try {
    const response = await page.goto(base);
    assert.equal(response.status(), 200);
    await page.getByRole("link", { name: "Explore HTML editor skins", exact: true }).click();
    assert.equal(new URL(page.url()).pathname, "/skins.html");
    for (const route of ["skins.html", "examples/skins.html"]) {
      if (route !== "skins.html") assert.equal((await page.goto(new URL(route, base).href)).status(), 200);
      await page.waitForFunction(() => Object.keys(window.__skinEditors || {}).length === 8);
      const logo = page.getByRole("img", { name: "ligHTMetaL logo", exact: true });
      assert.equal(await logo.isVisible(), true);
      assert.equal(await logo.evaluate(async (image) => {
        await image.decode();
        const logoBounds = image.getBoundingClientRect();
        const header = image.closest("header");
        const headerBounds = header.getBoundingClientRect();
        return image.naturalWidth > 0 && logoBounds.width <= 320 &&
          getComputedStyle(header).textAlign === "center" &&
          Math.abs(headerBounds.x + headerBounds.width / 2 - innerWidth / 2) < 1 &&
          Math.abs(logoBounds.x + logoBounds.width / 2 - innerWidth / 2) < 1;
      }), true, "Gallery intro and loaded logo must be centered and fit the page");
      assert.equal(await page.evaluate(() => Object.values(window.__skinEditors).every((editor) =>
        !editor.getHTML().includes("ligHTMetaL.png"))), true, "Logo must stay outside saved editor content");
      for (const [mode, background] of [["light", "rgb(255, 255, 255)"], ["dark", "rgb(20, 36, 45)"]]) {
        await page.selectOption("#palette", mode);
        assert.equal(await page.locator("#skin-frost .lightmetal-content").evaluate((node) =>
          getComputedStyle(node).backgroundColor), background);
      }
      const source = page.locator('#skin-frost button[title="Source"]');
      await source.click();
      assert.equal(await page.locator("#skin-frost textarea").isVisible(), true);
      await source.click();
      assert.equal(await page.locator("#skin-frost textarea").isHidden(), true);
      await page.getByRole("link", { name: "Main demo", exact: true }).click();
      assert.equal(new URL(page.url()).pathname, route === "skins.html" ? "/index.html" : "/examples/index.html");
      await page.waitForFunction(() => window.lightmetal?.init && document.querySelector("#html-editor .lightmetal-content"));
    }
    assert.deepEqual(errors, []);
  } finally {
    await page.close();
  }
}

module.exports = { skinNames, runSkinChecks, runGalleryChecks };
