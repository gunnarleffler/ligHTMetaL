/** CommonMark-like source coloring, not Markdown parsing or editable HTML. */
function fencedCode({ source, start, end }) {
  const opening = /^ {0,3}(`{3,}|~{3,})([^\r\n]*)(?:\r?\n|$)/gm;
  opening.lastIndex = start;
  let match;
  while ((match = opening.exec(source)) && match.index < end) {
    if (match[1][0] === '`' && match[2].includes('`')) continue;
    const closing = new RegExp('^ {0,3}' + match[1][0] + '{' + match[1].length + ',}[ \\t]*(?:\\r?\\n|$)', 'gm');
    closing.lastIndex = opening.lastIndex;
    const close = closing.exec(source);
    return { start: match.index, end: close ? Math.min(end, closing.lastIndex) : end };
  }
  return null;
}
function inlineCode({ source, start, end }) {
  const ticks = /`+/g;
  ticks.lastIndex = start;
  let opening;
  while ((opening = ticks.exec(source)) && opening.index < end) {
    const closes = /`+/g;
    closes.lastIndex = ticks.lastIndex;
    let closing;
    while ((closing = closes.exec(source)) && closes.lastIndex <= end) {
      if (closing[0].length === opening[0].length) return { start: opening.index, end: closes.lastIndex };
    }
  }
  return null;
}
export default { id: 'markdown', aliases: ['md'], rules: [
  { id: 'fence', scan: fencedCode, kind: 'string' },
  { id: 'inline-code', scan: inlineCode, kind: 'string' },
  { id: 'comment', begin: /<!--/, end: /-->/, kind: 'comment' },
  { id: 'escape', pattern: /\\[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/, kind: 'punctuation' },
  { id: 'heading', pattern: /^ {0,3}#{1,6}(?:[ \t]+[^\r\n]*|$)/m, kind: 'keyword' },
  { id: 'setext', pattern: /^ {0,3}(?:=+|-+)[ \t]*$/m, kind: 'keyword' },
  { id: 'rule', pattern: /^ {0,3}(?:\*[ \t]*){3,}$|^ {0,3}(?:_[ \t]*){3,}$/m, kind: 'punctuation' },
  { id: 'quote-list', pattern: /^ {0,3}(?:>[ \t]?|[-+*][ \t]+|\d{1,9}[.)][ \t]+)/m, kind: 'punctuation' },
  { id: 'link', pattern: /!?\[([^\]\r\n]*)\]\(([^)\r\n]*)\)/, kind: 'punctuation', captures: { 1: 'string', 2: 'constant' } },
  { id: 'strong', pattern: /\*\*(?=\S)(?:[^*\r\n]|\*(?!\*))+\*\*|__(?=\S)[^_\r\n]+__/, kind: 'type' },
  { id: 'emphasis', pattern: /(?<!\w)\*(?=\S)[^*\r\n]+\*|(?<!\w)_(?=\S)[^_\r\n]+_/, kind: 'property' },
  { id: 'autolink', pattern: /<(?:https?:\/\/|mailto:)[^<>\s]+>/, kind: 'constant' },
] };
