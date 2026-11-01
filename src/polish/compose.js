import { cloneGrammar } from './clone-grammar.js';

/**
 * @typedef {{op: 'insertBefore'|'insertAfter', target: string, rules: readonly import('./index.js').Rule[]}|{op: 'replace', target: string, rule: import('./index.js').Rule}|{op: 'remove', target: string}} GrammarEdit
 */

/**
 * Derive a language using explicit top-level rule edits in order. Clone the
 * complete grammar (including nested rules, capture maps, and regexes), never
 * mutate the base or edit arguments. Aliases deliberately do not carry over.
 * Scanner callbacks retain their identity and must be stateless; data is cloned.
 * @param {import('./index.js').Language} base
 * @param {{id: string, aliases?: readonly string[], edits?: readonly GrammarEdit[]}} options
 * @returns {import('./index.js').Language}
 */
export function composeLanguage(base, options) {
  const result = cloneGrammar({ ...base, id: options.id, aliases: options.aliases ?? [] });
  const validateIDs = () => {
    const ids = new Set();
    for (const rule of result.rules) {
      if (!rule.id || ids.has(rule.id)) throw new Error(`Invalid or duplicate composed rule ID: ${rule.id}`);
      ids.add(rule.id);
    }
  };
  validateIDs();
  for (const edit of options.edits ?? []) {
    const index = result.rules.findIndex(rule => rule.id === edit.target);
    if (index < 0) throw new Error(`Composition target not found: ${edit.target}`);
    switch (edit.op) {
      case 'insertBefore': result.rules.splice(index, 0, ...cloneGrammar(edit.rules)); break;
      case 'insertAfter': result.rules.splice(index + 1, 0, ...cloneGrammar(edit.rules)); break;
      case 'replace': result.rules.splice(index, 1, cloneGrammar(edit.rule)); break;
      case 'remove': result.rules.splice(index, 1); break;
      default: throw new Error(`Unknown composition operation: ${edit.op}`);
    }
    validateIDs();
  }
  return result;
}
