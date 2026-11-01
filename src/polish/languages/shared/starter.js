import { words, identifiers } from './c-family.js';

/** Fresh quoted region with optional doubled delimiters and backslash escapes. */
export function quoted(id, quote, { doubled = false, escape = true, multiline = false } = {}) {
  const delimiter = quote.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rules = [];
  if (doubled) rules.push({ id: 'doubled', pattern: new RegExp(delimiter + delimiter), kind: 'string' });
  if (escape) rules.push({ id: 'escape', pattern: /\\(?:\r\n|[^])/, kind: 'string' });
  return { id, begin: new RegExp(delimiter), end: new RegExp(delimiter + (doubled ? `(?!${delimiter})` : '') + (multiline ? '' : '|(?=\\r|\\n)')), kind: 'string', rules };
}

/** Assemble shared lexical machinery with explicit per-language vocabulary/rules. */
export function starter({ id, aliases = [], keywords, types = '', constants = '', booleans = '', insensitive = false, comments = [], strings = [], before = [], after = [], number = /(?<![\w.])(?:0[xX][\da-fA-F_]+|\d[\d_]*(?:\.\d[\d_]*)?(?:[eE][+-]?[\d_]+)?)(?!\w)/, repository }) {
  const vocabulary = (id, text, kind) => {
    const pattern = words(text);
    return { id, pattern: new RegExp(pattern.source, insensitive ? 'i' : ''), kind };
  };
  return { id, aliases, ...(repository ? { repository } : {}), rules: [
    ...comments, ...before, ...strings,
    ...(keywords ? [vocabulary('keyword', keywords, 'keyword')] : []),
    ...(types ? [vocabulary('type', types, 'type')] : []),
    ...(constants ? [vocabulary('constant', constants, 'constant')] : []),
    ...(booleans ? [vocabulary('boolean', booleans, 'boolean')] : []),
    { id: 'number', pattern: number, kind: 'number' }, ...after, ...identifiers(),
  ] };
}
