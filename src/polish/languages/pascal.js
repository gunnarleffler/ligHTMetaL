import { starter, quoted } from './shared/starter.js';
/** Pascal starter; mixed nested comment styles use local repository recursion. */
export default starter({
  id: 'pascal', insensitive: true,
  repository: { comments: [
    { id: 'curly-comment', begin: /\{/, end: /\}/, kind: 'comment', rules: [{ id: 'nested', include: 'comments' }] },
    { id: 'paren-comment', begin: /\(\*/, end: /\*\)/, kind: 'comment', rules: [{ id: 'nested', include: 'comments' }] },
  ] },
  comments: [{ id: 'comments', include: 'comments' }, { id: 'line-comment', pattern: /\/\/[^\r\n]*/, kind: 'comment' }],
  strings: [quoted('single', "'", { doubled: true, escape: false })],
  before: [{ id: 'character-code', pattern: /#(?:\$[\da-fA-F]+|\d+)/, kind: 'string' }],
  keywords: 'and array asm begin case const constructor destructor div do downto else end file for function goto if implementation in inherited inline interface label mod not object of operator or packed procedure program record repeat set shl shr then to type unit until uses var while with xor',
  types: 'Boolean Byte Char Integer LongInt Pointer Real ShortInt String Word', constants: 'nil', booleans: 'True False',
  number: /(?:\$[\da-fA-F]+|%[01]+|\b\d+(?:\.(?!\.)\d+)?(?:[eE][+-]?\d+)?)/,
});
