import { quoted } from './shared/starter.js';
/** OpenSSH client configuration, not sshd_config or shell command parsing. */
export default { id: 'ssh-config', aliases: ['sshconfig'], rules: [
  { id: 'comment', pattern: /(?<!\S)#[^\r\n]*/, kind: 'comment' },
  { ...quoted('double', '"'), rules: [{ id: 'escape', pattern: /\\[^]/, kind: 'string' }, { id: 'token', pattern: /%%|%[A-Za-z]/, kind: 'variable' }] },
  { id: 'directive', pattern: /^[ \t]*([A-Za-z][A-Za-z0-9]*)(?=[ \t=])/m, kind: 'plain', captures: { 1: 'keyword' } },
  { id: 'token', pattern: /%%|%[A-Za-z]/, kind: 'variable' },
  { id: 'environment', pattern: /\$\{[A-Za-z_]\w*\}/, kind: 'variable' },
  { id: 'equals', pattern: /=/, kind: 'operator' },
] };
