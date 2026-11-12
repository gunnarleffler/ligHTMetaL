var maiden = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // src/maiden.js
  var maiden_exports = {};
  __export(maiden_exports, {
    default: () => maiden_default,
    init: () => init
  });

  // src/toolbar-groups.js
  var groups = [
    ["bold", "italic", "underline", "strikethrough", "script", "font", "formatting"],
    ["headings", "heading1", "heading2", "paragraph"],
    ["quote", "ulist", "olist", "indentation", "alignment"],
    ["code", "codeblock"],
    ["line", "link", "image", "table"],
    ["undo", "redo"],
    ["preview", "side-by-side", "fullscreen", "source", "guide"]
  ];
  function groupToolbar(toolbar, entries) {
    const sections = [];
    for (const entry of entries) {
      const group = groups.findIndex((names) => names.includes(entry.name));
      let section = sections[sections.length - 1];
      if (!section || section.group !== group) {
        const divider = sections.length ? toolbar.ownerDocument.createElement("span") : null;
        if (divider) {
          divider.className = "lightmetal-toolbar-separator";
          divider.setAttribute("role", "separator");
          divider.setAttribute("aria-orientation", "vertical");
          toolbar.insertBefore(divider, entry.button);
        }
        section = { group, divider, buttons: [] };
        sections.push(section);
      }
      section.buttons.push(entry.button);
    }
    const refresh = () => {
      let previous = false;
      for (const section of sections) {
        const visible = section.buttons.some((button) => {
          const style = toolbar.ownerDocument.defaultView.getComputedStyle(button);
          return !button.hidden && style.display !== "none" && style.visibility !== "hidden";
        });
        if (section.divider) section.divider.hidden = !visible || !previous;
        if (visible) previous = true;
      }
    };
    refresh();
    const observer = new MutationObserver((records) => {
      if (records.some((record) => record.target.tagName === "BUTTON" || record.target === toolbar && (record.attributeName === "class" || record.attributeName === "style"))) refresh();
    });
    observer.observe(toolbar, { subtree: true, attributes: true, attributeFilter: ["hidden", "style", "class", "disabled"] });
    return () => observer.disconnect();
  }

  // src/markdown-preview.js
  function paintPreview(target, source) {
    let cursor = target.firstChild;
    const hide = (node) => {
      if (node.nodeType === 3) {
        if (node.data) node.data = "";
      } else if (!node.hidden) {
        node.hidden = true;
        for (const child of node.childNodes) hide(child);
      }
    };
    for (const wanted of source.childNodes) {
      while (cursor && (cursor.nodeType !== wanted.nodeType || cursor.nodeName !== wanted.nodeName)) {
        hide(cursor);
        cursor = cursor.nextSibling;
      }
      if (!cursor) {
        target.append(wanted.cloneNode(true));
        continue;
      }
      if (cursor.nodeType === 3) {
        if (cursor.data !== wanted.data) cursor.data = wanted.data;
      } else {
        for (const attr of Array.from(cursor.attributes)) if (!wanted.hasAttribute(attr.name)) cursor.removeAttribute(attr.name);
        for (const attr of wanted.attributes) if (cursor.getAttribute(attr.name) !== attr.value) cursor.setAttribute(attr.name, attr.value);
        paintPreview(cursor, wanted);
      }
      cursor = cursor.nextSibling;
    }
    while (cursor) {
      hide(cursor);
      cursor = cursor.nextSibling;
    }
  }
  function imageURL(value, base, origin) {
    if (!value || /[\u0000-\u001f\u007f]/.test(value)) return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (/^data:/i.test(trimmed)) {
      if (!/^data:image\/(?:png|jpeg|gif|webp);base64,[a-z0-9+/]+={0,2}$/i.test(trimmed)) return null;
      try {
        atob(trimmed.slice(trimmed.indexOf(",") + 1));
        return trimmed;
      } catch {
        return null;
      }
    }
    try {
      const url = new URL(trimmed, base);
      if (["http:", "https:"].includes(url.protocol)) return url.href;
      if (url.protocol === "blob:" && origin && origin !== "null" && url.origin === origin) return url.href;
      return null;
    } catch {
      return null;
    }
  }
  function previewHTML(document2, html) {
    const template = document2.createElement("template");
    template.innerHTML = html;
    const allowed = new Set("p br hr h1 h2 h3 h4 h5 h6 strong b em i s del blockquote ul ol li pre code a table thead tbody tfoot tr th td span div dl dt dd sup sub".split(" "));
    const tokenClasses = new Set("token plain comment keyword string number boolean constant function type variable property operator punctuation tag attribute".split(" "));
    const blocked = new Set("script style iframe object embed svg math form input button textarea select link meta base audio video source".split(" "));
    const clean = (source, target) => {
      for (const node of source.childNodes) {
        if (node.nodeType === 3) {
          target.append(document2.createTextNode(node.data));
          continue;
        }
        if (node.nodeType !== 1) continue;
        if (node.localName === "input" && node.getAttribute("type")?.toLowerCase() === "checkbox") {
          target.append(document2.createTextNode(node.hasAttribute("checked") ? "\u2611 " : "\u2610 "));
          continue;
        }
        if (blocked.has(node.localName)) continue;
        if (node.localName === "img") {
          const src = imageURL(node.getAttribute("src"), document2.baseURI, document2.location?.origin);
          if (!src) {
            target.append(document2.createTextNode("[Image: " + (node.getAttribute("alt") || "image") + "]"));
            continue;
          }
          const image = document2.createElement("img");
          for (const attr of ["alt", "title"]) if (node.hasAttribute(attr)) image.setAttribute(attr, node.getAttribute(attr));
          for (const attr of ["width", "height"]) {
            const value = node.getAttribute(attr);
            if (value && /^\d+$/.test(value) && Number(value) > 0 && Number(value) <= 4294967295) image.setAttribute(attr, String(Number(value)));
          }
          for (const [attr, values] of [["loading", ["lazy", "eager"]], ["decoding", ["async", "sync", "auto"]]]) {
            const value = node.getAttribute(attr)?.trim().toLowerCase();
            if (values.includes(value)) image.setAttribute(attr, value);
          }
          image.referrerPolicy = "no-referrer";
          image.src = src;
          target.append(image);
          continue;
        }
        if (!allowed.has(node.localName)) {
          clean(node, target);
          continue;
        }
        const copy = document2.createElement(node.localName);
        if (node.localName === "a") {
          const href = node.getAttribute("href");
          try {
            const url = new URL(href, document2.baseURI);
            if (href && !/[\u0000-\u0020\u007f]/.test(href) && ["http:", "https:", "mailto:"].includes(url.protocol)) {
              copy.setAttribute("href", href);
              copy.target = "_blank";
              copy.rel = "noopener noreferrer";
            }
          } catch {
          }
        }
        const classes = Array.from(node.classList).filter((name) => /^(?:hljs(?:-[a-z0-9_-]+)?|language-[a-z0-9_-]+)$/.test(name) || node.localName === "span" && node.classList.contains("token") && tokenClasses.has(name));
        if (["pre", "code", "span"].includes(node.localName) && classes.length) copy.className = classes.join(" ");
        clean(node, copy);
        target.append(copy);
      }
    };
    const fragment = document2.createDocumentFragment();
    clean(template.content, fragment);
    return fragment;
  }

  // src/markdown-source-highlight.js
  var kinds = /* @__PURE__ */ new Set(["plain", "comment", "keyword", "string", "number", "boolean", "constant", "function", "type", "variable", "property", "operator", "punctuation", "tag", "attribute"]);
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
  function createSourceHighlighter(highlight) {
    let cache = /* @__PURE__ */ new Map();
    return (source, lines, current) => {
      const raw = source.split("\n"), jobs = [], fences = /* @__PURE__ */ new Set(), regions = /* @__PURE__ */ new Set();
      const segment = (part, start = part.bodyStart, end = raw[part.index].length) => ({ line: part.index, start, end });
      for (const part of lines) {
        if (part.fence && !fences.has(part.fence)) {
          const block = part.fence;
          fences.add(block);
          const opening = raw[block.parts[0].index].slice(block.parts[0].bodyStart);
          const language = /^ {0,3}(?:`{3,}|~{3,})\s*(\S*)/.exec(opening)?.[1] || "";
          const body = block.parts.slice(1, block.close ? -1 : void 0);
          if (body.length) jobs.push({ language, segments: body.map((part2) => segment(part2)) });
        }
        for (const region of part.regions || []) regions.add(region);
      }
      for (const region of regions) {
        for (const pair of region.pairs) {
          if (pair.name !== "code") continue;
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
          if (segments.length) jobs.push({ language: "", segments });
        }
      }
      const next = /* @__PURE__ */ new Map(), colors = /* @__PURE__ */ new Map();
      for (const { language, segments } of jobs) {
        const code = segments.map(({ line, start, end }) => raw[line].slice(start, end)).join("\n");
        const key = JSON.stringify([language, code]);
        let tokens = next.get(key) || cache.get(key);
        if (!tokens) {
          try {
            tokens = checkedTokens(highlight(code, language), code.length);
          } catch {
            tokens = [];
          }
          if (!current()) return false;
        }
        next.set(key, tokens);
        let offset = 0, index = 0;
        for (const { line, start, end } of segments) {
          const limit = offset + end - start;
          while (index < tokens.length && tokens[index].end <= offset) index++;
          for (let at = index; at < tokens.length && tokens[at].start < limit; at++) {
            const token = tokens[at];
            if (token.kind === "plain") continue;
            if (!colors.has(line)) colors.set(line, []);
            colors.get(line).push({
              start: start + Math.max(offset, token.start) - offset,
              end: start + Math.min(limit, token.end) - offset,
              kind: token.kind
            });
          }
          offset = limit + 1;
        }
      }
      cache = next;
      for (const [line, ranges] of colors) {
        ranges.sort((a, b) => a.start - b.start);
        const painted = [];
        let offset = 0, index = 0;
        for (const token of lines[line].tokens) {
          const end = offset + token.text.length;
          while (offset < end) {
            while (index < ranges.length && ranges[index].end <= offset) index++;
            const range = ranges[index], colored = range && range.start <= offset;
            const stop = Math.min(end, range ? colored ? range.end : range.start : end);
            painted.push({
              text: raw[line].slice(offset, stop),
              className: token.className + (colored ? " token " + range.kind : "")
            });
            offset = stop;
          }
          if (!token.text) painted.push(token);
        }
        lines[line].tokens = painted;
      }
      return true;
    };
  }

  // src/maiden.js
  var isBlock = (node) => node.nodeType === 1 && /^(DIV|P)$/.test(node.tagName);
  var normalize = (value) => String(value ?? "").replace(/\r\n?/g, "\n");
  function runs(element) {
    const result = [];
    let nodes = [];
    const flush = () => {
      if (nodes.length) result.push({ nodes });
      nodes = [];
    };
    for (const node of element.childNodes) {
      if (isBlock(node)) {
        flush();
        result.push({ block: node });
      } else nodes.push(node);
    }
    flush();
    return result;
  }
  function placeholderBR(node) {
    const following = (node2) => {
      let next2 = node2.nextSibling;
      while (next2?.nodeType === 3 && !next2.data) next2 = next2.nextSibling;
      return next2;
    };
    let last = node, next = following(last);
    while (!next && last.parentNode && !isBlock(last.parentNode)) {
      last = last.parentNode;
      next = following(last);
    }
    return !next || isBlock(next);
  }
  function inlineText(node) {
    if (node.nodeType === 3) return node.data;
    if (node.nodeType !== 1) return "";
    if (node.tagName === "BR") return placeholderBR(node) ? "" : "\n";
    return Array.from(node.childNodes, inlineText).join("");
  }
  function markdown(element) {
    return runs(element).map((run) => run.block ? markdown(run.block) : run.nodes.map(inlineText).join("")).join("\n");
  }
  function textModel(root) {
    let text = "";
    const offsets = /* @__PURE__ */ new Map();
    const segments = [];
    const nestedBreaks = /* @__PURE__ */ new Set();
    const mark = (node, offset) => {
      if (!offsets.has(node)) offsets.set(node, []);
      offsets.get(node)[offset] = text.length;
    };
    function inline(node) {
      if (node.nodeType === 3) {
        offsets.set(node, text.length);
        segments.push({ start: text.length, end: text.length + node.length, node });
        text += node.data;
      } else if (node.nodeType === 1) {
        if (node.tagName === "BR") {
          if (!placeholderBR(node)) {
            text += "\n";
            if (!node.nextSibling && !isBlock(node.parentNode)) nestedBreaks.add(text.length);
          }
        } else {
          mark(node, 0);
          for (let i = 0; i < node.childNodes.length; i++) {
            inline(node.childNodes[i]);
            mark(node, i + 1);
          }
        }
      }
    }
    function block(element) {
      mark(element, 0);
      const parts = runs(element);
      let index = 0;
      for (let i = 0; i < parts.length; i++) {
        if (i) text += "\n";
        const nodes = parts[i].block ? [parts[i].block] : parts[i].nodes;
        for (const node of nodes) {
          mark(element, index);
          if (isBlock(node)) block(node);
          else inline(node);
          mark(element, ++index);
        }
      }
      mark(element, element.childNodes.length);
    }
    block(root);
    return {
      text,
      afterNestedBR: (offset) => nestedBreaks.has(offset),
      offset(node, offset) {
        const value = offsets.get(node);
        return typeof value === "number" ? value + offset : value?.[offset];
      },
      point(offset) {
        offset = Math.max(0, Math.min(text.length, offset));
        const segment = segments.find((item) => item.start <= offset && item.end >= offset);
        if (segment) return { node: segment.node, offset: offset - segment.start };
        for (const [node, values] of Array.from(offsets).reverse()) {
          if (!Array.isArray(values)) continue;
          const index = values.indexOf(offset);
          if (index !== -1) return { node, offset: index };
        }
        return { node: root, offset: root.childNodes.length };
      }
    };
  }
  function punctuationEscape(text, at) {
    return text[at] === "\\" && /[\x21-\x2f\x3a-\x40\x5b-\x60\x7b-\x7e]/.test(text[at + 1] || "");
  }
  function backtickRuns(text) {
    const runs2 = Array.from(text.matchAll(/`+/g)), next = /* @__PURE__ */ new Map(), result = /* @__PURE__ */ new Map();
    for (let i = runs2.length - 1; i >= 0; i--) {
      const start = runs2[i].index, size = runs2[i][0].length;
      result.set(start, { size, end: next.get(size) ?? -1 });
      if (size > 1) result.set(start + 1, { size: size - 1, end: next.get(size - 1) ?? -1 });
      next.set(size, start);
    }
    return result;
  }
  var inlineStyles = { bold: 1, italic: 2, strike: 4, code: 8, link: 16, url: 32, marker: 64 };
  var literalStyle = 128;
  function addSpan(spans, start, end, style = 0) {
    if (start === end) return;
    const last = spans[spans.length - 1];
    if (last?.end === start && last.style === style) last.end = end;
    else spans.push({ start, end, style });
  }
  function destinationEnds(text) {
    const escapes = new Uint8Array(text.length), ends = new Int32Array(text.length + 1);
    for (let i = 0; i < text.length; i++) {
      if (punctuationEscape(text, i)) escapes[i++] = 1;
    }
    ends[text.length] = text.length;
    for (let i = text.length - 1; i >= 0; i--) {
      if (escapes[i]) ends[i] = ends[i + 2];
      else if (/[\x00-\x20\x7f]/.test(text[i]) || text[i] === ")") ends[i] = i;
      else if (text[i] === "(") {
        const close = ends[i + 1];
        ends[i] = text[close] === ")" ? ends[close + 1] : -1;
      } else ends[i] = ends[i + 1];
    }
    return ends;
  }
  function linkSuffix(text, start, destinationEndAt) {
    if (text[start] !== "(") return null;
    function space(at2) {
      while (text[at2] === " " || text[at2] === "	" || text[at2] === "\n") at2++;
      return at2;
    }
    let at = space(start + 1), destinationStart = at, destinationEnd = at;
    if (text[at] === "<") {
      destinationStart = ++at;
      while (at < text.length && text[at] !== ">") {
        if (text[at] === "<" || text[at] === "\n") return null;
        at += punctuationEscape(text, at) ? 2 : 1;
      }
      if (text[at] !== ">") return null;
      destinationEnd = at++;
    } else {
      at = destinationEndAt(at);
      if (at === -1) return null;
      destinationEnd = at;
    }
    const after = space(at);
    if (text[after] === ")") return { end: after + 1, destinationStart, destinationEnd };
    if (after === at) return null;
    const quote = text[after], close = quote === "(" ? ")" : quote;
    if (quote !== '"' && quote !== "'" && quote !== "(") return null;
    const titleStart = after + 1;
    at = titleStart;
    while (at < text.length && text[at] !== close) {
      if (quote === "(" && text[at] === "(") return null;
      at += punctuationEscape(text, at) ? 2 : 1;
    }
    const end = space(at + 1);
    if (text[at] !== close || text[end] !== ")") return null;
    return { end: end + 1, destinationStart, destinationEnd, titleStart, titleEnd: at };
  }
  function htmlSpace(text, at) {
    let newline = false;
    while (text[at] === " " || text[at] === "	" || text[at] === "\n" && !newline) {
      if (text[at] === "\n") newline = true;
      at++;
    }
    return at;
  }
  function htmlTagEnd(text, start, nextEnd = (close, at) => text.indexOf(close, at)) {
    const name = /^<\/?[A-Za-z][A-Za-z0-9-]*/.exec(text.slice(start));
    if (!name) return -1;
    let at = start + name[0].length;
    if (text[start + 1] === "/") {
      at = htmlSpace(text, at);
      return text[at] === ">" ? at + 1 : -1;
    }
    for (; ; ) {
      const before = at;
      at = htmlSpace(text, at);
      if (text[at] === ">") return at + 1;
      if (text.startsWith("/>", at)) return at + 2;
      if (at === before) return -1;
      const attribute = /^[A-Za-z_:][A-Za-z0-9_.:-]*/.exec(text.slice(at));
      if (!attribute) return -1;
      at += attribute[0].length;
      const equals = htmlSpace(text, at);
      if (text[equals] !== "=") continue;
      at = htmlSpace(text, equals + 1);
      if (text[at] === '"' || text[at] === "'") {
        const end = nextEnd(text[at], at + 1);
        if (end === -1) return -1;
        at = end + 1;
      } else {
        const value = /^[^ \t\n"'=<>`]+/.exec(text.slice(at));
        if (!value) return -1;
        at += value[0].length;
      }
    }
  }
  function angleScanner(text) {
    const ends = /* @__PURE__ */ new Map();
    function nextEnd(close, at) {
      let cached = ends.get(close);
      if (!cached || at < cached.from || cached.end !== -1 && cached.end < at) {
        cached = { from: at, end: text.indexOf(close, at) };
        ends.set(close, cached);
      }
      return cached.end;
    }
    return (start) => {
      const rest = text.slice(start);
      const uri = /^<[A-Za-z][A-Za-z0-9+.-]{1,31}:[^\x00-\x20\x7f<>]*>/.exec(rest);
      const email = uri ? null : /^<[A-Za-z0-9.!#$%&'*+\/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*>/.exec(rest);
      if (uri || email) return { end: start + (uri || email)[0].length, link: true };
      let close, from = start;
      if (rest.startsWith("<!-->")) return { end: start + 5 };
      if (rest.startsWith("<!--->")) return { end: start + 6 };
      if (rest.startsWith("<!--")) {
        close = "-->";
        from += 4;
      } else if (rest.startsWith("<?")) {
        close = "?>";
        from += 2;
      } else if (rest.startsWith("<![CDATA[")) {
        close = "]]>";
        from += 9;
      } else if (/^<![A-Za-z]/.test(rest)) {
        close = ">";
        from += 3;
      }
      if (close) {
        const end2 = nextEnd(close, from);
        return end2 === -1 ? null : { end: end2 + close.length };
      }
      const end = htmlTagEnd(text, start, nextEnd);
      return end === -1 ? null : { end };
    };
  }
  var htmlBlockNames = new Set("address article aside base basefont blockquote body caption center col colgroup dd details dialog dir div dl dt fieldset figcaption figure footer form frame frameset h1 h2 h3 h4 h5 h6 head header hr html iframe legend li link main menu menuitem nav noframes ol optgroup option p param search section summary table tbody td tfoot th thead title tr track ul".split(" "));
  function htmlBlockAt(text, paragraph = false) {
    const indent = /^ {0,3}(?=<)/.exec(text);
    if (!indent) return 0;
    const body = text.slice(indent[0].length);
    if (/^<(?:pre|script|style|textarea)(?= |\t|>|$)/i.test(body)) return 1;
    if (body.startsWith("<!--")) return 2;
    if (body.startsWith("<?")) return 3;
    if (/^<![A-Za-z]/.test(body)) return 4;
    if (body.startsWith("<![CDATA[")) return 5;
    const name = /^<\/?([A-Za-z][A-Za-z0-9-]*)(?= |\t|>|\/>|$)/.exec(body);
    if (name && htmlBlockNames.has(name[1].toLowerCase())) return 6;
    if (paragraph || /^<(?:pre|script|style|textarea)(?= |\t|>|\/>|$)/i.test(body)) return 0;
    const end = htmlTagEnd(body, 0);
    return end !== -1 && /^ *$/.test(body.slice(end)) ? 7 : 0;
  }
  function htmlBlockEnds(text, type) {
    if (type === 1) return /<\/(?:pre|script|style|textarea)>/i.test(text);
    return type < 6 && text.includes(["", "", "-->", "?>", ">", "]]>"][type]);
  }
  function bareURLScanner(text) {
    let host;
    return (start) => {
      if (start && !/[\t\n\f\r\p{Zs}*_~(]/u.test(text[start - 1])) return -1;
      const prefix = /^(?:https?:\/\/|www\.)/i.exec(text.slice(start, start + 8));
      if (!prefix) return -1;
      const from = start + (prefix[0].includes(":") ? prefix[0].length : 0);
      if (!host || from < host.start || from >= host.end) {
        const match = /^[\p{L}\p{N}_.-]+/u.exec(text.slice(from));
        if (!match) return -1;
        host = { start: from, end: from + match[0].length, dot: -1, previousDot: -1, empty: -1, underscore: -1 };
        let end2 = host.end;
        while (text[end2 - 1] === ".") end2--;
        for (let at = from; at < end2; at++) {
          if (text[at] === "_") host.underscore = at;
          if (text[at] === ".") {
            if (text[at - 1] === ".") host.empty = at;
            host.previousDot = host.dot;
            host.dot = at;
          }
        }
      }
      if (text[from] === "." || host.dot < from || host.empty >= from || host.underscore >= Math.max(from, host.previousDot + 1)) return -1;
      let end = host.end, balance = 0;
      while (end < text.length && !/[\t\n\f\r\p{Zs}<]/u.test(text[end])) end++;
      for (let at = start; at < end; at++) {
        if (text[at] === "(") balance++;
        else if (text[at] === ")") balance--;
      }
      for (; ; ) {
        const last = text[end - 1];
        if (/[?!.,:*_~]/.test(last || "")) end--;
        else if (last === ")" && balance < 0) {
          end--;
          balance++;
        } else if (last === ";") {
          let at = end - 2;
          while (at >= start && /[A-Za-z0-9]/.test(text[at])) at--;
          if (at < end - 2 && text[at] === "&") end = at;
          else break;
        } else break;
      }
      return end > start + prefix[0].length ? end : -1;
    };
  }
  function emailSpans(text, parts, protectedRanges, linkRanges) {
    const result = [], local = (char) => /[A-Za-z0-9._+\-]/.test(char || "");
    for (const part of parts) {
      if (part.style & (inlineStyles.code | inlineStyles.link | inlineStyles.url | inlineStyles.marker | literalStyle)) {
        addSpan(result, part.start, part.end, part.style);
        continue;
      }
      let from = part.start, at = from;
      while (at < part.end) {
        let end = -1;
        if (local(text[at])) {
          const protocol = /^(?:mailto:|xmpp:)/i.exec(text.slice(at, part.end));
          let next = at + (protocol?.[0].length || 0), name = next;
          while (next < part.end && local(text[next])) next++;
          if (next > name && text[next] === "@") {
            const hostStart = ++next;
            while (next < part.end && /[A-Za-z0-9_.-]/.test(text[next])) next++;
            end = next;
            while (text[end - 1] === ".") end--;
            const domain = text.slice(hostStart, end);
            if (!domain.includes(".") || !domain.split(".").every(Boolean) || /[-_]$/.test(domain) || end === hostStart) end = -1;
            if (end !== -1 && protocol?.[0].toLowerCase() === "xmpp:" && text[end] === "/") {
              let resource = end + 1;
              while (resource < part.end && /[A-Za-z0-9@.]/.test(text[resource])) resource++;
              if (resource > end + 1) end = resource;
            }
          }
          if (end === -1) {
            at = Math.max(at + 1, next);
            continue;
          }
        }
        if (end !== -1) {
          addSpan(result, from, at, part.style);
          addSpan(result, at, end, part.style | inlineStyles.link);
          protectedRanges.push({ start: at, end });
          linkRanges.push({ start: at, end, autolink: true });
          at = from = end;
        } else at++;
      }
      addSpan(result, from, part.end, part.style);
    }
    return result;
  }
  function inlinePlan(text, references = /* @__PURE__ */ new Map()) {
    const plan = inlinePass(text, references);
    return plan.retry ? inlinePass(text, references, plan.labels) : plan;
  }
  function inlinePass(text, references, owners) {
    const spans = [], brackets = [], events = [], labels = [], pairs = [], protectedRanges = [], linkRanges = [];
    const bareURL = bareURLScanner(text);
    if (owners) owners.sort((a, b) => a.start - b.start);
    let owner = 0, ownedEnd = 0, retry = false;
    let firstDelimiter = null, lastDelimiter = null, delimiterIndex = 0, lastLink = -1, destinations, ticks, angles;
    const destinationEndAt = (at) => (destinations || (destinations = destinationEnds(text)))[at];
    const { bold, italic, strike, code, link: linkStyle, url, marker } = inlineStyles;
    for (let i = 0; i < text.length; ) {
      if (punctuationEscape(text, i)) {
        addSpan(spans, i, i + 2);
        i += 2;
        continue;
      }
      if (text[i] === "`") {
        const { size, end: end2 } = (ticks || (ticks = backtickRuns(text))).get(i);
        if (end2 !== -1) {
          addSpan(spans, i, i + size, marker);
          addSpan(spans, i + size, end2, code);
          addSpan(spans, end2, end2 + size, marker);
          pairs.push({ name: "code", open: i, content: i + size, close: end2, end: end2 + size });
          protectedRanges.push({ start: i, end: end2 + size });
          i = end2 + size;
          continue;
        }
        addSpan(spans, i, i + size);
        i += size;
        continue;
      }
      if (text[i] === "<") {
        const angle = (angles || (angles = angleScanner(text)))(i);
        if (angle) {
          if (angle.link) {
            addSpan(spans, i, i + 1, marker);
            addSpan(spans, i + 1, angle.end - 1, linkStyle);
            addSpan(spans, angle.end - 1, angle.end, marker);
            linkRanges.push({ start: i, end: angle.end, autolink: true });
            lastLink = i;
          } else addSpan(spans, i, angle.end, literalStyle);
          protectedRanges.push({ start: i, end: angle.end });
          i = angle.end;
          continue;
        }
      }
      if (/[hw]/i.test(text[i])) {
        while (owners && owner < owners.length && owners[owner].start <= i) {
          ownedEnd = Math.max(ownedEnd, owners[owner++].end);
        }
        const allowed = !brackets.length || owners && i >= ownedEnd;
        if (allowed || !owners && !retry) {
          const end2 = bareURL(i);
          if (end2 !== -1) {
            if (allowed) {
              addSpan(spans, i, end2, linkStyle);
              protectedRanges.push({ start: i, end: end2 });
              linkRanges.push({ start: i, end: end2, autolink: true });
              if (brackets.length) lastLink = i;
              i = end2;
              continue;
            }
            retry = true;
          }
        }
      }
      if (text[i] === "[" || text.startsWith("![", i)) {
        const image = text[i] === "!", end2 = i + (image ? 2 : 1);
        brackets.push({ start: i, content: end2, image, delimiter: lastDelimiter });
        addSpan(spans, i, end2);
        i = end2;
        continue;
      }
      if (text[i] === "]" && brackets.length) {
        const bracket = brackets.pop();
        let suffix = (bracket.image || bracket.start >= lastLink) && linkSuffix(text, i + 1, destinationEndAt);
        if (!suffix && (bracket.image || bracket.start >= lastLink)) {
          const explicit = referenceLabel(text, i + 1);
          const collapsed = text.startsWith("[]", i + 1);
          const label = explicit ? explicit.label : text.slice(bracket.content, i);
          if (validReferenceLabel(label) && references.has(normalizeLabel(label))) {
            suffix = { end: explicit?.end ?? (collapsed ? i + 3 : i + 1), reference: true };
          }
        }
        if (suffix) {
          if (!owners) labels.push({ start: bracket.content, end: i });
          emphasis(bracket.delimiter);
          range(bracket.start, bracket.content, 2);
          range(bracket.content, i, 3);
          protectedRanges.push({ start: i, end: suffix.end });
          const link = { start: bracket.start, end: suffix.end, image: bracket.image };
          if (bracket.image && !suffix.reference) {
            link.destinationStart = suffix.destinationStart;
            link.destinationEnd = suffix.destinationEnd;
          }
          linkRanges.push(link);
          if (suffix.reference) {
            addSpan(spans, i, suffix.end, marker);
            if (!bracket.image) lastLink = bracket.start;
            i = suffix.end;
            continue;
          }
          addSpan(spans, i, suffix.destinationStart, marker);
          addSpan(spans, suffix.destinationStart, suffix.destinationEnd, url);
          let at = suffix.destinationEnd;
          if (suffix.titleStart !== void 0) {
            addSpan(spans, at, suffix.titleStart, marker);
            addSpan(spans, suffix.titleStart, suffix.titleEnd, url);
            at = suffix.titleEnd;
          }
          addSpan(spans, at, suffix.end, marker);
          if (!bracket.image) lastLink = bracket.start;
          i = suffix.end;
          continue;
        }
      }
      if (text[i] === "*" || text[i] === "_" || text[i] === "~") {
        let end2 = i + 1;
        while (text[end2] === text[i]) end2++;
        if (text[i] === "~" && end2 - i > 2) {
          addSpan(spans, i, end2);
          i = end2;
          continue;
        }
        const before = [...text.slice(Math.max(0, i - 2), i)].pop() || "\n";
        const after = String.fromCodePoint(text.codePointAt(end2) ?? 10);
        const space = (char) => /[\t\n\f\r\p{Zs}]/u.test(char);
        const punctuation = (char) => /[\p{P}\p{S}]/u.test(char);
        const left = !space(after) && (!punctuation(after) || space(before) || punctuation(before));
        const right = !space(before) && (!punctuation(before) || space(after) || punctuation(after));
        const previous = lastDelimiter;
        const delimiter = {
          char: text[i],
          start: i,
          end: end2,
          length: end2 - i,
          index: delimiterIndex++,
          open: left && (text[i] !== "_" || !right || punctuation(before)),
          close: right && (text[i] !== "_" || !left || punctuation(after)),
          previous,
          next: null
        };
        if (previous) previous.next = delimiter;
        if (!firstDelimiter) firstDelimiter = delimiter;
        lastDelimiter = delimiter;
        addSpan(spans, i, end2);
        i = end2;
        continue;
      }
      let end = i + 1;
      while (end < text.length && !"\\`[]!*_~<hHwW".includes(text[end])) end++;
      addSpan(spans, i, end);
      i = end;
    }
    function remove(delimiter) {
      if (delimiter.previous) delimiter.previous.next = delimiter.next;
      else firstDelimiter = delimiter.next;
      if (delimiter.next) delimiter.next.previous = delimiter.previous;
      else lastDelimiter = delimiter.previous;
    }
    function range(start, end, type) {
      events.push({ at: start, type, delta: 1 }, { at: end, type, delta: -1 });
    }
    function emphasis(boundary) {
      const floor = boundary?.index ?? -1;
      const bottom = { "*": Array(6).fill(floor), "_": Array(6).fill(floor), "~": Array(6).fill(floor) };
      let closer = boundary ? boundary.next : firstDelimiter;
      while (closer) {
        if (!closer.close) {
          closer = closer.next;
          continue;
        }
        const key = (closer.open ? 3 : 0) + closer.length % 3;
        let opener = closer.previous;
        while (opener && opener.index > bottom[closer.char][key]) {
          const odd = closer.char !== "~" && (opener.close || closer.open) && (opener.length + closer.length) % 3 === 0 && (opener.length % 3 !== 0 || closer.length % 3 !== 0);
          if (opener.char === closer.char && opener.open && !odd && (closer.char !== "~" || opener.length === closer.length)) break;
          opener = opener.previous;
        }
        if (!opener || opener.index <= bottom[closer.char][key]) {
          bottom[closer.char][key] = closer.previous?.index ?? -1;
          const next = closer.next;
          if (!closer.open) remove(closer);
          closer = next;
          continue;
        }
        const use = opener.end - opener.start >= 2 && closer.end - closer.start >= 2 ? 2 : 1;
        pairs.push({
          open: opener.end - use,
          content: opener.end,
          close: closer.start,
          end: closer.start + use,
          name: closer.char === "~" ? "strikethrough" : use === 2 ? "bold" : "italic"
        });
        range(opener.end, closer.start, closer.char === "~" ? 4 : use === 2 ? 0 : 1);
        range(opener.end - use, opener.end, 2);
        range(closer.start, closer.start + use, 2);
        opener.end -= use;
        closer.start += use;
        while (opener.next !== closer) remove(opener.next);
        if (opener.start === opener.end) remove(opener);
        if (closer.start === closer.end) {
          const next = closer.next;
          remove(closer);
          closer = next;
        }
      }
      while (boundary ? boundary.next : firstDelimiter) remove(boundary ? boundary.next : firstDelimiter);
    }
    if (retry) return { retry, labels };
    emphasis(null);
    events.sort((a, b) => a.at - b.at);
    const result = [], counts = [0, 0, 0, 0, 0];
    let event = 0;
    for (const part of spans) {
      let at = part.start;
      while (at < part.end) {
        while (event < events.length && events[event].at <= at) {
          const change = events[event++];
          counts[change.type] += change.delta;
        }
        const end = Math.min(part.end, events[event]?.at ?? part.end);
        const style = counts[2] ? marker : part.style & literalStyle ? literalStyle : part.style | (part.style & (marker | url) ? 0 : (counts[0] ? bold : 0) | (counts[1] ? italic : 0) | (counts[3] ? linkStyle : 0) | (counts[4] && !(part.style & code) ? strike : 0));
        addSpan(result, at, end, style);
        at = end;
      }
    }
    return { spans: emailSpans(text, result, protectedRanges, linkRanges), pairs, protectedRanges, linkRanges };
  }
  function inlineTokens(text, references, segments = null) {
    const plan = inlinePlan(text, references);
    if (segments) {
      const point = (position) => {
        let low = 0, high = segments.length - 1;
        while (low < high) {
          const middle = Math.ceil((low + high) / 2);
          if (segments[middle].offset <= position) low = middle;
          else high = middle - 1;
        }
        const { part, start, offset } = segments[low];
        const column = start + position - offset;
        return part.sourceStart + (part.columns ? part.columns[column] : column);
      };
      const region = {
        start: point(0),
        end: point(text.length),
        pairs: plan.pairs.map((pair) => ({ name: pair.name, open: point(pair.open), content: point(pair.content), close: point(pair.close), end: point(pair.end) })),
        protectedRanges: plan.protectedRanges.map((range) => ({ start: point(range.start), end: point(range.end) })),
        linkRanges: plan.linkRanges.map((range) => {
          const mapped = { ...range, start: point(range.start), end: point(range.end) };
          if (range.destinationStart != null) {
            mapped.destinationStart = point(range.destinationStart);
            mapped.destinationEnd = point(range.destinationEnd);
          }
          return mapped;
        })
      };
      for (const { part } of segments) (part.regions || (part.regions = [])).push(region);
    }
    return plan.spans.map((part) => ({
      text: text.slice(part.start, part.end),
      className: Object.keys(inlineStyles).filter((name) => part.style & inlineStyles[name]).map((name) => "lightmarkdown-" + name).join(" ")
    }));
  }
  function normalizeLabel(label) {
    return label.replace(/[ \t\n]+/g, " ").replace(/^ | $/g, "").replace(/\u1e9e/g, "ss").replace(/[^\u0131]+/gu, (part) => part.toUpperCase().toLowerCase());
  }
  function validReferenceLabel(label) {
    if (label.length > 1998 || [...label].length > 999 || !/[^ \t\n]/.test(label)) return false;
    for (let at = 0; at < label.length; at++) {
      if (punctuationEscape(label, at)) at++;
      else if (label[at] === "[" || label[at] === "]") return false;
    }
    return true;
  }
  function referenceLabel(text, start) {
    if (text[start] !== "[") return null;
    let at = start + 1;
    while (at < text.length && at - start <= 1999) {
      if (text[at] === "]") {
        const label = text.slice(start + 1, at);
        return validReferenceLabel(label) ? { label, end: at + 1 } : null;
      }
      if (text[at] === "[") return null;
      at += punctuationEscape(text, at) ? 2 : 1;
    }
    return null;
  }
  function referenceDefinition(text) {
    const indent = /^ {0,3}(?=\[)/.exec(text);
    if (!indent) return null;
    const label = referenceLabel(text, indent[0].length);
    if (!label || text[label.end] !== ":") return null;
    const whitespace = (at2) => {
      const match = /^[ \t]*(?:\n[ \t]*)?/.exec(text.slice(at2));
      return at2 + match[0].length;
    };
    let at = whitespace(label.end + 1), destinationStart = at, destinationEnd;
    if (text[at] === "<") {
      destinationStart = ++at;
      while (at < text.length && text[at] !== ">") {
        if (text[at] === "<" || text[at] === "\n") return null;
        at += punctuationEscape(text, at) ? 2 : 1;
      }
      if (text[at] !== ">") return null;
      destinationEnd = at++;
    } else {
      let depth = 0;
      while (at < text.length && !/[\x00-\x20\x7f]/.test(text[at])) {
        if (punctuationEscape(text, at)) {
          at += 2;
          continue;
        }
        if (text[at] === "(") depth++;
        if (text[at] === ")" && --depth < 0) return null;
        at++;
      }
      if (depth || at === destinationStart) return null;
      destinationEnd = at;
    }
    const lineEnd = (pos) => {
      while (text[pos] === " " || text[pos] === "	") pos++;
      return pos === text.length || text[pos] === "\n" ? pos : -1;
    };
    const destinationLineEnd = lineEnd(at), after = whitespace(at);
    const quote = text[after], close = quote === "(" ? ")" : quote;
    if (after > at && (quote === '"' || quote === "'" || quote === "(")) {
      let end = after + 1;
      while (end < text.length && text[end] !== close) {
        if (quote === "(" && text[end] === "(") break;
        end += punctuationEscape(text, end) ? 2 : 1;
      }
      const finish = text[end] === close ? lineEnd(end + 1) : -1;
      if (finish !== -1) return { label: label.label, end: finish, destinationStart, destinationEnd, titleStart: after + 1, titleEnd: end };
      if (!text.slice(at, after).includes("\n")) return null;
    }
    return destinationLineEnd === -1 ? null : { label: label.label, end: destinationLineEnd, destinationStart, destinationEnd };
  }
  function extractDefinitions(context) {
    const paragraph = context.paragraph;
    if (!paragraph.length || !/^ {0,3}\[/.test(paragraph[0].text)) return;
    const source = paragraph.map((part) => part.text).join("\n");
    let consumed = 0, cursor = 0;
    while (consumed < paragraph.length) {
      const text = source.slice(cursor), definition = referenceDefinition(text);
      if (!definition) break;
      const key = normalizeLabel(definition.label);
      if (!context.document.references.has(key)) context.document.references.set(key, true);
      const count = text.slice(0, definition.end).split("\n").length;
      let offset = 0;
      for (const part of paragraph.slice(consumed, consumed + count)) {
        const ranges = [
          [0, definition.destinationStart, "marker"],
          [definition.destinationStart, definition.destinationEnd, "url"],
          [definition.destinationEnd, definition.titleStart ?? definition.end, "marker"]
        ];
        if (definition.titleStart !== void 0) ranges.push(
          [definition.titleStart, definition.titleEnd, "url"],
          [definition.titleEnd, definition.end, "marker"]
        );
        for (const [from, to, style] of ranges) {
          const start = Math.max(offset, from), end = Math.min(offset + part.text.length, to);
          if (end > start) part.tokens.push({ text: text.slice(start, end), className: "lightmarkdown-" + style });
        }
        offset += part.text.length + 1;
      }
      consumed += count;
      cursor += offset;
    }
    paragraph.splice(0, consumed);
  }
  function flushParagraph(context) {
    extractDefinitions(context);
    const paragraph = context.paragraph;
    if (!paragraph.length) return;
    context.paragraph = [];
    paragraph[0].task = context.firstBlock && !!context.width && !context.quote && !paragraph[0].level;
    if (paragraph[0].task && paragraph[0].taskSize) context.structure.task = paragraph[0];
    context.document.pending.push(paragraph);
    context.firstBlock = false;
  }
  function resolveParagraph(paragraph, references) {
    const text = paragraph.map((part) => part.text).join("\n");
    const taskSize = paragraph[0].task ? paragraph[0].taskSize : 0;
    let offset = 0;
    const segments = paragraph.map((part, index) => {
      const skipped = index ? 0 : taskSize;
      const segment = { part, start: part.column + skipped, offset };
      offset += part.text.length - skipped + 1;
      return segment;
    });
    const body = inlineTokens(text.slice(taskSize), references, segments);
    const tokens = taskSize ? [{ text: text.slice(0, taskSize), className: "lightmarkdown-marker" }, ...body] : body;
    let line = 0;
    for (const token of tokens) {
      const parts = token.text.split("\n");
      for (let i = 0; i < parts.length; i++) {
        if (i) line++;
        if (parts[i]) paragraph[line].tokens.push({ text: parts[i], className: token.className });
      }
    }
  }
  function tableCells(text) {
    const pipes = [], cells = [];
    for (let at = 0; at < text.length; at++) {
      if (punctuationEscape(text, at)) at++;
      else if (text[at] === "|") pipes.push(at);
    }
    let start = 0;
    for (const end of pipes) {
      cells.push([start, end]);
      start = end + 1;
    }
    cells.push([start, text.length]);
    if (pipes.length && /^ *$/.test(text.slice(...cells[0]))) cells.shift();
    if (pipes.length && cells.length && /^ *$/.test(text.slice(...cells[cells.length - 1]))) cells.pop();
    return { pipes, cells };
  }
  function tableRow(text, columns, document2, block) {
    const result = { text, level: 0, tokens: [], tableBlock: block };
    block.rows.push(result);
    document2.tables.push({ result, columns, ...tableCells(text) });
    return result;
  }
  function startTable(text, context) {
    if (text.startsWith("    ") || listAt(text) || !/^[ |:\-]+$/.test(text)) return null;
    const delimiter = tableCells(text);
    if (!delimiter.cells.length || !delimiter.cells.every(([start, end]) => /^ *:?-+:? *$/.test(text.slice(start, end)))) return null;
    extractDefinitions(context);
    const header = context.paragraph[context.paragraph.length - 1];
    if (!header || header.text.startsWith("    ")) return null;
    const row = tableCells(header.text);
    if (!row.pipes.length || row.cells.length !== delimiter.cells.length) return null;
    context.paragraph.pop();
    flushParagraph(context);
    context.table = delimiter.cells.length;
    context.document.tables.push({ result: header, columns: context.table, ...row });
    header.task = false;
    const delimiterRow = { level: 0, table: context.table, tableCells: delimiter.cells, tableDelimiter: true, tokens: [{ text, className: "lightmarkdown-marker" }] };
    const block = { header, delimiter: delimiterRow, rows: [] };
    context.tableBlock = header.tableBlock = delimiterRow.tableBlock = block;
    return delimiterRow;
  }
  function resolveTable(row, references) {
    const { result, cells, pipes, columns } = row, text = result.text;
    result.table = columns;
    result.tableCells = cells;
    if (cells.length !== columns) result.tableBlock.ragged = true;
    let at = 0;
    for (const [index, cell] of cells.entries()) {
      let [start, end] = cell;
      if (start > at) result.tokens.push({ text: text.slice(at, start), className: "lightmarkdown-marker" });
      const before = start;
      while (start < end && text[start] === " ") start++;
      if (start > before) result.tokens.push({ text: text.slice(before, start), className: "" });
      let trailing = end;
      while (trailing > start && text[trailing - 1] === " ") trailing--;
      if (index < columns) {
        for (const token of inlineTokens(text.slice(start, trailing), references, [{ part: result, start: result.column + start, offset: 0 }])) result.tokens.push(token);
      } else if (trailing > start) result.tokens.push({ text: text.slice(start, trailing), className: "" });
      if (end > trailing) result.tokens.push({ text: text.slice(trailing, end), className: "" });
      at = end;
    }
    if (at < text.length) result.tokens.push({ text: text.slice(at), className: pipes.length ? "lightmarkdown-marker" : "" });
  }
  function fenceAt(text) {
    return /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(text);
  }
  function opensFence(fence) {
    return fence && (fence[1][0] !== "`" || !fence[2].includes("`"));
  }
  function thematic(text) {
    return /^ {0,3}(?:(?:\* *){3,}|(?:_ *){3,}|(?:- *){3,})$/.test(text);
  }
  function headingAt(text) {
    return /^( {0,3}#{1,6})( +|$)/.exec(text);
  }
  function quoteAt(text) {
    return /^ {0,3}> ?/.exec(text);
  }
  function listAt(text) {
    const match = /^( {0,3})([-+*]|\d{1,9}[.)])(?= |$)/.exec(text);
    if (!match) return null;
    const empty = /^ *$/.test(text.slice(match[0].length));
    let spaces = 0;
    while (spaces < 5 && text[match[0].length + spaces] === " ") spaces++;
    const width = match[0].length + (empty || spaces > 4 ? 1 : spaces);
    return {
      width,
      size: Math.min(width, text.length),
      empty,
      indent: match[1].length,
      marker: match[2],
      start: /^\d/.test(match[2]) ? Number(match[2].slice(0, -1)) : 1
    };
  }
  function paragraphLine(text, context) {
    const result = { text, level: 0, tokens: [], paragraph: true };
    context.paragraph.push(result);
    return result;
  }
  function lineTokens(text, context) {
    const fence = fenceAt(text);
    if (context.fence) {
      const close = fence && fence[1][0] === context.fence[0] && fence[1].length >= context.fence.length && /^ *$/.test(fence[2]);
      const block = context.fenceBlock;
      const result2 = { level: 0, protected: true, fence: block, tokens: [{ text, className: close ? "lightmarkdown-marker" : "lightmarkdown-code" }] };
      block.parts.push(result2);
      if (close) {
        block.close = result2;
        context.fence = null;
        context.fenceBlock = null;
      }
      return result2;
    }
    if (context.html >= 6 && /^ *$/.test(text)) context.html = 0;
    const html = context.html || htmlBlockAt(text, !!context.paragraph.length);
    if (html) {
      context.table = 0;
      flushParagraph(context);
      context.html = htmlBlockEnds(text, html) ? 0 : html;
      return { level: 0, protected: true, html: true, tokens: [{ text, className: "" }] };
    }
    if (opensFence(fence)) {
      context.table = 0;
      flushParagraph(context);
      context.fence = fence[1];
      const block = { parts: [], close: null };
      const result2 = { level: 0, protected: true, fence: block, tokens: [{ text, className: "lightmarkdown-marker" }] };
      block.parts.push(result2);
      context.fenceBlock = block;
      return result2;
    }
    if (/^ *$/.test(text)) {
      context.table = 0;
      flushParagraph(context);
      return { level: 0, empty: text, tokens: [] };
    }
    if (text.startsWith("    ") && !context.paragraph.length) {
      context.table = 0;
      return { level: 0, protected: true, indentedCode: true, tokens: [{ text, className: "lightmarkdown-code" }] };
    }
    if (context.table && !thematic(text) && !headingAt(text)) return tableRow(text, context.table, context.document, context.tableBlock);
    context.table = 0;
    const table = startTable(text, context);
    if (table) return table;
    const underline = /^ {0,3}(=+|-+) *$/.exec(text);
    if (underline) extractDefinitions(context);
    if (underline && context.paragraph.length) {
      const result2 = { level: 0, tokens: [{ text, className: "lightmarkdown-marker" }] };
      const group = { parts: context.paragraph.slice(), underline: result2, level: underline[1][0] === "=" ? 1 : 2 };
      for (const part of group.parts) {
        part.level = group.level;
        part.setext = group;
      }
      result2.setext = group;
      flushParagraph(context);
      return result2;
    }
    if (thematic(text)) {
      flushParagraph(context);
      return { level: 0, thematic: true, tokens: [{ text, className: "lightmarkdown-marker" }] };
    }
    const heading = headingAt(text);
    if (!heading) return paragraphLine(text, context);
    flushParagraph(context);
    const body = text.slice(heading[0].length);
    const suffix = /(?:^| )#+ *$/.exec(body);
    let end = suffix ? suffix.index : body.length;
    if (suffix) while (end && body[end - 1] === " ") end--;
    const result = { level: heading[1].trim().length, tokens: [], atx: {
      start: heading[1].length - heading[1].trim().length,
      end: heading[1].length,
      content: heading[0].length,
      close: suffix ? heading[0].length + end : null,
      closeEnd: suffix ? text.trimEnd().length : null
    } };
    context.document.headings.push({ result, prefix: heading[0], body: body.slice(0, end), suffix: suffix ? body.slice(end) : "" });
    return result;
  }
  function markdownTokens(text) {
    const raw = text.split("\n"), positions = [];
    const lines = raw.map((line, index) => {
      if (!line.includes("	")) return line;
      const map = [0];
      let expanded = "", column = 0;
      for (let i = 0; i < line.length; i++) {
        const width = line[i] === "	" ? 4 - column % 4 : 1;
        expanded += line[i] === "	" ? " ".repeat(width) : line[i];
        for (let j = 0; j < width; j++) map.push(i + 1);
        column += width;
      }
      positions[index] = map;
      return expanded;
    });
    const document2 = { references: /* @__PURE__ */ new Map(), pending: [], headings: [], tables: [] };
    const stack = [{ id: 0, paragraph: [], fence: null, html: 0, table: 0, firstBlock: true, document: document2 }], result = [];
    let sourceOffset = 0, containerId = 0;
    for (const text2 of lines) {
      let consume = function(size, marker) {
        const part = text2.slice(offset, offset + size);
        offset += size;
        if (!part) return;
        const className = marker ? "lightmarkdown-marker" : "", last = prefix[prefix.length - 1];
        if (last?.className === className) last.text += part;
        else prefix.push({ text: part, className });
      };
      const prefix = [], listMarkers = [], prefixes = [];
      let offset = 0, matched = 1, lastContent = text2.length;
      while (lastContent && text2[lastContent - 1] === " ") lastContent--;
      for (; matched < stack.length; matched++) {
        const context2 = stack[matched];
        if (context2.quote) {
          const quote = quoteAt(text2.slice(offset));
          if (!quote) break;
          prefixes.push({ node: context2.structure, start: offset, end: offset + quote[0].length, markerStart: offset + quote[0].indexOf(">") });
          consume(quote[0].length, true);
        } else {
          const blank = offset >= lastContent;
          if (blank && context2.empty) break;
          let spaces = 0;
          while (spaces < context2.width && text2[offset + spaces] === " ") spaces++;
          if (!blank && spaces < context2.width) break;
          prefixes.push({ node: context2.structure, start: offset, end: offset + (blank ? text2.length - offset : spaces) });
          consume(blank ? text2.length - offset : spaces, false);
          if (!blank) context2.empty = false;
        }
      }
      let body = text2.slice(offset), context = stack[stack.length - 1];
      if (context.paragraph.length && (listAt(body) || body.startsWith("    ") || htmlBlockAt(body)) && !/^ *["'(]/.test(body)) {
        extractDefinitions(context);
      }
      const lazy = matched < stack.length && context.paragraph.length && offset < lastContent && !quoteAt(body) && !listAt(body) && !headingAt(body) && !thematic(body) && !opensFence(fenceAt(body)) && !htmlBlockAt(body, true);
      if (!lazy) {
        while (stack.length > matched) {
          const closed = stack.pop();
          closed.structure.last = result.length - 1;
          flushParagraph(closed);
        }
        for (; ; ) {
          context = stack[stack.length - 1];
          if (context.fence || context.html || thematic(body)) break;
          const quote = quoteAt(body), list = quote ? null : listAt(body);
          if (!quote && (!list || context.paragraph.length && (list.empty || list.start !== 1))) break;
          flushParagraph(context);
          context.firstBlock = false;
          context.table = 0;
          if (list) listMarkers.push({ start: offset, end: offset + list.size, width: list.width });
          const structure = {
            parent: context.structure || null,
            quote: !!quote,
            first: result.length,
            start: offset,
            end: offset + (quote ? quote[0].length : list.size),
            markerStart: offset + (quote ? quote[0].indexOf(">") : list.indent),
            marker: list?.marker,
            width: list?.width,
            number: list?.start,
            task: null
          };
          structure.item = quote ? structure.parent?.item : structure;
          structure.quoted = quote ? structure : structure.parent?.quoted;
          prefixes.push({ node: structure, start: offset, end: structure.end, markerStart: structure.markerStart });
          consume(quote ? quote[0].length : list.size, true);
          stack.push({
            id: ++containerId,
            structure,
            quote: !!quote,
            width: list?.width,
            empty: list?.empty,
            paragraph: [],
            fence: null,
            html: 0,
            table: 0,
            firstBlock: true,
            document: document2
          });
          body = text2.slice(offset);
        }
      }
      context = stack[stack.length - 1];
      const parsed = lazy ? paragraphLine(body, context) : lineTokens(body, context);
      parsed.prefix = prefix;
      parsed.index = result.length;
      const map = positions[result.length];
      parsed.column = offset;
      parsed.columns = map;
      parsed.sourceStart = sourceOffset;
      sourceOffset += raw[result.length].length + 1;
      const original = (column) => map ? map[column] : column;
      parsed.bodyStart = original(offset);
      parsed.container = context.id;
      parsed.structure = context.structure || null;
      parsed.prefixes = prefixes;
      parsed.listMarkers = listMarkers.map((marker) => ({ start: original(marker.start), end: original(marker.end), width: marker.width }));
      const indent = /^ */.exec(body)[0].length;
      parsed.indent = indent;
      if (indent >= 4) parsed.protected = true;
      parsed.insertAt = original(offset + indent);
      if (lazy) {
        const missing = stack.slice(matched).map((context2) => context2.quote ? "> " : " ".repeat(context2.width)).join("");
        const padding = / *$/.exec(missing)[0].length;
        parsed.continuation = missing.slice(0, missing.length - Math.min(padding, indent));
      }
      if (parsed.atx) {
        for (const key of Object.keys(parsed.atx)) {
          if (parsed.atx[key] != null) parsed.atx[key] = original(offset + parsed.atx[key]);
        }
      }
      if (parsed.paragraph) {
        const index = result.length, map2 = positions[index], start = map2 ? map2[offset] : offset;
        const task = /^ *\[[ \txX]\](?=[ \t]|$)/.exec(raw[index].slice(start));
        parsed.taskSize = 0;
        if (task) {
          if (!map2) parsed.taskSize = task[0].length;
          else while (map2[offset + parsed.taskSize] < start + task[0].length) parsed.taskSize++;
        }
      }
      if (!parsed.paragraph && !/^ *$/.test(body)) context.firstBlock = false;
      result.push(parsed);
    }
    while (stack.length) {
      const closed = stack.pop();
      if (closed.structure) closed.structure.last = result.length - 1;
      flushParagraph(closed);
    }
    for (const paragraph of document2.pending) resolveParagraph(paragraph, document2.references);
    for (const row of document2.tables) resolveTable(row, document2.references);
    for (const heading of document2.headings) {
      heading.result.tokens = [
        { text: heading.prefix, className: "lightmarkdown-marker" },
        ...inlineTokens(heading.body, document2.references, [{ part: heading.result, start: heading.result.column + heading.prefix.length, offset: 0 }]),
        ...heading.suffix ? [{ text: heading.suffix, className: "lightmarkdown-marker" }] : []
      ];
    }
    for (let i = 0; i < result.length; i++) {
      const parsed = result[i], map = positions[i];
      if (parsed.task && parsed.taskSize) {
        const task = /^ *\[([ \txX])\](?=[ \t]|$)/.exec(raw[i].slice(parsed.bodyStart));
        if (task) parsed.taskMarker = {
          start: parsed.bodyStart + task[0].length - 3,
          end: parsed.bodyStart + task[0].length,
          checked: /[xX]/.test(task[1])
        };
      }
      if (parsed.empty !== void 0) parsed.tokens = inlineTokens(parsed.empty, document2.references, [{ part: parsed, start: parsed.column, offset: 0 }]);
      parsed.tokens = parsed.prefix.concat(parsed.tokens);
      if (map) {
        let offset = 0;
        parsed.tokens = parsed.tokens.flatMap((token) => {
          const start = map[offset];
          offset += token.text.length;
          const text2 = raw[i].slice(start, map[offset]);
          return text2 ? [{ text: text2, className: token.className }] : [];
        });
      }
    }
    return result;
  }
  function headingLines(text, start, end, syntax) {
    const first = text.slice(0, start).split("\n").length - 1;
    const last = text.slice(0, Math.max(start, end - 1)).split("\n").length - 1;
    const indices = /* @__PURE__ */ new Set();
    for (let index = first; index <= last; index++) {
      if (indices.has(index)) continue;
      const group = syntax[index].setext;
      if (group) {
        for (const part of group.parts) indices.add(part.index);
        indices.add(group.underline.index);
      } else indices.add(index);
    }
    return [...indices].sort((a, b) => a - b);
  }
  var formatDelimiters = { bold: "**", italic: "*", strikethrough: "~~" };
  function inlineSelection(text, start, end, syntax, code = false, preserveWhitespace = false) {
    if (!code && !preserveWhitespace && start !== end) {
      const value = text.slice(start, end);
      const leading = /^[\t\n\f\r\p{Zs}]*/u.exec(value)[0].length;
      const trailing = /[\t\n\f\r\p{Zs}]*$/u.exec(value)[0].length;
      if (leading === value.length) return null;
      start += leading;
      end -= trailing;
    }
    const line = text.slice(0, start).split("\n").length - 1;
    const last = text.slice(0, end).split("\n").length - 1;
    if (start < syntax[line].sourceStart + syntax[line].bodyStart || end < syntax[last].sourceStart + syntax[last].bodyStart) return null;
    const region = syntax[line].regions?.find((region2) => region2.start <= start && end <= region2.end);
    if (!region) return null;
    const allowedCode = code && region.pairs.find((pair) => pair.name === "code" && pair.content <= start && end <= pair.close);
    if (region.protectedRanges.some((range) => {
      if (allowedCode && allowedCode.open === range.start && allowedCode.end === range.end) return false;
      return start === end ? range.start < start && start < range.end : start < range.end && end > range.start && !(start <= range.start && range.end <= end);
    })) return null;
    return { region, start, end };
  }
  function templateSelection(text, start, end, syntax, image = false) {
    if (text.slice(start, end).includes("\n")) return null;
    const part = syntax[text.slice(0, start).split("\n").length - 1];
    if (part.protected || start < part.sourceStart + (part.taskMarker?.end ?? part.bodyStart)) return null;
    const selection = inlineSelection(text, start, end, syntax, false, true);
    if (!selection || selection.region.linkRanges.some((range) => {
      const overlap = start === end ? range.start < start && start < range.end : start < range.end && end > range.start;
      const destination = image && start < end && range.autolink && text[range.start] !== "<" && start <= range.start && range.end <= end;
      return overlap && !destination;
    })) return null;
    return { ...selection, part };
  }
  function imageDestination(text, start, end, syntax) {
    const part = syntax[text.slice(0, start).split("\n").length - 1];
    const last = syntax[text.slice(0, end).split("\n").length - 1];
    if (part.protected || start < part.sourceStart + (part.taskMarker?.end ?? part.bodyStart) || end < last.sourceStart + last.bodyStart) return null;
    const region = part.regions?.find((region2) => region2.start <= start && end <= region2.end);
    let found = null;
    for (const range of region?.linkRanges || []) {
      const inside = start === end ? range.start < start && start < range.end : range.start <= start && end <= range.end;
      if (range.image && range.destinationStart != null && inside && (!found || range.end - range.start < found.end - found.start)) found = range;
    }
    return found;
  }
  function enclosingFormat(text, selection, name) {
    if (!selection) return null;
    const { region, start, end } = selection;
    let found = null;
    for (const pair of region.pairs) {
      if (pair.name !== name) continue;
      const inside = pair.content <= start && end <= pair.close;
      const whole = start < end && (name === "code" ? start === pair.open && end === pair.end : start <= pair.open && pair.end <= end && /^[*_~]*$/.test(text.slice(start, pair.open)) && /^[*_~]*$/.test(text.slice(pair.end, end)));
      if ((inside || whole) && (!found || pair.end - pair.open < found.end - found.open)) found = pair;
    }
    return found;
  }
  function sourceEditPlan(text, changes, start, end) {
    changes.sort((a2, b2) => a2.start - b2.start);
    const a = changes[0].start, b = changes[changes.length - 1].end;
    let value = "", cursor = a;
    for (const change of changes) {
      value += text.slice(cursor, change.start) + change.value;
      cursor = change.end;
    }
    value += text.slice(cursor, b);
    const mapped = (position) => {
      let delta = 0;
      for (const change of changes) {
        if (position < change.start || position === change.start && change.before) break;
        if (position < change.end) return change.start + delta + change.value.length;
        delta += change.value.length - (change.end - change.start);
      }
      return position + delta;
    };
    return { start: a, end: b, value, anchor: mapped(start), focus: mapped(end) };
  }
  function codeBlockSelection(text, start, end, syntax) {
    const first = text.slice(0, start).split("\n").length - 1;
    const last = text.slice(0, Math.max(start, end - 1)).split("\n").length - 1;
    const parts = syntax.slice(first, last + 1), block = parts[0].fence;
    if (block) return parts.every((part) => part.fence === block) ? { block } : null;
    if (parts.some((part) => part.protected || part.fence || part.container !== parts[0].container)) return null;
    return { parts };
  }
  var writingActions = ["quote", "ulist", "olist", "checklist", "task-toggle"];
  var columnOffset = (part, column) => part.columns ? part.columns[column] : column;
  function columnChange(part, from, to, value) {
    const map = part.columns;
    let start = columnOffset(part, from), end = columnOffset(part, to);
    if (map && from + 1 < map.length && map[from] === map[from + 1]) {
      let column = from;
      while (column && map[column] === map[from]) column--;
      start--;
      value = " ".repeat(from - column) + value;
    }
    if (map && to + 1 < map.length && map[to] === map[to + 1]) {
      let column = to;
      while (column + 1 < map.length && map[column + 1] === map[to]) column++;
      value += " ".repeat(column - to);
    }
    return { start: part.sourceStart + start, end: part.sourceStart + end, value };
  }
  function continuationPrefix(node) {
    const parts = [];
    for (; node; node = node.parent) parts.push(node.quote ? "> " : " ".repeat(node.width));
    return parts.reverse().join("");
  }
  function ruleSelection(text, start, end, syntax) {
    const first = text.slice(0, start).split("\n").length - 1;
    const last = text.slice(0, Math.max(start, end - 1)).split("\n").length - 1;
    const endpoint = text.slice(0, end).split("\n").length - 1;
    const parts = syntax.slice(first, last + 1), owner = parts[0].structure;
    if (parts.some((part) => part.protected || part.structure !== owner || !(part.regions?.length || part.empty !== void 0 || part.setext || part.thematic))) return null;
    const atLineStart = end > start && end === syntax[endpoint].sourceStart;
    if (start < parts[0].sourceStart + (parts[0].taskMarker?.end ?? parts[0].bodyStart) || !atLineStart && end < syntax[endpoint].sourceStart + (syntax[endpoint].taskMarker?.end ?? syntax[endpoint].bodyStart) || syntax[endpoint].structure !== owner) return null;
    const regions = new Set(parts.flatMap((part) => part.regions || []));
    for (const region of regions) if (region.protectedRanges.some((range) => start === end ? range.start < start && start < range.end : start < range.end && end > range.start && !(start <= range.start && range.end <= end))) return null;
    return { parts, endpoint: syntax[endpoint] };
  }
  function rulePlan(text, start, end, syntax, selection) {
    const { parts, endpoint } = selection, first = parts[0];
    const prefix = continuationPrefix(first.structure);
    const left = text.slice(first.sourceStart + first.bodyStart, start);
    let before = "";
    if (/[^\t ]/.test(left)) before = "\n" + prefix + "\n" + prefix;
    else if (first.listMarkers.length || first.index && syntax[first.index - 1].structure === first.structure && syntax[first.index - 1].empty === void 0) before = "\n" + prefix;
    if (before && !/[^\t ]/.test(left) && first.continuation) before = first.continuation + before;
    const atLineStart = end > start && end === endpoint.sourceStart;
    const value = before + "---\n" + prefix + "\n" + (atLineStart ? "" : prefix);
    const candidate = markdownTokens(text.slice(0, start) + value + text.slice(end));
    const delta = value.split("\n").length - text.slice(start, end).split("\n").length;
    const moved = (index) => index <= first.index ? index : index + delta;
    const sameOwner = (oldNode, newNode) => {
      for (; oldNode && newNode; oldNode = oldNode.parent, newNode = newNode.parent) {
        if (oldNode.quote !== newNode.quote || oldNode.marker !== newNode.marker || moved(oldNode.first) !== newNode.first) return false;
      }
      return !oldNode && !newNode;
    };
    const rule = candidate[first.index + before.split("\n").length - 1];
    if (!rule.thematic || !sameOwner(first.structure, rule.structure) || syntax.some((part, index) => {
      if (first.index <= index && index <= parts[parts.length - 1].index) return false;
      const next = candidate[moved(index)];
      return !sameOwner(part.structure, next.structure) || !!part.html !== !!next.html || !!part.fence !== !!next.fence || !!part.indentedCode !== !!next.indentedCode;
    })) return null;
    return { value, caret: start + value.length + (atLineStart ? endpoint.bodyStart : 0) };
  }
  function tableSelection(text, start, end, syntax) {
    if (start !== end) return null;
    const part = syntax[text.slice(0, start).split("\n").length - 1];
    return !part.protected && part.empty !== void 0 && start >= part.sourceStart + part.bodyStart ? part : null;
  }
  function tablePlan(text, start, syntax, part, rowCount, columnCount) {
    const prefix = continuationPrefix(part.structure), raw = text.split("\n")[part.index];
    const separator2 = start === part.sourceStart + raw.length && part.listMarkers.some((marker) => marker.end === raw.length) && !/[\t ]$/.test(raw) ? " " : "";
    const previous = syntax[part.index - 1];
    const before = previous?.table || previous?.html ? "\n" + prefix : "";
    const headers = Array.from({ length: columnCount }, (_, index) => "Column " + (index + 1));
    const row = (cells) => "| " + cells.join(" | ") + " |";
    const rows = [
      row(headers),
      row(headers.map((header) => "-".repeat(header.length))),
      ...Array(rowCount - 1).fill(row(headers.map((header) => " ".repeat(header.length))))
    ];
    const value = separator2 + before + rows.join("\n" + prefix) + (part.index < syntax.length - 1 ? "\n" + prefix : "");
    const candidate = markdownTokens(text.slice(0, start) + value + text.slice(start));
    const delta = value.split("\n").length - 1;
    const moved = (index) => index <= part.index ? index : index + delta;
    const sameOwner = (oldNode, newNode) => {
      for (; oldNode && newNode; oldNode = oldNode.parent, newNode = newNode.parent) {
        if (oldNode.quote !== newNode.quote || oldNode.marker !== newNode.marker || oldNode.width !== newNode.width || moved(oldNode.first) !== newNode.first) return false;
      }
      return !oldNode && !newNode;
    };
    const first = part.index + before.split("\n").length - 1;
    if (!candidate[first + 1].tableDelimiter || candidate.slice(first, first + rows.length).some((row2) => row2.table !== columnCount || !sameOwner(part.structure, row2.structure)) || syntax.some((old, index) => {
      if (index === part.index) return false;
      const next = candidate[moved(index)];
      return !sameOwner(old.structure, next.structure) || old.level !== next.level || old.table !== next.table || !!old.tableDelimiter !== !!next.tableDelimiter || !!old.html !== !!next.html || !!old.fence !== !!next.fence || !!old.indentedCode !== !!next.indentedCode || !!old.protected !== !!next.protected || !!old.setext !== !!next.setext || !!old.thematic !== !!next.thematic || old.taskMarker?.checked !== next.taskMarker?.checked;
    })) return null;
    const anchor = start + separator2.length + before.length + 2;
    return { value, anchor, focus: anchor + "Column 1".length };
  }
  function tableRowSelection(text, start, end, syntax) {
    if (text.slice(start, end).includes("\n")) return null;
    const part = syntax[text.slice(0, start).split("\n").length - 1];
    return !part.protected && part.tableBlock && start >= part.sourceStart + part.bodyStart ? part : null;
  }
  function tableRowPlan(text, syntax, part, remove) {
    const block = part.tableBlock, raw = text.split("\n");
    let start, end, value, caret, line;
    if (remove) {
      const index = block.rows.indexOf(part);
      if (index < 0) return null;
      const next = block.rows[index + 1] || block.rows[index - 1] || block.header;
      caret = next.regions?.[0]?.start ?? next.sourceStart + next.bodyStart;
      start = part.sourceStart - 1;
      end = part.sourceStart + raw[part.index].length;
      value = "";
      line = part.index;
      caret = sourceEditPlan(text, [{ start, end, value }], caret, caret).anchor;
    } else {
      const base = part === block.header ? block.delimiter : part;
      start = end = base.sourceStart + raw[base.index].length;
      const prefix = continuationPrefix(part.structure);
      value = "\n" + prefix + "|" + "  |".repeat(part.table);
      caret = start + 1 + prefix.length + 2;
      line = base.index;
    }
    const candidate = markdownTokens(text.slice(0, start) + value + text.slice(end));
    const moved = (index) => remove ? index < line ? index : index - 1 : index <= line ? index : index + 1;
    const sameOwner = (oldNode, newNode) => {
      for (; oldNode && newNode; oldNode = oldNode.parent, newNode = newNode.parent) {
        if (oldNode.quote !== newNode.quote || oldNode.marker !== newNode.marker || oldNode.width !== newNode.width || moved(oldNode.first) !== newNode.first) return false;
      }
      return !oldNode && !newNode;
    };
    const nextBlock = candidate[moved(block.header.index)].tableBlock;
    if (!nextBlock || nextBlock.rows.length !== block.rows.length + (remove ? -1 : 1) || !remove && !nextBlock.rows.includes(candidate[line + 1]) || syntax.some((old, index) => {
      if (remove && index === line) return false;
      const next = candidate[moved(index)];
      return !sameOwner(old.structure, next.structure) || old.level !== next.level || old.table !== next.table || old.tableBlock && moved(old.tableBlock.header.index) !== next.tableBlock?.header.index || !!old.tableDelimiter !== !!next.tableDelimiter || !!old.html !== !!next.html || !!old.fence !== !!next.fence || !!old.indentedCode !== !!next.indentedCode || !!old.protected !== !!next.protected || !!old.setext !== !!next.setext || !!old.thematic !== !!next.thematic || old.taskMarker?.checked !== next.taskMarker?.checked;
    })) return null;
    return { start, end, value, caret };
  }
  var tableCellSource = (part, cell) => cell.map((at) => part.sourceStart + columnOffset(part, part.column + at));
  function tableColumnSelection(text, start, end, syntax) {
    const part = tableRowSelection(text, start, end, syntax);
    if (!part || part.tableDelimiter || part.tableBlock.ragged) return null;
    const column = part.tableCells.findIndex((cell) => {
      const [a, b] = tableCellSource(part, cell);
      return a <= start && end <= b;
    });
    return column < 0 ? null : { part, column };
  }
  function tableColumnPlan(text, syntax, selection, remove) {
    const { part, column } = selection, block = part.tableBlock, count = part.table + (remove ? -1 : 1);
    if (!count) return null;
    const raw = text.split("\n"), changes = [], expected = /* @__PURE__ */ new Map();
    for (const row of [block.header, block.delimiter, ...block.rows]) {
      const ranges = row.tableCells.map((cell) => tableCellSource(row, cell));
      const cells = ranges.map(([a, b]) => text.slice(a, b));
      if (remove) cells.splice(column, 1);
      else cells.splice(column + 1, 0, row === block.header ? " Column " : row.tableDelimiter ? " --- " : "  ");
      const start = ranges[0][0], end = ranges[ranges.length - 1][1];
      const leading = start > row.sourceStart + row.bodyStart, trailing = end < row.sourceStart + raw[row.index].length;
      const before = !leading && (/^[ \t]*$/.test(cells[0]) || count === 1 && !trailing) ? "|" : "";
      const after = !trailing && /^[ \t]*$/.test(cells[cells.length - 1]) ? "|" : "";
      changes.push({ start, end, value: before + cells.join("|") + after });
      expected.set(row.index, cells);
    }
    const plan = sourceEditPlan(text, changes, 0, 0);
    const value = text.slice(0, plan.start) + plan.value + text.slice(plan.end), candidate = markdownTokens(value);
    const sameOwner = (oldNode, newNode) => {
      for (; oldNode && newNode; oldNode = oldNode.parent, newNode = newNode.parent) {
        if (oldNode.quote !== newNode.quote || oldNode.marker !== newNode.marker || oldNode.width !== newNode.width || oldNode.first !== newNode.first) return false;
      }
      return !oldNode && !newNode;
    };
    const nextBlock = candidate[block.header.index].tableBlock;
    if (!nextBlock || nextBlock.ragged || nextBlock.rows.length !== block.rows.length || syntax.some((old, index) => {
      const next = candidate[index], cells = expected.get(index);
      return !sameOwner(old.structure, next.structure) || old.level !== next.level || (cells ? count : old.table) !== next.table || old.tableBlock?.header.index !== next.tableBlock?.header.index || !!old.tableDelimiter !== !!next.tableDelimiter || !!old.html !== !!next.html || !!old.fence !== !!next.fence || !!old.indentedCode !== !!next.indentedCode || !!old.protected !== !!next.protected || !!old.setext !== !!next.setext || !!old.thematic !== !!next.thematic || old.taskMarker?.checked !== next.taskMarker?.checked || cells && (next.tableCells.length !== cells.length || next.tableCells.some((cell, column2) => value.slice(...tableCellSource(next, cell)) !== cells[column2]));
    })) return null;
    const target = remove ? candidate[part.index].regions[Math.min(column, count - 1)] : nextBlock.header.regions[column + 1];
    return { ...plan, anchor: target.start, focus: remove ? target.start : target.end };
  }
  function tableFormatSelection(text, start, end, syntax) {
    const first = syntax[text.slice(0, start).split("\n").length - 1];
    const last = syntax[text.slice(0, Math.max(start, end - 1)).split("\n").length - 1];
    return !first.protected && first.tableBlock && !first.tableBlock.ragged && first.tableBlock === last.tableBlock && start >= first.sourceStart + first.bodyStart ? first.tableBlock : null;
  }
  function tableSourceWidth(value, start = 0) {
    let column = start;
    for (const char of value) column += char === "	" ? 4 - column % 4 : 1;
    return column - start;
  }
  function tableFormatPlan(text, start, end, syntax, block) {
    const raw = text.split("\n"), changes = [], widths = [];
    const rows = [block.header, block.delimiter, ...block.rows].map((part) => ({
      part,
      offset: tableSourceWidth(raw[part.index].slice(0, part.bodyStart)) + 2,
      cells: part.tableCells.map((cell) => {
        const [a, b] = tableCellSource(part, cell), value2 = text.slice(a, b);
        const start2 = a + /^[ \t]*/.exec(value2)[0].length;
        const end2 = Math.max(start2, b - /[ \t]*$/.exec(value2)[0].length);
        return { start: start2, end: end2, value: text.slice(start2, end2) };
      })
    }));
    for (let column = 0; column < block.header.table; column++) {
      const marker = rows[1].cells[column].value;
      const left = marker.startsWith(":"), right = marker.endsWith(":");
      let width = 3 + Number(left) + Number(right);
      for (const row of rows) if (!row.part.tableDelimiter) width = Math.max(width, tableSourceWidth(row.cells[column].value, row.offset));
      widths.push(width);
      rows[1].cells[column].value = (left ? ":" : "") + "-".repeat(width - Number(left) - Number(right)) + (right ? ":" : "");
      for (const row of rows) row.offset += width + 3;
    }
    const change = (start2, end2, value2, before = false) => {
      if (text.slice(start2, end2) !== value2) changes.push({ start: start2, end: end2, value: value2, before });
    };
    for (const row of rows) {
      const { part, cells } = row;
      let cursor = part.sourceStart + part.bodyStart, offset = tableSourceWidth(raw[part.index].slice(0, part.bodyStart)) + 2, padding = 0;
      for (const [column, cell] of cells.entries()) {
        change(cursor, cell.start, column ? " ".repeat(padding) + " | " : "| ", column > 0);
        if (part.tableDelimiter) change(cell.start, cell.end, cell.value);
        padding = widths[column] - tableSourceWidth(cell.value, offset);
        cursor = cell.end;
        offset += widths[column] + 3;
      }
      change(cursor, part.sourceStart + raw[part.index].length, " ".repeat(padding) + " |", true);
    }
    if (!changes.length) return { unchanged: true };
    const plan = sourceEditPlan(text, changes, start, end);
    const value = text.slice(0, plan.start) + plan.value + text.slice(plan.end);
    if (value === text) return { unchanged: true };
    const candidate = markdownTokens(value);
    const expected = new Map(rows.map((row) => [row.part.index, row.cells.map((cell) => cell.value)]));
    const sameOwner = (oldNode, newNode) => {
      for (; oldNode && newNode; oldNode = oldNode.parent, newNode = newNode.parent) {
        if (oldNode.quote !== newNode.quote || oldNode.marker !== newNode.marker || oldNode.width !== newNode.width || oldNode.first !== newNode.first) return false;
      }
      return !oldNode && !newNode;
    };
    if (syntax.some((old, index) => {
      const next = candidate[index], cells = expected.get(index);
      return !sameOwner(old.structure, next.structure) || old.level !== next.level || old.table !== next.table || old.tableBlock?.header.index !== next.tableBlock?.header.index || !!old.tableBlock?.ragged !== !!next.tableBlock?.ragged || !!old.tableDelimiter !== !!next.tableDelimiter || !!old.html !== !!next.html || !!old.fence !== !!next.fence || !!old.indentedCode !== !!next.indentedCode || !!old.protected !== !!next.protected || !!old.setext !== !!next.setext || !!old.thematic !== !!next.thematic || old.taskMarker?.checked !== next.taskMarker?.checked || cells && (next.tableCells.length !== cells.length || next.tableCells.some((cell, column) => value.slice(...tableCellSource(next, cell)).replace(/^[ \t]+|[ \t]+$/g, "") !== cells[column]));
    })) return null;
    return plan;
  }
  var tableAlignments = { "table-align-left": "left", "table-align-center": "center", "table-align-right": "right", "table-align-none": "none" };
  function tableAlignment(text, selection) {
    const { part, column } = selection, row = part.tableBlock.delimiter;
    const [start, end] = tableCellSource(row, row.tableCells[column]);
    const match = /^([ \t]*)(:?)(-+)(:?)([ \t]*)$/.exec(text.slice(start, end));
    return {
      start: start + match[1].length,
      end: end - match[5].length,
      dashes: match[3],
      mode: match[2] ? match[4] ? "center" : "left" : match[4] ? "right" : "none"
    };
  }
  function tableAlignmentPlan(text, start, end, syntax, selection, mode) {
    const current = tableAlignment(text, selection);
    if (current.mode === mode) return { unchanged: true };
    const value = (mode === "left" || mode === "center" ? ":" : "") + current.dashes + (mode === "right" || mode === "center" ? ":" : "");
    const plan = sourceEditPlan(text, [{ start: current.start, end: current.end, value }], start, end);
    const candidate = markdownTokens(text.slice(0, plan.start) + plan.value + text.slice(plan.end));
    const sameOwner = (oldNode, newNode) => {
      for (; oldNode && newNode; oldNode = oldNode.parent, newNode = newNode.parent) {
        if (oldNode.quote !== newNode.quote || oldNode.marker !== newNode.marker || oldNode.width !== newNode.width || oldNode.first !== newNode.first) return false;
      }
      return !oldNode && !newNode;
    };
    if (syntax.some((old, index) => {
      const next = candidate[index];
      return !sameOwner(old.structure, next.structure) || old.level !== next.level || old.table !== next.table || old.tableBlock?.header.index !== next.tableBlock?.header.index || !!old.tableBlock?.ragged !== !!next.tableBlock?.ragged || !!old.tableDelimiter !== !!next.tableDelimiter || !!old.html !== !!next.html || !!old.fence !== !!next.fence || !!old.indentedCode !== !!next.indentedCode || !!old.protected !== !!next.protected || !!old.setext !== !!next.setext || !!old.thematic !== !!next.thematic || old.taskMarker?.checked !== next.taskMarker?.checked;
    })) return null;
    return plan;
  }
  function writingSelection(name, text, start, end, syntax) {
    const first = text.slice(0, start).split("\n").length - 1;
    const last = text.slice(0, Math.max(start, end - 1)).split("\n").length - 1;
    const seen = /* @__PURE__ */ new Set(), units = [];
    for (let index = first; index <= last; index++) {
      const part = syntax[index];
      if (part.protected) continue;
      const item = part.structure?.item, quoted = part.structure?.quoted;
      const node = name === "quote" ? quoted || item : item;
      const open = node ? syntax[node.first] : part;
      if (open.protected || seen.has(node || part)) continue;
      if (name === "task-toggle" && !item?.task?.taskMarker) continue;
      if (name === "checklist" && !item?.task?.taskMarker && (open.level || open.setext || !(open.empty !== void 0 || open.paragraph && open.regions?.length))) continue;
      seen.add(node || part);
      units.push({ node, item, quoted, part: open, first: open.index, last: node?.last ?? open.index });
    }
    units.sort((a, b) => a.first - b.first || b.last - a.last);
    if (name === "checklist" || name === "task-toggle") return units;
    const result = [];
    for (const unit of units) if (!result.length || unit.first > result[result.length - 1].last) result.push(unit);
    return result;
  }
  function writingActive(name, units) {
    return units.length > 0 && units.every((unit) => name === "quote" ? !!unit.quoted : name === "checklist" ? !!unit.item?.task?.taskMarker : name === "task-toggle" ? !!unit.item?.task?.taskMarker?.checked : unit.item && (/^\d/.test(unit.item.marker) ? "olist" : "ulist") === name);
  }
  function writingChanges(name, text, units, syntax) {
    const raw = text.split("\n"), changes = [], remove = writingActive(name, units);
    const change = (start, end, value) => {
      if (text.slice(start, end) !== value) changes.push({ start, end, value });
    };
    const column = (part, from, to, value) => {
      const edit = columnChange(part, from, to, value);
      change(edit.start, edit.end, edit.value);
    };
    const removeTask = (item) => {
      const part = item?.task, marker = part?.taskMarker;
      if (marker) change(part.sourceStart + marker.start, part.sourceStart + marker.end + (/^[ \t]/.test(raw[part.index].slice(marker.end)) ? 1 : 0), "");
    };
    let number = 0, previous = null;
    for (const unit of units) {
      const { part, item, node } = unit;
      number = previous && (previous.node?.parent || null) === (node?.parent || null) && previous.last + 1 === unit.first ? number + 1 : 1;
      previous = unit;
      if (name === "task-toggle") {
        const task = item.task, marker = task.taskMarker;
        if (remove || !marker.checked) change(task.sourceStart + marker.start + 1, task.sourceStart + marker.end - 1, remove ? " " : "x");
      } else if (name === "quote") {
        if (!remove && unit.quoted) continue;
        for (let index = unit.first; index <= unit.last; index++) {
          const line = syntax[index], prefix = line.prefixes.find((prefix2) => prefix2.node === node);
          if (remove) {
            if (prefix) column(line, prefix.markerStart, prefix.end, "");
          } else if (prefix) column(line, prefix.start, prefix.start, "> ");
          else if (node) {
            const matched = line.prefixes[line.prefixes.length - 1]?.node;
            const missing = [];
            for (let parent = node.parent; parent && parent !== matched; parent = parent.parent) missing.push(parent.quote ? "> " : " ".repeat(parent.width));
            column(line, line.column, line.column, missing.reverse().join("") + "> ");
          } else {
            change(line.sourceStart + line.bodyStart, line.sourceStart + line.bodyStart, line.continuation || "");
            change(line.sourceStart + line.insertAt, line.sourceStart + line.insertAt, "> ");
          }
        }
      } else if (name === "checklist" && item) {
        if (remove) removeTask(item);
        else if (!item.task?.taskMarker) {
          const at = part.sourceStart + part.insertAt;
          change(at, at, (item.end === item.markerStart + item.marker.length ? " " : "") + "[ ] ");
        }
      } else if (item) {
        const kind = /^\d/.test(item.marker) ? "olist" : "ulist";
        if (!remove && kind === name) continue;
        const marker = name === "olist" ? number + "." : "-";
        let delta = -(item.end - item.markerStart);
        if (!remove) {
          const prefix = raw[part.index].slice(0, columnOffset(part, item.markerStart)) + marker + raw[part.index].slice(columnOffset(part, item.markerStart + item.marker.length), columnOffset(part, item.end));
          let width = 0;
          for (const char of prefix) width += char === "	" ? 4 - width % 4 : 1;
          delta = width - item.end;
        }
        column(part, item.markerStart, remove ? item.end : item.markerStart + item.marker.length, remove ? "" : marker);
        if (remove) removeTask(item);
        for (let index = item.first + 1; index <= item.last; index++) {
          const line = syntax[index], prefix = line.prefixes.find((prefix2) => prefix2.node === item);
          if (!prefix || /^[\t ]*$/.test(raw[index]) || !delta) continue;
          column(line, delta < 0 ? Math.max(prefix.start, prefix.end + delta) : prefix.end, prefix.end, delta > 0 ? " ".repeat(delta) : "");
        }
      } else {
        const marker = name === "olist" ? number + ". " : name === "checklist" ? "- [ ] " : "- ";
        change(part.sourceStart + part.bodyStart, part.sourceStart + part.bodyStart, part.continuation || "");
        change(part.sourceStart + part.insertAt, part.sourceStart + part.insertAt, marker);
      }
    }
    return changes;
  }
  function implicitIndentPrefix(part, target = null, delta = 0, omitted = null) {
    const matched = part.prefixes[part.prefixes.length - 1]?.node, path = [];
    for (let node = part.structure; node && node !== matched; node = node.parent) path.push(node);
    return path.reverse().map((node) => (node === target ? " ".repeat(delta) : "") + (node === omitted ? "" : node.quote ? "> " : " ".repeat(node.width))).join("");
  }
  function plainIndentChange(part, raw, unindent) {
    const width = part.indent, next = unindent ? Math.max(0, width - (width % 4 || 4)) : width + 4 - width % 4;
    if (width === next) return null;
    let extra = implicitIndentPrefix(part);
    for (const prefix of part.prefixes) {
      if (!prefix.node.quote && prefix.end - prefix.start < prefix.node.width) extra += " ".repeat(prefix.node.width - (prefix.end - prefix.start));
    }
    if (raw[columnOffset(part, part.column) - 1] === ">" && !extra.startsWith(">")) extra = " " + extra;
    const end = part.column + width;
    if (!extra) return unindent ? columnChange(part, part.column + next, end, "") : columnChange(part, end, end, " ".repeat(next - width));
    let preserved = "";
    for (let column = part.column; column < end; ) {
      const char = raw[columnOffset(part, column)], size = 4 - column % 4;
      const insideTab = part.columns && part.columns[column] === part.columns[column + 1];
      if (!insideTab && char === "	" && column + size <= end) {
        preserved += char;
        column += size;
      } else {
        preserved += " ";
        column++;
      }
    }
    let base = part.column;
    for (const char of extra) base += char === "	" ? 4 - base % 4 : 1;
    let indent = "", used = 0;
    for (const char of preserved) {
      const size = char === "	" ? 4 - (base + used) % 4 : 1;
      if (used + size > next) break;
      indent += char;
      used += size;
    }
    return columnChange(part, part.column, end, extra + indent + " ".repeat(next - used));
  }
  function openingStructures(syntax) {
    return syntax.flatMap((part) => part.prefixes.filter((prefix) => prefix.node.first === part.index).map((prefix) => prefix.node));
  }
  function validIndentMove(before, after, roots, newParent) {
    const mapped = /* @__PURE__ */ new Map(), selected = new Set(roots);
    for (let index = 0; index < before.length; index++) {
      const a = before[index], b = after[index];
      if (!!a.html !== !!b.html || !!a.indentedCode !== !!b.indentedCode || a.fence?.parts[0].index !== b.fence?.parts[0].index || a.fence?.close?.index !== b.fence?.close?.index) return false;
      const oldNodes = a.prefixes.filter((prefix) => prefix.node.first === index).map((prefix) => prefix.node);
      const newNodes = b.prefixes.filter((prefix) => prefix.node.first === index).map((prefix) => prefix.node);
      if (oldNodes.length !== newNodes.length) return false;
      for (let at = 0; at < oldNodes.length; at++) {
        if (oldNodes[at].quote !== newNodes[at].quote || oldNodes[at].marker !== newNodes[at].marker) return false;
        mapped.set(oldNodes[at], newNodes[at]);
      }
    }
    for (const [oldNode, newNode] of mapped) {
      const parent = selected.has(oldNode) ? newParent : oldNode.parent;
      if (newNode.parent !== (parent ? mapped.get(parent) : null)) return false;
    }
    return before.every((part, index) => after[index].structure === (part.structure ? mapped.get(part.structure) : null));
  }
  function indentationPlan(text, start, end, syntax, unindent) {
    const first = text.slice(0, start).split("\n").length - 1;
    const last = text.slice(0, Math.max(start, end - 1)).split("\n").length - 1;
    const raw = text.split("\n"), seen = /* @__PURE__ */ new Set(), units = [];
    for (let index = first; index <= last; index++) {
      const part = syntax[index];
      if (part.html || part.fence && (part.fence.parts[0] === part || part.fence.close === part)) continue;
      const item = !part.fence && !part.indentedCode && part.structure?.item;
      if (seen.has(item || part)) continue;
      seen.add(item || part);
      units.push({ item, first: item ? item.first : index, last: item ? item.last : index });
    }
    units.sort((a, b) => a.first - b.first || b.last - a.last);
    const targets = [];
    for (const unit of units) if (!targets.length || unit.first > targets[targets.length - 1].last) targets.push(unit);
    if (!targets.length) return {};
    const list = targets.filter((unit) => unit.item), changes = [];
    if (!list.length) {
      for (const unit of targets) {
        const change = plainIndentChange(syntax[unit.first], raw[unit.first], unindent);
        if (change && text.slice(change.start, change.end) !== change.value) changes.push(change);
      }
    } else {
      const roots = list.map((unit) => unit.item), parent = roots[0].parent;
      if (list.length !== targets.length || roots.some((node) => node.parent !== parent)) return { reason: "Select sibling list items or ordinary lines separately." };
      const siblings = openingStructures(syntax).filter((node) => !node.quote && node.parent === parent);
      const index = siblings.indexOf(roots[0]);
      if (roots.some((node, at) => node !== siblings[index + at])) return { reason: "Select a continuous group of sibling items." };
      const previous = siblings[index - 1];
      let newParent;
      if (unindent) {
        if (!parent || parent.quote) return { reason: "This item is already at its outermost list level." };
        if (parent.first === roots[0].first || index + roots.length !== siblings.length || raw.slice(roots[roots.length - 1].last + 1, parent.last + 1).some((line) => !/^[\t ]*$/.test(line))) {
          return { reason: "Lifting these items would move unselected content into another item." };
        }
        newParent = parent.parent;
      } else {
        if (!previous || previous.last + 1 < roots[0].first) return { reason: "Nesting needs a preceding sibling item." };
        newParent = previous;
      }
      for (const node of roots) for (let index2 = node.first; index2 <= node.last; index2++) {
        const part = syntax[index2], prefix = part.prefixes.find((prefix2) => prefix2.node === (unindent ? parent : node));
        let change;
        if (prefix) change = unindent ? columnChange(part, prefix.start, prefix.end, "") : columnChange(part, prefix.start, prefix.start, " ".repeat(previous.width));
        else {
          const value = implicitIndentPrefix(part, unindent ? null : node, unindent ? 0 : previous.width, unindent ? parent : null);
          change = columnChange(part, part.column, part.column, value);
        }
        if (text.slice(change.start, change.end) !== change.value) changes.push(change);
      }
      if (!changes.length) return {};
      const plan = sourceEditPlan(text, changes, start, end);
      const candidate = markdownTokens(text.slice(0, plan.start) + plan.value + text.slice(plan.end));
      if (!validIndentMove(syntax, candidate, roots, newParent)) return { reason: "This move cannot preserve the surrounding Markdown structure." };
      return { plan };
    }
    return changes.length ? { plan: sourceEditPlan(text, changes, start, end) } : {};
  }
  function createPainter() {
    const tokenPools = /* @__PURE__ */ new WeakMap();
    const runPools = /* @__PURE__ */ new WeakMap();
    function paintTokens(target, tokens) {
      const pool = tokenPools.get(target) || [];
      tokenPools.set(target, pool);
      for (let i = 0; i < tokens.length; i++) {
        if (!pool[i]) {
          const span = document.createElement("span");
          span.append(document.createTextNode(""));
          pool.push(span);
          target.append(span);
        }
        if (pool[i].hidden) pool[i].hidden = false;
        if (pool[i].className !== tokens[i].className) pool[i].className = tokens[i].className;
        if (pool[i].firstChild.data !== tokens[i].text) pool[i].firstChild.data = tokens[i].text;
      }
      for (let i = tokens.length; i < pool.length; i++) {
        if (!pool[i].hidden) pool[i].hidden = true;
        if (pool[i].firstChild.data !== "") pool[i].firstChild.data = "";
      }
      return pool;
    }
    function paintBlock(source, target, context) {
      const parts = runs(source);
      const own = parts.filter((part) => !part.block);
      if (!parts.length) context.index++;
      const pool = runPools.get(target) || [];
      runPools.set(target, pool);
      let level = 0;
      for (let i = 0; i < parts.length; i++) {
        if (!pool[i]) {
          const wrapper2 = document.createElement("span");
          wrapper2.className = "lightmarkdown-run";
          const block2 = document.createElement("div");
          const inline2 = document.createElement("span");
          wrapper2.append(block2, inline2);
          target.append(wrapper2);
          pool.push({ wrapper: wrapper2, block: block2, inline: inline2 });
        }
        const { wrapper, block, inline } = pool[i];
        const part = parts[i];
        wrapper.hidden = false;
        block.hidden = !part.block;
        inline.hidden = !!part.block;
        if (part.block) paintBlock(part.block, block, context);
        else {
          const lines = part.nodes.map(inlineText).join("").split("\n");
          let last = part.nodes[part.nodes.length - 1];
          while (last?.lastChild) last = last.lastChild;
          inline.classList.toggle("lightmarkdown-trailing", lines.length > 1 && lines[lines.length - 1] === "" && last?.nodeName === "BR");
          const tokens = [], fences = [];
          for (let j = 0; j < lines.length; j++) {
            const parsed = context.lines[context.index++];
            if (own.length === 1 && lines.length === 1) level = parsed.level;
            if (j) tokens.push({ text: "\n", className: "" });
            const start = tokens.length;
            for (const token of parsed.tokens) tokens.push(parsed.fence ? { text: token.text, className: (token.className + " lightmarkdown-fenced-code").trim() } : token);
            if (parsed.fence) fences.push({ block: parsed.fence, start, end: tokens.length - 1 });
          }
          const spans = paintTokens(inline, tokens);
          for (const { block: block2, start, end } of fences) {
            if (end < start) continue;
            const band = context.fences.get(block2);
            if (band) band.last = spans[end];
            else context.fences.set(block2, { first: spans[start], last: spans[end] });
          }
        }
      }
      for (let i = parts.length; i < pool.length; i++) pool[i].wrapper.hidden = true;
      if (level) {
        if (source.dataset.mdHeading !== String(level)) source.dataset.mdHeading = String(level);
        target.dataset.mdHeading = String(level);
      } else {
        if (source.hasAttribute("data-md-heading")) delete source.dataset.mdHeading;
        delete target.dataset.mdHeading;
      }
    }
    let bands = [];
    function layout(target) {
      if (!bands.length) {
        target.style.backgroundImage = "none";
        return;
      }
      const style = target.ownerDocument.defaultView.getComputedStyle(target);
      const origin = target.getBoundingClientRect();
      const left = parseFloat(style.paddingLeft), right = parseFloat(style.paddingRight);
      const rectangles = [];
      for (const { first, last } of bands) {
        const a = first.getClientRects()[0], ends = last.getClientRects(), b = ends[ends.length - 1];
        if (!a || !b || !a.height || !b.height) continue;
        const leading = parseFloat(target.ownerDocument.defaultView.getComputedStyle(first).lineHeight);
        const top = a.top - origin.top - (leading - a.height) / 2;
        const bottom = b.bottom - origin.top + (leading - b.height) / 2;
        rectangles.push({ top, height: bottom - top });
      }
      target.style.backgroundImage = rectangles.map(() => "linear-gradient(var(--lightmetal-accent-soft), var(--lightmetal-accent-soft))").join(", ") || "none";
      target.style.backgroundRepeat = "no-repeat";
      target.style.backgroundPosition = rectangles.map((rect) => `${left}px ${rect.top}px`).join(", ");
      target.style.backgroundSize = rectangles.map((rect) => `calc(100% - ${left + right}px) ${rect.height}px`).join(", ");
    }
    return {
      // Native DOM block/BR choices must not decide logical syntax ownership.
      paint(source, target, lines) {
        const context = { lines, index: 0, fences: /* @__PURE__ */ new Map() };
        paintBlock(source, target, context);
        bands = Array.from(context.fences.values());
        layout(target);
      },
      layout
    };
  }
  var paths = {
    bold: '<path d="M6 4h7a4 4 0 0 1 0 8H6V4Zm0 8h8a4 4 0 0 1 0 8H6v-8Z"/>',
    italic: '<path d="M10 4h8M6 20h8M15 4 9 20"/>',
    strikethrough: '<path d="M17 6c-1.2-1.4-3-2-5-2-3 0-5 1.5-5 4 0 1.6 1.2 2.6 3 3.2M7 18c1.2 1.3 3 2 5 2 3 0 5-1.5 5-4 0-1.6-1.2-2.6-3-3.2M4 12h16"/>',
    paragraph: '<path d="M18 4H10a5 5 0 0 0 0 10h2M12 4v16M16 4v16"/>',
    quote: '<path d="M10 6c-3 2-4 4-4 7v5h5v-5H7M19 6c-3 2-4 4-4 7v5h5v-5h-4"/>',
    olist: '<path d="M3 5l2-1v5M3 14c0-2 3-2 3 0 0 1-3 3-3 4h3M11 6h10M11 12h10M11 18h10"/>',
    ulist: '<circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/><path d="M10 6h11M10 12h11M10 18h11"/>',
    code: '<path d="m8 7-5 5 5 5m8-10 5 5-5 5m-3-13-2 16"/>',
    line: '<path d="M4 12h16"/>',
    link: '<path d="M10 13a5 5 0 0 0 7 .5l2.5-2.5a5 5 0 0 0-7-7L11 5.5M14 11a5 5 0 0 0-7-.5L4.5 13a5 5 0 0 0 7 7L13 18.5"/>',
    image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9" r="1.5"/><path d="m21 16-5-5L7 20"/>',
    table: '<rect x="3" y="4" width="18" height="16" rx="1"/><path d="M3 9h18M3 14h18M12 4v16"/>',
    undo: '<path d="m9 5-5 5 5 5M4 10h9a6 6 0 0 1 0 12"/>',
    redo: '<path d="m15 5 5 5-5 5m5-5h-9a6 6 0 0 0 0 12"/>'
  };
  var titles = {
    "side-by-side": "Side-by-side",
    fullscreen: "Fullscreen",
    preview: "Preview",
    guide: "Help",
    bold: "Bold",
    italic: "Italic",
    strikethrough: "Strike-through",
    paragraph: "Paragraph",
    quote: "Quote",
    olist: "Ordered List",
    ulist: "Unordered List",
    code: "Inline Code",
    checklist: "Task List",
    "task-toggle": "Toggle Task",
    "table-insert": "Insert Table\u2026",
    "table-format": "Format Table",
    "table-row-after": "Add Row After",
    "table-row-delete": "Delete Row",
    "table-column-after": "Add Column After",
    "table-column-delete": "Delete Column",
    "table-align-left": "Align Column Left",
    "table-align-center": "Center Column",
    "table-align-right": "Align Column Right",
    "table-align-none": "Clear Column Alignment",
    codeblock: "Code Block",
    line: "Horizontal Line",
    link: "Link",
    image: "Image",
    table: "Table",
    undo: "Undo",
    redo: "Redo",
    heading: "Cycle Heading",
    "heading-smaller": "Smaller Heading",
    "heading-bigger": "Bigger Heading"
  };
  for (let i = 1; i <= 6; i++) {
    titles["heading" + i] = "Heading " + i;
    paths["heading" + i] = `<path d="M3 5v14M11 5v14M3 12h8"/><text x="15" y="19" fill="currentColor" stroke="none" font-size="14">${i}</text>`;
  }
  paths["side-by-side"] = '<rect x="3" y="4" width="18" height="16" rx="1"/><path d="M12 4v16"/>';
  paths.fullscreen = '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>';
  paths.preview = '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>';
  paths.guide = '<circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 0 1 6 0c0 2-3 2-3 4m0 3h.01"/>';
  paths.codeblock = '<path fill="currentColor" stroke="none" d="M6.25 3C4.45507 3 3 4.45507 3 6.25V17.75C3 19.5449 4.45507 21 6.25 21H17.75C19.5449 21 21 19.5449 21 17.75V6.25C21 4.45507 19.5449 3 17.75 3H6.25ZM4.5 6.25C4.5 5.2835 5.2835 4.5 6.25 4.5H17.75C18.7165 4.5 19.5 5.2835 19.5 6.25V17.75C19.5 18.7165 18.7165 19.5 17.75 19.5H6.25C5.2835 19.5 4.5 18.7165 4.5 17.75V6.25ZM10.5303 9.28033C10.8232 8.98744 10.8232 8.51256 10.5303 8.21967C10.2374 7.92678 9.76256 7.92678 9.46967 8.21967L6.21967 11.4697C5.92678 11.7626 5.92678 12.2374 6.21967 12.5303L9.46967 15.7803C9.76256 16.0732 10.2374 16.0732 10.5303 15.7803C10.8232 15.4874 10.8232 15.0126 10.5303 14.7197L7.81066 12L10.5303 9.28033ZM14.5303 8.21967C14.2374 7.92678 13.7626 7.92678 13.4697 8.21967C13.1768 8.51256 13.1768 8.98744 13.4697 9.28033L16.1893 12L13.4697 14.7197C13.1768 15.0126 13.1768 15.4874 13.4697 15.7803C13.7626 16.0732 14.2374 16.0732 14.5303 15.7803L17.7803 12.5303C18.0732 12.2374 18.0732 11.7626 17.7803 11.4697L14.5303 8.21967Z"/>';
  paths.checklist = '<rect x="3" y="4" width="6" height="6" rx="1"/><path d="m4 7 1 1 3-3M13 7h8M13 17h8"/><rect x="3" y="14" width="6" height="6" rx="1"/>';
  paths["task-toggle"] = '<path d="m5 12 4 4L19 6"/>';
  paths["table-insert"] = paths.table;
  paths["table-format"] = '<rect x="3" y="4" width="18" height="16" rx="1"/><path d="M3 9h18M9 4v16M15 4v16m-9-7v4m6-4v4m6-4v4"/>';
  paths["table-row-after"] = '<path d="M3 4h18v10H3zM3 9h18M12 4v10m0 3v6m-3-3h6"/>';
  paths["table-row-delete"] = '<path d="M3 4h18v10H3zM3 9h18M12 4v10m-3 6h6"/>';
  paths["table-column-after"] = '<path d="M3 3h11v18H3zM3 9h11M8 3v18m9-9h6m-3-3v6"/>';
  paths["table-column-delete"] = '<path d="M3 3h11v18H3zM3 9h11M8 3v18m9-9h6"/>';
  paths["table-align-left"] = '<path d="M3 5h18M3 10h12M3 15h18M3 20h12"/>';
  paths["table-align-center"] = '<path d="M3 5h18M6 10h12M3 15h18M6 20h12"/>';
  paths["table-align-right"] = '<path d="M3 5h18M9 10h12M3 15h18M9 20h12"/>';
  paths["table-align-none"] = '<path d="M3 5h18M3 10h18M3 15h9M3 20h9m4-5 5 5m0-5-5 5"/>';
  paths.heading = paths["heading-smaller"] = paths.heading2;
  paths["heading-bigger"] = paths.heading1;
  var headingAction = (name) => /^heading(?:[1-6]|-smaller|-bigger)?$/.test(name) || name === "paragraph";
  var icon = (name) => `<svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths[name]}</svg>`;
  var defaults = ["bold", "italic", "strikethrough", "heading1", "heading2", "paragraph", "quote", "ulist", "olist", "code", "codeblock", "line", "link", "image", "table", "undo", "redo", "fullscreen", "guide"];
  var separator = /* @__PURE__ */ Symbol("toolbar separator");
  var mounted = /* @__PURE__ */ new WeakSet();
  var fullscreenOwners = /* @__PURE__ */ new WeakMap();
  var keyboardHelpId = 0;
  var tablePickerId = 0;
  var tableMenuId = 0;
  var tableMenuActions = [
    "table-insert",
    "table-format",
    "|",
    "table-row-after",
    "table-row-delete",
    "table-column-after",
    "table-column-delete",
    "|",
    ...Object.keys(tableAlignments)
  ];
  var keyboardHelp = "Tab indents \xB7 Shift+Tab unindents \xB7 Esc then Tab moves focus";
  var defaultClasses = {
    actionbar: "lightmetal-actionbar",
    button: "lightmetal-button",
    content: "lightmetal-content",
    selected: "lightmetal-button-selected",
    error: "lightmetal-error"
  };
  function resolveActions(requested) {
    if (requested == null) requested = defaults;
    if (!Array.isArray(requested)) throw new TypeError("actions must be an array.");
    const actions = [];
    for (const value of requested) {
      if (value === "|") {
        if (actions.length && actions[actions.length - 1] !== separator) actions.push(separator);
        continue;
      }
      const action = typeof value === "string" ? { name: value } : value;
      if (!action || typeof action !== "object") throw new TypeError("Toolbar actions must be names or objects.");
      const builtin = Object.prototype.hasOwnProperty.call(titles, action.name);
      if (!builtin && typeof action.result !== "function") throw new TypeError(`Unknown toolbar action: ${action.name || value}`);
      if (action.result != null && typeof action.result !== "function") throw new TypeError("Action result must be a function.");
      if (action.state != null && typeof action.state !== "function") throw new TypeError("Action state must be a function.");
      actions.push({ ...builtin ? { title: titles[action.name], icon: icon(action.name) } : {}, ...action });
    }
    if (actions[actions.length - 1] === separator) actions.pop();
    return actions;
  }
  var defaultShortcuts = { bold: "Mod+b", italic: "Mod+i", link: "Mod+k", code: "Mod+`" };
  function parseShortcut(value) {
    if (typeof value !== "string") throw new TypeError("A shortcut must be a chord string or false.");
    const parts = value.split("+").map((part) => part.trim().toLowerCase());
    const last = parts.pop(), aliases = { space: " ", plus: "+", backtick: "`" };
    const key = Object.prototype.hasOwnProperty.call(aliases, last) ? aliases[last] : last;
    const modifiers = /* @__PURE__ */ new Set(), names = { mod: "mod", ctrl: "ctrl", control: "ctrl", meta: "meta", cmd: "meta", command: "meta", alt: "alt", shift: "shift" };
    for (const part of parts) {
      const name = Object.prototype.hasOwnProperty.call(names, part) && names[part];
      if (!name || modifiers.has(name)) throw new TypeError(`Invalid shortcut: ${value}`);
      modifiers.add(name);
    }
    if (!key || Array.from(key).length !== 1 || /[\p{C}\p{Z}]/u.test(key) && key !== " " || !["mod", "ctrl", "meta", "alt"].some((name) => modifiers.has(name)) || modifiers.has("mod") && (modifiers.has("ctrl") || modifiers.has("meta"))) throw new TypeError(`Invalid shortcut: ${value}`);
    if (!modifiers.has("alt") && /[zy]/.test(key) && ["mod", "ctrl", "meta"].some((name) => modifiers.has(name))) {
      throw new TypeError("Native undo/redo shortcuts cannot be rebound.");
    }
    const alt = modifiers.has("alt"), shift = modifiers.has("shift");
    const variants = (modifiers.has("mod") ? ["ctrl", "meta"] : [null]).map((primary) => ({
      key,
      ctrl: primary === "ctrl" || modifiers.has("ctrl"),
      meta: primary === "meta" || modifiers.has("meta"),
      alt,
      shift
    }));
    const keyName = key === " " ? "Space" : key === "+" ? "Plus" : key;
    const aria = variants.map((chord) => [chord.ctrl && "Control", chord.meta && "Meta", alt && "Alt", shift && "Shift", keyName].filter(Boolean).join("+")).join(" ");
    const label = [modifiers.has("mod") && "Ctrl/Cmd", modifiers.has("ctrl") && "Ctrl", modifiers.has("meta") && "Cmd", alt && "Alt", shift && "Shift", keyName.length === 1 ? keyName.toUpperCase() : keyName].filter(Boolean).join("+");
    return { variants, aria, label };
  }
  function resolveShortcuts(requested, actions) {
    if (requested === false) return [];
    if (requested != null && Object.prototype.toString.call(requested) !== "[object Object]") throw new TypeError("shortcuts must be an object or false.");
    const bindings = new Map(Object.entries(defaultShortcuts).filter(([name]) => actions.some((action) => action.name === name)));
    for (const [name, value] of Object.entries(requested || {})) {
      if (!Object.prototype.hasOwnProperty.call(titles, name) && !actions.some((action) => action.name === name)) throw new TypeError(`Unknown shortcut action: ${name}`);
      if (value === false) bindings.delete(name);
      else bindings.set(name, value);
    }
    const used = /* @__PURE__ */ new Set();
    return Array.from(bindings, ([name, value]) => {
      const binding = parseShortcut(value);
      for (const chord of binding.variants) {
        const signature = JSON.stringify(chord);
        if (used.has(signature)) throw new TypeError(`Duplicate shortcut: ${value}`);
        used.add(signature);
      }
      return { ...binding, action: actions.find((action) => action.name === name) || { name } };
    });
  }
  var matchesShortcut = (chord, event) => chord.key === event.key.toLowerCase() && chord.ctrl === event.ctrlKey && chord.meta === event.metaKey && chord.alt === event.altKey && chord.shift === event.shiftKey;
  function init(settings = {}) {
    const { element, onChange = null } = settings;
    if (!element || element.nodeType !== 1 || element.ownerDocument !== document) throw new TypeError("element must be an element in this document.");
    if (onChange != null && typeof onChange !== "function") throw new TypeError("onChange must be a function.");
    if (mounted.has(element)) throw new TypeError("This element already has a Markdown editor.");
    if (settings.sourceHighlight != null && typeof settings.sourceHighlight !== "function") throw new TypeError("sourceHighlight must be a function.");
    const highlightSource = settings.sourceHighlight ? createSourceHighlighter(settings.sourceHighlight) : null;
    const previewRender = settings.preview?.render;
    if (settings.preview != null && (typeof settings.preview !== "object" || typeof previewRender !== "function")) throw new TypeError("preview.render must be a function.");
    const actions = resolveActions(settings.actions ?? (previewRender ? [...defaults.slice(0, -2), "preview", "side-by-side", "fullscreen", "guide"] : void 0));
    if (!previewRender && actions.some((action) => ["preview", "side-by-side"].includes(action.name) && !action.result)) throw new TypeError("Preview and Side-by-side actions require preview.render.");
    const shortcuts = resolveShortcuts(settings.shortcuts, actions);
    const classes = { ...defaultClasses, ...settings.classes };
    for (const [name, value] of Object.entries(classes)) {
      if (typeof value !== "string" || !value.trim() || name === "selected" && /\s/.test(value)) throw new TypeError(`Invalid class: ${name}`);
    }
    const ownedClasses = ["lightmetal", "lightmarkdown"].filter((name) => !element.classList.contains(name));
    element.classList.add(...ownedClasses);
    const toolbar = document.createElement("div");
    toolbar.className = classes.actionbar;
    toolbar.tabIndex = -1;
    toolbar.setAttribute("role", "group");
    toolbar.setAttribute("aria-label", "Markdown formatting");
    toolbar.hidden = actions.length === 0;
    const scroll = document.createElement("div");
    scroll.className = "lightmarkdown-scroll";
    scroll.tabIndex = -1;
    const stage = document.createElement("div");
    stage.className = "lightmarkdown-stage";
    const paint = document.createElement("div");
    paint.className = classes.content + " lightmarkdown-paint";
    paint.setAttribute("aria-hidden", "true");
    paint.inert = true;
    const content = document.createElement("div");
    content.className = classes.content + " lightmarkdown-input";
    content.contentEditable = "true";
    content.spellcheck = false;
    content.setAttribute("role", "textbox");
    content.setAttribute("aria-label", "Markdown source");
    content.setAttribute("aria-multiline", "true");
    content.setAttribute("autocapitalize", "off");
    const error = document.createElement("span");
    error.className = classes.error;
    error.setAttribute("role", "status");
    error.hidden = true;
    const errorText = document.createTextNode("");
    error.append(errorText);
    const help = document.createElement("div");
    help.className = "lightmarkdown-keyboard-hint";
    do {
      help.id = "lightmarkdown-keyboard-help-" + ++keyboardHelpId;
    } while (document.getElementById(help.id));
    help.setAttribute("aria-live", "polite");
    help.setAttribute("aria-atomic", "true");
    const helpText = document.createTextNode(keyboardHelp);
    help.append(helpText);
    content.setAttribute("aria-describedby", help.id);
    const status = document.createElement("div");
    status.className = "lightmarkdown-status";
    status.setAttribute("role", "group");
    status.setAttribute("aria-label", "Markdown statistics");
    const statusText = document.createTextNode("lines: 1   words: 0   1:1");
    status.append(statusText);
    const footer = document.createElement("div");
    footer.className = "lightmarkdown-footer";
    footer.append(help, status);
    const preview = document.createElement("div");
    preview.className = "lightmarkdown-preview";
    preview.setAttribute("role", "region");
    preview.setAttribute("aria-label", "Markdown preview");
    preview.tabIndex = 0;
    preview.hidden = true;
    stage.append(paint, content);
    scroll.append(stage);
    element.append(toolbar, scroll, preview, footer);
    let composing = false;
    let destroyed = false;
    let savedRange = null;
    let previewing = false, sideBySide = false, previewVersion = 0, sourceScroll = 0;
    let fullscreen = null;
    const syncedScroll = /* @__PURE__ */ new WeakMap();
    let guide = null;
    let tableMenu = null;
    const tableMenuButtons = [];
    let tablePicker = null, tableSnapshot = null, tableObserver = null, tableMessage, tableColumns, tableRows;
    let lastNotified = "";
    let finalText = "";
    let editDepth = 0, pendingRender = false, renderVersion = 0;
    let emptyFormat = null, tabEscape = false;
    function resetKeyboardHint() {
      tabEscape = false;
      if (helpText.data !== keyboardHelp) helpText.data = keyboardHelp;
    }
    const buttons = [];
    const cleanups = [];
    const paintSource = createPainter();
    const resizePaint = new ResizeObserver(() => {
      if (!destroyed) paintSource.layout(paint);
    });
    resizePaint.observe(stage);
    resizePaint.observe(content);
    cleanups.push(() => resizePaint.disconnect());
    const listen = (node, type, handler) => {
      node.addEventListener(type, handler);
      cleanups.push(() => node.removeEventListener(type, handler));
    };
    const owns = (range) => range && content.contains(range.startContainer) && content.contains(range.endContainer);
    const remember = () => {
      const selection = document.getSelection();
      if (selection.rangeCount && owns(selection.getRangeAt(0))) savedRange = selection.getRangeAt(0).cloneRange();
    };
    const getMarkdown = () => destroyed ? finalText : markdown(content);
    function restore() {
      if (destroyed || composing) return null;
      remember();
      const range = owns(savedRange) ? savedRange.cloneRange() : document.createRange();
      if (!owns(savedRange)) {
        range.selectNodeContents(content);
        range.collapse(false);
      }
      content.focus();
      const selection = document.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      return range;
    }
    function selected() {
      const range = restore();
      if (!range) return null;
      const model = textModel(content);
      const start = model.offset(range.startContainer, range.startOffset);
      const end = model.offset(range.endContainer, range.endOffset);
      return start == null || end == null ? null : { model, start, end };
    }
    function select(start, end, insertion = false) {
      const model = textModel(content);
      const includeBR = insertion && model.afterNestedBR(start);
      const a = model.point(includeBR ? start - 1 : start), b = model.point(end);
      const range = document.createRange();
      range.setStart(a.node, a.offset);
      range.setEnd(b.node, b.offset);
      const selection = document.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      savedRange = range.cloneRange();
      return includeBR;
    }
    function edit(callback) {
      editDepth++;
      try {
        return callback();
      } finally {
        if (!--editDepth && pendingRender) {
          pendingRender = false;
          render();
        }
      }
    }
    function updateStatus(model = textModel(content), value = model.text) {
      if (destroyed) return;
      const selection = document.getSelection();
      let offset = selection.focusNode && content.contains(selection.focusNode) ? model.offset(selection.focusNode, selection.focusOffset) : null;
      if (offset == null && owns(savedRange)) offset = model.offset(savedRange.endContainer, savedRange.endOffset);
      const before = value.slice(0, offset == null ? 0 : offset);
      const line = before.split("\n").length;
      const column = before.length - before.lastIndexOf("\n");
      const words = value.match(/\S+/g)?.length || 0;
      const text = `lines: ${value.split("\n").length}   words: ${words}   ${line}:${column}`;
      if (statusText.data !== text) statusText.data = text;
    }
    function render(force = false) {
      if (destroyed || composing) return;
      if (editDepth && !force) {
        pendingRender = true;
        return;
      }
      pendingRender = false;
      const version = ++renderVersion;
      remember();
      const model = owns(savedRange) ? textModel(content) : null;
      const value = model ? model.text : getMarkdown();
      const syntax = markdownTokens(value);
      if (highlightSource && !highlightSource(value, syntax, () => !destroyed && version === renderVersion)) return;
      if (previewing) renderPreview(value);
      updateStatus(model || textModel(content), value);
      paintSource.paint(content, paint, syntax);
      updateButtons(model, syntax);
      if (destroyed || version !== renderVersion) return;
      if (force || value !== lastNotified) {
        lastNotified = value;
        if (onChange) onChange(value);
      }
    }
    function replace(start, end, text, anchor = start + text.length, focus = anchor) {
      if (destroyed || composing) return false;
      closeTableUI();
      emptyFormat = null;
      resetKeyboardHint();
      return edit(() => {
        content.focus();
        const includeBR = select(start, end, true);
        const result = document.execCommand("insertText", false, (includeBR ? "\n" : "") + text);
        if (!destroyed) {
          select(anchor, focus);
          render();
        }
        return result;
      });
    }
    function insertText(value) {
      const current = selected();
      return current ? replace(current.start, current.end, normalize(value)) : false;
    }
    const isEmptyFormat = (name, text, start, end) => emptyFormat?.name === name && start === end && start === emptyFormat.start + (formatDelimiters[name] || "`").length && text.slice(emptyFormat.start, emptyFormat.end) === (formatDelimiters[name] || "`").repeat(2);
    function surround(name) {
      const current = selected();
      if (!current) return false;
      const { model, start, end } = current, text = model.text;
      const delimiter = formatDelimiters[name], n = delimiter.length;
      if (isEmptyFormat(name, text, start, end)) return replace(emptyFormat.start, emptyFormat.end, "", emptyFormat.start);
      const syntax = markdownTokens(text), selection = inlineSelection(text, start, end, syntax);
      if (!selection) return false;
      const pair = enclosingFormat(text, selection, name);
      if (pair) {
        const mapped = (position) => position <= pair.open ? position : position < pair.content ? pair.open : position <= pair.close ? position - (pair.content - pair.open) : position < pair.end ? pair.close - (pair.content - pair.open) : position - (pair.end - pair.close) - (pair.content - pair.open);
        return replace(pair.open, pair.end, text.slice(pair.content, pair.close), mapped(start), mapped(end));
      }
      if (text.slice(start, end).includes("\n")) return false;
      const a = selection.start, b = selection.end;
      const value = delimiter + text.slice(a, b) + delimiter;
      if (a !== b) {
        const candidate = text.slice(0, a) + value + text.slice(b);
        const plan = markdownTokens(candidate);
        const added = enclosingFormat(candidate, inlineSelection(candidate, a, b + n * 2, plan), name);
        if (!added || candidate.slice(0, added.open) + candidate.slice(added.content, added.close) + candidate.slice(added.end) !== text) {
          errorText.data = "These markers cannot format this selection without changing surrounding Markdown.";
          error.hidden = false;
          return false;
        }
      }
      const result = replace(a, b, value, a + n, b + n);
      if (result && !destroyed && a === b) emptyFormat = { name, start: a, end: a + n * 2 };
      return result;
    }
    function headings(name) {
      const current = selected();
      if (!current) return false;
      const { model, start, end } = current, text = model.text;
      const syntax = markdownTokens(text), raw = text.split("\n");
      const affected = headingLines(text, start, end, syntax), changes = [];
      const change = (start2, end2, value) => {
        if (text.slice(start2, end2) !== value) changes.push({ start: start2, end: end2, value });
      };
      for (const index of affected) {
        const part = syntax[index], base = part.sourceStart;
        if (part.protected) continue;
        if (part.setext?.underline === part) {
          if (index + 1 < raw.length) change(base, base + raw[index].length + 1, "");
          else change(base - 1, base + raw[index].length, "");
          continue;
        }
        const level = part.level || 0;
        const target = name === "paragraph" ? 0 : /^heading[1-6]$/.test(name) ? Number(name.slice(7)) : name === "heading-bigger" ? (level + 6) % 7 : (level + 1) % 7;
        if (part.atx) {
          const marker = part.atx;
          if (target && target !== level) change(base + marker.start, base + marker.end, "#".repeat(target) + (marker.content === marker.end ? " " : ""));
          else if (!target) {
            change(base + marker.start, base + marker.content, "");
            if (marker.close != null) change(base + marker.close, base + marker.closeEnd, "");
          }
        } else if (target) {
          if (part.continuation) change(base + part.bodyStart, base + part.bodyStart, part.continuation);
          change(base + part.insertAt, base + part.insertAt, "#".repeat(target) + " ");
        }
      }
      if (!changes.length) return false;
      const endpoint = (position) => {
        const index = text.slice(0, position).split("\n").length - 1, part = syntax[index];
        if (part.setext?.underline === part) {
          const previous = part.setext.parts[part.setext.parts.length - 1];
          return previous.sourceStart + raw[previous.index].length;
        }
        return position;
      };
      const plan = sourceEditPlan(text, changes, endpoint(start), endpoint(end));
      return replace(plan.start, plan.end, plan.value, plan.anchor, plan.focus);
    }
    function lines(name) {
      const current = selected();
      if (!current) return false;
      const { model, start, end } = current, text = model.text, syntax = markdownTokens(text);
      const units = writingSelection(name, text, start, end, syntax);
      const changes = writingChanges(name, text, units, syntax);
      if (!changes.length) return false;
      const plan = sourceEditPlan(text, changes, start, end);
      if (!writingActive(name, units) && name !== "task-toggle") {
        const candidate = markdownTokens(text.slice(0, plan.start) + plan.value + text.slice(plan.end));
        const valid = units.every((unit) => {
          const part = candidate[unit.first], item = part.structure?.item;
          return name === "quote" ? !!part.structure?.quoted : name === "checklist" ? !!item?.task?.taskMarker : item && (/^\d/.test(item.marker) ? "olist" : "ulist") === name;
        });
        if (!valid) {
          errorText.data = "These markers cannot format this selection without changing surrounding Markdown.";
          error.hidden = false;
          return false;
        }
      }
      return replace(plan.start, plan.end, plan.value, plan.anchor, plan.focus);
    }
    function taskAtPoint(event) {
      const caret = document.caretPositionFromPoint?.(event.clientX, event.clientY);
      const fallback = !caret && document.caretRangeFromPoint?.(event.clientX, event.clientY);
      const node = caret?.offsetNode || fallback?.startContainer;
      if (!node || !content.contains(node)) return null;
      const model = textModel(content), offset = model.offset(node, caret ? caret.offset : fallback.startOffset);
      if (offset == null) return null;
      if (!/\[[ \txX]\]/.test(model.text.slice(Math.max(0, offset - 3), offset + 3))) return null;
      const syntax = markdownTokens(model.text), part = syntax[model.text.slice(0, offset).split("\n").length - 1];
      const marker = part.taskMarker;
      if (!marker || part.protected) return null;
      const start = part.sourceStart + marker.start, end = part.sourceStart + marker.end;
      const a = model.point(start), b = model.point(end), range = document.createRange();
      range.setStart(a.node, a.offset);
      range.setEnd(b.node, b.offset);
      if (!Array.from(range.getClientRects()).some((rect) => event.clientX >= rect.left && event.clientX < rect.right && event.clientY >= rect.top && event.clientY < rect.bottom)) return null;
      return { model, syntax, start, end };
    }
    let taskPointer = null;
    const plainTaskClick = (event) => !event.defaultPrevented && event.button === 0 && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey && !destroyed && !composing && !(previewing && !sideBySide);
    function beginTaskClick(event) {
      taskPointer = null;
      if (!plainTaskClick(event) || event.detail > 1) return;
      const hit = taskAtPoint(event);
      if (!hit) return;
      const selection = document.getSelection();
      const owned = selection.rangeCount && owns(selection.getRangeAt(0));
      taskPointer = {
        text: hit.model.text,
        start: hit.start,
        end: hit.end,
        anchor: owned ? hit.model.offset(selection.anchorNode, selection.anchorOffset) : hit.end,
        focus: owned ? hit.model.offset(selection.focusNode, selection.focusOffset) : hit.end,
        x: event.clientX,
        y: event.clientY,
        version: renderVersion,
        view: previewVersion
      };
    }
    function finishTaskClick(event) {
      const snapshot = taskPointer;
      taskPointer = null;
      if (!snapshot || !plainTaskClick(event) || event.detail !== 1 || snapshot.version !== renderVersion || snapshot.view !== previewVersion || Math.hypot(event.clientX - snapshot.x, event.clientY - snapshot.y) > 4) return;
      const hit = taskAtPoint(event);
      if (!hit || hit.model.text !== snapshot.text || hit.start !== snapshot.start || hit.end !== snapshot.end) return;
      const selection = document.getSelection();
      if (!selection.isCollapsed && (hit.model.offset(selection.anchorNode, selection.anchorOffset) !== snapshot.anchor || hit.model.offset(selection.focusNode, selection.focusOffset) !== snapshot.focus)) return;
      const units = writingSelection("task-toggle", hit.model.text, hit.start, hit.end, hit.syntax);
      const changes = writingChanges("task-toggle", hit.model.text, units, hit.syntax);
      if (changes.length !== 1) return;
      const [change] = changes;
      event.preventDefault();
      const anchor = snapshot.anchor ?? hit.end, focus = snapshot.focus ?? hit.end;
      edit(() => {
        replace(change.start, change.end, change.value, Math.min(anchor, focus), Math.max(anchor, focus));
        if (!destroyed && anchor > focus) {
          const model = textModel(content), a = model.point(anchor), b = model.point(focus);
          document.getSelection().setBaseAndExtent(a.node, a.offset, b.node, b.offset);
          remember();
        }
      });
    }
    function indent(unindent) {
      resetKeyboardHint();
      const current = selected();
      if (!current) return false;
      const { model, start, end } = current, text = model.text;
      const result = indentationPlan(text, start, end, markdownTokens(text), unindent);
      if (result.reason) {
        helpText.data = result.reason + " " + keyboardHelp;
        return false;
      }
      const plan = result.plan;
      return plan ? replace(plan.start, plan.end, plan.value, plan.anchor, plan.focus) : false;
    }
    function enter(plain = false) {
      if (destroyed || composing) return false;
      const current = selected();
      if (!current) return false;
      const { model, start, end } = current, text = model.text;
      const first = text.slice(0, start).split("\n").length - 1;
      if (text.slice(start, end).includes("\n")) return false;
      const syntax = markdownTokens(text), part = syntax[first];
      if (part.protected || !inlineSelection(text, start, end, syntax, false, true)) return false;
      if (plain) return replace(start, end, "\n");
      const node = part.structure;
      if (!node) return false;
      const raw = text.split("\n"), line = raw[first], at = part.sourceStart;
      const item = node.item, task = item?.task;
      const marker = task === part ? task.taskMarker : null;
      const body = line.slice(marker ? marker.end : part.bodyStart);
      const empty = start === end && /^[\t ]*$/.test(body) && (node.quote || node.first === first && raw.slice(first + 1, node.last + 1).every((line2) => /^[\t ]*$/.test(line2)));
      if (empty) {
        const prefix2 = part.prefixes.find((prefix3) => prefix3.node === node);
        if (!prefix2) return false;
        const edit2 = columnChange(part, prefix2.markerStart ?? node.markerStart, part.column, "");
        return replace(edit2.start, at + line.length, edit2.value, edit2.start + edit2.value.length);
      }
      let prefix = continuationPrefix(node.parent);
      if (node.quote) prefix += "> ";
      else {
        let marker2 = node.marker;
        if (/^\d/.test(marker2)) {
          if (node.number >= 999999999) return false;
          marker2 = String(node.number + 1).padStart(marker2.length - 1, "0") + marker2.slice(-1);
        }
        const open = syntax[node.first], original = raw[node.first];
        const separator2 = original.slice(columnOffset(open, node.markerStart + node.marker.length), columnOffset(open, node.end)) || " ";
        prefix += " ".repeat(node.markerStart - node.start) + marker2 + separator2 + (task?.taskMarker ? "[ ] " : "");
      }
      return replace(start, end, "\n" + prefix);
    }
    function inlineCode() {
      const current = selected();
      if (!current) return false;
      const { model, start, end } = current, text = model.text;
      if (isEmptyFormat("code", text, start, end)) return replace(emptyFormat.start, emptyFormat.end, "", emptyFormat.start);
      const syntax = markdownTokens(text), selection = inlineSelection(text, start, end, syntax, true);
      if (!selection) return false;
      const pair = enclosingFormat(text, selection, "code");
      if (pair) {
        const body = text.slice(pair.content, pair.close);
        let pad2 = 0;
        if (body.startsWith(" ") && body.endsWith(" ")) {
          const first = text.slice(0, pair.content).split("\n").length - 1;
          if (body.split("\n").some((line, index) => /[^ ]/.test(index ? line.slice(syntax[first + index].bodyStart) : line))) pad2 = 1;
        }
        const from = pair.content + pad2, to = pair.close - pad2;
        const mapped = (position) => pair.open + Math.max(0, Math.min(to - from, position - from));
        return replace(pair.open, pair.end, text.slice(from, to), mapped(start), mapped(end));
      }
      const value = text.slice(start, end);
      if (value.includes("\n")) return false;
      const size = Array.from(value.matchAll(/`+/g)).reduce((size2, match) => Math.max(size2, match[0].length + 1), 1);
      const delimiter = "`".repeat(size);
      const pad = /^`|`$/.test(value) || value.startsWith(" ") && value.endsWith(" ") && /[^ ]/.test(value) ? " " : "";
      const output = delimiter + pad + value + pad + delimiter;
      if (value) {
        const candidate = text.slice(0, start) + output + text.slice(end), plan = markdownTokens(candidate);
        const added = enclosingFormat(candidate, inlineSelection(candidate, start, start + output.length, plan, true), "code");
        if (!added || added.open !== start || added.end !== start + output.length) {
          errorText.data = "These backticks cannot format this selection without changing surrounding Markdown.";
          error.hidden = false;
          return false;
        }
      }
      const result = replace(start, end, output, start + size + pad.length, start + size + pad.length + value.length);
      if (result && !destroyed && start === end) emptyFormat = { name: "code", start, end: start + output.length };
      return result;
    }
    function codeBlock() {
      const current = selected();
      if (!current) return false;
      const { model, start, end } = current, text = model.text, raw = text.split("\n");
      const syntax = markdownTokens(text), selection = codeBlockSelection(text, start, end, syntax);
      if (!selection) return false;
      const changes = [];
      let anchor = start, focus = end;
      if (selection.block) {
        const { parts, close } = selection.block, open = parts[0];
        const body = parts.slice(1, close ? -1 : void 0);
        if (!body.length) {
          const last = close || open;
          changes.push({
            start: open.sourceStart,
            end: last.sourceStart + raw[last.index].length,
            value: raw[open.index].slice(0, open.bodyStart)
          });
        } else {
          changes.push({ start: open.sourceStart, end: body[0].sourceStart, value: "" });
          if (open.listMarkers.length) changes.push({
            start: body[0].sourceStart,
            end: body[0].sourceStart + body[0].bodyStart,
            value: raw[open.index].slice(0, open.bodyStart)
          });
          if (close) changes.push({ start: close.sourceStart - 1, end: close.sourceStart + raw[close.index].length, value: "" });
          const endpoint = (position) => position < body[0].sourceStart ? body[0].sourceStart + body[0].bodyStart : close && position >= close.sourceStart ? body[body.length - 1].sourceStart + raw[body[body.length - 1].index].length : position;
          anchor = endpoint(start);
          focus = endpoint(end);
        }
      } else {
        const parts = selection.parts, first = parts[0], last = parts[parts.length - 1];
        const prefix = raw[first.index].slice(0, first.bodyStart);
        let continuation = "", cursor = 0;
        for (const marker of first.listMarkers) {
          continuation += prefix.slice(cursor, marker.start) + " ".repeat(marker.width);
          cursor = marker.end;
        }
        continuation += prefix.slice(cursor) + (first.continuation || "");
        const size = Array.from(parts.map((part) => raw[part.index]).join("\n").matchAll(/`+/g)).reduce((size2, match) => Math.max(size2, match[0].length + 1), 3);
        const fence = "`".repeat(size);
        changes.push({
          start: first.sourceStart,
          end: first.sourceStart + first.bodyStart,
          value: prefix + (first.continuation || "") + fence + "\n" + continuation
        });
        for (const part of parts.slice(1)) {
          if (part.continuation) changes.push({
            start: part.sourceStart + part.bodyStart,
            end: part.sourceStart + part.bodyStart,
            value: part.continuation
          });
        }
        const b = last.sourceStart + raw[last.index].length;
        changes.push({ start: b, end: b, value: "\n" + continuation + fence, before: true });
        focus = Math.min(end, b);
      }
      const plan = sourceEditPlan(text, changes, anchor, focus);
      if (!selection.block) {
        const candidate = text.slice(0, plan.start) + plan.value + text.slice(plan.end);
        const added = markdownTokens(candidate)[selection.parts[0].index].fence;
        if (!added?.close || added.parts.length !== selection.parts.length + 2) return false;
      }
      return replace(plan.start, plan.end, plan.value, plan.anchor, plan.focus);
    }
    function insertTemplate(image = false) {
      const current = selected();
      if (!current) return false;
      const { model, start, end } = current, syntax = markdownTokens(model.text);
      const destination = image && imageDestination(model.text, start, end, syntax);
      if (destination) {
        select(destination.destinationStart, destination.destinationEnd);
        return true;
      }
      const selection = templateSelection(model.text, start, end, syntax, image);
      if (!selection) return false;
      const { part } = selection, raw = model.text.split("\n")[part.index];
      const separator2 = start === part.sourceStart + part.atx?.end && part.atx.end === part.atx.content || start === part.sourceStart + part.taskMarker?.end || start === part.sourceStart + raw.length && part.listMarkers.some((marker) => marker.end === raw.length) && !/[\t ]$/.test(raw) ? " " : "";
      const selectedText = model.text.slice(start, end);
      const label = image ? "image" : selectedText || "link";
      const escaped = label.replace(/[\\\[\]]/g, "\\$&");
      let url = image ? start === end ? "https://www.example.com/image.png" : selectedText.trim() : "https://www.example.com";
      if (image) {
        let valid = false;
        try {
          valid = !!url && !/[\x00-\x1f\x7f]/.test(url) && ["http:", "https:"].includes(new URL(url, "https://example.invalid/").protocol);
        } catch {
        }
        if (!valid) {
          errorText.data = "An image URL must use HTTP(S) or a relative path.";
          error.hidden = false;
          return false;
        }
        url = url.replace(/[\\<>&]/g, "\\$&");
      }
      const angled = image && /[ ()]/.test(url);
      const text = separator2 + `${image ? "!" : ""}[${escaped}](${angled ? "<" : ""}${url}${angled ? ">" : ""})`;
      const anchor = start + separator2.length + (image ? 1 : 0) + escaped.length + 3 + (angled ? 1 : 0);
      const candidate = markdownTokens(model.text.slice(0, start) + text + model.text.slice(end));
      const recognized = candidate[part.index].regions?.some((region) => region.linkRanges.some((range) => range.start === start + separator2.length && range.end === start + text.length && !!range.image === image));
      const sameOwner = (oldNode, newNode) => {
        for (; oldNode && newNode; oldNode = oldNode.parent, newNode = newNode.parent) {
          if (oldNode.first !== newNode.first || oldNode.quote !== newNode.quote || oldNode.marker !== newNode.marker) return false;
        }
        return !oldNode && !newNode;
      };
      if (!recognized || syntax.some((before, index) => {
        const after = candidate[index];
        return !sameOwner(before.structure, after.structure) || index !== part.index && (!!before.html !== !!after.html || !!before.fence !== !!after.fence || !!before.indentedCode !== !!after.indentedCode || before.taskMarker?.checked !== after.taskMarker?.checked);
      })) {
        errorText.data = `${image ? "An image" : "A link"} cannot be inserted here without changing surrounding Markdown.`;
        error.hidden = false;
        return false;
      }
      return replace(start, end, text, anchor, anchor + url.length);
    }
    function horizontalLine() {
      const current = selected();
      if (!current) return false;
      const { model, start, end } = current, syntax = markdownTokens(model.text);
      const selection = ruleSelection(model.text, start, end, syntax);
      if (!selection) return false;
      const plan = rulePlan(model.text, start, end, syntax, selection);
      if (!plan) {
        errorText.data = "A rule cannot be inserted here without changing surrounding Markdown.";
        error.hidden = false;
        return false;
      }
      return replace(start, end, plan.value, plan.caret);
    }
    function closeTableMenu(focus = false) {
      if (!tableMenu || tableMenu.hidden) return;
      if (tableMenu.hasAttribute("popover") && tableMenu.matches(":popover-open")) tableMenu.hidePopover();
      tableMenu.hidden = true;
      for (const { button, action } of buttons) if (action.name === "table" && !action.result) button.setAttribute("aria-expanded", "false");
      if (focus && !destroyed) buttons.find(({ action }) => action.name === "table" && !action.result)?.button.focus();
    }
    function closeTableUI() {
      closeTableMenu();
      closeTablePicker();
    }
    function positionTablePopup(popup, trigger) {
      if (!popup || popup.hidden) return;
      const view = document.defaultView;
      popup.style.maxWidth = Math.max(0, view.innerWidth - 16) + "px";
      popup.style.maxHeight = Math.max(0, view.innerHeight - 16) + "px";
      const anchor = (trigger || toolbar).getBoundingClientRect(), rect = popup.getBoundingClientRect();
      popup.style.left = Math.max(8, Math.min(anchor.left, view.innerWidth - rect.width - 8)) + "px";
      const below = anchor.bottom + 4;
      popup.style.top = (below + rect.height <= view.innerHeight - 8 ? below : Math.max(8, Math.min(anchor.top - rect.height - 4, view.innerHeight - rect.height - 8))) + "px";
    }
    function positionTableMenu() {
      positionTablePopup(tableMenu, buttons.find(({ action }) => action.name === "table" && !action.result)?.button);
    }
    function createTableMenu() {
      tableMenu = document.createElement("div");
      tableMenu.className = "lightmetal-table-dropdown lightmetal-table-menu lightmarkdown-table-menu";
      do {
        tableMenu.id = "lightmarkdown-table-menu-" + ++tableMenuId;
      } while (document.getElementById(tableMenu.id));
      tableMenu.setAttribute("role", "menu");
      tableMenu.setAttribute("aria-label", "Table");
      tableMenu.tabIndex = -1;
      tableMenu.hidden = true;
      if (typeof tableMenu.showPopover === "function") tableMenu.setAttribute("popover", "manual");
      for (const name of tableMenuActions) {
        if (name === "|") {
          const divider = document.createElement("div");
          divider.setAttribute("role", "separator");
          tableMenu.append(divider);
          continue;
        }
        const button = document.createElement("button"), action = { name };
        button.type = "button";
        button.tabIndex = -1;
        button.textContent = titles[name];
        if (name === "table-insert") {
          button.setAttribute("aria-haspopup", "dialog");
          button.setAttribute("aria-expanded", "false");
        }
        button.setAttribute("role", Object.prototype.hasOwnProperty.call(tableAlignments, name) ? "menuitemradio" : "menuitem");
        listen(button, "mousedown", (event) => event.preventDefault());
        listen(button, "click", () => invoke(action));
        tableMenu.append(button);
        tableMenuButtons.push({ button, action });
      }
      element.append(tableMenu);
      for (const { button, action } of buttons) if (action.name === "table" && !action.result) button.setAttribute("aria-controls", tableMenu.id);
      listen(tableMenu, "keydown", (event) => {
        if (event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return;
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          closeTableMenu(true);
        } else if (event.key === "Tab") closeTableMenu(true);
        else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
          event.preventDefault();
          const enabled = tableMenuButtons.map((entry) => entry.button).filter((button) => !button.disabled), index = enabled.indexOf(document.activeElement);
          const next = event.key === "Home" ? 0 : event.key === "End" ? enabled.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + enabled.length) % enabled.length;
          enabled[next]?.focus();
        }
      });
      listen(document, "pointerdown", (event) => {
        if (!tableMenu.hidden && !tableMenu.contains(event.target) && !buttons.some(({ button, action }) => action.name === "table" && button.contains(event.target))) closeTableMenu();
      });
      listen(document, "focusin", (event) => {
        if (!tableMenu.hidden && !tableMenu.contains(event.target) && !toolbar.contains(event.target)) closeTableMenu();
      });
      listen(document.defaultView, "resize", positionTableMenu);
      document.addEventListener("scroll", positionTableMenu, true);
      cleanups.push(() => document.removeEventListener("scroll", positionTableMenu, true));
    }
    function toggleTableMenu(last = false) {
      return edit(() => {
        if (tableMenu && !tableMenu.hidden) {
          closeTableMenu(true);
          return false;
        }
        closeTablePicker();
        if (!selected() || destroyed || composing) return false;
        if (!tableMenu) createTableMenu();
        updateButtons();
        if (destroyed) return false;
        tableMenu.hidden = false;
        if (tableMenu.hasAttribute("popover")) tableMenu.showPopover();
        positionTableMenu();
        for (const { button, action } of buttons) if (action.name === "table" && !action.result) button.setAttribute("aria-expanded", "true");
        const enabled = tableMenuButtons.filter((entry) => !entry.button.disabled);
        (enabled[last ? enabled.length - 1 : 0]?.button || tableMenu).focus();
        return true;
      });
    }
    function closeTablePicker(focus = false) {
      tableSnapshot = null;
      tableObserver?.disconnect();
      tableObserver = null;
      if (tablePicker && !tablePicker.hidden) {
        if (tablePicker.hasAttribute("popover") && tablePicker.matches(":popover-open")) tablePicker.hidePopover();
        tablePicker.hidden = true;
      }
      for (const { button, action } of [...buttons, ...tableMenuButtons]) if (action.name === "table-insert" && !action.result) button.setAttribute("aria-expanded", "false");
      if (focus && !destroyed) {
        const trigger = buttons.find(({ action }) => ["table", "table-insert"].includes(action.name) && !action.result)?.button;
        if (trigger) trigger.focus();
        else restore();
      }
    }
    function tablePositionLost() {
      if (!tableSnapshot) return;
      tableSnapshot.stale = true;
      tableMessage.textContent = "The insertion position is no longer available. Close the picker and place the caret again.";
      positionTablePicker();
    }
    function confirmTable(rows, columns) {
      if (destroyed || composing || !tableSnapshot || tablePicker.hidden) return false;
      if (!Number.isInteger(rows) || !Number.isInteger(columns) || rows < 1 || columns < 1 || rows > 1e3 || columns > 100 || rows * columns > 1e4) {
        tableMessage.textContent = "Use 1\u20131,000 rows and 1\u2013100 columns, up to 10,000 cells.";
        positionTablePicker();
        return false;
      }
      const snapshot = tableSnapshot, model = textModel(content), range = snapshot.range;
      if (tableObserver.takeRecords().length || snapshot.stale || model.text !== snapshot.text || !owns(range) || range.startContainer !== snapshot.node || range.startOffset !== snapshot.offset || !range.collapsed || model.offset(range.startContainer, range.startOffset) !== snapshot.start) {
        tablePositionLost();
        return false;
      }
      const syntax = markdownTokens(model.text), part = tableSelection(model.text, snapshot.start, snapshot.start, syntax);
      const plan = part && tablePlan(model.text, snapshot.start, syntax, part, rows, columns);
      if (!plan) {
        tableMessage.textContent = "A table cannot be inserted here without changing surrounding Markdown.";
        positionTablePicker();
        return false;
      }
      return edit(() => {
        closeTablePicker();
        return replace(snapshot.start, snapshot.start, plan.value, plan.anchor, plan.focus);
      });
    }
    function positionTablePicker() {
      const trigger = buttons.find(({ action }) => ["table-insert", "table"].includes(action.name) && !action.result)?.button;
      positionTablePopup(tablePicker, trigger);
    }
    function createTablePicker() {
      tablePicker = document.createElement("div");
      tablePicker.className = "lightmetal-table-dropdown lightmarkdown-table-picker";
      do {
        tablePicker.id = "lightmarkdown-table-picker-" + ++tablePickerId;
      } while (document.getElementById(tablePicker.id));
      tablePicker.setAttribute("role", "dialog");
      tablePicker.setAttribute("aria-label", "Insert table");
      if (typeof tablePicker.showPopover === "function") tablePicker.setAttribute("popover", "manual");
      tablePicker.hidden = true;
      const dimensions = document.createElement("div");
      dimensions.className = "lightmetal-table-dimensions";
      dimensions.setAttribute("aria-live", "polite");
      const grid = document.createElement("div");
      grid.className = "lightmetal-table-grid";
      grid.style.gridTemplateColumns = "repeat(10, 1fr)";
      grid.setAttribute("role", "group");
      grid.setAttribute("aria-label", "Select table size");
      const cells = [];
      const highlight = (rows, columns) => {
        dimensions.textContent = columns + " \xD7 " + rows;
        for (const cell of cells) {
          cell.classList.toggle("lightmetal-grid-selected", Number(cell.dataset.row) <= rows && Number(cell.dataset.column) <= columns);
          cell.tabIndex = Number(cell.dataset.row) === rows && Number(cell.dataset.column) === columns ? 0 : -1;
        }
      };
      for (let row = 1; row <= 8; row++) for (let column = 1; column <= 10; column++) {
        const cell = document.createElement("button");
        cell.type = "button";
        cell.dataset.row = row;
        cell.dataset.column = column;
        cell.setAttribute("aria-label", column + " columns, " + row + " rows");
        listen(cell, "pointerenter", () => highlight(row, column));
        listen(cell, "focus", () => highlight(row, column));
        listen(cell, "click", () => confirmTable(row, column));
        listen(cell, "keydown", (event) => {
          const move = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] }[event.key];
          if (!move) return;
          event.preventDefault();
          cells[(Math.max(1, Math.min(8, row + move[0])) - 1) * 10 + Math.max(1, Math.min(10, column + move[1])) - 1].focus();
        });
        cells.push(cell);
        grid.append(cell);
      }
      const form = document.createElement("form");
      form.className = "lightmetal-table-form";
      form.noValidate = true;
      const input = (title, max) => {
        const label = document.createElement("label"), field = document.createElement("input");
        label.textContent = title;
        field.type = "number";
        field.min = "1";
        field.max = String(max);
        field.step = "1";
        label.append(field);
        form.append(label);
        return field;
      };
      tableColumns = input("Columns", 100);
      tableRows = input("Rows", 1e3);
      const submit = document.createElement("button");
      submit.type = "submit";
      submit.textContent = "Insert";
      form.append(submit);
      listen(form, "submit", (event) => {
        event.preventDefault();
        confirmTable(tableRows.valueAsNumber, tableColumns.valueAsNumber);
      });
      const note = document.createElement("div");
      note.id = tablePicker.id + "-rows";
      note.textContent = "Rows include the header.";
      tableRows.setAttribute("aria-describedby", note.id);
      tablePicker.setAttribute("aria-describedby", note.id);
      tableMessage = document.createElement("div");
      tableMessage.className = "lightmetal-table-message";
      tableMessage.setAttribute("role", "status");
      tablePicker.append(dimensions, grid, form, note, tableMessage);
      toolbar.parentElement.append(tablePicker);
      for (const { button, action } of [...buttons, ...tableMenuButtons]) if (action.name === "table-insert" && !action.result) {
        button.setAttribute("aria-haspopup", "dialog");
        button.setAttribute("aria-controls", tablePicker.id);
      }
      const outside = (event) => {
        if (!tableSnapshot || tablePicker.contains(event.target) || tableMenu?.contains(event.target) || buttons.some(({ button, action }) => ["table", "table-insert"].includes(action.name) && !action.result && button.contains(event.target))) return;
        closeTablePicker();
      };
      listen(document, "pointerdown", outside);
      listen(document, "click", outside);
      listen(document, "keydown", (event) => {
        if (tableSnapshot && event.key === "Escape" && !event.isComposing && !event.ctrlKey && !event.metaKey && !event.altKey) {
          event.preventDefault();
          closeTablePicker(true);
        }
      });
      listen(document.defaultView, "resize", positionTablePicker);
      document.addEventListener("scroll", positionTablePicker, true);
      cleanups.push(() => document.removeEventListener("scroll", positionTablePicker, true));
      return { cells, highlight };
    }
    let tableGrid;
    function insertTable() {
      if (tableSnapshot) {
        closeTablePicker(true);
        return false;
      }
      const current = selected();
      if (!current || destroyed || composing) return false;
      const { model, start, end } = current, syntax = markdownTokens(model.text);
      if (!tableSelection(model.text, start, end, syntax)) return false;
      if (!tablePicker) tableGrid = createTablePicker();
      tableSnapshot = { text: model.text, start, range: savedRange.cloneRange(), node: savedRange.startContainer, offset: savedRange.startOffset, stale: false };
      tableObserver = new MutationObserver(tablePositionLost);
      tableObserver.observe(content, { childList: true, subtree: true, characterData: true });
      tableColumns.value = tableRows.value = "3";
      tableMessage.textContent = "";
      tableGrid.highlight(3, 3);
      tablePicker.hidden = false;
      if (tablePicker.hasAttribute("popover")) tablePicker.showPopover();
      positionTablePicker();
      for (const { button, action } of [...buttons, ...tableMenuButtons]) if (action.name === "table-insert" && !action.result) button.setAttribute("aria-expanded", "true");
      tableGrid.cells[22].focus();
      return true;
    }
    function editTableRow(remove) {
      const current = selected();
      if (!current) return false;
      const { model, start, end } = current, syntax = markdownTokens(model.text);
      const part = tableRowSelection(model.text, start, end, syntax);
      if (!part || remove && (part === part.tableBlock.header || part.tableDelimiter)) return false;
      const plan = tableRowPlan(model.text, syntax, part, remove);
      if (!plan) {
        errorText.data = "This row cannot be changed without changing surrounding Markdown.";
        error.hidden = false;
        return false;
      }
      return replace(plan.start, plan.end, plan.value, plan.caret);
    }
    function editTableColumn(remove) {
      const current = selected();
      if (!current) return false;
      const { model, start, end } = current, syntax = markdownTokens(model.text);
      const selection = tableColumnSelection(model.text, start, end, syntax);
      if (!selection || remove && selection.part.table === 1) return false;
      const plan = tableColumnPlan(model.text, syntax, selection, remove);
      if (!plan) {
        errorText.data = "This column cannot be changed without changing surrounding Markdown.";
        error.hidden = false;
        return false;
      }
      return replace(plan.start, plan.end, plan.value, plan.anchor, plan.focus);
    }
    function formatTable() {
      const current = selected();
      if (!current) return false;
      const { model, start, end } = current, syntax = markdownTokens(model.text);
      const block = tableFormatSelection(model.text, start, end, syntax);
      if (!block) return false;
      const plan = tableFormatPlan(model.text, start, end, syntax, block);
      if (!plan) {
        errorText.data = "This table cannot be formatted without changing surrounding Markdown.";
        error.hidden = false;
        return false;
      }
      return !plan.unchanged && replace(plan.start, plan.end, plan.value, plan.anchor, plan.focus);
    }
    function alignTableColumn(mode) {
      const current = selected();
      if (!current) return false;
      const { model, start, end } = current, syntax = markdownTokens(model.text);
      const selection = tableColumnSelection(model.text, start, end, syntax);
      if (!selection) return false;
      const plan = tableAlignmentPlan(model.text, start, end, syntax, selection, mode);
      if (!plan) {
        errorText.data = "This column cannot be aligned without changing surrounding Markdown.";
        error.hidden = false;
        return false;
      }
      return !plan.unchanged && replace(plan.start, plan.end, plan.value, plan.anchor, plan.focus);
    }
    function builtin(name) {
      if (Object.prototype.hasOwnProperty.call(formatDelimiters, name)) return surround(name);
      if (name === "code") return inlineCode();
      if (name === "codeblock") return codeBlock();
      if (headingAction(name)) return headings(name);
      if (writingActions.includes(name)) return lines(name);
      if (name === "link" || name === "image") return insertTemplate(name === "image");
      if (name === "line") return horizontalLine();
      if (name === "table-insert") return insertTable();
      if (name === "table-format") return formatTable();
      if (name === "table-row-after" || name === "table-row-delete") return editTableRow(name === "table-row-delete");
      if (name === "table-column-after" || name === "table-column-delete") return editTableColumn(name === "table-column-delete");
      if (Object.prototype.hasOwnProperty.call(tableAlignments, name)) return alignTableColumn(tableAlignments[name]);
      if (name === "undo" || name === "redo") {
        if (!restore() || !historyEnabled(name)) return false;
        return document.execCommand(name);
      }
      return false;
    }
    function exitFullscreen(focus = true) {
      if (!fullscreen) return false;
      const state = fullscreen;
      fullscreen = null;
      resetKeyboardHint();
      if (state.hostClass) element.classList.remove("lightmarkdown-fullscreen");
      if (state.pageClass) document.documentElement.classList.remove("lightmarkdown-page-fullscreen");
      if (fullscreenOwners.get(document) === exitFullscreen) fullscreenOwners.delete(document);
      if (!destroyed && focus) {
        if (previewing && !sideBySide) preview.focus();
        else restore();
      }
      scroll.scrollTop = state.sourceTop;
      scroll.scrollLeft = state.sourceLeft;
      preview.scrollTop = state.previewTop;
      preview.scrollLeft = state.previewLeft;
      document.defaultView.scrollTo(state.x, state.y);
      if (!destroyed) updateButtons();
      return true;
    }
    function toggleFullscreen() {
      if (fullscreen) return exitFullscreen();
      closeTableUI();
      remember();
      resetKeyboardHint();
      fullscreenOwners.get(document)?.(false);
      if (destroyed) return false;
      fullscreen = {
        hostClass: !element.classList.contains("lightmarkdown-fullscreen"),
        pageClass: !document.documentElement.classList.contains("lightmarkdown-page-fullscreen"),
        sourceTop: scroll.scrollTop,
        sourceLeft: scroll.scrollLeft,
        previewTop: preview.scrollTop,
        previewLeft: preview.scrollLeft,
        x: document.defaultView.scrollX,
        y: document.defaultView.scrollY
      };
      fullscreenOwners.set(document, exitFullscreen);
      element.classList.add("lightmarkdown-fullscreen");
      document.documentElement.classList.add("lightmarkdown-page-fullscreen");
      updateButtons();
      if (!destroyed) {
        if (previewing && !sideBySide) preview.focus();
        else restore();
      }
      return true;
    }
    function syncSplitScroll(from, to) {
      if (destroyed || !sideBySide) return;
      const expected = syncedScroll.get(from);
      syncedScroll.delete(from);
      if (expected != null && Math.abs(from.scrollTop - expected) < 1) return;
      const range = from.scrollHeight - from.clientHeight;
      if (range <= 0) return;
      const target = Math.max(0, to.scrollHeight - to.clientHeight) * Math.max(0, Math.min(1, from.scrollTop / range));
      if (Math.abs(to.scrollTop - target) < 1) return;
      to.scrollTop = target;
      syncedScroll.set(to, to.scrollTop);
    }
    function renderPreview(value) {
      const version = ++previewVersion;
      preview.setAttribute("aria-busy", "true");
      const fail = () => {
        if (destroyed || !previewing || version !== previewVersion) return;
        const message = document.createDocumentFragment();
        message.append(document.createTextNode("Preview could not be rendered. Return to source to continue editing."));
        paintPreview(preview, message);
        preview.removeAttribute("aria-busy");
      };
      let result;
      try {
        result = previewRender(value);
      } catch {
        fail();
        return;
      }
      Promise.resolve(result).then((html) => {
        if (destroyed || !previewing || version !== previewVersion) return;
        if (typeof html !== "string") {
          fail();
          return;
        }
        paintPreview(preview, previewHTML(document, html));
        preview.removeAttribute("aria-busy");
        syncedScroll.delete(scroll);
        syncSplitScroll(scroll, preview);
      }).catch(fail);
    }
    function togglePreview(split = false) {
      closeTableUI();
      remember();
      resetKeyboardHint();
      syncedScroll.delete(scroll);
      syncedScroll.delete(preview);
      const close = previewing && sideBySide === split;
      if (!previewing || sideBySide) sourceScroll = scroll.scrollTop;
      previewing = !close;
      sideBySide = previewing && split;
      previewVersion++;
      element.classList.toggle("lightmarkdown-split", sideBySide);
      preview.hidden = !previewing;
      scroll.hidden = previewing && !sideBySide;
      if (previewing) renderPreview(getMarkdown());
      if (destroyed) return false;
      if (!previewing || sideBySide) {
        restore();
        scroll.scrollTop = sourceScroll;
      } else preview.focus();
      updateButtons();
      return true;
    }
    function openGuide() {
      closeTableUI();
      remember();
      resetKeyboardHint();
      if (!guide) {
        guide = document.createElement("dialog");
        guide.className = "lightmarkdown-guide";
        guide.setAttribute("aria-label", "Markdown quick start");
        const heading = document.createElement("h2");
        heading.textContent = "Markdown quick start";
        heading.tabIndex = -1;
        heading.autofocus = true;
        const intro = document.createElement("p");
        intro.textContent = "Write plain text. Add these markers, or use the toolbar. Your Markdown stays visible.";
        const sections = document.createDocumentFragment();
        const section = (title, explanation, example) => {
          const heading2 = document.createElement("h3");
          heading2.textContent = title;
          const paragraph = document.createElement("p");
          paragraph.textContent = explanation;
          sections.append(heading2, paragraph);
          if (example) {
            const pre = document.createElement("pre");
            pre.textContent = example;
            sections.append(pre);
          }
        };
        section("TLDR", "Write paragraphs with a blank line between them. Select text and use the toolbar, or type Markdown markers yourself. Preview, when configured, shows the rendered result.", "# A heading\n\nA paragraph with **bold** and *italic* text.");
        section("Emphasis", "Wrap text in matching markers.", "**bold**\n*italic*\n~~strikethrough~~");
        section("Headings", "Start a line with one to six hash marks and a space. More marks mean a smaller heading level.", "# Heading 1\n## Heading 2\n### Heading 3\n#### Heading 4\n##### Heading 5\n###### Heading 6");
        section("Lists and tasks", "Use bullets or numbers for lists. Task markers add an unchecked or checked item. Click a source task marker to check or uncheck it; the preview stays read-only. Enter continues a list; Enter on an empty item leaves one level.", "- First item\n- Second item\n\n1. First step\n2. Next step\n\n- [ ] To do\n- [x] Done");
        section("Links", "Put the label in brackets and the destination in parentheses.", "[Visit the example](https://example.com)");
        section("Quotes", "Start each quoted line with > and a space.", "> A quoted thought.\n> Continued on another line.");
        section("Images", "The text in brackets describes the image. Use a URL or a relative path; this editor does not upload files or fetch images while you edit source.", "![A fox beside a tree](images/fox.png)");
        section("Tables", "Separate cells with pipes and put a dash row below the header. Spaces do not need to line up. Colons in the dash row set left, center, or right alignment.", "| Name | Notes |\n| --- | --- |\n| Fox | In the woods |\n| Owl | Near the barn |\n\n| Left | Center | Right |\n| :--- | :---: | ---: |\n| A | B | C |");
        section("Code", "Use backticks for inline code. For a code block, put triple backticks on their own lines. An optional language name selects code colors when source highlighting or a preview highlighter is configured.", '`inline code`\n\n```javascript\nconst greeting = "Hello";\n```');
        section("Paragraphs and rules", "Leave a blank line between paragraphs. Put --- on a separate line with blank lines around it for a horizontal rule, not a heading underline.", "First paragraph.\n\nSecond paragraph.\n\n---\n\nAfter the rule.");
        section("Literal markers", "Put a backslash before punctuation when you want the marker itself, not formatting.", "\\*literal asterisks\\*");
        const editing = document.createElement("p");
        editing.textContent = "Link inserts a template with its URL selected. Image inserts a template, uses selected text as its URL, or selects an existing inline image\u2019s URL. Table opens insertion, formatting, row, column, and alignment controls. Format Table lines up source columns with spaces. Edit image descriptions and table text directly in the source.";
        const keys = document.createElement("p");
        keys.textContent = "Default shortcuts: Ctrl/Cmd+B bold \xB7 Ctrl/Cmd+I italic \xB7 Ctrl/Cmd+K link \xB7 Ctrl/Cmd+backtick inline code. Tab indents; Shift+Tab unindents. Press Esc, then Tab (or Shift+Tab), to move focus out of the source. Your application may customize shortcuts.";
        const note = document.createElement("p");
        note.textContent = "This editor follows CommonMark with selected GFM extensions, including tables, tasks, and strike-through. The specification link opens an external site.";
        const link = document.createElement("a");
        link.textContent = "Read the CommonMark specification";
        link.href = "https://spec.commonmark.org/";
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        const close = document.createElement("button");
        close.type = "button";
        close.textContent = "Close";
        guide.append(heading, intro, sections, editing, keys, note, link, close);
        toolbar.parentElement.append(guide);
        listen(close, "click", () => guide.close());
        listen(guide, "close", () => {
          if (!destroyed) {
            if (previewing && !sideBySide) preview.focus();
            else restore();
            updateButtons();
          }
        });
      }
      if (!guide.open) {
        guide.showModal();
        guide.querySelector("h2").focus();
        guide.scrollTop = 0;
      }
      return true;
    }
    function invoke(action) {
      if (destroyed || composing) return false;
      if (action.name === "fullscreen" && !action.result) return toggleFullscreen();
      if (action.name === "preview" && !action.result) return togglePreview();
      if (action.name === "side-by-side" && !action.result) return togglePreview(true);
      if (action.name === "guide" && !action.result) return openGuide();
      if (previewing && !sideBySide && !action.result) return false;
      if (action.name === "table" && !action.result) return toggleTableMenu();
      const run = () => {
        closeTableMenu();
        if (action.name !== "table-insert" || action.result) closeTablePicker();
        error.hidden = true;
        if (!tableSnapshot) restore();
        const result = action.result ? action.result(api) : builtin(action.name);
        if (!destroyed) {
          render();
          if (!destroyed && !tableSnapshot) content.focus();
        }
        return result;
      };
      return action.result ? run() : edit(run);
    }
    function historyEnabled(name) {
      try {
        return document.queryCommandEnabled(name);
      } catch {
        return false;
      }
    }
    function updateHistory() {
      if (destroyed) return;
      for (const { button, action } of buttons) {
        if (action.result || !["undo", "redo"].includes(action.name)) continue;
        const disabled = composing || previewing && !sideBySide || !historyEnabled(action.name);
        if (button.disabled !== disabled) button.disabled = disabled;
      }
    }
    function updateButtons(model = owns(savedRange) ? textModel(content) : null, syntax = model ? markdownTokens(model.text) : null) {
      const version = renderVersion;
      const start = model ? model.offset(savedRange.startContainer, savedRange.startOffset) : null;
      const end = model ? model.offset(savedRange.endContainer, savedRange.endOffset) : null;
      const states = { preview: previewing && !sideBySide, "side-by-side": sideBySide, fullscreen: !!fullscreen }, formatDisabled = {};
      const inline = start != null && end != null ? inlineSelection(model.text, start, end, syntax) : null;
      for (const name of Object.keys(formatDelimiters)) {
        const pair = model && enclosingFormat(model.text, inline, name);
        states[name] = !!pair;
        formatDisabled[name] = !!model && !isEmptyFormat(name, model.text, start, end) && (!inline || !pair && model.text.slice(start, end).includes("\n"));
      }
      const code = start != null && end != null ? inlineSelection(model.text, start, end, syntax, true) : null;
      const codePair = model && enclosingFormat(model.text, code, "code");
      states.code = !!codePair;
      formatDisabled.code = !!model && !isEmptyFormat("code", model.text, start, end) && (!code || !codePair && model.text.slice(start, end).includes("\n"));
      const block = start != null && end != null ? codeBlockSelection(model.text, start, end, syntax) : null;
      states.codeblock = !!block?.block;
      formatDisabled.codeblock = !!model && !block;
      const rule = start != null && end != null ? ruleSelection(model.text, start, end, syntax) : null;
      formatDisabled.line = !!model && !rule;
      const link = start != null && end != null ? templateSelection(model.text, start, end, syntax) : null;
      formatDisabled.link = !!model && !link;
      const image = start != null && end != null ? imageDestination(model.text, start, end, syntax) || templateSelection(model.text, start, end, syntax, true) : null;
      formatDisabled.image = !!model && !image;
      const table = start != null && end != null ? tableSelection(model.text, start, end, syntax) : null;
      formatDisabled["table-insert"] = !!model && !table;
      formatDisabled["table-format"] = !!model && !tableFormatSelection(model.text, start, end, syntax);
      const row = start != null && end != null ? tableRowSelection(model.text, start, end, syntax) : null;
      formatDisabled["table-row-after"] = !!model && !row;
      formatDisabled["table-row-delete"] = !!model && (!row || row === row.tableBlock.header || row.tableDelimiter);
      const cell = start != null && end != null ? tableColumnSelection(model.text, start, end, syntax) : null;
      formatDisabled["table-column-after"] = !!model && !cell;
      formatDisabled["table-column-delete"] = !!model && (!cell || cell.part.table === 1);
      const alignment = cell ? tableAlignment(model.text, cell).mode : null;
      for (const [name, mode] of Object.entries(tableAlignments)) {
        states[name] = alignment === mode;
        formatDisabled[name] = !!model && !cell;
      }
      const listUnits = start != null && end != null ? writingSelection("ulist", model.text, start, end, syntax) : [];
      for (const name of writingActions) {
        const units = name === "ulist" || name === "olist" ? listUnits : start != null && end != null ? writingSelection(name, model.text, start, end, syntax) : [];
        states[name] = writingActive(name, units);
        formatDisabled[name] = !!model && !units.length;
      }
      const affected = start != null && end != null ? headingLines(model.text, start, end, syntax).filter((index) => !syntax[index].protected) : [];
      if (start != null && end != null) {
        for (let level = 0; level <= 6; level++) {
          states[level ? "heading" + level : "paragraph"] = affected.length > 0 && affected.every((index) => (syntax[index].setext?.level || syntax[index].level || 0) === level);
        }
      }
      for (const { button, action } of [...buttons, ...tableMenuButtons]) {
        if (destroyed || version !== renderVersion) return;
        const active = !composing && (action.state ? !!action.state(api) : !!states[action.name]);
        if (destroyed || version !== renderVersion) return;
        button.classList.toggle(classes.selected, active);
        if (button.getAttribute("role") === "menuitemradio") button.setAttribute("aria-checked", String(active));
        else if (!button.hasAttribute("role") && (action.state || !["guide", "link", "image", "table", "table-insert", "table-format", "table-row-after", "table-row-delete", "table-column-after", "table-column-delete", "line", "undo", "redo", "heading", "heading-smaller", "heading-bigger"].includes(action.name))) button.setAttribute("aria-pressed", String(active));
        if (action.result || !["undo", "redo"].includes(action.name)) {
          button.disabled = composing || !action.result && previewing && !sideBySide && !["preview", "side-by-side", "guide", "fullscreen"].includes(action.name) || !action.result && (formatDisabled[action.name] || headingAction(action.name) && model && !affected.length);
        }
      }
      updateHistory();
    }
    function setMarkdown(value) {
      if (destroyed || composing) return false;
      const fragment = document.createDocumentFragment();
      for (const text of normalize(value).split("\n")) {
        const line = document.createElement("div");
        if (text) line.textContent = text;
        else line.append(document.createElement("br"));
        fragment.append(line);
      }
      edit(() => closeTableUI());
      savedRange = null;
      emptyFormat = null;
      resetKeyboardHint();
      content.replaceChildren(fragment);
      scroll.scrollTop = 0;
      render(true);
      return true;
    }
    const api = {
      element,
      content,
      getMarkdown,
      setMarkdown,
      insertText,
      destroy() {
        if (destroyed) return;
        finalText = getMarkdown();
        destroyed = true;
        exitFullscreen(false);
        previewVersion++;
        closeTableUI();
        tableMenu?.remove();
        tablePicker?.remove();
        guide?.remove();
        savedRange = null;
        emptyFormat = null;
        tabEscape = false;
        mounted.delete(element);
        for (const cleanup of cleanups) cleanup();
        toolbar.remove();
        scroll.remove();
        preview.remove();
        footer.remove();
        element.classList.remove(...ownedClasses, "lightmarkdown-composing", "lightmarkdown-split");
      }
    };
    for (const action of actions) {
      if (action === separator) {
        const divider = document.createElement("span");
        divider.className = "lightmarkdown-separator";
        divider.setAttribute("role", "separator");
        divider.setAttribute("aria-orientation", "vertical");
        toolbar.append(divider);
        continue;
      }
      const button = document.createElement("button");
      button.type = "button";
      button.className = classes.button;
      button.tabIndex = -1;
      const title = action.title || action.name || "Custom action";
      const shortcut = shortcuts.find((binding) => binding.action === action);
      button.title = title + (shortcut ? " (" + shortcut.label + ")" : "");
      button.setAttribute("aria-label", title);
      if (["table", "table-insert"].includes(action.name) && !action.result) {
        button.setAttribute("aria-haspopup", action.name === "table" ? "menu" : "dialog");
        button.setAttribute("aria-expanded", "false");
      }
      if (action.name === "table" && !action.result) listen(button, "keydown", (event) => {
        if (["ArrowDown", "ArrowUp"].includes(event.key) && !event.altKey && !event.ctrlKey && !event.metaKey && !composing) {
          event.preventDefault();
          toggleTableMenu(event.key === "ArrowUp");
        }
      });
      if (shortcut) button.setAttribute("aria-keyshortcuts", shortcut.aria);
      if (action.icon != null) button.innerHTML = String(action.icon);
      else button.textContent = title;
      listen(button, "mousedown", (event) => event.preventDefault());
      listen(button, "click", () => invoke(action));
      toolbar.append(button);
      buttons.push({ button, action });
    }
    toolbar.append(error);
    if (settings.actions == null) cleanups.push(groupToolbar(toolbar, buttons.map(({ button, action }) => ({ button, name: action.name }))));
    const setToolbarTabIndex = (tabIndex) => {
      for (const { button } of buttons) if (button.tabIndex !== tabIndex) button.tabIndex = tabIndex;
    };
    listen(element, "focusin", () => setToolbarTabIndex(0));
    listen(element, "focusout", (event) => {
      if (!element.contains(event.relatedTarget)) setToolbarTabIndex(-1);
    });
    const fullscreenEscape = (event) => {
      if (event.key !== "Escape" || event.defaultPrevented || event.isComposing || composing || !fullscreen) return;
      if (guide?.open || tableSnapshot || tableMenu && !tableMenu.hidden) return;
      event.preventDefault();
      event.stopPropagation();
      exitFullscreen();
    };
    listen(document, "keydown", fullscreenEscape);
    listen(toolbar, "keydown", fullscreenEscape);
    listen(document, "selectionchange", () => {
      const selection = document.getSelection(), active = document.activeElement;
      if (!destroyed && (content.contains(active) || toolbar.contains(active)) && selection.rangeCount && owns(selection.getRangeAt(0))) {
        remember();
        updateStatus();
        updateButtons();
      } else updateHistory();
    });
    listen(scroll, "scroll", () => syncSplitScroll(scroll, preview));
    listen(preview, "scroll", () => syncSplitScroll(preview, scroll));
    listen(document, "input", updateHistory);
    listen(document, "focusin", updateHistory);
    listen(content, "focus", () => {
      closeTableUI();
      remember();
      if (!editDepth) updateButtons();
    });
    listen(toolbar, "focusin", () => {
      resetKeyboardHint();
      updateButtons();
    });
    listen(content, "blur", resetKeyboardHint);
    for (const node of [element, toolbar]) {
      listen(node, "pointerdown", resetKeyboardHint);
      listen(node, "mousedown", resetKeyboardHint);
    }
    listen(content, "pointerdown", beginTaskClick);
    listen(content, "pointermove", (event) => {
      if (taskPointer && Math.hypot(event.clientX - taskPointer.x, event.clientY - taskPointer.y) > 4) taskPointer = null;
    });
    for (const type of ["pointerleave", "pointercancel", "contextmenu"]) listen(content, type, () => {
      taskPointer = null;
    });
    listen(content, "click", finishTaskClick);
    listen(content, "input", () => {
      emptyFormat = null;
      resetKeyboardHint();
      render();
    });
    listen(content, "compositionstart", () => {
      closeTableUI();
      emptyFormat = null;
      resetKeyboardHint();
      composing = true;
      element.classList.add("lightmarkdown-composing");
      updateButtons();
    });
    listen(content, "compositionend", () => {
      composing = false;
      element.classList.remove("lightmarkdown-composing");
      render();
    });
    listen(content, "beforeinput", (event) => {
      if (event.inputType?.startsWith("format")) event.preventDefault();
      if (event.inputType === "insertParagraph" && event.cancelable && !event.defaultPrevented && !event.isComposing && !composing && !editDepth && enter()) event.preventDefault();
    });
    listen(content, "keydown", (event) => {
      if (event.isComposing || composing || event.keyCode === 229 || event.defaultPrevented || event.getModifierState("AltGraph")) return;
      const active = document.activeElement;
      if (active !== content && !content.contains(active)) return;
      if (event.key === "Escape" && !event.ctrlKey && !event.metaKey && !event.altKey) {
        fullscreenEscape(event);
        if (event.defaultPrevented) return;
        event.preventDefault();
        tabEscape = true;
        helpText.data = "Next Tab moves focus. " + keyboardHelp;
        return;
      }
      if (event.key === "Tab" && !event.ctrlKey && !event.metaKey && !event.altKey) {
        if (tabEscape) {
          resetKeyboardHint();
          return;
        }
        event.preventDefault();
        indent(event.shiftKey);
        return;
      }
      if (!["Shift", "Control", "Meta", "Alt"].includes(event.key)) resetKeyboardHint();
      const binding = shortcuts.find((binding2) => binding2.variants.some((chord) => matchesShortcut(chord, event)));
      if (binding) {
        event.preventDefault();
        invoke(binding.action);
        return;
      }
      if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && /^[biu]$/i.test(event.key)) event.preventDefault();
      if (event.key === "Enter" && !event.ctrlKey && !event.metaKey && !event.altKey) {
        if (enter(event.shiftKey)) event.preventDefault();
        else if (event.shiftKey) {
          event.preventDefault();
          document.execCommand("insertParagraph");
        }
      }
    });
    listen(content, "paste", (event) => {
      event.preventDefault();
      const text = event.clipboardData?.getData("text/plain");
      if (!composing && text) insertText(text);
    });
    listen(content, "dragover", (event) => event.preventDefault());
    listen(content, "drop", (event) => event.preventDefault());
    mounted.add(element);
    render();
    return api;
  }
  var maiden_default = { init };
  return __toCommonJS(maiden_exports);
})();
