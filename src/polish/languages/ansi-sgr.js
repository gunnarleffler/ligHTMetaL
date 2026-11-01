/**
 * Recognize complete semicolon-form SGR color/style sequences. Other controls
 * remain plain text. The ANSI-to-HTML adapter interprets recognized tokens.
 * @type {import('../index.js').Language}
 */
export default {
  id: 'ansi-sgr',
  rules: [{ id: 'sgr', pattern: /(?:\x1b\[|\x9b)[0-9;]*m/, kind: 'keyword' }],
};
