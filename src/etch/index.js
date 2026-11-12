import { EditorState } from './state.js';
import { EtchError, fail } from './errors.js';
import { createShell } from './ui/shell.js';
import { Viewport } from './viewport.js';
import { createFullscreen } from './fullscreen.js';
import { ToolSession } from './tools.js';
import { documentBounds } from './geometry/paths.js';
import { createCanvasRenderer } from './rendering/canvas.js';
import { createInputController } from './input/controller.js';
import { prepareRaster } from './image-import.js';
import { imageOptions } from './raster.js';
import { createPNGExporter } from './png-export.js';
import { serializeSVG } from './svg-export.js';
import { readSVGInput,parseSVGForImport } from './svg-import.js';

export { EtchError } from './errors.js';

/**
 * Mount an independent Etch editor. Link etch.css separately.
 * Pen/shapes, object/partial Pen-and-line eraser, whole-layer movement, local raster/native/SVG import, native persistence and PNG/SVG snapshots are implemented.
 * @param {HTMLElement} container Browser DOM container; existing children are preserved.
 * @param {{readOnly?: boolean, drawWithTouch?: boolean, sidebarOpen?: boolean, limits?: Object}} [options]
 * @returns {Object} Persistence, layer, drawing/settings and view API (see README).
 */
export function createEtch(container, options = {}) {
  if (!container || container.nodeType !== 1 || typeof container.ownerDocument?.createElement !== 'function') {
    fail('INVALID_ARGUMENT', 'createEtch requires a browser DOM element');
  }
  if (!options || typeof options !== 'object' || Array.isArray(options)) fail('INVALID_ARGUMENT', 'Expected editor options');
  if (options.drawWithTouch !== undefined && typeof options.drawWithTouch !== 'boolean') fail('INVALID_ARGUMENT', 'drawWithTouch must be boolean');
  if (options.sidebarOpen !== undefined && typeof options.sidebarOpen !== 'boolean') fail('INVALID_ARGUMENT','sidebarOpen must be boolean');
  const state = new EditorState({readOnly:options.readOnly,limits:options.limits});
  let shell,renderer,input,exporter,fullscreen,destroyed = false;
  const view = new Viewport(() => renderer?.invalidate(true));
  const tools = new ToolSession({readOnly:state.readOnly,drawWithTouch:options.drawWithTouch ?? true,onChange:() => {shell?.refreshTools();input?.refreshCursor();renderer?.invalidate();}});
  const alive = () => {state.getRevision();};
  const report = error => {
    if (destroyed) return;
    input?.cancel();
    const failure = error instanceof EtchError ? error : new EtchError('INVALID_ARGUMENT','Editor action failed');
    shell?.announce(failure.message,{error:true});state.notifyUIError(failure);
  };
  const api = {};
  const readers = ['save','getRevision','getActiveLayer','getSelection','canUndo','canRedo','on'];
  const commands = ['setSelection','setActiveLayer','createLayer','renameLayer','deleteLayer','reorderLayer',
    'setLayerVisibility','setLayerLocked','translateLayer','rotateLayer','rotateSelection','mergeDown','deleteSelection','setBackground','undo','redo'];
  for (const name of readers) api[name] = (...args) => state[name](...args);
  for (const name of commands) api[name] = (...args) => {alive();input?.cancel();return state[name](...args);};
  api.getViewState = () => {alive();return view.get();};
  api.setViewState = value => state.runSession(() => {input.cancel();view.set(value);});
  api.setExpanded = async value => {
    alive();if (typeof value !== 'boolean') fail('INVALID_ARGUMENT','Expanded state must be boolean');
    return state.runSessionAsync(() => fullscreen.setExpanded(value));
  };
  api.fit = () => state.runSession(() => {input.cancel();view.fit(documentBounds(state.document));});
  api.getTool = () => {alive();return tools.getTool();};
  api.setTool = tool => state.runSession(() => {input.cancel();tools.setTool(tool);});
  api.getToolSettings = tool => {alive();return tools.getSettings(tool);};
  api.setToolSettings = (tool,patch) => state.runSession(() => tools.setSettings(tool,patch));
  api.getDrawWithTouch = () => {alive();return tools.getDrawWithTouch();};
  api.setDrawWithTouch = value => state.runSession(() => {input.cancel();tools.setDrawWithTouch(value);});
  api.load = async value => {
    alive();input.cancel();renderer.clearPreview();
    const promise = state.load(value);shell.refresh();input.refreshCursor();
    try {return await promise;}
    finally {shell.refresh();if (!destroyed) input.refreshCursor();}
  };
  const importCenter = () => {const current = view.get();return [view.width/2,view.height/2].map((n,i) => (n-current.pan[i])/current.zoom);};
  const refreshImport = () => {if (!destroyed) {shell.refresh();input.refreshCursor();}};
  async function beginImageSession() {
    alive();input.cancel();renderer.clearPreview();
    const pending = state.beginImageImport(importCenter());shell.refresh();input.refreshCursor();
    let context;
    try {context = await pending;}catch(error) {refreshImport();throw error;}
    let source = null,preview = null,closed = false;
    const dispose = () => {source?.close();source = null;preview?.resource.close();preview = null;};
    const cancel = () => {if (closed) return;closed = true;state.cancelImageImport(context);dispose();refreshImport();};
    context.signal.addEventListener('abort',() => {closed = true;dispose();refreshImport();},{once:true});
    return {
      signal:context.signal,
      async prepare(blob,thumbnail=false) {
        const value = await prepareRaster(blob,context,container.ownerDocument,{thumbnail});
        if (closed || context.signal.aborted) {value.close();fail('CANCELLED','Image import cancelled');}
        source = value;return {width:source.width,height:source.height,name:source.name,originalBytes:source.originalBytes};
      },
      async encode(options) {
        if (closed || !source) fail('CANCELLED','Image import cancelled');
        preview?.resource.close();preview = null;
        const value = await source.encode(options);
        if (closed || context.signal.aborted) {value.resource.close();fail('CANCELLED','Image import cancelled');}
        try {state.previewImageImport(context,value.asset,source.name);}catch(error) {value.resource.close();throw error;}
        preview = value;return {width:source.width,height:source.height,mime:value.asset.mime,bytes:value.bytes,image:value.resource.image};
      },
      async commit() {
        if (closed || !preview) fail('CANCELLED','Image import has no ready preview');
        const value = preview;preview = null;
        try {const result = await state.commitImageImport(context,value.asset,value.resource,source.name);closed = true;dispose();refreshImport();return result;}
        catch(error) {cancel();throw error;}
      },
      cancel,
    };
  }
  api.importImage = async (blob,options) => {
    alive();const settings = imageOptions(options),session = await beginImageSession();
    try {await session.prepare(blob);await session.encode(settings);return await session.commit();}
    finally {session.cancel();}
  };
  async function beginDocumentSession() {
    alive();input.cancel();renderer.clearPreview();
    const pending = state.beginDocumentImport(importCenter());refreshImport();
    let context;try {context = await pending;}catch(error) {refreshImport();throw error;}
    return {signal:context.signal,limits:{...context.limits},
      prepare:(value,name) => state.prepareDocumentImport(context,value,name),
      async commit() {try {return await state.commitDocumentImport(context);}finally {refreshImport();}},
      cancel() {state.cancelDocumentImport(context);refreshImport();},
    };
  }
  api.importDocument = async value => {
    alive();input.cancel();renderer.clearPreview();
    const pending = state.importDocument(value,importCenter());refreshImport();
    try {return await pending;}finally {refreshImport();}
  };
  async function beginSVGSession() {
    const session = await beginDocumentSession();let started = false;
    return {...session,async prepare(value,name='Imported SVG') {
      if (session.signal.aborted) fail('CANCELLED','SVG import cancelled');
      if (started) fail('BUSY','SVG import is already preparing or prepared');started = true;
      try {
        const source = await readSVGInput(value,session.limits,session.signal);
        if (session.signal.aborted) fail('CANCELLED','SVG import cancelled');
        const result = parseSVGForImport(source,session.limits,{DOMParser:container.ownerDocument.defaultView?.DOMParser});
        if (session.signal.aborted) fail('CANCELLED','SVG import cancelled');
        const summary = await session.prepare(result.document,name);return {...summary,svgViewport:{...result.viewport}};
      } catch(error) {
        session.cancel();
        if (error.code === 'UNSUPPORTED_SVG_FEATURE') {
          const features = error.details?.features?.slice(0,6).map(item => item.feature).join(', ') || 'appearance';
          fail(error.code,`Unsupported editable SVG: ${features}. Export PNG in your drawing app and use Import image for this artwork.`,error.details);
        }
        throw error;
      }
    }};
  }
  api.importSVG = async (value,options) => {
    alive();if (options !== undefined) fail('INVALID_ARGUMENT','SVG import currently accepts editable vectors only, with no options');
    const session = await beginSVGSession();
    try {await session.prepare(value);return await session.commit();}finally {session.cancel();}
  };
  api.exportSVG = options => {
    alive();const {document,revision,limits} = state.captureVectorExport();
    return {svg:serializeSVG(document,options,limits),revision};
  };
  api.exportPNG = async options => {alive();return exporter.exportPNG(options);};
  api.cancel = () => {state.cancel();input.cancel();renderer.clearPreview();shell.closeBackgroundDialog(false);shell.refresh();};
  api.destroy = () => {
    if (destroyed) return;destroyed = true;
    fullscreen.destroy();input.destroy();renderer.destroy();exporter.destroy();state.destroy();shell.destroy();
  };
  try {
    exporter = createPNGExporter(container.ownerDocument,state);
    shell = createShell(container,state,{...api,cancelGesture:() => input?.cancel(),previewBackground:value => renderer?.setBackgroundPreview(value),beginImageSession,beginDocumentSession,beginSVGSession,getShapeTool:() => tools.getShapeTool(),
      actualSize() {state.runSession(() => {input.cancel();view.zoomAt(1);});}},report,{sidebarOpen:options.sidebarOpen ?? false});
    renderer = createCanvasRenderer(shell.viewport,state,view,{
      onViewChange(value) {shell.updateView(value);state.notifyViewChange(value);},
      onResize() {input?.cancel();},onError:report,isSelectionTool:() => tools.getTool() === 'select',
    });
    input = createInputController(shell.viewport,shell.root,view,{state,tools,renderer,fit:api.fit,setTool:tool => shell.selectTool(tool),onError:report});
    fullscreen = createFullscreen(shell.root,{
      onBeforeChange() {input.cancel();renderer.clearPreview();},
      onChange(value) {view.setExpanded(value);shell.updateView(view.get());},onError:report,
    });
  } catch (error) {
    destroyed = true;fullscreen?.destroy();input?.destroy();renderer?.destroy();exporter?.destroy();state.destroy();shell?.destroy();throw error;
  }
  state.on('change',({label}) => {input.cancel();renderer.invalidate();shell.refresh();shell.announce(label);});
  state.on('load',() => {input.cancel();renderer.resetCache();shell.refresh();shell.announce('Document loaded');});
  state.on('selectionchange',() => {input.cancel();renderer.invalidate();shell.refresh();});
  return Object.freeze(api);
}
