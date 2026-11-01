import javascript from './javascript.js';
import { composeLanguage } from '../compose.js';

/**
 * TypeScript starter grammar, derived without mutating JavaScript.
 * Type names use lexical conventions (capitalized names), not symbol resolution.
 * Built-in type words and contextual modifiers may be overclassified in value
 * positions. Generics retain normal operator punctuation; JSX/TSX are separate,
 * unsupported modes. No attempt is made to parse arbitrary type expressions.
 * @type {import('../index.js').Language}
 */
const typescript = composeLanguage(javascript, {
  id: 'typescript', aliases: ['ts'],
  edits: [
    { op: 'insertBefore', target: 'keyword', rules: [
      { id: 'type-declaration', pattern: /\b(class|interface|type|enum|namespace)\s+([A-Za-z_$][\w$]*)/, kind: 'plain', captures: { 1: 'keyword', 2: 'type' } },
      { id: 'type-keyword', pattern: /(?<![\w$.])(?:abstract|accessor|asserts|declare|enum|global|implements|infer|interface|is|keyof|module|namespace|override|private|protected|public|readonly|require|satisfies|type|unique|using)\b/, kind: 'keyword' },
      { id: 'builtin-type', pattern: /(?<![\w$.])(?:any|bigint|boolean|intrinsic|never|number|object|string|symbol|unknown|void)\b/, kind: 'type' },
      { id: 'decorator', pattern: /(@)([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)/, kind: 'plain', captures: { 1: 'punctuation', 2: 'function' } },
      { id: 'generic-function', pattern: /[A-Za-z_$][\w$]*(?=\s*<[^<>\r\n;{}]*>\s*\()/, kind: 'function' },
    ] },
    { op: 'insertBefore', target: 'identifier', rules: [
      { id: 'type-name', pattern: /(?<![\w$])[A-Z][\w$]*\b/, kind: 'type' },
    ] },
  ],
});
export default typescript;
