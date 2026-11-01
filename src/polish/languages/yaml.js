import { quoted } from './shared/starter.js';

/** Scan an indented block scalar without treating its contents as YAML. */
function blockScalar({ source, start, end }) {
  const header = /[|>](?:[1-9][+-]?|[+-][1-9]?)?[ \t]*(?:#[^\r\n]*)?(?:\r?\n|$)/g;
  header.lastIndex = start;
  let match;
  while ((match = header.exec(source)) && match.index < end) {
    const prefix = source.slice(source.lastIndexOf('\n', match.index - 1) + 1, match.index);
    if (!/^[ ]*(?:-[ \t]+)?(?:[^#"'|>\r\n]+:[ \t]*)?$/.test(prefix)) continue;
    const base = prefix.match(/^ */)[0].length;
    const explicit = match[0].match(/^[|>][+-]?([1-9])/);
    let indent = explicit ? base + Number(explicit[1]) + (/^ *-\s/.test(prefix) ? 2 : 0) : null;
    let cursor = Math.min(header.lastIndex, end);
    while (cursor < end) {
      const newline = source.indexOf('\n', cursor);
      const next = newline < 0 ? end : Math.min(newline + 1, end);
      const line = source.slice(cursor, next);
      if (!/^\s*$/.test(line)) {
        const spaces = line.match(/^ */)[0].length;
        if (spaces <= base || (indent !== null && spaces < indent)) break;
        indent ??= spaces;
      }
      cursor = next;
    }
    return { start: match.index, end: cursor };
  }
  return null;
}
/** YAML lexical starter, not a schema resolver or indentation-validating parser. */
export default { id: 'yaml', aliases: ['yml'], rules: [
  { id: 'block-scalar', scan: blockScalar, kind: 'string' },
  { id: 'comment', pattern: /(?<!\S)#[^\r\n]*/, kind: 'comment' },
  { ...quoted('double', '"', { multiline: true }), begin: /(?<![\w])"/ },
  { ...quoted('single', "'", { doubled: true, escape: false, multiline: true }), begin: /(?<![\w])'/ },
  { id: 'document', pattern: /^(?:---|\.\.\.)(?=\s|$)|^%[^\r\n]*/m, kind: 'keyword' },
  { id: 'key', pattern: /(?:[A-Za-z_][\w .\/-]*)(?=:[ \t\r\n]|:$)/m, kind: 'property' },
  { id: 'anchor', pattern: /[&*][A-Za-z0-9_-]+/, kind: 'variable' },
  { id: 'tag', pattern: /!(?:<[^>\r\n]*>|!?[\w:./-]*)/, kind: 'type' },
  { id: 'boolean', pattern: /\b(?:true|false)\b/i, kind: 'boolean' },
  { id: 'null', pattern: /\bnull\b|~/i, kind: 'constant' },
  { id: 'number', pattern: /(?<![\w])[-+]?(?:0x[\da-f]+|0o[0-7]+|\d+(?:\.\d+)?(?:e[-+]?\d+)?)(?![\w])/i, kind: 'number' },
  { id: 'punctuation', pattern: /[{}\[\],:]|^ *[-?](?=\s)/m, kind: 'punctuation' },
] };
