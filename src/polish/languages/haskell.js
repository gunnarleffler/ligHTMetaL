import { starter, quoted } from './shared/starter.js';
/** Haskell starter; layout, quasiquotes and apostrophes in identifiers are lexical. */
export default starter({
  id: 'haskell', aliases: ['hs'],
  repository: { comments: [{ id: 'block-comment', begin: /\{-/, end: /-\}/, kind: 'comment', rules: [{ id: 'nested', include: 'comments' }] }] },
  comments: [{ id: 'comments', include: 'comments' }, { id: 'line-comment', pattern: /--(?![!#$%&*+./<=>?@\\^|~:-])[^\r\n]*/, kind: 'comment' }],
  strings: [quoted('double', '"', { multiline: true }), { id: 'character', pattern: /'(?:\\(?:[A-Za-z]+|\d+|[^])|[^'\\\r\n])'/u, kind: 'string' }],
  after: [{ id: 'identifier-prime', pattern: /[a-z_][\w']*/, kind: 'variable' }, { id: 'constructor', pattern: /\b[A-Z][\w']*/, kind: 'type' }],
  keywords: 'as case class data default deriving do else family forall foreign hiding if import in infix infixl infixr instance let mdo module newtype of pattern qualified rec role safe then type unsafe where', booleans: 'True False',
});
