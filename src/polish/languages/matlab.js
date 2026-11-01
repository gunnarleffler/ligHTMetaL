import { starter, quoted } from './shared/starter.js';
/** MATLAB starter. Apostrophe after a value is transpose, otherwise string start. */
export default starter({
  id: 'matlab',
  comments: [{ id: 'block-comment', begin: /^[ \t]*%\{[ \t]*$/m, end: /^[ \t]*%\}[ \t]*$/m, kind: 'comment' }, { id: 'comment', pattern: /%[^\r\n]*/, kind: 'comment' }],
  strings: [{ id: 'single', begin: /(?<![\w)\]}.'])'/, end: /'(?!')|(?=\r|\n)/, kind: 'string', rules: [{ id: 'doubled', pattern: /''/, kind: 'string' }] }, quoted('double', '"', { doubled: true, escape: false })],
  keywords: 'arguments break case catch classdef continue else elseif end enumeration events for function global if methods otherwise parfor persistent properties return spmd switch try while',
  constants: 'Inf NaN pi eps', booleans: 'true false',
  before: [{ id: 'continuation', pattern: /\.\.\.[^\r\n]*/, kind: 'comment' }],
  after: [{ id: 'transpose', pattern: /\.?'/, kind: 'operator' }],
});
