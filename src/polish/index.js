import { flattenCaptures } from './captures.js';
import { escapeHTML, tokenText } from './render-text.js';

/** @typedef {'plain'|'comment'|'keyword'|'string'|'number'|'boolean'|'constant'|'function'|'type'|'variable'|'property'|'operator'|'punctuation'|'tag'|'attribute'} TokenKind */
/** @typedef {{start: number, end: number, kind: TokenKind, language: string}} Token */
/** @typedef {{code: string, severity: 'warning'|'error', message: string, language: string, rule?: string, offset?: number}} Diagnostic */
/** @typedef {Record<string, TokenKind>} Captures */
/** @typedef {{id: string, pattern: RegExp, kind: TokenKind, captures?: Captures}} MatchRule */
/** @typedef {{id: string, begin: RegExp, end: RegExp, kind: TokenKind, contentKind?: TokenKind, rules?: readonly Rule[]|'$self', embed?: string, beginCaptures?: Captures, endCaptures?: Captures}} RegionRule */
/** @typedef {{id: string, include: string}} IncludeRule */
/** @typedef {Readonly<{source: string, start: number, end: number, language: string}>} ScannerContext */
/** @typedef {{start: number, end: number}} ScannerMatch */
/** @typedef {{id: string, scan: (context: ScannerContext) => ScannerMatch|null, kind: TokenKind}} ScannerRule */
/** @typedef {MatchRule|RegionRule|IncludeRule|ScannerRule} Rule */
/** @typedef {{id: string, aliases?: readonly string[], rules: readonly Rule[], repository?: Record<string, readonly Rule[]>}} Language */
/** @typedef {{tokens: Token[], diagnostics: Diagnostic[]}} TokenResult */

const kinds = new Set(['plain', 'comment', 'keyword', 'string', 'number', 'boolean', 'constant', 'function', 'type', 'variable', 'property', 'operator', 'punctuation', 'tag', 'attribute']);
/** @param {string} name */
const normalize = name => name.trim().toLowerCase();

/** @param {{maxDepth?: number, maxSteps?: number}} [limits] */
export function createHighlighter(limits = {}) {
  const maxDepth = limits.maxDepth ?? 64;
  const maxSteps = limits.maxSteps ?? 100000;
  for (const value of [maxDepth, maxSteps]) if (!Number.isSafeInteger(value) || value < 1) throw new Error('Limits must be positive safe integers');
  /** @type {Map<string, {id: string, rules: Rule[]}>} */
  const languages = new Map();
  return {
    /** @param {string} name */
    hasLanguage(name) {
      return typeof name === 'string' && languages.has(normalize(name));
    },
    /** @param {Language} language */
    register(language) {
      const names = [language.id, ...(language.aliases ?? [])].map(normalize);
      if (!/^[a-z0-9_-]+$/.test(names[0]) || names.slice(1).some(name => !/^(?=.*[a-z0-9])[a-z0-9_+#-]+$/.test(name)) || new Set(names).size !== names.length)
        throw new Error('Invalid or duplicate language names');
      for (const name of names) if (languages.has(name)) throw new Error(`Language name already registered: ${name}`);
      const active = new Set();
      const compiledRules = new WeakMap();
      const repository = language.repository ?? {};
      for (const [name, rules] of Object.entries(repository)) {
        if (!/^[a-zA-Z_][\w-]*$/.test(name) || !Array.isArray(rules)) throw new Error(`Invalid repository entry: ${name}`);
      }
      const expandIncludes = (input, trail = []) => {
        if (!Array.isArray(input)) throw new Error('Rules must be an array');
        if (trail.length > maxDepth) throw new Error('Excessively deep include chain');
        const ids = new Set();
        return input.flatMap(rule => {
          if (!rule.id || ids.has(rule.id)) throw new Error(`Invalid or duplicate rule ID: ${rule.id}`);
          ids.add(rule.id);
          if (!('include' in rule)) return [rule];
          if (Object.keys(rule).some(key => key !== 'id' && key !== 'include')) throw new Error(`Include cannot define matching behavior: ${rule.id}`);
          const name = rule.include;
          if (typeof name !== 'string' || !Object.hasOwn(repository, name)) throw new Error(`Unknown local include: ${String(name)}`);
          if (trail.includes(name)) throw new Error(`Non-productive include cycle: ${[...trail, name].join(' -> ')}`);
          return expandIncludes(repository[name], [...trail, name]);
        });
      };
      const compileCaptures = captures => {
        if (captures === undefined) return undefined;
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
        const flags = pattern.flags.replace(/g/g, '') + 'g';
        return new RegExp(pattern.source, captures && !flags.includes('d') ? flags + 'd' : flags);
      };
      const compileRules = (input, depth = 0) => {
        if (depth > maxDepth || active.has(input)) throw new Error('Cyclic or excessively deep rule definitions; use $self for recursion');
        active.add(input);
        const ids = new Set();
        const compiled = expandIncludes(input).map(rule => {
          if (!rule.id || ids.has(rule.id)) throw new Error(`Invalid or duplicate rule ID: ${rule.id}`);
          ids.add(rule.id);
          if (compiledRules.has(rule)) return compiledRules.get(rule);
          if (!kinds.has(rule.kind)) throw new Error(`Invalid token kind: ${rule.kind}`);
          if ('scan' in rule) {
            if (typeof rule.scan !== 'function' || ['pattern', 'begin', 'end', 'rules', 'embed', 'captures', 'beginCaptures', 'endCaptures'].some(key => key in rule)) throw new Error(`Invalid scanner rule: ${rule.id}`);
            const scanner = { id: rule.id, kind: rule.kind, scan: rule.scan };
            compiledRules.set(rule, scanner);
            return scanner;
          }
          if ('begin' in rule) {
            if ('pattern' in rule) throw new Error(`Rule cannot have both pattern and begin: ${rule.id}`);
            if (rule.embed !== undefined && (!/^[a-z0-9_-]+$/.test(rule.embed) || rule.rules !== undefined)) throw new Error(`Embedding must name a language and cannot have child rules: ${rule.id}`);
            if (rule.contentKind !== undefined && !kinds.has(rule.contentKind)) throw new Error(`Invalid content kind: ${rule.contentKind}`);
            const beginCaptures = compileCaptures(rule.beginCaptures);
            const endCaptures = compileCaptures(rule.endCaptures);
            // Publish the region shell before compiling children: a repository
            // may reference this region again after its consuming begin.
            const region = { ...rule, beginCaptures, endCaptures, begin: compileRegex(rule.begin, rule.id, beginCaptures), end: compileRegex(rule.end, rule.id, endCaptures), rules: [] };
            compiledRules.set(rule, region);
            region.rules = rule.rules === '$self' ? '$self' : compileRules(rule.rules ?? [], depth + 1);
            return region;
          }
          const captures = compileCaptures(rule.captures);
          const match = { ...rule, captures, pattern: compileRegex(rule.pattern, rule.id, captures) };
          compiledRules.set(rule, match);
          return match;
        });
        active.delete(input);
        return compiled;
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
      /** @type {Token[]} */
      const tokens = [];
      /** @type {Diagnostic[]} */
      const diagnostics = [];
      /** @param {number} start @param {number} end @param {TokenKind} kind */
      const emit = (start, end, kind, tokenLanguage = language) => {
        if (end <= start) return;
        const previous = tokens.at(-1);
        if (previous?.kind === kind && previous.end === start && previous.language === tokenLanguage) previous.end = end;
        else tokens.push({ start, end, kind, language: tokenLanguage });
      };
      /** @param {Diagnostic} diagnostic */
      const fail = diagnostic => {
        if (options.strict) throw new Error(`${diagnostic.code}: ${diagnostic.message}`);
        diagnostics.push(diagnostic);
      };
      if (!grammar) {
        if (requested !== 'plain' && requested !== 'text') fail({ code: 'unknown-language', severity: 'warning', message: `Unknown language: ${requested}`, language });
        emit(0, source.length, 'plain');
        return { tokens, diagnostics };
      }
      let steps = 0;
      let aborted = false;
      const abort = (code, message, offset, rule, diagnosticLanguage = language) => {
        fail({ code, severity: 'error', message, language: diagnosticLanguage, offset, rule });
        emit(offset, source.length, 'plain');
        aborted = true;
        return source.length;
      };
      // Source and search bounds are immutable for this call. A cached future
      // match remains valid until consumed; a failed search stays failed.
      // Keep this per call, never on shared language definitions.
      const matches = new Map();
      const next = (pattern, cursor) => {
        if (matches.has(pattern)) {
          const cached = matches.get(pattern);
          if (cached === null || cached.index >= cursor) return cached;
        }
        pattern.lastIndex = cursor;
        let match = pattern.exec(source);
        // Unicode regexes can rewind one code unit when cursor is inside a
        // surrogate pair. Skip that already-started character, not the source
        // context: anchors and lookarounds must still see the original string.
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
        try { spans = flattenCaptures(match, captures, kind, bound); }
        catch (error) {
          fail({ code: 'invalid-captures', severity: 'error', message: error.message, language: context.id, rule, offset: match.index });
          emit(match.index, Math.min(bound, match.index + match[0].length), kind, context.id);
          return;
        }
        for (const span of spans) emit(span.start, span.end, span.kind, context.id);
      };
      const scan = (cursor, rules, defaultKind, closing, depth, context = grammar, bound = source.length) => {
        const output = (start, end, kind) => emit(start, end, kind, context.id);
        while (cursor < bound && !aborted) {
          if (++steps > maxSteps) return abort('step-limit', 'Tokenization step limit exceeded', cursor, undefined, context.id);
          const end = closing ? next(closing.end, cursor) : null;
          let winner;
          for (const rule of rules) {
            let match;
            if ('scan' in rule) {
              // Scanner results depend on context, so unlike regexes they are
              // not cached across cursors or embedded-region bounds.
              try {
                const candidate = rule.scan(Object.freeze({ source, start: cursor, end: bound, language: context.id }));
                if (candidate === null) continue;
                if (candidate && typeof candidate.then === 'function') {
                  Promise.resolve(candidate).catch(() => {});
                  throw new Error('Scanners must be synchronous');
                }
                if (!candidate || !Number.isSafeInteger(candidate.start) || !Number.isSafeInteger(candidate.end) || candidate.start < cursor || candidate.end <= candidate.start || candidate.end > bound) throw new Error('Scanner must return a consuming range inside the current search bounds, or null');
                match = { index: candidate.start, 0: source.slice(candidate.start, candidate.end) };
              } catch (error) {
                return abort('invalid-scanner', `Scanner ${rule.id} failed: ${error instanceof Error ? error.message : String(error)}`, cursor, rule.id, context.id);
              }
            } else match = next('begin' in rule ? rule.begin : rule.pattern, cursor);
            if (match && match.index < bound && (!winner || match.index < winner.match.index)) winner = { rule, match };
          }
          // A close wins a tie, including zero-width closes. A successful pop
          // changes state, so the parent can continue safely at the same offset.
          if (end && end.index <= bound && end.index + end[0].length <= bound && (!winner || end.index <= winner.match.index)) {
            output(cursor, end.index, defaultKind);
            emitMatch(end, closing.kind, closing.endCaptures, context, bound, closing.id);
            return end.index + end[0].length;
          }
          if (!winner) { output(cursor, bound, defaultKind); return bound; }
          const { rule, match } = winner;
          output(cursor, match.index, defaultKind);
          if (!match[0].length) return abort('zero-length-match', 'Ordinary rules and region begins must consume source', match.index, rule.id, context.id);
          if ('begin' in rule && depth >= maxDepth) return abort('depth-limit', 'Region nesting limit exceeded', match.index, rule.id, context.id);
          emitMatch(match, rule.kind, 'begin' in rule ? rule.beginCaptures : rule.captures, context, bound, rule.id);
          cursor = Math.min(bound, match.index + match[0].length);
          if ('begin' in rule && cursor < bound) {
            if (rule.embed) {
              // The host delimiter is authoritative, even inside an embedded
              // string/comment. This matches HTML raw-text script/style behavior.
              const close = next(rule.end, cursor);
              const contentEnd = close && close.index < bound ? close.index : bound;
              const embedded = languages.get(rule.embed);
              if (embedded) scan(cursor, embedded.rules, 'plain', null, depth + 1, embedded, contentEnd);
              else {
                fail({ code: 'missing-embedding', severity: 'warning', message: `Embedded language unavailable: ${rule.embed}`, language: context.id, rule: rule.id, offset: cursor });
                output(cursor, contentEnd, 'plain');
              }
              if (aborted) return source.length;
              cursor = contentEnd;
              if (close && close.index + close[0].length <= bound) {
                emitMatch(close, rule.kind, rule.endCaptures, context, bound, rule.id);
                cursor += close[0].length;
              }
            } else cursor = scan(cursor, rule.rules === '$self' ? context.rules : rule.rules, rule.contentKind ?? rule.kind, rule, depth + 1, context, bound);
          }
        }
        return cursor;
      };
      scan(0, grammar.rules, 'plain', null, 0);
      return { tokens, diagnostics };
    },
  };
}

/** @param {string} source @param {readonly Token[]} tokens */
export function validateTokens(source, tokens) {
  let cursor = 0;
  for (const token of tokens) {
    if (!Number.isInteger(token.start) || !Number.isInteger(token.end) || token.start !== cursor || token.end <= token.start || token.end > source.length || !kinds.has(token.kind))
      throw new Error('Invalid token partition');
    cursor = token.end;
  }
  if (cursor !== source.length) throw new Error('Incomplete token partition');
}

/**
 * Returns code contents only. Place inside a pre/code wrapper to preserve whitespace.
 * @param {string} source
 * @param {readonly Token[]} tokens
 */
export function renderHTML(source, tokens) {
  validateTokens(source, tokens);
  return tokens.map(token => {
    const text = escapeHTML(tokenText(source, token.start, token.end));
    if (!text) return '';
    return token.kind === 'plain' ? text : `<span class="token ${token.kind}">${text}</span>`;
  }).join('');
}
