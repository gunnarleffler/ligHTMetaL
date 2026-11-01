// Quote-aware tag body prevents a '>' inside an attribute from closing a tag.
const attributes = String.raw`(?:[^>"']|"[^"]*"|'[^']*')*`;

/**
 * Starter HTML grammar. Ordinary tags classify names/attributes/values.
 * Script/style opening tags remain a single tag category.
 * Script/style are raw-text regions; all scripts default to JavaScript,
 * regardless of type attributes. Inline attribute embedding is not supported.
 * @type {import('../index.js').Language}
 */
export default {
  id: 'html', aliases: ['htm'],
  rules: [
    { id: 'comment', begin: /<!--/, end: /-->/, kind: 'comment' },
    { id: 'doctype', pattern: /<!doctype\b(?:[^>"']|"[^"]*"|'[^']*')*>/i, kind: 'keyword' },
    { id: 'script', begin: new RegExp(`<script(?=[\\s/>])${attributes}>`, 'i'), end: /<\/script\s*>/i, kind: 'tag', embed: 'javascript' },
    { id: 'style', begin: new RegExp(`<style(?=[\\s/>])${attributes}>`, 'i'), end: /<\/style\s*>/i, kind: 'tag', embed: 'css' },
    { id: 'tag', begin: /(<\/?)([a-zA-Z][\w:-]*)(?=[\s/>])/, beginCaptures: { 1: 'punctuation', 2: 'tag' }, end: /\/?>/, kind: 'punctuation', contentKind: 'plain', rules: [
      { id: 'assigned-attribute', pattern: /([a-zA-Z_:][\w:.-]*)(\s*=\s*)("[^"]*"|'[^']*'|[^\s>]+)/, kind: 'plain', captures: { 1: 'attribute', 2: 'operator', 3: 'string' } },
      { id: 'attribute', pattern: /[a-zA-Z_:][\w:.-]*/, kind: 'attribute' },
    ] },
    { id: 'entity', pattern: /&(?:#[0-9]+|#x[\da-fA-F]+|[a-zA-Z][\da-zA-Z]*);/, kind: 'constant' },
  ],
};
