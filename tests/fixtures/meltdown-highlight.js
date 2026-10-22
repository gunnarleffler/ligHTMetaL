/* Test-only optional highlighter chain; never imported by shipped builds. */
import { parse } from '../../src/MeltDown.js';
import hljs from 'highlight.js/lib/core';
import javascript from 'highlight.js/lib/languages/javascript';
import bash from 'highlight.js/lib/languages/bash';
hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('bash', bash);
export const render = source => parse(source, {
  highlight(code, language) {
    if (!language || !hljs.getLanguage(language)) return null;
    return hljs.highlight(code, { language, ignoreIllegals: true }).value;
  }
});
