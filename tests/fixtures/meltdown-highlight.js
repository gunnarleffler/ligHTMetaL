/* Test-only optional highlighter chain; never imported by editor/parser builds. */
import { parse } from '../../src/MeltDown.js';
import { createHighlighter } from '../../src/polish.js';
import javascript from '../../src/polish/languages/javascript.js';
import bash from '../../src/polish/languages/bash.js';
const { highlight } = createHighlighter({ languages: [javascript, bash], guessLanguage: false });
export const render = source => parse(source, { highlight });
