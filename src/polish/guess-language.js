/** Bounded, deliberately conservative signatures, not full-catalog detection.
 * No tokenization, grammar imports, filename inference or ANSI interpretation.
 * A tie between available candidates is treated as unknown.
 */
// Each signature names its input view: code masks strings and comments;
// structure retains comment-like punctuation used by headings and directives.
const signatures = [
  ['sql', /\bselect\b[^;]*\bfrom\b|\binsert\s+into\b|\bcreate\s+(?:table|view|index)\b|\bupdate\s+[\w."]+\s+set\b|\bdelete\s+from\b/i, 'code'],
  ['python', /^(?:[ \t]*(?:async\s+)?def\s+\w+\s*\([^\r\n]*\)\s*(?:->[^\r\n:]+)?:|[ \t]*from\s+\w[\w.]*\s+import\s+|[ \t]*if\s+__name__\s*==)/m, 'code'],
  ['typescript', /\binterface\s+\w+\s*(?:extends\s+\w+\s*)?\{|\btype\s+\w+\s*=|\b(?:const|let)\s+\w+\s*:\s*(?:string|number|boolean)\b/, 'code'],
  ['javascript', /\b(?:const|let|var)\s+[\w$]+\s*=|\bfunction\s+[\w$]+\s*\(|\bconsole\.log\s*\(/, 'code'],
  ['rust', /\bfn\s+\w+\s*(?:<[^\r\n>]*>)?\(|\buse\s+\w+::/, 'code'],
  ['go', /^package\s+\w+[ \t]*\r?$/m, 'code'],
  ['php', /<\?php\b/, 'code'],
  ['bash', /^#![^\r\n]*\b(?:bash|sh)\b/, 'structure'],
  ['ruby', /^#![^\r\n]*\bruby\b|^\s*def\s+\w+[!?]?[ \t]*\r?$/m, 'structure'],
  ['java', /\bpublic\s+(?:(?:final|abstract)\s+)?class\s+\w+|\bSystem\.out\.println\s*\(/, 'code'],
  ['csharp', /\busing\s+System\s*;|\bConsole\.WriteLine\s*\(/, 'code'],
  ['cpp', /^\s*#\s*include\s*<\s*(?:iostream|vector|string|memory)\s*>|\bstd::/m, 'structure'],
  ['c', /^\s*#\s*include\s*[<"](?:stdio|stdlib|string|stdint)\.h[>"]/m, 'structure'],
  ['html', /<!doctype\s+html\b|<(?:html|div|span|p|script|style|body|pre|code|a|h[1-6])(?:\s[^<>]*)?>/i, 'structure'],
  ['xml', /^\s*<\?xml\s/, 'structure'],
  ['css', /(?:^|\n)[ \t]*[.#][\w-]+\s*\{[^}]*[\w-]+\s*:/, 'structure'],
  ['dockerfile', /^FROM\s+[\w./:-]+(?:\s+AS\s+\w+)?[ \t]*\r?$/m, 'structure'],
  ['markdown', /^#{1,6}\s+\S/m, 'structure'],
];

/** Best-effort shared lexical mask, not a parser for any one language.
 * Preserve line breaks and offsets; mask single/double/backtick strings,
 * Python triple quotes, backslash/doubled escapes and common comments.
 */
function maskLiteralsAndComments(source, comments = true) {
  const chars = source.split('');
  const blank = (start, end) => {
    for (let i = start; i < end; i++) if (chars[i] !== '\r' && chars[i] !== '\n') chars[i] = ' ';
  };
  let i = 0;
  while (i < source.length) {
    const start = i;
    const quote = source[i];
    if (quote === "'" || quote === '"' || quote === '`') {
      // A quoted #include header is structural syntax, not a string literal.
      // Check here so an outer Python string still masks an entire directive.
      if (!comments && quote === '"') {
        const lineStart = Math.max(source.lastIndexOf('\n', i - 1), source.lastIndexOf('\r', i - 1)) + 1;
        if (/^[ \t]*#[ \t]*include[ \t]*$/.test(source.slice(lineStart, i))) {
          const header = /^"[^"\r\n]+"/.exec(source.slice(i));
          if (header) { i += header[0].length; continue; }
        }
      }
      const delimiter = quote !== '`' && source.startsWith(quote.repeat(3), i) ? quote.repeat(3) : quote;
      i += delimiter.length;
      while (i < source.length) {
        if (source[i] === '\\') { i += Math.min(2, source.length - i); continue; }
        if (source.startsWith(delimiter, i)) {
          i += delimiter.length;
          if (delimiter.length === 1 && source[i] === quote) { i++; continue; }
          break;
        }
        i++;
      }
      blank(start, i);
    } else if (comments && source.startsWith('/*', i)) {
      const close = source.indexOf('*/', i + 2);
      i = close < 0 ? source.length : close + 2;
      blank(start, i);
    } else if (comments && (quote === '#' || source.startsWith('//', i) || source.startsWith('--', i))) {
      while (i < source.length && source[i] !== '\r' && source[i] !== '\n') i++;
      blank(start, i);
    } else i++;
  }
  return chars.join('');
}

export function guessRegisteredLanguage(source, hasLanguage) {
  // Inspect a small prefix only; never run every grammar over the source.
  const sample = source.slice(0, 8192);
  if (!sample.trim()) return '';
  const views = {
    code: maskLiteralsAndComments(sample),
    structure: maskLiteralsAndComments(sample, false),
  };
  const candidates = [];
  for (const [id, pattern, view] of signatures) {
    if (hasLanguage(id) && pattern.test(views[view])) candidates.push(id);
  }
  // A heading-like Python comment is weaker than an actual code signature.
  if (candidates.length > 1 && candidates.includes('markdown')) candidates.splice(candidates.indexOf('markdown'), 1);
  // TypeScript's distinctive syntax is stronger evidence than shared JS forms.
  if (candidates.includes('typescript')) {
    const index = candidates.indexOf('javascript');
    if (index >= 0) candidates.splice(index, 1);
  }
  if (hasLanguage('json') && /^[\s]*[\[{]/.test(sample) && source.length <= 8192) {
    try {
      const value = JSON.parse(source);
      if (value !== null && typeof value === 'object') candidates.push('json');
    } catch { /* Invalid or incomplete JSON is not enough evidence. */ }
  }
  return candidates.length === 1 ? candidates[0] : '';
}
