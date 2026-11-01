/**
 * Display text literally in a terminal, not as terminal commands.
 * Preserve tabs/LF; normalize CRLF; visibly escape other C0, DEL, C1 and
 * Unicode bidi controls. This is character escaping, not an ANSI parser or
 * protection against every Unicode visual deception. Input is not mutated.
 * @param {string} text
 */
export function escapeTerminalText(text) {
  return text.replace(/\r\n|[\x00-\x08\x0b-\x1f\x7f-\x9f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, character => {
    if (character === '\r\n') return '\n';
    const code = character.charCodeAt(0);
    return code <= 0xff
      ? `\\x${code.toString(16).padStart(2, '0')}`
      : `\\u${code.toString(16).padStart(4, '0')}`;
  });
}
