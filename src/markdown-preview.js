/** Keep preview updates from closing Chromium's native source typing groups.
 * Hide spare elements and clear spare Text nodes instead of removing children.
 * Retained DOM follows the rendered structure's high-water mark.
 */
export function paintPreview(target, source) {
  let cursor = target.firstChild;
  const hide = node => {
    if (node.nodeType === 3) { if (node.data) node.data = ''; }
    // Hidden spares were cleared on their first pass; leave their subtree alone.
    else if (!node.hidden) { node.hidden = true; for (const child of node.childNodes) hide(child); }
  };
  for (const wanted of source.childNodes) {
    while (cursor && (cursor.nodeType !== wanted.nodeType || cursor.nodeName !== wanted.nodeName)) {
      hide(cursor); cursor = cursor.nextSibling;
    }
    if (!cursor) { target.append(wanted.cloneNode(true)); continue; }
    if (cursor.nodeType === 3) {
      if (cursor.data !== wanted.data) cursor.data = wanted.data;
    } else {
      for (const attr of Array.from(cursor.attributes)) if (!wanted.hasAttribute(attr.name)) cursor.removeAttribute(attr.name);
      for (const attr of wanted.attributes) if (cursor.getAttribute(attr.name) !== attr.value) cursor.setAttribute(attr.name, attr.value);
      paintPreview(cursor, wanted);
    }
    cursor = cursor.nextSibling;
  }
  while (cursor) { hide(cursor); cursor = cursor.nextSibling; }
}

/** Rebuild renderer output from an inert template. Never attach supplied nodes. */
export function previewHTML(document, html) {
  const template = document.createElement("template"); template.innerHTML = html;
  const allowed = new Set("p br hr h1 h2 h3 h4 h5 h6 strong b em i s del blockquote ul ol li pre code a table thead tbody tfoot tr th td span div dl dt dd sup sub".split(" "));
  const tokenClasses = new Set('token plain comment keyword string number boolean constant function type variable property operator punctuation tag attribute'.split(' '));
  const blocked = new Set("script style iframe object embed svg math form input button textarea select link meta base audio video source".split(" "));
  const clean = (source, target) => {
    for (const node of source.childNodes) {
      if (node.nodeType === 3) { target.append(document.createTextNode(node.data)); continue; }
      if (node.nodeType !== 1) continue;
      if (node.localName === "input" && node.getAttribute("type")?.toLowerCase() === "checkbox") {
        target.append(document.createTextNode(node.hasAttribute("checked") ? "☑ " : "☐ ")); continue;
      }
      if (blocked.has(node.localName)) continue;
      if (node.localName === "img") { target.append(document.createTextNode("[Image: " + (node.getAttribute("alt") || "image") + "]")); continue; }
      if (!allowed.has(node.localName)) { clean(node, target); continue; }
      const copy = document.createElement(node.localName);
      if (node.localName === "a") {
        const href = node.getAttribute("href");
        try {
          const url = new URL(href, document.baseURI);
          if (href && !/[\u0000-\u0020\u007f]/.test(href) && ["http:", "https:", "mailto:"].includes(url.protocol)) {
            copy.setAttribute("href", href); copy.target = "_blank"; copy.rel = "noopener noreferrer";
          }
        } catch {}
      }
      const classes = Array.from(node.classList).filter(name => /^(?:hljs(?:-[a-z0-9_-]+)?|language-[a-z0-9_-]+)$/.test(name) ||
        (node.localName === 'span' && node.classList.contains('token') && tokenClasses.has(name)));
      if (["pre", "code", "span"].includes(node.localName) && classes.length) copy.className = classes.join(" ");
      clean(node, copy); target.append(copy);
    }
  };
  const fragment = document.createDocumentFragment(); clean(template.content, fragment);
  return fragment;
}
