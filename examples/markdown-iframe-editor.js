/* Application code that runs inside the example frame, not an isolation API. */
document.body.style.margin = "0";
document.body.style.fontFamily = "system-ui, sans-serif";
const element = document.getElementById("editor");
element.style.setProperty("--lightmarkdown-height", "320px");
window.__markdownEditor = maiden.init({
  element,
  onChange(markdown) {
    // Same-origin example glue: send text, not HTML, to the parent application.
    window.frameElement?.dispatchEvent(new CustomEvent("markdownchange", { detail: markdown }));
  }
});
window.__markdownEditor.setMarkdown([
  "## Own native history",
  "",
  "The toolbar and writing area live in this document.",
  "Edit here, then edit the application note outside."
].join("\n"));
