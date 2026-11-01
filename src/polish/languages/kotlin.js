import { comments, quotes } from './shared/c-family.js';
import { starter } from './shared/starter.js';
import { nestedCommentRepository } from './shared/nested-comments.js';

/** Kotlin starter; interpolation regions balance braces but do not resolve types. */
export default starter({
  id: 'kotlin', aliases: ['kt'],
  repository: { ...nestedCommentRepository(), interpolation: [
    { id: 'expression', begin: /\$\{/, end: /\}/, kind: 'punctuation', contentKind: 'plain', rules: '$self' },
    { id: 'interpolated-name', pattern: /\$[A-Za-z_]\w*/, kind: 'variable' },
  ] },
  comments: [comments()[0], { id: 'comments', include: 'blockComments' }],
  strings: [
    { id: 'raw-string', begin: /"""/, end: /"""/, kind: 'string', rules: [{ id: 'interpolation', include: 'interpolation' }] },
    { ...quotes()[0], rules: [...quotes()[0].rules, { id: 'interpolation', include: 'interpolation' }] }, quotes()[1],
  ],
  before: [{ id: 'annotation', pattern: /@[A-Za-z_]\w*(?::[A-Za-z_]\w*)?/, kind: 'type' }, { id: 'escaped-name', pattern: /`[^`\r\n]*`/, kind: 'variable' }],
  keywords: 'abstract actual annotation as break by catch class companion const constructor continue crossinline data delegate do dynamic else enum expect external field file final finally for fun get if import in infix init inline inner interface internal is lateinit noinline object open operator out override package param private property protected public receiver reified return sealed set setparam super suspend tailrec this throw try typealias typeof val var vararg when where while',
  types: 'Any Boolean Byte Char Double Float Int Long Nothing Number Short String Unit', constants: 'null', booleans: 'true false',
  after: [{ id: 'brace', begin: /\{/, end: /\}/, kind: 'punctuation', contentKind: 'plain', rules: '$self' }],
});
