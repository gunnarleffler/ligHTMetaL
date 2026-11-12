// Optional source colors. This module never reads or changes the editable DOM.
const kinds = new Set(['plain', 'comment', 'keyword', 'string', 'number', 'boolean', 'constant', 'function', 'type', 'variable', 'property', 'operator', 'punctuation', 'tag', 'attribute']);

function checkedTokens(result, length) {
  if (!Array.isArray(result?.tokens)) return [];
  let end = 0;
  const tokens = [];
  for (const token of result.tokens) {
    if (!token || token.start !== end || !Number.isSafeInteger(token.end) || token.end <= end || token.end > length || !kinds.has(token.kind)) return [];
    tokens.push({ start: end, end: token.end, kind: token.kind });
    end = token.end;
  }
  return end === length ? tokens : [];
}

export function createSourceHighlighter(highlight) {
  let cache = new Map();
  return (source, lines, current) => {
    const raw = source.split('\n'), jobs = [], fences = new Set(), regions = new Set();
    const segment = (part, start = part.bodyStart, end = raw[part.index].length) => ({ line: part.index, start, end });
    for (const part of lines) {
      if (part.fence && !fences.has(part.fence)) {
        const block = part.fence;
        fences.add(block);
        const opening = raw[block.parts[0].index].slice(block.parts[0].bodyStart);
        const language = /^ {0,3}(?:`{3,}|~{3,})\s*(\S*)/.exec(opening)?.[1] || '';
        const body = block.parts.slice(1, block.close ? -1 : undefined);
        if (body.length) jobs.push({ language, segments: body.map(part => segment(part)) });
      }
      for (const region of part.regions || []) regions.add(region);
    }
    // Inline pair offsets already refer to original UTF-16 source. Strip only
    // recognized container prefixes on continuation lines, keeping the code bytes.
    for (const region of regions) {
      for (const pair of region.pairs) {
        if (pair.name !== 'code') continue;
        let low = 0, high = lines.length - 1;
        while (low < high) {
          const middle = Math.ceil((low + high) / 2);
          if (lines[middle].sourceStart <= pair.content) low = middle;
          else high = middle - 1;
        }
        const segments = [];
        for (let i = low; i < lines.length && lines[i].sourceStart <= pair.close; i++) {
          const part = lines[i];
          segments.push(segment(part, Math.max(part.bodyStart, pair.content - part.sourceStart), Math.min(raw[i].length, pair.close - part.sourceStart)));
        }
        if (segments.length) jobs.push({ language: '', segments });
      }
    }
    const next = new Map(), colors = new Map();
    for (const { language, segments } of jobs) {
      const code = segments.map(({ line, start, end }) => raw[line].slice(start, end)).join('\n');
      const key = JSON.stringify([language, code]);
      let tokens = next.get(key) || cache.get(key);
      if (!tokens) {
        try { tokens = checkedTokens(highlight(code, language), code.length); }
        catch { tokens = []; }
        if (!current()) return false;
      }
      next.set(key, tokens);
      let offset = 0, index = 0;
      for (const { line, start, end } of segments) {
        const limit = offset + end - start;
        while (index < tokens.length && tokens[index].end <= offset) index++;
        for (let at = index; at < tokens.length && tokens[at].start < limit; at++) {
          const token = tokens[at];
          if (token.kind === 'plain') continue;
          if (!colors.has(line)) colors.set(line, []);
          colors.get(line).push({ start: start + Math.max(offset, token.start) - offset,
            end: start + Math.min(limit, token.end) - offset, kind: token.kind });
        }
        offset = limit + 1;
      }
    }
    cache = next; // Keep only snippets present in this render, not editing history.
    for (const [line, ranges] of colors) {
      ranges.sort((a, b) => a.start - b.start);
      const painted = [];
      let offset = 0, index = 0;
      for (const token of lines[line].tokens) {
        const end = offset + token.text.length;
        while (offset < end) {
          while (index < ranges.length && ranges[index].end <= offset) index++;
          const range = ranges[index], colored = range && range.start <= offset;
          const stop = Math.min(end, range ? (colored ? range.end : range.start) : end);
          painted.push({ text: raw[line].slice(offset, stop),
            className: token.className + (colored ? ' token ' + range.kind : '') });
          offset = stop;
        }
        if (!token.text) painted.push(token);
      }
      lines[line].tokens = painted;
    }
    return true;
  };
}
