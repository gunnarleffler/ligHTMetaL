import { fail } from './errors.js';

export const MAX_IMAGE_BYTES = 20*1024*1024;
/** Decoded size of padded base64; not a syntax validator. */
export const base64ByteLength = data => data.length/4*3-(data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0);
export function bytesFromBase64(data) {
  const out = new Uint8Array(base64ByteLength(data));
  let offset = 0;
  for (let i = 0;i < data.length;i += 32768) {const text = atob(data.slice(i,i+32768));for (let j = 0;j < text.length;j++) out[offset++] = text.charCodeAt(j);}
  return out;
}
export function base64FromBytes(bytes) {
  const chunks = [];for (let i = 0;i < bytes.length;i += 16384) chunks.push(String.fromCharCode(...bytes.subarray(i,i+16384)));
  return btoa(chunks.join(''));
}
/** Header/container checks BEFORE image decoding. A successful browser decode is still required. */
export function inspectRaster(bytes,{code='DECODE_FAILED',allowJPEG=true,allowAnimation=true}={}) {
  const bad = message => fail(code,message),v = new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),text = (i,s) => [...s].every((c,j) => bytes[i+j] === c.charCodeAt(0));
  const finish = (mime,width,height,extra={}) => {if (!width || !height) bad('Image dimensions must be positive');return {mime,width,height,byteLength:bytes.length,...extra};};
  if (bytes.length >= 33 && [137,80,78,71,13,10,26,10].every((n,i) => bytes[i] === n)) {
    if (v.getUint32(8) !== 13 || !text(12,'IHDR')) bad('Invalid PNG header');
    let ended = false,animated = false,count = 0;
    for (let i = 8;i < bytes.length;) {
      if (++count > 10000 || i+12 > bytes.length) bad('Invalid or excessive PNG chunks');
      const length = v.getUint32(i),isEnd = text(i+4,'IEND');if (i+12+length > bytes.length) bad('Truncated PNG chunk');
      if (text(i+4,'IHDR') && i !== 8) bad('PNG must have exactly one IHDR');
      if (text(i+4,'acTL') || text(i+4,'fcTL') || text(i+4,'fdAT')) animated = true;
      i += 12+length;
      if (isEnd) {ended = length === 0 && i === bytes.length;break;}
    }
    if (!ended) bad('PNG has no complete IEND');
    if (animated && !allowAnimation) bad('Animated PNG is not supported; choose a still image');
    return finish('image/png',v.getUint32(16),v.getUint32(20));
  }
  if (bytes.length >= 20 && text(0,'RIFF') && text(8,'WEBP')) {
    if (v.getUint32(4,true)+8 !== bytes.length) bad('WebP container length disagrees with its bytes');
    let dimensions = null,coded = null,animated = false,count = 0;
    for (let i = 12;i < bytes.length;) {
      if (++count > 10000) bad('Too many WebP chunks');
      if (i+8 > bytes.length) bad('Truncated WebP chunk');
      const length = v.getUint32(i+4,true),p = i+8,end = p+length;
      if (end > bytes.length || end+(length%2) > bytes.length) bad('Truncated WebP payload');
      if (text(i,'VP8X')) {
        if (length !== 10 || dimensions || i !== 12) bad('Invalid extended WebP header');
        const u24 = p => bytes[p]+bytes[p+1]*256+bytes[p+2]*65536;
        dimensions = [u24(p+4)+1,u24(p+7)+1];animated ||= Boolean(bytes[p]&2);
      } else if (text(i,'ANIM') || text(i,'ANMF')) animated = true;
      else if (text(i,'VP8 ')) {
        if (length < 10 || (bytes[p]&1) || ![157,1,42].every((n,j) => bytes[p+3+j] === n) || coded) bad('Invalid WebP key frame');
        coded = [v.getUint16(p+6,true)&16383,v.getUint16(p+8,true)&16383];
      } else if (text(i,'VP8L')) {
        if (length < 5 || bytes[p] !== 47 || coded) bad('Invalid lossless WebP header');
        const bits = v.getUint32(p+1,true);if (bits >>> 29) bad('Unsupported lossless WebP version');
        coded = [(bits&16383)+1,((bits>>>14)&16383)+1];
      }
      i = end+(length%2);
    }
    if (animated && !allowAnimation) bad('Animated WebP is not supported; choose a still image');
    if ((!coded && !animated) || (!dimensions && !coded)) bad('WebP has no image');
    if (!animated && dimensions && coded && dimensions.some((n,i) => n !== coded[i])) bad('WebP frame dimensions disagree');
    return finish('image/webp',...(dimensions ?? coded),{animated});
  }
  if (allowJPEG && bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216) {
    let dimensions = null,orientation = 1,segments = 0;
    for (let i = 2;i < bytes.length;) {
      if (++segments > 10000) bad('Too many JPEG header segments');
      if (bytes[i++] !== 255) bad('Invalid JPEG marker');
      while (bytes[i] === 255) i++;
      const marker = bytes[i++];if (marker === 218 || marker === 217) break;
      if (marker === 1 || (marker >= 208 && marker <= 215)) continue;
      if (i+2 > bytes.length) bad('Truncated JPEG segment');
      const length = v.getUint16(i),end = i+length;if (length < 2 || end > bytes.length) bad('Truncated JPEG segment');
      if (marker >= 192 && marker <= 207 && ![196,200,204].includes(marker)) {
        if (length < 8 || dimensions) bad('Invalid or repeated JPEG frame');dimensions = [v.getUint16(i+5),v.getUint16(i+3)];
      }
      if (marker === 225 && length >= 16 && text(i+2,'Exif\0\0')) {
        const t = i+8,little = text(t,'II'),big = text(t,'MM');
        if ((little || big) && v.getUint16(t+2,little) === 42) {
          const at = t+v.getUint32(t+4,little);
          if (at >= t && at+2 <= end) {
            const count = v.getUint16(at,little);
            if (count <= (end-at-2)/12) for (let j = 0;j < count;j++) {
              const p = at+2+j*12;
              if (v.getUint16(p,little) === 274 && v.getUint16(p+2,little) === 3 && v.getUint32(p+4,little) === 1) orientation = v.getUint16(p+8,little);
            }
          }
        }
      }
      i = end;
    }
    if (!dimensions || orientation < 1 || orientation > 8) bad('Invalid JPEG dimensions/orientation');
    return finish('image/jpeg',...dimensions,{orientation});
  }
  bad('Choose a PNG, JPEG or WebP image; SVG and other file types are not accepted');
}
export function imageOptions(options={}) {
  if (!options || typeof options !== 'object' || Array.isArray(options) || Object.keys(options).some(k => !['format','quality'].includes(k))) fail('INVALID_ARGUMENT','Image options accept format and quality only');
  const format = options.format === undefined ? 'webp' : options.format,quality = options.quality === undefined ? 0.8 : options.quality;
  if (!['png','webp'].includes(format) || typeof quality !== 'number' || !Number.isFinite(quality) || quality < 0 || quality > 1) fail('INVALID_ARGUMENT','Image format must be png/webp and quality in [0, 1]');
  return {format,quality};
}
export function checkImageSize(info,limits,retainedPixels=0,extraPixels=0) {
  for (const [actual,maximum,limit] of [[Math.max(info.width,info.height),limits.rasterDimension,'rasterDimension'],[info.width*info.height,limits.assetPixels,'assetPixels'],[retainedPixels+2*info.width*info.height+extraPixels,limits.totalPixels,'totalPixels']]) {
    if (actual > maximum) fail('LIMIT_EXCEEDED','Image exceeds raster safety limits (including temporary and Undo resources)',{limit,maximum,actual});
  }
}
