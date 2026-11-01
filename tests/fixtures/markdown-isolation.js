/* M1 experiment: use the unchanged library in either one or three documents.
 * The full-toolbar iframe is a test harness, not a proposed production API.
 */
const params = new URLSearchParams(location.search);
const mode = params.get("mode") === "isolated" ? "isolated" : "inline";
const callback = ["remove", "textarea"].includes(params.get("callback")) ? params.get("callback") : "text";
const raw = document.createTextNode("");
document.getElementById("raw").append(raw);
const plaintext = params.get("plaintext") === "1";
const experiment = window.__experiment = { mode, callback, plaintext, editors: {}, frames: {}, changes: [], ready: false };

function report(id, value) {
  experiment.changes.push({ id, value });
  raw.data = Object.entries(experiment.editors).map(([key, api]) => `${key}: ${api.getMarkdown()}`).join("\n\n");
  if (callback === "remove") {
    const child = document.createElement("span");
    child.textContent = value;
    document.getElementById("mutation-target").replaceChildren(child);
  } else if (callback === "textarea") document.getElementById("sink").value = value;
}

function appearance(skin = document.getElementById("skin").value, palette = document.getElementById("palette").value) {
  const skins = [...document.getElementById("skin").options].map(option => option.value).filter(Boolean);
  for (const api of Object.values(experiment.editors)) {
    for (const name of skins) api.element.classList.toggle("lightmetal-" + name, skin === name);
    for (const name of ["light", "dark"]) api.element.classList.toggle("lightmetal-" + name, palette === name);
  }
}
experiment.appearance = appearance;
experiment.destroy = id => {
  experiment.editors[id].destroy();
  experiment.frames[id]?.remove();
  delete experiment.frames[id];
};
experiment.mount = async (id, options = {}) => {
  const host = document.getElementById("host-" + id);
  let scope = window, element = host;
  if (mode !== "inline") {
    const frame = document.createElement("iframe");
    frame.id = "frame-" + id;
    frame.title = "Editor " + id.toUpperCase() + " — isolated Markdown experiment";
    // srcdoc inherits the parent's origin, including file use. The explicit base
    // resolves local assets. No inline script/style or source Markdown enters HTML.
    const doc = document.implementation.createHTMLDocument(frame.title);
    doc.documentElement.lang = "en";
    const base = doc.createElement("base"); base.href = location.href; doc.head.append(base);
    for (const link of document.querySelectorAll('link[rel="stylesheet"]')) doc.head.append(link.cloneNode(true));
    doc.head.append(document.getElementById("markdown-library").cloneNode(true));
    doc.body.className = "experiment-frame";
    const inner = doc.createElement("div"); inner.className = "experiment-editor"; doc.body.append(inner);
    const loaded = new Promise((resolve, reject) => {
      frame.addEventListener("load", resolve, { once: true });
      frame.addEventListener("error", () => reject(new Error("Editing frame failed to load")), { once: true });
    });
    frame.srcdoc = "<!doctype html>" + doc.documentElement.outerHTML;
    host.append(frame); experiment.frames[id] = frame;
    await loaded;
    scope = frame.contentWindow; element = frame.contentDocument.querySelector(".experiment-editor");
  }
  const api = scope.maiden.init({ ...options, element,
    onChange: value => { report(id, value); options.onChange?.(value); } });
  experiment.editors[id] = api;
  if (plaintext) api.content.contentEditable = "plaintext-only";
  api.setMarkdown("body " + id);
  appearance();
  return api;
};
for (const id of ["mode", "callback"]) {
  const select = document.getElementById(id); select.value = id === "mode" ? mode : callback;
  select.addEventListener("change", () => {
    const url = new URL(location.href); url.searchParams.set(id, select.value); location.href = url.href;
  });
}
for (const id of ["skin", "palette"]) document.getElementById(id).addEventListener("change", () => appearance());
Promise.all([experiment.mount("a"), experiment.mount("b")]).then(() => {
  experiment.ready = true;
  document.getElementById("status").textContent = `${mode} document mode; ${callback} host callback; contenteditable=${plaintext ? "plaintext-only" : "true"}. Refresh resets text.`;
}).catch(error => {
  experiment.error = error.message;
  document.getElementById("status").textContent = error.message;
});
