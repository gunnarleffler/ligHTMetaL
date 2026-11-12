const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');
const { checkDocumentation, loadDocumentation } = require('./release-docs');

function input(text, extra = {}) {
  return { metadata: { name: 'lightmetal', version: '0.7.0' }, documents: {
    'CHANGELOG.md': '# Changelog\n\n## 0.7.0 (unreleased)\n\nNew features.\n\n## 0.6.0\n\nOld release: lightmetal@0.6.0.\n\n## 0.5.0 (unpublished development snapshot)',
    'README.md': text, ...extra
  } };
}

test('current pins, latest logo, placeholders, peers and IPv4 addresses are not stale releases', () => {
  assert.deepEqual(checkDocumentation(input([
    'This checkout prepares lightmetal 0.7.0; it is not published yet.',
    'https://cdn.jsdelivr.net/npm/lightmetal@0.7.0/dist/maiden.js',
    'npm install lightmetal@0.7.0 --ignore-scripts',
    'lightmetal-0.7.0.tgz and lightmetal-$VERSION.tgz',
    'https://cdn.jsdelivr.net/npm/lightmetal@latest/ligHTMetaL.png',
    'https://cdn.jsdelivr.net/npm/lightmetal@VERSION/PATH',
    'React 18.3.1/19 and Vue 3.5.0. Research: literallycanvas 0.5.2.',
    'HOST=127.0.0.1; binds to 0.0.0.0:5000.'
  ].join('\n'))), []);
});

test('flags old prose and pins with file/line details, without duplicate findings', () => {
  const findings = checkDocumentation(input('Published **0.6.0**.\nUse `@0.6.0` or lightmetal@0.6.0.\nlightmetal-0.5.0.tgz'));
  assert.deepEqual(findings.map(({ file, line, message }) => ({ file, line, message })), [
    { file: 'README.md', line: 1, message: 'references 0.6.0; release target is 0.7.0' },
    { file: 'README.md', line: 2, message: 'references 0.6.0; release target is 0.7.0' },
    { file: 'README.md', line: 3, message: 'references 0.5.0; release target is 0.7.0' }
  ]);
  assert.equal(findings[0].text, 'Published **0.6.0**.');
});

test('sentence punctuation is allowed but IPv4 fragments are not versions', () => {
  const findings = checkDocumentation(input('This used 0.6.0.\nInstall lightmetal@0.2.9.\nAddress: 0.6.0.1.'));
  assert.equal(findings.length, 2);
  assert.deepEqual(findings.map(finding => finding.line), [1, 2]);
});

test('unknown pins, dependency ranges and future/prerelease pins must also match metadata', () => {
  const findings = checkDocumentation(input('lightmetal@0.2.9\n"lightmetal": "^0.2.9"\nlightmetal@0.8.0\nlightmetal@0.7.0-beta.1\nlightmetal-0.2.9.tgz\nligHTMetaL version 0.2.9.'));
  assert.equal(findings.length, 6);
});

test('scans nested documentation but preserves historical changelog entries', () => {
  assert.deepEqual(checkDocumentation(input('Version 0.7.0')), []);
  const findings = checkDocumentation(input('', { 'adapters/react/README.md': 'Install lightmetal@0.6.0' }));
  assert.equal(findings.length, 1);
  assert.equal(findings[0].file, 'adapters/react/README.md');
});

test('reviewed historical/third-party prose needs a reason and cannot excuse stale package pins', () => {
  const note = '<!-- release-docs: allow-version 0.6.0; compatibility history -->';
  assert.deepEqual(checkDocumentation(input('Available since lightmetal 0.6.0. ' + note)), []);
  assert.equal(checkDocumentation(input('Available since 0.6.0. <!-- release-docs: allow-version 0.6.0; -->')).length, 1);
  assert.equal(checkDocumentation(input('lightmetal@0.6.0 ' + note)).length, 1);
  assert.equal(checkDocumentation(input('lightmetal-0.6.0.tgz ' + note)).length, 1);
});

test('the current changelog heading must match package metadata', () => {
  const findings = checkDocumentation(input('', { 'CHANGELOG.md': '## 0.6.0\nOld release' }));
  assert.match(findings[0].message, /first release heading must match 0\.7\.0/);
});

test('discovers npm-shipped docs, disables hooks, and reads archive bytes rather than checkout docs', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'lightmetal-docs-test-'));
  try {
    fs.mkdirSync(path.join(directory, 'docs'));
    fs.mkdirSync(path.join(directory, 'adapters/react'), { recursive: true });
    fs.writeFileSync(path.join(directory, 'package.json'), JSON.stringify({
      name: 'lightmetal', version: '0.7.0', files: ['CHANGELOG.md', 'docs/public.md', 'adapters'],
      scripts: { prepack: 'node -e "require(\'fs\').writeFileSync(\'hook-ran\', \'bad\')"' }
    }));
    fs.writeFileSync(path.join(directory, 'README.md'), 'lightmetal@0.6.0');
    fs.writeFileSync(path.join(directory, 'CHANGELOG.md'), input('').documents['CHANGELOG.md']);
    fs.writeFileSync(path.join(directory, 'docs/public.md'), 'lightmetal 0.7.0');
    fs.writeFileSync(path.join(directory, 'docs/private.md'), 'Private notes for lightmetal 0.5.0');
    fs.writeFileSync(path.join(directory, 'adapters/react/README.md'), 'lightmetal 0.7.0; React 18.3.1');
    const before = loadDocumentation(directory);
    assert.deepEqual(Object.keys(before.documents).sort(), ['CHANGELOG.md', 'README.md', 'adapters/react/README.md', 'docs/public.md']);
    assert.equal(checkDocumentation(before).length, 1);
    const packed = spawnSync('npm', ['pack', '--ignore-scripts', '--pack-destination', directory], { cwd: directory, encoding: 'utf8' });
    assert.equal(packed.status, 0, packed.stderr);
    fs.writeFileSync(path.join(directory, 'README.md'), 'lightmetal@0.7.0');
    assert.deepEqual(checkDocumentation(loadDocumentation(directory)), []);
    const archived = loadDocumentation(directory, path.join(directory, 'lightmetal-0.7.0.tgz'));
    assert.equal(checkDocumentation(archived).length, 1, 'fixing the checkout must not hide stale archived documentation');
    assert.equal(fs.existsSync(path.join(directory, 'hook-ran')), false);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
