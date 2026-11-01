/** ligHTMetaL::poliSH. Core ESM entry; language modules remain opt-in. */
export { createHighlighter } from './polish/highlighter.js';
export { renderHTML, validateTokens } from './polish/index.js';
export { composeLanguage } from './polish/compose.js';
export { createLanguageLoader } from './polish/loader.js';
