import { comments } from './shared/c-family.js';
import { starter, quoted } from './shared/starter.js';
function heredoc({ source, start, end }) {
  const opening = /<<<[ \t]*(?:'([A-Za-z_]\w*)'|"([A-Za-z_]\w*)"|([A-Za-z_]\w*))[ \t]*\r?\n/g;
  opening.lastIndex = start;
  const match = opening.exec(source);
  if (!match || match.index >= end || opening.lastIndex > end) return null;
  const name = match[1] ?? match[2] ?? match[3];
  const closing = new RegExp('^[ \\t]*' + name + '(?=[;,\\])\\r\\n]|$)', 'gm');
  closing.lastIndex = opening.lastIndex;
  const found = closing.exec(source);
  return { start: match.index, end: found ? Math.min(end, found.index + found[0].length) : end };
}
/** PHP-code lexical subset; surrounding HTML is not a separate embedding mode. */
export default starter({
  id: 'php', insensitive: true, comments: [...comments(), { id: 'hash-comment', pattern: /#(?!\[)[^\r\n]*/, kind: 'comment' }],
  strings: [{ id: 'heredoc', scan: heredoc, kind: 'string' }, quoted('double', '"', { multiline: true }), quoted('single', "'", { multiline: true }), quoted('command', '`', { multiline: true })],
  before: [{ id: 'tag', pattern: /<\?(?:php|=)?|\?>/i, kind: 'tag' }, { id: 'variable', pattern: /\$[A-Za-z_]\w*/, kind: 'variable' }],
  keywords: 'abstract and array as break callable case catch class clone const continue declare default die do echo else elseif empty enddeclare endfor endforeach endif endswitch endwhile enum eval exit extends final finally fn for foreach function global goto if implements include include_once instanceof insteadof interface isset list match namespace new or print private protected public readonly require require_once return static switch throw trait try unset use var while xor yield',
  types: 'bool boolean float double int integer iterable mixed never object resource self parent string void', constants: 'null', booleans: 'true false',
});
