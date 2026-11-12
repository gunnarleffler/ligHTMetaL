/* Check the documentation npm ships, not private notes or development history. */
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const VERSION = String.raw`\d+\.\d+\.\d+(?:-[\da-zA-Z-]+(?:\.[\da-zA-Z-]+)*)?(?:\+[\da-zA-Z-]+(?:\.[\da-zA-Z-]+)*)?`;
const END = String.raw`(?![\w+-]|\.\d)`;
const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const isDocumentation = file => /\.(?:md|txt)$/i.test(file);

function run(command, args, cwd = ROOT) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (result.status !== 0) throw Error(result.stderr || result.stdout);
  return result.stdout;
}

function loadDocumentation(root = ROOT, archive) {
  if (archive) {
    archive = path.resolve(archive);
    const entries = run('tar', ['-tzf', archive]).trim().split(/\r?\n/);
    const read = file => run('tar', ['-xOf', archive, 'package/' + file]);
    const metadata = JSON.parse(read('package.json'));
    const files = entries.filter(file => file.startsWith('package/') && isDocumentation(file))
      .map(file => file.slice('package/'.length));
    return { metadata, documents: Object.fromEntries(files.map(file => [file, read(file)])) };
  }
  const metadata = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const json = JSON.parse(run('npm', ['pack', '--dry-run', '--ignore-scripts', '--json'], root));
  // npm 12 keys results by package name; earlier versions return an array.
  const [packed] = Array.isArray(json) ? json : Object.values(json);
  const files = packed.files.map(file => file.path).filter(isDocumentation);
  return { metadata, documents: Object.fromEntries(files.map(file => [file, fs.readFileSync(path.join(root, file), 'utf8')])) };
}

function checkDocumentation({ metadata, documents }) {
  const { name, version } = metadata;
  const findings = [];
  const headings = [...(documents['CHANGELOG.md'] || '').matchAll(new RegExp(`^##\\s+v?(${VERSION})(?=\\s|$)`, 'gm'))];
  if (headings[0]?.[1] !== version) {
    findings.push({ file: 'CHANGELOG.md', line: 1, message: `first release heading must match ${version}` });
  }
  const oldVersions = new Set(headings.map(heading => heading[1]).filter(value => value !== version));
  const patterns = [
    new RegExp(`(?<![\\w-])${escape(name)}@v?(${VERSION})${END}`, 'g'),
    new RegExp(`(?<![\\w-])${escape(name)}-(${VERSION})\\.tgz\\b`, 'g'),
    new RegExp(`(?<![\\w-])@(${VERSION})${END}`, 'g'),
    new RegExp(`["']${escape(name)}["']\\s*:\\s*["'][~^]?(${VERSION})${END}`, 'g')
  ];
  const namedProse = new RegExp(`\\b${escape(name)}(?:\\s+version)?\\s+v?(${VERSION})${END}`, 'gi');
  for (const [file, text] of Object.entries(documents)) {
    if (file === 'CHANGELOG.md') continue; // Release history must retain its real versions.
    text.split(/\r?\n/).forEach((line, index) => {
      const stale = new Set();
      const allowedProse = new Set([...line.matchAll(new RegExp(`<!-- release-docs: allow-version (${VERSION});\\s*(\\S.*?)\\s*-->`, 'g'))].map(match => match[1]));
      for (const pattern of patterns) {
        for (const match of line.matchAll(pattern)) if (match[1] !== version) stale.add(match[1]);
      }
      for (const match of line.matchAll(namedProse)) {
        if (match[1] !== version && !allowedProse.has(match[1])) stale.add(match[1]);
      }
      // Also catch prose about previous lightmetal versions, not just package URLs.
      // Boundaries exclude IPv4 addresses; other numeric versions are not release history.
      for (const match of line.matchAll(new RegExp(`(?<![\\w.+-])v?(${VERSION})${END}`, 'g'))) {
        if (oldVersions.has(match[1]) && !allowedProse.has(match[1])) stale.add(match[1]);
      }
      for (const value of stale) findings.push({ file, line: index + 1,
        message: `references ${value}; release target is ${version}`, text: line.trim() });
    });
  }
  return findings;
}

function main() {
  const input = loadDocumentation(ROOT, process.argv[2]);
  const findings = checkDocumentation(input);
  for (const finding of findings) {
    console.error(`${finding.file}:${finding.line}: ${finding.message}${finding.text ? '\n  ' + finding.text : ''}`);
  }
  if (findings.length) {
    console.error(`Release documentation: ${findings.length} finding(s). Review historical references; do not blindly replace version numbers.`);
    process.exitCode = 1;
  } else {
    console.log(`Release documentation: ${Object.keys(input.documents).length} shipped documents match lightmetal ${input.metadata.version} (changelog history preserved).`);
  }
}

module.exports = { loadDocumentation, checkDocumentation };
if (require.main === module) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
