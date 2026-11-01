import { validateTokens } from './index.js';
import { escapeTerminalText } from './terminal-text.js';
import { tokenText } from './render-text.js';
import { dark, validateTheme } from './themes/index.js';

export { escapeTerminalText } from './terminal-text.js';

/**
 * Render terminal text with optional truecolor SGR styling. Source controls are
 * always escaped before trusted SGR is added. No TTY/capability autodetection;
 * callers should pass colors:false for redirected output/NO_COLOR as needed.
 * Foreground only: do not change the terminal's background. Each styled token
 * starts/ends with a reset; callers must not expect outer terminal styles kept.
 * @param {string} source
 * @param {readonly import('./index.js').Token[]} tokens
 * @param {import('./themes/index.js').Theme} [theme]
 * @param {{colors?: boolean}} [options]
 */
export function renderANSI(source, tokens, theme = dark, { colors = true } = {}) {
  validateTokens(source, tokens);
  validateTheme(theme);
  const styles = new Map();
  return tokens.map(token => {
    let end = token.end;
    // A CRLF can straddle two differently classified tokens. Drop that CR
    // using original-source context; the following token preserves the LF.
    if (source[end - 1] === '\r' && source[end] === '\n') end--;
    const text = escapeTerminalText(tokenText(source, token.start, end));
    if (!text || !colors) return text;
    if (!styles.has(token.kind)) {
      const style = theme.tokens[token.kind] ?? {};
      const hex = style.foreground ?? theme.foreground;
      const rgb = [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16));
      const codes = [0, ...(style.bold ? [1] : []), ...(style.italic ? [3] : []), ...(style.underline ? [4] : []), 38, 2, ...rgb];
      styles.set(token.kind, `\x1b[${codes.join(';')}m`);
    }
    return `${styles.get(token.kind)}${text}\x1b[0m`;
  }).join('');
}
