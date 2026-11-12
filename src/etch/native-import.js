import { fail } from './errors.js';
import { createId, referencedAssetIds } from './document.js';
import { validateDocument } from './validation.js';
import { multiply, translate } from './geometry/matrix.js';
import { documentBounds } from './geometry/paths.js';

/** Pure preflight: validate even omitted source data, then validate the complete destination. */
export function planDocumentImport(input,{document,target,center,limits,name='Imported drawing',reservedIds=[],id=createId}) {
  if (!Array.isArray(center) || center.length !== 2 || !Array.from(center).every(Number.isFinite)) fail('INVALID_ARGUMENT','Import center must be a finite pair');
  if (typeof name !== 'string' || !name.length || name.length > 80) fail('INVALID_ARGUMENT','Import name must contain 1–80 characters');
  const source = validateDocument(input,limits),bounds = documentBounds(source);
  const visible = source.layers.filter(l => l.visible),hidden = source.layers.filter(l => !l.visible);
  if (!bounds || bounds.width <= 0 || bounds.height <= 0) fail('EMPTY_IMPORT','Drawing has no visible painted geometry to import');
  const usedIds = new Set(reservedIds);
  for (const d of [document,source]) {
    for (const a of d.assets) usedIds.add(a.id);
    for (const l of d.layers) {usedIds.add(l.id);for (const e of l.elements) usedIds.add(e.id);}
  }
  const fresh = () => {
    for (let i=0;i<16;i++) {const value = id();if (typeof value === 'string' && value.length && !usedIds.has(value)) {usedIds.add(value);return value;}}
    fail('LIMIT_EXCEEDED','Could not allocate a unique imported ID');
  };
  const wanted = referencedAssetIds({layers:visible});
  const assetIds = new Map(),assets = source.assets.filter(a => wanted.has(a.id)).map(a => {const next = fresh();assetIds.set(a.id,next);return {...a,id:next};});
  const elements = visible.flatMap(l => l.elements.map(e => ({...e,id:fresh(),transform:multiply(translate(...l.offset),e.transform),
    ...(e.type === 'image' ? {assetId:assetIds.get(e.assetId)} : {})})));
  const layer = {id:fresh(),name,visible:true,locked:false,offset:center.map((n,i) => n-([bounds.x,bounds.y][i]+[bounds.width,bounds.height][i]/2)),elements};
  const index = document.layers.findIndex(l => l.id === target);
  if (index < 0) fail('CANCELLED','Import insertion layer no longer exists');
  const layers = [...document.layers];layers.splice(index+1,0,layer);
  const retained = referencedAssetIds(document);
  const parsed = validateDocument({...document,layers,assets:[...document.assets.filter(a => retained.has(a.id)),...assets]},limits);
  const imported = parsed.layers[index+1],newIds = new Set(assets.map(a => a.id)),importedAssets = parsed.assets.filter(a => newIds.has(a.id));
  const next = {...document,layers:layers.map(l => l === layer ? imported : l),assets:parsed.assets};
  const warnings = [];
  if (hidden.length) warnings.push({code:'HIDDEN_LAYERS_OMITTED',layers:hidden.map(l => ({id:l.id,name:l.name}))});
  if (source.background !== null) warnings.push({code:'BACKGROUND_OMITTED',...(typeof source.background === 'string' ? {color:source.background} : {background:source.background})});
  return {document:next,layerId:imported.id,assets:importedAssets,
    decodeDocument:{format:'lightmetal-etch',version:1,background:null,layers:[imported],assets:importedAssets},
    summary:{name,visibleLayers:visible.length,hiddenLayers:hidden.length,elements:elements.length,assets:assets.length,
      bounds:{...bounds},warnings},warnings};
}
