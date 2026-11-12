import { createId } from '../document.js';
import { PAPER_STYLES, describeBackground, paperGrid } from '../background.js';
import { fail } from '../errors.js';
import { documentBounds } from '../geometry/paths.js';
import { SHAPE_TOOLS, isShapeTool, isLineTool } from '../tools.js';
import { visitStrokeOutline } from '../geometry/stroke.js';
import { exportBounds } from '../export-bounds.js';
import { createSidebarResize } from './sidebar-resize.js';
import { readUTF8Blob } from '../text-input.js';

// Small, local SVG icons. Paths are trusted constants, never imported document data.
const ICONS = {
  undo: ['M9 5 4 10l5 5', 'M4 10h9a6 6 0 0 1 0 12'],
  redo: ['m15 5 5 5-5 5', 'M20 10h-9a6 6 0 0 0 0 12'],
  sidebar: ['M3 4h18v16H3z', 'M14 4v16', 'M17 8h1M17 12h1M17 16h1'],
  plus: ['M12 5v14M5 12h14'],
  more: ['M5 12h.1M12 12h.1M19 12h.1'],
  background: ['M4 4h16v16H4z','M4 4l16 16M12 4l8 8M4 12l8 8'],
  merge: ['M6 3v5c0 4 12 4 12 8v5','M18 3v18','m14 17 4 4 4-4'],
  rotate: ['M20 10a8 8 0 1 0-2 8','M20 3v7h-7'],
  fullscreen: ['M8 3H3v5M16 3h5v5M21 16v5h-5M8 21H3v-5'],
  up: ['M12 20V4m-6 6 6-6 6 6'],
  down: ['M12 4v16m-6-6 6 6 6-6'],
  trash: ['M3 6h18M9 6V3h6v3','m5 6 1 15h12l1-15','M10 10v7M14 10v7'],
  image: ['M3 4h18v16H3z','m3 16 5-5 4 4 3-3 6 6','M14 8h1'],
  document: ['M6 3h8l4 4v7M14 3v5h5M6 3v18h6','M14 18h8m-3-3 3 3-3 3'],
  download: ['M12 3v12m-5-5 5 5 5-5','M4 16v5h16v-5'],
  svg: ['M5 3h9l5 5v13H5Z','M14 3v6h5','m10 12-3 3 3 3m4-6 3 3-3 3'],
  hand: ['M7 12V6a2 2 0 0 1 4 0v5-7a2 2 0 0 1 4 0v7-5a2 2 0 0 1 4 0v9c0 5-3 7-7 7-3 0-5-2-7-5l-2-4a2 2 0 0 1 3-2l2 2'],
  select: ['M5 3v17l5-5 4 7 3-2-4-7 7-1Z'],
  pen: ['m4 16-1 5 5-1L21 7l-5-5Z','m13 5 6 6M4 16l4 4'],
  highlighter: ['m5 12 8-9 8 7-8 9Z','m5 12-2 7 5-1M4 22h16','m10 6 8 7'],
  shapes: ['M3 3h10v10H3z','M20 14a6 6 0 1 1-6-6','m15 9 6-6'],
  line: ['M4 20 20 4'],
  arrow: ['M4 20 20 4','M9 4h11v11'],
  rect: ['M4 5h16v14H4z'],
  ellipse: ['M21 12a9 7 0 1 1-18 0 9 7 0 1 1 18 0'],
  chevron: ['m7 10 5 5 5-5'],
  eraser: ['m3 15 10-12 8 7-9 11H9Z','m7 10 9 8M12 21h9'],
  move: ['M12 3v18M3 12h18','m8 7 4-4 4 4M8 17l4 4 4-4M7 8l-4 4 4 4m10-8 4 4-4 4'],
  fit: ['M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5','M9 9h6v6H9z'],
  actual: ['M16 10a6 6 0 1 1-12 0 6 6 0 1 1 12 0','m15 15 6 6'],
  eye: ['M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z', 'M9 12a3 3 0 1 0 6 0 3 3 0 1 0-6 0'],
  'eye-off': ['m3 3 18 18', 'M10 5h2c6 0 10 7 10 7a22 22 0 0 1-3 4', 'M6 6a24 24 0 0 0-4 6s4 7 10 7c2 0 4-1 5-2', 'M9 9a4 4 0 0 0 6 6'],
  lock: ['M5 10h14v11H5z', 'M8 10V7a4 4 0 0 1 8 0v3', 'M12 14v3'],
  unlock: ['M5 10h14v11H5z', 'M8 10V7a4 4 0 0 1 8 0', 'M12 14v3'],
};

/** Compact shell: expose only functional tools/actions and retain the viewport. */
export function createShell(container, state, api, onError, {sidebarOpen:initialSidebarOpen=false} = {}) {
  const doc = container.ownerDocument;
  const node = (tag, className, text) => {
    const element = doc.createElement(tag);
    if (className) element.className = className;
    if (text) element.textContent = text;
    return element;
  };
  function icon(name) {
    const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
    for (const [key, value] of Object.entries({ viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
      'stroke-width': '1.7', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', focusable: 'false' })) {
      svg.setAttribute(key, value);
    }
    for (const d of ICONS[name]) {
      const path = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', d); svg.append(path);
    }
    return svg;
  }
  const root = node('section', 'etch');
  root.setAttribute('aria-label', 'Etch sketch editor');
  root.tabIndex = 0;
  const toolbar = node('div', 'etch-toolbar');
  toolbar.setAttribute('role', 'toolbar'); toolbar.setAttribute('aria-label', 'Editor actions');
  const toolbarContents = node('div','etch-toolbar-scroll');toolbar.append(toolbarContents);
  const status = node('div','etch-status');status.setAttribute('role','group');status.setAttribute('aria-label','Editor status');
  const statusContext = node('span','etch-status-context'),statusMessage = node('span','etch-status-message','Ready'),statusMetrics = node('span','etch-status-metrics');
  statusMessage.setAttribute('role','status');statusMessage.setAttribute('aria-live','polite');
  const exportSize = node('span','etch-export-size'),statusZoom = node('span','etch-status-zoom','100%');statusZoom.setAttribute('aria-label','Zoom 100%');
  statusMetrics.append(exportSize,statusZoom);status.append(statusContext,statusMessage,statusMetrics);
  let boundsDocument = null,layersDocument = null,layersBlocked = null;
  let destroyed = false;
  // Session-only presentation state; independent of active layer and document/history.
  let sidebarOpen = initialSidebarOpen,lastTool = null,quickOpen = false;
  const hasQuickControls = tool => ['pen','highlighter','eraser'].includes(tool) || isShapeTool(tool);
  const inkTool = () => api.getTool() === 'highlighter' ? 'highlighter' : 'pen';
  function selectTool(tool,{toggle = false} = {}) {
    const open = hasQuickControls(tool) && !(toggle && api.getTool() === tool && quickOpen);
    api.setTool(tool);
    quickOpen = open;
    refreshTools();
  }
  function run(action) {
    if (destroyed) return;
    try { Promise.resolve(action()).catch(report); }
    catch (error) { report(error); }
  }
  function report(error) {
    if (destroyed) return;
    announce(error.message,{error:true});
    onError(error);
  }
  function button(label, action, parent, iconName, text = false) {
    const el = node('button', `etch-button${text ? '' : ' etch-icon-button'}`);
    el.type = 'button'; el.setAttribute('aria-label', label); el.title = label;
    if (iconName) el.append(icon(iconName));
    if (text) el.append(node('span', '', label));
    el.addEventListener('click', () => run(action)); parent.append(el);
    return el;
  }
  function positionMenu(menu,button) {
    const anchor = button.getBoundingClientRect(),bounds = menu.getBoundingClientRect(),win = doc.defaultView;
    menu.style.left = `${Math.max(4,Math.min(anchor.left,win.innerWidth-bounds.width-4))}px`;
    menu.style.top = `${Math.max(4,Math.min(anchor.bottom+4,win.innerHeight-bounds.height-4))}px`;
  }
  function toolbarGroup(label) {
    const group = node('div','etch-toolbar-group');group.setAttribute('role','group');group.setAttribute('aria-label',label);toolbarContents.append(group);return group;
  }
  const historyGroup = toolbarGroup('History'),navigationGroup = toolbarGroup('Navigation'),
    drawingGroup = toolbarGroup('Drawing'),documentGroup = toolbarGroup('Document'),viewGroup = toolbarGroup('View'),zoomGroup = toolbarGroup('Zoom');
  const undoButton = button('Undo',() => api.undo(),historyGroup,'undo');undoButton.title = 'Undo (Ctrl/Cmd + Z)';
  const redoButton = button('Redo',() => api.redo(),historyGroup,'redo');redoButton.title = 'Redo (Ctrl/Cmd + Shift + Z / Ctrl + Y)';
  const hand = button('Hand / Pan',() => api.setTool('hand'),navigationGroup,'hand');hand.classList.add('etch-tool');hand.title = 'Hand / Pan (H or Space)';
  const select = button('Select',() => api.setTool('select'),navigationGroup,'select');select.classList.add('etch-tool');
  const moveLayer = button('Move Layer',() => api.setTool('move-layer'),navigationGroup,'move');moveLayer.classList.add('etch-tool');
  const pen = button('Pen',() => selectTool('pen',{toggle:true}),drawingGroup,'pen');pen.classList.add('etch-tool');
  const highlighter = button('Highlighter',() => selectTool('highlighter',{toggle:true}),drawingGroup,'highlighter');highlighter.classList.add('etch-tool');highlighter.title = 'Highlighter (K)';
  const eraser = button('Eraser',() => selectTool('eraser',{toggle:true}),drawingGroup,'eraser');eraser.classList.add('etch-tool');
  const shapeSplit = node('div','etch-shape-split');drawingGroup.append(shapeSplit);
  const shapes = button('Shapes',() => selectTool(api.getShapeTool(),{toggle:true}),shapeSplit,'rect');shapes.classList.add('etch-tool');
  const shapeChooser = button('Choose shape',() => {
    if (shapeMenu.matches(':popover-open')) shapeMenu.hidePopover();
    else {
      shapeMenu.showPopover();
      shapeChooser.setAttribute('aria-expanded','true');
      positionMenu(shapeMenu,shapeChooser);
      shapeMenu.querySelector(`[data-shape="${api.getShapeTool()}"]`).focus();
    }
  },shapeSplit,'chevron');
  const shapeMenu = node('div','etch-shape-menu');shapeMenu.id = `etch-shapes-${createId()}`;
  shapeMenu.setAttribute('popover','auto');shapeMenu.setAttribute('role','group');shapeMenu.setAttribute('aria-label','Choose shape');root.append(shapeMenu);
  shapeChooser.setAttribute('aria-controls',shapeMenu.id);shapeChooser.setAttribute('aria-expanded','false');
  const shapeChoices = new Map();
  for (const [tool,label] of [['line','Line (L)'],['arrow','Arrow (A)'],['rect','Rectangle (R)'],['ellipse','Ellipse (O)']]) {
    const choice = button(label,() => {selectTool(tool);shapeMenu.hidePopover();shapes.focus();},shapeMenu,tool,true);
    choice.dataset.shape = tool;shapeChoices.set(tool,choice);
  }
  shapeMenu.addEventListener('toggle',() => shapeChooser.setAttribute('aria-expanded',String(shapeMenu.matches(':popover-open'))));
  shapeMenu.addEventListener('keydown',event => {
    if (event.key === 'Escape') {event.preventDefault();event.stopPropagation();shapeMenu.hidePopover();shapeChooser.focus();}
    if (['ArrowDown','ArrowUp','Home','End'].includes(event.key)) {
      event.preventDefault();event.stopPropagation();const choices = [...shapeChoices.values()],index = choices.indexOf(doc.activeElement);
      choices[event.key === 'Home' ? 0 : event.key === 'End' ? choices.length-1 : (index+(event.key === 'ArrowDown' ? 1 : -1)+choices.length)%choices.length].focus();
    }
  });
  const rotate = button('Rotate clockwise 90°',() => state.getSelection().length ? api.rotateSelection() : api.rotateLayer(),viewGroup,'rotate');
  const fullscreen = button('Fullscreen',() => api.setExpanded(!api.getViewState().expanded),viewGroup,'fullscreen');fullscreen.setAttribute('aria-pressed','false');
  const fit = button('Fit drawing',() => api.fit(),zoomGroup,'fit');fit.title = 'Fit drawing (0)';
  const actual = button('100%',() => api.actualSize(),zoomGroup,'actual');actual.title = 'Actual size (1)';
  const zoomLabel = node('span','etch-zoom','100%');zoomLabel.setAttribute('aria-label','Zoom');zoomGroup.append(zoomLabel);
  const toggle = button('Toggle sidebar',() => setSidebarOpen(!sidebarOpen),toolbar,'sidebar');toggle.classList.add('etch-sidebar-toggle');
  toggle.setAttribute('aria-expanded',String(sidebarOpen));toggle.title = sidebarOpen ? 'Hide sidebar' : 'Show sidebar';

  const body = node('div', 'etch-body');
  const viewport = node('div', 'etch-viewport');
  viewport.setAttribute('role','group');
  viewport.setAttribute('aria-label', 'Sketch viewport'); viewport.tabIndex = 0;
  const message = node('div', 'etch-empty');
  const emptyHeading = node('strong','','Start drawing'),emptyHelp = node('p','','Choose a tool above, or drag an image here.');
  const emptyActions = node('div','etch-empty-actions');message.append(emptyHeading,emptyHelp,emptyActions);
  const summary = node('span','etch-sr-only'); summary.id = `etch-summary-${createId()}`;
  viewport.setAttribute('aria-describedby',summary.id);
  viewport.append(message,summary);
  const scrim = node('button', 'etch-sidebar-scrim');
  scrim.type = 'button'; scrim.tabIndex = -1;
  scrim.setAttribute('aria-label', 'Close sidebar'); scrim.hidden = !sidebarOpen;
  scrim.addEventListener('click', () => setSidebarOpen(false));
  const sidebar = node('aside', 'etch-sidebar');
  sidebar.id = `etch-sidebar-${createId()}`;
  sidebar.setAttribute('aria-label', 'Editor sidebar'); sidebar.hidden = !sidebarOpen;
  toggle.setAttribute('aria-controls', sidebar.id);
  const layerSection = node('section', 'etch-layer-section');
  layerSection.setAttribute('aria-label', 'Layer management');
  const header = node('div', 'etch-sidebar-header');
  const layerTitle = node('div','etch-sidebar-title'),layerHeading = node('h2','etch-sidebar-heading');layerTitle.append(layerHeading);
  const layersDisclosure = button('Layers',() => {
    const open = layersDisclosure.getAttribute('aria-expanded') !== 'true';
    layersDisclosure.setAttribute('aria-expanded',String(open));layers.hidden = layerActions.hidden = !open;
  },layerHeading,'chevron',true);layersDisclosure.classList.add('etch-disclosure');layersDisclosure.setAttribute('aria-expanded','true');
  const titleActions = node('div','etch-sidebar-title-actions');layerTitle.append(titleActions);
  const nativeFile = node('input');nativeFile.type = 'file';nativeFile.accept = '.etch.json,.json,application/vnd.lightmetal.etch+json,application/json';nativeFile.hidden = true;nativeFile.setAttribute('aria-label','Choose Etch drawing');root.append(nativeFile);
  const nativeImportButton = button('Import drawing',() => {nativeFile.value = '';nativeFile.click();},titleActions,'document');nativeImportButton.title = 'Import native Etch drawing as one new layer';
  const svgFile = node('input');svgFile.type = 'file';svgFile.accept = '.svg,image/svg+xml';svgFile.hidden = true;svgFile.setAttribute('aria-label','Choose SVG drawing');root.append(svgFile);
  const svgImportButton = button('Import SVG',() => {svgFile.value = '';svgFile.click();},titleActions,'svg');svgImportButton.title = 'Import supported SVG as one editable layer';
  const backgroundButton = button('Document background',() => openBackgroundDialog(),documentGroup,'background');
  // Native invocation keeps repeated clicks from light-dismissing then reopening it.
  const exportButton = button('Export',() => {},documentGroup,'download',true);
  const exportMenu = node('div','etch-export-menu');exportMenu.id = `etch-export-${createId()}`;exportMenu.tabIndex = -1;
  exportMenu.setAttribute('popover','auto');exportMenu.setAttribute('role','group');exportMenu.setAttribute('aria-label','Export drawing');root.append(exportMenu);
  exportButton.setAttribute('popovertarget',exportMenu.id);
  exportButton.setAttribute('aria-controls',exportMenu.id);exportButton.setAttribute('aria-expanded','false');
  let exporting = false;
  const downloadURLs = new Map();
  function closeExportMenu() {
    if (exportMenu.matches(':popover-open')) exportMenu.hidePopover();
    if (!destroyed) exportButton.focus({preventScroll:true});
  }
  function downloadExport(blob,name) {
    if (destroyed) return;
    const win = doc.defaultView,url = win.URL.createObjectURL(blob),anchor = node('a');
    downloadURLs.set(url,null);anchor.href = url;anchor.download = name;anchor.hidden = true;root.append(anchor);
    try {anchor.click();}
    finally {
      anchor.remove();
      if (downloadURLs.has(url)) downloadURLs.set(url,win.setTimeout(() => {win.URL.revokeObjectURL(url);downloadURLs.delete(url);},0));
    }
  }
  async function exportDrawing(format) {
    if (exporting || destroyed) return;
    closeExportMenu();exporting = true;exportPNGButton.disabled = exportSVGButton.disabled = true;
    exportButton.setAttribute('aria-busy','true');announce(`Exporting ${format}…`);
    try {
      let blob;
      if (format === 'PNG') {
        let result;
        try {result = await api.exportPNG();}
        catch (error) {
          if (destroyed) return;
          const scale = error.details?.suggestedScale;
          if (error.code !== 'EXPORT_TOO_LARGE' || !Number.isFinite(scale) || scale <= 0) throw error;
          if (!doc.defaultView.confirm(`This drawing is too large to export at 100%. Download PNG at ${(scale*100).toPrecision(3)}% instead? The editable drawing stays unchanged.`)) {announce('PNG export cancelled');return;}
          result = await api.exportPNG({scale});
        }
        blob = result.blob;
      } else {
        const {svg} = api.exportSVG();blob = new doc.defaultView.Blob([svg],{type:'image/svg+xml;charset=utf-8'});
      }
      if (destroyed) return;
      downloadExport(blob,format === 'PNG' ? 'drawing.png' : 'drawing.svg');announce(`${format} download started`);
    } finally {
      exporting = false;
      if (!destroyed) {exportPNGButton.disabled = exportSVGButton.disabled = false;exportButton.setAttribute('aria-busy','false');}
    }
  }
  const exportPNGButton = button('Export PNG',() => exportDrawing('PNG'),exportMenu,'image',true);exportPNGButton.autofocus = true;
  const exportSVGButton = button('Export SVG',() => exportDrawing('SVG'),exportMenu,'svg',true);
  exportMenu.addEventListener('beforetoggle',event => {
    if (event.newState === 'open') exportMenu.toggleAttribute('autofocus',exporting);
  });
  exportMenu.addEventListener('toggle',() => {
    if (destroyed) return;
    const open = exportMenu.matches(':popover-open');exportButton.setAttribute('aria-expanded',String(open));
    if (open) positionMenu(exportMenu,exportButton);
  });
  exportMenu.addEventListener('keydown',event => {
    if (event.key === 'Escape') {event.preventDefault();event.stopPropagation();closeExportMenu();}
    if (['ArrowDown','ArrowUp','Home','End'].includes(event.key)) {
      event.preventDefault();event.stopPropagation();const choices = [exportPNGButton,exportSVGButton].filter(el => !el.disabled),index = choices.indexOf(doc.activeElement);
      choices[event.key === 'Home' ? 0 : event.key === 'End' ? choices.length-1 : (index+(event.key === 'ArrowDown' ? 1 : -1)+choices.length)%choices.length]?.focus();
    }
  });
  const layerOptionsButton = button('Layer options',() => openLayerDialog(state.getActiveLayer()),titleActions,'more');header.append(layerTitle);
  const layerActions = node('div','etch-layer-actions');header.append(layerActions);
  const newButton = button('New layer', () => api.createLayer(), layerActions, 'plus', true);
  const file = node('input');file.type = 'file';file.accept = 'image/png,image/jpeg,image/webp';file.hidden = true;file.setAttribute('aria-label','Choose local image');root.append(file);
  const importButton = button('Import image',() => {file.value = '';file.click();},layerActions,'image',true);
  const emptyDrawing = button('Import drawing to start',() => {nativeFile.value = '';nativeFile.click();},emptyActions,'document',true);
  emptyDrawing.lastChild.textContent = 'Import drawing';
  const emptyImage = button('Import image to start',() => {file.value = '';file.click();},emptyActions,'image',true);
  emptyImage.lastChild.textContent = 'Import image';
  const layers = node('div', 'etch-layers');
  layers.setAttribute('role', 'group'); layers.setAttribute('aria-label', 'Layers, topmost first');
  layers.id = `etch-layers-${createId()}`;layersDisclosure.setAttribute('aria-controls',layers.id);
  layerSection.append(header, layers); sidebar.append(layerSection);
  const properties = node('section','etch-tool-properties'); properties.setAttribute('aria-label','Pen properties');
  const propertiesTitle = node('h2','etch-sidebar-heading'),propertyContent = node('div','etch-properties-content');
  propertyContent.id = `etch-properties-${createId()}`;
  const propertiesDisclosure = button('Pen properties',() => {
    const open = propertiesDisclosure.getAttribute('aria-expanded') !== 'true';
    propertiesDisclosure.setAttribute('aria-expanded',String(open));propertyContent.hidden = !open;
  },propertiesTitle,'chevron',true);propertiesDisclosure.classList.add('etch-disclosure');
  propertiesDisclosure.setAttribute('aria-expanded','true');propertiesDisclosure.setAttribute('aria-controls',propertyContent.id);
  const moveTarget = node('p','etch-move-target');properties.append(propertiesTitle,propertyContent);propertyContent.append(moveTarget);
  const fields = node('div','etch-pen-fields');
  const color = node('input'); color.type = 'color'; color.setAttribute('aria-label','Pen color');
  const width = node('input'); width.type = 'number'; width.min = '0.5'; width.max = '64'; width.step = '0.5';
  width.setAttribute('aria-label','Pen width'); width.title = 'Width in world units, independent of zoom';
  for (const [text,input] of [['Color',color],['Width',width]]) {
    const label = node('label','etch-property-field'); label.append(node('span','',text),input); fields.append(label);
  }
  const widthSlider = node('input');widthSlider.type = 'range';widthSlider.min = width.min;widthSlider.max = width.max;widthSlider.step = width.step;
  widthSlider.setAttribute('aria-label','Pen width slider');
  const widthControl = node('div','etch-width-control'),widthLabel = width.parentElement,widthField = node('div','etch-property-field');
  width.id = `etch-pen-width-${createId()}`;widthLabel.htmlFor = width.id;widthLabel.classList.remove('etch-property-field');
  widthLabel.replaceWith(widthField);widthField.append(widthLabel,widthControl);widthControl.append(widthSlider,width);
  widthSlider.addEventListener('input',() => run(() => api.setToolSettings(inkTool(),{width:Number(widthSlider.value)})));
  const strokePreview = doc.createElementNS('http://www.w3.org/2000/svg','svg');strokePreview.classList.add('etch-stroke-preview');
  strokePreview.setAttribute('viewBox','0 0 180 80');strokePreview.setAttribute('role','img');
  const previewPath = doc.createElementNS('http://www.w3.org/2000/svg','path');strokePreview.append(previewPath);
  const previewLabel = node('div','etch-property-field');previewLabel.append(node('span','','Stroke preview'),strokePreview);fields.append(previewLabel);
  let previewWidth = null;
  color.addEventListener('input',() => run(() => api.setToolSettings(inkTool(),{color:color.value})));
  width.addEventListener('change',() => run(() => {
    try {api.setToolSettings(inkTool(),{width:Number(width.value)});} finally {refreshTools();}
  }));
  const pressure = node('input');pressure.type = 'checkbox';pressure.setAttribute('aria-label','Pen pressure width');
  const pressureLabel = node('label','etch-finger');pressureLabel.append(pressure,node('span','','Pressure width'));
  pressureLabel.title = 'Vary new stylus strokes with pressure. Off uses constant width; mouse and finger always use constant width.';
  pressure.addEventListener('change',() => run(() => api.setToolSettings('pen',{pressure:pressure.checked})));
  const opacity = node('input');opacity.type = 'number';opacity.min = '5';opacity.max = '100';opacity.step = '1';opacity.setAttribute('aria-label','Highlighter opacity percent');
  const opacityLabel = node('label','etch-property-field');opacityLabel.append(node('span','','Opacity (%)'),opacity);
  opacity.addEventListener('change',() => run(() => {try {api.setToolSettings('highlighter',{opacity:Number(opacity.value)/100});} finally {refreshTools();}}));
  fields.append(pressureLabel,opacityLabel);
  const shapeType = node('select'); shapeType.setAttribute('aria-label','Shape type');
  const shapeNames = {line:'Line',arrow:'Arrow',rect:'Rectangle',ellipse:'Ellipse'};
  for (const tool of SHAPE_TOOLS) {
    const option = node('option','',shapeNames[tool]); option.value = tool; shapeType.append(option);
  }
  shapeType.addEventListener('change',() => run(() => api.setTool(shapeType.value)));
  const shapeTypeLabel = node('label','etch-property-field');
  shapeTypeLabel.append(node('span','','Type'),shapeType); shapeType.title = 'Hold Shift to constrain lines, squares and circles';
  const shapeLayout = node('div','etch-shape-fields'),shapeFields = node('div','etch-shape-panels'),shapeControls = new Map(); let displayedShape = null;
  shapeLayout.append(shapeTypeLabel,shapeFields);
  for (const tool of SHAPE_TOOLS) {
    const panel = node('div','etch-shape-panel');
    const border = node('input'); border.type = 'checkbox';
    const fillEnabled = node('input'); fillEnabled.type = 'checkbox';
    const borderColor = node('input'); borderColor.type = 'color'; borderColor.value = '#24292f';
    const borderWidth = node('input'); borderWidth.type = 'number'; borderWidth.min = '0.5'; borderWidth.max = '64'; borderWidth.step = '0.5';
    borderWidth.title = 'Border width in world units, independent of zoom';
    const fillColor = node('input'); fillColor.type = 'color'; fillColor.value = '#dbeafe';
    borderColor.setAttribute('aria-label','Border color'); fillColor.setAttribute('aria-label','Fill color'); borderWidth.setAttribute('aria-label','Border width');
    const widthLabel = node('label','etch-property-field'); widthLabel.append(node('span','','Width (world)'),borderWidth); panel.append(widthLabel);
    const paints = node('div','etch-shape-paints');
    for (const [text,enabled,paint] of [['Border',border,borderColor],...(isLineTool(tool) ? [] : [['Fill',fillEnabled,fillColor]])]) {
      const group = node('div','etch-property-field etch-shape-paint');
      if (isLineTool(tool)) group.append(node('span','',text));
      else {
        const label = node('label','etch-paint-toggle'); label.append(enabled,node('span','',text)); group.append(label);
      }
      group.append(paint); paints.append(group);
    }
    panel.append(paints);
    const update = patch => run(() => {try {api.setToolSettings(tool,patch);} finally {refreshTools();}});
    borderColor.addEventListener('input',() => update({stroke:borderColor.value}));
    borderWidth.addEventListener('change',() => update({strokeWidth:Number(borderWidth.value)}));
    if (!isLineTool(tool)) {
      fillEnabled.title = 'Uncheck for no fill; at least a border or fill is required';
      border.title = 'At least a border or fill is required';
      border.addEventListener('change',() => update({stroke:border.checked ? borderColor.value : null}));
      fillEnabled.addEventListener('change',() => update({fill:fillEnabled.checked ? fillColor.value : null}));
      fillColor.addEventListener('input',() => update({fill:fillColor.value}));
    }
    shapeControls.set(tool,{panel,border,fillEnabled,borderColor,borderWidth,fillColor});
  }
  const eraserFields = node('div','etch-eraser-fields'),radius = node('input');radius.type = 'number';radius.min = '1';radius.max = '128';radius.step = '1';
  radius.setAttribute('aria-label','Eraser radius');radius.title = 'Radius in CSS pixels; stays the same size at every zoom';
  const eraserMode = node('select');eraserMode.setAttribute('aria-label','Eraser mode');
  for (const [value,text] of [['object','Whole object'],['partial','Partial (Pen + lines)']]) {const option = node('option','',text);option.value = value;eraserMode.append(option);}
  eraserMode.addEventListener('change',() => run(() => api.setToolSettings('eraser',{mode:eraserMode.value})));
  const modeLabel = node('label','etch-property-field');modeLabel.append(node('span','','Mode'),eraserMode);
  const radiusLabel = node('label','etch-property-field');radiusLabel.append(node('span','','Radius (screen px)'),radius);eraserFields.append(modeLabel,radiusLabel);
  radius.addEventListener('change',() => run(() => {try {api.setToolSettings('eraser',{radius:Number(radius.value)});} finally {refreshTools();}}));
  const finger = node('input'); finger.type = 'checkbox';
  const fingerLabel = node('label','etch-finger'); fingerLabel.append(finger,node('span','','Draw with finger'));
  finger.addEventListener('change',() => run(() => api.setDrawWithTouch(finger.checked)));
  const rotateSelection = button('Rotate selection clockwise 90°',() => api.rotateSelection(),propertyContent,'rotate',true);
  const toolNote = node('p','etch-tool-note'); propertyContent.append(fields,shapeLayout,eraserFields,fingerLabel,toolNote); sidebar.append(properties);
  // Both surfaces read/write ToolSession; these nodes hold presentation only.
  const quick = node('div','etch-quick-toolbar');quick.id = `etch-quick-${createId()}`;
  quick.setAttribute('role','toolbar');quick.setAttribute('aria-label','Tool quick controls');quick.hidden = true;
  const quickTitle = node('strong','etch-quick-title');quick.append(quickTitle);
  for (const control of [pen,highlighter,eraser,shapes]) {control.setAttribute('aria-controls',quick.id);control.setAttribute('aria-expanded','false');}
  const quickShapes = shapeType.cloneNode(true);quickShapes.setAttribute('aria-label','Quick shape');quick.append(quickShapes);
  quickShapes.addEventListener('change',() => run(() => selectTool(quickShapes.value)));
  const quickPaint = node('div','etch-quick-group');quickPaint.setAttribute('role','group');quickPaint.setAttribute('aria-label','Stroke colors');quick.append(quickPaint);
  const swatches = new Map();
  const extraColors = node('div','etch-quick-group');extraColors.id = `etch-colors-${createId()}`;extraColors.hidden = true;
  function quickUpdate(patch) {api.setToolSettings(api.getTool(),patch);}
  function paintPatch(value) {return ['pen','highlighter'].includes(api.getTool()) ? {color:value} : {stroke:value};}
  for (const [index,value] of ['#24292F','#FDE047','#EF4444','#F59E0B','#22C55E','#3B82F6','#8B5CF6','#EC4899','#FFFFFF','#64748B','#78350F','#14B8A6','#DBEAFE','#FDE68A','#FDA4AF','#A3E635','#6366F1'].entries()) {
    const swatch = button(`Stroke color ${value}`,() => quickUpdate(paintPatch(value)),index < 8 ? quickPaint : extraColors,null);
    swatch.classList.add('etch-color-swatch');swatch.style.setProperty('--etch-swatch',value);swatches.set(value,swatch);
  }
  const moreColors = button('More colors',() => {extraColors.hidden = !extraColors.hidden;moreColors.setAttribute('aria-expanded',String(!extraColors.hidden));},quickPaint,'more');
  moreColors.setAttribute('aria-controls',extraColors.id);moreColors.setAttribute('aria-expanded','false');quickPaint.append(extraColors);
  const quickColor = node('input');quickColor.type = 'color';quickColor.setAttribute('aria-label','Custom stroke color');quickColor.title = 'Custom stroke color';quickPaint.append(quickColor);
  quickColor.addEventListener('input',() => run(() => quickUpdate(paintPatch(quickColor.value))));
  const quickWidths = node('div','etch-quick-group');quickWidths.setAttribute('role','group');quickWidths.setAttribute('aria-label','Width presets');quick.append(quickWidths);
  const widthPresets = new Map();
  for (const value of [1,3,6,12,8,16,24,40]) {
    const preset = button(`Stroke width ${value}`,() => quickUpdate(['pen','highlighter'].includes(api.getTool()) ? {width:value} : {strokeWidth:value}),quickWidths,null);
    const mark = node('span','etch-width-mark');mark.style.height = `${Math.min(28,value)}px`;preset.append(mark);widthPresets.set(value,preset);
  }
  const quickPreview = strokePreview.cloneNode(true);quickPreview.classList.remove('etch-stroke-preview');quickPreview.classList.add('etch-quick-preview');quick.append(quickPreview);
  const quickPressure = pressure.cloneNode();quickPressure.setAttribute('aria-label','Quick pressure width');
  const quickPressureLabel = node('label','etch-quick-group');quickPressureLabel.title = pressureLabel.title;quickPressureLabel.append(quickPressure,node('span','','Pressure width'));quick.append(quickPressureLabel);
  quickPressure.addEventListener('change',() => run(() => api.setToolSettings('pen',{pressure:quickPressure.checked})));
  const quickOpacity = node('input');quickOpacity.type = 'range';quickOpacity.min = '5';quickOpacity.max = '100';quickOpacity.step = '1';quickOpacity.setAttribute('aria-label','Quick opacity percent');
  const quickOpacityLabel = node('label','etch-quick-group'),quickOpacityValue = node('span');quickOpacityLabel.append(quickOpacityValue,quickOpacity);quick.append(quickOpacityLabel);
  quickOpacity.addEventListener('input',() => run(() => api.setToolSettings('highlighter',{opacity:Number(quickOpacity.value)/100})));
  const quickBorderLabel = node('label','etch-quick-group'),quickBorder = node('input');quickBorder.type = 'checkbox';quickBorder.setAttribute('aria-label','Quick shape border');quickBorderLabel.append(quickBorder,node('span','','Border'));quick.append(quickBorderLabel);
  quickBorder.addEventListener('change',() => run(() => quickUpdate({stroke:quickBorder.checked ? shapeControls.get(api.getTool()).borderColor.value : null})));
  const quickFillLabel = node('label','etch-quick-group'),quickFill = node('input');quickFill.type = 'checkbox';quickFill.setAttribute('aria-label','Quick shape fill');quickFillLabel.append(quickFill,node('span','','Fill'));quick.append(quickFillLabel);
  quickFill.addEventListener('change',() => run(() => quickUpdate({fill:quickFill.checked ? shapeControls.get(api.getTool()).fillColor.value : null})));
  const quickFillColor = node('input');quickFillColor.type = 'color';quickFillColor.setAttribute('aria-label','Quick fill color');quick.append(quickFillColor);
  quickFillColor.addEventListener('input',() => run(() => quickUpdate({fill:quickFillColor.value})));
  const quickSizes = node('div','etch-quick-group');quickSizes.setAttribute('role','group');quickSizes.setAttribute('aria-label','Eraser radius presets');quick.append(quickSizes);
  const sizePresets = new Map();
  for (const value of [5,10,20,40]) {
    const preset = button(`Eraser radius ${value} pixels`,() => quickUpdate({radius:value}),quickSizes,null);
    const mark = node('span','etch-size-mark');mark.style.width = mark.style.height = `${Math.min(28,value+4)}px`;preset.append(mark);sizePresets.set(value,preset);
  }
  const quickMode = eraserMode.cloneNode(true);quickMode.setAttribute('aria-label','Quick erasing mode');quick.append(quickMode);
  quickMode.addEventListener('change',() => run(() => quickUpdate({mode:quickMode.value})));
  body.append(viewport, scrim, sidebar); root.append(toolbar, quick, body, status); container.append(root);

  const sidebarResize = createSidebarResize(root,body,sidebar,() => api.cancelGesture());
  const imageDialog = node('dialog','etch-dialog etch-image-dialog');imageDialog.setAttribute('aria-labelledby',`etch-image-title-${createId()}`);
  const imageTitle = node('h2','','Import image');imageTitle.id = imageDialog.getAttribute('aria-labelledby');
  const imagePreview = node('canvas','etch-image-preview');imagePreview.width = imagePreview.height = 0;imagePreview.setAttribute('aria-label','Encoded image preview');
  const imageFormat = node('select');imageFormat.setAttribute('aria-label','Image format');
  for (const [value,text] of [['webp','WebP — smaller file'],['png','PNG — lossless']]) {const option = node('option','',text);option.value = value;imageFormat.append(option);}
  const imageQuality = node('input');imageQuality.type = 'number';imageQuality.min = '0';imageQuality.max = '100';imageQuality.step = '1';imageQuality.value = '80';imageQuality.setAttribute('aria-label','WebP quality');
  const formatLabel = node('label','etch-property-field');formatLabel.append(node('span','','Format'),imageFormat);
  const qualityLabel = node('label','etch-property-field');qualityLabel.append(node('span','','WebP quality (0–100)'),imageQuality);
  const imageDetails = node('p','etch-image-details'),imageError = node('p','etch-image-error');imageError.setAttribute('role','alert');imageDetails.setAttribute('role','status');
  const imageHelp = node('p','etch-image-help','Local only—nothing is uploaded. Original dimensions stay unchanged. PNG is lossless; browser compression effort is automatic. After import, lock the image layer and choose New layer to draw above it. Use Fit drawing for large pictures.');
  const imageActions = node('div','etch-image-actions');
  button('Cancel import',() => closeImageDialog(),imageActions,null,true);
  const imageConfirm = button('Import as layer',async () => {
    const flow = imageFlow;if (!flow?.ready) return;
    imageConfirm.disabled = true;
    try {await flow.session.commit();closeImageDialog();announce('Image imported. Use Fit drawing, lock the image layer, then add a new layer to draw above.');}
    catch(error) {if (error.code !== 'CANCELLED') report(error);closeImageDialog();}
  },imageActions,null,true);
  imageDialog.append(imageTitle,imagePreview,formatLabel,qualityLabel,imageDetails,imageError,imageHelp,imageActions);root.append(imageDialog);
  const layerDialog = node('dialog','etch-dialog etch-layer-dialog'),layerDialogTitle = node('h2','','Edit layer');
  layerDialogTitle.id = `etch-layer-title-${createId()}`;layerDialog.id = `etch-layer-dialog-${createId()}`;layerDialog.setAttribute('aria-labelledby',layerDialogTitle.id);
  layerOptionsButton.setAttribute('aria-haspopup','dialog');layerOptionsButton.setAttribute('aria-controls',layerDialog.id);
  const nameForm = node('form'),nameLabel = node('label','etch-property-field'),nameInput = node('input');nameInput.type = 'text';nameInput.maxLength = 80;nameInput.setAttribute('aria-label','Layer name');
  nameLabel.append(node('span','','Layer name (1–80 characters)'),nameInput);nameForm.append(nameLabel);
  const rename = button('Rename layer',() => {},nameForm,null,true);rename.type = 'submit';
  const layerError = node('p','etch-image-error');layerError.setAttribute('role','alert');
  const stacking = node('div','etch-layer-stacking');
  const moveUp = button('Move layer up',() => moveDialogLayer(1),stacking,'up',true);
  const moveDown = button('Move layer down',() => moveDialogLayer(-1),stacking,'down',true);
  const rotateLayer = button('Rotate layer clockwise 90°',() => {
    layerError.textContent = '';
    try {api.rotateLayer(optionsLayerId);} catch(error) {layerError.textContent = error.message;throw error;}
  },stacking,'rotate',true);
  const mergeHelp = node('p','etch-layer-help');mergeHelp.id = `etch-merge-help-${createId()}`;
  const merge = button('Merge Down',() => mergeDialogLayer(),stacking,'merge',true);merge.setAttribute('aria-describedby',mergeHelp.id);
  const layerDone = node('div','etch-image-actions');button('Done',() => closeLayerDialog(),layerDone,null,true);
  layerDialog.append(layerDialogTitle,nameForm,layerError,node('p','etch-layer-help','Higher layers draw above lower ones. Each rename, move, rotation or merge is undoable. Rotate turns all artwork on this layer together; click again for another 90°.'),stacking,mergeHelp,layerDone);root.append(layerDialog);
  let optionsLayerId = null;
  function closeLayerDialog(restoreFocus=true) {
    optionsLayerId = null;if (layerDialog.open) layerDialog.close();
    if (restoreFocus && sidebarOpen && !destroyed) (layerOptionsButton.disabled ? layers.querySelector('.etch-layer-select[aria-pressed="true"]') : layerOptionsButton)?.focus({preventScroll:true});
  }
  function refreshLayerDialog() {
    if (!layerDialog.open) return;
    const index = state.document.layers.findIndex(l => l.id === optionsLayerId),layer = state.document.layers[index];
    if (!layer || state.busy || state.readOnly || layer.locked) {closeLayerDialog(false);return;}
    layerDialogTitle.textContent = `Edit layer: ${layer.name}`;
    moveUp.disabled = index === state.document.layers.length-1;moveDown.disabled = index === 0;
    rotateLayer.disabled = !layer.visible || !layer.elements.length;
    const {lower,reason} = mergeTarget(layer.id);
    merge.disabled = Boolean(reason);merge.title = reason || `Merge “${layer.name}” into “${lower.name}”`;
    mergeHelp.textContent = reason || `Merge “${layer.name}” into “${lower.name}”. The lower layer keeps its name; artwork stays editable. Undo restores both layers.`;
  }
  function mergeTarget(id) {
    const index = state.document.layers.findIndex(l => l.id === id),upper = state.document.layers[index],lower = state.document.layers[index-1];
    const reason = state.readOnly ? 'Read-only: layers cannot be merged.' : state.busy ? 'Wait for the current operation before merging.'
      : !upper ? 'This layer is no longer available.' : !lower ? 'No lower layer to merge into.'
      : !upper.visible ? `Show “${upper.name}” before merging.` : upper.locked ? `Unlock “${upper.name}” before merging.`
      : !lower.visible ? `Show “${lower.name}” before merging.` : lower.locked ? `Unlock “${lower.name}” before merging.` : '';
    return {upper,lower,reason};
  }
  function mergeDialogLayer() {
    const target = optionsLayerId,{upper,lower,reason} = mergeTarget(target);
    if (reason) {refreshLayerDialog();return;}
    layerError.textContent = '';
    try {api.mergeDown(target);} catch(error) {layerError.textContent = error.message;throw error;}
    closeLayerDialog();announce(`Merged “${upper.name}” into “${lower.name}”. Undo restores both layers.`);
  }
  function openLayerDialog(id) {
    const layer = state.document.layers.find(l => l.id === id);
    if (!layer || state.busy || state.readOnly || layer.locked) return;
    api.cancel();optionsLayerId = id;nameInput.value = layer.name;layerError.textContent = '';
    layerDialog.showModal();refreshLayerDialog();nameInput.focus();nameInput.select();
  }
  function moveDialogLayer(delta) {
    const index = state.document.layers.findIndex(l => l.id === optionsLayerId),target = index+delta;
    if (index < 0 || target < 0 || target >= state.document.layers.length) return;
    api.reorderLayer(optionsLayerId,target);announce(delta > 0 ? 'Layer moved up' : 'Layer moved down');
  }
  nameForm.addEventListener('submit',event => {
    event.preventDefault();const name = nameInput.value.trim();
    if (!name || name.length > 80) {layerError.textContent = 'Enter a layer name containing 1–80 characters.';nameInput.focus();return;}
    run(() => {if (!optionsLayerId) return;api.renameLayer(optionsLayerId,name);closeLayerDialog();announce('Layer renamed');});
  });
  layerDialog.addEventListener('cancel',event => {event.preventDefault();closeLayerDialog();});
  const backgroundDialog = node('dialog','etch-dialog etch-background-dialog'),backgroundTitle = node('h2','','Document background');
  backgroundTitle.id = `etch-background-title-${createId()}`;backgroundDialog.id = `etch-background-dialog-${createId()}`;backgroundDialog.setAttribute('aria-labelledby',backgroundTitle.id);
  backgroundButton.setAttribute('aria-haspopup','dialog');backgroundButton.setAttribute('aria-controls',backgroundDialog.id);
  const backgroundForm = node('form');backgroundForm.noValidate = true;
  const backgroundMode = node('select');backgroundMode.setAttribute('aria-label','Background mode');
  for (const [value,text] of [['transparent','Transparent'],['solid','Solid color'],['offwhite','Off-white'],...Object.entries(PAPER_STYLES).map(([type,style]) => [type,style.name])]) {const option = node('option','',text);option.value = value;backgroundMode.append(option);}
  const backgroundModeLabel = node('label','etch-property-field');backgroundModeLabel.append(node('span','','Background'),backgroundMode);
  const backgroundColor = node('input');backgroundColor.type = 'color';backgroundColor.setAttribute('aria-label','Background color');
  const backgroundHex = node('input');backgroundHex.type = 'text';backgroundHex.maxLength = 7;backgroundHex.spellcheck = false;backgroundHex.autocomplete = 'off';backgroundHex.setAttribute('aria-label','Background hex color');
  const backgroundPaints = node('div','etch-background-paints');backgroundPaints.append(backgroundColor,backgroundHex);
  const backgroundPaintLabel = node('div','etch-property-field');backgroundPaintLabel.append(node('span','','Color (#RRGGBB)'),backgroundPaints);
  const backgroundSpacing = node('input');backgroundSpacing.type = 'number';backgroundSpacing.min = '8';backgroundSpacing.max = '128';backgroundSpacing.step = '1';backgroundSpacing.setAttribute('aria-label','Paper spacing');
  const backgroundSpacingLabel = node('label','etch-property-field');backgroundSpacingLabel.append(node('span','','Grid / line spacing (world units, 8–128)'),backgroundSpacing);
  const backgroundPreview = node('div','etch-background-preview'),backgroundSample = node('span','etch-background-sample'),backgroundDescription = node('span');backgroundSample.setAttribute('aria-hidden','true');backgroundDescription.setAttribute('role','status');backgroundPreview.append(backgroundSample,backgroundDescription);
  const backgroundError = node('p','etch-image-error');backgroundError.setAttribute('role','alert');
  const backgroundHelp = node('p','etch-image-help','Saved behind all artwork and included in PNG/SVG exports. Paper dots and lines zoom with the drawing; engineering paper has heavier lines every five squares. An opaque photo covers paper beneath it. Changes preview on the document without editing it. Cancel or Escape restores the original. Transparent may look white here; PNG keeps its alpha. Apply makes one undoable edit.');
  const backgroundActions = node('div','etch-image-actions');button('Cancel background',() => closeBackgroundDialog(),backgroundActions,null,true);
  const backgroundApply = button('Apply background',() => {},backgroundActions,null,true);backgroundApply.type = 'submit';
  backgroundForm.append(backgroundModeLabel,backgroundPaintLabel,backgroundSpacingLabel,backgroundPreview,backgroundError,backgroundHelp,backgroundActions);backgroundDialog.append(backgroundTitle,backgroundForm);root.append(backgroundDialog);
  let backgroundBaseline = null,lastBackgroundColor = '#FFFFFF',lastPaperSpacing = 24;
  const validBackgroundHex = value => /^#[\da-f]{6}$/i.test(value);
  function updateBackgroundDraft() {
    if (destroyed) return;
    if (backgroundMode.value === 'offwhite') backgroundHex.value = backgroundColor.value = '#FAF8F2';
    const mode = backgroundMode.value,transparent = mode === 'transparent',paper = Object.hasOwn(PAPER_STYLES,mode),spacing = Number(backgroundSpacing.value);
    const valid = paper ? Boolean(backgroundSpacing.value) && Number.isInteger(spacing) && spacing >= 8 && spacing <= 128 : transparent || validBackgroundHex(backgroundHex.value);
    backgroundColor.disabled = backgroundHex.disabled = mode !== 'solid';
    backgroundPaintLabel.hidden = paper;backgroundSpacingLabel.hidden = !paper;backgroundSpacing.disabled = !paper;
    backgroundApply.disabled = !valid || state.readOnly || state.busy;
    backgroundError.textContent = valid ? '' : paper ? 'Enter an integer spacing from 8 to 128 world units.' : 'Enter an opaque color as #RRGGBB (six hex digits).';
    backgroundSample.style.background = '';
    backgroundSample.classList.toggle('etch-background-transparent',transparent || !valid);
    if (paper && valid) {
      const grid = paperGrid({type:mode,spacing}),images = [],sizes = [];
      if (grid.dots) {
        images.push(`radial-gradient(circle at center, ${grid.groups[0].color} 0.5px, transparent 0.5px)`);
        sizes.push(`${spacing/2}px ${spacing/2}px`);
      } else for (const group of [...grid.groups].reverse()) for (const direction of group.vertical ? ['right','bottom'] : ['bottom']) {
        images.push(`linear-gradient(to ${direction}, ${group.color} ${group.width/2}px, transparent ${group.width/2}px)`);
        sizes.push(`${group.spacing/2}px ${group.spacing/2}px`);
      }
      Object.assign(backgroundSample.style,{backgroundColor:grid.color,backgroundImage:images.join(','),backgroundSize:sizes.join(',')});
    } else if (!transparent && valid) backgroundSample.style.backgroundColor = backgroundHex.value;
    backgroundDescription.textContent = !valid ? 'Invalid background' : transparent ? 'Transparent — exports with alpha' : paper ? describeBackground({type:mode,spacing}) : backgroundHex.value.toUpperCase();
    api.previewBackground(valid && backgroundBaseline === state.document && !state.readOnly && !state.busy
      ? transparent ? null : paper ? {type:mode,spacing} : backgroundHex.value.toUpperCase()
      : undefined);
  }
  function closeBackgroundDialog(restoreFocus=true) {
    api.previewBackground(undefined);
    backgroundBaseline = null;if (backgroundDialog.open) backgroundDialog.close();
    if (restoreFocus && !destroyed && !backgroundButton.disabled) backgroundButton.focus({preventScroll:true});
  }
  function refreshBackgroundDialog() {
    if (backgroundDialog.open && (backgroundBaseline !== state.document || state.readOnly || state.busy)) closeBackgroundDialog(false);
  }
  function openBackgroundDialog() {
    if (state.readOnly || state.busy) return;
    api.cancel();backgroundBaseline = state.document;
    const value = state.document.background,paper = value !== null && typeof value === 'object';
    if (typeof value === 'string') lastBackgroundColor = value;
    if (paper) lastPaperSpacing = value.spacing;
    backgroundMode.value = value === null ? 'transparent' : paper ? value.type : value === '#FAF8F2' ? 'offwhite' : 'solid';
    backgroundHex.value = backgroundColor.value = lastBackgroundColor;backgroundSpacing.value = String(lastPaperSpacing);
    updateBackgroundDraft();backgroundDialog.showModal();backgroundMode.focus();
  }
  backgroundMode.addEventListener('change',updateBackgroundDraft);
  backgroundSpacing.addEventListener('input',updateBackgroundDraft);
  backgroundColor.addEventListener('input',() => {backgroundHex.value = backgroundColor.value.toUpperCase();updateBackgroundDraft();});
  backgroundHex.addEventListener('input',() => {if (validBackgroundHex(backgroundHex.value)) backgroundColor.value = backgroundHex.value;updateBackgroundDraft();});
  backgroundForm.addEventListener('submit',event => {
    event.preventDefault();run(() => {
      if (!backgroundDialog.open || backgroundBaseline !== state.document || state.readOnly || state.busy) {refreshBackgroundDialog();return;}
      updateBackgroundDraft();if (backgroundApply.disabled) return;
      const mode = backgroundMode.value,value = mode === 'transparent' ? null : ['solid','offwhite'].includes(mode) ? backgroundHex.value.toUpperCase() : {type:mode,spacing:Number(backgroundSpacing.value)};
      try {api.setBackground(value);} catch(error) {backgroundError.textContent = error.message;throw error;}
      if (typeof value === 'string') lastBackgroundColor = value;
      else if (value) lastPaperSpacing = value.spacing;
      closeBackgroundDialog();announce(`Document background: ${describeBackground(value)}`);
    });
  });
  backgroundDialog.addEventListener('cancel',event => {event.preventDefault();closeBackgroundDialog();});
  const nativeDialog = node('dialog','etch-dialog etch-native-dialog'),nativeTitle = node('h2','','Import Etch drawing');
  nativeTitle.id = `etch-native-title-${createId()}`;nativeDialog.id = `etch-native-dialog-${createId()}`;nativeDialog.setAttribute('aria-labelledby',nativeTitle.id);
  for (const control of [nativeImportButton,svgImportButton,emptyDrawing]) {control.setAttribute('aria-haspopup','dialog');control.setAttribute('aria-controls',nativeDialog.id);}
  const nativeDetails = node('p','etch-native-details');nativeDetails.setAttribute('role','status');
  const nativeWarnings = node('ul','etch-native-warnings');nativeWarnings.setAttribute('aria-label','Import omissions');
  const nativeHelp = node('p','etch-image-help','Creates one visible unlocked layer above the captured layer, centered in the captured view at original scale. Source locks are ignored. Only visible source layers are included; source background is omitted. Use load/reopen to preserve all layers and background. Nothing is uploaded. Fit afterwards if needed.');
  const nativeActions = node('div','etch-image-actions');button('Cancel drawing import',() => closeNativeDialog(),nativeActions,null,true);
  const nativeConfirm = button('Import as one layer',async () => {
    const flow = nativeFlow;if (!flow?.ready) return;nativeConfirm.disabled = true;
    try {await flow.session.commit();closeNativeDialog();announce('Drawing imported as one editable layer. Fit drawing if needed.');}
    catch(error) {if (error.code !== 'CANCELLED') report(error);closeNativeDialog();}
  },nativeActions,null,true);
  nativeDialog.append(nativeTitle,nativeDetails,nativeWarnings,nativeHelp,nativeActions);root.append(nativeDialog);
  const nativeHelpText = nativeHelp.textContent;
  const svgHelpText = 'Imports supported SVG vectors as one visible unlocked editable layer above the captured layer, at original scale in the captured view. Your document background stays unchanged. Nothing is uploaded. Unsupported text, images, gradients, clipping or effects are rejected rather than silently stripped. Export PNG in your drawing app and use Import image for unsupported artwork; there is no automatic image fallback. Fit afterwards if needed.';
  let nativeFlow = null;
  function closeNativeDialog(restoreFocus=true) {
    const flow = nativeFlow;nativeFlow = null;flow?.session?.cancel();if (nativeDialog.open) nativeDialog.close();
    const origin = flow?.kind === 'svg' ? svgImportButton : nativeImportButton;
    if (restoreFocus && sidebarOpen && !destroyed && !origin.disabled) origin.focus({preventScroll:true});
  }
  nativeDialog.addEventListener('cancel',event => {event.preventDefault();closeNativeDialog();});
  function importDrawingFile(chooser,kind) {chooser.addEventListener('change',() => run(async () => {
    const blob = chooser.files[0];chooser.value = '';if (!blob) return;
    closeNativeDialog(false);const flow = {session:null,ready:false,preparing:false,kind};nativeFlow = flow;
    nativeTitle.textContent = kind === 'svg' ? 'Import SVG drawing' : 'Import Etch drawing';nativeHelp.textContent = kind === 'svg' ? svgHelpText : nativeHelpText;
    nativeConfirm.disabled = true;nativeWarnings.replaceChildren();nativeDetails.textContent = 'Reading and validating local drawing…';nativeDialog.showModal();
    try {
      flow.session = await (kind === 'svg' ? api.beginSVGSession() : api.beginDocumentSession());
      if (nativeFlow !== flow) {flow.session.cancel();return;}
      flow.session.signal.addEventListener('abort',() => {if (nativeFlow === flow) closeNativeDialog();},{once:true});
      if (flow.session.signal.aborted) {closeNativeDialog();return;}
      const maximum = kind === 'svg' ? Math.min(5*1024*1024,flow.session.limits.jsonBytes) : flow.session.limits.jsonBytes;
      if (blob.size > maximum) fail('LIMIT_EXCEEDED',kind === 'svg' ? 'SVG exceeds the 5 MiB input limit (or lower host limit)' : 'Drawing file exceeds the native JSON size limit',{limit:kind === 'svg' ? 'svgBytes' : 'jsonBytes',maximum});
      const value = kind === 'svg' ? blob : await readUTF8Blob(blob,{maximum,signal:flow.session.signal,invalidCode:'INVALID_DOCUMENT',label:'Drawing'});if (nativeFlow !== flow || flow.session.signal.aborted) return;
      const name = blob.name.replace(kind === 'svg' ? /\.svg$/i : /(?:\.etch)?\.json$/i,'').trim().slice(0,80) || (kind === 'svg' ? 'Imported SVG' : 'Imported drawing');
      flow.preparing = true;const summary = await flow.session.prepare(value,name);
      if (nativeFlow !== flow) return;
      nativeDetails.textContent = `${summary.name}: ${summary.visibleLayers} visible source layer(s), ${summary.elements} editable mark(s), ${summary.assets} image asset(s). Painted size ${summary.bounds.width.toFixed(2)} × ${summary.bounds.height.toFixed(2)} world units. ${(blob.size/1024).toFixed(1)} KiB source.`;
      const items = [];
      for (const warning of summary.warnings) {
        if (warning.code === 'HIDDEN_LAYERS_OMITTED') for (const layer of warning.layers) items.push(node('li','',`Hidden layer omitted: “${layer.name}”.`));
        if (warning.code === 'BACKGROUND_OMITTED') items.push(node('li','',`Source background ${describeBackground(warning.background ?? warning.color)} is omitted; your document background stays unchanged.`));
      }
      if (kind === 'svg') items.push(node('li','',`SVG viewport ${summary.svgViewport.width.toFixed(2)} × ${summary.svgViewport.height.toFixed(2)} world units. No unsupported artwork was silently omitted.`));
      else if (!items.length) items.push(node('li','','No hidden layers or source background to omit.'));
      nativeWarnings.replaceChildren(...items);flow.ready = true;nativeConfirm.disabled = false;
    } catch(error) {
      if (nativeFlow !== flow) {if (flow.preparing && !destroyed && error.code !== 'CANCELLED') report(error);return;}
      closeNativeDialog();if (error.code !== 'CANCELLED') report(error);
    }
  }));}
  importDrawingFile(nativeFile,'native');importDrawingFile(svgFile,'svg');
  let imageFlow = null,imageSettings = {format:'webp',quality:0.8};
  function closeImageDialog() {
    const flow = imageFlow;imageFlow = null;flow?.session?.cancel();
    if (imageDialog.open) imageDialog.close();imagePreview.width = imagePreview.height = 0;
  }
  async function updateImagePreview() {
    const flow = imageFlow;if (!flow?.source || flow.encoding) return;
    const quality = imageFormat.value === 'png' ? Math.round(imageSettings.quality*100) : Number(imageQuality.value);
    if (imageFormat.value === 'webp' && (!imageQuality.value || !Number.isInteger(quality) || quality < 0 || quality > 100)) {imageError.textContent = 'Quality must be in [0, 100]';imageConfirm.disabled = true;return;}
    flow.encoding = true;flow.ready = false;imageConfirm.disabled = true;imageFormat.disabled = imageQuality.disabled = true;imageError.textContent = '';imageDetails.textContent = 'Encoding preview…';
    try {
      const settings = {format:imageFormat.value,quality:quality/100};let preview;
      try {preview = await flow.session.encode(settings);}
      catch(error) {
        if (imageFlow !== flow) return;
        if (settings.format !== 'webp' || error.code !== 'INVALID_ARGUMENT' || error.details?.encoder !== 'webp' || error.details.supported !== false) throw error;
        // Actual MIME proves encoder support; never label PNG bytes as WebP.
        // Retry only this known unsupported-encoder case, within the same session.
        imageFormat.options[0].disabled = true;imageFormat.value = 'png';
        settings.format = 'png';imageSettings = {...imageSettings,format:'png'};
        imageDetails.textContent = 'WebP encoding unavailable; preparing PNG preview…';
        preview = await flow.session.encode(settings);
      }
      if (imageFlow !== flow) return;
      imageSettings = settings;const ratio = Math.min(1,240/preview.width,160/preview.height);
      imagePreview.width = Math.max(1,Math.round(preview.width*ratio));imagePreview.height = Math.max(1,Math.round(preview.height*ratio));
      imagePreview.getContext('2d').drawImage(preview.image,0,0,imagePreview.width,imagePreview.height);
      imageDetails.textContent = `${preview.width} × ${preview.height} px · ${preview.mime === 'image/webp' ? `WebP quality ${quality}` : `PNG lossless${imageFormat.options[0].disabled ? ' (WebP encoding unavailable)' : ''}`} · ${(preview.bytes/1024).toFixed(1)} KiB encoded (${(Math.ceil(preview.bytes/3)*4/1024).toFixed(1)} KiB base64)`;
      flow.ready = true;imageConfirm.disabled = false;
    } catch(error) {
      if (imageFlow !== flow) return;
      if (error.code !== 'CANCELLED') imageError.textContent = error.message;
      imageDetails.textContent = 'No image has been imported.';
    } finally {
      flow.encoding = false;
      if (imageFlow === flow) {imageFormat.disabled = false;imageQuality.disabled = imageFormat.value !== 'webp';}
    }
  }
  imageFormat.addEventListener('change',() => run(updateImagePreview));imageQuality.addEventListener('change',() => run(updateImagePreview));
  imageDialog.addEventListener('cancel',event => {event.preventDefault();closeImageDialog();});
  async function openImage(blob) {
    if (state.readOnly) fail('READ_ONLY','This editor is read-only');
    if (state.busy) fail('BUSY','Wait for the current operation before importing an image');
    closeImageDialog();const flow = {session:null,source:null,encoding:false,ready:false};imageFlow = flow;
    imageFormat.value = imageSettings.format;imageQuality.value = String(Math.round(imageSettings.quality*100));imageFormat.disabled = imageQuality.disabled = imageConfirm.disabled = true;
    imageDetails.textContent = 'Reading local image…';imageError.textContent = '';imageDialog.showModal();
    try {
      flow.session = await api.beginImageSession();
      if (imageFlow !== flow) {flow.session.cancel();return;}
      flow.session.signal.addEventListener('abort',() => {if (imageFlow === flow) closeImageDialog();},{once:true});
      flow.source = await flow.session.prepare(blob,true);
      if (imageFlow === flow) await updateImagePreview();
    } catch(error) {
      if (imageFlow !== flow) return;
      closeImageDialog();if (error.code !== 'CANCELLED') report(error);
    }
  }
  file.addEventListener('change',() => {const blob = file.files[0];file.value = '';if (blob) run(() => openImage(blob));});
  viewport.addEventListener('dragover',event => {
    if (!event.dataTransfer?.types.includes('Files')) return;
    event.preventDefault();
    const available = !state.readOnly && !state.busy && !root.querySelector('dialog[open]');
    event.dataTransfer.dropEffect = available ? 'copy' : 'none';
    if (available && !viewport.classList.contains('etch-drop-target')) api.cancelGesture();
    viewport.classList.toggle('etch-drop-target',available);
  });
  viewport.addEventListener('dragleave',event => {if (!viewport.contains(event.relatedTarget)) viewport.classList.remove('etch-drop-target');});
  viewport.addEventListener('drop',event => {
    if (!event.dataTransfer?.types.includes('Files')) return;
    event.preventDefault();viewport.classList.remove('etch-drop-target');
    run(() => {
      if (state.readOnly) fail('READ_ONLY','This editor is read-only');
      if (state.busy || root.querySelector('dialog[open]')) fail('BUSY','Close the current dialog or wait for the current operation before dropping an image');
      const files = event.dataTransfer.files;
      if (files.length !== 1) fail('INVALID_ARGUMENT','Drop one PNG, JPEG or WebP image at a time');
      const blob = files[0];
      if (!['image/png','image/jpeg','image/webp'].includes(blob.type) && !/\.(png|jpe?g|webp)$/i.test(blob.name)) fail('INVALID_ARGUMENT','Drop a PNG, JPEG or WebP image. Use Import SVG or Import drawing for vector/native files.');
      return openImage(blob);
    });
  });

  function setSidebarOpen(open) {
    if (!open) sidebarResize.cancel();
    sidebarOpen = open;
    sidebar.hidden = !open; scrim.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    toggle.title = open ? 'Hide sidebar' : 'Show sidebar';
    // Never remount or clear the viewport; CSS handles column vs overlay layout.
    if (!open) toggle.focus({ preventScroll: true });
  }
  function announce(text,{error=false}={}) {
    if (destroyed) return;
    if (['move-layer','eraser'].includes(api.getTool())) text += ` · Layer: ${state.document.layers.find(l => l.id === state.getActiveLayer()).name}`;
    statusMessage.textContent = status.title = text;status.dataset.error = String(error);
  }
  function refreshTools() {
    if (destroyed) return;
    const tool = api.getTool(),highlighting = tool === 'highlighter',drawingInk = tool === 'pen' || highlighting,
      settings = api.getToolSettings(inkTool()),shape = isShapeTool(tool),moving = tool === 'move-layer',erasing = tool === 'eraser',selecting = tool === 'select';
    const layer = state.document.layers.find(l => l.id === state.getActiveLayer());
    const blocked = state.readOnly || state.busy;
    const action = moving ? 'move' : erasing ? 'erase' : 'draw';
    const reason = state.readOnly ? 'Read-only: use Hand to navigate.' : state.busy ? 'Loading: use Hand to navigate.'
      : !layer.visible ? `Active layer is hidden. Show it to ${action}.` : layer.locked ? `Active layer is locked. Unlock it to ${action}.` : '';
    hand.setAttribute('aria-pressed',String(tool === 'hand')); pen.setAttribute('aria-pressed',String(tool === 'pen'));
    select.setAttribute('aria-pressed',String(tool === 'select'));select.title = reason || 'Select (V): pick, marquee or drag objects · Shift toggles/adds';
    select.disabled = pen.disabled = highlighter.disabled = eraser.disabled = shapes.disabled = moveLayer.disabled = blocked || !layer.visible || layer.locked; pen.title = reason || 'Pen (P/B)';
    highlighter.setAttribute('aria-pressed',String(highlighting));highlighter.title = reason || 'Highlighter (K): constant-width translucent strokes';
    const eraserSettings = api.getToolSettings('eraser'),partial = eraserSettings.mode === 'partial';
    eraser.setAttribute('aria-pressed',String(erasing));eraser.title = reason || (partial ? 'Eraser (E): cut gaps in Pen strokes and lines on the selected layer' : 'Eraser (E): remove whole marks from the selected layer');
    moveLayer.setAttribute('aria-pressed',String(moving));
    moveLayer.title = reason || 'Move Layer (M): drag only the selected layer; Hand pans the view';
    shapes.setAttribute('aria-pressed',String(shape));
    shapes.title = reason || `Shapes: ${shapeNames[api.getShapeTool()]} (L/A/R/O) · use the chevron to choose`;
    if (shapes.dataset.shape !== api.getShapeTool()) {shapes.replaceChildren(icon(api.getShapeTool()));shapes.dataset.shape = api.getShapeTool();}
    shapeChooser.disabled = shapes.disabled;
    if (shapeChooser.disabled && shapeMenu.matches(':popover-open')) shapeMenu.hidePopover();
    for (const [name,choice] of shapeChoices) {choice.disabled = shapes.disabled;choice.setAttribute('aria-pressed',String(name === api.getShapeTool()));}
    properties.hidden = !drawingInk && !shape && !moving && !erasing && !selecting;
    const propertyName = selecting ? 'Selection properties' : moving ? 'Move Layer properties' : erasing ? 'Eraser properties' : shape ? 'Shape properties' : highlighting ? 'Highlighter properties' : 'Pen properties';
    propertiesDisclosure.lastChild.textContent = propertyName;propertiesDisclosure.setAttribute('aria-label',propertyName);propertiesDisclosure.title = propertyName;
    properties.setAttribute('aria-label',propertyName);
    moveTarget.hidden = !moving && !erasing; moveTarget.textContent = moveTarget.title = `Layer: ${layer.name}`;
    eraserFields.hidden = !erasing;radius.value = String(eraserSettings.radius);eraserMode.value = eraserSettings.mode;radius.disabled = eraserMode.disabled = blocked;
    const hasSelection = state.getSelection().length > 0;
    rotate.disabled = blocked || !layer.visible || layer.locked || !layer.elements.length;
    rotate.title = hasSelection ? 'Rotate selected objects clockwise 90°' : 'Rotate active layer clockwise 90°';
    rotateSelection.hidden = !selecting;
    rotateSelection.disabled = blocked || !layer.visible || layer.locked || !hasSelection;
    fields.hidden = !drawingInk; shapeLayout.hidden = !shape; shapeType.value = api.getShapeTool(); shapeType.disabled = blocked;
    const nextShape = shape ? tool : null;
    if (displayedShape !== nextShape) {
      shapeFields.replaceChildren(...(nextShape ? [shapeControls.get(nextShape).panel] : [])); displayedShape = nextShape;
    }
    for (const [name,c] of shapeControls) {
      const s = api.getToolSettings(name);
      // Retain disabled swatches in their own detached panels, not in native data.
      if (s.stroke) c.borderColor.value = s.stroke;
      if (s.fill) c.fillColor.value = s.fill;
      c.borderWidth.value = String(s.strokeWidth); c.border.checked = s.stroke !== null; c.fillEnabled.checked = Boolean(s.fill);
      c.border.disabled = blocked || !s.fill; c.fillEnabled.disabled = blocked || s.stroke === null;
      c.borderColor.disabled = c.borderWidth.disabled = blocked || s.stroke === null; c.fillColor.disabled = blocked || !s.fill;
    }
    widthSlider.disabled = color.disabled = width.disabled = finger.disabled = pressure.disabled = opacity.disabled = blocked;
    const inkName = highlighting ? 'Highlighter' : 'Pen';
    color.setAttribute('aria-label',`${inkName} color`);width.setAttribute('aria-label',`${inkName} width`);widthSlider.setAttribute('aria-label',`${inkName} width slider`);
    pressureLabel.hidden = highlighting;opacityLabel.hidden = !highlighting;
    pressure.checked = api.getToolSettings('pen').pressure;opacity.value = String(Math.round((settings.opacity ?? 1)*100));
    color.value = settings.color; width.value = String(settings.width); finger.checked = api.getDrawWithTouch();
    widthSlider.value = String(settings.width);
    if (previewWidth !== settings.width) {
      const previewCommands = [];visitStrokeOutline({width:settings.width,pressure:false,points:[[36,40,1],[144,40,1]]},command => previewCommands.push(command.join(' ')));
      previewPath.setAttribute('d',previewCommands.join(' '));previewWidth = settings.width;
    }
    previewPath.setAttribute('fill',settings.color);previewPath.setAttribute('fill-opacity',String(settings.opacity ?? 1));
    strokePreview.setAttribute('aria-label',`${inkName} stroke: ${settings.width} world units, ${settings.color}${highlighting ? `, ${Math.round(settings.opacity*100)}% opacity` : ''}`);
    fingerLabel.lastChild.textContent = selecting ? 'Select with finger' : moving ? 'Move with finger' : erasing ? 'Erase with finger' : 'Draw with finger';
    toolNote.hidden = shape && !reason;
    toolNote.textContent = reason || (selecting ? 'Pick or marquee marks; Shift toggles/adds. Drag a mark to move, or a handle to resize. Image corners keep aspect; Shift unlocks (locks other corners). Side handles scale one axis. Arrows nudge; Shift nudges 10. Escape cancels, then clears. Delete removes selection.' : moving ? 'Drag anywhere to move this layer. On small screens, close the sidebar first. Hand pans the whole view.' : erasing ? (partial ? 'Cuts gaps in Pen strokes and straight lines. Surviving ink stays editable. Highlights, shapes, paths and images stay untouched. One Undo restores the whole drag.' : 'Removes whole marks on this layer, including images. Drag or tap; undo restores them. Close the sidebar on small screens.') : highlighting ? 'Constant width · separate strokes build color · new marks only' : 'New marks only · width in world units');
    if (moving || erasing) announce(reason || (moving ? 'Move Layer' : partial ? 'Partial eraser · Pen + lines' : 'Eraser'));
    else if (['move-layer','eraser'].includes(lastTool)) announce('Ready');
    if (lastTool !== null && lastTool !== tool) quickOpen = false;
    quick.hidden = !quickOpen || !hasQuickControls(tool);
    quickTitle.textContent = erasing ? 'Eraser' : shape ? shapeNames[tool] : inkName;
    for (const [control,active] of [[pen,tool === 'pen'],[highlighter,highlighting],[eraser,erasing],[shapes,shape]]) control.setAttribute('aria-expanded',String(active && !quick.hidden));
    quickShapes.hidden = !shape;quickShapes.value = api.getShapeTool();
    quickPaint.hidden = quickWidths.hidden = erasing;quickPreview.hidden = !drawingInk;
    quickPressureLabel.hidden = tool !== 'pen';quickPressure.checked = pressure.checked;
    quickOpacityLabel.hidden = !highlighting;quickOpacity.value = opacity.value;quickOpacityValue.textContent = `Opacity ${opacity.value}%`;
    quickSizes.hidden = quickMode.hidden = !erasing;quickMode.value = eraserSettings.mode;
    quickBorderLabel.hidden = quickFillLabel.hidden = quickFillColor.hidden = !shape || isLineTool(tool);
    const current = shape ? api.getToolSettings(tool) : settings;
    const currentColor = shape ? current.stroke : settings.color;
    quickColor.value = currentColor || (shape ? shapeControls.get(tool).borderColor.value : settings.color);
    for (const [value,swatch] of swatches) swatch.setAttribute('aria-pressed',String(value === currentColor?.toUpperCase()));
    for (const [value,preset] of widthPresets) {
      preset.hidden = !(highlighting ? [8,16,24,40] : [1,3,6,12]).includes(value);
      preset.setAttribute('aria-pressed',String(value === (shape ? current.strokeWidth : settings.width)));
    }
    for (const [value,preset] of sizePresets) preset.setAttribute('aria-pressed',String(value === eraserSettings.radius));
    quickPreview.firstChild.setAttribute('d',previewPath.getAttribute('d'));quickPreview.firstChild.setAttribute('fill',settings.color);
    quickPreview.firstChild.setAttribute('fill-opacity',String(settings.opacity ?? 1));
    quickPreview.setAttribute('aria-label',strokePreview.getAttribute('aria-label'));
    if (shape) {
      quickBorder.checked = current.stroke !== null;quickFill.checked = Boolean(current.fill);
      quickFillColor.value = current.fill || shapeControls.get(tool).fillColor.value;
    }
    for (const control of quick.querySelectorAll('button,input,select')) control.disabled = blocked;
    if (shape) {
      quickBorder.disabled = blocked || !current.fill;quickFill.disabled = blocked || current.stroke === null;
      quickFillColor.disabled = blocked || !current.fill;
      quickColor.disabled = blocked || current.stroke === null;
      for (const preset of widthPresets.values()) preset.disabled = blocked || current.stroke === null;
      for (const swatch of swatches.values()) swatch.disabled = blocked || current.stroke === null;
    }
    lastTool = tool;
    viewport.dataset.tool = tool; viewport.dataset.drawBlocked = String(Boolean(reason));
    const toolNames = {hand:'Hand',select:'Select',pen:'Pen',highlighter:'Highlighter',eraser:'Eraser','move-layer':'Move Layer',line:'Line',arrow:'Arrow',rect:'Rectangle',ellipse:'Ellipse'};
    statusContext.textContent = `${toolNames[tool]} · ${layer.name}`;statusContext.title = statusContext.textContent;
    const hiddenArtwork = state.document.layers.some(layer => layer.elements.length);
    emptyHeading.textContent = hiddenArtwork ? 'No visible artwork' : state.readOnly ? 'No artwork to display' : 'Start drawing';
    emptyHelp.textContent = hiddenArtwork ? 'Show a layer in Layers to see your drawing.' : state.readOnly ? 'Load an Etch document to view it. Drag to pan; Ctrl/Cmd + wheel to zoom.' : 'Choose a tool above, or drag a PNG, JPEG or WebP image here.';
    emptyActions.hidden = state.readOnly;emptyDrawing.disabled = emptyImage.disabled = blocked;
  }
  function refresh() {
    if (destroyed) return;
    refreshTools();
    const blocked = state.readOnly || state.busy;
    root.setAttribute('aria-busy', String(state.busy));
    newButton.disabled = importButton.disabled = nativeImportButton.disabled = svgImportButton.disabled = backgroundButton.disabled = blocked;
    backgroundButton.title = blocked ? (state.readOnly ? 'Read-only document background' : 'Wait for the current operation') : `Document background: ${describeBackground(state.document.background)}`;
    refreshBackgroundDialog();
    const activeLayer = state.document.layers.find(l => l.id === state.getActiveLayer());
    layerOptionsButton.disabled = blocked || activeLayer.locked;
    layerOptionsButton.title = activeLayer.locked ? `Unlock ${activeLayer.name} to edit its options` : `Rename, reorder or merge ${activeLayer.name}`;
    refreshLayerDialog();
    if (boundsDocument !== state.document) {
      message.hidden = documentBounds(state.document) !== null;
      const bounds = exportBounds(state.document),number = n => String(Number(n.toFixed(2)));
      exportSize.textContent = `Export ${number(bounds.width)} × ${number(bounds.height)}`;
      exportSize.title = `Default export surface: ${number(bounds.width)} × ${number(bounds.height)} world units; origin (${number(bounds.x)}, ${number(bounds.y)}), including 16 units of padding. Custom export options may differ.`;
      exportSize.setAttribute('aria-label',exportSize.title);
      summary.textContent = state.document.layers.map(layer => {
        const types = new Map(), descriptions = []; let images = 0;
        for (const element of layer.elements) {
          types.set(element.type,(types.get(element.type) ?? 0)+1);
          if (element.type === 'image') {
            if (++images <= 8) descriptions.push(element.alt.slice(0,120) || 'Unlabeled image');
          }
        }
        const counts = [...types].map(([type,count]) => `${count} ${type}`).join(', ');
        return `${layer.name}: ${layer.elements.length} marks${counts ? ` (${counts})` : ''}${layer.visible ? '' : ', hidden'}${layer.locked ? ', locked' : ''}`
          + (images ? `. Images: ${descriptions.join('; ')}${images > 8 ? `; and ${images-8} more` : ''}` : '');
      }).join('. ');
      boundsDocument = state.document;
    }
    undoButton.disabled = blocked || !state.canUndo();
    redoButton.disabled = blocked || !state.canRedo();
    // Session selection does not change layer rows or document-derived text.
    // Busy transitions still rebuild disabled controls through the existing path.
    if (layersDocument === state.document && layersBlocked === blocked) {
      for (const button of layers.querySelectorAll('.etch-layer-select')) button.setAttribute('aria-pressed',String(button.dataset.etchLayerId === state.getActiveLayer()));
      return;
    }
    const focusKey = root.contains(doc.activeElement) ? doc.activeElement.dataset.etchFocus : undefined;
    const frag = doc.createDocumentFragment();
    for (const layer of [...state.document.layers].reverse()) {
      const row = node('div', 'etch-layer');
      const select = button(`${layer.name} (${layer.elements.length})`, () => api.setActiveLayer(layer.id), row, null, true);
      select.classList.add('etch-layer-select');
      select.replaceChildren(node('span', 'etch-layer-indicator'), node('span', 'etch-layer-name', layer.name),
        node('span', 'etch-layer-count', String(layer.elements.length)));
      select.firstChild.setAttribute('aria-hidden', 'true');
      select.setAttribute('aria-pressed', String(state.getActiveLayer() === layer.id));
      select.dataset.etchFocus = `${layer.id}:select`;select.dataset.etchLayerId = layer.id;
      const visible = button(`${layer.visible ? 'Hide' : 'Show'} ${layer.name}`,
        () => api.setLayerVisibility(layer.id, !layer.visible), row, layer.visible ? 'eye' : 'eye-off');
      visible.disabled = blocked;
      visible.dataset.etchFocus = `${layer.id}:visible`;
      const lock = button(`${layer.locked ? 'Unlock' : 'Lock'} ${layer.name}`,
        () => api.setLayerLocked(layer.id, !layer.locked), row, layer.locked ? 'lock' : 'unlock');
      lock.disabled = blocked;
      lock.dataset.etchFocus = `${layer.id}:lock`;
      const remove = button(`Delete layer ${layer.name}`,() => {
        if (layer.elements.length && !doc.defaultView.confirm(`Delete layer “${layer.name}” and its ${layer.elements.length} mark(s)? You can undo this.`)) return;
        api.deleteLayer(layer.id);
        announce(`Deleted layer “${layer.name}”. Undo restores it.`);
      },row,'trash');
      remove.classList.add('etch-layer-delete');remove.disabled = blocked || layer.locked;
      remove.title = layer.locked ? `Unlock ${layer.name} before deleting it` : `Delete layer ${layer.name}`;
      remove.dataset.etchFocus = `${layer.id}:delete`;
      frag.append(row);
    }
    layers.replaceChildren(frag);
    layersDocument = state.document;layersBlocked = blocked;
    if (focusKey && sidebarOpen) {
      const buttons = [...layers.querySelectorAll('button')];
      (buttons.find(el => el.dataset.etchFocus === focusKey) ?? buttons.find(el => el.dataset.etchFocus === `${state.getActiveLayer()}:select`))?.focus({ preventScroll: true });
    }
  }
  function keydown(event) {
    if (event.key === 'Escape' && exportMenu.matches(':popover-open')) {event.preventDefault();event.stopPropagation();closeExportMenu();return;}
    if (event.key === 'Escape' && (imageDialog.open || layerDialog.open || backgroundDialog.open || nativeDialog.open)) return; // Let the modal close without collapsing the sidebar.
    if (event.key === 'F2' && event.target.closest('.etch-layer-select')) {event.preventDefault();run(() => openLayerDialog(event.target.closest('.etch-layer-select').dataset.etchLayerId));return;}
    if (event.target.closest('.etch-shape-menu, .etch-export-menu')) return;
    if (event.target.closest('dialog[open], input, textarea, select, [contenteditable]:not([contenteditable="false"])')) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
      if (state.readOnly || state.busy) return;
      event.preventDefault(); run(() => event.shiftKey ? api.redo() : api.undo());
    } else if (event.ctrlKey && event.key.toLowerCase() === 'y') {
      if (state.readOnly || state.busy) return;
      event.preventDefault(); run(() => api.redo());
    } else if (event.key === 'Escape') {
      // Select owns Escape in the viewport: first cancel its gesture, then clear selection.
      if (api.getTool() === 'select' && event.target === viewport) return;
      event.preventDefault(); run(() => api.cancel());
      if (sidebarOpen) setSidebarOpen(false);
    }
  }
  root.addEventListener('keydown',keydown);
  refresh();
  return {
    root, viewport, refresh, refreshTools, selectTool, closeBackgroundDialog,
    updateView({zoom,expanded}) {
      if (destroyed) return;
      zoomLabel.textContent = `${Math.round(zoom*100)}%`;
      statusZoom.textContent = zoomLabel.textContent;statusZoom.setAttribute('aria-label',`Zoom ${statusZoom.textContent}`);
      // Browsers can reserve Escape for native fullscreen and skip menu keydown.
      if (fullscreen.getAttribute('aria-pressed') !== String(expanded) && exportMenu.matches(':popover-open')) exportMenu.hidePopover();
      fullscreen.setAttribute('aria-pressed',String(expanded));
      fullscreen.setAttribute('aria-label',expanded ? 'Exit fullscreen' : 'Fullscreen');
      fullscreen.title = expanded ? 'Exit fullscreen (Escape)' : 'Fullscreen';
    },
    announce,
    destroy() { destroyed = true;for (const [url,timer] of downloadURLs) {if (timer !== null) doc.defaultView.clearTimeout(timer);doc.defaultView.URL.revokeObjectURL(url);}downloadURLs.clear();boundsDocument = layersDocument = null;sidebarResize.destroy(); closeImageDialog();closeLayerDialog(false);closeBackgroundDialog(false);closeNativeDialog(false);root.removeEventListener('keydown',keydown); root.remove(); },
  };
}
