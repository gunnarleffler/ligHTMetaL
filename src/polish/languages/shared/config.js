import { quoted } from './starter.js';

/** Shared lexical mechanics, not shared configuration semantics. */
export function sectionHeader({ arrays = false } = {}) {
  return { id: 'section', begin: arrays ? /^[ \t]*\[\[?/m : /^[ \t]*\[/m,
    end: arrays ? /\]\]?|(?=\r|\n)/ : /\]|(?=\r|\n)/,
    kind: 'type', rules: [quoted('section-double', '"'), quoted('section-single', "'", { escape: false })] };
}
/** Keys are properties; dots are merely colored here, not interpreted as paths. */
export function assignmentKey({ toml = false } = {}) {
  const atom = /[A-Za-z0-9_-]+|"(?:\\[^\r\n]|[^"\\\r\n])*"|'[^'\r\n]*'/.source;
  const pattern = toml
    ? new RegExp(String.raw`(?:^|(?<=[{,]))[ \t]*((?:${atom})(?:[ \t]*\.[ \t]*(?:${atom}))*)([ \t]*=)`, 'm')
    : /^[ \t]*([^=;#\r\n]+?)([ \t]*=)/m;
  return { id: 'assignment-key', pattern, kind: 'plain', captures: { 1: 'property', 2: 'operator' } };
}
