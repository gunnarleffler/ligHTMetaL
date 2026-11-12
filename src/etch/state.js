import { EtchError, fail } from './errors.js';
import { normalizeBackground } from './background.js';
import { validateDocument, resolveLimits } from './validation.js';
import { createId, emptyDocument, emptyLayer, freezeDocument, preferredLayer, referencedAssetIds, snapshot } from './document.js';
import { History } from './history.js';
import { Emitter } from './events.js';
import { AssetPool, decodeAssets } from './assets.js';
import { base64ByteLength } from './raster.js';
import { multiply, translate } from './geometry/matrix.js';
import { elementBounds, unionBounds } from './geometry/paths.js';
import { lineFragments } from './geometry/line-cut.js';
import { planDocumentImport } from './native-import.js';

const EVENT_NAMES = ['change', 'load', 'viewchange', 'selectionchange', 'historychange', 'error'];

/** DOM-independent committed-state controller. The browser facade owns view/input. */
export class EditorState {
  #document = freezeDocument(emptyDocument());
  #active = preferredLayer(this.#document);
  #selection = [];
  #session = createId();
  #sequence = 0;
  #destroyed = false;
  #pending = null;
  #pool = new AssetPool();
  #history;
  #events;
  #decode;
  #limits;
  #readOnly;
  #rasterReservations = new Map();
  constructor({ readOnly = false, limits = {}, history = {}, decode = decodeAssets, reportError } = {}) {
    if (typeof readOnly !== 'boolean') fail('INVALID_ARGUMENT', 'readOnly must be boolean');
    this.#readOnly = readOnly;
    this.#limits = resolveLimits(limits);
    this.#history = new History(history);
    this.#events = new Emitter(reportError);
    this.#decode = decode;
  }
  #alive() { if (this.#destroyed) fail('DESTROYED', 'This editor has been destroyed'); }
  #editable() {
    this.#alive();
    if (this.#readOnly) fail('READ_ONLY', 'This editor is read-only');
    if (this.#pending) fail('BUSY', 'A document operation is pending');
  }
  #run(action, content = true) {
    if (content) this.#editable(); else this.#alive();
    if (this.#events.dispatching) { this.#events.defer(() => this.#run(action, content)); return; }
    return action();
  }
  #layer(id) {
    const layer = this.#document.layers.find(l => l.id === id);
    if (!layer) fail('INVALID_ARGUMENT', 'Unknown layer ID');
    return layer;
  }
  #unlocked(id, geometry = false) {
    const layer = this.#layer(id);
    if (layer.locked || (geometry && !layer.visible)) fail('LAYER_NOT_EDITABLE', 'Layer must be visible and unlocked for geometry edits, and unlocked for structural edits');
    return layer;
  }
  #selectionPayload() { return { activeLayerId: this.#active, elementIds: [...this.#selection] }; }
  #reconcile() {
    if (!this.#document.layers.some(l => l.id === this.#active)) this.#active = preferredLayer(this.#document);
    const layer = this.#layer(this.#active);
    if (!layer.visible || layer.locked) {this.#selection = [];return;}
    if (!this.#selection.length) return;
    const elementIds = new Set(layer.elements.map(e => e.id));
    this.#selection = this.#selection.filter(id => elementIds.has(id));
  }
  #retain() { this.#pool.retain([this.#document, ...this.#history.documents()]); }
  #commit(next, label, { active = this.#active, clearSelection = false, source = 'edit' } = {}) {
    if (next === this.#document) return;
    // Validate the entire destination but keep structural sharing in trusted commands.
    validateDocument(next, this.#limits);
    const beforeSelection = JSON.stringify(this.#selectionPayload());
    const before = this.#document,activeBefore = this.#active;
    this.#document = freezeDocument(next);
    this.#active = active;
    if (clearSelection) this.#selection = [];
    this.#reconcile();
    this.#history.push(before, this.#document, label,this.#active === activeBefore ? {} : {activeBefore,activeAfter:this.#active});
    this.#sequence++;
    this.#retain();
    const events = [['change', { revision: this.getRevision(), label, source }],
      ['historychange', this.#history.getState()]];
    if (beforeSelection !== JSON.stringify(this.#selectionPayload())) events.push(['selectionchange', this.#selectionPayload()]);
    this.#events.emitBatch(events);
  }
  #replaceLayer(id, replacement, label, options) {
    this.#commit({ ...this.#document, layers: this.#document.layers.map(l => l.id === id ? replacement : l) }, label, options);
  }
  get document() { this.#alive(); return this.#document; }
  get busy() { this.#alive(); return this.#pending !== null; }
  get readOnly() { this.#alive(); return this.#readOnly; }
  get assets() { this.#alive(); return this.#pool; }
  getRevision() { this.#alive(); return `${this.#session}:${this.#sequence}`; }
  getActiveLayer() { this.#alive(); return this.#active; }
  getSelection() { this.#alive(); return [...this.#selection]; }
  save() { this.#alive(); return snapshot(this.#document); }
  canUndo() { this.#alive(); return this.#history.getState().canUndo; }
  canRedo() { this.#alive(); return this.#history.getState().canRedo; }
  on(name, callback) {
    this.#alive();
    if (!EVENT_NAMES.includes(name) || typeof callback !== 'function') fail('INVALID_ARGUMENT', 'Unknown event or invalid listener');
    return this.#events.on(name, callback);
  }
  // Let browser-owned session mutations respect the same reentrant event boundary.
  runSession(action) { return this.#run(action,false); }
  async runSessionAsync(action) {
    this.#alive();
    if (this.#events.dispatching) return new Promise((resolve,reject) => {
      this.#events.defer(() => this.runSessionAsync(action).then(resolve,reject),reject);
    });
    return action();
  }
  notifyViewChange(view) {
    this.#run(() => this.#events.emitBatch([['viewchange', view]]), false);
  }
  notifyUIError(error) {
    this.#run(() => this.#events.emitBatch([['error', { code: error.code, message: error.message, details: error.details }]]), false);
  }
  async load(input) {
    this.#alive();
    if (this.#events.dispatching) return new Promise((resolve, reject) => {
      this.#events.defer(() => this.load(input).then(resolve, reject),reject);
    });
    this.cancel();
    const controller = new AbortController();
    this.#pending = controller;
    let pool,releasePixels;
    try {
      const next = freezeDocument(validateDocument(input, this.#limits));
      const pixels = next.assets.reduce((sum,asset) => sum+asset.width*asset.height,0);
      if (pixels) releasePixels = this.reserveRasterPixels(pixels);
      pool = await this.#decode(next, controller.signal);
      if (controller.signal.aborted || this.#destroyed || this.#pending !== controller) fail('CANCELLED', 'Document load was superseded or cancelled');
      this.#pool.dispose();
      this.#pool = pool; pool = null;
      this.#document = next;
      this.#active = preferredLayer(next); this.#selection = [];
      this.#history.clear(); this.#sequence++;
      this.#pending = null;
      this.#retain();
      this.#events.emitBatch([
        ['load', { revision: this.getRevision() }],
        ['historychange', this.#history.getState()],
        ['selectionchange', this.#selectionPayload()],
      ]);
    } catch (error) {
      pool?.dispose();
      if (controller.signal.aborted) fail('CANCELLED', 'Document load was superseded or cancelled');
      throw error;
    } finally {
      releasePixels?.();if (this.#pending === controller) this.#pending = null;
    }
  }
  #retainedImages() {
    const assets = new Map();
    for (const doc of [this.#document,...this.#history.documents()]) {
      const used = referencedAssetIds(doc);
      for (const a of doc.assets) if (used.has(a.id)) assets.set(a.id,a);
    }
    let bytes = 0,pixels = 0;
    for (const a of assets.values()) {bytes += base64ByteLength(a.data);pixels += a.width*a.height;}
    return {count:assets.size,bytes,pixels};
  }
  /** Internal transient pixel ledger shared by import surfaces and PNG export jobs. */
  availableRasterPixels() {
    this.#alive();let reserved = 0;for (const pixels of this.#rasterReservations.values()) reserved += pixels;
    return Math.max(0,this.#limits.totalPixels-this.#retainedImages().pixels-reserved);
  }
  reserveRasterPixels(pixels) {
    this.#alive();
    if (!Number.isSafeInteger(pixels) || pixels < 1) fail('INVALID_ARGUMENT','Raster reservation must be positive integer pixels');
    const available = this.availableRasterPixels();
    if (pixels > available) fail('LIMIT_EXCEEDED','Raster safety allowance is in use by artwork, Undo history or pending operations',{limit:'totalPixels',maximum:this.#limits.totalPixels,available,requested:pixels});
    const key = Symbol();this.#rasterReservations.set(key,pixels);
    return () => this.#rasterReservations.delete(key);
  }
  captureVectorExport() {
    this.#alive();return {document:this.#document,revision:this.getRevision(),limits:{...this.#limits}};
  }
  captureExport() {
    this.#alive();return {document:this.#document,revision:this.getRevision(),assets:this.#pool,
      limits:{...this.#limits},availablePixels:this.availableRasterPixels()};
  }
  async beginImageImport(center) {
    this.#editable();
    if (this.#events.dispatching) return new Promise((resolve,reject) => this.#events.defer(() => this.beginImageImport(center).then(resolve,reject),reject));
    if (!Array.isArray(center) || center.length !== 2 || Array.from(center).some(n => !Number.isFinite(n))) fail('INVALID_ARGUMENT','Import center must be a finite pair');
    const retained = this.#retainedImages();
    if (retained.count >= this.#limits.assets) fail('LIMIT_EXCEEDED','Image asset limit reached, including Undo history',{limit:'assets',maximum:this.#limits.assets});
    if (this.#document.layers.length >= this.#limits.layers) fail('LIMIT_EXCEEDED','Layer limit reached',{limit:'layers',maximum:this.#limits.layers});
    const controller = new AbortController();this.#pending = controller;
    return {document:this.#document,target:this.#active,center:[...center],layerId:createId(),elementId:createId(),controller,signal:controller.signal,limits:{...this.#limits},retained,reservePixels:pixels => this.reserveRasterPixels(pixels)};
  }
  #imageDestination(context,asset,name) {
    this.#alive();
    if (context.signal.aborted || this.#pending !== context.controller || context.document !== this.#document) fail('CANCELLED','Image import baseline changed or cancelled');
    this.#name(name);
    const retained = this.#retainedImages(),bytes = typeof asset?.data === 'string' ? base64ByteLength(asset.data) : 0;
    if (retained.bytes+bytes > this.#limits.assetBytes || retained.pixels+asset?.width*asset?.height > this.#limits.totalPixels) fail('LIMIT_EXCEEDED','Image exceeds retained resource allowance');
    const layer = {id:context.layerId,name,visible:true,locked:false,offset:[...context.center],elements:[{id:context.elementId,type:'image',transform:[1,0,0,1,0,0],assetId:asset?.id,x:-asset?.width/2,y:-asset?.height/2,width:asset?.width,height:asset?.height,alt:name}]};
    const layers = [...this.#document.layers];layers.splice(layers.findIndex(l => l.id === context.target)+1,0,layer);
    const used = referencedAssetIds(this.#document);
    const next = {...this.#document,layers,assets:[...this.#document.assets.filter(a => used.has(a.id)),asset]};
    const parsed = validateDocument(next,this.#limits);
    return {...next,layers:layers.map(l => l === layer ? parsed.layers.find(p => p.id === l.id) : l),assets:parsed.assets};
  }
  previewImageImport(context,asset,name='Image') {this.#imageDestination(context,asset,name);}
  async commitImageImport(context,asset,resource,name='Image') {
    if (this.#events.dispatching) return new Promise((resolve,reject) => this.#events.defer(
      () => this.commitImageImport(context,asset,resource,name).then(resolve,reject),
      error => {try {resource?.close?.();}finally {reject(error);}}));
    let added = false;
    try {
      const next = this.#imageDestination(context,asset,name);
      if (!resource || typeof resource.close !== 'function' || !resource.image) fail('INVALID_ARGUMENT','Image import needs an owned decoded resource');
      this.#pool.add(asset.id,resource);added = true;this.#pending = null;
      const revision = `${this.#session}:${this.#sequence+1}`;
      this.#commit(next,'Import image',{active:context.layerId,clearSelection:true,source:'import'});
      return {layerId:context.layerId,revision,warnings:[]};
    } catch (error) {
      if (added) this.#retain();else resource?.close?.();
      if (this.#pending === context.controller) {context.controller.abort();this.#pending = null;}
      throw error;
    }
  }
  cancelImageImport(context) {
    if (this.#pending === context.controller) {context.controller.abort();this.#pending = null;}
  }
  #beginDocumentImport(center) {
    if (!Array.isArray(center) || center.length !== 2 || !Array.from(center).every(Number.isFinite)) fail('INVALID_ARGUMENT','Import center must be a finite pair');
    if (this.#document.layers.length >= this.#limits.layers) fail('LIMIT_EXCEEDED','Layer limit reached',{limit:'layers',maximum:this.#limits.layers});
    const controller = new AbortController();this.#pending = controller;
    const context = {document:this.#document,target:this.#active,center:[...center],controller,signal:controller.signal,
      limits:{...this.#limits},plan:null,pool:null,release:null,decoding:false,started:false};
    context.dispose = () => {context.pool?.dispose();context.pool = null;context.plan = null;if (!context.decoding) {context.release?.();context.release = null;}};
    controller.signal.addEventListener('abort',context.dispose,{once:true});
    return context;
  }
  async beginDocumentImport(center) {
    this.#editable();
    if (this.#events.dispatching) return new Promise((resolve,reject) => this.#events.defer(() => this.beginDocumentImport(center).then(resolve,reject),reject));
    return this.#beginDocumentImport(center);
  }
  #checkDocumentImport(context) {
    if (context.signal.aborted || this.#destroyed || this.#pending !== context.controller || context.document !== this.#document) fail('CANCELLED','Drawing import baseline changed or cancelled');
  }
  async prepareDocumentImport(context,input,name='Imported drawing') {
    this.#checkDocumentImport(context);
    if (context.started) fail('BUSY','Drawing import is already prepared or preparing');
    context.started = true;let pool;
    try {
      const reservedIds = new Set();
      for (const d of [this.#document,...this.#history.documents()]) {
        for (const a of d.assets) reservedIds.add(a.id);
        for (const l of d.layers) {reservedIds.add(l.id);for (const e of l.elements) reservedIds.add(e.id);}
      }
      // This runs before the first await, detaching object input from subsequent caller edits.
      const plan = freezeDocument(planDocumentImport(input,{document:context.document,target:context.target,center:context.center,
        limits:this.#limits,name,reservedIds}));
      const retained = this.#retainedImages(),bytes = plan.assets.reduce((sum,a) => sum+base64ByteLength(a.data),0);
      if (retained.count+plan.assets.length > this.#limits.assets || retained.bytes+bytes > this.#limits.assetBytes) fail('LIMIT_EXCEEDED','Drawing exceeds image allowance including Undo history');
      const pixels = plan.assets.reduce((sum,a) => sum+a.width*a.height,0);
      if (pixels) context.release = this.reserveRasterPixels(pixels);
      context.decoding = true;pool = await this.#decode(plan.decodeDocument,context.signal);
      this.#checkDocumentImport(context);context.pool = pool;pool = null;context.plan = plan;
      return structuredClone(plan.summary);
    } catch(error) {
      const cancelled = context.signal.aborted || this.#destroyed || this.#pending !== context.controller;
      this.cancelDocumentImport(context);
      if (cancelled) fail('CANCELLED','Drawing import cancelled');
      throw error;
    } finally {
      pool?.dispose();context.decoding = false;
      if (!context.pool) {context.release?.();context.release = null;}
    }
  }
  async commitDocumentImport(context) {
    if (this.#events.dispatching) return new Promise((resolve,reject) => this.#events.defer(() => this.commitDocumentImport(context).then(resolve,reject),reject));
    let transferred = false;
    try {
      this.#checkDocumentImport(context);
      if (!context.plan || !context.pool) fail('INVALID_ARGUMENT','Drawing import has no ready summary');
      const {document,layerId,warnings} = context.plan,result = {layerId,revision:`${this.#session}:${this.#sequence+1}`,warnings:structuredClone(warnings)};
      // The shared pixel reservation is held through decoding/confirmation. Release only
      // at this synchronous handoff, before event listeners can start other raster jobs.
      context.pool.transferTo(this.#pool);transferred = true;context.pool = null;context.release?.();context.release = null;
      this.#pending = null;
      this.#commit(document,'Import drawing',{active:layerId,clearSelection:true,source:'import'});
      context.plan = null;return result;
    } catch(error) {
      if (transferred) this.#retain();this.cancelDocumentImport(context);throw error;
    }
  }
  cancelDocumentImport(context) {
    if (this.#pending === context.controller) {this.#pending = null;context.controller.abort();}
    context.dispose();
  }
  async importDocument(input,center) {
    this.#editable();
    if (this.#events.dispatching) return new Promise((resolve,reject) => this.#events.defer(() => this.importDocument(input,center).then(resolve,reject),reject));
    const context = this.#beginDocumentImport(center);
    try {await this.prepareDocumentImport(context,input);return await this.commitDocumentImport(context);}
    finally {this.cancelDocumentImport(context);}
  }
  cancel() {
    this.#alive();
    this.#pending?.abort();
    this.#pending = null;
  }
  setActiveLayer(id) {
    return this.#run(() => {
      this.#layer(id);
      if (id === this.#active) return;
      this.#active = id; this.#selection = [];
      this.#events.emitBatch([['selectionchange', this.#selectionPayload()]]);
    }, false);
  }
  setSelection(ids) {
    return this.#run(() => {
      const layer = this.#layer(this.#active);
      const uniqueArray = Array.isArray(ids) && new Set(ids).size === ids.length;
      const elementIds = new Set(uniqueArray && ids.length ? layer.elements.map(e => e.id) : []);
      if (!uniqueArray || ids.some(id => !elementIds.has(id))) fail('INVALID_ARGUMENT', 'Selection IDs must exist uniquely in the active layer');
      if (ids.length && (!layer.visible || layer.locked)) fail('LAYER_NOT_EDITABLE', 'Selection requires an editable layer');
      if (JSON.stringify(ids) === JSON.stringify(this.#selection)) return;
      this.#selection = [...ids];
      this.#events.emitBatch([['selectionchange', this.#selectionPayload()]]);
    }, false);
  }
  createLayer({ name } = {}) {
    const layer = emptyLayer();
    this.#run(() => {
      if (name === undefined) {
        let n = 1;
        while (this.#document.layers.some(l => l.name === `Layer ${n}`)) n++;
        layer.name = `Layer ${n}`;
      } else {
        this.#name(name); layer.name = name;
      }
      const layers = [...this.#document.layers];
      layers.splice(layers.findIndex(l => l.id === this.#active)+1, 0, layer);
      this.#commit({ ...this.#document, layers }, 'New layer', { active: layer.id, clearSelection: true });
    });
    return layer.id;
  }
  #name(name) {
    if (typeof name !== 'string' || name.length < 1 || name.length > 80) fail('INVALID_ARGUMENT', 'Layer name must contain 1–80 characters');
  }
  renameLayer(id, name) {
    return this.#run(() => {
      this.#name(name); const layer = this.#unlocked(id);
      if (layer.name !== name) this.#replaceLayer(id, { ...layer, name }, 'Rename layer');
    });
  }
  setLayerVisibility(id, visible) { return this.#setLayerFlag(id, 'visible', visible, 'Layer visibility'); }
  setLayerLocked(id, locked) { return this.#setLayerFlag(id, 'locked', locked, 'Layer lock'); }
  #setLayerFlag(id, key, value, label) {
    return this.#run(() => {
      if (typeof value !== 'boolean') fail('INVALID_ARGUMENT', 'Expected boolean layer state');
      const layer = this.#layer(id);
      if (layer[key] !== value) this.#replaceLayer(id, { ...layer, [key]: value }, label, { clearSelection: true });
    });
  }
  reorderLayer(id, index) {
    return this.#run(() => {
      const layer = this.#unlocked(id), layers = [...this.#document.layers];
      if (!Number.isInteger(index) || index < 0 || index >= layers.length) fail('INVALID_ARGUMENT', 'Layer index is out of range');
      const old = layers.indexOf(layer);
      if (old === index) return;
      layers.splice(old, 1); layers.splice(index, 0, layer);
      this.#commit({ ...this.#document, layers }, 'Reorder layer', { clearSelection: true });
    });
  }
  deleteLayer(id) {
    return this.#run(() => {
      this.#unlocked(id);
      const oldIndex = this.#document.layers.findIndex(l => l.id === id);
      const layers = this.#document.layers.filter(l => l.id !== id);
      if (!layers.length) layers.push(emptyLayer());
      const active = this.#active === id ? layers[Math.min(oldIndex, layers.length-1)].id : this.#active;
      this.#commit({ ...this.#document, layers }, 'Delete layer', { active, clearSelection: true });
    });
  }
  translateLayer(id, delta) {
    return this.#run(() => {
      const next = this.#translatedLayer(this.#unlocked(id,true),delta);
      if (next) this.#replaceLayer(id,next,'Move layer');
    });
  }
  rotateLayer(id = this.#active) {
    return this.#run(() => this.#rotateElements(this.#unlocked(id,true),null,'Rotate layer'));
  }
  rotateSelection() {
    return this.#run(() => this.#rotateElements(this.#unlocked(this.#active,true),new Set(this.#selection),'Rotate selection'));
  }
  #rotateElements(layer,ids,label) {
    let bounds = null;
    for (const element of layer.elements) if (!ids || ids.has(element.id)) bounds = unionBounds(bounds,elementBounds(element));
    if (!bounds) return;
    const cx = bounds.x+bounds.width/2,cy = bounds.y+bounds.height/2;
    // Exact quarter-turn in downward-positive coordinates, around layer-local painted bounds.
    const rotation = [0,1,-1,0,cx+cy,cy-cx];
    const elements = layer.elements.map(e => !ids || ids.has(e.id) ? {...e,transform:multiply(rotation,e.transform).map(n => n === 0 ? 0 : n)} : e);
    this.#replaceLayer(layer.id,{...layer,elements},label);
  }
  #translatedLayer(layer,delta) {
    if (!Array.isArray(delta) || delta.length !== 2 || Array.from(delta).some(n => typeof n !== 'number' || !Number.isFinite(n))) fail('INVALID_ARGUMENT','Translation must be a finite [dx, dy] pair');
    const offset = layer.offset.map((n,i) => n+delta[i]);
    return offset.every((n,i) => n === layer.offset[i]) ? null : {...layer,offset};
  }
  /** Internal whole-layer gesture seam. Never rewrite element geometry/matrices. */
  prepareLayerMove() {
    this.#editable();
    return {document:this.#document,layer:this.#unlocked(this.#active,true),tool:'move-layer'};
  }
  #layerMoveDestination(context,delta) {
    this.#editable();
    if (context.document !== this.#document || context.layer.id !== this.#active) fail('CANCELLED','Layer move baseline changed');
    const layer = this.#translatedLayer(this.#unlocked(this.#active,true),delta);
    if (!layer) return null;
    const next = {...this.#document,layers:this.#document.layers.map(l => l.id === layer.id ? layer : l)};
    // Validate full painted world bounds, offset and combined JSON/resource budgets,
    // including hidden layers/assets, while retaining immutable element identities.
    const parsed = validateDocument(next,this.#limits);
    return {...layer,offset:parsed.layers.find(l => l.id === layer.id).offset};
  }
  previewLayerMove(context,delta) {
    const layer = this.#layerMoveDestination(context,delta);
    return layer ? {layerId:layer.id,offset:[...layer.offset],elements:layer.elements} : null;
  }
  commitLayerMove(context,delta) {
    return this.#run(() => {
      const layer = this.#layerMoveDestination(context,delta);
      if (layer) this.#replaceLayer(layer.id,layer,'Move layer');
    });
  }
  /** Selection movement shares the immutable document baseline and full destination validation. */
  prepareSelectionMove() {
    this.#editable();
    return {document:this.#document,layer:this.#unlocked(this.#active,true),ids:this.getSelection(),tool:'select'};
  }
  #selectionMoveDestination(context,delta) {
    if (!Array.isArray(delta) || delta.length !== 2 || !Array.from(delta).every(Number.isFinite)) fail('INVALID_ARGUMENT','Translation must be a finite pair');
    return this.#selectionTransformDestination(context,translate(...delta));
  }
  #selectionTransformDestination(context,matrix) {
    this.#editable();
    if (context.document !== this.#document || context.layer.id !== this.#active) fail('CANCELLED','Selection baseline changed');
    if (!Array.isArray(matrix) || matrix.length !== 6 || !Array.from(matrix).every(Number.isFinite)
      || matrix[0] <= 0 || matrix[3] <= 0 || matrix[1] !== 0 || matrix[2] !== 0) fail('INVALID_ARGUMENT','Selection transform requires positive axis scales and finite translation');
    if (!context.ids.length || matrix.every((n,i) => n === [1,0,0,1,0,0][i])) return null;
    const ids = new Set(context.ids),layer = this.#unlocked(this.#active,true);
    const next = {...layer,elements:layer.elements.map(e => ids.has(e.id) ? {...e,transform:multiply(matrix,e.transform)} : e)};
    validateDocument({...this.#document,layers:this.#document.layers.map(l => l.id === layer.id ? next : l)},this.#limits);
    return next;
  }
  previewSelectionMove(context,delta) {
    const layer = this.#selectionMoveDestination(context,delta);
    return layer ? {layerId:layer.id,elements:layer.elements} : null;
  }
  commitSelectionMove(context,delta) {
    return this.#run(() => {
      const layer = this.#selectionMoveDestination(context,delta);
      if (layer) this.#replaceLayer(layer.id,layer,'Move selection');
    });
  }
  previewSelectionResize(context,matrix) {
    const layer = this.#selectionTransformDestination(context,matrix);
    return layer ? {layerId:layer.id,elements:layer.elements} : null;
  }
  commitSelectionResize(context,matrix) {
    return this.#run(() => {
      const layer = this.#selectionTransformDestination(context,matrix);
      if (layer) this.#replaceLayer(layer.id,layer,'Resize selection');
    });
  }
  mergeDown(id = this.#active) {
    this.#editable();
    const initialIndex = this.#document.layers.findIndex(l => l.id === id);
    const surviving = this.#document.layers[initialIndex-1]?.id;
    this.#run(() => {
      const upper = this.#unlocked(id, true);
      const layers = [...this.#document.layers], index = layers.indexOf(upper);
      if (!index) fail('INVALID_ARGUMENT', 'There is no lower layer to merge into');
      const lower = this.#unlocked(layers[index-1].id, true);
      const offset = translate(upper.offset[0]-lower.offset[0], upper.offset[1]-lower.offset[1]);
      const elements = [...lower.elements, ...upper.elements.map(e => ({ ...e, transform: multiply(offset, e.transform) }))];
      layers.splice(index-1, 2, { ...lower, elements });
      this.#commit({ ...this.#document, layers }, 'Merge down', { active: lower.id, clearSelection: true });
    });
    return surviving;
  }
  /** Internal removal seam: no stored point/element capacity is required. */
  prepareErase(mode = 'object') {
    this.#editable();
    if (!['object','partial'].includes(mode)) fail('INVALID_ARGUMENT','Unknown eraser mode');
    return {document:this.#document,layer:this.#unlocked(this.#active,true),tool:'eraser',mode,maxSamples:this.#limits.pointsPerElement};
  }
  #eraseLayer(context,mode) {
    this.#editable();
    if (context.document !== this.#document || context.layer.id !== this.#active) fail('CANCELLED','Eraser baseline changed');
    if (context.mode !== mode) fail('INVALID_ARGUMENT','Eraser mode does not match its baseline');
    return this.#unlocked(this.#active,true);
  }
  #eraseDestination(context,ids) {
    const layer = this.#eraseLayer(context,'object');
    if (!Array.isArray(ids) || Array.from(ids).some(id => typeof id !== 'string') || new Set(ids).size !== ids.length) fail('INVALID_ARGUMENT','Eraser IDs must be a unique array');
    const removed = new Set(ids);
    for (const e of layer.elements) removed.delete(e.id);
    if (removed.size) fail('INVALID_ARGUMENT','Eraser can only remove active-layer elements');
    if (!ids.length) return null;
    const hits = new Set(ids),next = {...layer,elements:layer.elements.filter(e => !hits.has(e.id))};
    validateDocument({...this.#document,layers:this.#document.layers.map(l => l === layer ? next : l)},this.#limits);
    return next;
  }
  previewErase(context,ids) {
    const layer = this.#eraseDestination(context,ids);
    return layer ? {layerId:layer.id,elements:layer.elements} : null;
  }
  commitErase(context,ids) {
    return this.#run(() => {
      const layer = this.#eraseDestination(context,ids);
      if (layer) this.#replaceLayer(layer.id,layer,'Erase objects');
    });
  }
  #partialEraseDestination(context,changes) {
    const layer = this.#eraseLayer(context,'partial');
    if (!Array.isArray(changes)) fail('INVALID_ARGUMENT','Partial eraser changes must be an array');
    const replacements = new Map(),originals = new Map(layer.elements.map(e => [e.id,e]));
    const oldIds = new Set(this.#document.assets.map(a => a.id));
    for (const l of this.#document.layers) {oldIds.add(l.id);for (const e of l.elements) oldIds.add(e.id);}
    for (const change of Array.from(changes)) {
      if (!change || typeof change !== 'object' || replacements.has(change.id) || !['line','stroke','ink'].includes(originals.get(change.id)?.type)) fail('INVALID_ARGUMENT','Partial eraser can only replace unique active-layer lines or ink');
      const original = originals.get(change.id);let pieces;
      if (original.type === 'line') pieces = lineFragments(original,change.ranges,change.ids);
      else {
        if (!Array.isArray(change.groups) || !Array.isArray(change.ids) || change.groups.length !== change.ids.length || Array.from(change.ids).some(id => typeof id !== 'string' || !id) || new Set(change.ids).size !== change.ids.length || (change.ids.length && change.ids[0] !== original.id)) fail('INVALID_ARGUMENT','Invalid partial ink identities');
        if (change.groups.length > this.#limits.elements) fail('LIMIT_EXCEEDED','Too many ink pieces',{limit:'elements',maximum:this.#limits.elements});
        pieces = Array.from(change.groups,(parts,i) => ({id:change.ids[i],type:'ink',transform:original.transform,color:original.color,parts}));
      }
      if (change.ids.slice(1).some(id => oldIds.has(id))) fail('INVALID_ARGUMENT','New eraser pieces require fresh IDs');
      replacements.set(original.id,pieces);
    }
    const changed = [...replacements].some(([id,pieces]) => pieces.length !== 1 || pieces[0] !== originals.get(id));
    if (!changed) return null;
    const next = {...layer,elements:layer.elements.flatMap(e => replacements.get(e.id) ?? [e])};
    const parsed = validateDocument({...this.#document,layers:this.#document.layers.map(l => l === layer ? next : l)},this.#limits);
    const canonical = new Map(parsed.layers.find(l => l.id === layer.id).elements.map(e => [e.id,e]));
    // Canonicalize new ink without replacing any surviving immutable baseline identity.
    const fresh = new Set([...replacements.values()].flat().filter(e => e.type === 'ink'));
    return {...next,elements:next.elements.map(e => fresh.has(e) ? canonical.get(e.id) : e)};
  }
  previewPartialErase(context,changes) {
    const layer = this.#partialEraseDestination(context,changes);
    return layer ? {layerId:layer.id,elements:layer.elements} : null;
  }
  commitPartialErase(context,changes) {
    return this.#run(() => {
      const layer = this.#partialEraseDestination(context,changes);
      if (layer) this.#replaceLayer(layer.id,layer,changes.some(c => c.groups) ? 'Partially erase ink' : 'Partially erase lines');
    });
  }
  /** Internal append gesture seam; Arrow paths consume stored command slots. */
  prepareDrawing(tool) {
    if (!['pen','highlighter','line','arrow','rect','ellipse'].includes(tool)) fail('INVALID_ARGUMENT','Unimplemented drawing tool');
    this.#editable();
    const layer = this.#unlocked(this.#active,true);
    let points = 0, elements = 0;
    for (const l of this.#document.layers) for (const e of l.elements) {
      elements++; points += ['stroke','highlight'].includes(e.type) ? e.points.length : e.type === 'path' ? e.commands.length : e.type === 'ink' ? e.parts.reduce((n,p) => n+p.length,0) : 0;
    }
    if (elements >= this.#limits.elements) fail('LIMIT_EXCEEDED','Element limit reached',{limit:'elements',maximum:this.#limits.elements});
    const maxPoints = Math.min(this.#limits.pointsPerElement,this.#limits.points-points);
    if (['pen','highlighter'].includes(tool) && maxPoints < 1) fail('LIMIT_EXCEEDED','Document sample limit reached',{limit:'points',maximum:this.#limits.points});
    const limit = this.#limits.points-points < this.#limits.pointsPerElement ? 'points' : 'pointsPerElement';
    return {document:this.#document,layer,tool,maxPoints,sampleLimit:{limit,maximum:this.#limits[limit]}};
  }
  #drawingDestination(context,element) {
    this.#editable();
    if (context.document !== this.#document || context.layer.id !== this.#active) fail('CANCELLED','Drawing baseline changed');
    const layer = this.#unlocked(this.#active,true);
    if (element === null) return null; // A below-threshold shape is a true no-op.
    if (element.type !== (context.tool === 'pen' ? 'stroke' : context.tool === 'highlighter' ? 'highlight' : context.tool === 'arrow' ? 'path' : context.tool)) fail('INVALID_ARGUMENT','Element does not match the gesture tool');
    const next = {...this.#document,layers:this.#document.layers.map(l => l === layer ? {...l,elements:[...l.elements,element]} : l)};
    // Canonicalize new input rather than trusting pointer/controller data. Validate
    // the combined destination (including assets/JSON/derived budgets), not a fragment.
    const parsed = validateDocument(next,this.#limits);
    return parsed.layers.find(l => l.id === layer.id).elements.at(-1);
  }
  previewDrawing(context,element) {
    const canonical = this.#drawingDestination(context,element);
    return canonical ? {layerId:context.layer.id,elements:[...context.layer.elements,canonical]} : null;
  }
  commitDrawing(context,element) {
    return this.#run(() => {
      const canonical = this.#drawingDestination(context,element),layer = context.layer;
      if (!canonical) return;
      const label = {pen:'Pen stroke',highlighter:'Highlighter stroke',line:'Draw line',arrow:'Draw arrow',rect:'Draw rectangle',ellipse:'Draw ellipse'}[context.tool];
      this.#replaceLayer(layer.id,{...layer,elements:[...layer.elements,canonical]},label,{clearSelection:true});
    });
  }
  deleteSelection() {
    return this.#run(() => {
      const ids = new Set(this.#selection);
      if (!ids.size) return;
      const layer = this.#unlocked(this.#active, true);
      this.#replaceLayer(layer.id, { ...layer, elements: layer.elements.filter(e => !ids.has(e.id)) }, 'Delete selection', { clearSelection: true });
    });
  }
  setBackground(value) {
    return this.#run(() => {
      const background = normalizeBackground(value,'INVALID_ARGUMENT',true);
      if (JSON.stringify(background) !== JSON.stringify(this.#document.background)) this.#commit({ ...this.#document, background }, 'Background');
    });
  }
  undo() { return this.#stepHistory('undo'); }
  redo() { return this.#stepHistory('redo'); }
  #stepHistory(source) {
    return this.#run(() => {
      const entry = this.#history[source]();
      if (!entry) return;
      const oldSelection = JSON.stringify(this.#selectionPayload());
      this.#document = source === 'undo' ? entry.before : entry.after;
      this.#active = (source === 'undo' ? entry.activeBefore : entry.activeAfter) ?? this.#active;
      this.#reconcile(); this.#sequence++; this.#retain();
      const events = [['change', { revision: this.getRevision(), label: entry.label, source }], ['historychange', this.#history.getState()]];
      if (oldSelection !== JSON.stringify(this.#selectionPayload())) events.push(['selectionchange', this.#selectionPayload()]);
      this.#events.emitBatch(events);
    });
  }
  destroy() {
    if (this.#destroyed) return;
    this.cancel(); this.#destroyed = true;
    this.#events.clear(new EtchError('CANCELLED','Queued operation cancelled by destruction')); this.#history.clear(); this.#pool.dispose();
    // Drop the final reference to potentially large native data, even if facade is retained.
    this.#document = null; this.#selection = [];this.#rasterReservations.clear();
  }
}
