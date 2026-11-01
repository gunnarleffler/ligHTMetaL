import { createHighlighter } from './index.js';
import sgr from './languages/ansi-sgr.js';
import { escapeTerminalText } from './terminal-text.js';
import { escapeHTML } from './render-text.js';

const highlighter = createHighlighter();
highlighter.register(sgr);
const basic = ['0, 0, 0', '187, 0, 0', '0, 187, 0', '187, 187, 0', '0, 0, 187', '187, 0, 187', '0, 187, 187', '187, 187, 187', '85, 85, 85', '255, 85, 85', '85, 255, 85', '255, 255, 85', '85, 85, 255', '255, 85, 255', '85, 255, 255', '255, 255, 255'];
const channel = value => Number.isInteger(value) && value >= 0 && value <= 255;
function palette(index) {
  if (!channel(index)) return null;
  if (index < 16) return basic[index];
  if (index >= 232) return Array(3).fill(8 + (index - 232) * 10).join(', ');
  const n = index - 16;
  const levels = [0, 95, 135, 175, 215, 255];
  return [levels[Math.floor(n / 36)], levels[Math.floor(n / 6) % 6], levels[n % 6]].join(', ');
}

/**
 * Convert SGR-colored Unicode text to HTML contents (wrap in pre/code).
 * Our grammar recognizes sequences; this renderer maintains color/style state.
 * Supports semicolon-form 16/256/truecolor, resets, bold, dim, italic, underline,
 * strikethrough and reverse. No streaming, cursor motion, links, blink or hidden
 * text. Unsupported controls are displayed literally, not executed/emulated.
 * Input must already be decoded Unicode, not CP437 bytes. No dependencies.
 * @param {string} source
 * @param {{maxSteps?: number, strict?: boolean}} [options]
 */
export function ansiToHTML(source, options = {}) {
  const engine = options.maxSteps === undefined ? highlighter : createHighlighter({ maxSteps: options.maxSteps });
  if (engine !== highlighter) engine.register(sgr);
  const { tokens } = engine.tokenize(source, { language: 'ansi-sgr', strict: options.strict ?? false });
  const fresh = () => ({ fg: null, bg: null, bold: false, dim: false, italic: false, underline: false, strike: false, reverse: false });
  let state = fresh();
  const apply = body => {
    const codes = body.split(';').map(Number);
    for (let i = 0; i < codes.length; i++) {
      const code = codes[i];
      if (code === 0) state = fresh();
      else if (code === 1) state.bold = true;
      else if (code === 2) state.dim = true;
      else if (code === 3) state.italic = true;
      else if (code === 4) state.underline = true;
      else if (code === 7) state.reverse = true;
      else if (code === 9) state.strike = true;
      else if (code === 21) state.bold = false;
      else if (code === 22) state.bold = state.dim = false;
      else if (code === 23) state.italic = false;
      else if (code === 24) state.underline = false;
      else if (code === 27) state.reverse = false;
      else if (code === 29) state.strike = false;
      else if (code === 39) state.fg = null;
      else if (code === 49) state.bg = null;
      else if (code >= 30 && code <= 37) state.fg = basic[code - 30];
      else if (code >= 40 && code <= 47) state.bg = basic[code - 40];
      else if (code >= 90 && code <= 97) state.fg = basic[code - 90 + 8];
      else if (code >= 100 && code <= 107) state.bg = basic[code - 100 + 8];
      else if (code === 38 || code === 48) {
        const mode = codes[++i];
        let color = null;
        if (mode === 5) color = palette(codes[++i]);
        else if (mode === 2) {
          const rgb = codes.slice(i + 1, i + 4);
          i += 3;
          if (rgb.length === 3 && rgb.every(channel)) color = rgb.join(', ');
        } else break; // Unknown extended format: ignore remaining parameters.
        if (color !== null) state[code === 38 ? 'fg' : 'bg'] = color;
      }
    }
  };
  const result = [];
  for (const token of tokens) {
    const text = source.slice(token.start, token.end);
    if (token.kind === 'keyword') {
      // Adjacent SGR matches may be coalesced into one token by the engine.
      for (const sequence of text.split('m').slice(0, -1)) apply(sequence.slice(sequence.startsWith('\x1b[') ? 2 : 1));
      continue;
    }
    const content = escapeHTML(escapeTerminalText(text));
    let { fg, bg } = state;
    if (state.reverse) [fg, bg] = [bg ?? '0, 0, 0', fg ?? '255, 255, 255'];
    const styles = [];
    if (fg) styles.push(`color:rgb(${fg})`);
    if (bg) styles.push(`background-color:rgb(${bg})`);
    if (state.bold) styles.push('font-weight:bold');
    if (state.italic) styles.push('font-style:italic');
    if (state.dim) styles.push('opacity:0.5');
    const lines = [state.underline && 'underline', state.strike && 'line-through'].filter(Boolean);
    if (lines.length) styles.push(`text-decoration:${lines.join(' ')}`);
    result.push(styles.length ? `<span style="${styles.join(';')}">${content}</span>` : content);
  }
  return result.join('');
}
