import { paperLight, paperDark, quietLight, quietDark, tomorrow, dracula, cyberpunk, vaporwave, atomInspired } from './palettes.js';
export { paperLight, paperDark, quietLight, quietDark, tomorrow, dracula, cyberpunk, vaporwave, atomInspired };

/** @typedef {{foreground?: string, bold?: boolean, italic?: boolean, underline?: boolean}} TokenStyle */
/** @typedef {{name: string, appearance: 'light'|'dark', foreground: string, background: string, tokens: Partial<Record<import('../index.js').TokenKind, TokenStyle>>}} Theme */

/** @type {Theme} */
export const light = {
  name: 'light', appearance: 'light', foreground: '#24292f', background: '#ffffff',
  tokens: {
    comment: { foreground: '#57606a', italic: true },
    keyword: { foreground: '#cf222e' },
    string: { foreground: '#0a3069' },
    number: { foreground: '#0550ae' },
    boolean: { foreground: '#8250df' },
    constant: { foreground: '#8250df' },
    property: { foreground: '#953800' },
    function: { foreground: '#6639ba' },
    type: { foreground: '#953800' },
    tag: { foreground: '#116329' },
    attribute: { foreground: '#0550ae' },
  },
};
/** @type {Theme} */
export const dark = {
  name: 'dark', appearance: 'dark', foreground: '#e6edf3', background: '#0d1117',
  tokens: {
    comment: { foreground: '#8b949e', italic: true },
    keyword: { foreground: '#ff7b72' },
    string: { foreground: '#a5d6ff' },
    number: { foreground: '#79c0ff' },
    boolean: { foreground: '#d2a8ff' },
    constant: { foreground: '#d2a8ff' },
    property: { foreground: '#ffa657' },
    function: { foreground: '#d2a8ff' },
    type: { foreground: '#ffa657' },
    tag: { foreground: '#7ee787' },
    attribute: { foreground: '#79c0ff' },
  },
};

/** Explicit built-in catalog; light/dark remain the unchanged defaults. */
export const allThemes = Object.freeze([light, dark, paperLight, paperDark, quietLight, quietDark, tomorrow, dracula, cyberpunk, vaporwave, atomInspired]);

const categories = ['plain', 'comment', 'keyword', 'string', 'number', 'boolean', 'constant', 'function', 'type', 'variable', 'property', 'operator', 'punctuation', 'tag', 'attribute'];
/** @param {unknown} value */
function color(value) {
  // Deliberately narrow CSS input surface; expand only with validated use cases.
  if (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value)) throw new Error('Theme colors must be six-digit hex colors');
  return value;
}

/** Validate the shared CSS/ANSI theme contract. @param {Theme} theme */
export function validateTheme(theme) {
  if (!/^[a-z][a-z0-9_-]*$/.test(theme.name)) throw new Error('Invalid theme name');
  if (!['light', 'dark'].includes(theme.appearance)) throw new Error('Invalid theme appearance');
  color(theme.foreground);
  color(theme.background);
  for (const [kind, style] of Object.entries(theme.tokens)) {
    if (!categories.includes(kind)) throw new Error(`Invalid theme category: ${kind}`);
    if (!style || typeof style !== 'object' || Array.isArray(style)) throw new Error(`Invalid theme style: ${kind}`);
    if (style.foreground !== undefined) color(style.foreground);
    for (const key of ['bold', 'italic', 'underline']) {
      if (style[key] !== undefined && typeof style[key] !== 'boolean') throw new Error(`Invalid theme style: ${key}`);
    }
  }
}

/**
 * Build scoped CSS. Apply class="code theme-NAME" to a pre/code wrapper.
 * All category styles are defined, including fallback, so themes can switch
 * without retaining styles from another theme or retokenizing source.
 * @param {Theme} theme
 */
export function themeToCSS(theme) {
  validateTheme(theme);
  const selector = `.code.theme-${theme.name}, .polish.theme-${theme.name}`;
  const rules = [`${selector} { color-scheme: ${theme.appearance}; color: ${color(theme.foreground)}; background: ${color(theme.background)}; }`];
  for (const kind of categories) {
    const style = theme.tokens[kind] ?? {};
    const variable = `--code-${kind}`;
    rules.push(`${selector} { ${variable}: ${color(style.foreground ?? theme.foreground)}; }`);
    rules.push(`.code.theme-${theme.name} .token.${kind}, .polish.theme-${theme.name} pre .token.${kind} { color: var(${variable}); font-weight: ${style.bold ? '700' : '400'}; font-style: ${style.italic ? 'italic' : 'normal'}; text-decoration: ${style.underline ? 'underline' : 'none'}; }`);
  }
  return rules.join('\n');
}
