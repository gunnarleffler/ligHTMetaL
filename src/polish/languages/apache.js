import { quoted } from './shared/starter.js';
const variables = () => [{ id: 'variable', pattern: /\$\{[^}\r\n]+\}|%\{[^}\r\n]+\}/, kind: 'variable' }];
/** Apache httpd config: containers look XML-like but their arguments are not XML. */
export default { id: 'apache', aliases: ['apacheconf', 'httpd'], rules: [
  { id: 'comment', pattern: /^[ \t]*#[^\r\n]*/m, kind: 'comment' },
  { id: 'container', begin: /<\/?[A-Za-z][\w]*/, end: />|(?=\r|\n)/, kind: 'tag', contentKind: 'plain', rules: [quoted('double', '"'), quoted('single', "'"), ...variables()] },
  { ...quoted('double', '"'), rules: [{ id: 'escape', pattern: /\\[^]/, kind: 'string' }, ...variables()] },
  quoted('single', "'"), ...variables(),
  { id: 'directive', pattern: /^[ \t]*([A-Za-z][\w]*)(?=[ \t]|$)/m, kind: 'plain', captures: { 1: 'keyword' } },
  { id: 'continuation', pattern: /\\\r?\n/, kind: 'punctuation' },
] };
