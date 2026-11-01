/* Browser security boundaries for MaiDEn, MeltDown, and poliSH.
 * Called by security-review.js with its shared hostile-HTML corpus.
 */
const assert = require('node:assert/strict');

async function markdownSecurityChecks(browser, base, payloads) {
  const page = await browser.newPage();
  const requests = [], errors = [];
  let monitor = false;
  page.on('request', request => { if (monitor) requests.push(request.url()); });
  page.on('pageerror', error => errors.push(error.message));
  // Payloads must not reach external services, even if a regression loads them.
  await page.route('**/*', route => !monitor && route.request().url().startsWith(base + '/')
    ? route.continue() : route.abort());
  try {
    await page.goto(base);
    for (const library of ['maiden', 'MeltDown', 'polish']) {
      await page.addScriptTag({ url: `${base}/dist/${library}.js` });
    }
    await page.evaluate(() => {
      window.__sentinel = 0;
      window.__highlighter = polish.createHighlighter({ languages: polish.allLanguages });
      const host = document.createElement('div'); document.body.append(host);
      window.__reviewChanges = 0;
      window.__markdownReview = maiden.init({ element: host,
        actions: ['preview', 'side-by-side'],
        preview: { render: source => window.__reviewRender(source) },
        onChange: () => window.__reviewChanges++ });
      window.__reviewRender = () => '<p>ready</p>';
      window.__markdownReview.setMarkdown('source stays intact');
      window.__sourceNode = window.__markdownReview.content.firstChild;
      window.__reviewInspect = (root, syntaxOnly = false) => {
        const violations = [];
        const allowed = new Set((syntaxOnly ? 'span' :
          'p br hr h1 h2 h3 h4 h5 h6 strong b em i s del blockquote ul ol li pre code a table thead tbody tfoot tr th td span div dl dt dd sup sub').split(' '));
        for (const el of root.querySelectorAll('*')) {
          if (!allowed.has(el.localName) || el.namespaceURI !== 'http://www.w3.org/1999/xhtml') violations.push(el.outerHTML);
          for (const attr of el.attributes) {
            if (!(syntaxOnly ? ['class', 'style'] : ['href', 'target', 'rel', 'class', 'hidden']).includes(attr.name)) violations.push(attr.name);
            if (attr.name === 'href' && !['http:', 'https:', 'mailto:'].includes(new URL(attr.value, document.baseURI).protocol)) violations.push(attr.value);
            if (attr.name === 'style') {
              for (const property of el.style) {
                if (!['color', 'background-color', 'font-weight', 'font-style', 'opacity', 'text-decoration'].includes(property) || /url\(/i.test(el.style.getPropertyValue(property))) violations.push(attr.value);
              }
            }
          }
          if (el.localName === 'a' && el.hasAttribute('href') && (el.target !== '_blank' || el.rel !== 'noopener noreferrer')) violations.push('link isolation');
          for (const event of ['click', 'mouseover', 'focus', 'load', 'error']) el.dispatchEvent(new Event(event));
        }
        return violations;
      };
    });
    monitor = true;
    await page.getByRole('button', { name: 'Preview', exact: true }).click();
    const ready = () => page.waitForFunction(() => !document.querySelector('.lightmarkdown-preview').hasAttribute('aria-busy'));
    await ready();
    const corpus = [...payloads,
      ['resources and document metadata', '<base href="https://example.invalid/"><meta http-equiv="refresh" content="0;url=https://example.invalid/"><link rel="stylesheet" href="/missing"><video poster="/missing"><source src="/missing"></video>'],
      ['image alt and task inputs', '<img src="/missing" alt="&lt;img src=x onerror=window.__sentinel++&gt;"><input type="checkbox" checked><input type="checkbox">'],
      ['template and custom element', '<template shadowrootmode="open"><img src="/missing" onerror="window.__sentinel++"></template><custom-element><p is="evil" autofocus tabindex="0">keep</p></custom-element>']
    ];
    let previewCases = 0;
    for (const view of ['Preview', 'Side-by-side']) {
      if (view === 'Side-by-side') await page.getByRole('button', { name: view, exact: true }).click();
      for (const [label, html] of corpus) {
        // A renderer can return arbitrary HTML, including trusted hook output.
        // Neither path may bypass MaiDEn's separate inert preview filter.
        for (const route of ['renderer', 'highlight-hook']) {
          const result = await page.evaluate(async ({ html, route }) => {
            window.__reviewRender = route === 'renderer' ? () => html :
              () => meltDown.parse('```html\nignored\n```', { highlight: () => html });
            const editor = window.__markdownReview;
            const changes = window.__reviewChanges;
            return { changes, source: editor.getMarkdown() };
          }, { html, route });
          // Reopen the same view without replacing source or adding history.
          await page.getByRole('button', { name: view, exact: true }).click();
          await page.getByRole('button', { name: view, exact: true }).click();
          await ready();
          const checked = await page.evaluate(() => {
            const root = document.querySelector('.lightmarkdown-preview');
            const violations = window.__reviewInspect(root);
            const copy = document.createElement('div'); copy.innerHTML = root.innerHTML; document.body.append(copy);
            violations.push(...window.__reviewInspect(copy)); copy.remove();
            return { violations, executions: window.__sentinel,
              changes: window.__reviewChanges, source: window.__markdownReview.getMarkdown(),
              sameNode: window.__markdownReview.content.firstChild === window.__sourceNode };
          });
          assert.deepEqual(checked, { violations: [], executions: 0, changes: result.changes,
            source: result.source, sameNode: true }, `${view}/${route}/${label}`);
          previewCases++;
        }
      }
    }

    const rendered = await page.evaluate(corpus => {
      const failures = [];
      let cases = 0;
      const attach = (html, syntaxOnly) => {
        const root = document.createElement('div'); root.innerHTML = html; document.body.append(root);
        const violations = window.__reviewInspect(root, syntaxOnly);
        const copy = document.createElement('div'); copy.innerHTML = root.innerHTML; document.body.append(copy);
        violations.push(...window.__reviewInspect(copy, syntaxOnly)); copy.remove(); root.remove();
        return violations;
      };
      for (const [label, html] of corpus) {
        // Default parsing must escape raw HTML even outside the editor.
        const parsed = meltDown.parse(html);
        const root = document.createElement('div'); root.innerHTML = parsed;
        if (root.querySelector('script,img,svg,math,iframe,object,embed,style,link,meta,base,input,form')) failures.push(label + '/parser raw HTML');
        const violations = attach(parsed, false);
        if (violations.length) failures.push([label, 'parser', violations]);
        cases++;
        for (const language of [...polish.allLanguages.map(grammar => grammar.id), '', 'unknown', 'plain', 'ansi']) {
          const source = language === 'ansi' ? '\x1b[31m' + html + '\x1b[0m\x1b]8;;javascript:window.__sentinel++\x07link\x1b]8;;\x07' : html;
          const markup = window.__highlighter.highlight(source, language);
          const violations = attach(markup, true);
          const text = document.createElement('div'); text.innerHTML = markup;
          if (language !== 'ansi' && text.textContent !== source) violations.push('source changed');
          if (violations.length) failures.push([label, language, violations]);
          cases++;
        }
      }
      return { failures, cases, executions: window.__sentinel };
    }, corpus);
    assert.deepEqual(rendered.failures, []);
    assert.equal(rendered.executions, 0);

    const destinations = await page.evaluate(() => {
      const failures = [];
      const rejected = ['javascript:window.__sentinel++', 'JAVASCRIPT:evil', 'java\tscript:evil',
        'java\nscript:evil', 'jav&#x61;script:evil', 'vbscript:evil', 'file:///tmp/secret',
        'blob:https://example.invalid/id', 'data:text/html,evil', '//example.invalid/x',
        '\\\\example.invalid/x', 'https://', 'mailto:not-an-address', 'tel:not-a-number'];
      for (const url of rejected) {
        for (const source of [`[link](<${url}>)`, `![image](<${url}>)`,
          `[link][id]\n\n[id]: <${url}>`, `![image][id]\n\n[id]: <${url}>`, `<${url}>`]) {
          const root = document.createElement('div'); root.innerHTML = meltDown.parse(source); document.body.append(root);
          if (root.querySelector('a[href],img')) failures.push(source);
          root.remove();
        }
      }
      for (const [source, expected] of [
        ['[link](/safe?q=1&x=2)', '/safe?q=1&x=2'],
        ['[link](https://example.invalid/)', 'https://example.invalid/'],
        ['[mail](mailto:me@example.com)', 'mailto:me@example.com'],
        ['[phone](tel:+1234567)', 'tel:+1234567']
      ]) {
        const root = document.createElement('div'); root.innerHTML = meltDown.parse(source);
        if (root.querySelector('a')?.getAttribute('href') !== expected) failures.push(source);
      }
      return { failures, cases: rejected.length * 5 + 4 };
    });
    assert.deepEqual(destinations.failures, [], 'Markdown destination policy');

    await page.getByRole('button', { name: 'Side-by-side', exact: true }).click();
    const sourceChecks = await page.evaluate(corpus => {
      const editor = window.__markdownReview, failures = [];
      for (const [label, html] of corpus) {
        editor.setMarkdown(html);
        if (editor.getMarkdown() !== html || editor.content.querySelector('img,script,svg,iframe,a')) failures.push(label + '/setter');
        editor.setMarkdown(''); editor.content.focus();
        const range = document.createRange(); range.selectNodeContents(editor.content); range.collapse(true);
        getSelection().removeAllRanges(); getSelection().addRange(range);
        const data = new DataTransfer(); data.setData('text/plain', html); data.setData('text/html', html);
        const paste = new Event('paste', { bubbles: true, cancelable: true });
        Object.defineProperty(paste, 'clipboardData', { value: data }); editor.content.dispatchEvent(paste);
        if (!paste.defaultPrevented || editor.getMarkdown() !== html || editor.content.querySelector('img,script,svg,iframe,a')) failures.push(label + '/paste');
        const drop = new Event('drop', { bubbles: true, cancelable: true });
        Object.defineProperty(drop, 'dataTransfer', { value: data }); editor.content.dispatchEvent(drop);
        if (!drop.defaultPrevented || editor.getMarkdown() !== html) failures.push(label + '/drop');
      }
      return { failures, executions: window.__sentinel };
    }, corpus);
    assert.deepEqual(sourceChecks, { failures: [], executions: 0 });

    // Deliberate parser bypasses remain trusted HTML, not sanitizer promises.
    const bypass = await page.evaluate(() => {
      const html = '<b onclick="window.__sentinel++">trusted</b>';
      for (const output of [meltDown.parse(html, { html: 'allow' }),
        meltDown.parse('```\nx\n```', { highlight: () => html })]) {
        const root = document.createElement('div'); root.innerHTML = output; document.body.append(root);
        root.querySelector('b').click(); root.remove();
      }
      return window.__sentinel;
    });
    assert.equal(bypass, 2);
    assert.deepEqual(requests, [], 'Preview/parser/highlighter output must not load payload resources');
    assert.deepEqual(errors, []);
    return { previewCases, renderingCases: rendered.cases, destinationCases: destinations.cases,
      sourceCases: corpus.length * 3 };
  } finally { await page.close(); }
}

module.exports = { markdownSecurityChecks };
