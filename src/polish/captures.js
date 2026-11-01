/**
 * Flatten classified captures into a partition of one match. Numeric capture
 * indices only. Nested captures override enclosing captures; equal spans use
 * the higher capture index. Captures outside group 0 (lookaround captures) and
 * crossing spans are rejected rather than assigned surprising precedence.
 * @param {RegExpExecArray} match
 * @param {Record<string, import('./index.js').TokenKind>} captures
 * @param {import('./index.js').TokenKind} defaultKind
 * @param {number} bound
 * @returns {{start: number, end: number, kind: import('./index.js').TokenKind}[]}
 */
export function flattenCaptures(match, captures, defaultKind, bound) {
  const start = match.index;
  const end = Math.min(start + match[0].length, bound);
  const spans = [];
  for (const [key, kind] of Object.entries(captures)) {
    const index = Number(key);
    if (!match.indices || index >= match.indices.length) throw new Error(`Capture group does not exist: ${key}`);
    const offsets = match.indices[index];
    if (!offsets) continue; // An optional group did not participate.
    if (offsets[0] < start || offsets[1] > start + match[0].length) throw new Error(`Capture outside consumed match: ${key}`);
    if (offsets[0] === offsets[1]) continue;
    // Resolve nesting and crossings before clipping: a bound can make
    // distinct original spans appear equal or hide an invalid crossing.
    spans.push({ start: offsets[0], end: offsets[1], kind, index });
  }
  spans.sort((a, b) => a.start - b.start || b.end - a.end || a.index - b.index);
  const stack = [];
  const result = [];
  let cursor = start;
  const emit = (to, kind) => {
    const clippedEnd = Math.min(to, end);
    if (clippedEnd > cursor) {
      result.push({ start: cursor, end: clippedEnd, kind });
      cursor = clippedEnd;
    }
  };
  for (const span of spans) {
    while (stack.length && stack.at(-1).end <= span.start) {
      const current = stack.pop();
      emit(current.end, current.kind);
    }
    if (stack.length && span.end > stack.at(-1).end) throw new Error('Crossing capture spans are not supported');
    emit(span.start, stack.at(-1)?.kind ?? defaultKind);
    stack.push(span);
  }
  while (stack.length) {
    const current = stack.pop();
    emit(current.end, current.kind);
  }
  emit(end, defaultKind);
  return result;
}
