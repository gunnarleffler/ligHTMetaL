/** Category palettes adapted for poliSH, not exact upstream theme ports.
 * Inspiration: Flexoki/Gruvbox (paper), Vesper (quiet), Tomorrow Night and
 * Dracula. Cyberpunk/vaporwave are original neon palettes. No upstream CSS,
 * scope rules, glow effects or dependencies are included. */
function palette(name, appearance, foreground, background, colors) {
  return { name, appearance, foreground, background,
    tokens: Object.fromEntries(Object.entries(colors).map(([kind, color]) => [kind, {
      foreground: color, ...(kind === 'comment' ? { italic: true } : {}),
    }])) };
}

export const paperLight = palette('paper-light', 'light', '#34312c', '#fffcf0', {
  comment: '#736b60', keyword: '#875015', string: '#24685e', number: '#70429a',
  boolean: '#70429a', constant: '#845408', function: '#97451c', type: '#943c66',
  property: '#285e89', tag: '#52651c', attribute: '#285e89',
});
export const paperDark = palette('paper-dark', 'dark', '#e6ddca', '#24211e', {
  comment: '#a99c86', keyword: '#e7ae72', string: '#88c6ad', number: '#c3a3de',
  boolean: '#c3a3de', constant: '#dfbd72', function: '#eea276', type: '#dfa0bb',
  property: '#8db9d4', tag: '#b7c986', attribute: '#8db9d4',
});
export const quietLight = palette('quiet-light', 'light', '#242424', '#fafafa', {
  comment: '#707070', keyword: '#595959', operator: '#595959', string: '#006c55',
  number: '#8a4c1c', boolean: '#8a4c1c', constant: '#8a4c1c',
  function: '#8a4c1c', type: '#8a4c1c', tag: '#8a4c1c', attribute: '#595959',
});
export const quietDark = palette('quiet-dark', 'dark', '#eeeeee', '#141414', {
  comment: '#929292', keyword: '#b0b0b0', operator: '#b0b0b0', string: '#99e6ce',
  number: '#edba93', boolean: '#edba93', constant: '#edba93',
  function: '#edba93', type: '#edba93', tag: '#edba93', attribute: '#b0b0b0',
});
export const tomorrow = palette('tomorrow', 'dark', '#cccccc', '#2d2d2d', {
  comment: '#999999', keyword: '#cc99cd', string: '#7ec699', number: '#f08d49',
  boolean: '#f08d49', constant: '#f8c555', function: '#f08d49', type: '#f8c555',
  property: '#f8c555', variable: '#7ec699', operator: '#67cdcc',
  tag: '#e2777a', attribute: '#e2777a',
});
export const dracula = palette('dracula', 'dark', '#f8f8f2', '#282a36', {
  // Brighter than classic Dracula's #6272a4 to meet 4.5:1 for comments too.
  comment: '#929fc9', keyword: '#ff79c6', operator: '#ff79c6', string: '#f1fa8c',
  number: '#bd93f9', boolean: '#bd93f9', constant: '#bd93f9', function: '#50fa7b',
  type: '#8be9fd', property: '#8be9fd', tag: '#ff79c6', attribute: '#50fa7b',
});
export const cyberpunk = palette('cyberpunk', 'dark', '#e6faff', '#091321', {
  comment: '#829db5', keyword: '#ff55b8', operator: '#6cecff', string: '#beff63',
  number: '#ffe36c', boolean: '#ffe36c', constant: '#ffe36c', function: '#5ce6ff',
  type: '#c6a0ff', variable: '#a9e8ff', property: '#5ce6ff',
  tag: '#ff829d', attribute: '#beff63',
});
/** Original One Dark–inspired category adaptation, not an Atom theme port. */
export const atomInspired = palette('atom-inspired', 'dark', '#abb2bf', '#282c34', {
  comment: '#929baa', keyword: '#c678dd', string: '#98c379', number: '#d19a66',
  boolean: '#d19a66', constant: '#d19a66', function: '#61afef', type: '#e5c07b',
  variable: '#e89a9f', property: '#e89a9f', operator: '#56b6c2',
  tag: '#e89a9f', attribute: '#e5c07b',
});
export const vaporwave = palette('vaporwave', 'dark', '#f4eaff', '#21132f', {
  comment: '#ab96c0', keyword: '#ffa1e2', operator: '#83ece8', string: '#a6f0db',
  number: '#ffc48c', boolean: '#ffc48c', constant: '#ffc48c', function: '#83d9ff',
  type: '#c7b1ff', property: '#f4b1e4', tag: '#ffa1e2', attribute: '#a6f0db',
});
