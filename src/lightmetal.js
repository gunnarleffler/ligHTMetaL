/**
 * lightmetal — Lightweight HTML editing. Zero runtime dependencies.
 *
 * Inspired by Pell (https://github.com/jaredreich/pell) by Jared Reich.
 * See LICENSE.
 */

import { groupToolbar } from './toolbar-groups.js';

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
    title: "Insert table",
    result: () => true
  },
  // result() is replaced per instance with the editor's image workflow.
  image: {
    icon: SVG_MARKUP.image,
    title: "Image",
    result: () => true
  }
};

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
 * action names or objects; when omitted, every built-in action (including
 * the image and source toggles) is used.
 */
const resolveActions = (requested, sourceAction) => {
  if (!requested) {
    return [...Object.values(defaultActions), sourceAction].filter(Boolean);
  }
  if (!Array.isArray(requested)) throw new TypeError("actions must be an array.");
  return requested.map((action) => {
    if (typeof action === "string") {
      const definition = action === "source" ? sourceAction : defaultActions[action];
      if (!definition) throw new TypeError(`Unknown toolbar action: ${action}`);
      return definition;
    }
    if (!action || typeof action !== "object") throw new TypeError("Toolbar actions must be names or objects.");
    if (action.name === "source" && sourceAction) {
      return { ...sourceAction, ...action };
    }
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

/**
 * Build an <img> tag with safely escaped attributes.
 */
const buildImgTag = (url, alt) => {
  const esc = (value) => String(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  return `<img src="${esc(url)}" alt="${esc(alt)}">`;
};

// Count for alt text so stacked images stay distinguishable.
let imageCounter = 0;

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
  let errorTimer = 0;
  let formatTimer = 0;
  let pickerInput = null;
  let tableDropdown = null;
  let tableTrigger = null;
  let tableRange = null;
  let tableMessage = null;
  let resetTableDropdown = null;

  const sourceAction = {
    icon: SVG_MARKUP.source,
    title: "Source",
    state: () => mode === "source",
    result: () => (mode === "source" ? exitSource() : enterSource())
  };
  const resolvedActions = resolveActions(settings.actions, sourceAction);
  resolvedActions.forEach((action, index) => {
    const workflow = action && (action.name === "image" || action.name === "table") && !action.result;
    if (!action || (typeof action.result !== "function" && !workflow)) {
      throw new TypeError(`Toolbar action ${index + 1} must have a result function.`);
    }
    if (action.state && typeof action.state !== "function") {
      throw new TypeError(`Toolbar action ${index + 1} must have a state function.`);
    }
  });

  const cleanups = [];
  const listen = (target, type, handler, options = false) => {
    target.addEventListener(type, handler, options);
    cleanups.push(() => target.removeEventListener(type, handler, options));
  };

  const actionbar = document.createElement("div");
  actionbar.className = classes.actionbar;

  const tablebar = document.createElement("div");
  tablebar.className = "lightmetal-tablebar";
  tablebar.setAttribute("role", "group");
  tablebar.setAttribute("aria-label", "Table controls");
  tablebar.hidden = true;
  let activeCell = null;

  const content = document.createElement("div");
  content.contentEditable = "true";
  content.className = classes.content;

  const source = document.createElement("textarea");
  source.className = classes.source;
  source.spellcheck = false;
  source.hidden = true;

  // Error messages appear as an inline note in the toolbar and fade away.
  const showError = (message) => {
    if (destroyed) return;
    actionbar.querySelectorAll(`.${classes.error}`).forEach((n) => n.remove());
    const node = document.createElement("div");
    node.className = classes.error;
    node.setAttribute("role", "status");
    node.textContent = message;
    actionbar.appendChild(node);
    clearTimeout(errorTimer);
    errorTimer = setTimeout(() => node.remove(), 6000);
  };

  const enterSource = () => {
    clearTimeout(formatTimer);
    closeTableDropdown();
    mode = "source";
    source.value = content.innerHTML;
    content.hidden = true;
    source.hidden = false;
    source.focus();
    updateTableControls();
  };

  const exitSource = () => {
    content.innerHTML = source.value;
    source.hidden = true;
    content.hidden = false;
    mode = "wysiwyg";
    updateTableControls();
    if (settings.onChange) settings.onChange(content.innerHTML);
    return true;
  };

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

  const linkResult = () => {
    const url = window.prompt("Enter the link URL");
    if (!url) return false;
    if (!unrestricted && !allowLinkURL(url, baseURI, true)) {
      showError("Refusing to insert an unsafe link URL");
      return false;
    }
    return exec("createLink", url.trim());
  };

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
    else showError(message);
    return false;
  };

  const captureTableRange = () => {
    const selection = document.getSelection();
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
    tableRange = range && content.contains(range.commonAncestorContainer) ? range.cloneRange() : null;
  };

  const closeTableDropdown = (restoreFocus = false) => {
    if (tableDropdown && !tableDropdown.hidden) {
      if (tableDropdown.hasAttribute("popover")) tableDropdown.hidePopover();
      tableDropdown.hidden = true;
      tableTrigger?.setAttribute("aria-expanded", "false");
      if (restoreFocus) tableTrigger?.focus();
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
    const anchor = tableTrigger.getBoundingClientRect();
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

  const tableResult = () => {
    if (tableDropdown && !tableDropdown.hidden) {
      closeTableDropdown(true);
      return false;
    }
    if (!tableRange) captureTableRange();
    if (!tableDropdown) createTableDropdown();
    resetTableDropdown();
    tableDropdown.hidden = false;
    if (tableDropdown.hasAttribute("popover")) tableDropdown.showPopover();
    tableTrigger.setAttribute("aria-controls", tableDropdown.id);
    tableTrigger.setAttribute("aria-expanded", "true");
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
    const ok = exec("insertHTML", buildImgTag(url, alt || `image ${++imageCounter}`));
    if (!ok) return false;
    content.focus();
    return true;
  };

  // Validate, convert (or upload via the custom handler), then insert.
  // Never throws; problems surface as the toolbar note and return false.
  const handleFile = async (file) => {
    if (mode === "source" || destroyed) return false;
    if (!images.enabled) {
      showError("Images are disabled");
      return false;
    }
    const selection = document.getSelection();
    const range = selection && selection.rangeCount ? selection.getRangeAt(0) : null;
    const savedRange = range && content.contains(range.commonAncestorContainer)
      ? range.cloneRange()
      : null;
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

      if (mode === "source" || destroyed) return false;
      const urlError = imageURLError(url);
      if (urlError) throw new Error(urlError);

      const width = await imageWidth(url);
      return placeImage(url, width ? `image (${width}px)` : "image", savedRange);
    } catch (err) {
      showError(err instanceof Error ? err.message : String(err));
      return false;
    }
  };

  const insertImageURL = (url) => {
    if (mode === "source" || destroyed) return false;
    if (!images.enabled) {
      showError("Images are disabled");
      return false;
    }
    const trimmed = url.trim();
    const urlError = imageURLError(trimmed);
    if (urlError) {
      showError(urlError);
      return false;
    }
    return placeImage(trimmed);
  };

  // The image action: URL prompt, or the file picker when allowURL is off.
  const imagePrompt = () => {
    const url = window.prompt("Enter the image URL");
    return url ? insertImageURL(url) : false;
  };

  const imagePicker = () => {
    if (!pickerInput) {
      pickerInput = document.createElement("input");
      pickerInput.type = "file";
      pickerInput.accept = unrestricted ? "" : IMAGE_TYPES.join(",");
      pickerInput.style.display = "none";
      listen(pickerInput, "change", () => {
        const file = pickerInput.files && pickerInput.files[0];
        pickerInput.value = ""; // allow reselecting the same file
        if (file) handleFile(file);
      });
      element.appendChild(pickerInput);
      cleanups.push(() => pickerInput.remove());
    }
    // Headless browsers swallow the file dialog; real browsers open it.
    pickerInput.click();
    return true;
  };

  const imageResult = () => {
    if (!images.enabled) {
      showError("Images are disabled");
      return false;
    }
    return images.allowURL ? imagePrompt() : imagePicker();
  };

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
    clearTimeout(errorTimer);
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
    else if (!tablebar.contains(document.activeElement) && !actionbar.contains(document.activeElement)) {
      const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
      const start = range && cellAt(range.startContainer);
      activeCell = document.activeElement === content && start &&
        start === cellAt(range.endContainer) ? start : null;
    }
    if (activeCell && !content.contains(activeCell)) activeCell = null;
    tablebar.hidden = !activeCell;
    if (!activeCell) return;
    const info = inspectTable(activeCell.closest("table"));
    for (const [command, button] of tableButtons) {
      button.disabled = !canEditTable(info, activeCell, command);
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
        showError(TABLE_SIZE_ERROR);
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

  const toolbarButtons = [];
  actions.forEach((action, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = classes.button;
    button.innerHTML = action.icon;
    button.title = action.title;
    button.setAttribute("aria-label", action.title);

    if (action.result === tableResult) {
      button.setAttribute("aria-haspopup", "dialog");
      button.setAttribute("aria-expanded", "false");
      const capture = () => {
        tableTrigger = button;
        if (!tableDropdown || tableDropdown.hidden) captureTableRange();
      };
      listen(button, "mousedown", capture);
      listen(button, "focus", capture);
    }

    // In source mode only the source button acts; WYSIWYG commands must not
    // fire against the hidden editor.
    const onClick = () => {
      if (mode === "source" && action !== sourceAction &&
          !(action.name === "source" && action.result === sourceAction.result)) return;
      if (mode === "wysiwyg") applyEditingSettings();
      if (action.result === tableResult) tableTrigger = button;
      if (action.result()) content.focus();
    };
    listen(button, "click", onClick);

    if (action.state) {
      const update = () => button.classList.toggle(classes.selected, action.state());
      listen(content, "keyup", update);
      listen(content, "mouseup", update);
      listen(button, "click", update);
    }

    actionbar.appendChild(button);
    if (!settings.actions) {
      const name = Object.keys(defaultActions).find(name => defaultActions[name] === resolvedActions[index]) || 'source';
      toolbarButtons.push({ button, name });
    }
  });
  if (!settings.actions) cleanups.push(groupToolbar(actionbar, toolbarButtons));

  const onTableOutsideClick = (event) => {
    if (tableDropdown && !tableDropdown.hidden && !tableDropdown.contains(event.target) &&
        !tableTrigger?.contains(event.target)) closeTableDropdown();
  };
  const onTableEscape = (event) => {
    if (event.key === "Escape" && tableDropdown && !tableDropdown.hidden) {
      event.preventDefault();
      closeTableDropdown(true);
    }
  };
  listen(document, "pointerdown", onTableOutsideClick);
  listen(document, "keydown", onTableEscape);
  listen(window, "resize", positionTableDropdown);
  listen(window, "scroll", positionTableDropdown, true);

  element.appendChild(actionbar);
  element.appendChild(tablebar);
  element.appendChild(content);
  if (hasSource) element.appendChild(source);

  /** Current HTML, in either mode. */
  const getHTML = () => (mode === "source" ? source.value : content.innerHTML);

  /** Replace content in either mode. Fires onChange. */
  const setHTML = (html) => {
    clearTimeout(formatTimer);
    closeTableDropdown();
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
   * shown as a toolbar note).
   */
  const insertImage = (imgSource) => {
    if (mode === "source" || destroyed) return Promise.resolve(false);
    if (typeof imgSource === "string") {
      return Promise.resolve(insertImageURL(imgSource));
    }
    if (imgSource && typeof Blob !== "undefined" && imgSource instanceof Blob) {
      return handleFile(imgSource);
    }
    showError("insertImage expects a URL, data URI, or File");
    return Promise.resolve(false);
  };

  /**
   * Remove editor-owned nodes and all registered listeners. Preserve the host
   * element and any content added directly to it by the application.
   */
  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    closeTableDropdown();
    tableDropdown?.remove();
    cleanups.forEach((fn) => fn());
    actionbar.remove();
    tablebar.remove();
    activeCell = null;
    content.remove();
    source.remove();
  };

  return { element, content, source, getHTML, setHTML, getText, insertTable, insertImage, destroy };
};

export default { exec, init };
