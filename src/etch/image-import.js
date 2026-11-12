import { EtchError, fail } from './errors.js';
import { createId } from './document.js';
import { decodeImageBlob } from './assets.js';
import { MAX_IMAGE_BYTES, base64FromBytes, checkImageSize, imageOptions, inspectRaster } from './raster.js';

const cancelled = signal => {if (signal.aborted) fail('CANCELLED','Image import cancelled');};
// Preserve already-lossless PNG bytes/color metadata when no frame/orientation normalization is needed.
function reusablePNG(bytes) {
  const v = new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let end = false;
  for (let i = 8;i < bytes.length;) {
    if (i+12 > bytes.length) return false;
    const length = v.getUint32(i),type = String.fromCharCode(...bytes.subarray(i+4,i+8));
    if (i+12+length > bytes.length || ['acTL','fcTL','fdAT','eXIf'].includes(type)) return false;
    i += 12+length;if (type === 'IEND') {end = i === bytes.length;break;}
  }
  return end;
}
/** Bounded, off-document source. Native browser codecs only; never remote URLs. */
export async function prepareRaster(blob,context,doc,{thumbnail=false}={}) {
  const {signal,limits,retained} = context;let source,canvas,releasePixels,disposed = false,encoding = false;
  const release = () => {releasePixels?.();releasePixels = null;};
  const close = () => {disposed = true;source?.close();source = null;if (canvas) {canvas.width = canvas.height = 0;canvas = null;}if (!encoding) release();};
  try {
    cancelled(signal);
    if (!blob || !Number.isSafeInteger(blob.size) || blob.size < 1 || typeof blob.arrayBuffer !== 'function') fail('INVALID_ARGUMENT','Choose a non-empty PNG, JPEG or WebP file/blob');
    if (blob.size > MAX_IMAGE_BYTES) fail('LIMIT_EXCEEDED','Image files must be at most 20 MiB',{limit:'imageBytes',maximum:MAX_IMAGE_BYTES});
    const bytes = new Uint8Array(await blob.arrayBuffer());cancelled(signal);
    if (bytes.length !== blob.size || bytes.length > MAX_IMAGE_BYTES) fail('LIMIT_EXCEEDED','Image byte length exceeds its declared limit',{limit:'imageBytes',maximum:MAX_IMAGE_BYTES});
    const info = inspectRaster(bytes,{allowAnimation:false}),originalPNG = info.mime === 'image/png' && reusablePNG(bytes) ? new Blob([bytes],{type:'image/png'}) : null,thumb = (w,h) => {const r = Math.min(1,240/w,160/h);return Math.max(1,Math.round(w*r))*Math.max(1,Math.round(h*r));};
    const extraPixels = thumbnail ? Math.max(thumb(info.width,info.height),thumb(info.height,info.width)) : 0;
    checkImageSize(info,limits,retained.pixels,extraPixels);
    releasePixels = context.reservePixels(2*info.width*info.height+extraPixels);
    source = await decodeImageBlob(new Blob([bytes],{type:info.mime}),signal);cancelled(signal);
    const width = source.image.naturalWidth ?? source.image.width,height = source.image.naturalHeight ?? source.image.height;
    if (!((width === info.width && height === info.height) || (width === info.height && height === info.width))) fail('DECODE_FAILED','Decoded image dimensions disagree with its header');
    checkImageSize({width,height},limits,retained.pixels,extraPixels);
    canvas = doc.createElement('canvas');canvas.width = width;canvas.height = height;
    const ctx = canvas.getContext('2d');if (!ctx) fail('DECODE_FAILED','Canvas image conversion is unavailable');
    ctx.drawImage(source.image,0,0);source.close();source = null;
    return {
      width,height,originalBytes:bytes.length,
      name:typeof blob.name === 'string' ? blob.name.replace(/\.[^.]*$/,'').replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,80) || 'Image' : 'Image',
      close,
      async encode(options) {
        const {format,quality} = imageOptions(options);cancelled(signal);
        if (disposed) fail('CANCELLED','Image source disposed');
        if (encoding) fail('BUSY','Image encoding is already pending');
        encoding = true;let resource;
        try {
          const mime = `image/${format}`,encoded = format === 'png' && originalPNG ? originalPNG : await new Promise((resolve,reject) => {
            try {canvas.toBlob(value => value ? resolve(value) : reject(new EtchError('DECODE_FAILED','Browser could not encode image')),mime,quality);}catch(error) {reject(error);}
          });
          cancelled(signal);if (disposed) fail('CANCELLED','Image source disposed');
          if (encoded.type !== mime) fail('INVALID_ARGUMENT','This browser cannot encode WebP; choose PNG — lossless',{encoder:'webp',supported:false});
          const maximum = limits.assetBytes-retained.bytes;
          if (encoded.size > maximum) fail('LIMIT_EXCEEDED','Encoded image exceeds asset byte allowance, including Undo history',{limit:'assetBytes',maximum,actual:encoded.size});
          const data = new Uint8Array(await encoded.arrayBuffer());cancelled(signal);
          const header = inspectRaster(data,{allowJPEG:false,allowAnimation:false});
          if (header.mime !== mime || header.width !== width || header.height !== height) fail('DECODE_FAILED','Encoded image dimensions/type disagree');
          resource = await decodeImageBlob(encoded,signal);cancelled(signal);
          const asset = {id:createId(),mime,width,height,data:base64FromBytes(data)};
          return {asset,resource,bytes:encoded.size};
        } catch(error) {
          resource?.close();if (signal.aborted || disposed) fail('CANCELLED','Image import cancelled');
          if (error instanceof EtchError) throw error;
          fail('DECODE_FAILED','Could not convert image');
        } finally {encoding = false;if (disposed) release();}
      },
    };
  } catch(error) {
    close();if (signal.aborted) fail('CANCELLED','Image import cancelled');
    if (error instanceof EtchError) throw error;
    fail('DECODE_FAILED','Could not prepare image');
  }
}
