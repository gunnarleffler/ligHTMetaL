import c from './c.js';
import { composeLanguage } from '../compose.js';
import { words } from './shared/c-family.js';

/** @param {import('../index.js').ScannerContext} context */
function rawString({ source, start, end }) {
  const opening = /(?<![\w$])(?:u8|[LuU])?R"([^\x00-\x20()\\\x7f]{0,16})\(/g;
  opening.lastIndex = start;
  const match = opening.exec(source);
  if (!match || match.index >= end || opening.lastIndex > end) return null;
  const delimiter = `)${match[1]}"`;
  const close = source.indexOf(delimiter, opening.lastIndex);
  return { start: match.index, end: close < 0 ? end : Math.min(close + delimiter.length, end) };
}

/** C++ lexical starter; templates/operators are not parsed semantically.
 * @type {import('../index.js').Language} */
export default composeLanguage(c, {
  id: 'cpp', aliases: ['cxx', 'c++'],
  edits: [
    { op: 'insertBefore', target: 'quotes', rules: [{ id: 'raw-string', scan: rawString, kind: 'string' }] },
    { op: 'replace', target: 'keyword', rule: { id: 'keyword', pattern: words('alignas alignof asm auto break case catch class concept const consteval constexpr constinit const_cast continue co_await co_return co_yield decltype default delete do dynamic_cast else enum explicit export extern for friend goto if inline mutable namespace new noexcept operator private protected public register reinterpret_cast requires return sizeof static static_assert static_cast struct switch template this thread_local throw try typedef typeid typename union using virtual volatile while and and_eq bitand bitor compl not not_eq or or_eq xor xor_eq'), kind: 'keyword' } },
    { op: 'replace', target: 'type', rule: { id: 'type', pattern: words('bool char char8_t char16_t char32_t double float int long short signed unsigned void wchar_t'), kind: 'type' } },
    { op: 'replace', target: 'number', rule: { id: 'number', pattern: /(?<![\w.])(?:0[xX][\da-fA-F](?:'?[\da-fA-F])*(?:\.[\da-fA-F']*)?(?:[pP][+-]?\d[\d']*)?|0[bB][01](?:'?[01])*|(?:\d(?:'?\d)*(?:\.[\d']*)?|\.\d[\d']*)(?:[eE][+-]?\d[\d']*)?)[uUlLfFzZ]*(?!\w)/, kind: 'number' } },
  ],
});
