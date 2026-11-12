import {EtchError,fail} from './errors.js';
import {DEFAULT_LIMITS} from './validation.js';

/** Bounded UTF-8 file read shared by native JSON UI and SVG import. Native Blob
 * operations bypass per-instance overrides; cancellation closes the stream reader.
 */
export async function readUTF8Blob(value,{maximum,signal,invalidCode,label}) {
  if (!Number.isSafeInteger(maximum) || maximum < 1 || maximum > DEFAULT_LIMITS.jsonBytes) fail('INVALID_ARGUMENT','Invalid text input byte limit');
  const cancelled = () => {if (signal?.aborted) fail('CANCELLED',`${label} import cancelled`);};
  const tooLarge = () => fail('LIMIT_EXCEEDED',`${label} exceeds the input byte limit`,{limit:invalidCode === 'INVALID_SVG' ? 'svgBytes' : 'jsonBytes',maximum});
  cancelled();let size;
  try {size = Object.getOwnPropertyDescriptor(Blob.prototype,'size').get.call(value);}catch {fail('INVALID_ARGUMENT',`${label} input must be a Blob/File`);}
  if (size > maximum) tooLarge();
  const reader = Blob.prototype.stream.call(value).getReader(),decoder = new TextDecoder('utf-8',{fatal:true}),parts = [];let bytes = 0;
  const abort = () => {reader.cancel().catch(() => {});};signal?.addEventListener('abort',abort,{once:true});
  try {
    while (true) {
      cancelled();const {done,value:chunk} = await reader.read();cancelled();if (done) break;
      bytes += chunk.byteLength;if (bytes > maximum) tooLarge();parts.push(decoder.decode(chunk,{stream:true}));
    }
    parts.push(decoder.decode());return parts.join('');
  } catch(error) {
    cancelled();if (error instanceof EtchError) throw error;
    fail(invalidCode,`${label} files must contain valid UTF-8 text`);
  } finally {signal?.removeEventListener('abort',abort);await reader.cancel().catch(() => {});reader.releaseLock();}
}
