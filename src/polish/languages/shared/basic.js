import { starter, quoted } from './starter.js';
/** Shared BASIC quoting/comments; dialect vocabularies are supplied explicitly. */
export function basicLanguage({ id, aliases = [], keywords, types, interpolated = false }) {
  return starter({ id, aliases, keywords, types, insensitive: true, constants: 'Nothing Null Empty', booleans: 'True False',
    comments: [{ id: 'apostrophe-comment', pattern: /'[^\r\n]*/, kind: 'comment' }, { id: 'rem-comment', pattern: /(?:^[ \t]*|:[ \t]*)Rem\b[^\r\n]*/im, kind: 'comment' }],
    strings: [{ ...quoted('double', '"', { doubled: true, escape: false }), begin: interpolated ? /\$?"/ : /"/ }],
    before: [{ id: 'date', pattern: /#\d[^#\r\n]*#/, kind: 'constant' }, { id: 'directive', pattern: /^[ \t]*#[A-Za-z]+[^\r\n]*/m, kind: 'keyword' }, { id: 'continuation', pattern: /_[ \t]*\r?\n/, kind: 'punctuation' }],
    number: /(?:&[hH][\da-fA-F]+|\b\d+(?:\.\d*)?(?:[eEdD][+-]?\d+)?)[%&!#@]?/,
  });
}
