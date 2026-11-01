import { comments, quotes, words, identifiers } from './shared/c-family.js';

/** Java lexical starter. Text blocks are regions; Unicode-escape preprocessing,
 * contextual keyword disambiguation and template processors are not implemented.
 * @type {import('../index.js').Language} */
export default {
  id: 'java',
  rules: [
    ...comments(),
    { id: 'text-block', begin: /"""/, end: /"""/, kind: 'string', rules: [{ id: 'escape', pattern: /\\(?:\r\n|[^])/, kind: 'string' }] },
    ...quotes(),
    { id: 'annotation', pattern: /(@)([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)/, kind: 'plain', captures: { 1: 'punctuation', 2: 'type' } },
    { id: 'keyword', pattern: words('abstract assert break case catch class const continue default do else enum exports extends final finally for goto if implements import instanceof interface module native new non-sealed open opens package permits private protected provides public record requires return sealed static strictfp super switch synchronized this throw throws to transient transitive try uses var volatile when while with yield'), kind: 'keyword' },
    { id: 'type', pattern: words('boolean byte char double float int long short void'), kind: 'type' },
    { id: 'boolean', pattern: /\b(?:true|false)\b/, kind: 'boolean' },
    { id: 'constant', pattern: /\bnull\b/, kind: 'constant' },
    { id: 'number', pattern: /(?<![\w$.])(?:0[xX][\da-fA-F_]+(?:\.[\da-fA-F_]*)?(?:[pP][+-]?[\d_]+)?|0[bB][01_]+|(?:\d[\d_]*(?:\.[\d_]*)?|\.\d[\d_]*)(?:[eE][+-]?[\d_]+)?)[lLfFdD]?(?![\w$])/, kind: 'number' },
    ...identifiers(),
  ],
};
