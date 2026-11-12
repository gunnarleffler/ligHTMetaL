import { createHighlighter as createCore, renderHTML } from './index.js';
import { ansiToHTML } from './ansi-to-html.js';
import { guessRegisteredLanguage } from './guess-language.js';

const reserved = new Set(['ansi', 'plain', 'text']);

/**
 * Public instance: core token APIs plus synchronous, callback-safe HTML hooks.
 * No DOM access, globals, or automatic language loading.
 * @param {{languages?: readonly import('./index.js').Language[], maxDepth?: number, maxSteps?: number, guessLanguage?: boolean}} [options]
 */
export function createHighlighter(options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) throw new TypeError('Expected highlighter options object');
  const { languages = [], maxDepth, maxSteps, guessLanguage = true } = options;
  if (typeof guessLanguage !== 'boolean') throw new TypeError('guessLanguage must be a boolean');
  if (!Array.isArray(languages)) throw new TypeError('languages must be an array');
  const core = createCore({ maxDepth, maxSteps });
  const register = language => {
    for (const name of [language.id, ...(language.aliases ?? [])]) {
      if (typeof name === 'string' && reserved.has(name.trim().toLowerCase())) throw new Error(`Reserved language name: ${name}`);
    }
    core.register(language);
  };
  for (const language of languages) register(language);

  const resolveLanguage = (source, language) => {
    if (typeof source !== 'string') throw new TypeError('Source must be a string');
    if (typeof language !== 'string') throw new TypeError('Language must be a string or undefined');
    return language.trim().toLowerCase() || (guessLanguage ? guessRegisteredLanguage(source, core.hasLanguage) : '') || 'plain';
  };

  /**
   * Source-preserving tokens for painters. ANSI is plain here: terminal rendering
   * can consume controls and change text, which an editing overlay must not do.
   * @param {string} source
   * @param {string} [language]
   */
  const highlightTokens = (source, language = '') => {
    const name = resolveLanguage(source, language);
    return core.tokenize(source, { language: name === 'ansi' ? 'plain' : name });
  };

  /**
   * HTML contents only. Missing languages may be guessed; explicit names win.
   * Strict mode exposes core diagnostics as exceptions for known/unknown syntax
   * languages. ANSI conversion has its own bounded grammar execution.
   * @param {string} source
   * @param {{language?: string, strict?: boolean}} [settings]
   */
  const highlightHTML = (source, settings = {}) => {
    if (typeof source !== 'string') throw new TypeError('Source must be a string');
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) throw new TypeError('Expected highlight options object');
    const { language = '', strict = false } = settings;
    if (typeof strict !== 'boolean') throw new TypeError('strict must be a boolean');
    const name = resolveLanguage(source, language);
    if (name === 'ansi') return ansiToHTML(source, { maxSteps, strict });
    const result = core.tokenize(source, { language: name || 'plain', strict });
    return renderHTML(source, result.tokens);
  };

  return {
    ...core,
    register,
    /** @param {string} name */
    hasLanguage(name) {
      return typeof name === 'string' && (reserved.has(name.trim().toLowerCase()) || core.hasLanguage(name));
    },
    highlightHTML,
    highlightTokens,
    /**
     * Direct hook for MeltDown: pass this function without binding it.
     * @param {string} source
     * @param {string} [language]
     */
    highlight: (source, language) => highlightHTML(source, { language }),
  };
}
