const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Independent scenarios get independent contexts. Keep each native-history sequence together.
async function withPage(browser, label, check, options = {}) {
  const page = await browser.newPage(options);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await check(page);
    assert.deepEqual(errors, [], 'no uncaught browser errors');
  } catch (error) {
    const context = `${browser.browserType().name()}: ${label}\nURL: ${page.url()}`;
    let directory, timer;
    try {
      directory = fs.mkdtempSync(path.join(os.tmpdir(), 'lightmetal-browser-failure-'));
      // Inspect only the parent document; a failed sandbox query must not block diagnostics.
      await Promise.race([
        (async () => {
          const state = await page.evaluate(() => ({
            selectedTab: document.querySelector('[role="tab"][aria-selected="true"]')?.id,
            focus: { tag: document.activeElement?.tagName, id: document.activeElement?.id },
            markdown: [...document.querySelectorAll('.lightmarkdown')].map(node => ({
              id: node.id, split: node.classList.contains('lightmarkdown-split'),
              sourceVisible: !!node.querySelector('.lightmarkdown-input')?.getClientRects().length,
              previewVisible: !!node.querySelector('.lightmarkdown-preview')?.getClientRects().length
            })),
            frames: [...document.querySelectorAll('iframe')].map(node => ({
              id: node.id, hidden: node.hidden, src: node.getAttribute('src'), srcdoc: node.hasAttribute('srcdoc')
            }))
          }));
          fs.writeFileSync(path.join(directory, 'state.json'), JSON.stringify({ context, state, errors }, null, 2));
          await page.screenshot({ path: path.join(directory, 'page.png'), timeout: 2500 });
        })(),
        new Promise(resolve => { timer = setTimeout(resolve, 3000); })
      ]);
    } catch (_) { /* Keep the original failure if the page is no longer available. */ }
    finally { clearTimeout(timer); }
    throw new Error(`${context}\n${error.message}\nFailure artifacts: ${directory || 'unavailable'}`, { cause: error });
  } finally { await page.close(); }
}

// Setup, not a transition assertion. Dedicated view tests still click and check each transition.
async function setMarkdownView(scope, mode) {
  assert.ok(['source', 'preview', 'split'].includes(mode));
  const split = scope.getByRole('button', { name: 'Side-by-side', exact: true });
  const preview = scope.getByRole('button', { name: 'Preview', exact: true });
  if (mode === 'source') {
    if (await split.getAttribute('aria-pressed') === 'true') await split.click();
    else if (await preview.getAttribute('aria-pressed') === 'true') await preview.click();
  } else {
    const button = mode === 'split' ? split : preview;
    if (await button.getAttribute('aria-pressed') !== 'true') await button.click();
  }
  await scope.getByRole('textbox', { name: 'Markdown source', exact: true }).waitFor({ state: mode === 'preview' ? 'hidden' : 'visible' });
  await scope.getByRole('region', { name: 'Markdown preview', exact: true }).waitFor({ state: mode === 'source' ? 'hidden' : 'visible' });
  assert.equal(await split.getAttribute('aria-pressed'), String(mode === 'split'));
  assert.equal(await preview.getAttribute('aria-pressed'), String(mode === 'preview'));
}

module.exports = { withPage, setMarkdownView };
