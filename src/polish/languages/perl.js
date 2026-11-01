import { starter, quoted } from './shared/starter.js';
import { pairedQuote } from './shared/delimited.js';
/** Perl 5 lexical subset; arbitrary regex/heredoc parsing and Raku are not covered. */
export default starter({
  id: 'perl', aliases: ['pl'],
  comments: [{ id: 'pod', begin: /^=(?:pod|head\d|over|item|begin|for|encoding)\b.*$/m, end: /^=cut\b.*$/m, kind: 'comment' }, { id: 'comment', pattern: /#[^\r\n]*/, kind: 'comment' }],
  strings: [{ id: 'quote-operator', scan: pairedQuote(/\b(?:qq|qw|qr|qx|q)([^\w\s])/), kind: 'string' }, quoted('double', '"', { multiline: true }), quoted('single', "'", { multiline: true }), quoted('command', '`', { multiline: true })],
  before: [{ id: 'variable', pattern: /[$@%](?:\{[^}\r\n]*\}|[A-Za-z_]\w*(?:::\w+)*|\d+|[!?_])/ , kind: 'variable' }],
  keywords: 'and BEGIN CHECK continue CORE default defer do else elsif END eval for foreach given goto if INIT last local my next no not or our package redo require return say state sub UNITCHECK unless until use when while xor',
  constants: 'undef',
});
