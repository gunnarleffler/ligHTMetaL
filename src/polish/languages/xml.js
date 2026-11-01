import { quoted } from './shared/starter.js';
const strings = () => [quoted('double', '"', { escape: false, multiline: true }), quoted('single', "'", { escape: false, multiline: true })];
const comment = () => ({ id: 'comment', begin: /<!--/, end: /-->/, kind: 'comment' });
/** XML source only: no DTD evaluation, entity expansion or HTML raw-text rules. */
export default { id: 'xml', rules: [
  comment(),
  { id: 'cdata', begin: /<!\[CDATA\[/, end: /\]\]>/, kind: 'string' },
  { id: 'doctype', begin: /<!DOCTYPE\b/, end: />/, kind: 'tag', rules: [
    ...strings(), { id: 'subset', begin: /\[/, end: /\]/, kind: 'tag', rules: [comment(), ...strings()] },
  ] },
  { id: 'processing', begin: /<\?/, end: /\?>/, kind: 'tag', rules: strings() },
  { id: 'tag', begin: /<\/?[A-Za-z_:][\w:.-]*/, end: /\/?>/, kind: 'tag', contentKind: 'plain', rules: [
    ...strings(), { id: 'attribute', pattern: /[A-Za-z_:][\w:.-]*(?=\s*=)/, kind: 'attribute' }, { id: 'equals', pattern: /=/, kind: 'operator' },
  ] },
  { id: 'entity', pattern: /&(?:#[0-9]+|#x[\da-fA-F]+|[A-Za-z_:][\w:.-]*);/, kind: 'constant' },
] };
