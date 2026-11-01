import { comments, quotes, words, identifiers } from './shared/c-family.js';

/** Go lexical starter. Raw strings do not interpret backslash escapes. Unicode
 * identifiers, type-parameter semantics and automatic semicolons are not parsed.
 * @type {import('../index.js').Language} */
export default {
  id: 'go', aliases: ['golang'],
  rules: [
    ...comments(),
    { id: 'raw-string', begin: /`/, end: /`/, kind: 'string' },
    ...quotes(),
    { id: 'keyword', pattern: words('break case chan const continue default defer else fallthrough for func go goto if import interface map package range return select struct switch type var'), kind: 'keyword' },
    { id: 'type', pattern: words('any bool byte comparable complex64 complex128 error float32 float64 int int8 int16 int32 int64 rune string uint uint8 uint16 uint32 uint64 uintptr'), kind: 'type' },
    { id: 'boolean', pattern: /\b(?:true|false)\b/, kind: 'boolean' },
    { id: 'constant', pattern: /\bnil\b/, kind: 'constant' },
    { id: 'builtin', pattern: words('append cap clear close complex copy delete imag len make max min new panic print println real recover'), kind: 'function' },
    { id: 'number', pattern: /(?<![\w.])(?:0[xX][\da-fA-F_]+(?:\.[\da-fA-F_]*)?(?:[pP][+-]?[\d_]+)?|0[bB][01_]+|0[oO][0-7_]+|(?:\d[\d_]*(?:\.[\d_]*)?|\.\d[\d_]*)(?:[eE][+-]?[\d_]+)?)i?(?!\w)/, kind: 'number' },
    ...identifiers(),
  ],
};
