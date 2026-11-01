import { starter, quoted } from './shared/starter.js';
/** Julia starter; macro strings/interpolation are not semantically expanded. */
export default starter({
  id: 'julia', aliases: ['jl'],
  repository: { blockComments: [{ id: 'block-comment', begin: /#=/, end: /=#/, kind: 'comment', rules: [{ id: 'nested', include: 'blockComments' }] }] },
  comments: [{ id: 'block-comments', include: 'blockComments' }, { id: 'comment', pattern: /#[^\r\n]*/, kind: 'comment' }],
  strings: [{ id: 'triple', begin: /(?:[A-Za-z_]\w*)?"""/, end: /"""/, kind: 'string', rules: [{ id: 'escape', pattern: /\\[^]/, kind: 'string' }] }, { ...quoted('double', '"'), begin: /(?:[A-Za-z_]\w*)?"/ }, { id: 'character', pattern: /'(?:\\[^]|[^'\\\r\n])'/u, kind: 'string' }, quoted('command', '`', { multiline: true })],
  before: [{ id: 'macro', pattern: /@[A-Za-z_]\w*/, kind: 'function' }],
  keywords: 'abstract baremodule begin break catch const continue do else elseif end export finally for function global if import let local macro module mutable primitive public quote return struct try type using where while',
  types: 'Any Bool Char Complex Float16 Float32 Float64 Int Int8 Int16 Int32 Int64 Int128 Nothing Number String Symbol UInt UInt8 UInt16 UInt32 UInt64 UInt128', constants: 'nothing missing Inf NaN', booleans: 'true false',
});
