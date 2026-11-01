import { quoted } from './shared/starter.js';
const variables = () => [{ id: 'variable', pattern: /\$(?:\{[A-Za-z_]\w*\}|[A-Za-z_]\w*|\d+)/, kind: 'variable' }];
/** nginx directives/blocks, not nginx configuration validation or shell syntax. */
export default { id: 'nginx', rules: [
  { id: 'comment', pattern: /#[^\r\n]*/, kind: 'comment' },
  ...['"', "'"].map((quote, index) => ({ ...quoted('quote-' + index, quote), rules: [{ id: 'escape', pattern: /\\[^]/, kind: 'string' }, ...variables()] })),
  ...variables(),
  { id: 'directive', pattern: /(?:^|(?<=[;{}]))[ \t]*([A-Za-z_]\w*)(?=[ \t{;])/m, kind: 'plain', captures: { 1: 'keyword' } },
  { id: 'escape', pattern: /\\[^]/, kind: 'string' },
  { id: 'number', pattern: /(?<![\w./:])\d+(?:\.\d+)?[kKmMgGsShHdDwW]?(?![\w./:])/, kind: 'number' },
  { id: 'punctuation', pattern: /[{};]/, kind: 'punctuation' },
] };
