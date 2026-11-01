import { comments, quotes, words, identifiers } from './shared/c-family.js';

/** C lexical starter: preprocessor directives are regions, not evaluated macros.
 * @type {import('../index.js').Language} */
export default {
  id: 'c',
  repository: { comments: comments(), quotes: quotes('(?:u8|[LuU])?') },
  rules: [
    { id: 'comments', include: 'comments' },
    { id: 'preprocessor', begin: /^[ \t]*#[ \t]*[A-Za-z_]\w*/m, end: /(?=\r?$)/m, kind: 'keyword', contentKind: 'plain', rules: [
      { id: 'continuation', pattern: /\\\r?\n/, kind: 'punctuation' },
      { id: 'comments', include: 'comments' },
      { id: 'quotes', include: 'quotes' },
      { id: 'header', pattern: /<[^>\r\n]*>/, kind: 'string' },
    ] },
    { id: 'quotes', include: 'quotes' },
    { id: 'keyword', pattern: words('alignas alignof auto break case const constexpr continue default do else enum extern for goto if inline register restrict return sizeof static static_assert struct switch thread_local typedef typeof typeof_unqual union volatile while _Alignas _Alignof _Atomic _Generic _Noreturn _Static_assert _Thread_local'), kind: 'keyword' },
    { id: 'type', pattern: words('bool char double float int long short signed unsigned void _Bool _Complex _Imaginary'), kind: 'type' },
    { id: 'boolean', pattern: /\b(?:true|false)\b/, kind: 'boolean' },
    { id: 'constant', pattern: /\b(?:NULL|nullptr)\b/, kind: 'constant' },
    { id: 'number', pattern: /(?<![\w.])(?:0[xX][\da-fA-F]+(?:\.[\da-fA-F]*)?(?:[pP][+-]?\d+)?|0[bB][01]+|(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)[uUlLfF]*(?!\w)/, kind: 'number' },
    ...identifiers(),
  ],
};
