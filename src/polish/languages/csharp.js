import { comments, quotes, words, identifiers } from './shared/c-family.js';

/** @param {import('../index.js').ScannerContext} context */
function rawString({ source, start, end }) {
  const opening = /\$*"{3,}/g;
  opening.lastIndex = start;
  const match = opening.exec(source);
  if (!match || match.index >= end || opening.lastIndex > end) return null;
  const count = match[0].length - (match[0].match(/^\$*/)?.[0].length ?? 0);
  const close = source.indexOf('"'.repeat(count), opening.lastIndex);
  return { start: match.index, end: close < 0 ? end : Math.min(close + count, end) };
}

/** C# lexical starter. Raw/verbatim strings are supported; interpolation bodies
 * remain string-colored and complex interpolations are not parsed. Contextual
 * keywords may be overclassified. No compiler/preprocessor evaluation.
 * @type {import('../index.js').Language} */
export default {
  id: 'csharp', aliases: ['cs', 'c#'],
  rules: [
    ...comments(),
    { id: 'directive', pattern: /^[ \t]*#[^\r\n]*/m, kind: 'keyword' },
    { id: 'verbatim-string', begin: /(?:\$@|@\$|@)"/, end: /"(?!")/, kind: 'string', rules: [{ id: 'doubled-quote', pattern: /""/, kind: 'string' }] },
    { id: 'raw-string', scan: rawString, kind: 'string' },
    { ...quotes()[0], begin: /\$?"/ },
    quotes()[1],
    { id: 'escaped-identifier', pattern: /@[A-Za-z_]\w*/, kind: 'variable' },
    { id: 'keyword', pattern: words('abstract add alias and as ascending async await base break by case catch checked class const continue default delegate descending do else enum equals event explicit extern file finally fixed for foreach from get global goto group if implicit in init interface internal into is join let lock managed nameof namespace new not notnull on operator or orderby out override params partial private protected public readonly record ref remove required return scoped sealed select set sizeof stackalloc static struct switch this throw try unchecked unmanaged unsafe using value var virtual volatile when where while with yield'), kind: 'keyword' },
    { id: 'type', pattern: words('bool byte char decimal double dynamic float int long nint nuint object sbyte short string uint ulong ushort void'), kind: 'type' },
    { id: 'boolean', pattern: /\b(?:true|false)\b/, kind: 'boolean' },
    { id: 'constant', pattern: /\bnull\b/, kind: 'constant' },
    { id: 'number', pattern: /(?<![\w.])(?:0[xX][\da-fA-F_]+|0[bB][01_]+|(?:\d[\d_]*(?:\.[\d_]*)?|\.\d[\d_]*)(?:[eE][+-]?[\d_]+)?)[uUlLfFdDmM]*(?!\w)/, kind: 'number' },
    ...identifiers(),
  ],
};
