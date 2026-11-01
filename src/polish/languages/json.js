/**
 * Lexical JSON highlighting, not JSON validation.
 * Property names use a following-colon heuristic. Unterminated strings consume
 * through the line end so their contents are not mistaken for other tokens.
 * @type {import('../index.js').Language}
 */
export default {
  id: 'json',
  rules: [
    { id: 'property', pattern: /"(?:\\[^\r\n]|[^"\\\r\n])*"(?=[ \t\r\n]*:)/, kind: 'property' },
    { id: 'string', pattern: /"(?:\\[^\r\n]|[^"\\\r\n])*(?:"|\\?(?=\r|\n|$))/, kind: 'string' },
    { id: 'number', pattern: /(?<![\w.+-])-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?(?![\w.+-])/, kind: 'number' },
    { id: 'boolean', pattern: /\b(?:true|false)\b/, kind: 'boolean' },
    { id: 'null', pattern: /\bnull\b/, kind: 'constant' },
    { id: 'punctuation', pattern: /[{}\[\],:]/, kind: 'punctuation' },
  ],
};
