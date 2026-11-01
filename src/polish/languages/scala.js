import { comments, quotes } from './shared/c-family.js';
import { starter } from './shared/starter.js';
import { nestedCommentRepository } from './shared/nested-comments.js';
/** Scala 2/3 lexical vocabulary; interpolator bodies remain strings. */
export default starter({
  id: 'scala', repository: nestedCommentRepository(),
  comments: [comments()[0], { id: 'comments', include: 'blockComments' }],
  strings: [{ id: 'triple-string', begin: /(?:[A-Za-z_]\w*)?"""/, end: /"""/, kind: 'string' }, { ...quotes()[0], begin: /(?:[A-Za-z_]\w*)?"/ }, quotes()[1]],
  before: [{ id: 'annotation', pattern: /@[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*/, kind: 'type' }, { id: 'escaped-name', pattern: /`[^`\r\n]*`/, kind: 'variable' }],
  keywords: 'abstract case catch class def derives do else end enum export extends extension final finally for forSome given if implicit import infix inline lazy match new object opaque open override package private protected return sealed super then this throw trait transparent try type using val var while with yield',
  types: 'Any AnyRef AnyVal Boolean Byte Char Double Float Int Long Nothing Null Short String Unit', constants: 'null', booleans: 'true false',
});
