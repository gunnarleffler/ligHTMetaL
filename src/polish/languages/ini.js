import { quoted } from './shared/starter.js';
import { sectionHeader, assignmentKey } from './shared/config.js';
/** Conservative INI: line-leading comments, sections and string-like values.
 * No implicit TOML typing; inline comment/interpolation dialects vary. */
export default { id: 'ini', aliases: ['cfg'], rules: [
  { id: 'comment', pattern: /^[ \t]*[;#][^\r\n]*/m, kind: 'comment' },
  sectionHeader(), assignmentKey(),
  quoted('double', '"'), quoted('single', "'", { escape: false }),
] };
