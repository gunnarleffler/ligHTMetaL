import { quoted } from './shared/starter.js';
const variables = () => [{ id: 'variable', pattern: /\$(?:\{[^}\r\n]*\}|[A-Za-z_]\w*)/, kind: 'variable' }];
/** Common dotenv syntax, not an executable shell or a particular loader spec. */
export default { id: 'dotenv', aliases: ['env'], rules: [
  { id: 'comment', pattern: /(?<!\S)#[^\r\n]*/, kind: 'comment' },
  { id: 'export', pattern: /^[ \t]*export\b/m, kind: 'keyword' },
  { id: 'key', pattern: /(?:^|(?<=export[ \t]))[ \t]*([A-Za-z_][\w]*)([ \t]*=)/m, kind: 'plain', captures: { 1: 'property', 2: 'operator' } },
  { ...quoted('double', '"', { multiline: true }), rules: [{ id: 'escape', pattern: /\\[^]/, kind: 'string' }, ...variables()] },
  quoted('single', "'", { escape: false, multiline: true }), ...variables(),
] };
