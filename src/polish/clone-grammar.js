/**
 * Clone native grammar data, preserving graph identity and trusted scanner
 * function references. Closures cannot be cloned: scanners must be stateless.
 * Unlike structuredClone this deliberately accepts functions, but not arbitrary
 * class instances, Maps, or host objects as grammar data.
 */
export function cloneGrammar(value, seen = new WeakMap()) {
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value)) return seen.get(value);
  if (value instanceof RegExp) {
    const copy = new RegExp(value.source, value.flags);
    seen.set(value, copy);
    return copy;
  }
  const prototype = Object.getPrototypeOf(value);
  if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) throw new Error('Grammar data must use plain objects, arrays, regexes and scanner functions');
  const copy = Array.isArray(value) ? [] : Object.create(prototype);
  seen.set(value, copy);
  for (const [key, entry] of Object.entries(value)) {
    Object.defineProperty(copy, key, { value: cloneGrammar(entry, seen), enumerable: true, writable: true, configurable: true });
  }
  return copy;
}
