/** Detached event payloads and a dispatch boundary for post-transaction events. */
export class Emitter {
  #listeners = new Map();
  #dispatching = false;
  #pending = [];
  #draining = false;
  #generation = 0;
  constructor(report = error => {
    if (typeof globalThis.reportError === 'function') globalThis.reportError(error);
    else console.error(error);
  }) { this.report = report; }
  on(name, callback) {
    const listeners = this.#listeners.get(name) ?? new Set();
    listeners.add(callback); this.#listeners.set(name, listeners);
    return () => { listeners.delete(callback); };
  }
  get dispatching() { return this.#dispatching; }
  defer(action, cancel) { this.#pending.push({action,cancel}); }
  emitBatch(events) {
    const generation = this.#generation;
    this.#dispatching = true;
    try {
      for (const [name, payload] of events) {
        if (generation !== this.#generation) break;
        for (const listener of [...(this.#listeners.get(name) ?? [])]) {
          if (generation !== this.#generation) break;
          try { listener(structuredClone(payload)); }
          catch (error) { queueMicrotask(() => this.report(error)); }
        }
      }
    } finally {
      this.#dispatching = false;
    }
    if (!this.#draining) {
      this.#draining = true;
      try {
        while (this.#pending.length) {
          try { this.#pending.shift().action(); }
          catch (error) { queueMicrotask(() => this.report(error)); }
        }
      } finally { this.#draining = false; }
    }
  }
  clear(reason) {
    this.#generation++;this.#listeners.clear();
    const pending = this.#pending;this.#pending = [];
    for (const {cancel} of pending) {
      try {cancel?.(reason);}catch(error) {queueMicrotask(() => this.report(error));}
    }
  }
}
