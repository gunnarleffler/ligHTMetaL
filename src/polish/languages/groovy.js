import { comments } from './shared/c-family.js';
import { starter, quoted } from './shared/starter.js';
/** Groovy starter; GString expressions and ambiguous slashy strings are lexical. */
export default starter({
  id: 'groovy', comments: comments(),
  strings: [
    { id: 'dollar-slashy', begin: /\$\//, end: /\/\$/, kind: 'string', rules: [{ id: 'escape', pattern: /\$[\/$]/, kind: 'string' }] },
    { id: 'triple-single', begin: /'''/, end: /'''/, kind: 'string', rules: [{ id: 'escape', pattern: /\\[^]/, kind: 'string' }] },
    { id: 'triple-double', begin: /"""/, end: /"""/, kind: 'string', rules: [{ id: 'escape', pattern: /\\[^]/, kind: 'string' }] },
    quoted('single', "'"), quoted('double', '"'),
  ],
  before: [{ id: 'annotation', pattern: /@[A-Za-z_]\w*/, kind: 'type' }],
  keywords: 'abstract as assert break case catch class const continue def default do else enum extends final finally for goto if implements import in instanceof interface native new package private protected public return static strictfp super switch synchronized this throw throws trait transient try var void volatile while',
  types: 'boolean byte char double float int long short', constants: 'null', booleans: 'true false',
});
