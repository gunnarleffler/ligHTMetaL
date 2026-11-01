/** Escape source text before inserting it into HTML contents. @param {string} text */
export const escapeHTML = text => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/**
 * Keep markup/SGR outside surrogate pairs so UTF-8 encoding preserves them.
 * The following token styles the complete character; token offsets stay intact.
 * @param {string} source
 * @param {number} start
 * @param {number} end
 */
export function tokenText(source, start, end) {
  // An astral code point just before a boundary straddles that boundary.
  if (source.codePointAt(start - 1) > 0xffff) start--;
  if (source.codePointAt(end - 1) > 0xffff) end--;
  return source.slice(start, end);
}
