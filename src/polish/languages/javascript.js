/**
 * Lexical JavaScript starter grammar. Regex literals use a conservative
 * expression-prefix heuristic, not parser-level disambiguation. JSX is not
 * supported. Template interpolation uses recursive regions for balanced braces.
 * @type {import('../index.js').Language}
 */
export default {
  id: 'javascript', aliases: ['js'],
  repository: {
    escapes: [{ id: 'escape', pattern: /\\(?:\r\n|[^])/, kind: 'string' }],
  },
  rules: [
    { id: 'line-comment', pattern: /\/\/[^\r\n]*/, kind: 'comment' },
    { id: 'block-comment', begin: /\/\*/, end: /\*\//, kind: 'comment' },
    { id: 'single-string', begin: /'/, end: /'|(?=\r|\n)/, kind: 'string', rules: [
      { id: 'escapes', include: 'escapes' },
    ] },
    { id: 'double-string', begin: /"/, end: /"|(?=\r|\n)/, kind: 'string', rules: [
      { id: 'escapes', include: 'escapes' },
    ] },
    { id: 'template', begin: /`/, end: /`/, kind: 'string', rules: [
      { id: 'escapes', include: 'escapes' },
      { id: 'interpolation', begin: /\$\{/, end: /\}/, kind: 'punctuation', contentKind: 'plain', rules: '$self' },
    ] },
    { id: 'brace', begin: /\{/, end: /\}/, kind: 'punctuation', contentKind: 'plain', rules: '$self' },
    { id: 'regexp', pattern: /(?<=(?:^|[=(:,!&|?;\[{}])\s*|\b(?:return|throw|yield)\s+)\/(?![/*])(?:\\[^\r\n]|\[(?:\\[^\r\n]|[^\]\\\r\n])*\]|[^/\\[\r\n])+\/[dgimsuvy]*/, kind: 'string' },
    { id: 'keyword', pattern: /\b(?:as|async|await|break|case|catch|class|const|continue|debugger|default|delete|do|else|export|extends|finally|for|from|function|get|if|import|in|instanceof|let|new|of|return|set|static|super|switch|this|throw|try|typeof|var|void|while|with|yield)\b/, kind: 'keyword' },
    { id: 'boolean', pattern: /\b(?:true|false)\b/, kind: 'boolean' },
    { id: 'constant', pattern: /\b(?:null|undefined|NaN|Infinity)\b/, kind: 'constant' },
    { id: 'number', pattern: /(?<![\w$])(?:0[xX][\da-fA-F](?:_?[\da-fA-F])*n?|0[bB][01](?:_?[01])*n?|0[oO][0-7](?:_?[0-7])*n?|\d(?:_?\d)*n|(?:\d(?:_?\d)*(?:\.(?:\d(?:_?\d)*)?)?|\.\d(?:_?\d)*)(?:[eE][+-]?\d(?:_?\d)*)?)(?![\w$])/, kind: 'number' },
    { id: 'function', pattern: /[A-Za-z_$][\w$]*(?=\s*\()/, kind: 'function' },
    { id: 'identifier', pattern: /[A-Za-z_$][\w$]*/, kind: 'variable' },
    { id: 'operator', pattern: /[+*/%=!<>?&|^~:-]+/, kind: 'operator' },
    { id: 'punctuation', pattern: /[()[\],;.}]/, kind: 'punctuation' },
  ],
};
