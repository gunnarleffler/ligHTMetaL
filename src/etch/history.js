import { fail } from './errors.js';

function valueBytes(value) {
  if (typeof value === 'string') return 2*value.length;
  if (!value || typeof value !== 'object') return 8;
  return 32+Object.values(value).reduce((sum, v) => sum+valueBytes(v), 0);
}

/** Approximate cost of changed data only; shared points/assets are not copied per drag. */
function deltaBytes(before, after) {
  if (before === after) return 0;
  if (!before || !after || typeof before !== 'object' || typeof after !== 'object') {
    return valueBytes(before)+valueBytes(after);
  }
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  let bytes = 32;
  for (const key of keys) bytes += deltaBytes(before[key], after[key]);
  return bytes;
}

export class History {
  #undo = [];
  #redo = [];
  constructor({ maxCommands = 200, maxBytes = 64*1024*1024 } = {}) {
    if (!Number.isSafeInteger(maxCommands) || maxCommands < 1 || !Number.isSafeInteger(maxBytes) || maxBytes < 1) {
      fail('INVALID_ARGUMENT', 'History limits must be positive integers');
    }
    this.maxCommands = maxCommands;
    this.maxBytes = maxBytes;
  }
  push(before, after, label, session = {}) {
    if (before === after) return false;
    this.#redo = [];
    this.#undo.push({ before, after, label, ...session, bytes: deltaBytes(before, after) });
    let bytes = this.#undo.reduce((sum, e) => sum+e.bytes, 0);
    while (this.#undo.length > this.maxCommands || (bytes > this.maxBytes && this.#undo.length > 1)) {
      bytes -= this.#undo.shift().bytes;
    }
    return true;
  }
  undo() {
    const entry = this.#undo.pop();
    if (entry) this.#redo.push(entry);
    return entry ?? null;
  }
  redo() {
    const entry = this.#redo.pop();
    if (entry) this.#undo.push(entry);
    return entry ?? null;
  }
  clear() { this.#undo = []; this.#redo = []; }
  getState() {
    return { canUndo: this.#undo.length > 0, canRedo: this.#redo.length > 0,
      undoLabel: this.#undo.at(-1)?.label ?? null, redoLabel: this.#redo.at(-1)?.label ?? null };
  }
  /** Resources referenced by either side of every retained command must stay alive. */
  documents() { return [...this.#undo, ...this.#redo].flatMap(e => [e.before, e.after]); }
}
