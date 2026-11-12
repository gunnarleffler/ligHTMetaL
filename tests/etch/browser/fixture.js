import {before,after} from 'node:test';
import {createRequire} from 'node:module';
const {chromium,firefox,webkit} = createRequire(import.meta.url)('playwright');
import {startDemoServer} from '../support/serve-demo.js';

/** One browser and loopback server per suite; pages/contexts remain test-owned. */
export function useBrowser(name) {
  const fixture = {};
  before(async () => {
    fixture.server = await startDemoServer({port:0});
    try {fixture.browser = await ({chromium,firefox,webkit})[name].launch();}
    catch(error) {await fixture.server.close();throw error;}
  });
  after(async () => {await fixture.browser?.close();await fixture.server?.close();});
  return fixture;
}

/** Isolate custom-card tests from the demo's intentionally open startup sidebar. */
export async function collapseDemoSidebar(page) {
  await page.locator('#editor .etch-sidebar-toggle').evaluate(button => {
    if (button.getAttribute('aria-expanded') === 'true') button.click();
  });
}
