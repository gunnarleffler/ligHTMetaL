/** A fresh repository entry for languages with nested slash-star comments. */
export function nestedCommentRepository() {
  return {
    blockComments: [{
      id: 'block-comment', begin: /\/\*/, end: /\*\//, kind: 'comment',
      rules: [{ id: 'nested-comment', include: 'blockComments' }],
    }],
  };
}
