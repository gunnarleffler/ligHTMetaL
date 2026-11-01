import { starter, quoted } from './shared/starter.js';
import { pairedQuote } from './shared/delimited.js';
/** Ruby starter; percent literals nest, interpolation/regex/heredocs are limited. */
export default starter({
  id: 'ruby', aliases: ['rb'],
  comments: [{ id: 'block-comment', begin: /^=begin\b.*$/m, end: /^=end\b.*$/m, kind: 'comment' }, { id: 'comment', pattern: /#[^\r\n]*/, kind: 'comment' }],
  strings: [{ id: 'percent-literal', scan: pairedQuote(/%(?:[qQwWiIxrs])?([^\w\s])/), kind: 'string' }, quoted('double', '"', { multiline: true }), quoted('single', "'", { multiline: true }), quoted('command', '`', { multiline: true })],
  before: [{ id: 'variable', pattern: /(?:@@?|\$)[A-Za-z_]\w*/, kind: 'variable' }, { id: 'symbol', pattern: /(?<!:):[A-Za-z_]\w*[!?=]?/, kind: 'constant' }],
  keywords: 'alias and BEGIN begin break case class def defined do else elsif END end ensure for if in module next not or redo rescue retry return self super then undef unless until when while yield', constants: 'nil __FILE__ __LINE__ __ENCODING__', booleans: 'true false',
});
