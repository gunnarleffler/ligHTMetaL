import { quoted } from './shared/starter.js';
import { sectionHeader, assignmentKey } from './shared/config.js';
const specifiers = () => [{ id: 'specifier', pattern: /%%|%[A-Za-z]/, kind: 'variable' }];
/** systemd unit files, not shell scripts or all systemd configuration formats. */
export default { id: 'systemd', rules: [
  { id: 'comment', pattern: /^[ \t]*[#;][^\r\n]*/m, kind: 'comment' },
  sectionHeader(), assignmentKey(),
  { ...quoted('double', '"'), rules: [{ id: 'escape', pattern: /\\[^]/, kind: 'string' }, ...specifiers()] },
  quoted('single', "'", { escape: false }),
  ...specifiers(),
  { id: 'environment', pattern: /\$\{[A-Za-z_]\w*\}|\$[A-Za-z_]\w*/, kind: 'variable' },
  { id: 'continuation', pattern: /\\\r?\n/, kind: 'punctuation' },
] };
