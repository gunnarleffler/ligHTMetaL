// Dependency-free Markdown subset. Source is tokenized, never generated HTML.
const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const MAX_DEPTH = 64;
const escapeHTML = (text) => text.replace(/[&<>"']/g, (char) => ENTITIES[char]);
const escapeText = (text) => text.replace(/&(?:[a-z][a-z\d]*|#\d+|#x[\da-f]+);|[&<>"']/gi,
  (part) => part.length > 1 ? part : ENTITIES[part]);
const unescape = (text) => text.replace(/\\([!-/:-@\[-`{-~])/g, '$1');
const referenceKey = (text) => unescape(text).trim().replace(/\s+/g, ' ').toLowerCase();

const EMAIL_ADDRESS = /^[a-z\d.!#$%&'*+/=?^_`{|}~-]+@[a-z\d](?:[a-z\d-]*[a-z\d])?(?:\.[a-z\d](?:[a-z\d-]*[a-z\d])?)*$/i;
const HTML_BLOCK_TAGS = new Set(('address article aside base basefont blockquote body caption center col colgroup ' +
  'dd details dialog dir div dl dt fieldset figcaption figure footer form frame frameset h1 h2 h3 h4 h5 h6 ' +
  'head header hr html iframe legend li link main menu menuitem nav noframes ol optgroup option p param ' +
  'search section summary table tbody td tfoot th thead title tr track ul').split(' '));

function safeDestination(url, image = false) {
  // Validate raw URL characters, not HTML-decoded or browser-repaired schemes.
  if (!url || /[\s\\\u0000-\u001f\u007f]/u.test(url) ||
      /&(?:#x[\da-f]+|#\d+|[a-z][a-z\d]*);/i.test(url)) return false;
  if (/^https?:\/\//i.test(url)) {
    try { return Boolean(new URL(url).hostname); } catch { return false; }
  }
  if (!image && /^tel:/i.test(url)) {
    return /^tel:\+?[\d().-]+(?:;ext=\d+)?$/i.test(url) && /\d/.test(url.split(';')[0]);
  }
  if (!image && /^mailto:/i.test(url)) {
    return url.slice(7).split('?')[0].split(',').every((address) => EMAIL_ADDRESS.test(address));
  }
  return !url.startsWith('//') && !/^[^/?#]*:/.test(url);
}

// Destination, optional quoted title, and optional validated image dimensions.
function destination(source, image = false) {
  const text = source.trim();
  const urlMatch = text.startsWith('<') ? text.match(/^<([^<>]*)>/) : text.match(/^(?:\\.|[^\s])+/);
  if (!urlMatch) return null;
  const url = unescape(urlMatch[1] ?? urlMatch[0]);
  let rest = text.slice(urlMatch[0].length);
  let title;
  let style;
  while (rest) {
    if (!/^\s/.test(rest)) return null;
    rest = rest.trimStart();
    if (!rest) break;
    const quoted = rest.match(/^(?:"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)')/);
    const size = image && rest.match(/^=(\d+%?)?(?:x(\d+%?)?)?(?=\s|$)/);
    if (quoted && title === undefined) {
      title = unescape(quoted[1] ?? quoted[2]);
      rest = rest.slice(quoted[0].length);
    } else if (size && (size[1] || size[2]) && style === undefined) {
      style = [size[1] && `width:${size[1]}${size[1].endsWith('%') ? '' : 'px'}`,
        size[2] && `height:${size[2]}${size[2].endsWith('%') ? '' : 'px'}`].filter(Boolean).join(';');
      rest = rest.slice(size[0].length);
    } else return null;
  }
  // URL policy is checked at use time: a reference may be a link or an image.
  return { url, title, style };
}

function codeAt(text, start) {
  const run = text.slice(start).match(/^`+/)[0];
  const ticks = /`+/g;
  ticks.lastIndex = start + run.length;
  let close;
  while ((close = ticks.exec(text))) {
    if (close[0].length !== run.length) continue;
    let value = text.slice(start + run.length, close.index).replace(/\n/g, ' ');
    if (/^ .* $/.test(value) && /[^ ]/.test(value)) value = value.slice(1, -1);
    return { type: 'code', text: value, end: ticks.lastIndex };
  }
  // An unmatched run is one literal token, not several shorter openers.
  return { type: 'text', text: run, end: start + run.length };
}

// Balanced source delimiters, skipping escapes, code in labels, and quoted titles.
function closing(text, start, open, close) {
  let depth = 1;
  for (let i = start + 1; i < text.length; i++) {
    if (text[i] === '\\') { i++; continue; }
    if (open === '[' && text[i] === '<') {
      const angle = angleAt(text, i);
      if (angle) { i = angle.end - 1; continue; }
    }
    if (open === '[' && text[i] === '`') {
      const code = codeAt(text, i);
      i = code.end - 1; continue;
    }
    if (open === '(' && /["']/.test(text[i]) && /\s/.test(text[i - 1])) {
      const quote = text[i++];
      while (i < text.length && text[i] !== quote) { if (text[i] === '\\') i++; i++; }
      continue;
    }
    if (text[i] === open) depth++;
    if (text[i] === close && --depth === 0) return i;
  }
  return -1;
}

function linkAt(text, start, references) {
  const image = text.startsWith('![', start);
  const begin = start + (image ? 1 : 0);
  if (text[begin] !== '[') return null;
  const close = closing(text, begin, '[', ']');
  if (close < 0) return null;
  const label = text.slice(begin + 1, close);
  let end = close + 1;
  let target;
  if (text[end] === '(') {
    const finish = closing(text, end, '(', ')');
    if (finish < 0) return null;
    target = destination(text.slice(end + 1, finish), image);
    end = finish + 1;
  } else {
    let key = label;
    if (text[end] === '[') {
      const finish = closing(text, end, '[', ']');
      if (finish < 0) return null;
      key = text.slice(end + 1, finish) || label;
      end = finish + 1;
    }
    target = references?.get(referenceKey(key));
  }
  return { type: 'link', image, label, target, end, raw: text.slice(start, end) };
}

// HTML recognition, not sanitization. Attribute values are opaque to Markdown.
function htmlAt(text, start) {
  const source = text.slice(start);
  const special = source.match(/^(?:<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[[\s\S]*?\]\]>|<![a-z][^>]*>)/i);
  if (special) return { type: 'html', raw: special[0], end: start + special[0].length };
  const tag = source.match(/^(?:<\/[a-z][a-z\d-]*\s*>|<[a-z][a-z\d-]*(?:\s+[a-z_:][a-z\d_:.-]*(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*\s*\/?>)/i);
  return tag ? { type: 'html', tag: true, raw: tag[0], end: start + tag[0].length } : null;
}

function angleAt(text, start) {
  const match = text.slice(start).match(/^<([^<>\s]+)>/);
  if (match) {
    const label = match[1];
    const email = EMAIL_ADDRESS.test(label);
    if (email || /^[a-z][a-z\d+.-]{1,31}:/i.test(label)) {
      const url = email ? `mailto:${label.replace(/[%?#]/g, encodeURIComponent)}` : label;
      return { type: 'autolink', label, url, raw: match[0], end: start + match[0].length };
    }
  }
  return htmlAt(text, start);
}

function htmlBlockAt(line) {
  const text = line.replace(/^ {0,3}/, '');
  const rawText = text.match(/^<(script|pre|style|textarea)(?=[\s>]|$)/i);
  let end;
  if (rawText) end = new RegExp(`</${rawText[1]}\\s*>`, 'i');
  else if (text.startsWith('<!--')) end = /-->/;
  else if (text.startsWith('<?')) end = /\?>/;
  else if (text.startsWith('<![CDATA[')) end = /\]\]>/;
  else if (/^<![a-z]/i.test(text)) end = />/;
  if (end) return { type: 'html', end, interrupt: true };

  const name = text.match(/^<\/?([a-z][a-z\d-]*)(?=[\s>]|\/>|$)/i)?.[1];
  if (name && HTML_BLOCK_TAGS.has(name.toLowerCase())) return { type: 'html', interrupt: true };
  const token = htmlAt(text, 0);
  return token?.tag && !text.slice(token.end).trim() ? { type: 'html', interrupt: false } : null;
}

function delimiter(text, start) {
  const char = text[start];
  if (!'*_~'.includes(char)) return null;
  let end = start + 1;
  while (text[end] === char) end++;
  const count = end - start;
  if (char === '~' && count !== 2) return null;
  const before = text[start - 1] || '\n';
  const after = text[end] || '\n';
  const punct = (value) => /[\p{P}\p{S}]/u.test(value);
  const left = !/\s/.test(after) && (!punct(after) || /\s/.test(before) || punct(before));
  const right = !/\s/.test(before) && (!punct(before) || /\s/.test(after) || punct(after));
  return { type: 'delimiter', char, count, raw: char, end,
    open: left && (char !== '_' || !right || punct(before)),
    close: right && (char !== '_' || !left || punct(after)) };
}

// Pair delimiter tokens into a small tree. Unmatched delimiters remain text;
// crossing pairs cannot produce malformed HTML or cross a code/link boundary.
function pairDelimiters(tokens) {
  const out = [];
  const stack = [];
  for (const token of tokens) {
    if (token.type !== 'delimiter') { out.push(token); continue; }
    while (token.close && token.count) {
      let found = stack.length - 1;
      while (found >= 0) {
        const opener = stack[found].token;
        const oddMatch = (opener.close || token.open) && token.char !== 'q' && token.char !== '~' &&
          (opener.count + token.count) % 3 === 0 && (opener.count % 3 || token.count % 3);
        if (opener.char === token.char && !oddMatch) break;
        found--;
      }
      if (found < 0) break;
      const { token: opener, index } = stack[found];
      const count = Math.min(opener.count, token.count) >= 2 ? 2 : 1;
      const children = out.splice(index + 1);
      const type = token.char === 'q' ? 'q' : token.char === '~' ? 'del' : count === 2 ? 'strong' : 'em';
      opener.count -= count;
      token.count -= count;
      stack.length = found + 1;
      if (!opener.count) { out.pop(); stack.pop(); }
      out.push({ type, children, opening: opener.raw.repeat(count), closing: token.raw.repeat(count) });
    }
    if (token.count) {
      if (token.open) stack.push({ token, index: out.length });
      out.push(token);
    }
  }
  return out;
}

function inline(text, context, depth = 0, links = true, plain = false) {
  if (depth >= MAX_DEPTH) return plain ? text : escapeHTML(text);
  const tokens = [];
  const append = (value) => {
    if (tokens.at(-1)?.type === 'text') tokens.at(-1).text += value;
    else tokens.push({ type: 'text', text: value });
  };
  for (let i = 0; i < text.length;) {
    let token;
    if (text[i] === '\\' && text[i + 1] === '\n') {
      tokens.push({ type: 'br' }); i += 2;
    } else if (text[i] === '\\' && /[!-/:-@\[-`{-~]/.test(text[i + 1] || '')) {
      append(text[i + 1]); i += 2;
    } else if (text[i] === '\n' && tokens.at(-1)?.type === 'text' && / {2,}$/.test(tokens.at(-1).text)) {
      tokens.at(-1).text = tokens.at(-1).text.replace(/ +$/, '');
      tokens.push({ type: 'br' }); i++;
    } else if (text[i] === '`') {
      token = codeAt(text, i);
      tokens.push(token); i = token.end;
    } else if (text[i] === '<' && (token = angleAt(text, i))) {
      tokens.push(token); i = token.end;
    } else if ((text[i] === '[' || text.startsWith('![', i)) && (token = linkAt(text, i, context.references))) {
      tokens.push(token); i = token.end;
    } else if (text.startsWith(':"', i) || text.startsWith('":', i)) {
      const raw = text.slice(i, i + 2);
      tokens.push({ type: 'delimiter', char: 'q', raw, count: 1, open: raw === ':"', close: raw === '":' });
      i += 2;
    } else if ((token = delimiter(text, i))) {
      tokens.push(token); i = token.end;
    } else {
      append(text[i++]);
    }
  }
  const render = (nodes, level) => nodes.map((node) => {
    if (node.type === 'text') return plain ? node.text : escapeText(node.text);
    if (node.type === 'delimiter') return plain ? node.raw.repeat(node.count) : escapeText(node.raw.repeat(node.count));
    if (node.type === 'br') return plain ? ' ' : '<br>\n';
    if (node.type === 'code') return plain ? node.text : `<code>${escapeHTML(node.text)}</code>`;
    if (node.type === 'html') return plain || context.allowHTML ? node.raw : escapeHTML(node.raw);
    if (node.type === 'autolink') {
      if (!links || !safeDestination(node.url)) return plain ? node.raw : escapeHTML(node.raw);
      return plain ? node.label : `<a href="${escapeHTML(node.url)}">${escapeHTML(node.label)}</a>`;
    }
    if (node.type === 'link') {
      if (!node.target || !safeDestination(node.target.url, node.image) || (!links && !node.image)) {
        return plain ? node.raw : escapeHTML(node.raw);
      }
      const { url, title, style } = node.target;
      // Label parsing shares the budget already consumed by surrounding markup.
      const label = inline(node.label, context, level + 1, false, plain || node.image);
      if (plain) return label;
      const titleAttr = title === undefined ? '' : ` title="${escapeHTML(title)}"`;
      if (node.image) return `<img src="${escapeHTML(url)}" alt="${escapeHTML(label)}"${titleAttr}${style ? ` style="${style}"` : ''}>`;
      return `<a href="${escapeHTML(url)}"${titleAttr}>${label}</a>`;
    }
    // Iterative pairing can make deep trees; bound rendering as well as parsing.
    if (level >= MAX_DEPTH) return renderDepthFallback([node], level);
    const content = render(node.children, level + 1);
    return plain ? content : `<${node.type}>${content}</${node.type}>`;
  }).join('');
  // Flatten excess delimiter nesting, retaining markers and leaf rendering.
  // This is not plain-text mode: code/links can still emit HTML, but their
  // labels must not restart the exhausted recursion budget.
  const renderDepthFallback = (nodes, level) => {
    const pending = [...nodes].reverse();
    let value = '';
    while (pending.length) {
      const node = pending.pop();
      if (node.children) {
        pending.push({ type: 'text', text: node.closing });
        for (let i = node.children.length - 1; i >= 0; i--) pending.push(node.children[i]);
        pending.push({ type: 'text', text: node.opening });
      } else value += render([node], level);
    }
    return value;
  };
  return render(pairDelimiters(tokens), depth);
}

function splitRow(line) {
  const text = line.trim();
  const cells = [];
  let cell = '';
  let pipes = 0;
  for (let i = 0; i < text.length;) {
    if (text[i] === '\\' && i + 1 < text.length) {
      cell += text.slice(i, i + 2);
      i += 2;
      continue;
    }
    let token;
    if (text[i] === '`') token = codeAt(text, i);
    else if (text[i] === '[' || text.startsWith('![', i)) token = linkAt(text, i);
    else if (text[i] === '<') token = angleAt(text, i);

    if (token) {
      cell += text.slice(i, token.end);
      i = token.end;
    } else if (text[i] === '|') {
      cells.push(cell.trim());
      cell = '';
      pipes++;
      i++;
    } else cell += text[i++];
  }
  cells.push(cell.trim());
  if (text.startsWith('|')) cells.shift();
  if (cells.at(-1) === '' && text.endsWith('|')) cells.pop();
  return { cells, pipes };
}

function tableAt(lines, index) {
  if (index + 1 >= lines.length || !lines[index].includes('|')) return null;
  const { cells: headers, pipes } = splitRow(lines[index]);
  const { cells: separators } = splitRow(lines[index + 1]);
  if (!pipes || !headers.length || headers.length !== separators.length ||
      !separators.every((cell) => /^:?-{3,}:?$/.test(cell))) return null;
  return { type: 'table', headers, alignments: separators.map((cell) =>
    cell.endsWith(':') ? (cell.startsWith(':') ? 'center' : 'right') : cell.startsWith(':') ? 'left' : '') };
}

function indent(line) {
  let width = 0;
  for (const char of line) {
    if (char === ' ') width++;
    else if (char === '\t') width += 4 - width % 4;
    else break;
  }
  return width;
}

function outdent(line, width) {
  let column = 0;
  let i = 0;
  while (column < width && /[ \t]/.test(line[i] || '')) {
    column += line[i++] === '\t' ? 4 - column % 4 : 1;
  }
  return ' '.repeat(Math.max(0, column - width)) + line.slice(i);
}

function listMarker(line) {
  const match = line.match(/^( {0,3})([-+*]|\d{1,9}[.)])(?:([ \t]+)(.*)|$)/);
  if (!match) return null;
  const ordered = /^\d/.test(match[2]);
  return { type: 'list', indent: match[1].length, ordered, start: ordered ? Number.parseInt(match[2], 10) : 1,
    width: indent(match[1] + ' '.repeat(match[2].length) + (match[3] || ' ')), text: match[4] || '' };
}

function basicBlock(line, allowHTML) {
  let match;
  if (indent(line) >= 4) return { type: 'code' };
  const html = allowHTML && htmlBlockAt(line);
  if (html) return html;
  if ((match = line.match(/^( {0,3})(`{3,}|~{3,})(?:[ \t]*([A-Za-z0-9_+-]+))?[ \t]*$/))) return { type: 'fence', match };
  if ((match = line.match(/^ {0,3}(#{1,6})(?:[ \t]+(.*)|[ \t]*)$/))) return { type: 'heading', level: match[1].length, text: (match[2] || '').replace(/[ \t]+#+[ \t]*$/, '').trim() };
  if (/^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/.test(line)) return { type: 'hr' };
  if (/^ {0,3}>[ \t]?/.test(line)) return { type: 'quote' };
  const marker = listMarker(line);
  if (marker) return marker;
  if ((match = line.match(/^ {0,3}\[([^\]\n]+)\]:[ \t]*(.+)$/))) {
    const target = destination(match[2]);
    if (target) return { type: 'definition', key: referenceKey(match[1]), target };
  }
  return null;
}

function blockAt(lines, index, context) {
  const basic = basicBlock(lines[index], context.allowHTML);
  if (basic) return basic;
  const table = tableAt(lines, index);
  if (table) return table;
  const underline = lines[index + 1]?.match(/^ {0,3}(={3,}|-{3,})[ \t]*$/);
  return underline ? { type: 'heading', level: underline[1][0] === '=' ? 1 : 2, text: lines[index].trim(), setext: true } : null;
}

function readList(lines, start, context, depth) {
  const first = listMarker(lines[start]);
  const items = [];
  let loose = false;
  let i = start;
  while (i < lines.length) {
    const marker = basicBlock(lines[i], context.allowHTML);
    if (marker?.type !== 'list' || marker.indent !== first.indent || marker.ordered !== first.ordered) break;
    const body = [marker.text];
    const task = body[0].match(/^\[([ xX])\](?:[ \t]+|$)/);
    if (task) body[0] = body[0].slice(task[0].length);
    i++;
    while (i < lines.length) {
      if (!lines[i].trim()) {
        let next = i + 1;
        while (next < lines.length && !lines[next].trim()) next++;
        const sibling = next < lines.length ? basicBlock(lines[next], context.allowHTML) : null;
        if (sibling?.type === 'list' && sibling.indent === first.indent && sibling.ordered === first.ordered) {
          loose = true; i = next; break;
        }
        if (next >= lines.length || indent(lines[next]) < marker.width) break;
        loose = true;
        // Nested code needs every blank line and any whitespace after outdenting.
        while (i < next) body.push(outdent(lines[i++], marker.width));
      } else if (indent(lines[i]) >= marker.width) {
        body.push(outdent(lines[i++], marker.width));
      } else break;
    }
    items.push({ children: blocks(body, context, depth + 1), task: task ? task[1] !== ' ' : undefined });
  }
  return { type: 'list', ordered: first.ordered, start: first.start, loose, items, end: i };
}

// Build block nodes before rendering so definitions can resolve forward links,
// including definitions in lists/quotes, without preprocessing code contents.
function blocks(lines, context, depth = 0) {
  if (depth >= MAX_DEPTH) return [{ type: 'literal', text: lines.join('\n') }];
  const nodes = [];
  let i = 0;
  while (i < lines.length) {
    if (!lines[i].trim()) { i++; continue; }
    const block = blockAt(lines, i, context);
    switch (block?.type) {
      case 'definition':
        if (!context.references.has(block.key)) context.references.set(block.key, block.target);
        if (!safeDestination(block.target.url)) nodes.push({ type: 'literal', text: lines[i] });
        i++;
        break;
      case 'html': {
        const raw = [];
        while (i < lines.length && (block.end || lines[i].trim())) {
          const line = lines[i++];
          raw.push(line);
          if (block.end?.test(line)) break;
        }
        nodes.push({ type: 'html', text: raw.join('\n') });
        break;
      }
      case 'fence': {
        const [, padding, fence, language] = block.match;
        const code = [];
        i++;
        while (i < lines.length) {
          const close = lines[i].match(/^ {0,3}(`+|~+)[ \t]*$/);
          if (close && close[1][0] === fence[0] && close[1].length >= fence.length) { i++; break; }
          code.push(outdent(lines[i++], padding.length));
        }
        nodes.push({ type: 'code', text: code.join('\n'), language });
        break;
      }
      case 'code': {
        const code = [];
        while (i < lines.length) {
          if (indent(lines[i]) >= 4) code.push(outdent(lines[i++], 4));
          else if (!lines[i].trim()) { code.push(''); i++; }
          else break;
        }
        while (code.at(-1) === '') code.pop();
        nodes.push({ type: 'code', text: code.join('\n') });
        break;
      }
      case 'heading': nodes.push(block); i += block.setext ? 2 : 1; break;
      case 'hr': nodes.push(block); i++; break;
      case 'list': {
        const list = readList(lines, i, context, depth);
        nodes.push(list); i = list.end;
        break;
      }
      case 'quote': {
        const quoted = [];
        let match;
        while (i < lines.length && (match = lines[i].match(/^ {0,3}>[ \t]?(.*)$/))) { quoted.push(match[1]); i++; }
        nodes.push({ type: 'quote', children: blocks(quoted, context, depth + 1) });
        break;
      }
      case 'table': {
        const rows = [];
        i += 2;
        while (i < lines.length && lines[i].trim() && !basicBlock(lines[i], context.allowHTML)) {
          const { cells, pipes } = splitRow(lines[i]);
          if (!pipes || cells.length > block.headers.length) break;
          while (cells.length < block.headers.length) cells.push('');
          rows.push(cells); i++;
        }
        nodes.push({ ...block, rows });
        break;
      }
      default: {
        const paragraph = [lines[i++]];
        while (i < lines.length && lines[i].trim()) {
          const next = blockAt(lines, i, context);
          if (next && next.type !== 'code' && (next.type !== 'html' || next.interrupt)) break;
          paragraph.push(lines[i++]);
        }
        nodes.push({ type: 'paragraph', text: paragraph.join('\n') });
      }
    }
  }
  return nodes;
}

function renderBlocks(nodes, context, tight = false, prefix = '') {
  return nodes.map((node, index) => {
    const lead = index === 0 ? prefix : '';
    if (node.type === 'paragraph') {
      const content = lead + inline(node.text, context);
      return tight ? content : `<p>${content}</p>`;
    }
    let html;
    switch (node.type) {
      case 'literal': html = `<p>${escapeHTML(node.text)}</p>`; break;
      case 'html': html = node.text; break;
      case 'heading': html = `<h${node.level}>${inline(node.text, context)}</h${node.level}>`; break;
      case 'hr': html = '<hr>'; break;
      case 'code': {
        const highlighted = context.highlight?.(node.text, node.language || '');
        if (highlighted != null && typeof highlighted !== 'string') throw new TypeError('highlight must return an HTML string, null, or undefined');
        html = `<pre><code${node.language ? ` class="language-${escapeHTML(node.language)}"` : ''}>${highlighted ?? escapeHTML(node.text)}</code></pre>`;
        break;
      }
      case 'quote': html = `<blockquote>${renderBlocks(node.children, context)}</blockquote>`; break;
      case 'list': {
        const tag = node.ordered ? 'ol' : 'ul';
        const items = node.items.map((item) => {
          const checkbox = item.task === undefined ? '' : `<input type="checkbox" disabled${item.task ? ' checked' : ''}> `;
          return `<li>${item.children.length ? renderBlocks(item.children, context, !node.loose, checkbox) : checkbox.trimEnd()}</li>`;
        });
        html = `<${tag}${node.ordered && node.start !== 1 ? ` start="${node.start}"` : ''}>${items.join('')}</${tag}>`;
        break;
      }
      case 'table': {
        const row = (tag, cells) => '<tr>' + cells.map((cell, column) =>
          `<${tag}${node.alignments[column] ? ` style="text-align:${node.alignments[column]}"` : ''}>${inline(cell, context)}</${tag}>`).join('') + '</tr>';
        html = `<table><thead>${row('th', node.headers)}</thead><tbody>${node.rows.map((cells) => row('td', cells)).join('')}</tbody></table>`;
        break;
      }
    }
    return lead + html;
  }).join('\n');
}

/** Convert a documented Markdown subset to HTML, synchronously and without I/O. */
export function parse(markdown, options = {}) {
  if (typeof markdown !== 'string') throw new TypeError('Markdown input must be a string');
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw new TypeError('Options must be an object');
  }
  const { html = 'escape', highlight } = options;
  if (html !== 'escape' && html !== 'allow') throw new TypeError('html must be "escape" or "allow"');
  if (highlight !== undefined && typeof highlight !== 'function') throw new TypeError('highlight must be a function');
  const context = { references: new Map(), allowHTML: html === 'allow', highlight };
  const nodes = blocks(markdown.replace(/\r\n?/g, '\n').split('\n'), context);
  return renderBlocks(nodes, context);
}
