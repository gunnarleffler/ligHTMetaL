/** Shared lexical building blocks, not a universal C-like grammar. */
export function comments() {
  return [
    { id: 'line-comment', pattern: /\/\/[^\r\n]*/, kind: 'comment' },
    { id: 'block-comment', begin: /\/\*/, end: /\*\//, kind: 'comment' },
  ];
}

/** @param {string} [prefix] Trusted regex source for optional string prefixes. */
export function quotes(prefix = '') {
  return [
    { id: 'double-string', begin: new RegExp(`${prefix}"`), end: /"|(?=\r|\n)/, kind: 'string', rules: [{ id: 'escape', pattern: /\\(?:\r\n|[^])/, kind: 'string' }] },
    { id: 'character', begin: new RegExp(`${prefix}'`), end: /'|(?=\r|\n)/, kind: 'string', rules: [{ id: 'escape', pattern: /\\(?:\r\n|[^])/, kind: 'string' }] },
  ];
}

/** Construct whole-word patterns from trusted, whitespace-delimited vocabulary. */
export function words(vocabulary) {
  const terms = vocabulary.trim().split(/\s+/).map(word => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(`\\b(?:${terms.join('|')})\\b`);
}

export function identifiers() {
  return [
    { id: 'function', pattern: /[A-Za-z_]\w*(?=\s*\()/, kind: 'function' },
    { id: 'identifier', pattern: /[A-Za-z_]\w*/, kind: 'variable' },
    { id: 'operator', pattern: /[-+*/%=!<>?&|^~:]+/, kind: 'operator' },
    { id: 'punctuation', pattern: /[{}()[\],;.]/, kind: 'punctuation' },
  ];
}
