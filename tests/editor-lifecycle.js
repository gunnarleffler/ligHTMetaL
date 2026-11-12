// Instance settings and deferred-work checks, run by smoke.js in both browsers.
module.exports = async function editorLifecycleChecks(page, check) {
  for (const format of ['iife', 'esm']) {
    await page.evaluate(async (format) => {
      const api = format === 'esm' ? await import('/dist/lightmetal.esm.js') : lightmetal;
      const wrapper = document.createElement('section');
      wrapper.setAttribute('data-lifecycle-tests', '');
      document.body.appendChild(wrapper);
      window.__lifecycle = {
        api, wrapper, editors: [],
        create(options = {}) {
          const host = document.createElement('div');
          host.className = 'lightmetal';
          wrapper.appendChild(host);
          const editor = api.init({ element: host, ...options });
          this.editors.push(editor);
          return editor;
        },
        select(editor, collapse = true) {
          editor.content.focus();
          const range = document.createRange();
          range.selectNodeContents(editor.content.firstChild);
          if (collapse) range.collapse(false);
          const selection = document.getSelection();
          selection.removeAllRanges();
          selection.addRange(range);
        }
      };
    }, format);
    try {
      const invalid = await page.evaluate(() => {
        const state = window.__lifecycle;
        const add = EventTarget.prototype.addEventListener;
        const remove = EventTarget.prototype.removeEventListener;
        let registrations = 0;
        let removals = 0;
        const cases = [
          'bold', ['missing-action'], ['bold', 'missing-action'], [null],
          [{ icon: 'X', title: 'Missing result' }], [{ name: 'bold', state: true }]
        ];
        const errors = [];
        const host = document.createElement('div');
        host.textContent = 'existing content';
        state.wrapper.appendChild(host);
        EventTarget.prototype.addEventListener = function (...args) {
          registrations++;
          return add.apply(this, args);
        };
        EventTarget.prototype.removeEventListener = function (...args) {
          removals++;
          return remove.apply(this, args);
        };
        try {
          for (const actions of cases) {
            try {
              const editor = state.api.init({ element: host, actions });
              editor.destroy();
              errors.push(false);
            } catch (error) { errors.push(error instanceof TypeError); }
          }
          return { errors, registrations, removals, html: host.innerHTML };
        } finally {
          EventTarget.prototype.addEventListener = add;
          EventTarget.prototype.removeEventListener = remove;
          host.remove();
        }
      });
      check(`${format}: invalid actions fail before registering listeners`,
        invalid.errors.every(Boolean) && invalid.registrations === 0 &&
        invalid.removals === 0 && invalid.html === 'existing content');

      const initialStates = await page.evaluate(() => {
        const state = window.__lifecycle;
        state.stateCalls = 0; state.customActive = false;
        state.accessible = state.create({ actions: ['bold', 'italic', 'underline', 'strikethrough', 'line', 'source', {
          title: 'Custom state', icon: 'X',
          state: () => { state.stateCalls++; return state.customActive; },
          result: () => { state.customActive = !state.customActive; return true; }
        }] });
        state.accessible.element.dataset.accessibilityTest = '';
        state.accessible.element.style.maxWidth = '240px';
        const before = document.createElement('button'); before.id = 'html-entry-before'; before.textContent = 'Before editor';
        const after = document.createElement('button'); after.id = 'html-entry-after'; after.textContent = 'After editor';
        state.accessible.element.before(before); state.accessible.element.after(after);
        state.accessible.setHTML('<p>Accessible editing</p>');
        return { calls: state.stateCalls, pressed: Array.from(state.accessible.element.querySelectorAll('.lightmetal-actionbar button:not(.lightmetal-overflow-trigger)'), button => button.getAttribute('aria-pressed')) };
      });
      check(`${format}: stateful buttons start unpressed without extra state callbacks`,
        initialStates.calls === 0 && JSON.stringify(initialStates.pressed) === JSON.stringify(['false', 'false', 'false', 'false', null, 'false', 'false']));
      const accessible = page.locator('[data-accessibility-test]');
      const visual = accessible.getByRole('textbox', { name: 'HTML content', exact: true });
      check(`${format}: visual editing has a name and multiline textbox semantics`,
        await visual.count() === 1 && await visual.getAttribute('aria-multiline') === 'true');
      await page.locator('#html-entry-before').focus();
      check(`${format}: toolbar stays out of the external Tab sequence`, await accessible.locator('.lightmetal-actionbar button').evaluateAll(buttons => buttons.every(button => button.tabIndex === -1)));
      await page.keyboard.press('Tab');
      check(`${format}: forward Tab enters visual editing, not the toolbar`, await visual.evaluate(node => node === document.activeElement));
      await page.keyboard.press('Shift+Tab');
      check(`${format}: Shift+Tab still reaches the toolbar from visual editing`, await accessible.getByRole('button', { name: 'Overflow', exact: true }).evaluate(node => node === document.activeElement));
      await page.keyboard.press('Tab');
      check(`${format}: Tab returns from the last toolbar control to writing`, await visual.evaluate(node => node === document.activeElement));
      await page.keyboard.press('Tab');
      check(`${format}: Tab leaves visual editing for the next field`, await page.locator('#html-entry-after').evaluate(node => node === document.activeElement));
      await page.keyboard.press('Shift+Tab');
      check(`${format}: backward entry also reaches visual editing`, await visual.evaluate(node => node === document.activeElement));
      await page.evaluate(() => __lifecycle.select(__lifecycle.accessible, false));
      const bold = accessible.getByRole('button', { name: 'Bold', exact: true });
      await bold.click();
      check(`${format}: formatting exposes the same pressed and visual state`,
        await bold.getAttribute('aria-pressed') === 'true' && await bold.evaluate(button => button.classList.contains('lightmetal-button-selected')));
      await bold.click();
      check(`${format}: toggling formatting off clears both states`,
        await bold.getAttribute('aria-pressed') === 'false' && !await bold.evaluate(button => button.classList.contains('lightmetal-button-selected')));
      await page.keyboard.press('Control+b');
      check(`${format}: native formatting shortcuts refresh pressed state`, await bold.getAttribute('aria-pressed') === 'true');
      const callbackCounts = await page.evaluate(() => {
        const state = __lifecycle, before = state.stateCalls;
        state.accessible.content.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
        const afterMouse = state.stateCalls;
        state.accessible.content.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowLeft', bubbles: true }));
        return [afterMouse - before, state.stateCalls - afterMouse];
      });
      check(`${format}: state callbacks still run once per existing refresh event`, callbackCounts.every(count => count === 1));
      if (!await accessible.getByRole('button', { name: 'Custom state', exact: true }).isVisible()) await accessible.getByRole('button',{name:'Overflow',exact:true}).click();
      await accessible.getByRole('button', { name: 'Custom state', exact: true }).click();
      check(`${format}: custom state controls expose pressed state`,
        await accessible.getByRole('button', { name: 'Custom state', exact: true, includeHidden: true }).getAttribute('aria-pressed') === 'true');
      const sourceButton = accessible.getByRole('button', { name: 'Source', exact: true });
      await sourceButton.click();
      await page.locator('#html-entry-before').focus(); await page.keyboard.press('Tab');
      check(`${format}: forward entry uses the Source textarea while Source mode is active`,
        await accessible.getByRole('textbox', { name: 'HTML source', exact: true }).evaluate(node => node === document.activeElement));
      check(`${format}: Source mode has a named textarea and pressed toggle`,
        await accessible.getByRole('textbox', { name: 'HTML source', exact: true }).isVisible() &&
        await sourceButton.getAttribute('aria-pressed') === 'true' && await visual.isHidden());
      await sourceButton.click();
      check(`${format}: leaving Source clears its pressed state and restores visual editing`,
        await sourceButton.getAttribute('aria-pressed') === 'false' && await visual.isVisible());
      await page.evaluate(() => {
        const state = __lifecycle;
        state.nextEntry = state.create({ actions: ['bold'] });
        state.nextEntry.element.dataset.nextEntry = '';
        state.nextEntry.setHTML('<p>Second editor</p>');
        document.getElementById('html-entry-after').before(state.nextEntry.element);
      });
      await page.locator('#html-entry-before').focus(); await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');
      check(`${format}: Tab between editors enters the next writing field`,
        await page.locator('[data-next-entry]').getByRole('textbox', { name: 'HTML content', exact: true }).evaluate(node => node === document.activeElement));
      check(`${format}: leaving an editor removes only its toolbar from Tab order`,
        await accessible.locator('.lightmetal-actionbar button').evaluateAll(buttons => buttons.every(button => button.tabIndex === -1)));
      await page.keyboard.press('Tab');
      check(`${format}: an editor does not trap focus`, await page.locator('#html-entry-after').evaluate(node => node === document.activeElement));
      await page.evaluate(() => { __lifecycle.accessible.destroy(); __lifecycle.nextEntry.destroy(); });

      await page.evaluate(() => {
        const state = window.__lifecycle;
        state.a = state.create({ defaultParagraphSeparator: 'p', styleWithCSS: true });
        state.a.setHTML('<h2>heading</h2>');
        state.select(state.a);
        // Initializing B must not change native settings while A is active.
        state.b = state.create({ defaultParagraphSeparator: 'div', styleWithCSS: false });
      });
      await page.keyboard.press('Enter');
      await page.keyboard.insertText('next');
      check(`${format}: another initialization preserves the active paragraph separator`,
        await page.evaluate(() => window.__lifecycle.a.content.lastElementChild.tagName === 'P'));

      await page.evaluate(() => {
        const state = window.__lifecycle;
        state.b.setHTML('<h2>heading</h2>');
        state.select(state.b);
      });
      await page.keyboard.press('Enter');
      await page.keyboard.insertText('next');
      check(`${format}: focusing B applies its div separator`,
        await page.evaluate(() => window.__lifecycle.b.content.lastElementChild.tagName === 'DIV'));

      const styles = await page.evaluate(() => {
        const state = window.__lifecycle;
        state.a.setHTML('<p>CSS text</p>');
        state.select(state.a, false);
        state.api.exec('bold');
        const css = state.a.content.querySelector('[style]')?.style.fontWeight === 'bold';
        state.b.setHTML('<p>semantic text</p>');
        state.select(state.b, false);
        state.api.exec('bold');
        const semantic = !!state.b.content.querySelector('b, strong') && !state.b.content.querySelector('[style]');
        state.a.setHTML('<h2>heading</h2>');
        state.select(state.a);
        return { css, semantic };
      });
      check(`${format}: true/false CSS formatting settings stay independent`, styles.css && styles.semantic);
      await page.keyboard.press('Enter');
      await page.keyboard.insertText('back in A');
      check(`${format}: refocusing A restores its paragraph separator`,
        await page.evaluate(() => window.__lifecycle.a.content.lastElementChild.tagName === 'P'));

      // Exercise the deferred callback with real Enter input and an application
      // onChange handler that destroys the originating editor and moves focus.
      await page.evaluate(() => {
        const state = window.__lifecycle;
        state.b.setHTML('<h2>other editor</h2>');
        state.armed = false;
        state.quote = state.create({
          defaultParagraphSeparator: 'p',
          onChange: () => {
            if (!state.armed) return;
            state.armed = false;
            state.quote.destroy();
            state.select(state.b);
          }
        });
        state.quote.setHTML('<blockquote>quote</blockquote>');
        state.select(state.quote);
        state.armed = true;
      });
      await page.keyboard.press('Enter');
      const quote = await page.evaluate(async () => {
        // Flush the zero-delay formatting task, not an arbitrary animation delay.
        await new Promise((resolve) => setTimeout(resolve, 0));
        const state = window.__lifecycle;
        return { html: state.b.getHTML(), empty: !state.quote.element.childNodes.length, fired: !state.armed };
      });
      check(`${format}: queued quote formatting cannot edit another instance after destroy`,
        quote.html === '<h2>other editor</h2>' && quote.empty && quote.fired);

      // Also guard focus, selection and Source changes without destroying the instance.
      const deferred = await page.evaluate(async () => {
        const state = window.__lifecycle;
        const editor = state.create({ defaultParagraphSeparator: 'p' });
        const schedule = () => {
          editor.setHTML('<blockquote>quote</blockquote>');
          state.select(editor);
          editor.content.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        };
        const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
        schedule();
        state.b.setHTML('<h2>focus moved</h2>');
        state.select(state.b);
        await flush();
        const focus = state.b.getHTML() === '<h2>focus moved</h2>';
        schedule();
        // Leave focus in the original editor but put selection in another one.
        const range = document.createRange();
        range.selectNodeContents(state.b.content.firstChild);
        document.getSelection().removeAllRanges();
        document.getSelection().addRange(range);
        await flush();
        const selection = state.b.getHTML() === '<h2>focus moved</h2>';
        schedule();
        editor.element.querySelector('button[title="Source"]').click();
        editor.source.value = '<h2>source edit</h2>';
        editor.element.querySelector('button[title="Source"]').click();
        await flush();
        const source = editor.getHTML() === '<h2>source edit</h2>';
        schedule();
        editor.setHTML('<h2>replacement</h2>');
        state.select(editor);
        await flush();
        const replacement = editor.getHTML() === '<h2>replacement</h2>';
        // Valid deferred formatting must still run for the original editor.
        schedule();
        await flush();
        const valid = editor.content.firstElementChild.tagName === 'P';
        editor.destroy();
        return { focus, selection, source, replacement, valid };
      });
      check(`${format}: deferred formatting respects focus, selection, Source and replacement`,
        Object.values(deferred).every(Boolean));

      const uploads = await page.evaluate(async () => {
        const state = window.__lifecycle;
        const timeout = window.setTimeout;
        const probe = async (reject) => {
          let finish;
          let fail;
          const editor = state.create({ images: {
            onInsert: () => new Promise((resolve, reject) => { finish = resolve; fail = reject; })
          } });
          const pending = editor.insertImage(new File(['x'], 'test.png', { type: 'image/png' }));
          editor.destroy();
          const delays = [];
          window.setTimeout = (handler, delay, ...args) => {
            delays.push(delay);
            return timeout(handler, delay, ...args);
          };
          try {
            if (reject) fail(new Error('late upload failure'));
            else finish('/img/tiny.png');
            const accepted = await pending;
            return { accepted, delays, empty: !editor.element.childNodes.length };
          } finally { window.setTimeout = timeout; }
        };
        return { rejected: await probe(true), resolved: await probe(false) };
      });
      check(`${format}: late upload results create no work after destroy`,
        Object.values(uploads).every((result) => !result.accepted && result.empty && !result.delays.length));

      // Named workflow overrides and custom callbacks must survive validation.
      const overrides = await page.evaluate(() => {
        const state = window.__lifecycle;
        let called = false;
        const editor = state.create({ actions: [
          { name: 'source', title: 'HTML' }, { name: 'image', result: undefined },
          { name: 'table', result: null },
          { icon: 'X', title: 'Custom', result: () => { called = true; } }
        ] });
        editor.element.querySelector('button[title="HTML"]').click();
        const source = !editor.source.hidden;
        editor.element.querySelector('button[title="HTML"]').click();
        editor.element.querySelector('button[title="Custom"]').click();
        editor.destroy();
        return source && called;
      });
      check(`${format}: validation preserves named overrides and custom callbacks`, overrides);

      const workflows = await page.evaluate(() => {
        const state = window.__lifecycle;
        const cases = [
          undefined,
          ['image', 'table'],
          [{ name: 'image' }, { name: 'table' }],
          [{ name: 'image', result: undefined }, { name: 'table', result: null }],
          [{ name: 'image', result: null }, { name: 'table', result: undefined }]
        ];
        return cases.map((actions) => {
          const editor = state.create({ actions, images: { allowURL: false } });
          editor.setHTML('<p>content</p>');
          state.select(editor);
          editor.element.querySelector('button[title="Image"]').click();
          const image = !!editor.element.querySelector('input[type="file"]');
          editor.element.querySelector('button[title="Table"]').click();
          const dropdown = editor.element.querySelector('.lightmetal-table-menu:not(.lightmetal-overflow)');
          const table = !!dropdown && !dropdown.hidden;
          editor.destroy();
          return { image, table };
        });
      });
      check(`${format}: default, string and named actions invoke image/table workflows`,
        workflows.every((result) => result.image && result.table));

      const customWorkflows = await page.evaluate(() => {
        const state = window.__lifecycle;
        const calls = { image: 0, table: 0 };
        const editor = state.create({
          images: { allowURL: false },
          actions: ['image', 'table'].map((name) => ({
            name,
            result: () => { calls[name]++; return false; }
          }))
        });
        editor.setHTML('<p>content</p>');
        state.select(editor);
        editor.element.querySelector('button[title="Image"]').click();
        editor.element.querySelector('button[title="Table"]').click();
        const builtInUI = !!editor.element.querySelector('input[type="file"], .lightmetal-table-dropdown');
        const unchanged = editor.getHTML() === '<p>content</p>';
        editor.destroy();
        return { calls, builtInUI, unchanged };
      });
      check(`${format}: custom image/table results run instead of built-in workflows`,
        customWorkflows.calls.image === 1 && customWorkflows.calls.table === 1 &&
        !customWorkflows.builtInUI && customWorkflows.unchanged);

      const omittedWorkflows = await page.evaluate(() => {
        const editor = window.__lifecycle.create({ actions: ['bold'] });
        const buttons = Array.from(editor.element.querySelectorAll('.lightmetal-button:not(.lightmetal-overflow-trigger)'), (button) => button.title);
        editor.destroy();
        return buttons.length === 1 && buttons[0] === 'Bold';
      });
      check(`${format}: omitted image/table actions do not add toolbar buttons`, omittedWorkflows);
    } finally {
      await page.evaluate(() => {
        const state = window.__lifecycle;
        state.editors.forEach((editor) => editor.destroy());
        state.wrapper.remove();
        delete window.__lifecycle;
      });
    }
  }
};
