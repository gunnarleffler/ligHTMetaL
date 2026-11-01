import { comments, quotes, words, identifiers } from './shared/c-family.js';
import { nestedCommentRepository } from './shared/nested-comments.js';

function rawString({ source, start, end }) {
  const pattern = /(?<![\w$])(?:br|cr|r)(#{0,255})"/g;
  pattern.lastIndex = start;
  const match = pattern.exec(source);
  if (!match || match.index >= end || pattern.lastIndex > end) return null;
  const closing = '"' + match[1];
  const index = source.indexOf(closing, pattern.lastIndex);
  return { start: match.index, end: index < 0 ? end : Math.min(end, index + closing.length) };
}
/** Rust lexical subset; attributes/macros and lifetimes are lexical, not resolved.
 * @type {import('../index.js').Language} */
export default {
  id: 'rust', aliases: ['rs'], repository: nestedCommentRepository(),
  rules: [
    comments()[0], { id: 'comments', include: 'blockComments' },
    { id: 'raw-string', scan: rawString, kind: 'string' },
    { ...quotes()[0], begin: /(?:b|c)?"/ },
    { id: 'character', pattern: /b?'(?:\\(?:u\{[\da-fA-F_]+\}|x[\da-fA-F]{2}|[^])|[^'\\\r\n])'/u, kind: 'string' },
    { id: 'lifetime', pattern: /'[A-Za-z_]\w*/, kind: 'variable' },
    { id: 'macro', pattern: /([A-Za-z_]\w*)(!)(?=\s*[([{])/, kind: 'plain', captures: { 1: 'function', 2: 'punctuation' } },
    { id: 'keyword', pattern: words('as async await break const continue crate dyn else enum extern fn for if impl in let loop match mod move mut pub ref return self Self static struct super trait type unsafe use where while abstract become box do final macro override priv typeof unsized virtual yield try gen'), kind: 'keyword' },
    { id: 'type', pattern: words('bool char str i8 i16 i32 i64 i128 isize u8 u16 u32 u64 u128 usize f32 f64'), kind: 'type' },
    { id: 'boolean', pattern: /\b(?:true|false)\b/, kind: 'boolean' },
    { id: 'number', pattern: /(?<![\w.])(?:0x[\da-fA-F_]+|0b[01_]+|0o[0-7_]+|\d[\d_]*(?:\.(?!\.)\d[\d_]*)?(?:[eE][+-]?[\d_]+)?)(?:[iu](?:8|16|32|64|128|size)|f(?:32|64))?(?!\w)/, kind: 'number' },
    ...identifiers(),
  ],
};
