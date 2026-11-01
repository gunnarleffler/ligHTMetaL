import { starter, quoted } from './shared/starter.js';
import { delimited } from './shared/delimited.js';
/** R starter; backtick names and modern raw-string delimiters are lexical. */
export default starter({
  id: 'r', comments: [{ id: 'comment', pattern: /#[^\r\n]*/, kind: 'comment' }],
  strings: [{ id: 'raw-string', scan: delimited(/\b[rR]"(-*)([(\[{])/, m => ({ '(': ')', '[': ']', '{': '}' }[m[2]] + m[1] + '"')), kind: 'string' }, quoted('double', '"'), quoted('single', "'")],
  before: [{ id: 'backtick-name', pattern: /`(?:\\[^]|[^`\\])*`/, kind: 'variable' }, { id: 'infix', pattern: /%[^%\r\n]*%/, kind: 'operator' }],
  keywords: 'if else repeat while function for in next break', constants: 'NULL NA NA_integer_ NA_real_ NA_complex_ NA_character_ NaN Inf', booleans: 'TRUE FALSE',
  number: /(?<![\w.])(?:0[xX][\da-fA-F]+(?:\.[\da-fA-F]*)?(?:[pP][+-]?\d+)?|(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)[Li]?(?!\w)/,
});
