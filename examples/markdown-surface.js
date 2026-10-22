/* Demo-only M1 experiment: parent toolbar + child-document writing surface.
 * This async adapter is NOT a production init() change. It loads the same built
 * library in the child window. No source Markdown enters the frame template.
 */
async function createMarkdownSurfaceFrame(host) {
  const frame = document.createElement("iframe");
  frame.title = "Experimental isolated Markdown source";
  const template = document.implementation.createHTMLDocument(frame.title);
  template.documentElement.lang = document.documentElement.lang || "en";
  const base = template.createElement("base"); base.href = location.href; template.head.append(base);
  for (const link of document.querySelectorAll('link[rel="stylesheet"]')) template.head.append(link.cloneNode(true));
  template.head.append(document.getElementById("markdown-library").cloneNode(true));
  const inner = template.createElement("div"); inner.dataset.markdownSurfaceHost = ""; template.body.append(inner);
  let timer;
  const loaded = new Promise((resolve, reject) => {
    frame.addEventListener("load", resolve, { once: true });
    frame.addEventListener("error", () => reject(new Error("Editing frame failed to load")), { once: true });
    timer = setTimeout(() => reject(new Error("Editing frame load timed out")), 10000);
  });
  frame.srcdoc = "<!doctype html>" + template.documentElement.outerHTML;
  host.append(frame);
  try { await loaded; return frame; }
  catch (error) { frame.remove(); throw error; }
  finally { clearTimeout(timer); }
}

window.__initMarkdownSurface = async function (settings, frame) {
  const host = settings.element;
  frame = frame || await createMarkdownSurfaceFrame(host);
  const owned = ["lightmetal", "lightmarkdown"].filter(name => !host.classList.contains(name));
  host.classList.add(...owned);
  let inner, toolbar, destroyed = false;
  const removals = [];
  const api = {
    element: host,
    get content() { return inner.content; },
    getMarkdown: () => inner.getMarkdown(),
    setMarkdown: value => inner.setMarkdown(value),
    insertText: value => inner.insertText(value),
    destroy() {
      if (destroyed) return;
      destroyed = true;
      for (const remove of removals) remove();
      inner?.destroy();
      frame.remove();
      host.classList.remove(...owned, "lightmarkdown-composing");
    }
  };
  try {
    if (!frame.contentWindow.maiden?.init) throw new Error("The isolated editor bundle could not load.");
    const innerHost = frame.contentDocument.querySelector("[data-markdown-surface-host], .experiment-editor");
    const childDocument = innerHost.ownerDocument;
    childDocument.documentElement.dataset.lightmarkdownSurface = "";
    frame.classList.add("lightmarkdown-surface-frame");
    function sync() {
      if (destroyed) return;
      if (innerHost.className !== host.className) innerHost.className = host.className;
      const style = host.ownerDocument.defaultView.getComputedStyle(host);
      for (const name of style) {
        if (/^--light(?:metal|markdown)-/.test(name)) innerHost.style.setProperty(name, style.getPropertyValue(name));
      }
      innerHost.style.colorScheme = style.colorScheme;
    }
    function expose(value) {
      inner = value;
      if (!toolbar) {
        toolbar = innerHost.querySelector('[role="group"]');
        host.insertBefore(toolbar, frame);
        sync();
      }
      return api;
    }
    const actions = settings.actions?.map(action => {
      if (!action || typeof action !== "object") return action;
      const copy = { ...action };
      if (typeof action.result === "function") copy.result = value => action.result(expose(value));
      if (typeof action.state === "function") copy.state = value => action.state(expose(value));
      return copy;
    });
    expose(frame.contentWindow.maiden.init({ ...settings, element: innerHost, actions }));
    // This bridge does not promise arbitrary parent selectors or CSSOM edits.
    const parentObserver = new MutationObserver(sync);
    for (let node = host; node; node = node.parentElement) {
      parentObserver.observe(node, { attributes: true, attributeFilter: ["class", "style"] });
    }
    removals.push(() => parentObserver.disconnect());
    const childObserver = new frame.contentWindow.MutationObserver(() => {
      host.classList.toggle("lightmarkdown-composing", innerHost.classList.contains("lightmarkdown-composing"));
    });
    childObserver.observe(innerHost, { attributes: true, attributeFilter: ["class"] });
    removals.push(() => childObserver.disconnect());
    const resize = new ResizeObserver(sync); resize.observe(host);
    const media = matchMedia("(prefers-color-scheme: dark)"); media.addEventListener("change", sync);
    removals.push(() => resize.disconnect(), () => media.removeEventListener("change", sync));
    return api;
  } catch (error) { api.destroy(); throw error; }
};
