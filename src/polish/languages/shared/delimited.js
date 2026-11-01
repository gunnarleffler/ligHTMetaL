/** Build a stateless scanner for a dynamic literal closing delimiter. */
export function delimited(opening, closing) {
  return ({ source, start, end }) => {
    const pattern = new RegExp(opening.source, opening.flags.replace(/[gy]/g, '') + 'g');
    pattern.lastIndex = start;
    const match = pattern.exec(source);
    if (!match || match.index >= end || pattern.lastIndex > end) return null;
    const delimiter = closing(match);
    const index = source.indexOf(delimiter, pattern.lastIndex);
    return { start: match.index, end: index < 0 ? end : Math.min(end, index + delimiter.length) };
  };
}

/** Ruby/Perl paired quote operators: nesting and escaped delimiters, not expansion. */
export function pairedQuote(opening) {
  return ({ source, start, end }) => {
    const pattern = new RegExp(opening.source, 'g');
    pattern.lastIndex = start;
    const match = pattern.exec(source);
    if (!match || match.index >= end || pattern.lastIndex > end) return null;
    const open = match[1];
    const close = { '(': ')', '[': ']', '{': '}', '<': '>' }[open] ?? open;
    let depth = 1;
    for (let cursor = pattern.lastIndex; cursor < end; cursor++) {
      if (source[cursor] === '\\') { cursor++; continue; }
      if (open !== close && source[cursor] === open) depth++;
      if (source[cursor] === close && --depth === 0) return { start: match.index, end: cursor + 1 };
    }
    return { start: match.index, end };
  };
}
