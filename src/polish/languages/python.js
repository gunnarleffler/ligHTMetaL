/**
 * Lexical Python starter grammar. Prefixes are recognized; f-string contents
 * remain strings (expression interpolation is not implemented yet).
 * @type {import('../index.js').Language}
 */
export default {
  id: 'python', aliases: ['py'],
  rules: [
    { id: 'comment', pattern: /#[^\r\n]*/, kind: 'comment' },
    { id: 'triple-double', begin: /(?:\b(?:[rRuUbBfF]|[rR][fFbB]|[fFbB][rR]))?"""/, end: /"""/, kind: 'string', rules: [{ id: 'escape', pattern: /\\[^]/, kind: 'string' }] },
    { id: 'triple-single', begin: /(?:\b(?:[rRuUbBfF]|[rR][fFbB]|[fFbB][rR]))?'''/, end: /'''/, kind: 'string', rules: [{ id: 'escape', pattern: /\\[^]/, kind: 'string' }] },
    { id: 'double', begin: /(?:\b(?:[rRuUbBfF]|[rR][fFbB]|[fFbB][rR]))?"/, end: /"|(?=\r|\n)/, kind: 'string', rules: [{ id: 'escape', pattern: /\\(?:\r\n|[^])/, kind: 'string' }] },
    { id: 'single', begin: /(?:\b(?:[rRuUbBfF]|[rR][fFbB]|[fFbB][rR]))?'/, end: /'|(?=\r|\n)/, kind: 'string', rules: [{ id: 'escape', pattern: /\\(?:\r\n|[^])/, kind: 'string' }] },
    { id: 'keyword', pattern: /\b(?:and|as|assert|async|await|break|case|class|continue|def|del|elif|else|except|finally|for|from|global|if|import|in|is|lambda|match|nonlocal|not|or|pass|raise|return|try|while|with|yield)\b/, kind: 'keyword' },
    { id: 'boolean', pattern: /\b(?:True|False)\b/, kind: 'boolean' },
    { id: 'none', pattern: /\bNone\b/, kind: 'constant' },
    { id: 'number', pattern: /\b(?:0[xX][\da-fA-F_]+|0[bB][01_]+|0[oO][0-7_]+|\d[\d_]*(?:\.[\d_]*)?(?:[eE][+-]?\d[\d_]*)?j?)\b/, kind: 'number' },
    { id: 'function', pattern: /[A-Za-z_]\w*(?=\s*\()/, kind: 'function' },
    { id: 'identifier', pattern: /[A-Za-z_]\w*/, kind: 'variable' },
    { id: 'operator', pattern: /[-+*/%=!<>:&|^~]+/, kind: 'operator' },
    { id: 'punctuation', pattern: /[{}()[\],;.]/, kind: 'punctuation' },
  ],
};
