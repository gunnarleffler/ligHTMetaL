/**
 * Find a single simple heredoc, including its dynamic closing line. This is a
 * lexical subset: no queued heredocs, shell word expansion, or full quote removal.
 * The heredoc and trailing command-header text share the string category.
 * @param {import('../index.js').ScannerContext} context
 * @returns {import('../index.js').ScannerMatch|null}
 */
function heredoc({ source, start, end }) {
  const opening = /<<(-?)[ \t]*(?:'([^'\r\n]*)'|"([^"\r\n]*)"|\\([A-Za-z_]\w*)|([A-Za-z_]\w*))(?=[\s;|&<>)]|$)/g;
  opening.lastIndex = start;
  for (let match; (match = opening.exec(source)) && match.index < end;) {
    if (source[match.index - 1] === '<' || opening.lastIndex > end) continue;
    const delimiter = match[2] ?? match[3] ?? match[4] ?? match[5];
    const headerEnd = source.indexOf('\n', opening.lastIndex);
    if (headerEnd < 0 || headerEnd >= end) return { start: match.index, end };
    let cursor = headerEnd + 1;
    while (cursor < end) {
      const newline = source.indexOf('\n', cursor);
      const lineEnd = newline < 0 ? end : Math.min(newline, end);
      let line = source.slice(cursor, lineEnd);
      if (line.endsWith('\r')) line = line.slice(0, -1);
      if (match[1] === '-') line = line.replace(/^\t+/, '');
      if (line === delimiter) return { start: match.index, end: lineEnd };
      cursor = lineEnd + 1;
    }
    return { start: match.index, end };
  }
  return null;
}

/**
 * Bash starter grammar. Aliases sh/shell select this subset, not strict POSIX sh.
 * Heredocs are single scanner tokens. Parameter/command substitutions are lexical
 * approximations; nested command substitutions and queued heredocs are not parsed.
 * @type {import('../index.js').Language}
 */
export default {
  id: 'bash', aliases: ['sh', 'shell'],
  repository: {
    variables: [{ id: 'variable', pattern: /\$(?:[A-Za-z_]\w*|\d+|[?@*#$!_-]|\{[^}\r\n]*\})/, kind: 'variable' }],
    escapes: [{ id: 'escape', pattern: /\\(?:\r\n|[^])/, kind: 'string' }],
  },
  rules: [
    { id: 'comment', pattern: /(?<![^\s;|&()])#[^\r\n]*/, kind: 'comment' },
    { id: 'heredoc', scan: heredoc, kind: 'string' },
    { id: 'single-string', begin: /'/, end: /'/, kind: 'string' },
    { id: 'double-string', begin: /"/, end: /"/, kind: 'string', rules: [{ id: 'escapes', include: 'escapes' }, { id: 'variables', include: 'variables' }] },
    { id: 'escape', pattern: /\\(?:\r\n|[^])/, kind: 'string' },
    { id: 'variables', include: 'variables' },
    { id: 'keyword', pattern: /(?<![\w$.-])(?:if|then|else|elif|fi|for|while|until|do|done|case|esac|in|function|select|time|coproc)\b/, kind: 'keyword' },
    { id: 'builtin', pattern: /(?<![\w$.-])(?:echo|printf|read|cd|pwd|export|local|declare|readonly|source|return|exit|shift|set|unset|trap|exec|eval|test|true|false|break|continue)\b/, kind: 'function' },
    { id: 'assignment', pattern: /\b[A-Za-z_]\w*(?==)/, kind: 'variable' },
    { id: 'number', pattern: /\b\d+\b/, kind: 'number' },
    { id: 'operator', pattern: /[|&;<>!=]+/, kind: 'operator' },
    { id: 'punctuation', pattern: /[()[\]{}]/, kind: 'punctuation' },
  ],
};
