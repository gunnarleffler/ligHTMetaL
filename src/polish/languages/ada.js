import { starter, quoted } from './shared/starter.js';
/** Ada starter; apostrophes distinguish character literals from attributes. */
export default starter({
  id: 'ada', insensitive: true,
  comments: [{ id: 'comment', pattern: /--[^\r\n]*/, kind: 'comment' }],
  strings: [quoted('double', '"', { doubled: true, escape: false }), { id: 'character', pattern: /'[^\r\n]'/u, kind: 'string' }],
  before: [{ id: 'attribute', pattern: /'[A-Za-z_]\w*/, kind: 'property' }],
  keywords: 'abort abs abstract accept access aliased all and array at begin body case constant declare delay delta digits do else elsif end entry exception exit for function generic goto if in interface is limited loop mod new not null of or others out overriding package parallel pragma private procedure protected raise range record rem renames requeue return reverse select separate some subtype synchronized tagged task terminate then type until use when while with xor',
  types: 'Boolean Character Float Integer Long_Float Long_Integer Natural Positive String Wide_Character Wide_String', booleans: 'True False',
  number: /\b(?:\d[\d_]*#[\da-fA-F_.]+#(?:[eE][+-]?[\d_]+)?|\d[\d_]*(?:\.(?!\.)\d[\d_]*)?(?:[eE][+-]?[\d_]+)?)(?!\w)/,
});
