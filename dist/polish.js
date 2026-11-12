var polish = (() => {
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

  // src/polish-full.js
  var polish_full_exports = {};
  __export(polish_full_exports, {
    abap: () => abap_default,
    ada: () => ada_default,
    allLanguages: () => allLanguages,
    allThemes: () => allThemes,
    apache: () => apache_default,
    bash: () => bash_default,
    batch: () => batch_default,
    c: () => c_default,
    cobol: () => cobol_default,
    composeLanguage: () => composeLanguage,
    cpp: () => cpp_default,
    createHighlighter: () => createHighlighter2,
    createLanguageLoader: () => createLanguageLoader,
    csharp: () => csharp_default,
    css: () => css_default,
    dart: () => dart_default,
    delphi: () => delphi_default,
    dockerfile: () => dockerfile_default,
    dotenv: () => dotenv_default,
    go: () => go_default,
    groovy: () => groovy_default,
    haskell: () => haskell_default,
    html: () => html_default,
    ini: () => ini_default,
    java: () => java_default,
    javascript: () => javascript_default,
    json: () => json_default,
    julia: () => julia_default,
    kotlin: () => kotlin_default,
    lua: () => lua_default,
    markdown: () => markdown_default,
    matlab: () => matlab_default,
    nginx: () => nginx_default,
    objectiveC: () => objective_c_default,
    pascal: () => pascal_default,
    perl: () => perl_default,
    php: () => php_default,
    powershell: () => powershell_default,
    python: () => python_default,
    r: () => r_default,
    renderHTML: () => renderHTML,
    ruby: () => ruby_default,
    rust: () => rust_default,
    scala: () => scala_default,
    sql: () => sql_default,
    sshConfig: () => ssh_config_default,
    swift: () => swift_default,
    systemd: () => systemd_default,
    themeToCSS: () => themeToCSS,
    toml: () => toml_default,
    typescript: () => typescript_default,
    validateTokens: () => validateTokens,
    vba: () => vba_default,
    visualBasic: () => visual_basic_default,
    xml: () => xml_default,
    yaml: () => yaml_default,
    zig: () => zig_default
  });

  // src/polish/captures.js
  function flattenCaptures(match, captures, defaultKind, bound) {
    const start = match.index;
    const end = Math.min(start + match[0].length, bound);
    const spans = [];
    for (const [key, kind] of Object.entries(captures)) {
      const index = Number(key);
      if (!match.indices || index >= match.indices.length) throw new Error(`Capture group does not exist: ${key}`);
      const offsets = match.indices[index];
      if (!offsets) continue;
      if (offsets[0] < start || offsets[1] > start + match[0].length) throw new Error(`Capture outside consumed match: ${key}`);
      if (offsets[0] === offsets[1]) continue;
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
      if (stack.length && span.end > stack.at(-1).end) throw new Error("Crossing capture spans are not supported");
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

  // src/polish/render-text.js
  var escapeHTML = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  function tokenText(source, start, end) {
    if (source.codePointAt(start - 1) > 65535) start--;
    if (source.codePointAt(end - 1) > 65535) end--;
    return source.slice(start, end);
  }

  // src/polish/index.js
  var kinds = /* @__PURE__ */ new Set(["plain", "comment", "keyword", "string", "number", "boolean", "constant", "function", "type", "variable", "property", "operator", "punctuation", "tag", "attribute"]);
  var normalize = (name) => name.trim().toLowerCase();
  function createHighlighter(limits = {}) {
    const maxDepth = limits.maxDepth ?? 64;
    const maxSteps = limits.maxSteps ?? 1e5;
    for (const value of [maxDepth, maxSteps]) if (!Number.isSafeInteger(value) || value < 1) throw new Error("Limits must be positive safe integers");
    const languages = /* @__PURE__ */ new Map();
    return {
      /** @param {string} name */
      hasLanguage(name) {
        return typeof name === "string" && languages.has(normalize(name));
      },
      /** @param {Language} language */
      register(language) {
        const names = [language.id, ...language.aliases ?? []].map(normalize);
        if (!/^[a-z0-9_-]+$/.test(names[0]) || names.slice(1).some((name) => !/^(?=.*[a-z0-9])[a-z0-9_+#-]+$/.test(name)) || new Set(names).size !== names.length)
          throw new Error("Invalid or duplicate language names");
        for (const name of names) if (languages.has(name)) throw new Error(`Language name already registered: ${name}`);
        const active = /* @__PURE__ */ new Set();
        const compiledRules = /* @__PURE__ */ new WeakMap();
        const repository = language.repository ?? {};
        for (const [name, rules2] of Object.entries(repository)) {
          if (!/^[a-zA-Z_][\w-]*$/.test(name) || !Array.isArray(rules2)) throw new Error(`Invalid repository entry: ${name}`);
        }
        const expandIncludes = (input, trail = []) => {
          if (!Array.isArray(input)) throw new Error("Rules must be an array");
          if (trail.length > maxDepth) throw new Error("Excessively deep include chain");
          const ids = /* @__PURE__ */ new Set();
          return input.flatMap((rule) => {
            if (!rule.id || ids.has(rule.id)) throw new Error(`Invalid or duplicate rule ID: ${rule.id}`);
            ids.add(rule.id);
            if (!("include" in rule)) return [rule];
            if (Object.keys(rule).some((key) => key !== "id" && key !== "include")) throw new Error(`Include cannot define matching behavior: ${rule.id}`);
            const name = rule.include;
            if (typeof name !== "string" || !Object.hasOwn(repository, name)) throw new Error(`Unknown local include: ${String(name)}`);
            if (trail.includes(name)) throw new Error(`Non-productive include cycle: ${[...trail, name].join(" -> ")}`);
            return expandIncludes(repository[name], [...trail, name]);
          });
        };
        const compileCaptures = (captures) => {
          if (captures === void 0) return void 0;
          const copy = {};
          for (const [key, kind] of Object.entries(captures)) {
            if (!/^(?:0|[1-9]\d*)$/.test(key) || !Number.isSafeInteger(Number(key))) throw new Error(`Invalid capture index: ${key}`);
            if (!kinds.has(kind)) throw new Error(`Invalid capture kind: ${kind}`);
            copy[key] = kind;
          }
          return copy;
        };
        const compileRegex = (pattern, id, captures) => {
          if (!(pattern instanceof RegExp)) throw new Error(`Expected a RegExp: ${id}`);
          if (pattern.sticky) throw new Error(`Sticky patterns are not supported: ${id}`);
          const flags = pattern.flags.replace(/g/g, "") + "g";
          return new RegExp(pattern.source, captures && !flags.includes("d") ? flags + "d" : flags);
        };
        const compileRules = (input, depth = 0) => {
          if (depth > maxDepth || active.has(input)) throw new Error("Cyclic or excessively deep rule definitions; use $self for recursion");
          active.add(input);
          const ids = /* @__PURE__ */ new Set();
          const compiled2 = expandIncludes(input).map((rule) => {
            if (!rule.id || ids.has(rule.id)) throw new Error(`Invalid or duplicate rule ID: ${rule.id}`);
            ids.add(rule.id);
            if (compiledRules.has(rule)) return compiledRules.get(rule);
            if (!kinds.has(rule.kind)) throw new Error(`Invalid token kind: ${rule.kind}`);
            if ("scan" in rule) {
              if (typeof rule.scan !== "function" || ["pattern", "begin", "end", "rules", "embed", "captures", "beginCaptures", "endCaptures"].some((key) => key in rule)) throw new Error(`Invalid scanner rule: ${rule.id}`);
              const scanner = { id: rule.id, kind: rule.kind, scan: rule.scan };
              compiledRules.set(rule, scanner);
              return scanner;
            }
            if ("begin" in rule) {
              if ("pattern" in rule) throw new Error(`Rule cannot have both pattern and begin: ${rule.id}`);
              if (rule.embed !== void 0 && (!/^[a-z0-9_-]+$/.test(rule.embed) || rule.rules !== void 0)) throw new Error(`Embedding must name a language and cannot have child rules: ${rule.id}`);
              if (rule.contentKind !== void 0 && !kinds.has(rule.contentKind)) throw new Error(`Invalid content kind: ${rule.contentKind}`);
              const beginCaptures = compileCaptures(rule.beginCaptures);
              const endCaptures = compileCaptures(rule.endCaptures);
              const region = { ...rule, beginCaptures, endCaptures, begin: compileRegex(rule.begin, rule.id, beginCaptures), end: compileRegex(rule.end, rule.id, endCaptures), rules: [] };
              compiledRules.set(rule, region);
              region.rules = rule.rules === "$self" ? "$self" : compileRules(rule.rules ?? [], depth + 1);
              return region;
            }
            const captures = compileCaptures(rule.captures);
            const match = { ...rule, captures, pattern: compileRegex(rule.pattern, rule.id, captures) };
            compiledRules.set(rule, match);
            return match;
          });
          active.delete(input);
          return compiled2;
        };
        const rules = compileRules(language.rules);
        const compiled = { id: names[0], rules };
        for (const name of names) languages.set(name, compiled);
      },
      /**
       * @param {string} source
       * @param {{language: string, strict?: boolean}} options
       * @returns {TokenResult}
       */
      tokenize(source, options) {
        const requested = normalize(options.language);
        const grammar = languages.get(requested);
        const language = grammar?.id ?? requested;
        const tokens = [];
        const diagnostics = [];
        const emit = (start, end, kind, tokenLanguage = language) => {
          if (end <= start) return;
          const previous = tokens.at(-1);
          if (previous?.kind === kind && previous.end === start && previous.language === tokenLanguage) previous.end = end;
          else tokens.push({ start, end, kind, language: tokenLanguage });
        };
        const fail = (diagnostic) => {
          if (options.strict) throw new Error(`${diagnostic.code}: ${diagnostic.message}`);
          diagnostics.push(diagnostic);
        };
        if (!grammar) {
          if (requested !== "plain" && requested !== "text") fail({ code: "unknown-language", severity: "warning", message: `Unknown language: ${requested}`, language });
          emit(0, source.length, "plain");
          return { tokens, diagnostics };
        }
        let steps = 0;
        let aborted = false;
        const abort = (code, message, offset, rule, diagnosticLanguage = language) => {
          fail({ code, severity: "error", message, language: diagnosticLanguage, offset, rule });
          emit(offset, source.length, "plain");
          aborted = true;
          return source.length;
        };
        const matches = /* @__PURE__ */ new Map();
        const next = (pattern, cursor) => {
          if (matches.has(pattern)) {
            const cached = matches.get(pattern);
            if (cached === null || cached.index >= cursor) return cached;
          }
          pattern.lastIndex = cursor;
          let match = pattern.exec(source);
          if (match && match.index < cursor) {
            pattern.lastIndex = cursor + 1;
            match = pattern.exec(source);
          }
          matches.set(pattern, match);
          return match;
        };
        const emitMatch = (match, kind, captures, context, bound, rule) => {
          if (!captures) {
            emit(match.index, Math.min(bound, match.index + match[0].length), kind, context.id);
            return;
          }
          let spans;
          try {
            spans = flattenCaptures(match, captures, kind, bound);
          } catch (error) {
            fail({ code: "invalid-captures", severity: "error", message: error.message, language: context.id, rule, offset: match.index });
            emit(match.index, Math.min(bound, match.index + match[0].length), kind, context.id);
            return;
          }
          for (const span of spans) emit(span.start, span.end, span.kind, context.id);
        };
        const scan = (cursor, rules, defaultKind, closing, depth, context = grammar, bound = source.length) => {
          const output = (start, end, kind) => emit(start, end, kind, context.id);
          while (cursor < bound && !aborted) {
            if (++steps > maxSteps) return abort("step-limit", "Tokenization step limit exceeded", cursor, void 0, context.id);
            const end = closing ? next(closing.end, cursor) : null;
            let winner;
            for (const rule2 of rules) {
              let match2;
              if ("scan" in rule2) {
                try {
                  const candidate = rule2.scan(Object.freeze({ source, start: cursor, end: bound, language: context.id }));
                  if (candidate === null) continue;
                  if (candidate && typeof candidate.then === "function") {
                    Promise.resolve(candidate).catch(() => {
                    });
                    throw new Error("Scanners must be synchronous");
                  }
                  if (!candidate || !Number.isSafeInteger(candidate.start) || !Number.isSafeInteger(candidate.end) || candidate.start < cursor || candidate.end <= candidate.start || candidate.end > bound) throw new Error("Scanner must return a consuming range inside the current search bounds, or null");
                  match2 = { index: candidate.start, 0: source.slice(candidate.start, candidate.end) };
                } catch (error) {
                  return abort("invalid-scanner", `Scanner ${rule2.id} failed: ${error instanceof Error ? error.message : String(error)}`, cursor, rule2.id, context.id);
                }
              } else match2 = next("begin" in rule2 ? rule2.begin : rule2.pattern, cursor);
              if (match2 && match2.index < bound && (!winner || match2.index < winner.match.index)) winner = { rule: rule2, match: match2 };
            }
            if (end && end.index <= bound && end.index + end[0].length <= bound && (!winner || end.index <= winner.match.index)) {
              output(cursor, end.index, defaultKind);
              emitMatch(end, closing.kind, closing.endCaptures, context, bound, closing.id);
              return end.index + end[0].length;
            }
            if (!winner) {
              output(cursor, bound, defaultKind);
              return bound;
            }
            const { rule, match } = winner;
            output(cursor, match.index, defaultKind);
            if (!match[0].length) return abort("zero-length-match", "Ordinary rules and region begins must consume source", match.index, rule.id, context.id);
            if ("begin" in rule && depth >= maxDepth) return abort("depth-limit", "Region nesting limit exceeded", match.index, rule.id, context.id);
            emitMatch(match, rule.kind, "begin" in rule ? rule.beginCaptures : rule.captures, context, bound, rule.id);
            cursor = Math.min(bound, match.index + match[0].length);
            if ("begin" in rule && cursor < bound) {
              if (rule.embed) {
                const close = next(rule.end, cursor);
                const contentEnd = close && close.index < bound ? close.index : bound;
                const embedded = languages.get(rule.embed);
                if (embedded) scan(cursor, embedded.rules, "plain", null, depth + 1, embedded, contentEnd);
                else {
                  fail({ code: "missing-embedding", severity: "warning", message: `Embedded language unavailable: ${rule.embed}`, language: context.id, rule: rule.id, offset: cursor });
                  output(cursor, contentEnd, "plain");
                }
                if (aborted) return source.length;
                cursor = contentEnd;
                if (close && close.index + close[0].length <= bound) {
                  emitMatch(close, rule.kind, rule.endCaptures, context, bound, rule.id);
                  cursor += close[0].length;
                }
              } else cursor = scan(cursor, rule.rules === "$self" ? context.rules : rule.rules, rule.contentKind ?? rule.kind, rule, depth + 1, context, bound);
            }
          }
          return cursor;
        };
        scan(0, grammar.rules, "plain", null, 0);
        return { tokens, diagnostics };
      }
    };
  }
  function validateTokens(source, tokens) {
    let cursor = 0;
    for (const token of tokens) {
      if (!Number.isInteger(token.start) || !Number.isInteger(token.end) || token.start !== cursor || token.end <= token.start || token.end > source.length || !kinds.has(token.kind))
        throw new Error("Invalid token partition");
      cursor = token.end;
    }
    if (cursor !== source.length) throw new Error("Incomplete token partition");
  }
  function renderHTML(source, tokens) {
    validateTokens(source, tokens);
    return tokens.map((token) => {
      const text = escapeHTML(tokenText(source, token.start, token.end));
      if (!text) return "";
      return token.kind === "plain" ? text : `<span class="token ${token.kind}">${text}</span>`;
    }).join("");
  }

  // src/polish/languages/ansi-sgr.js
  var ansi_sgr_default = {
    id: "ansi-sgr",
    rules: [{ id: "sgr", pattern: /(?:\x1b\[|\x9b)[0-9;]*m/, kind: "keyword" }]
  };

  // src/polish/terminal-text.js
  function escapeTerminalText(text) {
    return text.replace(/\r\n|[\x00-\x08\x0b-\x1f\x7f-\x9f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, (character) => {
      if (character === "\r\n") return "\n";
      const code = character.charCodeAt(0);
      return code <= 255 ? `\\x${code.toString(16).padStart(2, "0")}` : `\\u${code.toString(16).padStart(4, "0")}`;
    });
  }

  // src/polish/ansi-to-html.js
  var highlighter = createHighlighter();
  highlighter.register(ansi_sgr_default);
  var basic = ["0, 0, 0", "187, 0, 0", "0, 187, 0", "187, 187, 0", "0, 0, 187", "187, 0, 187", "0, 187, 187", "187, 187, 187", "85, 85, 85", "255, 85, 85", "85, 255, 85", "255, 255, 85", "85, 85, 255", "255, 85, 255", "85, 255, 255", "255, 255, 255"];
  var channel = (value) => Number.isInteger(value) && value >= 0 && value <= 255;
  function palette(index) {
    if (!channel(index)) return null;
    if (index < 16) return basic[index];
    if (index >= 232) return Array(3).fill(8 + (index - 232) * 10).join(", ");
    const n = index - 16;
    const levels = [0, 95, 135, 175, 215, 255];
    return [levels[Math.floor(n / 36)], levels[Math.floor(n / 6) % 6], levels[n % 6]].join(", ");
  }
  function ansiToHTML(source, options = {}) {
    const engine = options.maxSteps === void 0 ? highlighter : createHighlighter({ maxSteps: options.maxSteps });
    if (engine !== highlighter) engine.register(ansi_sgr_default);
    const { tokens } = engine.tokenize(source, { language: "ansi-sgr", strict: options.strict ?? false });
    const fresh = () => ({ fg: null, bg: null, bold: false, dim: false, italic: false, underline: false, strike: false, reverse: false });
    let state = fresh();
    const apply = (body) => {
      const codes = body.split(";").map(Number);
      for (let i = 0; i < codes.length; i++) {
        const code = codes[i];
        if (code === 0) state = fresh();
        else if (code === 1) state.bold = true;
        else if (code === 2) state.dim = true;
        else if (code === 3) state.italic = true;
        else if (code === 4) state.underline = true;
        else if (code === 7) state.reverse = true;
        else if (code === 9) state.strike = true;
        else if (code === 21) state.bold = false;
        else if (code === 22) state.bold = state.dim = false;
        else if (code === 23) state.italic = false;
        else if (code === 24) state.underline = false;
        else if (code === 27) state.reverse = false;
        else if (code === 29) state.strike = false;
        else if (code === 39) state.fg = null;
        else if (code === 49) state.bg = null;
        else if (code >= 30 && code <= 37) state.fg = basic[code - 30];
        else if (code >= 40 && code <= 47) state.bg = basic[code - 40];
        else if (code >= 90 && code <= 97) state.fg = basic[code - 90 + 8];
        else if (code >= 100 && code <= 107) state.bg = basic[code - 100 + 8];
        else if (code === 38 || code === 48) {
          const mode = codes[++i];
          let color2 = null;
          if (mode === 5) color2 = palette(codes[++i]);
          else if (mode === 2) {
            const rgb = codes.slice(i + 1, i + 4);
            i += 3;
            if (rgb.length === 3 && rgb.every(channel)) color2 = rgb.join(", ");
          } else break;
          if (color2 !== null) state[code === 38 ? "fg" : "bg"] = color2;
        }
      }
    };
    const result = [];
    for (const token of tokens) {
      const text = source.slice(token.start, token.end);
      if (token.kind === "keyword") {
        for (const sequence of text.split("m").slice(0, -1)) apply(sequence.slice(sequence.startsWith("\x1B[") ? 2 : 1));
        continue;
      }
      const content = escapeHTML(escapeTerminalText(text));
      let { fg, bg } = state;
      if (state.reverse) [fg, bg] = [bg ?? "0, 0, 0", fg ?? "255, 255, 255"];
      const styles = [];
      if (fg) styles.push(`color:rgb(${fg})`);
      if (bg) styles.push(`background-color:rgb(${bg})`);
      if (state.bold) styles.push("font-weight:bold");
      if (state.italic) styles.push("font-style:italic");
      if (state.dim) styles.push("opacity:0.5");
      const lines = [state.underline && "underline", state.strike && "line-through"].filter(Boolean);
      if (lines.length) styles.push(`text-decoration:${lines.join(" ")}`);
      result.push(styles.length ? `<span style="${styles.join(";")}">${content}</span>` : content);
    }
    return result.join("");
  }

  // src/polish/guess-language.js
  var signatures = [
    ["sql", /\bselect\b[^;]*\bfrom\b|\binsert\s+into\b|\bcreate\s+(?:table|view|index)\b|\bupdate\s+[\w."]+\s+set\b|\bdelete\s+from\b/i, "code"],
    ["python", /^(?:[ \t]*(?:async\s+)?def\s+\w+\s*\([^\r\n]*\)\s*(?:->[^\r\n:]+)?:|[ \t]*from\s+\w[\w.]*\s+import\s+|[ \t]*if\s+__name__\s*==)/m, "code"],
    ["typescript", /\binterface\s+\w+\s*(?:extends\s+\w+\s*)?\{|\btype\s+\w+\s*=|\b(?:const|let)\s+\w+\s*:\s*(?:string|number|boolean)\b/, "code"],
    ["javascript", /\b(?:const|let|var)\s+[\w$]+\s*=|\bfunction\s+[\w$]+\s*\(|\bconsole\.log\s*\(/, "code"],
    ["rust", /\bfn\s+\w+\s*(?:<[^\r\n>]*>)?\(|\buse\s+\w+::/, "code"],
    ["go", /^package\s+\w+[ \t]*\r?$/m, "code"],
    ["php", /<\?php\b/, "code"],
    ["bash", /^#![^\r\n]*\b(?:bash|sh)\b/, "structure"],
    ["ruby", /^#![^\r\n]*\bruby\b|^\s*def\s+\w+[!?]?[ \t]*\r?$/m, "structure"],
    ["java", /\bpublic\s+(?:(?:final|abstract)\s+)?class\s+\w+|\bSystem\.out\.println\s*\(/, "code"],
    ["csharp", /\busing\s+System\s*;|\bConsole\.WriteLine\s*\(/, "code"],
    ["cpp", /^\s*#\s*include\s*<\s*(?:iostream|vector|string|memory)\s*>|\bstd::/m, "structure"],
    ["c", /^\s*#\s*include\s*[<"](?:stdio|stdlib|string|stdint)\.h[>"]/m, "structure"],
    ["html", /<!doctype\s+html\b|<(?:html|div|span|p|script|style|body|pre|code|a|h[1-6])(?:\s[^<>]*)?>/i, "structure"],
    ["xml", /^\s*<\?xml\s/, "structure"],
    ["css", /(?:^|\n)[ \t]*[.#][\w-]+\s*\{[^}]*[\w-]+\s*:/, "structure"],
    ["dockerfile", /^FROM\s+[\w./:-]+(?:\s+AS\s+\w+)?[ \t]*\r?$/m, "structure"],
    ["markdown", /^#{1,6}\s+\S/m, "structure"]
  ];
  function maskLiteralsAndComments(source, comments2 = true) {
    const chars = source.split("");
    const blank = (start, end) => {
      for (let i2 = start; i2 < end; i2++) if (chars[i2] !== "\r" && chars[i2] !== "\n") chars[i2] = " ";
    };
    let i = 0;
    while (i < source.length) {
      const start = i;
      const quote = source[i];
      if (quote === "'" || quote === '"' || quote === "`") {
        if (!comments2 && quote === '"') {
          const lineStart = Math.max(source.lastIndexOf("\n", i - 1), source.lastIndexOf("\r", i - 1)) + 1;
          if (/^[ \t]*#[ \t]*include[ \t]*$/.test(source.slice(lineStart, i))) {
            const header = /^"[^"\r\n]+"/.exec(source.slice(i));
            if (header) {
              i += header[0].length;
              continue;
            }
          }
        }
        const delimiter = quote !== "`" && source.startsWith(quote.repeat(3), i) ? quote.repeat(3) : quote;
        i += delimiter.length;
        while (i < source.length) {
          if (source[i] === "\\") {
            i += Math.min(2, source.length - i);
            continue;
          }
          if (source.startsWith(delimiter, i)) {
            i += delimiter.length;
            if (delimiter.length === 1 && source[i] === quote) {
              i++;
              continue;
            }
            break;
          }
          i++;
        }
        blank(start, i);
      } else if (comments2 && source.startsWith("/*", i)) {
        const close = source.indexOf("*/", i + 2);
        i = close < 0 ? source.length : close + 2;
        blank(start, i);
      } else if (comments2 && (quote === "#" || source.startsWith("//", i) || source.startsWith("--", i))) {
        while (i < source.length && source[i] !== "\r" && source[i] !== "\n") i++;
        blank(start, i);
      } else i++;
    }
    return chars.join("");
  }
  function guessRegisteredLanguage(source, hasLanguage) {
    const sample = source.slice(0, 8192);
    if (!sample.trim()) return "";
    const views = {
      code: maskLiteralsAndComments(sample),
      structure: maskLiteralsAndComments(sample, false)
    };
    const candidates = [];
    for (const [id, pattern, view] of signatures) {
      if (hasLanguage(id) && pattern.test(views[view])) candidates.push(id);
    }
    if (candidates.length > 1 && candidates.includes("markdown")) candidates.splice(candidates.indexOf("markdown"), 1);
    if (candidates.includes("typescript")) {
      const index = candidates.indexOf("javascript");
      if (index >= 0) candidates.splice(index, 1);
    }
    if (hasLanguage("json") && /^[\s]*[\[{]/.test(sample) && source.length <= 8192) {
      try {
        const value = JSON.parse(source);
        if (value !== null && typeof value === "object") candidates.push("json");
      } catch {
      }
    }
    return candidates.length === 1 ? candidates[0] : "";
  }

  // src/polish/highlighter.js
  var reserved = /* @__PURE__ */ new Set(["ansi", "plain", "text"]);
  function createHighlighter2(options = {}) {
    if (!options || typeof options !== "object" || Array.isArray(options)) throw new TypeError("Expected highlighter options object");
    const { languages = [], maxDepth, maxSteps, guessLanguage = true } = options;
    if (typeof guessLanguage !== "boolean") throw new TypeError("guessLanguage must be a boolean");
    if (!Array.isArray(languages)) throw new TypeError("languages must be an array");
    const core = createHighlighter({ maxDepth, maxSteps });
    const register = (language) => {
      for (const name of [language.id, ...language.aliases ?? []]) {
        if (typeof name === "string" && reserved.has(name.trim().toLowerCase())) throw new Error(`Reserved language name: ${name}`);
      }
      core.register(language);
    };
    for (const language of languages) register(language);
    const resolveLanguage = (source, language) => {
      if (typeof source !== "string") throw new TypeError("Source must be a string");
      if (typeof language !== "string") throw new TypeError("Language must be a string or undefined");
      return language.trim().toLowerCase() || (guessLanguage ? guessRegisteredLanguage(source, core.hasLanguage) : "") || "plain";
    };
    const highlightTokens = (source, language = "") => {
      const name = resolveLanguage(source, language);
      return core.tokenize(source, { language: name === "ansi" ? "plain" : name });
    };
    const highlightHTML = (source, settings = {}) => {
      if (typeof source !== "string") throw new TypeError("Source must be a string");
      if (!settings || typeof settings !== "object" || Array.isArray(settings)) throw new TypeError("Expected highlight options object");
      const { language = "", strict = false } = settings;
      if (typeof strict !== "boolean") throw new TypeError("strict must be a boolean");
      const name = resolveLanguage(source, language);
      if (name === "ansi") return ansiToHTML(source, { maxSteps, strict });
      const result = core.tokenize(source, { language: name || "plain", strict });
      return renderHTML(source, result.tokens);
    };
    return {
      ...core,
      register,
      /** @param {string} name */
      hasLanguage(name) {
        return typeof name === "string" && (reserved.has(name.trim().toLowerCase()) || core.hasLanguage(name));
      },
      highlightHTML,
      highlightTokens,
      /**
       * Direct hook for MeltDown: pass this function without binding it.
       * @param {string} source
       * @param {string} [language]
       */
      highlight: (source, language) => highlightHTML(source, { language })
    };
  }

  // src/polish/clone-grammar.js
  function cloneGrammar(value, seen = /* @__PURE__ */ new WeakMap()) {
    if (value === null || typeof value !== "object") return value;
    if (seen.has(value)) return seen.get(value);
    if (value instanceof RegExp) {
      const copy2 = new RegExp(value.source, value.flags);
      seen.set(value, copy2);
      return copy2;
    }
    const prototype = Object.getPrototypeOf(value);
    if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) throw new Error("Grammar data must use plain objects, arrays, regexes and scanner functions");
    const copy = Array.isArray(value) ? [] : Object.create(prototype);
    seen.set(value, copy);
    for (const [key, entry] of Object.entries(value)) {
      Object.defineProperty(copy, key, { value: cloneGrammar(entry, seen), enumerable: true, writable: true, configurable: true });
    }
    return copy;
  }

  // src/polish/compose.js
  function composeLanguage(base, options) {
    const result = cloneGrammar({ ...base, id: options.id, aliases: options.aliases ?? [] });
    const validateIDs = () => {
      const ids = /* @__PURE__ */ new Set();
      for (const rule of result.rules) {
        if (!rule.id || ids.has(rule.id)) throw new Error(`Invalid or duplicate composed rule ID: ${rule.id}`);
        ids.add(rule.id);
      }
    };
    validateIDs();
    for (const edit of options.edits ?? []) {
      const index = result.rules.findIndex((rule) => rule.id === edit.target);
      if (index < 0) throw new Error(`Composition target not found: ${edit.target}`);
      switch (edit.op) {
        case "insertBefore":
          result.rules.splice(index, 0, ...cloneGrammar(edit.rules));
          break;
        case "insertAfter":
          result.rules.splice(index + 1, 0, ...cloneGrammar(edit.rules));
          break;
        case "replace":
          result.rules.splice(index, 1, cloneGrammar(edit.rule));
          break;
        case "remove":
          result.rules.splice(index, 1);
          break;
        default:
          throw new Error(`Unknown composition operation: ${edit.op}`);
      }
      validateIDs();
    }
    return result;
  }

  // src/polish/loader.js
  function createLanguageLoader(highlighter2, manifest, aliases = {}) {
    const entries = new Map(Object.entries(manifest).map(([id, entry]) => {
      if (!/^[a-z0-9_-]+$/.test(id)) throw new Error(`Invalid manifest ID: ${id}`);
      return [id, { load: entry.load, dependencies: [...entry.dependencies ?? []] }];
    }));
    const aliasMap = new Map(Object.entries(aliases));
    for (const [alias, id] of aliasMap) {
      if (!/^(?=.*[a-z0-9])[a-z0-9_+#-]+$/.test(alias) || !entries.has(id) || entries.has(alias)) throw new Error(`Invalid loader alias: ${alias}`);
    }
    const loaded = /* @__PURE__ */ new Set();
    const loading = /* @__PURE__ */ new Map();
    const resolve = (name) => aliasMap.get(name.trim().toLowerCase()) ?? name.trim().toLowerCase();
    async function loadOne(id) {
      if (loaded.has(id)) return;
      if (!loading.has(id)) {
        const promise = Promise.resolve().then(() => entries.get(id).load()).then((module) => {
          if (module.default?.id !== id) throw new Error(`Manifest/module ID mismatch: ${id}`);
          highlighter2.register(module.default);
          loaded.add(id);
        }).finally(() => loading.delete(id));
        loading.set(id, promise);
      }
      return loading.get(id);
    }
    return {
      /**
       * Validate the complete graph before importing. Cycles are visited once,
       * not awaited recursively. Successful registrations survive a partial failure;
       * a subsequent call retries failed imports only. No rollback is attempted.
       * Use a fresh highlighter for isolation from failed preparation if necessary.
       * @param {...string} names
       */
      async prepare(...names) {
        const visited = /* @__PURE__ */ new Set();
        const pending = names.map(resolve);
        for (let i = 0; i < pending.length; i++) {
          const id = pending[i];
          if (visited.has(id)) continue;
          const entry = entries.get(id);
          if (!entry) throw new Error(`No loader for language: ${id}`);
          visited.add(id);
          pending.push(...entry.dependencies.map(resolve));
        }
        await Promise.all([...visited].map(loadOne));
      }
    };
  }

  // src/polish/languages/shared/c-family.js
  function comments() {
    return [
      { id: "line-comment", pattern: /\/\/[^\r\n]*/, kind: "comment" },
      { id: "block-comment", begin: /\/\*/, end: /\*\//, kind: "comment" }
    ];
  }
  function quotes(prefix = "") {
    return [
      { id: "double-string", begin: new RegExp(`${prefix}"`), end: /"|(?=\r|\n)/, kind: "string", rules: [{ id: "escape", pattern: /\\(?:\r\n|[^])/, kind: "string" }] },
      { id: "character", begin: new RegExp(`${prefix}'`), end: /'|(?=\r|\n)/, kind: "string", rules: [{ id: "escape", pattern: /\\(?:\r\n|[^])/, kind: "string" }] }
    ];
  }
  function words(vocabulary) {
    const terms = vocabulary.trim().split(/\s+/).map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    return new RegExp(`\\b(?:${terms.join("|")})\\b`);
  }
  function identifiers() {
    return [
      { id: "function", pattern: /[A-Za-z_]\w*(?=\s*\()/, kind: "function" },
      { id: "identifier", pattern: /[A-Za-z_]\w*/, kind: "variable" },
      { id: "operator", pattern: /[-+*/%=!<>?&|^~:]+/, kind: "operator" },
      { id: "punctuation", pattern: /[{}()[\],;.]/, kind: "punctuation" }
    ];
  }

  // src/polish/languages/shared/starter.js
  function quoted(id, quote, { doubled = false, escape = true, multiline = false } = {}) {
    const delimiter = quote.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const rules = [];
    if (doubled) rules.push({ id: "doubled", pattern: new RegExp(delimiter + delimiter), kind: "string" });
    if (escape) rules.push({ id: "escape", pattern: /\\(?:\r\n|[^])/, kind: "string" });
    return { id, begin: new RegExp(delimiter), end: new RegExp(delimiter + (doubled ? `(?!${delimiter})` : "") + (multiline ? "" : "|(?=\\r|\\n)")), kind: "string", rules };
  }
  function starter({ id, aliases = [], keywords, types = "", constants = "", booleans = "", insensitive = false, comments: comments2 = [], strings: strings2 = [], before = [], after = [], number = /(?<![\w.])(?:0[xX][\da-fA-F_]+|\d[\d_]*(?:\.\d[\d_]*)?(?:[eE][+-]?[\d_]+)?)(?!\w)/, repository }) {
    const vocabulary = (id2, text, kind) => {
      const pattern = words(text);
      return { id: id2, pattern: new RegExp(pattern.source, insensitive ? "i" : ""), kind };
    };
    return { id, aliases, ...repository ? { repository } : {}, rules: [
      ...comments2,
      ...before,
      ...strings2,
      ...keywords ? [vocabulary("keyword", keywords, "keyword")] : [],
      ...types ? [vocabulary("type", types, "type")] : [],
      ...constants ? [vocabulary("constant", constants, "constant")] : [],
      ...booleans ? [vocabulary("boolean", booleans, "boolean")] : [],
      { id: "number", pattern: number, kind: "number" },
      ...after,
      ...identifiers()
    ] };
  }

  // src/polish/languages/abap.js
  var abap_default = starter({
    id: "abap",
    insensitive: true,
    comments: [{ id: "column-comment", pattern: /^\*[^\r\n]*/m, kind: "comment" }, { id: "comment", pattern: /"[^\r\n]*/, kind: "comment" }],
    strings: [quoted("single", "'", { doubled: true, escape: false }), quoted("backtick", "`", { doubled: true, escape: false }), quoted("template", "|", { multiline: true })],
    before: [{ id: "field-symbol", pattern: /<[A-Za-z_][\w-]*>/, kind: "variable" }],
    keywords: "APPEND ASSIGN AT AUTHORITY-CHECK BEGIN CALL CASE CATCH CHECK CLASS CLEAR CLOSE COLLECT COMMIT CONSTANTS CONTINUE CREATE DATA DELETE DESCRIBE DO ELSE ELSEIF END ENDAT ENDCASE ENDCLASS ENDDO ENDFORM ENDFUNCTION ENDIF ENDLOOP ENDMETHOD ENDMODULE ENDSELECT ENDTRY ENDTYPES ENDWHILE EVENTS EXIT EXPORT FIELD-SYMBOLS FORM FREE FROM FUNCTION IF IMPLEMENTATION IMPORT INCLUDE INSERT INTERFACE INTO LEAVE LOOP MESSAGE METHOD METHODS MODIFY MODULE MOVE NEW OBJECTS OPEN PARAMETERS PRIVATE PROTECTED PUBLIC RAISE READ REFRESH REPORT RETURN ROLLBACK SELECT SORT SPLIT START-OF-SELECTION TABLE TABLES THEN TO TRANSLATE TRY TYPES UPDATE VALUE WHEN WHERE WHILE WITH WRITE",
    types: "abap_bool c d decfloat16 decfloat34 f i int8 n p string t x xstring",
    constants: "abap_true abap_false space initial"
  });

  // src/polish/languages/ada.js
  var ada_default = starter({
    id: "ada",
    insensitive: true,
    comments: [{ id: "comment", pattern: /--[^\r\n]*/, kind: "comment" }],
    strings: [quoted("double", '"', { doubled: true, escape: false }), { id: "character", pattern: /'[^\r\n]'/u, kind: "string" }],
    before: [{ id: "attribute", pattern: /'[A-Za-z_]\w*/, kind: "property" }],
    keywords: "abort abs abstract accept access aliased all and array at begin body case constant declare delay delta digits do else elsif end entry exception exit for function generic goto if in interface is limited loop mod new not null of or others out overriding package parallel pragma private procedure protected raise range record rem renames requeue return reverse select separate some subtype synchronized tagged task terminate then type until use when while with xor",
    types: "Boolean Character Float Integer Long_Float Long_Integer Natural Positive String Wide_Character Wide_String",
    booleans: "True False",
    number: /\b(?:\d[\d_]*#[\da-fA-F_.]+#(?:[eE][+-]?[\d_]+)?|\d[\d_]*(?:\.(?!\.)\d[\d_]*)?(?:[eE][+-]?[\d_]+)?)(?!\w)/
  });

  // src/polish/languages/bash.js
  function heredoc({ source, start, end }) {
    const opening = /<<(-?)[ \t]*(?:'([^'\r\n]*)'|"([^"\r\n]*)"|\\([A-Za-z_]\w*)|([A-Za-z_]\w*))(?=[\s;|&<>)]|$)/g;
    opening.lastIndex = start;
    for (let match; (match = opening.exec(source)) && match.index < end; ) {
      if (source[match.index - 1] === "<" || opening.lastIndex > end) continue;
      const delimiter = match[2] ?? match[3] ?? match[4] ?? match[5];
      const headerEnd = source.indexOf("\n", opening.lastIndex);
      if (headerEnd < 0 || headerEnd >= end) return { start: match.index, end };
      let cursor = headerEnd + 1;
      while (cursor < end) {
        const newline = source.indexOf("\n", cursor);
        const lineEnd = newline < 0 ? end : Math.min(newline, end);
        let line = source.slice(cursor, lineEnd);
        if (line.endsWith("\r")) line = line.slice(0, -1);
        if (match[1] === "-") line = line.replace(/^\t+/, "");
        if (line === delimiter) return { start: match.index, end: lineEnd };
        cursor = lineEnd + 1;
      }
      return { start: match.index, end };
    }
    return null;
  }
  var bash_default = {
    id: "bash",
    aliases: ["sh", "shell"],
    repository: {
      variables: [{ id: "variable", pattern: /\$(?:[A-Za-z_]\w*|\d+|[?@*#$!_-]|\{[^}\r\n]*\})/, kind: "variable" }],
      escapes: [{ id: "escape", pattern: /\\(?:\r\n|[^])/, kind: "string" }]
    },
    rules: [
      { id: "comment", pattern: /(?<![^\s;|&()])#[^\r\n]*/, kind: "comment" },
      { id: "heredoc", scan: heredoc, kind: "string" },
      { id: "single-string", begin: /'/, end: /'/, kind: "string" },
      { id: "double-string", begin: /"/, end: /"/, kind: "string", rules: [{ id: "escapes", include: "escapes" }, { id: "variables", include: "variables" }] },
      { id: "escape", pattern: /\\(?:\r\n|[^])/, kind: "string" },
      { id: "variables", include: "variables" },
      { id: "keyword", pattern: /(?<![\w$.-])(?:if|then|else|elif|fi|for|while|until|do|done|case|esac|in|function|select|time|coproc)\b/, kind: "keyword" },
      { id: "builtin", pattern: /(?<![\w$.-])(?:echo|printf|read|cd|pwd|export|local|declare|readonly|source|return|exit|shift|set|unset|trap|exec|eval|test|true|false|break|continue)\b/, kind: "function" },
      { id: "assignment", pattern: /\b[A-Za-z_]\w*(?==)/, kind: "variable" },
      { id: "number", pattern: /\b\d+\b/, kind: "number" },
      { id: "operator", pattern: /[|&;<>!=]+/, kind: "operator" },
      { id: "punctuation", pattern: /[()[\]{}]/, kind: "punctuation" }
    ]
  };

  // src/polish/languages/c.js
  var c_default = {
    id: "c",
    repository: { comments: comments(), quotes: quotes("(?:u8|[LuU])?") },
    rules: [
      { id: "comments", include: "comments" },
      { id: "preprocessor", begin: /^[ \t]*#[ \t]*[A-Za-z_]\w*/m, end: /(?=\r?$)/m, kind: "keyword", contentKind: "plain", rules: [
        { id: "continuation", pattern: /\\\r?\n/, kind: "punctuation" },
        { id: "comments", include: "comments" },
        { id: "quotes", include: "quotes" },
        { id: "header", pattern: /<[^>\r\n]*>/, kind: "string" }
      ] },
      { id: "quotes", include: "quotes" },
      { id: "keyword", pattern: words("alignas alignof auto break case const constexpr continue default do else enum extern for goto if inline register restrict return sizeof static static_assert struct switch thread_local typedef typeof typeof_unqual union volatile while _Alignas _Alignof _Atomic _Generic _Noreturn _Static_assert _Thread_local"), kind: "keyword" },
      { id: "type", pattern: words("bool char double float int long short signed unsigned void _Bool _Complex _Imaginary"), kind: "type" },
      { id: "boolean", pattern: /\b(?:true|false)\b/, kind: "boolean" },
      { id: "constant", pattern: /\b(?:NULL|nullptr)\b/, kind: "constant" },
      { id: "number", pattern: /(?<![\w.])(?:0[xX][\da-fA-F]+(?:\.[\da-fA-F]*)?(?:[pP][+-]?\d+)?|0[bB][01]+|(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)[uUlLfF]*(?!\w)/, kind: "number" },
      ...identifiers()
    ]
  };

  // src/polish/languages/cobol.js
  var cobol_default = starter({
    id: "cobol",
    aliases: ["cob"],
    insensitive: true,
    comments: [{ id: "fixed-comment", pattern: /^[\d ]{6}[*\/][^\r\n]*/m, kind: "comment" }, { id: "comment", pattern: /\*>[^\r\n]*/, kind: "comment" }],
    strings: [quoted("single", "'", { doubled: true, escape: false }), quoted("double", '"', { doubled: true, escape: false })],
    before: [{ id: "picture", pattern: /\b(PIC(?:TURE)?)(\s+(?:IS\s+)?[ASX9Z0BVP+*,.()\/-]+)/i, kind: "plain", captures: { 1: "keyword", 2: "type" } }],
    keywords: "ACCEPT ADD ALTER AND ASCENDING ASSIGN AT BY CALL CANCEL CLOSE COMPUTE CONFIGURATION CONTINUE COPY DATA DECLARATIVES DELETE DEPENDING DESCENDING DISPLAY DIVIDE DIVISION ELSE END END-ADD END-CALL END-COMPUTE END-EVALUATE END-IF END-PERFORM END-READ END-SEARCH END-STRING END-WRITE ENVIRONMENT EVALUATE EXIT FD FILE FILE-CONTROL FROM GIVING GO GOBACK IDENTIFICATION IF IN INDEXED INITIALIZE INPUT INPUT-OUTPUT INSPECT INTO IS LINKAGE MOVE MULTIPLY NOT OCCURS OF OPEN OR ORGANIZATION OUTPUT PERFORM PROCEDURE PROGRAM-ID READ REDEFINES RENAMES REPLACING RETURN REWRITE SEARCH SECTION SELECT SORT START STOP STRING SUBTRACT THEN THRU TIMES TO UNSTRING UNTIL USING VALUE VALUES VARYING WHEN WITH WORKING-STORAGE WRITE",
    constants: "SPACE SPACES ZERO ZEROS ZEROES HIGH-VALUES LOW-VALUES",
    after: [{ id: "hyphen-name", pattern: /[A-Za-z][\w-]*/, kind: "variable" }]
  });

  // src/polish/languages/cpp.js
  function rawString({ source, start, end }) {
    const opening = /(?<![\w$])(?:u8|[LuU])?R"([^\x00-\x20()\\\x7f]{0,16})\(/g;
    opening.lastIndex = start;
    const match = opening.exec(source);
    if (!match || match.index >= end || opening.lastIndex > end) return null;
    const delimiter = `)${match[1]}"`;
    const close = source.indexOf(delimiter, opening.lastIndex);
    return { start: match.index, end: close < 0 ? end : Math.min(close + delimiter.length, end) };
  }
  var cpp_default = composeLanguage(c_default, {
    id: "cpp",
    aliases: ["cxx", "c++"],
    edits: [
      { op: "insertBefore", target: "quotes", rules: [{ id: "raw-string", scan: rawString, kind: "string" }] },
      { op: "replace", target: "keyword", rule: { id: "keyword", pattern: words("alignas alignof asm auto break case catch class concept const consteval constexpr constinit const_cast continue co_await co_return co_yield decltype default delete do dynamic_cast else enum explicit export extern for friend goto if inline mutable namespace new noexcept operator private protected public register reinterpret_cast requires return sizeof static static_assert static_cast struct switch template this thread_local throw try typedef typeid typename union using virtual volatile while and and_eq bitand bitor compl not not_eq or or_eq xor xor_eq"), kind: "keyword" } },
      { op: "replace", target: "type", rule: { id: "type", pattern: words("bool char char8_t char16_t char32_t double float int long short signed unsigned void wchar_t"), kind: "type" } },
      { op: "replace", target: "number", rule: { id: "number", pattern: /(?<![\w.])(?:0[xX][\da-fA-F](?:'?[\da-fA-F])*(?:\.[\da-fA-F']*)?(?:[pP][+-]?\d[\d']*)?|0[bB][01](?:'?[01])*|(?:\d(?:'?\d)*(?:\.[\d']*)?|\.\d[\d']*)(?:[eE][+-]?\d[\d']*)?)[uUlLfFzZ]*(?!\w)/, kind: "number" } }
    ]
  });

  // src/polish/languages/csharp.js
  function rawString2({ source, start, end }) {
    const opening = /\$*"{3,}/g;
    opening.lastIndex = start;
    const match = opening.exec(source);
    if (!match || match.index >= end || opening.lastIndex > end) return null;
    const count = match[0].length - (match[0].match(/^\$*/)?.[0].length ?? 0);
    const close = source.indexOf('"'.repeat(count), opening.lastIndex);
    return { start: match.index, end: close < 0 ? end : Math.min(close + count, end) };
  }
  var csharp_default = {
    id: "csharp",
    aliases: ["cs", "c#"],
    rules: [
      ...comments(),
      { id: "directive", pattern: /^[ \t]*#[^\r\n]*/m, kind: "keyword" },
      { id: "verbatim-string", begin: /(?:\$@|@\$|@)"/, end: /"(?!")/, kind: "string", rules: [{ id: "doubled-quote", pattern: /""/, kind: "string" }] },
      { id: "raw-string", scan: rawString2, kind: "string" },
      { ...quotes()[0], begin: /\$?"/ },
      quotes()[1],
      { id: "escaped-identifier", pattern: /@[A-Za-z_]\w*/, kind: "variable" },
      { id: "keyword", pattern: words("abstract add alias and as ascending async await base break by case catch checked class const continue default delegate descending do else enum equals event explicit extern file finally fixed for foreach from get global goto group if implicit in init interface internal into is join let lock managed nameof namespace new not notnull on operator or orderby out override params partial private protected public readonly record ref remove required return scoped sealed select set sizeof stackalloc static struct switch this throw try unchecked unmanaged unsafe using value var virtual volatile when where while with yield"), kind: "keyword" },
      { id: "type", pattern: words("bool byte char decimal double dynamic float int long nint nuint object sbyte short string uint ulong ushort void"), kind: "type" },
      { id: "boolean", pattern: /\b(?:true|false)\b/, kind: "boolean" },
      { id: "constant", pattern: /\bnull\b/, kind: "constant" },
      { id: "number", pattern: /(?<![\w.])(?:0[xX][\da-fA-F_]+|0[bB][01_]+|(?:\d[\d_]*(?:\.[\d_]*)?|\.\d[\d_]*)(?:[eE][+-]?[\d_]+)?)[uUlLfFdDmM]*(?!\w)/, kind: "number" },
      ...identifiers()
    ]
  };

  // src/polish/languages/css.js
  var css_default = {
    id: "css",
    rules: [
      { id: "comment", begin: /\/\*/, end: /\*\//, kind: "comment" },
      { id: "double", begin: /"/, end: /"|(?=\r|\n)/, kind: "string", rules: [{ id: "escape", pattern: /\\(?:\r\n|[^])/, kind: "string" }] },
      { id: "single", begin: /'/, end: /'|(?=\r|\n)/, kind: "string", rules: [{ id: "escape", pattern: /\\(?:\r\n|[^])/, kind: "string" }] },
      { id: "at-rule", pattern: /@[\w-]+/, kind: "keyword" },
      { id: "property", pattern: /(?:--)?[a-zA-Z_-][\w-]*(?=\s*:)/, kind: "property" },
      { id: "important", pattern: /!important\b/i, kind: "keyword" },
      { id: "hex", pattern: /#[\da-fA-F]{3,8}\b/, kind: "constant" },
      { id: "number", pattern: /(?<![\w-])-?(?:\d*\.\d+|\d+)(?:%|[a-zA-Z]+)?/, kind: "number" },
      { id: "function", pattern: /[a-zA-Z_-][\w-]*(?=\()/, kind: "function" },
      { id: "punctuation", pattern: /[{}():;,]/, kind: "punctuation" }
    ]
  };

  // src/polish/languages/shared/nested-comments.js
  function nestedCommentRepository() {
    return {
      blockComments: [{
        id: "block-comment",
        begin: /\/\*/,
        end: /\*\//,
        kind: "comment",
        rules: [{ id: "nested-comment", include: "blockComments" }]
      }]
    };
  }

  // src/polish/languages/dart.js
  var dart_default = starter({
    id: "dart",
    repository: nestedCommentRepository(),
    comments: [comments()[0], { id: "comments", include: "blockComments" }],
    strings: [
      { id: "raw-triple-double", begin: /r"""/, end: /"""/, kind: "string" },
      { id: "raw-triple-single", begin: /r'''/, end: /'''/, kind: "string" },
      { id: "triple-double", begin: /"""/, end: /"""/, kind: "string", rules: [{ id: "escape", pattern: /\\[^]/, kind: "string" }] },
      { id: "triple-single", begin: /'''/, end: /'''/, kind: "string", rules: [{ id: "escape", pattern: /\\[^]/, kind: "string" }] },
      { id: "raw-double", begin: /r"/, end: /"|(?=\r|\n)/, kind: "string" },
      { id: "raw-single", begin: /r'/, end: /'|(?=\r|\n)/, kind: "string" },
      ...quotes()
    ],
    before: [{ id: "annotation", pattern: /@[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*/, kind: "type" }],
    keywords: "abstract as assert async await base break case catch class const continue covariant default deferred do else enum export extends extension external factory final finally for get hide if implements import in interface is late library mixin new of on operator part required rethrow return sealed set show static super switch sync this throw try typedef var when while with yield",
    types: "bool double dynamic int Never Null num Object String void",
    constants: "null",
    booleans: "true false"
  });

  // src/polish/languages/pascal.js
  var pascal_default = starter({
    id: "pascal",
    insensitive: true,
    repository: { comments: [
      { id: "curly-comment", begin: /\{/, end: /\}/, kind: "comment", rules: [{ id: "nested", include: "comments" }] },
      { id: "paren-comment", begin: /\(\*/, end: /\*\)/, kind: "comment", rules: [{ id: "nested", include: "comments" }] }
    ] },
    comments: [{ id: "comments", include: "comments" }, { id: "line-comment", pattern: /\/\/[^\r\n]*/, kind: "comment" }],
    strings: [quoted("single", "'", { doubled: true, escape: false })],
    before: [{ id: "character-code", pattern: /#(?:\$[\da-fA-F]+|\d+)/, kind: "string" }],
    keywords: "and array asm begin case const constructor destructor div do downto else end file for function goto if implementation in inherited inline interface label mod not object of operator or packed procedure program record repeat set shl shr then to type unit until uses var while with xor",
    types: "Boolean Byte Char Integer LongInt Pointer Real ShortInt String Word",
    constants: "nil",
    booleans: "True False",
    number: /(?:\$[\da-fA-F]+|%[01]+|\b\d+(?:\.(?!\.)\d+)?(?:[eE][+-]?\d+)?)/
  });

  // src/polish/languages/delphi.js
  var delphi_default = composeLanguage(pascal_default, {
    id: "delphi",
    edits: [{ op: "insertBefore", target: "keyword", rules: [
      { id: "delphi-keyword", pattern: new RegExp(words("abstract automated class dispinterface except exports final finalization finally helper initialization is library on out overload override private property protected public published raise reference resourcestring sealed static strict threadvar try unsafe virtual winapi").source, "i"), kind: "keyword" },
      { id: "delphi-type", pattern: /\b(?:AnsiChar|AnsiString|Cardinal|Currency|Double|Extended|Int64|NativeInt|NativeUInt|UnicodeString|Variant|WideChar|WideString)\b/i, kind: "type" }
    ] }]
  });

  // src/polish/languages/go.js
  var go_default = {
    id: "go",
    aliases: ["golang"],
    rules: [
      ...comments(),
      { id: "raw-string", begin: /`/, end: /`/, kind: "string" },
      ...quotes(),
      { id: "keyword", pattern: words("break case chan const continue default defer else fallthrough for func go goto if import interface map package range return select struct switch type var"), kind: "keyword" },
      { id: "type", pattern: words("any bool byte comparable complex64 complex128 error float32 float64 int int8 int16 int32 int64 rune string uint uint8 uint16 uint32 uint64 uintptr"), kind: "type" },
      { id: "boolean", pattern: /\b(?:true|false)\b/, kind: "boolean" },
      { id: "constant", pattern: /\bnil\b/, kind: "constant" },
      { id: "builtin", pattern: words("append cap clear close complex copy delete imag len make max min new panic print println real recover"), kind: "function" },
      { id: "number", pattern: /(?<![\w.])(?:0[xX][\da-fA-F_]+(?:\.[\da-fA-F_]*)?(?:[pP][+-]?[\d_]+)?|0[bB][01_]+|0[oO][0-7_]+|(?:\d[\d_]*(?:\.[\d_]*)?|\.\d[\d_]*)(?:[eE][+-]?[\d_]+)?)i?(?!\w)/, kind: "number" },
      ...identifiers()
    ]
  };

  // src/polish/languages/groovy.js
  var groovy_default = starter({
    id: "groovy",
    comments: comments(),
    strings: [
      { id: "dollar-slashy", begin: /\$\//, end: /\/\$/, kind: "string", rules: [{ id: "escape", pattern: /\$[\/$]/, kind: "string" }] },
      { id: "triple-single", begin: /'''/, end: /'''/, kind: "string", rules: [{ id: "escape", pattern: /\\[^]/, kind: "string" }] },
      { id: "triple-double", begin: /"""/, end: /"""/, kind: "string", rules: [{ id: "escape", pattern: /\\[^]/, kind: "string" }] },
      quoted("single", "'"),
      quoted("double", '"')
    ],
    before: [{ id: "annotation", pattern: /@[A-Za-z_]\w*/, kind: "type" }],
    keywords: "abstract as assert break case catch class const continue def default do else enum extends final finally for goto if implements import in instanceof interface native new package private protected public return static strictfp super switch synchronized this throw throws trait transient try var void volatile while",
    types: "boolean byte char double float int long short",
    constants: "null",
    booleans: "true false"
  });

  // src/polish/languages/haskell.js
  var haskell_default = starter({
    id: "haskell",
    aliases: ["hs"],
    repository: { comments: [{ id: "block-comment", begin: /\{-/, end: /-\}/, kind: "comment", rules: [{ id: "nested", include: "comments" }] }] },
    comments: [{ id: "comments", include: "comments" }, { id: "line-comment", pattern: /--(?![!#$%&*+./<=>?@\\^|~:-])[^\r\n]*/, kind: "comment" }],
    strings: [quoted("double", '"', { multiline: true }), { id: "character", pattern: /'(?:\\(?:[A-Za-z]+|\d+|[^])|[^'\\\r\n])'/u, kind: "string" }],
    after: [{ id: "identifier-prime", pattern: /[a-z_][\w']*/, kind: "variable" }, { id: "constructor", pattern: /\b[A-Z][\w']*/, kind: "type" }],
    keywords: "as case class data default deriving do else family forall foreign hiding if import in infix infixl infixr instance let mdo module newtype of pattern qualified rec role safe then type unsafe where",
    booleans: "True False"
  });

  // src/polish/languages/html.js
  var attributes = String.raw`(?:[^>"']|"[^"]*"|'[^']*')*`;
  var html_default = {
    id: "html",
    aliases: ["htm"],
    rules: [
      { id: "comment", begin: /<!--/, end: /-->/, kind: "comment" },
      { id: "doctype", pattern: /<!doctype\b(?:[^>"']|"[^"]*"|'[^']*')*>/i, kind: "keyword" },
      { id: "script", begin: new RegExp(`<script(?=[\\s/>])${attributes}>`, "i"), end: /<\/script\s*>/i, kind: "tag", embed: "javascript" },
      { id: "style", begin: new RegExp(`<style(?=[\\s/>])${attributes}>`, "i"), end: /<\/style\s*>/i, kind: "tag", embed: "css" },
      { id: "tag", begin: /(<\/?)([a-zA-Z][\w:-]*)(?=[\s/>])/, beginCaptures: { 1: "punctuation", 2: "tag" }, end: /\/?>/, kind: "punctuation", contentKind: "plain", rules: [
        { id: "assigned-attribute", pattern: /([a-zA-Z_:][\w:.-]*)(\s*=\s*)("[^"]*"|'[^']*'|[^\s>]+)/, kind: "plain", captures: { 1: "attribute", 2: "operator", 3: "string" } },
        { id: "attribute", pattern: /[a-zA-Z_:][\w:.-]*/, kind: "attribute" }
      ] },
      { id: "entity", pattern: /&(?:#[0-9]+|#x[\da-fA-F]+|[a-zA-Z][\da-zA-Z]*);/, kind: "constant" }
    ]
  };

  // src/polish/languages/java.js
  var java_default = {
    id: "java",
    rules: [
      ...comments(),
      { id: "text-block", begin: /"""/, end: /"""/, kind: "string", rules: [{ id: "escape", pattern: /\\(?:\r\n|[^])/, kind: "string" }] },
      ...quotes(),
      { id: "annotation", pattern: /(@)([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)/, kind: "plain", captures: { 1: "punctuation", 2: "type" } },
      { id: "keyword", pattern: words("abstract assert break case catch class const continue default do else enum exports extends final finally for goto if implements import instanceof interface module native new non-sealed open opens package permits private protected provides public record requires return sealed static strictfp super switch synchronized this throw throws to transient transitive try uses var volatile when while with yield"), kind: "keyword" },
      { id: "type", pattern: words("boolean byte char double float int long short void"), kind: "type" },
      { id: "boolean", pattern: /\b(?:true|false)\b/, kind: "boolean" },
      { id: "constant", pattern: /\bnull\b/, kind: "constant" },
      { id: "number", pattern: /(?<![\w$.])(?:0[xX][\da-fA-F_]+(?:\.[\da-fA-F_]*)?(?:[pP][+-]?[\d_]+)?|0[bB][01_]+|(?:\d[\d_]*(?:\.[\d_]*)?|\.\d[\d_]*)(?:[eE][+-]?[\d_]+)?)[lLfFdD]?(?![\w$])/, kind: "number" },
      ...identifiers()
    ]
  };

  // src/polish/languages/javascript.js
  var javascript_default = {
    id: "javascript",
    aliases: ["js"],
    repository: {
      escapes: [{ id: "escape", pattern: /\\(?:\r\n|[^])/, kind: "string" }]
    },
    rules: [
      { id: "line-comment", pattern: /\/\/[^\r\n]*/, kind: "comment" },
      { id: "block-comment", begin: /\/\*/, end: /\*\//, kind: "comment" },
      { id: "single-string", begin: /'/, end: /'|(?=\r|\n)/, kind: "string", rules: [
        { id: "escapes", include: "escapes" }
      ] },
      { id: "double-string", begin: /"/, end: /"|(?=\r|\n)/, kind: "string", rules: [
        { id: "escapes", include: "escapes" }
      ] },
      { id: "template", begin: /`/, end: /`/, kind: "string", rules: [
        { id: "escapes", include: "escapes" },
        { id: "interpolation", begin: /\$\{/, end: /\}/, kind: "punctuation", contentKind: "plain", rules: "$self" }
      ] },
      { id: "brace", begin: /\{/, end: /\}/, kind: "punctuation", contentKind: "plain", rules: "$self" },
      { id: "regexp", pattern: /(?<=(?:^|[=(:,!&|?;\[{}])\s*|\b(?:return|throw|yield)\s+)\/(?![/*])(?:\\[^\r\n]|\[(?:\\[^\r\n]|[^\]\\\r\n])*\]|[^/\\[\r\n])+\/[dgimsuvy]*/, kind: "string" },
      { id: "keyword", pattern: /\b(?:as|async|await|break|case|catch|class|const|continue|debugger|default|delete|do|else|export|extends|finally|for|from|function|get|if|import|in|instanceof|let|new|of|return|set|static|super|switch|this|throw|try|typeof|var|void|while|with|yield)\b/, kind: "keyword" },
      { id: "boolean", pattern: /\b(?:true|false)\b/, kind: "boolean" },
      { id: "constant", pattern: /\b(?:null|undefined|NaN|Infinity)\b/, kind: "constant" },
      { id: "number", pattern: /(?<![\w$])(?:0[xX][\da-fA-F](?:_?[\da-fA-F])*n?|0[bB][01](?:_?[01])*n?|0[oO][0-7](?:_?[0-7])*n?|\d(?:_?\d)*n|(?:\d(?:_?\d)*(?:\.(?:\d(?:_?\d)*)?)?|\.\d(?:_?\d)*)(?:[eE][+-]?\d(?:_?\d)*)?)(?![\w$])/, kind: "number" },
      { id: "function", pattern: /[A-Za-z_$][\w$]*(?=\s*\()/, kind: "function" },
      { id: "identifier", pattern: /[A-Za-z_$][\w$]*/, kind: "variable" },
      { id: "operator", pattern: /[+*/%=!<>?&|^~:-]+/, kind: "operator" },
      { id: "punctuation", pattern: /[()[\],;.}]/, kind: "punctuation" }
    ]
  };

  // src/polish/languages/json.js
  var json_default = {
    id: "json",
    rules: [
      { id: "property", pattern: /"(?:\\[^\r\n]|[^"\\\r\n])*"(?=[ \t\r\n]*:)/, kind: "property" },
      { id: "string", pattern: /"(?:\\[^\r\n]|[^"\\\r\n])*(?:"|\\?(?=\r|\n|$))/, kind: "string" },
      { id: "number", pattern: /(?<![\w.+-])-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?(?![\w.+-])/, kind: "number" },
      { id: "boolean", pattern: /\b(?:true|false)\b/, kind: "boolean" },
      { id: "null", pattern: /\bnull\b/, kind: "constant" },
      { id: "punctuation", pattern: /[{}\[\],:]/, kind: "punctuation" }
    ]
  };

  // src/polish/languages/julia.js
  var julia_default = starter({
    id: "julia",
    aliases: ["jl"],
    repository: { blockComments: [{ id: "block-comment", begin: /#=/, end: /=#/, kind: "comment", rules: [{ id: "nested", include: "blockComments" }] }] },
    comments: [{ id: "block-comments", include: "blockComments" }, { id: "comment", pattern: /#[^\r\n]*/, kind: "comment" }],
    strings: [{ id: "triple", begin: /(?:[A-Za-z_]\w*)?"""/, end: /"""/, kind: "string", rules: [{ id: "escape", pattern: /\\[^]/, kind: "string" }] }, { ...quoted("double", '"'), begin: /(?:[A-Za-z_]\w*)?"/ }, { id: "character", pattern: /'(?:\\[^]|[^'\\\r\n])'/u, kind: "string" }, quoted("command", "`", { multiline: true })],
    before: [{ id: "macro", pattern: /@[A-Za-z_]\w*/, kind: "function" }],
    keywords: "abstract baremodule begin break catch const continue do else elseif end export finally for function global if import let local macro module mutable primitive public quote return struct try type using where while",
    types: "Any Bool Char Complex Float16 Float32 Float64 Int Int8 Int16 Int32 Int64 Int128 Nothing Number String Symbol UInt UInt8 UInt16 UInt32 UInt64 UInt128",
    constants: "nothing missing Inf NaN",
    booleans: "true false"
  });

  // src/polish/languages/kotlin.js
  var kotlin_default = starter({
    id: "kotlin",
    aliases: ["kt"],
    repository: { ...nestedCommentRepository(), interpolation: [
      { id: "expression", begin: /\$\{/, end: /\}/, kind: "punctuation", contentKind: "plain", rules: "$self" },
      { id: "interpolated-name", pattern: /\$[A-Za-z_]\w*/, kind: "variable" }
    ] },
    comments: [comments()[0], { id: "comments", include: "blockComments" }],
    strings: [
      { id: "raw-string", begin: /"""/, end: /"""/, kind: "string", rules: [{ id: "interpolation", include: "interpolation" }] },
      { ...quotes()[0], rules: [...quotes()[0].rules, { id: "interpolation", include: "interpolation" }] },
      quotes()[1]
    ],
    before: [{ id: "annotation", pattern: /@[A-Za-z_]\w*(?::[A-Za-z_]\w*)?/, kind: "type" }, { id: "escaped-name", pattern: /`[^`\r\n]*`/, kind: "variable" }],
    keywords: "abstract actual annotation as break by catch class companion const constructor continue crossinline data delegate do dynamic else enum expect external field file final finally for fun get if import in infix init inline inner interface internal is lateinit noinline object open operator out override package param private property protected public receiver reified return sealed set setparam super suspend tailrec this throw try typealias typeof val var vararg when where while",
    types: "Any Boolean Byte Char Double Float Int Long Nothing Number Short String Unit",
    constants: "null",
    booleans: "true false",
    after: [{ id: "brace", begin: /\{/, end: /\}/, kind: "punctuation", contentKind: "plain", rules: "$self" }]
  });

  // src/polish/languages/shared/delimited.js
  function delimited(opening, closing) {
    return ({ source, start, end }) => {
      const pattern = new RegExp(opening.source, opening.flags.replace(/[gy]/g, "") + "g");
      pattern.lastIndex = start;
      const match = pattern.exec(source);
      if (!match || match.index >= end || pattern.lastIndex > end) return null;
      const delimiter = closing(match);
      const index = source.indexOf(delimiter, pattern.lastIndex);
      return { start: match.index, end: index < 0 ? end : Math.min(end, index + delimiter.length) };
    };
  }
  function pairedQuote(opening) {
    return ({ source, start, end }) => {
      const pattern = new RegExp(opening.source, "g");
      pattern.lastIndex = start;
      const match = pattern.exec(source);
      if (!match || match.index >= end || pattern.lastIndex > end) return null;
      const open = match[1];
      const close = { "(": ")", "[": "]", "{": "}", "<": ">" }[open] ?? open;
      let depth = 1;
      for (let cursor = pattern.lastIndex; cursor < end; cursor++) {
        if (source[cursor] === "\\") {
          cursor++;
          continue;
        }
        if (open !== close && source[cursor] === open) depth++;
        if (source[cursor] === close && --depth === 0) return { start: match.index, end: cursor + 1 };
      }
      return { start: match.index, end };
    };
  }

  // src/polish/languages/lua.js
  var lua_default = starter({
    id: "lua",
    comments: [
      { id: "long-comment", scan: delimited(/--\[(=*)\[/, (m) => "]" + m[1] + "]"), kind: "comment" },
      { id: "comment", pattern: /--[^\r\n]*/, kind: "comment" }
    ],
    strings: [{ id: "long-string", scan: delimited(/\[(=*)\[/, (m) => "]" + m[1] + "]"), kind: "string" }, quoted("double", '"'), quoted("single", "'")],
    keywords: "and break do else elseif end for function goto if in local not or repeat return then until while",
    constants: "nil",
    booleans: "true false",
    number: /(?<![\w.])(?:0[xX][\da-fA-F]+(?:\.[\da-fA-F]*)?(?:[pP][+-]?\d+)?|\d+(?:\.(?!\.)\d*)?(?:[eE][+-]?\d+)?)(?!\w)/
  });

  // src/polish/languages/matlab.js
  var matlab_default = starter({
    id: "matlab",
    comments: [{ id: "block-comment", begin: /^[ \t]*%\{[ \t]*$/m, end: /^[ \t]*%\}[ \t]*$/m, kind: "comment" }, { id: "comment", pattern: /%[^\r\n]*/, kind: "comment" }],
    strings: [{ id: "single", begin: /(?<![\w)\]}.'])'/, end: /'(?!')|(?=\r|\n)/, kind: "string", rules: [{ id: "doubled", pattern: /''/, kind: "string" }] }, quoted("double", '"', { doubled: true, escape: false })],
    keywords: "arguments break case catch classdef continue else elseif end enumeration events for function global if methods otherwise parfor persistent properties return spmd switch try while",
    constants: "Inf NaN pi eps",
    booleans: "true false",
    before: [{ id: "continuation", pattern: /\.\.\.[^\r\n]*/, kind: "comment" }],
    after: [{ id: "transpose", pattern: /\.?'/, kind: "operator" }]
  });

  // src/polish/languages/objective-c.js
  var objective_c_default = composeLanguage(c_default, {
    id: "objective-c",
    aliases: ["objc"],
    edits: [
      { op: "insertBefore", target: "quotes", rules: [{ id: "objc-string", begin: /@"/, end: /"|(?=\r|\n)/, kind: "string", rules: [{ id: "escape", pattern: /\\[^]/, kind: "string" }] }] },
      { op: "insertBefore", target: "keyword", rules: [
        { id: "objc-keyword", pattern: /@(?:interface|implementation|end|protocol|property|synthesize|dynamic|class|public|private|protected|package|selector|encode|defs|try|catch|finally|throw|synchronized|autoreleasepool|optional|required|available)\b/, kind: "keyword" },
        { id: "objc-type", pattern: /\b(?:id|instancetype|Class|SEL|BOOL|NSInteger|NSUInteger|CGFloat|NSString|NSObject)\b/, kind: "type" },
        { id: "objc-constant", pattern: /\b(?:nil|Nil|YES|NO)\b/, kind: "constant" }
      ] }
    ]
  });

  // src/polish/languages/perl.js
  var perl_default = starter({
    id: "perl",
    aliases: ["pl"],
    comments: [{ id: "pod", begin: /^=(?:pod|head\d|over|item|begin|for|encoding)\b.*$/m, end: /^=cut\b.*$/m, kind: "comment" }, { id: "comment", pattern: /#[^\r\n]*/, kind: "comment" }],
    strings: [{ id: "quote-operator", scan: pairedQuote(/\b(?:qq|qw|qr|qx|q)([^\w\s])/), kind: "string" }, quoted("double", '"', { multiline: true }), quoted("single", "'", { multiline: true }), quoted("command", "`", { multiline: true })],
    before: [{ id: "variable", pattern: /[$@%](?:\{[^}\r\n]*\}|[A-Za-z_]\w*(?:::\w+)*|\d+|[!?_])/, kind: "variable" }],
    keywords: "and BEGIN CHECK continue CORE default defer do else elsif END eval for foreach given goto if INIT last local my next no not or our package redo require return say state sub UNITCHECK unless until use when while xor",
    constants: "undef"
  });

  // src/polish/languages/php.js
  function heredoc2({ source, start, end }) {
    const opening = /<<<[ \t]*(?:'([A-Za-z_]\w*)'|"([A-Za-z_]\w*)"|([A-Za-z_]\w*))[ \t]*\r?\n/g;
    opening.lastIndex = start;
    const match = opening.exec(source);
    if (!match || match.index >= end || opening.lastIndex > end) return null;
    const name = match[1] ?? match[2] ?? match[3];
    const closing = new RegExp("^[ \\t]*" + name + "(?=[;,\\])\\r\\n]|$)", "gm");
    closing.lastIndex = opening.lastIndex;
    const found = closing.exec(source);
    return { start: match.index, end: found ? Math.min(end, found.index + found[0].length) : end };
  }
  var php_default = starter({
    id: "php",
    insensitive: true,
    comments: [...comments(), { id: "hash-comment", pattern: /#(?!\[)[^\r\n]*/, kind: "comment" }],
    strings: [{ id: "heredoc", scan: heredoc2, kind: "string" }, quoted("double", '"', { multiline: true }), quoted("single", "'", { multiline: true }), quoted("command", "`", { multiline: true })],
    before: [{ id: "tag", pattern: /<\?(?:php|=)?|\?>/i, kind: "tag" }, { id: "variable", pattern: /\$[A-Za-z_]\w*/, kind: "variable" }],
    keywords: "abstract and array as break callable case catch class clone const continue declare default die do echo else elseif empty enddeclare endfor endforeach endif endswitch endwhile enum eval exit extends final finally fn for foreach function global goto if implements include include_once instanceof insteadof interface isset list match namespace new or print private protected public readonly require require_once return static switch throw trait try unset use var while xor yield",
    types: "bool boolean float double int integer iterable mixed never object resource self parent string void",
    constants: "null",
    booleans: "true false"
  });

  // src/polish/languages/powershell.js
  var powershell_default = starter({
    id: "powershell",
    aliases: ["ps1"],
    insensitive: true,
    repository: { blockComments: [{ id: "block-comment", begin: /<#/, end: /#>/, kind: "comment", rules: [{ id: "nested", include: "blockComments" }] }] },
    comments: [{ id: "block-comments", include: "blockComments" }, { id: "comment", pattern: /#[^\r\n]*/, kind: "comment" }],
    strings: [
      { id: "here-double", begin: /@"\r?\n/, end: /^"@/m, kind: "string" },
      { id: "here-single", begin: /@'\r?\n/, end: /^'@/m, kind: "string" },
      { ...quoted("double", '"', { doubled: true, escape: false, multiline: true }), rules: [{ id: "backtick-escape", pattern: /`[^]/, kind: "string" }, { id: "doubled", pattern: /""/, kind: "string" }, { id: "variable", pattern: /\$(?:\{[^}]*\}|[\w:?]+)/, kind: "variable" }] },
      quoted("single", "'", { doubled: true, escape: false, multiline: true })
    ],
    before: [{ id: "constant", pattern: /\$(?:true|false|null)\b/i, kind: "constant" }, { id: "variable", pattern: /\$(?:\{[^}]*\}|[\w:?]+)/, kind: "variable" }, { id: "operator-word", pattern: /-(?:eq|ne|gt|ge|lt|le|and|or|not|match|notmatch|like|notlike|contains|in|replace|split|join|is|as)\b/i, kind: "operator" }, { id: "cmdlet", pattern: /\b[A-Za-z]+-[A-Za-z][\w-]*/, kind: "function" }],
    keywords: "begin break catch class clean continue data define do dynamicparam else elseif end enum exit filter finally for foreach from function hidden if in inlinescript parallel param process return sequence static switch throw trap try until using var while workflow"
  });

  // src/polish/languages/python.js
  var python_default = {
    id: "python",
    aliases: ["py"],
    rules: [
      { id: "comment", pattern: /#[^\r\n]*/, kind: "comment" },
      { id: "triple-double", begin: /(?:\b(?:[rRuUbBfF]|[rR][fFbB]|[fFbB][rR]))?"""/, end: /"""/, kind: "string", rules: [{ id: "escape", pattern: /\\[^]/, kind: "string" }] },
      { id: "triple-single", begin: /(?:\b(?:[rRuUbBfF]|[rR][fFbB]|[fFbB][rR]))?'''/, end: /'''/, kind: "string", rules: [{ id: "escape", pattern: /\\[^]/, kind: "string" }] },
      { id: "double", begin: /(?:\b(?:[rRuUbBfF]|[rR][fFbB]|[fFbB][rR]))?"/, end: /"|(?=\r|\n)/, kind: "string", rules: [{ id: "escape", pattern: /\\(?:\r\n|[^])/, kind: "string" }] },
      { id: "single", begin: /(?:\b(?:[rRuUbBfF]|[rR][fFbB]|[fFbB][rR]))?'/, end: /'|(?=\r|\n)/, kind: "string", rules: [{ id: "escape", pattern: /\\(?:\r\n|[^])/, kind: "string" }] },
      { id: "keyword", pattern: /\b(?:and|as|assert|async|await|break|case|class|continue|def|del|elif|else|except|finally|for|from|global|if|import|in|is|lambda|match|nonlocal|not|or|pass|raise|return|try|while|with|yield)\b/, kind: "keyword" },
      { id: "boolean", pattern: /\b(?:True|False)\b/, kind: "boolean" },
      { id: "none", pattern: /\bNone\b/, kind: "constant" },
      { id: "number", pattern: /\b(?:0[xX][\da-fA-F_]+|0[bB][01_]+|0[oO][0-7_]+|\d[\d_]*(?:\.[\d_]*)?(?:[eE][+-]?\d[\d_]*)?j?)\b/, kind: "number" },
      { id: "function", pattern: /[A-Za-z_]\w*(?=\s*\()/, kind: "function" },
      { id: "identifier", pattern: /[A-Za-z_]\w*/, kind: "variable" },
      { id: "operator", pattern: /[-+*/%=!<>:&|^~]+/, kind: "operator" },
      { id: "punctuation", pattern: /[{}()[\],;.]/, kind: "punctuation" }
    ]
  };

  // src/polish/languages/r.js
  var r_default = starter({
    id: "r",
    comments: [{ id: "comment", pattern: /#[^\r\n]*/, kind: "comment" }],
    strings: [{ id: "raw-string", scan: delimited(/\b[rR]"(-*)([(\[{])/, (m) => ({ "(": ")", "[": "]", "{": "}" })[m[2]] + m[1] + '"'), kind: "string" }, quoted("double", '"'), quoted("single", "'")],
    before: [{ id: "backtick-name", pattern: /`(?:\\[^]|[^`\\])*`/, kind: "variable" }, { id: "infix", pattern: /%[^%\r\n]*%/, kind: "operator" }],
    keywords: "if else repeat while function for in next break",
    constants: "NULL NA NA_integer_ NA_real_ NA_complex_ NA_character_ NaN Inf",
    booleans: "TRUE FALSE",
    number: /(?<![\w.])(?:0[xX][\da-fA-F]+(?:\.[\da-fA-F]*)?(?:[pP][+-]?\d+)?|(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)[Li]?(?!\w)/
  });

  // src/polish/languages/ruby.js
  var ruby_default = starter({
    id: "ruby",
    aliases: ["rb"],
    comments: [{ id: "block-comment", begin: /^=begin\b.*$/m, end: /^=end\b.*$/m, kind: "comment" }, { id: "comment", pattern: /#[^\r\n]*/, kind: "comment" }],
    strings: [{ id: "percent-literal", scan: pairedQuote(/%(?:[qQwWiIxrs])?([^\w\s])/), kind: "string" }, quoted("double", '"', { multiline: true }), quoted("single", "'", { multiline: true }), quoted("command", "`", { multiline: true })],
    before: [{ id: "variable", pattern: /(?:@@?|\$)[A-Za-z_]\w*/, kind: "variable" }, { id: "symbol", pattern: /(?<!:):[A-Za-z_]\w*[!?=]?/, kind: "constant" }],
    keywords: "alias and BEGIN begin break case class def defined do else elsif END end ensure for if in module next not or redo rescue retry return self super then undef unless until when while yield",
    constants: "nil __FILE__ __LINE__ __ENCODING__",
    booleans: "true false"
  });

  // src/polish/languages/rust.js
  function rawString3({ source, start, end }) {
    const pattern = /(?<![\w$])(?:br|cr|r)(#{0,255})"/g;
    pattern.lastIndex = start;
    const match = pattern.exec(source);
    if (!match || match.index >= end || pattern.lastIndex > end) return null;
    const closing = '"' + match[1];
    const index = source.indexOf(closing, pattern.lastIndex);
    return { start: match.index, end: index < 0 ? end : Math.min(end, index + closing.length) };
  }
  var rust_default = {
    id: "rust",
    aliases: ["rs"],
    repository: nestedCommentRepository(),
    rules: [
      comments()[0],
      { id: "comments", include: "blockComments" },
      { id: "raw-string", scan: rawString3, kind: "string" },
      { ...quotes()[0], begin: /(?:b|c)?"/ },
      { id: "character", pattern: /b?'(?:\\(?:u\{[\da-fA-F_]+\}|x[\da-fA-F]{2}|[^])|[^'\\\r\n])'/u, kind: "string" },
      { id: "lifetime", pattern: /'[A-Za-z_]\w*/, kind: "variable" },
      { id: "macro", pattern: /([A-Za-z_]\w*)(!)(?=\s*[([{])/, kind: "plain", captures: { 1: "function", 2: "punctuation" } },
      { id: "keyword", pattern: words("as async await break const continue crate dyn else enum extern fn for if impl in let loop match mod move mut pub ref return self Self static struct super trait type unsafe use where while abstract become box do final macro override priv typeof unsized virtual yield try gen"), kind: "keyword" },
      { id: "type", pattern: words("bool char str i8 i16 i32 i64 i128 isize u8 u16 u32 u64 u128 usize f32 f64"), kind: "type" },
      { id: "boolean", pattern: /\b(?:true|false)\b/, kind: "boolean" },
      { id: "number", pattern: /(?<![\w.])(?:0x[\da-fA-F_]+|0b[01_]+|0o[0-7_]+|\d[\d_]*(?:\.(?!\.)\d[\d_]*)?(?:[eE][+-]?[\d_]+)?)(?:[iu](?:8|16|32|64|128|size)|f(?:32|64))?(?!\w)/, kind: "number" },
      ...identifiers()
    ]
  };

  // src/polish/languages/scala.js
  var scala_default = starter({
    id: "scala",
    repository: nestedCommentRepository(),
    comments: [comments()[0], { id: "comments", include: "blockComments" }],
    strings: [{ id: "triple-string", begin: /(?:[A-Za-z_]\w*)?"""/, end: /"""/, kind: "string" }, { ...quotes()[0], begin: /(?:[A-Za-z_]\w*)?"/ }, quotes()[1]],
    before: [{ id: "annotation", pattern: /@[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*/, kind: "type" }, { id: "escaped-name", pattern: /`[^`\r\n]*`/, kind: "variable" }],
    keywords: "abstract case catch class def derives do else end enum export extends extension final finally for forSome given if implicit import infix inline lazy match new object opaque open override package private protected return sealed super then this throw trait transparent try type using val var while with yield",
    types: "Any AnyRef AnyVal Boolean Byte Char Double Float Int Long Nothing Null Short String Unit",
    constants: "null",
    booleans: "true false"
  });

  // src/polish/languages/swift.js
  function extendedString({ source, start, end }) {
    const opening = /(?<![\w$])(#+)(?:"""|")|"""/g;
    opening.lastIndex = start;
    const match = opening.exec(source);
    if (!match || match.index >= end || opening.lastIndex > end) return null;
    const hashes = match[1] ?? "";
    const multiline = match[0].endsWith('"""');
    const closing = (multiline ? '"""' : '"') + hashes;
    const escape = "\\" + hashes;
    let cursor = opening.lastIndex;
    while (cursor < end) {
      if (source.startsWith(escape, cursor)) {
        cursor = Math.min(end, cursor + escape.length + 1);
        continue;
      }
      if (source.startsWith(closing, cursor) && cursor + closing.length <= end) return { start: match.index, end: cursor + closing.length };
      if (!multiline && /[\r\n]/.test(source[cursor])) return { start: match.index, end: cursor };
      cursor++;
    }
    return { start: match.index, end };
  }
  var swift_default = {
    id: "swift",
    repository: nestedCommentRepository(),
    rules: [
      comments()[0],
      { id: "comments", include: "blockComments" },
      { id: "extended-string", scan: extendedString, kind: "string" },
      quotes()[0],
      { id: "escaped-identifier", pattern: /`[^`\r\n]*`/, kind: "variable" },
      { id: "attribute", pattern: /(@)([A-Za-z_]\w*)/, kind: "plain", captures: { 1: "punctuation", 2: "type" } },
      { id: "keyword", pattern: words("actor any as associatedtype async await borrowing break case catch class consume consuming continue convenience copy default defer deinit didSet distributed do dynamic each else enum extension fallthrough fileprivate final for func get guard if import in indirect infix init inout internal is isolated lazy let macro mutating nonisolated nonmutating open operator optional override package postfix precedencegroup prefix private protocol public repeat required rethrows return self Self set some static struct subscript super switch throws throw try typealias unowned var weak where while willSet"), kind: "keyword" },
      { id: "type", pattern: words("Any AnyObject Bool Character Double Float Int Int8 Int16 Int32 Int64 String UInt UInt8 UInt16 UInt32 UInt64 Void Never"), kind: "type" },
      { id: "boolean", pattern: /\b(?:true|false)\b/, kind: "boolean" },
      { id: "constant", pattern: /\bnil\b/, kind: "constant" },
      { id: "number", pattern: /\b(?:0x[\da-fA-F_]+(?:\.[\da-fA-F_]*)?(?:[pP][+-]?[\d_]+)?|0b[01_]+|0o[0-7_]+|\d[\d_]*(?:\.\d[\d_]*)?(?:[eE][+-]?[\d_]+)?)\b/, kind: "number" },
      ...identifiers()
    ]
  };

  // src/polish/languages/sql.js
  var sql_default = {
    id: "sql",
    rules: [
      { id: "line-comment", pattern: /--[^\r\n]*/, kind: "comment" },
      { id: "block-comment", begin: /\/\*/, end: /\*\//, kind: "comment" },
      { id: "string", begin: /'/, end: /'(?!')/, kind: "string", rules: [
        { id: "doubled-quote", pattern: /''/, kind: "string" }
      ] },
      { id: "identifier-quoted", begin: /"/, end: /"(?!")/, kind: "variable", rules: [
        { id: "doubled-quote", pattern: /""/, kind: "variable" }
      ] },
      { id: "boolean", pattern: /\b(?:true|false)\b/i, kind: "boolean" },
      { id: "constant", pattern: /\b(?:null|current_date|current_time|current_timestamp)\b/i, kind: "constant" },
      { id: "type", pattern: /\b(?:bigint|binary|bit|blob|boolean|char|character|clob|date|decimal|double|float|int|integer|interval|national|nchar|numeric|real|smallint|text|time|timestamp|varbinary|varchar|varying)\b/i, kind: "type" },
      { id: "keyword", pattern: /\b(?:all|alter|and|any|as|asc|begin|between|by|call|cascade|case|cast|check|collate|column|commit|constraint|create|cross|database|default|delete|desc|distinct|drop|else|end|escape|except|exists|explain|fetch|for|foreign|from|full|grant|group|having|in|index|inner|insert|intersect|into|is|join|key|left|like|limit|natural|not|offset|on|only|or|order|outer|over|partition|primary|procedure|recursive|references|returning|revoke|right|rollback|row|rows|schema|select|set|some|table|then|transaction|trigger|truncate|union|unique|update|using|values|view|when|where|window|with)\b/i, kind: "keyword" },
      { id: "number", pattern: /(?<![\w.])(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?(?!\w)/i, kind: "number" },
      { id: "function", pattern: /\b[A-Za-z_][\w$]*(?=\s*\()/, kind: "function" },
      { id: "identifier", pattern: /\b[A-Za-z_][\w$]*/, kind: "variable" },
      { id: "operator", pattern: /<>|!=|<=|>=|\|\||[-+*/%=<>]/, kind: "operator" },
      { id: "punctuation", pattern: /[.,;()]/, kind: "punctuation" }
    ]
  };

  // src/polish/languages/typescript.js
  var typescript = composeLanguage(javascript_default, {
    id: "typescript",
    aliases: ["ts"],
    edits: [
      { op: "insertBefore", target: "keyword", rules: [
        { id: "type-declaration", pattern: /\b(class|interface|type|enum|namespace)\s+([A-Za-z_$][\w$]*)/, kind: "plain", captures: { 1: "keyword", 2: "type" } },
        { id: "type-keyword", pattern: /(?<![\w$.])(?:abstract|accessor|asserts|declare|enum|global|implements|infer|interface|is|keyof|module|namespace|override|private|protected|public|readonly|require|satisfies|type|unique|using)\b/, kind: "keyword" },
        { id: "builtin-type", pattern: /(?<![\w$.])(?:any|bigint|boolean|intrinsic|never|number|object|string|symbol|unknown|void)\b/, kind: "type" },
        { id: "decorator", pattern: /(@)([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)/, kind: "plain", captures: { 1: "punctuation", 2: "function" } },
        { id: "generic-function", pattern: /[A-Za-z_$][\w$]*(?=\s*<[^<>\r\n;{}]*>\s*\()/, kind: "function" }
      ] },
      { op: "insertBefore", target: "identifier", rules: [
        { id: "type-name", pattern: /(?<![\w$])[A-Z][\w$]*\b/, kind: "type" }
      ] }
    ]
  });
  var typescript_default = typescript;

  // src/polish/languages/shared/basic.js
  function basicLanguage({ id, aliases = [], keywords, types, interpolated = false }) {
    return starter({
      id,
      aliases,
      keywords,
      types,
      insensitive: true,
      constants: "Nothing Null Empty",
      booleans: "True False",
      comments: [{ id: "apostrophe-comment", pattern: /'[^\r\n]*/, kind: "comment" }, { id: "rem-comment", pattern: /(?:^[ \t]*|:[ \t]*)Rem\b[^\r\n]*/im, kind: "comment" }],
      strings: [{ ...quoted("double", '"', { doubled: true, escape: false }), begin: interpolated ? /\$?"/ : /"/ }],
      before: [{ id: "date", pattern: /#\d[^#\r\n]*#/, kind: "constant" }, { id: "directive", pattern: /^[ \t]*#[A-Za-z]+[^\r\n]*/m, kind: "keyword" }, { id: "continuation", pattern: /_[ \t]*\r?\n/, kind: "punctuation" }],
      number: /(?:&[hH][\da-fA-F]+|\b\d+(?:\.\d*)?(?:[eEdD][+-]?\d+)?)[%&!#@]?/
    });
  }

  // src/polish/languages/vba.js
  var vba_default = basicLanguage({
    id: "vba",
    keywords: "Alias And As Attribute Base Begin Binary ByRef ByVal Call Case Class Close Compare Const Declare DefBool DefByte DefCur DefDate DefDbl DefInt DefLng DefObj DefSng DefStr DefVar Dim Do Each Else ElseIf End Enum Eqv Erase Error Event Exit Explicit For Friend Function Get GoSub GoTo If Imp Implements In Input Is Let Lib Like Line Lock Loop LSet Mod Name New Next Not On Open Option Optional Or Output ParamArray Preserve Print Private Property Public Put RaiseEvent Random Read ReDim Rem Reset Resume Return RSet Seek Select Set Static Step Stop Sub Then To Type TypeOf Unlock Until Wend While With WithEvents Write Xor",
    types: "Boolean Byte Currency Date Decimal Double Integer Long LongLong LongPtr Object Single String Variant"
  });

  // src/polish/languages/visual-basic.js
  var visual_basic_default = basicLanguage({
    id: "visual-basic",
    aliases: ["vb", "vbnet"],
    interpolated: true,
    keywords: "AddHandler AddressOf Alias And AndAlso As Async Await ByRef ByVal Call Case Catch Class Const Continue Custom Declare Default Delegate Dim DirectCast Do Each Else ElseIf End Enum Erase Error Event Exit Finally For Friend Function Get GetType GetXmlNamespace Global GoSub GoTo Handles If Implements Imports In Inherits Interface Is IsNot Iterator Let Lib Like Loop Me Mod Module MustInherit MustOverride MyBase MyClass Namespace Narrowing New Next Not NotInheritable NotOverridable Of On Operator Option Optional Or OrElse Out Overloads Overridable Overrides ParamArray Partial Private Property Protected Public RaiseEvent ReadOnly ReDim RemoveHandler Resume Return Select Set Shadows Shared Static Step Stop Structure Sub SyncLock Then Throw To Try TryCast TypeOf Using When While Widening With WithEvents WriteOnly Xor Yield",
    types: "Boolean Byte Char Date Decimal Double Integer Long Object SByte Short Single String UInteger ULong UShort"
  });

  // src/polish/languages/zig.js
  var zig_default = starter({
    id: "zig",
    comments: [{ id: "comment", pattern: /\/\/[^\r\n]*/, kind: "comment" }],
    strings: [{ id: "multiline-string", pattern: /\\\\[^\r\n]*/, kind: "string" }, quoted("double", '"'), quoted("character", "'")],
    before: [{ id: "builtin", pattern: /@[A-Za-z_]\w*/, kind: "function" }],
    keywords: "addrspace align allowzero and anyframe anytype asm async await break callconv catch comptime const continue defer else enum errdefer error export extern fn for if inline linksection noalias noinline nosuspend opaque or orelse packed pub resume return section struct suspend switch test threadlocal try union unreachable usingnamespace var volatile while",
    types: "anyerror bool c_char c_int c_long c_longdouble c_longlong c_short c_uint c_ulong c_ulonglong c_ushort comptime_float comptime_int f16 f32 f64 f80 f128 isize noreturn type usize void",
    constants: "null undefined",
    booleans: "true false",
    after: [{ id: "integer-type", pattern: /\b[ui]\d+\b/, kind: "type" }]
  });

  // src/polish/languages/apache.js
  var variables = () => [{ id: "variable", pattern: /\$\{[^}\r\n]+\}|%\{[^}\r\n]+\}/, kind: "variable" }];
  var apache_default = { id: "apache", aliases: ["apacheconf", "httpd"], rules: [
    { id: "comment", pattern: /^[ \t]*#[^\r\n]*/m, kind: "comment" },
    { id: "container", begin: /<\/?[A-Za-z][\w]*/, end: />|(?=\r|\n)/, kind: "tag", contentKind: "plain", rules: [quoted("double", '"'), quoted("single", "'"), ...variables()] },
    { ...quoted("double", '"'), rules: [{ id: "escape", pattern: /\\[^]/, kind: "string" }, ...variables()] },
    quoted("single", "'"),
    ...variables(),
    { id: "directive", pattern: /^[ \t]*([A-Za-z][\w]*)(?=[ \t]|$)/m, kind: "plain", captures: { 1: "keyword" } },
    { id: "continuation", pattern: /\\\r?\n/, kind: "punctuation" }
  ] };

  // src/polish/languages/batch.js
  var expansions = () => [
    { id: "for-variable", pattern: /%%(?:~[A-Za-z]*\$[A-Za-z_]+:|~[A-Za-z]*)?[A-Za-z]/, kind: "variable" },
    { id: "environment", pattern: /%~[A-Za-z]*[0-9]|%[0-9*]|%[A-Za-z_][^%\r\n]*%|![^!\r\n]+!/, kind: "variable" }
  ];
  var batch_default = { id: "batch", aliases: ["bat", "cmd"], rules: [
    { id: "comment", pattern: /^[ \t]*@?(?:rem(?=[ \t.]|$)|::)[^\r\n]*/im, kind: "comment" },
    { id: "label", pattern: /^[ \t]*:[^:\r\n][^\r\n]*/m, kind: "function" },
    { id: "escape", pattern: /\^(?:\r\n|[^])/, kind: "string" },
    { id: "quote", begin: /"/, end: /"|(?=\r|\n)/, kind: "string", rules: expansions() },
    ...expansions(),
    { id: "command", pattern: /\b(?:assoc|break|call|cd|chdir|cls|color|copy|date|del|dir|echo|endlocal|erase|exit|for|ftype|goto|if|md|mkdir|mklink|move|path|pause|popd|prompt|pushd|rd|rem|ren|rename|rmdir|set|setlocal|shift|start|time|title|type|ver|verify|vol|else|in|do|not|exist|defined|errorlevel|equ|neq|lss|leq|gtr|geq)\b/i, kind: "keyword" },
    { id: "operator", pattern: /&&|\|\||[&|<>]=?|[()@]/, kind: "operator" }
  ] };

  // src/polish/languages/dockerfile.js
  var dockerfile_default = { id: "dockerfile", aliases: ["docker"], rules: [
    { id: "directive-comment", pattern: /^[ \t]*#[ \t]*(?:syntax|escape|check)[ \t]*=[^\r\n]*/im, kind: "keyword" },
    { id: "comment", pattern: /^[ \t]*#[^\r\n]*/m, kind: "comment" },
    { id: "instruction", pattern: /^[ \t]*(FROM|RUN|CMD|LABEL|MAINTAINER|EXPOSE|ENV|ADD|COPY|ENTRYPOINT|VOLUME|USER|WORKDIR|ARG|ONBUILD|STOPSIGNAL|HEALTHCHECK|SHELL)(?=[ \t]|$)/im, kind: "keyword" },
    { id: "flag", pattern: /--[A-Za-z][\w-]*(?:=[^\s"']+)?/, kind: "attribute" },
    quoted("double", '"'),
    quoted("single", "'", { escape: false }),
    { id: "variable", pattern: /\$(?:\{[^}\r\n]*\}|[A-Za-z_]\w*)/, kind: "variable" },
    { id: "continuation", pattern: /\\\r?\n/, kind: "punctuation" },
    { id: "punctuation", pattern: /[\[\],]/, kind: "punctuation" }
  ] };

  // src/polish/languages/dotenv.js
  var variables2 = () => [{ id: "variable", pattern: /\$(?:\{[^}\r\n]*\}|[A-Za-z_]\w*)/, kind: "variable" }];
  var dotenv_default = { id: "dotenv", aliases: ["env"], rules: [
    { id: "comment", pattern: /(?<!\S)#[^\r\n]*/, kind: "comment" },
    { id: "export", pattern: /^[ \t]*export\b/m, kind: "keyword" },
    { id: "key", pattern: /(?:^|(?<=export[ \t]))[ \t]*([A-Za-z_][\w]*)([ \t]*=)/m, kind: "plain", captures: { 1: "property", 2: "operator" } },
    { ...quoted("double", '"', { multiline: true }), rules: [{ id: "escape", pattern: /\\[^]/, kind: "string" }, ...variables2()] },
    quoted("single", "'", { escape: false, multiline: true }),
    ...variables2()
  ] };

  // src/polish/languages/shared/config.js
  function sectionHeader({ arrays = false } = {}) {
    return {
      id: "section",
      begin: arrays ? /^[ \t]*\[\[?/m : /^[ \t]*\[/m,
      end: arrays ? /\]\]?|(?=\r|\n)/ : /\]|(?=\r|\n)/,
      kind: "type",
      rules: [quoted("section-double", '"'), quoted("section-single", "'", { escape: false })]
    };
  }
  function assignmentKey({ toml = false } = {}) {
    const atom = /[A-Za-z0-9_-]+|"(?:\\[^\r\n]|[^"\\\r\n])*"|'[^'\r\n]*'/.source;
    const pattern = toml ? new RegExp(String.raw`(?:^|(?<=[{,]))[ \t]*((?:${atom})(?:[ \t]*\.[ \t]*(?:${atom}))*)([ \t]*=)`, "m") : /^[ \t]*([^=;#\r\n]+?)([ \t]*=)/m;
    return { id: "assignment-key", pattern, kind: "plain", captures: { 1: "property", 2: "operator" } };
  }

  // src/polish/languages/ini.js
  var ini_default = { id: "ini", aliases: ["cfg"], rules: [
    { id: "comment", pattern: /^[ \t]*[;#][^\r\n]*/m, kind: "comment" },
    sectionHeader(),
    assignmentKey(),
    quoted("double", '"'),
    quoted("single", "'", { escape: false })
  ] };

  // src/polish/languages/markdown.js
  function fencedCode({ source, start, end }) {
    const opening = /^ {0,3}(`{3,}|~{3,})([^\r\n]*)(?:\r?\n|$)/gm;
    opening.lastIndex = start;
    let match;
    while ((match = opening.exec(source)) && match.index < end) {
      if (match[1][0] === "`" && match[2].includes("`")) continue;
      const closing = new RegExp("^ {0,3}" + match[1][0] + "{" + match[1].length + ",}[ \\t]*(?:\\r?\\n|$)", "gm");
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
  var markdown_default = { id: "markdown", aliases: ["md"], rules: [
    { id: "fence", scan: fencedCode, kind: "string" },
    { id: "inline-code", scan: inlineCode, kind: "string" },
    { id: "comment", begin: /<!--/, end: /-->/, kind: "comment" },
    { id: "escape", pattern: /\\[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/, kind: "punctuation" },
    { id: "heading", pattern: /^ {0,3}#{1,6}(?:[ \t]+[^\r\n]*|$)/m, kind: "keyword" },
    { id: "setext", pattern: /^ {0,3}(?:=+|-+)[ \t]*$/m, kind: "keyword" },
    { id: "rule", pattern: /^ {0,3}(?:\*[ \t]*){3,}$|^ {0,3}(?:_[ \t]*){3,}$/m, kind: "punctuation" },
    { id: "quote-list", pattern: /^ {0,3}(?:>[ \t]?|[-+*][ \t]+|\d{1,9}[.)][ \t]+)/m, kind: "punctuation" },
    { id: "link", pattern: /!?\[([^\]\r\n]*)\]\(([^)\r\n]*)\)/, kind: "punctuation", captures: { 1: "string", 2: "constant" } },
    { id: "strong", pattern: /\*\*(?=\S)(?:[^*\r\n]|\*(?!\*))+\*\*|__(?=\S)[^_\r\n]+__/, kind: "type" },
    { id: "emphasis", pattern: /(?<!\w)\*(?=\S)[^*\r\n]+\*|(?<!\w)_(?=\S)[^_\r\n]+_/, kind: "property" },
    { id: "autolink", pattern: /<(?:https?:\/\/|mailto:)[^<>\s]+>/, kind: "constant" }
  ] };

  // src/polish/languages/nginx.js
  var variables3 = () => [{ id: "variable", pattern: /\$(?:\{[A-Za-z_]\w*\}|[A-Za-z_]\w*|\d+)/, kind: "variable" }];
  var nginx_default = { id: "nginx", rules: [
    { id: "comment", pattern: /#[^\r\n]*/, kind: "comment" },
    ...['"', "'"].map((quote, index) => ({ ...quoted("quote-" + index, quote), rules: [{ id: "escape", pattern: /\\[^]/, kind: "string" }, ...variables3()] })),
    ...variables3(),
    { id: "directive", pattern: /(?:^|(?<=[;{}]))[ \t]*([A-Za-z_]\w*)(?=[ \t{;])/m, kind: "plain", captures: { 1: "keyword" } },
    { id: "escape", pattern: /\\[^]/, kind: "string" },
    { id: "number", pattern: /(?<![\w./:])\d+(?:\.\d+)?[kKmMgGsShHdDwW]?(?![\w./:])/, kind: "number" },
    { id: "punctuation", pattern: /[{};]/, kind: "punctuation" }
  ] };

  // src/polish/languages/ssh-config.js
  var ssh_config_default = { id: "ssh-config", aliases: ["sshconfig"], rules: [
    { id: "comment", pattern: /(?<!\S)#[^\r\n]*/, kind: "comment" },
    { ...quoted("double", '"'), rules: [{ id: "escape", pattern: /\\[^]/, kind: "string" }, { id: "token", pattern: /%%|%[A-Za-z]/, kind: "variable" }] },
    { id: "directive", pattern: /^[ \t]*([A-Za-z][A-Za-z0-9]*)(?=[ \t=])/m, kind: "plain", captures: { 1: "keyword" } },
    { id: "token", pattern: /%%|%[A-Za-z]/, kind: "variable" },
    { id: "environment", pattern: /\$\{[A-Za-z_]\w*\}/, kind: "variable" },
    { id: "equals", pattern: /=/, kind: "operator" }
  ] };

  // src/polish/languages/systemd.js
  var specifiers = () => [{ id: "specifier", pattern: /%%|%[A-Za-z]/, kind: "variable" }];
  var systemd_default = { id: "systemd", rules: [
    { id: "comment", pattern: /^[ \t]*[#;][^\r\n]*/m, kind: "comment" },
    sectionHeader(),
    assignmentKey(),
    { ...quoted("double", '"'), rules: [{ id: "escape", pattern: /\\[^]/, kind: "string" }, ...specifiers()] },
    quoted("single", "'", { escape: false }),
    ...specifiers(),
    { id: "environment", pattern: /\$\{[A-Za-z_]\w*\}|\$[A-Za-z_]\w*/, kind: "variable" },
    { id: "continuation", pattern: /\\\r?\n/, kind: "punctuation" }
  ] };

  // src/polish/languages/toml.js
  var toml_default = { id: "toml", rules: [
    { id: "comment", pattern: /#[^\r\n]*/, kind: "comment" },
    sectionHeader({ arrays: true }),
    assignmentKey({ toml: true }),
    { id: "multi-basic", begin: /"""/, end: /"""/, kind: "string", rules: [{ id: "escape", pattern: /\\[^]/, kind: "string" }] },
    { id: "multi-literal", begin: /'''/, end: /'''/, kind: "string" },
    quoted("basic", '"'),
    quoted("literal", "'", { escape: false }),
    { id: "datetime", pattern: /\b(?:\d{4}-\d{2}-\d{2}(?:[Tt ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:[Zz]|[+-]\d{2}:\d{2})?)?|\d{2}:\d{2}:\d{2}(?:\.\d+)?)\b/, kind: "constant" },
    { id: "boolean", pattern: /\b(?:true|false)\b/, kind: "boolean" },
    { id: "number", pattern: /(?<![\w.])[+-]?(?:0x[\da-fA-F_]+|0o[0-7_]+|0b[01_]+|\d[\d_]*(?:\.\d[\d_]*)?(?:[eE][+-]?[\d_]+)?|inf|nan)(?!\w)/, kind: "number" },
    { id: "punctuation", pattern: /[\[\]{},.]/, kind: "punctuation" }
  ] };

  // src/polish/languages/xml.js
  var strings = () => [quoted("double", '"', { escape: false, multiline: true }), quoted("single", "'", { escape: false, multiline: true })];
  var comment = () => ({ id: "comment", begin: /<!--/, end: /-->/, kind: "comment" });
  var xml_default = { id: "xml", rules: [
    comment(),
    { id: "cdata", begin: /<!\[CDATA\[/, end: /\]\]>/, kind: "string" },
    { id: "doctype", begin: /<!DOCTYPE\b/, end: />/, kind: "tag", rules: [
      ...strings(),
      { id: "subset", begin: /\[/, end: /\]/, kind: "tag", rules: [comment(), ...strings()] }
    ] },
    { id: "processing", begin: /<\?/, end: /\?>/, kind: "tag", rules: strings() },
    { id: "tag", begin: /<\/?[A-Za-z_:][\w:.-]*/, end: /\/?>/, kind: "tag", contentKind: "plain", rules: [
      ...strings(),
      { id: "attribute", pattern: /[A-Za-z_:][\w:.-]*(?=\s*=)/, kind: "attribute" },
      { id: "equals", pattern: /=/, kind: "operator" }
    ] },
    { id: "entity", pattern: /&(?:#[0-9]+|#x[\da-fA-F]+|[A-Za-z_:][\w:.-]*);/, kind: "constant" }
  ] };

  // src/polish/languages/yaml.js
  function blockScalar({ source, start, end }) {
    const header = /[|>](?:[1-9][+-]?|[+-][1-9]?)?[ \t]*(?:#[^\r\n]*)?(?:\r?\n|$)/g;
    header.lastIndex = start;
    let match;
    while ((match = header.exec(source)) && match.index < end) {
      const prefix = source.slice(source.lastIndexOf("\n", match.index - 1) + 1, match.index);
      if (!/^[ ]*(?:-[ \t]+)?(?:[^#"'|>\r\n]+:[ \t]*)?$/.test(prefix)) continue;
      const base = prefix.match(/^ */)[0].length;
      const explicit = match[0].match(/^[|>][+-]?([1-9])/);
      let indent = explicit ? base + Number(explicit[1]) + (/^ *-\s/.test(prefix) ? 2 : 0) : null;
      let cursor = Math.min(header.lastIndex, end);
      while (cursor < end) {
        const newline = source.indexOf("\n", cursor);
        const next = newline < 0 ? end : Math.min(newline + 1, end);
        const line = source.slice(cursor, next);
        if (!/^\s*$/.test(line)) {
          const spaces = line.match(/^ */)[0].length;
          if (spaces <= base || indent !== null && spaces < indent) break;
          indent ??= spaces;
        }
        cursor = next;
      }
      return { start: match.index, end: cursor };
    }
    return null;
  }
  var yaml_default = { id: "yaml", aliases: ["yml"], rules: [
    { id: "block-scalar", scan: blockScalar, kind: "string" },
    { id: "comment", pattern: /(?<!\S)#[^\r\n]*/, kind: "comment" },
    { ...quoted("double", '"', { multiline: true }), begin: /(?<![\w])"/ },
    { ...quoted("single", "'", { doubled: true, escape: false, multiline: true }), begin: /(?<![\w])'/ },
    { id: "document", pattern: /^(?:---|\.\.\.)(?=\s|$)|^%[^\r\n]*/m, kind: "keyword" },
    { id: "key", pattern: /(?:[A-Za-z_][\w .\/-]*)(?=:[ \t\r\n]|:$)/m, kind: "property" },
    { id: "anchor", pattern: /[&*][A-Za-z0-9_-]+/, kind: "variable" },
    { id: "tag", pattern: /!(?:<[^>\r\n]*>|!?[\w:./-]*)/, kind: "type" },
    { id: "boolean", pattern: /\b(?:true|false)\b/i, kind: "boolean" },
    { id: "null", pattern: /\bnull\b|~/i, kind: "constant" },
    { id: "number", pattern: /(?<![\w])[-+]?(?:0x[\da-f]+|0o[0-7]+|\d+(?:\.\d+)?(?:e[-+]?\d+)?)(?![\w])/i, kind: "number" },
    { id: "punctuation", pattern: /[{}\[\],:]|^ *[-?](?=\s)/m, kind: "punctuation" }
  ] };

  // src/polish-languages.js
  var allLanguages = Object.freeze([sql_default, apache_default, batch_default, dockerfile_default, dotenv_default, ini_default, markdown_default, nginx_default, ssh_config_default, systemd_default, toml_default, xml_default, yaml_default, abap_default, ada_default, bash_default, c_default, cobol_default, cpp_default, csharp_default, css_default, dart_default, delphi_default, go_default, groovy_default, haskell_default, html_default, java_default, javascript_default, json_default, julia_default, kotlin_default, lua_default, matlab_default, objective_c_default, pascal_default, perl_default, php_default, powershell_default, python_default, r_default, ruby_default, rust_default, scala_default, swift_default, typescript_default, vba_default, visual_basic_default, zig_default]);

  // src/polish/themes/palettes.js
  function palette2(name, appearance, foreground, background, colors) {
    return {
      name,
      appearance,
      foreground,
      background,
      tokens: Object.fromEntries(Object.entries(colors).map(([kind, color2]) => [kind, {
        foreground: color2,
        ...kind === "comment" ? { italic: true } : {}
      }]))
    };
  }
  var paperLight = palette2("paper-light", "light", "#34312c", "#fffcf0", {
    comment: "#736b60",
    keyword: "#875015",
    string: "#24685e",
    number: "#70429a",
    boolean: "#70429a",
    constant: "#845408",
    function: "#97451c",
    type: "#943c66",
    property: "#285e89",
    tag: "#52651c",
    attribute: "#285e89"
  });
  var paperDark = palette2("paper-dark", "dark", "#e6ddca", "#24211e", {
    comment: "#a99c86",
    keyword: "#e7ae72",
    string: "#88c6ad",
    number: "#c3a3de",
    boolean: "#c3a3de",
    constant: "#dfbd72",
    function: "#eea276",
    type: "#dfa0bb",
    property: "#8db9d4",
    tag: "#b7c986",
    attribute: "#8db9d4"
  });
  var quietLight = palette2("quiet-light", "light", "#242424", "#fafafa", {
    comment: "#707070",
    keyword: "#595959",
    operator: "#595959",
    string: "#006c55",
    number: "#8a4c1c",
    boolean: "#8a4c1c",
    constant: "#8a4c1c",
    function: "#8a4c1c",
    type: "#8a4c1c",
    tag: "#8a4c1c",
    attribute: "#595959"
  });
  var quietDark = palette2("quiet-dark", "dark", "#eeeeee", "#141414", {
    comment: "#929292",
    keyword: "#b0b0b0",
    operator: "#b0b0b0",
    string: "#99e6ce",
    number: "#edba93",
    boolean: "#edba93",
    constant: "#edba93",
    function: "#edba93",
    type: "#edba93",
    tag: "#edba93",
    attribute: "#b0b0b0"
  });
  var tomorrow = palette2("tomorrow", "dark", "#cccccc", "#2d2d2d", {
    comment: "#999999",
    keyword: "#cc99cd",
    string: "#7ec699",
    number: "#f08d49",
    boolean: "#f08d49",
    constant: "#f8c555",
    function: "#f08d49",
    type: "#f8c555",
    property: "#f8c555",
    variable: "#7ec699",
    operator: "#67cdcc",
    tag: "#e2777a",
    attribute: "#e2777a"
  });
  var dracula = palette2("dracula", "dark", "#f8f8f2", "#282a36", {
    // Brighter than classic Dracula's #6272a4 to meet 4.5:1 for comments too.
    comment: "#929fc9",
    keyword: "#ff79c6",
    operator: "#ff79c6",
    string: "#f1fa8c",
    number: "#bd93f9",
    boolean: "#bd93f9",
    constant: "#bd93f9",
    function: "#50fa7b",
    type: "#8be9fd",
    property: "#8be9fd",
    tag: "#ff79c6",
    attribute: "#50fa7b"
  });
  var cyberpunk = palette2("cyberpunk", "dark", "#e6faff", "#091321", {
    comment: "#829db5",
    keyword: "#ff55b8",
    operator: "#6cecff",
    string: "#beff63",
    number: "#ffe36c",
    boolean: "#ffe36c",
    constant: "#ffe36c",
    function: "#5ce6ff",
    type: "#c6a0ff",
    variable: "#a9e8ff",
    property: "#5ce6ff",
    tag: "#ff829d",
    attribute: "#beff63"
  });
  var atomInspired = palette2("atom-inspired", "dark", "#abb2bf", "#282c34", {
    comment: "#929baa",
    keyword: "#c678dd",
    string: "#98c379",
    number: "#d19a66",
    boolean: "#d19a66",
    constant: "#d19a66",
    function: "#61afef",
    type: "#e5c07b",
    variable: "#e89a9f",
    property: "#e89a9f",
    operator: "#56b6c2",
    tag: "#e89a9f",
    attribute: "#e5c07b"
  });
  var vaporwave = palette2("vaporwave", "dark", "#f4eaff", "#21132f", {
    comment: "#ab96c0",
    keyword: "#ffa1e2",
    operator: "#83ece8",
    string: "#a6f0db",
    number: "#ffc48c",
    boolean: "#ffc48c",
    constant: "#ffc48c",
    function: "#83d9ff",
    type: "#c7b1ff",
    property: "#f4b1e4",
    tag: "#ffa1e2",
    attribute: "#a6f0db"
  });

  // src/polish/themes/index.js
  var light = {
    name: "light",
    appearance: "light",
    foreground: "#24292f",
    background: "#ffffff",
    tokens: {
      comment: { foreground: "#57606a", italic: true },
      keyword: { foreground: "#cf222e" },
      string: { foreground: "#0a3069" },
      number: { foreground: "#0550ae" },
      boolean: { foreground: "#8250df" },
      constant: { foreground: "#8250df" },
      property: { foreground: "#953800" },
      function: { foreground: "#6639ba" },
      type: { foreground: "#953800" },
      tag: { foreground: "#116329" },
      attribute: { foreground: "#0550ae" }
    }
  };
  var dark = {
    name: "dark",
    appearance: "dark",
    foreground: "#e6edf3",
    background: "#0d1117",
    tokens: {
      comment: { foreground: "#8b949e", italic: true },
      keyword: { foreground: "#ff7b72" },
      string: { foreground: "#a5d6ff" },
      number: { foreground: "#79c0ff" },
      boolean: { foreground: "#d2a8ff" },
      constant: { foreground: "#d2a8ff" },
      property: { foreground: "#ffa657" },
      function: { foreground: "#d2a8ff" },
      type: { foreground: "#ffa657" },
      tag: { foreground: "#7ee787" },
      attribute: { foreground: "#79c0ff" }
    }
  };
  var allThemes = Object.freeze([light, dark, paperLight, paperDark, quietLight, quietDark, tomorrow, dracula, cyberpunk, vaporwave, atomInspired]);
  var categories = ["plain", "comment", "keyword", "string", "number", "boolean", "constant", "function", "type", "variable", "property", "operator", "punctuation", "tag", "attribute"];
  function color(value) {
    if (typeof value !== "string" || !/^#[0-9a-f]{6}$/i.test(value)) throw new Error("Theme colors must be six-digit hex colors");
    return value;
  }
  function validateTheme(theme) {
    if (!/^[a-z][a-z0-9_-]*$/.test(theme.name)) throw new Error("Invalid theme name");
    if (!["light", "dark"].includes(theme.appearance)) throw new Error("Invalid theme appearance");
    color(theme.foreground);
    color(theme.background);
    for (const [kind, style] of Object.entries(theme.tokens)) {
      if (!categories.includes(kind)) throw new Error(`Invalid theme category: ${kind}`);
      if (!style || typeof style !== "object" || Array.isArray(style)) throw new Error(`Invalid theme style: ${kind}`);
      if (style.foreground !== void 0) color(style.foreground);
      for (const key of ["bold", "italic", "underline"]) {
        if (style[key] !== void 0 && typeof style[key] !== "boolean") throw new Error(`Invalid theme style: ${key}`);
      }
    }
  }
  function themeToCSS(theme) {
    validateTheme(theme);
    const selector = `.code.theme-${theme.name}, .polish.theme-${theme.name}`;
    const rules = [`${selector} { color-scheme: ${theme.appearance}; color: ${color(theme.foreground)}; background: ${color(theme.background)}; }`];
    for (const kind of categories) {
      const style = theme.tokens[kind] ?? {};
      const variable = `--code-${kind}`;
      rules.push(`${selector} { ${variable}: ${color(style.foreground ?? theme.foreground)}; }`);
      rules.push(`.code.theme-${theme.name} .token.${kind}, .polish.theme-${theme.name} pre .token.${kind} { color: var(${variable}); font-weight: ${style.bold ? "700" : "400"}; font-style: ${style.italic ? "italic" : "normal"}; text-decoration: ${style.underline ? "underline" : "none"}; }`);
    }
    return rules.join("\n");
  }
  return __toCommonJS(polish_full_exports);
})();
