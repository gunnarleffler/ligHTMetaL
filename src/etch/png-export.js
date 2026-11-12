import {EtchError,fail} from './errors.js';
import {exportBounds} from './export-bounds.js';
import {PathCache,renderScene} from './rendering/canvas.js';

const finite = n => typeof n === 'number' && Number.isFinite(n);
const object = value => value && typeof value === 'object' && !Array.isArray(value);

/** Pure preflight: no canvas/allocation until bounds, scale and output budgets fit. */
export function planPNG(document,options={},limits={rasterDimension:8192,assetPixels:16_777_216},availablePixels=33_554_432) {
  if (!object(options) || Object.keys(options).some(k => !['bounds','padding','scale'].includes(k))) fail('INVALID_ARGUMENT','PNG options accept bounds, padding and scale only');
  const {padding=16,scale=1} = options;
  if (!finite(padding) || padding < 0 || !finite(scale) || scale <= 0) fail('INVALID_ARGUMENT','PNG padding must be non-negative and scale must be positive finite numbers');
  const bounds = exportBounds(document,{padding,bounds:options.bounds});
  const maximumDimension = Math.min(8192,limits.rasterDimension),maximumPixels = Math.max(0,Math.min(16_777_216,limits.assetPixels,Math.floor(availablePixels/2)));
  const dimensions = s => [Math.max(1,Math.ceil(bounds.width*s)),Math.max(1,Math.ceil(bounds.height*s))];
  const fits = s => {const [w,h] = dimensions(s);return w <= maximumDimension && h <= maximumDimension && w*h <= maximumPixels;};
  if (!fits(scale)) {
    let lo = 0,hi = Math.min(scale,maximumDimension/bounds.width,maximumDimension/bounds.height,Math.sqrt(maximumPixels)/Math.sqrt(bounds.width)/Math.sqrt(bounds.height));
    if (maximumPixels >= 1) for (let i = 0;i < 64;i++) {const mid = lo+(hi-lo)/2;if (fits(mid)) lo = mid;else hi = mid;}
    fail('EXPORT_TOO_LARGE','PNG exceeds available raster limits; reduce scale/bounds or wait for pending raster operations',{maximumDimension,maximumPixels,suggestedScale:lo});
  }
  const [width,height] = dimensions(scale),pan = [-bounds.x*scale,-bounds.y*scale];
  if (!pan.every(finite)) fail('INVALID_ARGUMENT','Export coordinates overflow the output transform');
  return {bounds,width,height,pixels:width*height,view:{zoom:scale,pan}};
}

/** Own separate output canvases. Render synchronously before assets can be replaced;
 * only browser encoding is asynchronous, so load/edit/Undo cannot change the snapshot.
 */
export function createPNGExporter(doc,state) {
  const jobs = new Set();let destroyed = false;
  function dispose(job) {
    if (!jobs.delete(job)) return;
    try {job.canvas.width = job.canvas.height = 0;}finally {job.release();}
  }
  return {
    async exportPNG(options) {
      let captured = state.captureExport();const revision = captured.revision;
      if (destroyed) fail('DESTROYED','This editor has been destroyed');
      if (jobs.size >= 4) fail('BUSY','At most four PNG exports may encode concurrently');
      const plan = planPNG(captured.document,options,captured.limits,captured.availablePixels);
      const release = state.reserveRasterPixels(2*plan.pixels); // Output canvas + the encoder's bitmap snapshot.
      let job;
      try {
        const canvas = doc.createElement('canvas');job = {canvas,release,reject:null};jobs.add(job);
        canvas.width = plan.width;canvas.height = plan.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) fail('EXPORT_TOO_LARGE','Could not allocate PNG canvas; use a lower scale',{suggestedScale:plan.view.zoom/2});
        const cache = new PathCache(doc.defaultView.Path2D,{maxSegments:0,maxEntries:0});
        renderScene(ctx,captured.document,{width:plan.width,height:plan.height,view:plan.view,assets:captured.assets,cache});
        captured = null; // Do not retain old native data/asset-pool references while encoding.
        if (destroyed) fail('CANCELLED','PNG export cancelled by destruction');
        const result = await new Promise((resolve,reject) => {
          job.reject = reject;
          try {
            canvas.toBlob(blob => {
              if (!jobs.has(job)) return;
              if (!blob || blob.type !== 'image/png') reject(new EtchError('DECODE_FAILED','Browser could not encode PNG; try a smaller export'));
              else resolve({blob,revision});
            },'image/png');
          } catch {reject(new EtchError('DECODE_FAILED','Could not encode PNG; check browser canvas/image support'));}
        });
        if (destroyed) fail('CANCELLED','PNG export cancelled by destruction');
        return result;
      } catch(error) {
        if (error instanceof EtchError) throw error;
        fail('DECODE_FAILED','Could not render PNG; check browser canvas/image support');
      } finally {if (job) dispose(job);else release();}
    },
    destroy() {
      if (destroyed) return;destroyed = true;
      for (const job of [...jobs]) {job.reject?.(new EtchError('CANCELLED','PNG export cancelled by destruction'));dispose(job);}
    },
  };
}
