import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allThemes, light, dark, themeToCSS } from '../../src/polish/themes/index.js';

test('themes share output classes and explicitly reset missing styles', () => {
  for (const theme of [light, dark]) {
    const css = themeToCSS(theme);
    assert.ok(css.includes(`.code.theme-${theme.name}`));
    assert.ok(css.includes(`--code-punctuation: ${theme.foreground}`));
    assert.ok(css.includes('.token.comment { color: var(--code-comment); font-weight: 400; font-style: italic;'));
    assert.ok(css.includes('.token.punctuation { color: var(--code-punctuation); font-weight: 400; font-style: normal; text-decoration: none;'));
  }
  const css = themeToCSS({ name: 'custom', appearance: 'dark', foreground: '#eeeeee', background: '#111111', tokens: { keyword: { bold: true, underline: true } } });
  assert.ok(css.includes('--code-keyword: #eeeeee;'));
  assert.ok(css.includes('font-weight: 700; font-style: normal; text-decoration: underline;'));
});

test('theme CSS validates names, appearance, colors, categories and styles at the boundary', () => {
  assert.throws(() => themeToCSS({ ...light, name: 'x}body{' }), /name/);
  assert.throws(() => themeToCSS({ ...light, appearance: 'custom' }), /appearance/);
  for (const color of ['red; background: url(x)', '#fff', 42]) {
    for (const key of ['foreground', 'background']) assert.throws(() => themeToCSS({ ...light, [key]: color }), /colors/);
    assert.throws(() => themeToCSS({ ...light, tokens: { string: { foreground: color } } }), /colors/);
  }
  // CSS lookup can resolve inherited categories, unlike Object.entries in
  // validateTheme: the rendering-time color check must still reject injection.
  const inherited = Object.create({ string: { foreground: 'red; background: url(x)' } });
  assert.throws(() => themeToCSS({ ...light, tokens: inherited }), /colors/);
  assert.throws(() => themeToCSS({ ...light, tokens: { evil: {} } }), /category/);
  for (const style of [null, [], 'italic']) assert.throws(() => themeToCSS({ ...light, tokens: { string: style } }), /style/);
  for (const flag of ['bold', 'italic', 'underline']) {
    assert.throws(() => themeToCSS({ ...light, tokens: { string: { [flag]: 'yes' } } }), /style/);
  }
});

function luminance(hex) {
  const channels = hex.slice(1).match(/../g).map(value => {
    const s = parseInt(value, 16) / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}
for (const theme of allThemes) {
  test(`${theme.name}: default text and supplied token colors meet 4.5:1 contrast`, () => {
    const background = luminance(theme.background);
    const foregrounds = { default: theme.foreground, ...Object.fromEntries(Object.entries(theme.tokens).map(([kind, style]) => [kind, style.foreground ?? theme.foreground])) };
    for (const [kind, color] of Object.entries(foregrounds)) {
      const foreground = luminance(color);
      const ratio = (Math.max(background, foreground) + 0.05) / (Math.min(background, foreground) + 0.05);
      assert.ok(ratio >= 4.5, `${theme.name}/${kind}: ${ratio.toFixed(2)}:1`);
    }
  });
}
