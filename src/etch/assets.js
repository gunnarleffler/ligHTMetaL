import { EtchError, fail } from './errors.js';
import { bytesFromBase64 } from './raster.js';
import { referencedAssetIds } from './document.js';

/** Decode only verified local raster blobs. Every returned resource has an explicit owner. */
export async function decodeImageBlob(blob,signal) {
  if (signal.aborted) fail('CANCELLED','Image decoding cancelled');
  let image,url;
  const close = () => {if (typeof image?.close === 'function') image.close();else image?.removeAttribute('src');};
  const abort = () => image?.removeAttribute?.('src');
  try {
    if (typeof globalThis.createImageBitmap === 'function') image = await globalThis.createImageBitmap(blob,{imageOrientation:'from-image'});
    else {
      url = URL.createObjectURL(blob);image = new Image();signal.addEventListener('abort',abort,{once:true});
      image.src = url;await image.decode();
    }
    if (signal.aborted) fail('CANCELLED','Image decoding cancelled');
    return {image,close};
  } catch (error) {
    close();if (signal.aborted) fail('CANCELLED','Image decoding cancelled');
    if (error instanceof EtchError) throw error;
    fail('DECODE_FAILED','Could not decode image');
  } finally {if (url) URL.revokeObjectURL(url);signal.removeEventListener('abort',abort);}
}
async function decodeRaster(asset,signal) {
  const resource = await decodeImageBlob(new Blob([bytesFromBase64(asset.data)],{type:asset.mime}),signal);
  const {image} = resource;
  if ((image.naturalWidth ?? image.width) !== asset.width || (image.naturalHeight ?? image.height) !== asset.height) {
    resource.close();fail('DECODE_FAILED','Decoded raster dimensions disagree with its header');
  }
  return resource;
}

export class AssetPool {
  #resources = new Map();
  get(id) { return this.#resources.get(id)?.image; }
  add(id, resource) { this.#resources.set(id, resource); }
  /** Atomic ownership transfer after a complete import has decoded successfully. */
  transferTo(target) {
    if (!(target instanceof AssetPool) || target === this) fail('INVALID_ARGUMENT','Invalid asset pool transfer');
    for (const id of this.#resources.keys()) if (target.#resources.has(id)) fail('INVALID_ARGUMENT','Imported asset ID collision');
    for (const [id,resource] of this.#resources) target.#resources.set(id,resource);
    this.#resources.clear();
  }
  retain(documents) {
    const ids = new Set();
    for (const doc of documents) for (const id of referencedAssetIds(doc)) ids.add(id);
    for (const [id, resource] of this.#resources) if (!ids.has(id)) {
      resource.close(); this.#resources.delete(id);
    }
  }
  dispose() {
    for (const resource of this.#resources.values()) resource.close();
    this.#resources.clear();
  }
}

export async function decodeAssets(document, signal, decode = decodeRaster) {
  const pool = new AssetPool();
  try {
    for (const asset of document.assets) {
      if (signal.aborted) fail('CANCELLED', 'Asset decoding cancelled');
      pool.add(asset.id, await decode(asset, signal));
      if (signal.aborted) fail('CANCELLED', 'Asset decoding cancelled');
    }
    return pool;
  } catch (error) {
    pool.dispose();
    if (signal.aborted) fail('CANCELLED', 'Asset decoding cancelled');
    if (error instanceof EtchError) throw error;
    fail('DECODE_FAILED', 'Could not decode native raster asset');
  }
}
