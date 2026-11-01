import { starter, quoted } from './shared/starter.js';
import { delimited } from './shared/delimited.js';
/** Lua 5.x lexical subset; long bracket delimiters carry an arbitrary equals count. */
export default starter({
  id: 'lua',
  comments: [
    { id: 'long-comment', scan: delimited(/--\[(=*)\[/, m => ']' + m[1] + ']'), kind: 'comment' },
    { id: 'comment', pattern: /--[^\r\n]*/, kind: 'comment' },
  ],
  strings: [{ id: 'long-string', scan: delimited(/\[(=*)\[/, m => ']' + m[1] + ']'), kind: 'string' }, quoted('double', '"'), quoted('single', "'")],
  keywords: 'and break do else elseif end for function goto if in local not or repeat return then until while', constants: 'nil', booleans: 'true false',
  number: /(?<![\w.])(?:0[xX][\da-fA-F]+(?:\.[\da-fA-F]*)?(?:[pP][+-]?\d+)?|\d+(?:\.(?!\.)\d*)?(?:[eE][+-]?\d+)?)(?!\w)/,
});
