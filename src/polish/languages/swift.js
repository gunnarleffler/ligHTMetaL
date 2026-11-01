import { comments, quotes, words, identifiers } from './shared/c-family.js';
import { nestedCommentRepository } from './shared/nested-comments.js';

function extendedString({ source, start, end }) {
  const opening = /(?<![\w$])(#+)(?:"""|")|"""/g;
  opening.lastIndex = start;
  const match = opening.exec(source);
  if (!match || match.index >= end || opening.lastIndex > end) return null;
  const hashes = match[1] ?? '';
  const multiline = match[0].endsWith('"""');
  const closing = (multiline ? '"""' : '"') + hashes;
  const escape = '\\' + hashes;
  let cursor = opening.lastIndex;
  while (cursor < end) {
    if (source.startsWith(escape, cursor)) { cursor = Math.min(end, cursor + escape.length + 1); continue; }
    if (source.startsWith(closing, cursor) && cursor + closing.length <= end) return { start: match.index, end: cursor + closing.length };
    if (!multiline && /[\r\n]/.test(source[cursor])) return { start: match.index, end: cursor };
    cursor++;
  }
  return { start: match.index, end };
}
/** Swift starter; interpolation expressions remain string-colored.
 * @type {import('../index.js').Language} */
export default {
  id: 'swift', repository: nestedCommentRepository(),
  rules: [
    comments()[0], { id: 'comments', include: 'blockComments' },
    { id: 'extended-string', scan: extendedString, kind: 'string' }, quotes()[0],
    { id: 'escaped-identifier', pattern: /`[^`\r\n]*`/, kind: 'variable' },
    { id: 'attribute', pattern: /(@)([A-Za-z_]\w*)/, kind: 'plain', captures: { 1: 'punctuation', 2: 'type' } },
    { id: 'keyword', pattern: words('actor any as associatedtype async await borrowing break case catch class consume consuming continue convenience copy default defer deinit didSet distributed do dynamic each else enum extension fallthrough fileprivate final for func get guard if import in indirect infix init inout internal is isolated lazy let macro mutating nonisolated nonmutating open operator optional override package postfix precedencegroup prefix private protocol public repeat required rethrows return self Self set some static struct subscript super switch throws throw try typealias unowned var weak where while willSet'), kind: 'keyword' },
    { id: 'type', pattern: words('Any AnyObject Bool Character Double Float Int Int8 Int16 Int32 Int64 String UInt UInt8 UInt16 UInt32 UInt64 Void Never'), kind: 'type' },
    { id: 'boolean', pattern: /\b(?:true|false)\b/, kind: 'boolean' },
    { id: 'constant', pattern: /\bnil\b/, kind: 'constant' },
    { id: 'number', pattern: /\b(?:0x[\da-fA-F_]+(?:\.[\da-fA-F_]*)?(?:[pP][+-]?[\d_]+)?|0b[01_]+|0o[0-7_]+|\d[\d_]*(?:\.\d[\d_]*)?(?:[eE][+-]?[\d_]+)?)\b/, kind: 'number' },
    ...identifiers(),
  ],
};
