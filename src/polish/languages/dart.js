import { comments, quotes } from './shared/c-family.js';
import { starter } from './shared/starter.js';
import { nestedCommentRepository } from './shared/nested-comments.js';
/** Dart starter; interpolation remains string-colored, not expression-parsed. */
export default starter({
  id: 'dart', repository: nestedCommentRepository(),
  comments: [comments()[0], { id: 'comments', include: 'blockComments' }],
  strings: [
    { id: 'raw-triple-double', begin: /r"""/, end: /"""/, kind: 'string' },
    { id: 'raw-triple-single', begin: /r'''/, end: /'''/, kind: 'string' },
    { id: 'triple-double', begin: /"""/, end: /"""/, kind: 'string', rules: [{ id: 'escape', pattern: /\\[^]/, kind: 'string' }] },
    { id: 'triple-single', begin: /'''/, end: /'''/, kind: 'string', rules: [{ id: 'escape', pattern: /\\[^]/, kind: 'string' }] },
    { id: 'raw-double', begin: /r"/, end: /"|(?=\r|\n)/, kind: 'string' },
    { id: 'raw-single', begin: /r'/, end: /'|(?=\r|\n)/, kind: 'string' }, ...quotes(),
  ],
  before: [{ id: 'annotation', pattern: /@[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*/, kind: 'type' }],
  keywords: 'abstract as assert async await base break case catch class const continue covariant default deferred do else enum export extends extension external factory final finally for get hide if implements import in interface is late library mixin new of on operator part required rethrow return sealed set show static super switch sync this throw try typedef var when while with yield',
  types: 'bool double dynamic int Never Null num Object String void', constants: 'null', booleans: 'true false',
});
