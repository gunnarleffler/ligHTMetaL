import { starter, quoted } from './shared/starter.js';
/** PowerShell starter; expansions remain lexical, not execution/parameter binding. */
export default starter({
  id: 'powershell', aliases: ['ps1'], insensitive: true,
  repository: { blockComments: [{ id: 'block-comment', begin: /<#/, end: /#>/, kind: 'comment', rules: [{ id: 'nested', include: 'blockComments' }] }] },
  comments: [{ id: 'block-comments', include: 'blockComments' }, { id: 'comment', pattern: /#[^\r\n]*/, kind: 'comment' }],
  strings: [
    { id: 'here-double', begin: /@"\r?\n/, end: /^"@/m, kind: 'string' },
    { id: 'here-single', begin: /@'\r?\n/, end: /^'@/m, kind: 'string' },
    { ...quoted('double', '"', { doubled: true, escape: false, multiline: true }), rules: [{ id: 'backtick-escape', pattern: /`[^]/, kind: 'string' }, { id: 'doubled', pattern: /""/, kind: 'string' }, { id: 'variable', pattern: /\$(?:\{[^}]*\}|[\w:?]+)/, kind: 'variable' }] },
    quoted('single', "'", { doubled: true, escape: false, multiline: true }),
  ],
  before: [{ id: 'constant', pattern: /\$(?:true|false|null)\b/i, kind: 'constant' }, { id: 'variable', pattern: /\$(?:\{[^}]*\}|[\w:?]+)/, kind: 'variable' }, { id: 'operator-word', pattern: /-(?:eq|ne|gt|ge|lt|le|and|or|not|match|notmatch|like|notlike|contains|in|replace|split|join|is|as)\b/i, kind: 'operator' }, { id: 'cmdlet', pattern: /\b[A-Za-z]+-[A-Za-z][\w-]*/, kind: 'function' }],
  keywords: 'begin break catch class clean continue data define do dynamicparam else elseif end enum exit filter finally for foreach from function hidden if in inlinescript parallel param process return sequence static switch throw trap try until using var while workflow',
});
