// Run Etch's preserved browser suites with the suite's global Playwright.
const {spawnSync} = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const directory = path.join(__dirname, 'etch/browser');
const files = fs.readdirSync(directory).filter(name => name.endsWith('.test.js')).map(name => path.join(directory, name));
const source = files.map(file => fs.readFileSync(file, 'utf8')).join('\n');
const variables = [...new Set(source.match(/ETCH_[A-Z_]*BROWSER/g))];
for (const browser of (process.env.BROWSERS || 'chromium,firefox').split(',')) {
  if (!['chromium','firefox','webkit'].includes(browser)) throw new Error(`Unknown browser: ${browser}`);
  console.log(`Etch browser suite: ${browser}`);
  const env = {...process.env, ETCH_BROWSER:browser};
  for (const key of variables) env[key] = browser;
  // The imported foundation suite has Chromium-only decoder fixtures. Run it
  // once in Chromium, not a second time under a misleading Firefox label.
  const selected = browser === 'chromium' ? files : files.filter(file => !file.endsWith('/foundation.test.js'));
  const result = spawnSync(process.execPath, ['--test','--test-concurrency=4',...selected], {env,stdio:'inherit'});
  if (result.status !== 0) process.exit(result.status || 1);
}
