import { quoted } from './shared/starter.js';
import { sectionHeader, assignmentKey } from './shared/config.js';
/** TOML lexical starter. Dotted keys/tables are colored, not resolved. */
export default { id: 'toml', rules: [
  { id: 'comment', pattern: /#[^\r\n]*/, kind: 'comment' },
  sectionHeader({ arrays: true }), assignmentKey({ toml: true }),
  { id: 'multi-basic', begin: /"""/, end: /"""/, kind: 'string', rules: [{ id: 'escape', pattern: /\\[^]/, kind: 'string' }] },
  { id: 'multi-literal', begin: /'''/, end: /'''/, kind: 'string' },
  quoted('basic', '"'), quoted('literal', "'", { escape: false }),
  { id: 'datetime', pattern: /\b(?:\d{4}-\d{2}-\d{2}(?:[Tt ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:[Zz]|[+-]\d{2}:\d{2})?)?|\d{2}:\d{2}:\d{2}(?:\.\d+)?)\b/, kind: 'constant' },
  { id: 'boolean', pattern: /\b(?:true|false)\b/, kind: 'boolean' },
  { id: 'number', pattern: /(?<![\w.])[+-]?(?:0x[\da-fA-F_]+|0o[0-7_]+|0b[01_]+|\d[\d_]*(?:\.\d[\d_]*)?(?:[eE][+-]?[\d_]+)?|inf|nan)(?!\w)/, kind: 'number' },
  { id: 'punctuation', pattern: /[\[\]{},.]/, kind: 'punctuation' },
] };
