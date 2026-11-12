const assert = require('node:assert/strict');
const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
async function previewImageChecks(browser, base, name) {
  const page = await browser.newPage();
  const requests = [], errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/preview-image-*.png', route => {
    requests.push({ url: route.request().url(), referer: route.request().headers().referer });
    return route.fulfill({ contentType: 'image/png', body: pixel });
  });
  try {
    await page.goto(base + '/tests/fixtures/markdown.html');
    await page.addScriptTag({ url: base + '/dist/MeltDown.js' });
    await page.evaluate(() => {
      __markdownEditor.destroy(); window.__imageSentinel = 0;
      window.__markdownEditor = maiden.init({ element: document.getElementById('editor'),
        preview: { render: source => meltDown.parse(source, { html: 'allow' }) } });
      __markdownEditor.setMarkdown('![Markdown image](/preview-image-markdown.png "A title")\n\n<img src="/preview-image-raw.png" alt="Raw image" title="Raw title" srcset="/preview-image-srcset.png 2x" onload="__imageSentinel++" onerror="__imageSentinel++" style="background:url(/preview-image-style.png)">');
      window.__imageSource = __markdownEditor.getMarkdown();
      window.__imageNodes = Array.from(__markdownEditor.content.childNodes);
    });
    assert.deepEqual(requests, [], 'source alone does not load images');
    for (const mode of ['Preview', 'Side-by-side']) {
      await page.getByRole('button', { name: mode, exact: true }).click();
      const preview = page.locator('.lightmarkdown-preview');
      await preview.locator('img[alt="Markdown image"]').waitFor();
      await page.waitForFunction(() => Array.from(document.querySelectorAll('.lightmarkdown-preview img:not([hidden])')).length === 2 && Array.from(document.querySelectorAll('.lightmarkdown-preview img:not([hidden])')).every(img => img.complete && img.naturalWidth > 0));
      assert.equal(await preview.locator('img[alt="Markdown image"]').getAttribute('title'), 'A title');
      assert.equal(await preview.locator('[srcset],[style],[onload],[onerror]').count(), 0);
      assert.equal(await page.evaluate(() => __imageSentinel), 0);
      await page.getByRole('button', { name: mode, exact: true }).click();
      assert.equal(await page.evaluate(() => __markdownEditor.getMarkdown() === __imageSource && __imageNodes.every((node, i) => node === __markdownEditor.content.childNodes[i])), true);
    }
    assert.ok(requests.length >= 2);
    assert.ok(requests.every(request => /preview-image-(markdown|raw)\.png$/.test(request.url) && !request.referer), 'only approved src URLs load, without referrers');
    const policy = await page.evaluate(async () => {
      const bad = ['javascript:alert(1)', 'jav&#x61;script:alert(1)', 'java\nscript:alert(1)', 'java&#x09;script:alert(1)', 'mailto:me@example.com', 'tel:+123', 'vbscript:msgbox(1)', 'file:///tmp/image.png', 'blob:https://example.com/id', 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=', 'data:text/html;base64,PGltZz4=', 'data:image/png;base64,!!!', ''];
      for (const url of bad) {
        window.__markdownEditor.setMarkdown('<img alt="blocked" src="' + url + '">');
        document.querySelector('button[title="Preview"]').click();
        await Promise.resolve(); await Promise.resolve();
        if (document.querySelector('.lightmarkdown-preview img:not([hidden])')) return { bad: url };
        document.querySelector('button[title="Preview"]').click();
      }
      return { bad: null };
    });
    assert.deepEqual(policy, { bad: null });
    for (const src of [base + '/preview-image-absolute.png', '//example.invalid/preview-image-protocol.png',
      'https://example.invalid/preview-image-https.png', 'data:image/png;base64,' + pixel.toString('base64')]) {
      await page.evaluate(src => __markdownEditor.setMarkdown('<img alt="approved" src="' + src + '">'), src);
      await page.getByRole('button', { name: 'Preview', exact: true }).click();
      await page.waitForFunction(() => { const img = document.querySelector('.lightmarkdown-preview img[alt="approved"]:not([hidden])'); return img?.complete && img.naturalWidth > 0; });
      await page.getByRole('button', { name: 'Preview', exact: true }).click();
    }
    const attributes = await page.evaluate(async () => {
      const { previewHTML } = await import('/src/markdown-preview.js');
      const src = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
      const valid = previewHTML(document, `<img src="${src}" width="0024" height="16" loading=" LAZY " decoding="ASYNC" referrerpolicy="unsafe-url" onerror="bad()">`).querySelector('img');
      const invalid = [];
      for (const value of ['-1', '0', '1.5', '24px', '1e3', 'Infinity', '4294967296', '99999999999999999999']) {
        const img = previewHTML(document, `<img src="${src}" width="${value}" height="${value}" loading="other" decoding="other">`).querySelector('img');
        invalid.push(img.getAttributeNames().filter(name => ['width', 'height', 'loading', 'decoding'].includes(name)));
      }
      const enums = ['eager', 'lazy'].map(loading => ['auto', 'sync', 'async'].map(decoding => {
        const img = previewHTML(document, `<img src="${src}" loading="${loading}" decoding="${decoding}">`).querySelector('img');
        return [img.loading, img.decoding];
      }));
      return { valid: Object.fromEntries(Array.from(valid.attributes, attr => [attr.name, attr.value])), invalid, enums };
    });
    assert.equal(attributes.valid.width, '24'); assert.equal(attributes.valid.height, '16');
    assert.equal(attributes.valid.loading, 'lazy'); assert.equal(attributes.valid.decoding, 'async');
    assert.equal(attributes.valid.referrerpolicy, 'no-referrer'); assert.equal(attributes.valid.onerror, undefined);
    assert.ok(attributes.invalid.every(attrs => attrs.length === 0));
    assert.deepEqual(attributes.enums, [['auto', 'sync', 'async'].map(value => ['eager', value]), ['auto', 'sync', 'async'].map(value => ['lazy', value])]);
    // The application swaps stable note URLs only in rendered output.
    await page.evaluate(bytes => {
      __markdownEditor.destroy();
      window.__noteBlob = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: 'image/png' }));
      window.__markdownEditor = maiden.init({ element: document.getElementById('editor'),
        preview: { render: source => meltDown.parse(source).replace('src="/f/private.png"', 'src="' + __noteBlob + '"') } });
      __markdownEditor.setMarkdown('![Private](/f/private.png)');
      window.__privateNodes = Array.from(__markdownEditor.content.childNodes);
    }, Array.from(pixel));
    for (const mode of ['Preview', 'Side-by-side']) {
      await page.getByRole('button', { name: mode, exact: true }).click();
      await page.waitForFunction(() => { const img = document.querySelector('.lightmarkdown-preview img:not([hidden])'); return img?.src === __noteBlob && img.complete && img.naturalWidth === 1; });
      assert.equal(await page.evaluate(() => __markdownEditor.getMarkdown()), '![Private](/f/private.png)');
      await page.getByRole('button', { name: mode, exact: true }).click();
      assert.equal(await page.evaluate(() => __privateNodes.every((node, i) => node === __markdownEditor.content.childNodes[i])), true);
    }
    assert.equal(await page.evaluate(async () => {
      const { previewHTML } = await import('/src/markdown-preview.js');
      const base = document.createElement('base'); base.href = 'https://elsewhere.invalid/'; document.head.prepend(base);
      try {
        if (!previewHTML(document, '<img src="' + __noteBlob + '">').querySelector('img')) return false;
        for (const url of ['blob:null/id', 'blob:https://example.invalid/id', `blob:${location.protocol}//${location.host}@example.invalid/id`]) {
          if (previewHTML(document, '<img src="' + url + '">').querySelector('img')) return false;
        }
        const detached = document.implementation.createHTMLDocument();
        return !previewHTML(detached, '<img src="' + __noteBlob + '">').querySelector('img');
      } finally { base.remove(); }
    }), true, 'blob origin uses the document location, not a prefix or base element; opaque origins are rejected');
    await page.evaluate(() => { __markdownEditor.setMarkdown('Typing '); __markdownEditor.content.focus(); });
    await page.keyboard.press('Control+End'); await page.keyboard.type('still works');
    await page.keyboard.press('Control+z');
    assert.equal(await page.evaluate(() => __markdownEditor.getMarkdown()), 'Typing ');
    await page.evaluate(() => { __markdownEditor.destroy(); URL.revokeObjectURL(__noteBlob); });
    assert.equal(await page.locator('.lightmarkdown-preview img').count(), 0, 'application lock cleanup removes displayed private images');
    assert.deepEqual(errors, []);
    console.log(name + ': Markdown/raw images, split, URL/attribute/no-referrer safeguards, stable note URLs with same-origin blobs, lock cleanup and native history: ok');
  } finally { await page.close(); }
}
module.exports = { previewImageChecks };
