/** Immutable document helpers. Durable data never contains editor/session state. */
let fallbackCounter = 0;
export function createId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random()*256);
  return `etch-${Array.from(bytes, b => b.toString(16).padStart(2,'0')).join('')}-${++fallbackCounter}`;
}

export function emptyLayer(name = 'Layer 1') {
  return { id: createId(), name, visible: true, locked: false, offset: [0,0], elements: [] };
}
export function emptyDocument() {
  return { format: 'lightmetal-etch', version: 1, background: null, layers: [emptyLayer()], assets: [] };
}
export function freezeDocument(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeDocument(child);
    Object.freeze(value);
  }
  return value;
}
/** Include hidden/locked layers; visibility omissions belong to import planning. */
export function referencedAssetIds(document) {
  const ids = new Set();
  for (const layer of document.layers) for (const e of layer.elements) if (e.type === 'image') ids.add(e.assetId);
  return ids;
}
export function snapshot(document) {
  const used = referencedAssetIds(document);
  return structuredClone({ ...document, assets: document.assets.filter(a => used.has(a.id)) });
}
export function preferredLayer(document) {
  return document.layers.findLast(l => l.visible && !l.locked)?.id ?? document.layers.at(-1).id;
}
