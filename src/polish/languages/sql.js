/** Generic SQL lexical starter; not a dialect parser or validator. */
export default {
  id: 'sql',
  rules: [
    { id: 'line-comment', pattern: /--[^\r\n]*/, kind: 'comment' },
    { id: 'block-comment', begin: /\/\*/, end: /\*\//, kind: 'comment' },
    { id: 'string', begin: /'/, end: /'(?!')/, kind: 'string', rules: [
      { id: 'doubled-quote', pattern: /''/, kind: 'string' },
    ] },
    { id: 'identifier-quoted', begin: /"/, end: /"(?!")/, kind: 'variable', rules: [
      { id: 'doubled-quote', pattern: /""/, kind: 'variable' },
    ] },
    { id: 'boolean', pattern: /\b(?:true|false)\b/i, kind: 'boolean' },
    { id: 'constant', pattern: /\b(?:null|current_date|current_time|current_timestamp)\b/i, kind: 'constant' },
    { id: 'type', pattern: /\b(?:bigint|binary|bit|blob|boolean|char|character|clob|date|decimal|double|float|int|integer|interval|national|nchar|numeric|real|smallint|text|time|timestamp|varbinary|varchar|varying)\b/i, kind: 'type' },
    { id: 'keyword', pattern: /\b(?:all|alter|and|any|as|asc|begin|between|by|call|cascade|case|cast|check|collate|column|commit|constraint|create|cross|database|default|delete|desc|distinct|drop|else|end|escape|except|exists|explain|fetch|for|foreign|from|full|grant|group|having|in|index|inner|insert|intersect|into|is|join|key|left|like|limit|natural|not|offset|on|only|or|order|outer|over|partition|primary|procedure|recursive|references|returning|revoke|right|rollback|row|rows|schema|select|set|some|table|then|transaction|trigger|truncate|union|unique|update|using|values|view|when|where|window|with)\b/i, kind: 'keyword' },
    { id: 'number', pattern: /(?<![\w.])(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?(?!\w)/i, kind: 'number' },
    { id: 'function', pattern: /\b[A-Za-z_][\w$]*(?=\s*\()/, kind: 'function' },
    { id: 'identifier', pattern: /\b[A-Za-z_][\w$]*/, kind: 'variable' },
    { id: 'operator', pattern: /<>|!=|<=|>=|\|\||[-+*/%=<>]/, kind: 'operator' },
    { id: 'punctuation', pattern: /[.,;()]/, kind: 'punctuation' },
  ],
};
