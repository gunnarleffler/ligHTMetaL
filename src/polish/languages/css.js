/** @type {import('../index.js').Language} */
export default {
  id: 'css',
  rules: [
    { id: 'comment', begin: /\/\*/, end: /\*\//, kind: 'comment' },
    { id: 'double', begin: /"/, end: /"|(?=\r|\n)/, kind: 'string', rules: [{ id: 'escape', pattern: /\\(?:\r\n|[^])/, kind: 'string' }] },
    { id: 'single', begin: /'/, end: /'|(?=\r|\n)/, kind: 'string', rules: [{ id: 'escape', pattern: /\\(?:\r\n|[^])/, kind: 'string' }] },
    { id: 'at-rule', pattern: /@[\w-]+/, kind: 'keyword' },
    { id: 'property', pattern: /(?:--)?[a-zA-Z_-][\w-]*(?=\s*:)/, kind: 'property' },
    { id: 'important', pattern: /!important\b/i, kind: 'keyword' },
    { id: 'hex', pattern: /#[\da-fA-F]{3,8}\b/, kind: 'constant' },
    { id: 'number', pattern: /(?<![\w-])-?(?:\d*\.\d+|\d+)(?:%|[a-zA-Z]+)?/, kind: 'number' },
    { id: 'function', pattern: /[a-zA-Z_-][\w-]*(?=\()/, kind: 'function' },
    { id: 'punctuation', pattern: /[{}():;,]/, kind: 'punctuation' },
  ],
};
