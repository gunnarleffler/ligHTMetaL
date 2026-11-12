/** Typed public failures. Details contain diagnostics, never attachment contents. */
export class EtchError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'EtchError';
    this.code = code;
    this.details = structuredClone(details);
  }
}

export function fail(code, message, details) {
  throw new EtchError(code, message, details);
}
