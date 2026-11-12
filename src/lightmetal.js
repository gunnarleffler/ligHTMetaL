/**
 * lightmetal — Lightweight HTML editing. Zero runtime dependencies.
 *
 * Inspired by Pell (https://github.com/jaredreich/pell) by Jared Reich.
 * See LICENSE.
 */

import { createToolbarOverflow } from './html-toolbar-overflow.js';
import { formattingActions, createFormattingControls } from './html-formatting.js';

const FORMAT_BLOCK = "formatBlock";
const PARAGRAPH_SEPARATOR = "defaultParagraphSeparator";

/**
 * Run a native editing command. Every command flows through this single
 * seam, so the execCommand implementation can be replaced here later
 * without touching the rest of the editor.
 */
export const exec = (command, value = null) => {
  const activeElement = document.activeElement;
  const result = document.execCommand(command, false, value);
  // execCommand can drop focus; hand it back so workflows that pause
  // (file pickers, async uploads) reinsert at the original position.
  if (activeElement && typeof activeElement.focus === "function" &&
      document.activeElement !== activeElement) {
    activeElement.focus();
  }
  return result;
};

const SVG_MARKUP = {
  bold: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4h7a4 4 0 0 1 0 8H6V4Zm0 8h8a4 4 0 0 1 0 8H6v-8Z"/></svg>',
  italic: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 4h8M6 20h8M15 4 9 20"/></svg>',
  underline: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4v7a6 6 0 0 0 12 0V4M4 21h16"/></svg>',
  strikethrough: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 6c-1.2-1.4-3-2-5-2-3 0-5 1.5-5 4 0 1.6 1.2 2.6 3 3.2M7 18c1.2 1.3 3 2 5 2 3 0 5-1.5 5-4 0-1.6-1.2-2.6-3-3.2M4 12h16"/></svg>',
  heading1: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 5v14M11 5v14M3 12h8M16 9l3-2v12M16 19h6"/></svg>',
  heading2: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 5v14M11 5v14M3 12h8M16 9a3 3 0 0 1 6 1c0 2-2 3.5-6 9h6"/></svg>',
  paragraph: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 4H10a5 5 0 0 0 0 10h2M12 4v16M16 4v16"/></svg>',
  quote: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 6c-3 2-4 4-4 7v5h5v-5H7M19 6c-3 2-4 4-4 7v5h5v-5h-4"/></svg>',
  olist: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 5l2-1v5M3 14c0-2 3-2 3 0 0 1-3 3-3 4h3M11 6h10M11 12h10M11 18h10"/></svg>',
  ulist: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/><path d="M10 6h11M10 12h11M10 18h11"/></svg>',
  code: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m8 7-5 5 5 5m8-10 5 5-5 5m-3-13-2 16"/></svg>',
  line: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12h16"/></svg>',
  link: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7 .5l2.5-2.5a5 5 0 0 0-7-7L11 5.5M14 11a5 5 0 0 0-7-.5L4.5 13a5 5 0 0 0 7 7L13 18.5"/></svg>',
  image: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9" r="1.5"/><path d="m21 16-5-5L7 20"/></svg>',
  table: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/></svg>',
  source: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V10l-7-7Zm0 0v7h7M9 14l-2 2 2 2m6-4 2 2-2 2"/></svg>'
};

const defaultActions = {
  bold: {
    icon: SVG_MARKUP.bold,
    title: "Bold",
    state: () => document.queryCommandState("bold"),
    result: () => exec("bold")
  },
  italic: {
    icon: SVG_MARKUP.italic,
    title: "Italic",
    state: () => document.queryCommandState("italic"),
    result: () => exec("italic")
  },
  underline: {
    icon: SVG_MARKUP.underline,
    title: "Underline",
    state: () => document.queryCommandState("underline"),
    result: () => exec("underline")
  },
  strikethrough: {
    icon: SVG_MARKUP.strikethrough,
    title: "Strike-through",
    state: () => document.queryCommandState("strikeThrough"),
    result: () => exec("strikeThrough")
  },
  heading1: {
    icon: SVG_MARKUP.heading1,
    title: "Heading 1",
    result: () => exec(FORMAT_BLOCK, "<h1>")
  },
  heading2: {
    icon: SVG_MARKUP.heading2,
    title: "Heading 2",
    result: () => exec(FORMAT_BLOCK, "<h2>")
  },
  paragraph: {
    icon: SVG_MARKUP.paragraph,
    title: "Paragraph",
    result: () => exec(FORMAT_BLOCK, "<p>")
  },
  quote: {
    icon: SVG_MARKUP.quote,
    title: "Quote",
    result: () => exec(FORMAT_BLOCK, "<blockquote>")
  },
  olist: {
    icon: SVG_MARKUP.olist,
    title: "Ordered List",
    result: () => exec("insertOrderedList")
  },
  ulist: {
    icon: SVG_MARKUP.ulist,
    title: "Unordered List",
    result: () => exec("insertUnorderedList")
  },
  code: {
    icon: SVG_MARKUP.code,
    title: "Code",
    result: () => exec(FORMAT_BLOCK, "<pre>")
  },
  line: {
    icon: SVG_MARKUP.line,
    title: "Horizontal Line",
    result: () => exec("insertHorizontalRule")
  },
  // result() is replaced per instance with the editor's link workflow.
  link: {
    icon: SVG_MARKUP.link,
    title: "Link",
    result: () => true
  },
  // result() is replaced per instance with the editor's table workflow.
  table: {
    icon: SVG_MARKUP.table,
    title: "Table",
    result: () => true
  },
  // result() is replaced per instance with the editor's image workflow.
  image: {
    icon: SVG_MARKUP.image,
    title: "Image",
    result: () => true
  }
};

Object.assign(defaultActions, formattingActions);

const defaultClasses = {
  actionbar: "lightmetal-actionbar",
  button: "lightmetal-button",
  content: "lightmetal-content",
  source: "lightmetal-sources",
  selected: "lightmetal-button-selected",
  drop: "lightmetal-drop",
  error: "lightmetal-error"
};

const DEFAULT_IMAGE_SETTINGS = {
  enabled: true,
  allowURL: true,
  allowBase64: true,
  dragDrop: true,
  paste: true,
  maxSize: 2 * 1024 * 1024,
  onInsert: null
};

// Bound accidental table growth without blocking everyday reference tables.
const TABLE_LIMITS = { rows: 1000, columns: 100, cells: 10000 };
const DEFAULT_TABLE_SETTINGS = {
  gridColumns: 10, gridRows: 8,
  maxRows: TABLE_LIMITS.rows, maxColumns: TABLE_LIMITS.columns, maxCells: TABLE_LIMITS.cells
};
let tableDropdownCounter = 0;
const TABLE_SIZE_ERROR = "Use 1–1,000 rows and 1–100 columns, up to 10,000 cells.";
const tableSizeAllowed = (rows, columns) =>
  rows >= 1 && columns >= 1 && rows <= TABLE_LIMITS.rows &&
  columns <= TABLE_LIMITS.columns && rows * columns <= TABLE_LIMITS.cells;

// Formats we accept. Anything else is rejected.
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];

// Files with no MIME type are identified by extension.
const IMAGE_EXT_TYPES = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp"
};

/**
 * Map the requested actions to action definitions. `requested` is a list of
 * action names or objects; when omitted, the grouped default toolbar is used.
 * Individual heading1/heading2 actions remain available in explicit arrays.
 */
const resolveActions = (requested, sourceAction, fullscreenAction) => {
  if (!requested) {
    return ['insert','blocks','bold','italic','underline','strikethrough','text',
      'alignment','lists','table','link','image'].map(name => defaultActions[name])
      .concat(defaultActions.code, fullscreenAction, sourceAction, defaultActions.formatting, defaultActions.indentation, defaultActions.undo, defaultActions.redo).filter(Boolean);
  }
  if (!Array.isArray(requested)) throw new TypeError("actions must be an array.");
  return requested.map((action) => {
    if (typeof action === "string") {
      const definition = action === "source" ? sourceAction : action === "fullscreen" ? fullscreenAction : defaultActions[action];
      if (!definition) throw new TypeError(`Unknown toolbar action: ${action}`);
      return definition;
    }
    if (!action || typeof action !== "object") throw new TypeError("Toolbar actions must be names or objects.");
    if (action.name === "source" && sourceAction) {
      return { ...sourceAction, ...action };
    }
    if (action.name === "fullscreen") return { ...fullscreenAction, ...action };
    if (defaultActions[action.name]) {
      return { ...defaultActions[action.name], ...action };
    }
    return action;
  });
};

/**
 * Read a File as a base64 data URI.
 */
const fileToDataURI = (file) =>
  new Promise((resolve, reject) => {
    if (typeof FileReader === "undefined") {
      reject(new Error("FileReader is not available in this environment"));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Could not read the image file"));
    reader.readAsDataURL(file);
  });

/**
 * Best-effort intrinsic width of an image, used for the alt attribute.
 * Returns null where image decoding is unavailable or slow.
 */
const imageWidth = (url) => {
  if (typeof Image === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    const done = (width) => {
      img.onload = null;
      img.onerror = null;
      resolve(width);
    };
    const failSoft = setTimeout(() => done(null), 4000);
    img.onload = () => {
      clearTimeout(failSoft);
      done(img.naturalWidth || null);
    };
    img.onerror = () => {
      clearTimeout(failSoft);
      done(null);
    };
    img.src = url;
  });
};

// Human-friendly byte sizes for messages.
const fmtSize = (bytes) =>
  bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;

// ---------------------------------------------------------------------
// Sanitization. Pasted and imported HTML is treated as untrusted.
// The sanitizer parses with the DOM (no regular expressions) and keeps
// only the tags and attributes on the allow-lists below.

const ALLOWED_TAGS = new Set([
  "a", "abbr", "b", "blockquote", "br", "caption", "col", "colgroup", "code", "dd", "div",
  "dl", "dt", "em", "figcaption", "figure", "h1", "h2", "h3", "h4",
  "h5", "h6", "hr", "i", "img", "li", "ol", "p", "pre", "s", "span",
  "strike", "strong", "sub", "sup", "table", "tbody", "td", "tfoot",
  "th", "thead", "tr", "u", "ul"
]);

const ALLOWED_ATTRS = new Set([
  "align", "alt", "cellpadding", "cellspacing", "colspan", "dir",
  "height", "href", "lang", "rowspan", "rows", "src", "start", "title",
  "width"
]);

// Keep table header relationships and column metadata without allowing
// these attributes on unrelated elements. Styles and handlers stay blocked.
const TABLE_ATTRS = {
  th: new Set(["abbr", "headers", "id", "scope"]),
  td: new Set(["headers", "id"]),
  col: new Set(["span"]),
  colgroup: new Set(["span"])
};

// Validate supported MIME types and base64 syntax, not the image's bytes.
const allowImageDataURI = (value) => {
  const match = /^data:(image\/[a-z0-9+\-.]+);base64,([a-z0-9+/]+={0,2})$/i.exec(value);
  if (!match || !IMAGE_TYPES.includes(match[1].toLowerCase())) return false;
  try {
    atob(match[2]);
    return true;
  } catch {
    return false;
  }
};

// Relative URLs must resolve to HTTP(S); mailto is allowed only for links.
const allowLinkURL = (value, base, isLink, allowBase64 = false) => {
  const trimmed = String(value).trim();
  if (isLink && /^mailto:/i.test(trimmed)) return true;
  if (!isLink && allowBase64 && allowImageDataURI(trimmed)) return true;
  try {
    const parsed = new URL(trimmed, base);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
};

/**
 * Sanitize an HTML fragment. Allowed tags and attributes are kept;
 * everything else is dropped. Scripts and styles are removed with their
 * contents; unknown elements are unwrapped so their text and safe
 * children survive. Event handlers and dangerous URL schemes never
 * pass.
 */
const sanitizeHTML = (html, base, allowBase64) => {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const root = doc.body;
  const cleanAttributes = (el) => {
    const tag = el.tagName.toLowerCase();
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      let ok = ALLOWED_ATTRS.has(name) || !!TABLE_ATTRS[tag]?.has(name);
      if (ok && name === "href" && tag !== "a") ok = false;
      if (ok && name === "src" && tag !== "img") ok = false;
      if (ok && (name === "href" || name === "src") &&
          !allowLinkURL(attr.value, base, name === "href", allowBase64)) ok = false;
      if (!ok) el.removeAttribute(attr.name);
    }
  };
  const clean = (node) => {
    for (const el of Array.from(node.children)) {
      const tag = el.tagName.toLowerCase();
      if (tag === "script" || tag === "style") {
        el.remove();
      } else if (ALLOWED_TAGS.has(tag)) {
        cleanAttributes(el);
        clean(el);
      } else {
        clean(el);
        el.replaceWith(...el.childNodes);
      }
    }
  };
  clean(root);
  return root.innerHTML;
};

// Count for alt text so stacked images stay distinguishable.
let imageCounter = 0;
const fullscreenOwners = new WeakMap();

/**
 * Create an editor inside settings.element.
 *
 * Settings:
 *   element (required)           host <div>
 *   actions                      list of action names or action objects
 *   classes                      override the generated class names
 *   onChange(html)               fired with the new HTML in either mode
 *   defaultParagraphSeparator    "div" (default) or "p"
 *   styleWithCSS                 use CSS properties when formatting
 *   images                       object, see below
 *   tables                       object, see below
 *   rawMode                      bypass HTML import/paste sanitization;
 *                URL checks and file type/size limits still apply
 *   unrestrictedMode             also bypass URL and file type/size checks;
 *                trusted content only. Explicit image switches still apply.
 *
 * `images` options:
 *   enabled      insert images at all (default true)
 *   allowURL     URL prompt on the toolbar button (default true; when false
 *                the button opens a file picker instead)
 *   allowBase64  allow base64 images in sanitized imports and image insertion
 *                (default true). Raw/unrestricted HTML and Source edits bypass
 *                import filtering.
 *   dragDrop     insert files dropped onto the editor (default true)
 *   paste        insert images copied to the clipboard (default true)
 *   maxSize      max bytes for pasted/dropped/picked files
 *                (default 2 * 1024 * 1024)
 *   onInsert     async file => URL | dataURI; when set, files go through
 *                your handler instead of becoming data URIs, so apps can
 *                store images externally rather than embedding base64
 *
 * `tables` options (all positive integers):
 *   gridColumns  picker columns (default 10)
 *   gridRows     picker rows (default 8)
 *   maxRows      insertion row limit (default 1,000)
 *   maxColumns   insertion column limit (default 100)
 *   maxCells     insertion cell limit (default 10,000)
 *
 * Returns { element, content, source, getHTML, setHTML, getText, insertTable, insertImage,
 *           destroy }.
 */
export const init = (settings) => {
  const element = settings.element;
  const classes = { ...defaultClasses, ...settings.classes };
  const separator = settings[PARAGRAPH_SEPARATOR] || "div";
  const images = { ...DEFAULT_IMAGE_SETTINGS, ...settings.images };
  const tables = { ...DEFAULT_TABLE_SETTINGS, ...settings.tables };
  for (const value of Object.values(tables)) {
    if (!Number.isInteger(value) || value < 1) throw new TypeError("Table options must be positive integers.");
  }
  const gridColumns = Math.min(tables.gridColumns, tables.maxColumns, tables.maxCells);
  const gridRows = Math.min(tables.gridRows, tables.maxRows, Math.floor(tables.maxCells / gridColumns));
  const unrestricted = settings.unrestrictedMode === true;
  const sanitized = !unrestricted && settings.rawMode !== true;
  const baseURI = element.ownerDocument.baseURI;

  // "wysiwyg" or "source".
  let mode = "wysiwyg";
  let destroyed = false;
  let fullscreen = null, composing = false;
  const fullscreenButtons = [];
  let formatTimer = 0;
  let insertionUI = null;
  const insertionObserver = new MutationObserver(() => closeInsertion());
  const insertionCleanups = [];
  const listenInsertion = (target,type,handler) => {
    target.addEventListener(type,handler);
    insertionCleanups.push(() => target.removeEventListener(type,handler));
  };
  function closeInsertion(restoreFocus = false) {
    const state = insertionUI;
    insertionUI = null;
    const changed = insertionObserver.takeRecords().length;
    insertionObserver.disconnect();
    insertionCleanups.splice(0).forEach(cleanup => cleanup());
    if (!state) return;
    if (state.popup.hasAttribute('popover') && state.popup.matches(':popover-open')) state.popup.hidePopover();
    state.popup.remove();
    state.trigger.setAttribute('aria-expanded','false');
    if (restoreFocus) {
      if (!changed && !destroyed && mode !== 'source' && content.contains(state.range.commonAncestorContainer)) {
        const selection = document.getSelection(); selection.removeAllRanges(); selection.addRange(state.range.cloneRange());
      }
      (state.trigger.closest('.lightmetal-overflow') ? overflow.trigger : state.trigger).focus();
    }
  }
  let tableDropdown = null;
  let tableMenu = null, tableInsertItem = null;
  const tableMenuButtons = new Map();
  let tableTrigger = null;
  let tableRange = null;
  let tableMessage = null;
  let resetTableDropdown = null;

  const sourceAction = {
    icon: SVG_MARKUP.code,
    title: "Source",
    state: () => mode === "source",
    result: () => (mode === "source" ? exitSource() : enterSource())
  };
  const fullscreenAction = {
    name: 'fullscreen', title: 'Fullscreen',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/></svg>',
    state: () => !!fullscreen,
    result: toggleFullscreen
  };
  const resolvedActions = resolveActions(settings.actions, sourceAction, fullscreenAction);
  resolvedActions.forEach((action, index) => {
    const workflow = action && (action.name === "image" || action.name === "table") && !action.result;
    if (!action || (typeof action.result !== "function" && !workflow)) {
      throw new TypeError(`Toolbar action ${index + 1} must have a result function.`);
    }
    if (action.state && typeof action.state !== "function") {
      throw new TypeError(`Toolbar action ${index + 1} must have a state function.`);
    }
  });

  const ownsHTMLClass = !element.classList.contains('lightmetal-html');
  const cleanups = [];
  const listen = (target, type, handler, options = false) => {
    target.addEventListener(type, handler, options);
    cleanups.push(() => target.removeEventListener(type, handler, options));
  };

  const actionbar = document.createElement("div");
  actionbar.className = classes.actionbar;
  // Scrolling containers can otherwise become automatic browser Tab stops.
  actionbar.tabIndex = -1;

  const tablebar = document.createElement("div");
  tablebar.className = "lightmetal-tablebar";
  tablebar.setAttribute("role", "group");
  tablebar.setAttribute("aria-label", "Table controls");
  tablebar.hidden = true;
  let activeCell = null;

  const content = document.createElement("div");
  content.contentEditable = "true";
  content.className = classes.content;
  content.classList.add('lightmetal-fullscreen-surface');
  content.setAttribute("role", "textbox");
  content.setAttribute("aria-label", "HTML content");
  content.setAttribute("aria-multiline", "true");

  const source = document.createElement("textarea");
  source.className = classes.source;
  source.classList.add('lightmetal-fullscreen-surface');
  source.setAttribute("aria-label", "HTML source");
  source.spellcheck = false;
  source.hidden = true;

  const enterSource = () => {
    closeInsertion();
    clearTimeout(formatTimer);
    closeTableMenu(); closeTableDropdown(); formatting.close();
    mode = "source";
    for (const {button,name} of toolbarButtons) if (!['source','fullscreen'].includes(name)) button.disabled = true;
    formatting.refresh();
    source.value = content.innerHTML;
    content.hidden = true;
    source.hidden = false;
    source.focus();
    updateTableControls();
    updateFullscreenLayout();
  };

  const exitSource = () => {
    content.innerHTML = source.value;
    source.hidden = true;
    content.hidden = false;
    mode = "wysiwyg";
    for (const {button} of toolbarButtons) button.disabled = false;
    formatting.refresh();
    updateTableControls();
    updateFullscreenLayout();
    if (settings.onChange) settings.onChange(content.innerHTML);
    return true;
  };

  // Fullscreen changes layout only. Keep the editing nodes and native history.
  const fullscreenProperties = ['--lightmetal-fullscreen-writing-height','--lightmetal-fullscreen-x','--lightmetal-fullscreen-y'];
  function setFullscreenProperty(name,value) {
    if (element.style.getPropertyValue(name) !== value) element.style.setProperty(name,value);
    fullscreen.values[name] = value;
  }
  const fullscreenResize = typeof ResizeObserver === 'function' ? new ResizeObserver(() => updateFullscreenLayout()) : null;
  function updateFullscreenLayout() {
    if (!fullscreen) return;
    const field = mode === 'source' ? source : content;
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    const height = Math.max(0,rect.bottom - parseFloat(style.borderBottomWidth || 0) -
      parseFloat(style.paddingBottom || 0) - field.getBoundingClientRect().top);
    fullscreen.translateX -= rect.left; fullscreen.translateY -= rect.top;
    setFullscreenProperty(fullscreenProperties[0],`${height}px`);
    setFullscreenProperty(fullscreenProperties[1],`${fullscreen.translateX}px`);
    setFullscreenProperty(fullscreenProperties[2],`${fullscreen.translateY}px`);
  }
  function updateFullscreenButtons() {
    for (const button of fullscreenButtons) {
      button.classList.toggle(classes.selected, !!fullscreen);
      button.setAttribute('aria-pressed', String(!!fullscreen));
    }
  }
  function writingSelection() {
    if (mode === 'source') return {start:source.selectionStart,end:source.selectionEnd,direction:source.selectionDirection};
    const selection = document.getSelection();
    if (!selection?.rangeCount || !content.contains(selection.anchorNode) || !content.contains(selection.focusNode)) return null;
    return {anchor:selection.anchorNode,anchorOffset:selection.anchorOffset,focus:selection.focusNode,focusOffset:selection.focusOffset};
  }
  function focusWriting(selection) {
    const sourceMode = mode === 'source', field = sourceMode ? source : content;
    if (document.activeElement !== field) field.focus({preventScroll:true});
    if (destroyed || sourceMode !== (mode === 'source')) return;
    if (sourceMode && selection) source.setSelectionRange(selection.start,selection.end,selection.direction);
    else if (selection && content.contains(selection.anchor) && content.contains(selection.focus)) {
      document.getSelection().setBaseAndExtent(selection.anchor,selection.anchorOffset,selection.focus,selection.focusOffset);
    }
  }
  function exitFullscreen(focus = true) {
    if (!fullscreen) return false;
    const state = fullscreen, selection = writingSelection();
    // Restore focus before layout changes; focusing during Firefox frame
    // reconstruction can discard native textarea history.
    if (!destroyed && focus) focusWriting(selection);
    if (fullscreen !== state) return true;
    fullscreen = null;
    fullscreenResize?.disconnect();
    for (const [node,name,owned] of state.classes) if (owned) node.classList.remove(name);
    for (const [name,value,priority] of state.styles) {
      if (element.style.getPropertyValue(name) !== state.values[name]) continue;
      if (value) element.style.setProperty(name,value,priority);
      else element.style.removeProperty(name);
    }
    if (!state.hadStyleAttribute && !element.style.length) element.removeAttribute('style');
    if (fullscreenOwners.get(document) === exitFullscreen) fullscreenOwners.delete(document);
    content.scrollTop = state.contentTop; content.scrollLeft = state.contentLeft;
    source.scrollTop = state.sourceTop; source.scrollLeft = state.sourceLeft;
    actionbar.scrollLeft = state.toolbarLeft;
    window.scrollTo(state.x,state.y);
    updateFullscreenButtons();
    return true;
  }
  function toggleFullscreen() {
    if (destroyed || composing || !element.isConnected) return false;
    closeInsertion();
    closeTableMenu(); closeTableDropdown(); formatting.close();
    if (fullscreen) return exitFullscreen();
    fullscreenOwners.get(document)?.(false);
    const selection = writingSelection();
    fullscreen = {
      contentTop:content.scrollTop,contentLeft:content.scrollLeft,
      sourceTop:source.scrollTop,sourceLeft:source.scrollLeft,toolbarLeft:actionbar.scrollLeft,
      x:window.scrollX,y:window.scrollY,
      hadStyleAttribute:element.hasAttribute('style'),
      styles:fullscreenProperties.map(name => [name,element.style.getPropertyValue(name),element.style.getPropertyPriority(name)]),
      values:{},translateX:0,translateY:0,
      classes:[[element,'lightmetal-fullscreen'],[document.documentElement,'lightmetal-page-fullscreen']]
        .map(([node,name]) => [node,name,!node.classList.contains(name)])
    };
    focusWriting(selection);
    if (destroyed || !fullscreen) return false;
    fullscreenOwners.set(document,exitFullscreen);
    setFullscreenProperty(fullscreenProperties[1],'0px'); setFullscreenProperty(fullscreenProperties[2],'0px');
    for (const [node,name] of fullscreen.classes) node.classList.add(name);
    updateFullscreenLayout();
    for (const node of [element,actionbar,tablebar]) fullscreenResize?.observe(node);
    updateFullscreenButtons();
    return true;
  }

  // ---- Images ------------------------------------------------------------

  const imageURLError = (url) => {
    if (/^data:[^,]*;base64,/i.test(String(url).trim()) && !images.allowBase64) {
      return "Base64 images are disabled";
    }
    if (!unrestricted && !allowLinkURL(url, baseURI, false, images.allowBase64)) {
      return "Refusing to insert an unsafe image URL";
    }
    return null;
  };

  const linkResult = button => openInsertion('link',button);

  // Make sure the caret is inside the editor before inserting, so
  // programmatic insertion lands at a predictable spot (the caret if the
  // user is editing, the end of the content otherwise).
  const ensureCaret = () => {
    const sel = document.getSelection();
    if (!sel || !sel.rangeCount || !content.contains(sel.getRangeAt(0).commonAncestorContainer)) {
      content.focus();
      const range = document.createRange();
      range.selectNodeContents(content);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    }
  };

  const tableError = (message) => {
    if (tableDropdown && !tableDropdown.hidden) tableMessage.textContent = message;
    return false;
  };

  const captureTableRange = () => {
    const selection = document.getSelection();
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
    tableRange = range && content.contains(range.commonAncestorContainer) ? range.cloneRange() : null;
  };

  const tableAnchor = () => tableTrigger?.closest('.lightmetal-overflow') ? element.querySelector('.lightmetal-overflow-trigger') : tableTrigger;
  const closeTableMenu = (restoreFocus = false) => {
    if (!tableMenu || tableMenu.hidden) return;
    if (tableMenu.hasAttribute("popover") && tableMenu.matches(":popover-open")) tableMenu.hidePopover();
    tableMenu.hidden = true;
    tableTrigger?.setAttribute("aria-expanded", "false");
    if (restoreFocus && !destroyed) tableAnchor()?.focus();
  };

  const closeTableDropdown = (restoreFocus = false) => {
    if (tableDropdown && !tableDropdown.hidden) {
      if (tableDropdown.hasAttribute("popover")) tableDropdown.hidePopover();
      tableDropdown.hidden = true;
      tableInsertItem?.setAttribute("aria-expanded", "false");
      tableTrigger?.setAttribute("aria-expanded", "false");
      if (restoreFocus) tableAnchor()?.focus();
    }
    tableRange = null;
  };

  // Construct with the DOM, then use native insertion for undo/onChange.
  const insertTable = (rows = 3, columns = 3, savedRange = null) => {
    if (mode === "source" || destroyed) return false;
    if (!Number.isInteger(rows) || !Number.isInteger(columns) || rows < 1 || columns < 1 ||
        rows > tables.maxRows || columns > tables.maxColumns || rows * columns > tables.maxCells) {
      return tableError(`Use 1–${tables.maxRows} rows and 1–${tables.maxColumns} columns, up to ${tables.maxCells} cells.`);
    }
    if (savedRange) {
      if (!content.contains(savedRange.commonAncestorContainer)) return tableError("The insertion position is no longer available.");
      content.focus();
      const selection = document.getSelection();
      selection.removeAllRanges();
      selection.addRange(savedRange);
    } else ensureCaret();
    const range = document.getSelection().getRangeAt(0);
    const insideTable = (node) => {
      const el = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
      return content.contains(el?.closest("table"));
    };
    if (insideTable(range.startContainer) || insideTable(range.endContainer)) {
      return tableError("Place the cursor outside a table before inserting another one.");
    }
    content.focus();
    const selection = document.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    const table = document.createElement("table");
    const body = table.createTBody();
    for (let row = 0; row < rows; row++) {
      const tr = body.insertRow();
      for (let column = 0; column < columns; column++) tr.insertCell().appendChild(document.createElement("br"));
    }
    const existing = new Set(content.querySelectorAll("table"));
    const ok = exec("insertHTML", table.outerHTML + `<${separator}><br></${separator}>`);
    if (!ok) return tableError("Could not insert the table.");
    closeTableDropdown();
    content.focus();
    const inserted = Array.from(content.querySelectorAll("table")).find((node) => !existing.has(node));
    if (inserted) {
      range.selectNodeContents(inserted.rows[0].cells[0]);
      range.collapse(true);
      const selection = document.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    }
    updateTableControls();
    return true;
  };

  const positionTableDropdown = () => {
    if (!tableDropdown || tableDropdown.hidden) return;
    tableDropdown.style.maxWidth = `${Math.max(0, window.innerWidth - 16)}px`;
    tableDropdown.style.maxHeight = `${Math.max(0, window.innerHeight - 16)}px`;
    const anchor = tableAnchor().getBoundingClientRect();
    const popup = tableDropdown.getBoundingClientRect();
    const left = Math.max(8, Math.min(anchor.left, window.innerWidth - popup.width - 8));
    const below = anchor.bottom + 4;
    const top = below + popup.height <= window.innerHeight - 8 ? below :
      Math.max(8, Math.min(anchor.top - popup.height - 4, window.innerHeight - popup.height - 8));
    tableDropdown.style.left = `${left}px`;
    tableDropdown.style.top = `${top}px`;
  };

  const createTableDropdown = () => {
    tableDropdown = document.createElement("div");
    tableDropdown.className = "lightmetal-table-dropdown";
    tableDropdown.id = `lightmetal-table-insert-${++tableDropdownCounter}`;
    tableDropdown.setAttribute("role", "dialog");
    tableDropdown.setAttribute("aria-label", "Insert table");
    if (typeof tableDropdown.showPopover === "function") tableDropdown.setAttribute("popover", "manual");
    tableDropdown.hidden = true;
    const dimensions = document.createElement("div");
    dimensions.className = "lightmetal-table-dimensions";
    dimensions.setAttribute("aria-live", "polite");
    const grid = document.createElement("div");
    grid.className = "lightmetal-table-grid";
    grid.style.gridTemplateColumns = `repeat(${gridColumns}, 1fr)`;
    grid.setAttribute("role", "group");
    grid.setAttribute("aria-label", "Select table size");
    const cells = [];
    const highlight = (columns, rows) => {
      dimensions.textContent = `${columns} × ${rows}`;
      for (const cell of cells) {
        cell.classList.toggle("lightmetal-grid-selected", Number(cell.dataset.column) <= columns && Number(cell.dataset.row) <= rows);
        cell.tabIndex = Number(cell.dataset.column) === columns && Number(cell.dataset.row) === rows ? 0 : -1;
      }
    };
    for (let row = 1; row <= gridRows; row++) {
      for (let column = 1; column <= gridColumns; column++) {
        const cell = document.createElement("button");
        cell.type = "button";
        cell.dataset.column = column;
        cell.dataset.row = row;
        cell.setAttribute("aria-label", `${column} columns, ${row} rows`);
        listen(cell, "pointerenter", () => highlight(column, row));
        listen(cell, "focus", () => highlight(column, row));
        listen(cell, "click", () => insertTable(row, column, tableRange));
        listen(cell, "keydown", (event) => {
          const moves = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] };
          const move = moves[event.key];
          if (!move) return;
          event.preventDefault();
          const nextRow = Math.max(1, Math.min(gridRows, row + move[0]));
          const nextColumn = Math.max(1, Math.min(gridColumns, column + move[1]));
          cells[(nextRow - 1) * gridColumns + nextColumn - 1].focus();
        });
        cells.push(cell);
        grid.appendChild(cell);
      }
    }
    const form = document.createElement("form");
    form.className = "lightmetal-table-form";
    form.noValidate = true;
    const input = (labelText, max) => {
      const label = document.createElement("label");
      label.textContent = labelText;
      const field = document.createElement("input");
      field.type = "number";
      field.min = "1";
      field.max = max;
      field.step = "1";
      label.appendChild(field);
      form.appendChild(label);
      return field;
    };
    const columns = input("Columns", tables.maxColumns);
    const rows = input("Rows", tables.maxRows);
    const submit = document.createElement("button");
    submit.type = "submit";
    submit.textContent = "Insert";
    form.appendChild(submit);
    listen(form, "submit", (event) => {
      event.preventDefault();
      insertTable(rows.valueAsNumber, columns.valueAsNumber, tableRange);
    });
    tableMessage = document.createElement("div");
    tableMessage.className = "lightmetal-table-message";
    tableMessage.setAttribute("role", "status");
    resetTableDropdown = () => {
      columns.value = Math.min(3, tables.maxColumns, tables.maxCells);
      rows.value = Math.min(3, tables.maxRows, Math.floor(tables.maxCells / Number(columns.value)));
      highlight(Math.min(3, gridColumns), Math.min(3, gridRows));
      tableMessage.textContent = "";
    };
    tableDropdown.append(dimensions, grid, form, tableMessage);
    element.appendChild(tableDropdown);
  };

  const openTableInsertion = () => {
    if (tableDropdown && !tableDropdown.hidden) {
      closeTableDropdown(true);
      return false;
    }
    if (!tableRange) captureTableRange();
    if (!tableDropdown) createTableDropdown();
    resetTableDropdown();
    tableDropdown.hidden = false;
    if (tableDropdown.hasAttribute("popover")) tableDropdown.showPopover();
    tableInsertItem.setAttribute("aria-controls", tableDropdown.id);
    tableInsertItem.setAttribute("aria-expanded", "true");
    positionTableDropdown();
    tableDropdown.querySelector('button[tabindex="0"]').focus();
    return false;
  };

  // Insert an <img> tag at the current position. The native input event
  // carries the change to onChange.
  const placeImage = (url, alt, savedRange = null) => {
    if (mode === "source" || destroyed) return false;
    if (savedRange && content.contains(savedRange.commonAncestorContainer)) {
      content.focus();
      const selection = document.getSelection();
      selection.removeAllRanges();
      selection.addRange(savedRange);
    } else {
      ensureCaret();
    }
    const image = document.createElement('img');
    image.setAttribute('src',url);
    image.setAttribute('alt',alt ?? `image ${++imageCounter}`);
    const ok = exec("insertHTML", image.outerHTML);
    if (!ok) return false;
    content.focus();
    return true;
  };

  // Validate, convert (or upload via the custom handler), then insert.
  // Never throws; rejected images return false without changing content.
  const handleFile = async (file, context = null) => {
    if (mode === "source" || destroyed) return false;
    if (!images.enabled) return false;
    const selection = document.getSelection();
    const range = selection && selection.rangeCount ? selection.getRangeAt(0) : null;
    const savedRange = context?.range || (range && content.contains(range.commonAncestorContainer)
      ? range.cloneRange()
      : null);
    try {
      if (!file) throw new Error("No image received");

      let type = file.type;
      if (!unrestricted && type && !IMAGE_TYPES.includes(type)) {
        throw new Error(
          type === "image/bmp"
            ? "Bitmap (.bmp) images are not supported"
            : `Unsupported file type: ${type}`
        );
      }
      if (!type) {
        // No MIME type: identify by extension so the checks below apply.
        const match = /\.([a-z0-9]+)$/i.exec((file.name || "").split(/[?#]/)[0]);
        const ext = match ? match[1].toLowerCase() : "";
        type = IMAGE_EXT_TYPES[ext] || (ext ? `.${ext}` : "");
        if (!unrestricted && !IMAGE_TYPES.includes(type)) {
          throw new Error(`Unsupported file type${type ? `: ${type}` : ""}`);
        }
      }
      if (!unrestricted && file.size > images.maxSize) {
        throw new Error(
          `Image is too large (${fmtSize(file.size)}); the limit is ${fmtSize(images.maxSize)}`
        );
      }

      let url;
      if (typeof images.onInsert === "function") {
        url = await images.onInsert(file);
        if (typeof url !== "string" || !url) {
          throw new Error("The image upload did not return a URL");
        }
      } else if (images.allowBase64) {
        // Blob.type is read-only. Keep the original File for upload hooks.
        url = await fileToDataURI(!file.type && IMAGE_TYPES.includes(type)
          ? file.slice(0, file.size, type) : file);
      } else {
        throw new Error(
          "Image files are disabled. Allow base64 images or provide an onInsert handler."
        );
      }

      if (mode === "source" || destroyed || context && !context.valid()) return false;
      const urlError = imageURLError(url);
      if (urlError) throw new Error(urlError);

      const width = await imageWidth(url);
      if (context && !context.valid()) return false;
      return placeImage(url, width ? `image (${width}px)` : "image", savedRange);
    } catch (error) {
      if (context?.valid()) context.error(error.message || 'Image insertion failed');
      return false;
    }
  };

  const insertImageURL = (url) => {
    if (mode === "source" || destroyed) return false;
    if (!images.enabled) return false;
    const trimmed = url.trim();
    const urlError = imageURLError(trimmed);
    if (urlError) return false;
    return placeImage(trimmed);
  };

  function positionInsertion() {
    if (!insertionUI) return;
    const {popup,trigger} = insertionUI;
    const anchor = (trigger.closest('.lightmetal-overflow') ? overflow.trigger : trigger).getBoundingClientRect();
    popup.style.maxWidth = `${Math.max(0,window.innerWidth-16)}px`;
    popup.style.maxHeight = `${Math.max(0,window.innerHeight-16)}px`;
    const box = popup.getBoundingClientRect();
    popup.style.left = `${Math.max(8,Math.min(anchor.left,window.innerWidth-box.width-8))}px`;
    popup.style.top = `${Math.max(8,Math.min(anchor.bottom+4,window.innerHeight-box.height-8))}px`;
  }

  function openInsertion(kind,trigger) {
    if (destroyed || composing || mode === 'source' || !trigger) return false;
    if (insertionUI?.trigger === trigger) { closeInsertion(true); return false; }
    closeInsertion(); formatting.close(); closeTableMenu(); closeTableDropdown(); overflow.close();
    const selection = document.getSelection();
    let range = selection?.rangeCount ? selection.getRangeAt(0) : null;
    if (!range || !content.contains(range.commonAncestorContainer)) {
      range = document.createRange(); range.selectNodeContents(content); range.collapse(false);
    }
    range = range.cloneRange();
    const anchorAt = node => (node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement)?.closest('a');
    const candidate = anchorAt(range.startContainer);
    const link = kind === 'link' && candidate && candidate === anchorAt(range.endContainer) && content.contains(candidate) ? candidate : null;
    const popup = document.createElement('form');
    popup.className = 'lightmetal-table-dropdown lightmetal-insertion-popup';
    popup.id = `lightmetal-insertion-${++tableDropdownCounter}`;
    popup.setAttribute('role','dialog'); popup.setAttribute('aria-label',kind === 'image' ? 'Insert Image' : link ? 'Edit Link' : 'Insert Link');
    if (typeof popup.showPopover === 'function') popup.setAttribute('popover','manual');
    const state = {popup,trigger,range,link,busy:false}; insertionUI = state;
    const valid = () => {
      if (insertionUI !== state || destroyed || composing || state.formComposing || mode === 'source') return false;
      if (insertionObserver.takeRecords().length || !content.contains(range.commonAncestorContainer) || link && !content.contains(link)) {
        closeInsertion(); return false;
      }
      return true;
    };
    const error = document.createElement('p'); error.className = 'lightmetal-insertion-error'; error.setAttribute('role','alert'); error.hidden = true;
    const fail = message => { if (insertionUI === state) {error.textContent = message; error.hidden = false; positionInsertion();} };
    const heading = document.createElement('h3'); heading.textContent = popup.getAttribute('aria-label'); popup.append(heading);
    const field = (label,value = '') => {
      const wrapper = document.createElement('label'); wrapper.textContent = label;
      const input = document.createElement('input'); input.type = 'text'; input.value = value; input.setAttribute('aria-label',label);
      wrapper.append(input); return {wrapper,input};
    };
    const makeButton = (label,handler) => {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = label;
      if (handler) listenInsertion(button,'click',handler); return button;
    };
    const footer = document.createElement('div'); footer.className = 'lightmetal-insertion-footer';
    const cancel = makeButton('Cancel',() => closeInsertion(true));
    const submit = document.createElement('button'); submit.type = 'submit'; submit.textContent = link ? 'Save' : 'Insert';
    const restore = target => {
      content.focus(); const selection = document.getSelection(); selection.removeAllRanges(); selection.addRange(target);
      applyEditingSettings();
    };
    const replace = (html,target = range,command = 'insertHTML') => {
      if (!valid()) return false;
      restore(target); insertionObserver.disconnect();
      const ok = exec(command,html);
      if (ok) {
        if (insertionUI === state) closeInsertion();
        if (!destroyed && mode !== 'source' && !insertionUI) content.focus();
      }
      else {insertionObserver.observe(content,{subtree:true,childList:true,characterData:true,attributes:true});fail('The browser could not apply this change');}
      return ok;
    };
    let firstField;
    if (kind === 'link') {
      const originalText = link ? link.textContent : range.toString();
      const url = field('URL',link?.getAttribute('href') || ''); url.input.placeholder = 'https://example.com'; url.input.autocomplete = 'url';
      const text = field('Display Text',originalText);
      const targetLabel = document.createElement('label'); targetLabel.className = 'lightmetal-insertion-check';
      const target = document.createElement('input'); target.type = 'checkbox'; target.checked = link?.getAttribute('target') === '_blank';
      targetLabel.append(target,document.createTextNode('Open in new tab'));
      popup.append(url.wrapper,text.wrapper,targetLabel); firstField = url.input;
      const allowed = () => !!url.input.value.trim() && (unrestricted || allowLinkURL(url.input.value.trim(),baseURI,true));
      const update = () => {submit.disabled = !allowed();}; listenInsertion(url.input,'input',update); update();
      if (link) {
        const remove = makeButton('Remove Link',() => {
          const selected = document.createRange(); if (!valid()) return;
          selected.selectNodeContents(link); replace(null,selected,'unlink');
        }); footer.append(remove);
      }
      listenInsertion(popup,'submit',event => {
        event.preventDefault(); if (!allowed() || !valid()) return;
        const anchor = link ? link.cloneNode(true) : document.createElement('a');
        anchor.setAttribute('href',url.input.value.trim());
        if (target.checked) {
          anchor.setAttribute('target','_blank');
          const rel = new Set((anchor.getAttribute('rel') || '').split(/\s+/).filter(Boolean)); rel.add('noopener'); rel.add('noreferrer'); anchor.setAttribute('rel',[...rel].join(' '));
        } else if (anchor.getAttribute('target') === '_blank') anchor.removeAttribute('target');
        if (text.input.value !== originalText || !link && range.collapsed) anchor.textContent = text.input.value || url.input.value.trim();
        else if (!link) anchor.append(range.cloneContents());
        const selected = range.cloneRange(); if (link) selected.selectNode(link);
        replace(anchor.outerHTML,selected);
      });
    } else {
      const tabs = document.createElement('div'); tabs.className = 'lightmetal-insertion-tabs'; tabs.setAttribute('role','tablist'); tabs.setAttribute('aria-label','Image source');
      const upload = document.createElement('div'), urlPanel = document.createElement('div');
      const url = field('Image URL'); url.input.placeholder = 'https://example.com/image.png'; url.input.autocomplete = 'url';
      const alt = field('Alt Text'); urlPanel.append(url.wrapper,alt.wrapper);
      const status = document.createElement('p'); status.setAttribute('role','status'); status.hidden = true;
      const file = document.createElement('input'); file.type = 'file'; file.accept = unrestricted ? '' : IMAGE_TYPES.join(','); file.hidden = true;
      const browse = makeButton('Drag an image here or click to browse',() => file.click()); browse.className = 'lightmetal-image-dropzone';
      upload.append(browse,file,status);
      let activeTab = 'upload'; const tabButtons = [];
      const allowed = () => !!url.input.value.trim() && !imageURLError(url.input.value.trim());
      const update = () => {submit.hidden = activeTab !== 'url'; submit.disabled = state.busy || !allowed();};
      for (const [name,label,panel] of [['upload','Upload',upload],['url','URL',urlPanel]]) {
        if (name === 'url' && !images.allowURL) continue;
        const tab = makeButton(label,() => {
          if (state.busy) return;
          activeTab = name;
          for (const entry of tabButtons) {entry.tab.setAttribute('aria-selected',String(entry.name === name));entry.tab.tabIndex = entry.name === name ? 0 : -1;entry.panel.hidden = entry.name !== name;}
          update(); positionInsertion();
        });
        tab.setAttribute('role','tab'); tab.id = `${popup.id}-${name}`; tab.setAttribute('aria-controls',`${tab.id}-panel`);
        panel.id = `${tab.id}-panel`; panel.setAttribute('role','tabpanel'); panel.setAttribute('aria-labelledby',tab.id);
        tab.setAttribute('aria-selected',String(name === activeTab)); tab.tabIndex = name === activeTab ? 0 : -1; panel.hidden = name !== activeTab;
        tabButtons.push({name,tab,panel}); tabs.append(tab);
      }
      listenInsertion(tabs,'keydown',event => {
        if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key) || state.busy) return;
        event.preventDefault(); const index = tabButtons.findIndex(entry => entry.tab === document.activeElement);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabButtons.length-1 : (index+(event.key === 'ArrowLeft' ? -1 : 1)+tabButtons.length)%tabButtons.length;
        tabButtons[next].tab.click(); tabButtons[next].tab.focus();
      });
      const uploadFile = async selected => {
        if (!valid() || state.busy) return;
        state.busy = true; browse.disabled = true; tabButtons.forEach(entry => entry.tab.disabled = true);
        error.hidden = true; status.textContent = 'Processing image…'; status.hidden = false; update();
        const ok = await handleFile(selected,{range,valid,error:fail});
        if (ok) {if (insertionUI === state) closeInsertion();if (!destroyed && mode !== 'source') content.focus();return;}
        if (insertionUI !== state) return;
        state.busy = false; browse.disabled = false; tabButtons.forEach(entry => entry.tab.disabled = false); status.hidden = true; update();
      };
      listenInsertion(file,'change',() => {const selected = file.files?.[0];file.value = '';if (selected) uploadFile(selected);});
      listenInsertion(upload,'dragover',event => {event.preventDefault();event.stopPropagation();});
      listenInsertion(upload,'drop',event => {event.preventDefault();event.stopPropagation();if (images.dragDrop) uploadFile(event.dataTransfer?.files?.[0]);});
      listenInsertion(url.input,'input',update);
      listenInsertion(popup,'submit',event => {
        event.preventDefault(); if (activeTab !== 'url' || state.busy || !allowed() || !valid()) return;
        restore(range); insertionObserver.disconnect();
        if (placeImage(url.input.value.trim(),alt.input.value,range)) {if (insertionUI === state) closeInsertion();}
        else {insertionObserver.observe(content,{subtree:true,childList:true,characterData:true,attributes:true});fail('Image insertion failed');}
      });
      popup.append(tabs,upload); if (images.allowURL) popup.append(urlPanel); firstField = browse; update();
    }
    footer.append(cancel,submit); popup.append(error,footer);
    listenInsertion(popup,'compositionstart',() => {state.formComposing = true;});
    listenInsertion(popup,'compositionend',() => {state.formComposing = false;});
    listenInsertion(popup,'keydown',event => {
      if (event.key === 'Escape' && !event.isComposing && !state.formComposing) {event.preventDefault();event.stopPropagation();closeInsertion(true);}
    });
    element.append(popup);
    insertionObserver.observe(content,{subtree:true,childList:true,characterData:true,attributes:true});
    trigger.setAttribute('aria-controls',popup.id);trigger.setAttribute('aria-expanded','true');
    if (popup.hasAttribute('popover')) popup.showPopover(); positionInsertion(); firstField.focus();
    return false;
  }

  const imageResult = button => images.enabled ? openInsertion('image',button) : false;

  // Drop and paste share the same file validation/upload path.
  const onDrop = (event) => {
    const data = event.dataTransfer;
    if (!data) return;
    element.classList.remove(classes.drop);
    const files = Array.from(data.files || []);
    if (files.length) {
      event.preventDefault();
      if (images.enabled && images.dragDrop) files.forEach((file) => handleFile(file));
    } else if (sanitized && data.getData("text/html")) {
      // Reject HTML drops regardless of image settings. Native filtering differs
      // between browsers. Paste provides the sanitized rich-text import path.
      event.preventDefault();
    }
  };
  const onDragOver = (event) => {
    if (!images.enabled || !images.dragDrop || !event.dataTransfer) return;
    event.preventDefault();
    element.classList.add(classes.drop);
  };
  const onDragLeave = () => element.classList.remove(classes.drop);

  const onPaste = (event) => {
    const data = event.clipboardData;
    if (!data) return;
    let file = null;
    if (images.enabled && images.paste) {
      const acceptsFile = (f) => f && (unrestricted || f.type.startsWith("image/") ||
        (!f.type && /\.(?:jpe?g|png|gif|webp)$/i.test(f.name || "")));
      if (data.files) file = Array.from(data.files).find(acceptsFile);
      if (!file && data.items) {
        for (const item of data.items) {
          const candidate = item.kind === "file" ? item.getAsFile() : null;
          if (acceptsFile(candidate)) {
            file = candidate;
            break;
          }
        }
      }
    }
    if (file) {
      event.preventDefault();
      handleFile(file);
      return;
    }
    // Rich text from somewhere else is untrusted. Sanitize it before it
    // enters the editor; plain-text pastes flow through natively.
    if (!sanitized) return;
    const html = typeof data.getData === "function" ? data.getData("text/html") : "";
    if (!html) return;
    event.preventDefault();
    const clean = sanitizeHTML(html, baseURI, images.allowBase64);
    if (clean) exec("insertHTML", clean);
  };

  listen(element, "dragover", onDragOver);
  listen(element, "drop", onDrop);
  listen(element, "dragleave", onDragLeave);
  listen(content, "paste", onPaste);
  cleanups.push(() => {
    clearTimeout(formatTimer);
  });

  // ---- Contextual table controls -----------------------------------------

  const cellAt = (node) => {
    const el = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
    const cell = el?.closest("td, th");
    return cell && content.contains(cell) ? cell : null;
  };

  // Support rectangular rows plus single-cell, full-width section headings.
  // Other spans still need a logical grid and remain protected.
  const tableWidth = (table) => {
    const rows = Array.from(table.rows);
    const columns = rows.reduce((maximum, row) => Math.max(maximum,
      Array.from(row.cells).reduce((width, cell) => width + cell.colSpan, 0)), 0);
    const supported = columns > 0 && !table.querySelector("table") &&
      !content.contains(table.parentElement?.closest("table")) && rows.every((row) =>
        Array.from(row.cells).every((cell) => cell.rowSpan === 1) &&
        ((row.cells.length === 1 && row.cells[0].colSpan === columns) ||
          (row.cells.length === columns && Array.from(row.cells).every((cell) => cell.colSpan === 1))));
    return supported ? columns : 0;
  };

  const inspectTable = (table) => {
    const columns = tableWidth(table);
    return { columns, columnGroups: columns > 0 && !!table.querySelector("colgroup, col") };
  };

  const canEditTable = (info, cell, command) => command === "deleteTable" ||
    (info.columns > 0 && (!command.toLowerCase().includes("column") ||
      (cell.colSpan === 1 && !info.columnGroups)));

  const tableControls = [
    ["rowAbove", "Insert row above", "Row ↑"],
    ["rowBelow", "Insert row below", "Row ↓"],
    ["columnLeft", "Insert column left", "Column ←"],
    ["columnRight", "Insert column right", "Column →"],
    ["deleteRow", "Delete row", "Delete row"],
    ["deleteColumn", "Delete column", "Delete column"],
    ["deleteTable", "Delete table", "Delete table"]
  ];
  const tableButtons = new Map();
  const tableNote = document.createElement("span");
  tableNote.className = "lightmetal-table-note";

  const updateTableControls = () => {
    const selection = document.getSelection();
    if (mode === "source" || destroyed) activeCell = null;
    else if (!tablebar.contains(document.activeElement) && !actionbar.contains(document.activeElement) && !tableMenu?.contains(document.activeElement)) {
      const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
      const start = range && cellAt(range.startContainer);
      activeCell = document.activeElement === content && start &&
        start === cellAt(range.endContainer) ? start : null;
    }
    if (activeCell && !content.contains(activeCell)) activeCell = null;
    tablebar.hidden = !activeCell;
    if (tableMenu) {
      const inTable = node => {
        const el = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
        return content.contains(el?.closest("table"));
      };
      tableInsertItem.disabled = mode === "source" || destroyed || !!tableRange &&
        (inTable(tableRange.startContainer) || inTable(tableRange.endContainer));
      for (const button of tableMenuButtons.values()) button.disabled = !activeCell;
    }
    if (!activeCell) return;
    const info = inspectTable(activeCell.closest("table"));
    for (const [command, button] of tableButtons) {
      const disabled = !canEditTable(info, activeCell, command);
      button.disabled = disabled;
      if (tableMenuButtons.has(command)) tableMenuButtons.get(command).disabled = disabled;
    }
    tableNote.textContent = !info.columns ? "Merged or irregular table: edit its structure in Source mode." :
      info.columnGroups ? "Column groups: edit columns in Source mode." :
      activeCell.colSpan > 1 ? "Select an ordinary cell to edit columns." : "";
  };

  const blankCell = (reference) => {
    const cell = document.createElement(reference.tagName.toLowerCase());
    if (reference.hasAttribute("scope")) cell.setAttribute("scope", reference.getAttribute("scope"));
    cell.appendChild(document.createElement("br"));
    return cell;
  };

  const editTable = (command) => {
    if (mode === "source" || destroyed || !activeCell || !content.contains(activeCell)) return false;
    const table = activeCell.closest("table");
    const info = inspectTable(table);
    if (!canEditTable(info, activeCell, command)) return false;
    const columns = info.columns;
    const clone = table.cloneNode(true);
    let rowIndex = activeCell.parentElement.rowIndex;
    let columnIndex = activeCell.cellIndex;
    const row = clone.rows[rowIndex];
    if (command === "rowAbove" || command === "rowBelow") {
      const newRow = document.createElement("tr");
      const template = row.cells.length === columns ? row :
        Array.from(row.parentElement.rows || clone.rows).find((otherRow) =>
          otherRow.cells.length === columns && Array.from(otherRow.cells).every((cell) => cell.colSpan === 1));
      for (let column = 0; column < columns; column++) {
        newRow.appendChild(blankCell(template?.cells[column] || row.cells[0]));
      }
      const below = command === "rowBelow";
      row.parentElement.insertBefore(newRow, below ? row.nextSibling : row);
      if (below) rowIndex++;
    } else if (command === "columnLeft" || command === "columnRight") {
      const right = command === "columnRight";
      for (const otherRow of clone.rows) {
        if (otherRow.cells.length === 1 && otherRow.cells[0].colSpan > 1) {
          otherRow.cells[0].colSpan++;
        } else {
          const reference = otherRow.cells[columnIndex];
          otherRow.insertBefore(blankCell(reference), right ? reference.nextSibling : reference);
        }
      }
      if (right) columnIndex++;
    } else if (command === "deleteRow") {
      const section = row.parentElement;
      row.remove();
      if (section !== clone && !section.rows.length) section.remove();
    } else if (command === "deleteColumn") {
      for (const otherRow of clone.rows) {
        if (otherRow.cells.length === 1 && otherRow.cells[0].colSpan > 1) otherRow.cells[0].colSpan--;
        else otherRow.cells[columnIndex].remove();
      }
    }
    const deleting = command === "deleteTable" || !clone.rows.length || !clone.rows[0].cells.length;
    if (!deleting) {
      const rows = Array.from(clone.rows);
      if ((command === "rowAbove" || command === "rowBelow" ||
          command === "columnLeft" || command === "columnRight") &&
          !tableSizeAllowed(rows.length, tableWidth(clone))) {
        return false;
      }
      // Remove references to headers deleted by this operation, not unrelated IDs.
      const ids = new Set(Array.from(clone.querySelectorAll("th[id], td[id]"), (cell) => cell.id));
      const removed = new Set(Array.from(table.querySelectorAll("th[id], td[id]"), (cell) => cell.id)
        .filter((id) => !ids.has(id)));
      for (const cell of clone.querySelectorAll("[headers]")) {
        const headers = cell.getAttribute("headers").split(/\s+/).filter((id) => id && !removed.has(id));
        if (headers.length) cell.setAttribute("headers", headers.join(" "));
        else cell.removeAttribute("headers");
      }
    }
    // Replace only this table through native editing, keeping undo and input events.
    const parent = table.parentNode;
    const index = Array.from(parent.childNodes).indexOf(table);
    content.focus();
    const range = document.createRange();
    range.selectNode(table);
    const selection = document.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    const ok = exec("insertHTML", deleting ? `<${separator}><br></${separator}>` : clone.outerHTML);
    if (ok && !deleting) {
      const replacement = parent.childNodes[index];
      if (replacement?.tagName === "TABLE") {
        const targetRow = replacement.rows[Math.min(rowIndex, replacement.rows.length - 1)];
        const target = targetRow.cells[Math.min(columnIndex, targetRow.cells.length - 1)];
        range.selectNodeContents(target);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
      }
    }
    updateTableControls();
    return ok;
  };

  for (const [command, label, text] of tableControls) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "lightmetal-table-button";
    button.textContent = text;
    button.title = label;
    button.setAttribute("aria-label", label);
    const onClick = () => editTable(command);
    // Mouse clicks keep the cell selection. Tab/Enter still work normally.
    const onMouseDown = (event) => event.preventDefault();
    listen(button, "mousedown", onMouseDown);
    listen(button, "click", onClick);
    tableButtons.set(command, button);
    tablebar.appendChild(button);
  }
  tablebar.appendChild(tableNote);
  const onTableFocusOut = (event) => {
    if (!element.contains(event.relatedTarget)) {
      activeCell = null;
      tablebar.hidden = true;
    }
  };
  listen(element, "focusout", onTableFocusOut);
  listen(document, "selectionchange", updateTableControls);
  listen(document, "focusin", updateTableControls);

  const positionTableMenu = () => {
    if (!tableMenu || tableMenu.hidden) return;
    tableMenu.style.maxWidth = `${Math.max(0, window.innerWidth - 16)}px`;
    tableMenu.style.maxHeight = `${Math.max(0, window.innerHeight - 16)}px`;
    const anchor = tableAnchor().getBoundingClientRect(), popup = tableMenu.getBoundingClientRect();
    tableMenu.style.left = `${Math.max(8, Math.min(anchor.left, window.innerWidth - popup.width - 8))}px`;
    const below = anchor.bottom + 4;
    tableMenu.style.top = `${below + popup.height <= window.innerHeight - 8 ? below : Math.max(8, Math.min(anchor.top - popup.height - 4, window.innerHeight - popup.height - 8))}px`;
  };
  const createTableMenu = () => {
    tableMenu = document.createElement("div");
    tableMenu.className = "lightmetal-table-dropdown lightmetal-table-menu";
    tableMenu.id = `lightmetal-table-menu-${++tableDropdownCounter}`;
    tableMenu.setAttribute("role", "menu"); tableMenu.setAttribute("aria-label", "Table"); tableMenu.tabIndex = -1; tableMenu.hidden = true;
    if (typeof tableMenu.showPopover === "function") tableMenu.setAttribute("popover", "manual");
    tableInsertItem = document.createElement("button"); tableInsertItem.type = "button"; tableInsertItem.tabIndex = -1;
    tableInsertItem.textContent = "Insert Table…"; tableInsertItem.setAttribute("role", "menuitem");
    tableInsertItem.setAttribute("aria-haspopup", "dialog"); tableInsertItem.setAttribute("aria-expanded", "false");
    listen(tableInsertItem, "mousedown", event => event.preventDefault());
    listen(tableInsertItem, "click", () => { closeTableMenu(); openTableInsertion(); });
    tableMenu.append(tableInsertItem);
    for (const [index, [command, label]] of tableControls.entries()) {
      if ([0, 2, 4].includes(index)) {
        const divider = document.createElement("div"); divider.setAttribute("role", "separator"); tableMenu.append(divider);
      }
      const button = document.createElement("button"); button.type = "button"; button.tabIndex = -1;
      button.textContent = label; button.setAttribute("role", "menuitem");
      listen(button, "mousedown", event => event.preventDefault());
      listen(button, "click", () => { const ok = editTable(command); closeTableMenu(!ok); if (ok) content.focus(); });
      tableMenu.append(button); tableMenuButtons.set(command, button);
    }
    listen(tableMenu, "keydown", event => {
      if (event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); closeTableMenu(true); }
      else if (event.key === "Tab") closeTableMenu(true);
      else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
        event.preventDefault();
        const enabled = [tableInsertItem, ...tableMenuButtons.values()].filter(button => !button.disabled), index = enabled.indexOf(document.activeElement);
        const next = event.key === "Home" ? 0 : event.key === "End" ? enabled.length - 1 :
          (index + (event.key === "ArrowDown" ? 1 : -1) + enabled.length) % enabled.length;
        enabled[next]?.focus();
      }
    });
    element.append(tableMenu);
  };
  const tableResult = (last = false) => {
    if (tableMenu && !tableMenu.hidden) { closeTableMenu(true); return false; }
    closeInsertion(); overflow.close(); formatting.close();
    closeTableDropdown(); captureTableRange();
    if (!tableMenu) createTableMenu();
    // Capture the cell before focus moves from the toolbar into the menu.
    const start = tableRange && cellAt(tableRange.startContainer);
    activeCell = start && start === cellAt(tableRange.endContainer) ? start : null;
    updateTableControls();
    tableMenu.hidden = false;
    if (tableMenu.hasAttribute("popover")) tableMenu.showPopover();
    tableTrigger.setAttribute("aria-controls", tableMenu.id); tableTrigger.setAttribute("aria-expanded", "true");
    positionTableMenu();
    const enabled = [tableInsertItem, ...tableMenuButtons.values()].filter(button => !button.disabled);
    (enabled[last ? enabled.length - 1 : 0] || tableMenu).focus();
    return false;
  };

  const hasSource =
    !settings.actions ||
    settings.actions.some((a) => a === "source" || (a && a.name === "source"));

  const actions = resolvedActions.map(
    (action) => {
      if (action.result === defaultActions.link.result) return { ...action, result: linkResult };
      const isTable = action.name === "table" || action.result === defaultActions.table.result;
      if (isTable && (!action.result || action.result === defaultActions.table.result)) {
        return { ...action, result: tableResult };
      }
      // The default image action has no name, so match it by function
      // identity. A custom action may supply its own result() (kept) or
      // none (then it gets the editor's image workflow).
      const isImage = action.name === "image" || action.result === defaultActions.image.result;
      if (isImage && (!action.result || action.result === defaultActions.image.result)) {
        return { ...action, result: imageResult };
      }
      return action;
    }
  );

  const onInput = ({ target }) => {
    if (mode === "source") return; // defensive: content is hidden in source mode
    const firstChild = target.firstChild;
    if (firstChild && firstChild.nodeType === Node.TEXT_NODE) {
      exec(FORMAT_BLOCK, `<${separator}>`);
    } else if (content.innerHTML === "<br>") {
      content.innerHTML = "";
    }
    updateTableControls();
    if (settings.onChange) settings.onChange(content.innerHTML);
    updateFullscreenLayout();
  };

  const onKeyDown = (event) => {
    if (mode === "source") return; // WYSIWYG shortcuts must not fire in source mode
    // Firefox does not run these browser shortcuts on plain contenteditable,
    // so the editor runs them itself for consistent behavior. Blocking the
    // browser default keeps Chromium from toggling twice.
    const keyCommands = { b: "bold", i: "italic", u: "underline" };
    const keyCommand =
      (event.ctrlKey || event.metaKey) && !event.repeat
        ? keyCommands[event.key.toLowerCase()]
        : null;
    if (keyCommand) {
      event.preventDefault();
      exec(keyCommand);
      return;
    }
    if (event.key === "Enter" && document.queryCommandValue(FORMAT_BLOCK) === "blockquote") {
      clearTimeout(formatTimer);
      formatTimer = setTimeout(() => {
        formatTimer = 0;
        const selection = document.getSelection();
        const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
        if (!destroyed && mode === "wysiwyg" && document.activeElement === content &&
            range && content.contains(range.commonAncestorContainer)) {
          exec(FORMAT_BLOCK, `<${separator}>`);
        }
      }, 0);
    }
  };

  const onSourceInput = () => {
    if (settings.onChange) settings.onChange(source.value);
    updateFullscreenLayout();
  };

  // Toolbar buttons are natively keyboard-focusable and carry their label
  // as both title (tooltip) and aria-label (screen readers).

  // Native formatting settings belong to the document, not the editor.
  const applyEditingSettings = () => {
    exec(PARAGRAPH_SEPARATOR, separator);
    exec("styleWithCSS", !!settings.styleWithCSS);
  };
  listen(content, "focus", applyEditingSettings);
  listen(content, "input", onInput);
  listen(content, "keydown", onKeyDown);
  listen(source, "input", onSourceInput);

  const formatting = createFormattingControls({element,content,listen,exec,
    canEdit: () => !destroyed && mode === 'wysiwyg', applySettings: applyEditingSettings,
    onInteraction: () => {closeInsertion();overflow.close();closeTableMenu(); closeTableDropdown();}
  });

  const toolbarButtons = [];
  const buttons = [];
  actions.forEach((action, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.tabIndex = -1;
    button.className = classes.button;
    button.innerHTML = action.icon;
    button.title = action.title;
    button.setAttribute("aria-label", action.title);

    if (action.result === tableResult) {
      button.setAttribute("aria-haspopup", "menu");
      button.setAttribute("aria-expanded", "false");
      const capture = () => {
        tableTrigger = button;
        if (!tableDropdown || tableDropdown.hidden) captureTableRange();
      };
      listen(button, "mousedown", capture);
      listen(button, "focus", capture);
      listen(button, "keydown", event => {
        if (mode !== "source" && ["ArrowDown", "ArrowUp"].includes(event.key) && !event.altKey && !event.ctrlKey && !event.metaKey) {
          event.preventDefault(); tableTrigger = button; tableResult(event.key === "ArrowUp");
        }
      });
    }

    if (action.result === linkResult || action.result === imageResult) {
      button.setAttribute('aria-haspopup','dialog'); button.setAttribute('aria-expanded','false');
      listen(button,'mousedown',event => event.preventDefault());
      listen(button,'keydown',event => {
        if (event.key === 'ArrowDown' && !event.altKey && !event.ctrlKey && !event.metaKey) {event.preventDefault();action.result(button);}
      });
    }
    const formattingName = Object.keys(formattingActions).find(name =>
      action.result === formattingActions[name].result || action.name === name && action.result == null);
    if (formattingName) formatting.bind(formattingName,button);
    if (action.result === toggleFullscreen) {
      listen(button,'mousedown',event => event.preventDefault());
      if (action.state === fullscreenAction.state) fullscreenButtons.push(button);
    }

    // Source mode permits view controls, never hidden WYSIWYG commands.
    const onClick = () => {
      if (mode === "source" && action !== sourceAction && action.name !== 'fullscreen' &&
          !(action.name === "source" && action.result === sourceAction.result)) return;
      if (action.result === toggleFullscreen) { toggleFullscreen(); return; }
      if (mode === "wysiwyg") applyEditingSettings();
      if (action.result === tableResult) tableTrigger = button;
      const result = action.result === linkResult || action.result === imageResult ? action.result(button) : action.result();
      if (result && mode === 'wysiwyg') content.focus();
    };
    if (!formattingName) listen(button, "click", onClick);

    if (action.state) {
      button.setAttribute("aria-pressed", "false");
      const update = () => {
        const active = !!action.state();
        button.classList.toggle(classes.selected, active);
        button.setAttribute("aria-pressed", String(active));
      };
      listen(content, "keyup", update);
      listen(content, "mouseup", update);
      listen(button, "click", update);
    }

    actionbar.appendChild(button);
    buttons.push(button);
    const name = Object.keys(defaultActions).find(name => defaultActions[name] === resolvedActions[index]) || resolvedActions[index].name || (resolvedActions[index] === sourceAction || resolvedActions[index].result === sourceAction.result ? 'source' : 'custom');
    if (!settings.actions && ['blocks','bold','text','alignment','table','fullscreen','more','undo'].includes(name)) button.classList.add('lightmetal-group-start');
    toolbarButtons.push({ button, name, secondary: !settings.actions && ['formatting','indentation'].includes(name) });
  });
  const overflow = createToolbarOverflow({element,toolbar:actionbar,entries:toolbarButtons,listen,defaultToolbar:!settings.actions,
    closeMenus: () => {closeInsertion();formatting.close();closeTableMenu();closeTableDropdown();}
  });
  cleanups.push(() => overflow.destroy());

  // Enter through the writing field; keep native toolbar traversal inside.
  const setToolbarTabIndex = (tabIndex) => {
    for (const button of buttons) if (button.tabIndex !== tabIndex) button.tabIndex = tabIndex;
  };
  listen(element, "focusin", () => setToolbarTabIndex(0));
  listen(element, "focusout", (event) => {
    if (!element.contains(event.relatedTarget)) setToolbarTabIndex(-1);
  });

  const onTableOutsideClick = (event) => {
    if (tableMenu && !tableMenu.hidden && !tableMenu.contains(event.target) && !tableTrigger?.contains(event.target)) closeTableMenu();
    if (tableDropdown && !tableDropdown.hidden && !tableDropdown.contains(event.target) &&
        !tableTrigger?.contains(event.target)) closeTableDropdown();
  };
  const onTableEscape = (event) => {
    if (event.key === 'Escape' && insertionUI && !insertionUI.formComposing && !event.isComposing && !composing) {
      event.preventDefault(); closeInsertion(true); return;
    }
    if (event.key === "Escape" && tableDropdown && !tableDropdown.hidden) {
      event.preventDefault();
      closeTableDropdown(true);
    } else if (event.key === "Escape" && tableMenu && !tableMenu.hidden) {
      event.preventDefault(); closeTableMenu(true);
    }
  };
  listen(document, "pointerdown", onTableOutsideClick);
  listen(document, "keydown", onTableEscape);
  for (const field of [content,source]) {
    listen(field,'compositionstart',() => {composing = true;closeInsertion();});
    listen(field,'compositionend',() => {composing = false;});
  }
  listen(document,'keydown',event => {
    if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing || composing || !fullscreen) return;
    if (insertionUI || tableMenu && !tableMenu.hidden || tableDropdown && !tableDropdown.hidden ||
        element.querySelector('.lightmetal-format-popup:not([hidden])')) return;
    event.preventDefault(); event.stopPropagation(); exitFullscreen();
  });
  listen(document,'pointerdown',event => {
    if (insertionUI && !insertionUI.popup.contains(event.target) && !insertionUI.trigger.contains(event.target)) closeInsertion();
  });
  listen(document,'focusin',event => {
    if (insertionUI && !insertionUI.popup.contains(event.target) && !insertionUI.trigger.contains(event.target) && event.target !== content) closeInsertion();
  });
  listen(window,'resize',positionInsertion); listen(window,'scroll',positionInsertion,true);
  listen(window, 'resize', updateFullscreenLayout);
  listen(window, 'scroll', updateFullscreenLayout, true);
  listen(window, "resize", positionTableDropdown);
  listen(window, "scroll", positionTableDropdown, true);
  listen(window, "resize", positionTableMenu);
  listen(window, "scroll", positionTableMenu, true);
  listen(document, "focusin", event => {
    if (tableMenu && !tableMenu.hidden && !tableMenu.contains(event.target) && !actionbar.contains(event.target)) closeTableMenu();
  });

  element.classList.add('lightmetal-html');
  element.appendChild(actionbar);
  element.appendChild(tablebar);
  element.appendChild(content);
  if (hasSource) element.appendChild(source);
  element.appendChild(overflow.popup);

  /** Current HTML, in either mode. */
  const getHTML = () => (mode === "source" ? source.value : content.innerHTML);

  /** Replace content in either mode. Fires onChange. */
  const setHTML = (html) => {
    closeInsertion();
    clearTimeout(formatTimer);
    closeTableMenu(); closeTableDropdown(); formatting.close();
    if (sanitized) html = sanitizeHTML(html, baseURI, images.allowBase64);
    if (mode === "source") source.value = html;
    else content.innerHTML = html;
    updateTableControls();
    if (settings.onChange) settings.onChange(getHTML());
  };

  /** Current plain text, in either mode. */
  const getText = () => {
    const temp = document.createElement("div");
    temp.innerHTML = getHTML();
    return temp.textContent;
  };

  /**
   * Programmatic image insertion: a URL, a base64 data URI, or a
   * File/Blob. Resolves true on success, false on failure (the reason is
   * returned as false without a toolbar notice).
   */
  const insertImage = (imgSource) => {
    if (mode === "source" || destroyed) return Promise.resolve(false);
    if (typeof imgSource === "string") {
      return Promise.resolve(insertImageURL(imgSource));
    }
    if (imgSource && typeof Blob !== "undefined" && imgSource instanceof Blob) {
      return handleFile(imgSource);
    }
    return Promise.resolve(false);
  };

  /**
   * Remove editor-owned nodes and all registered listeners. Preserve the host
   * element and any content added directly to it by the application.
   */
  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    exitFullscreen(false);
    fullscreenResize?.disconnect();
    closeInsertion();
    closeTableMenu(); closeTableDropdown(); formatting.destroy();
    tableMenu?.remove(); tableDropdown?.remove();
    cleanups.forEach((fn) => fn());
    actionbar.remove();
    tablebar.remove();
    activeCell = null;
    content.remove();
    source.remove();
    if (ownsHTMLClass) element.classList.remove('lightmetal-html');
  };

  return { element, content, source, getHTML, setHTML, getText, insertTable, insertImage, destroy };
};

export default { exec, init };
