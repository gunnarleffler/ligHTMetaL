/* Highlight example snippets without replacing live output nodes during typing. */
window.exampleCode = (() => {
  const highlighter = polish.createHighlighter({ languages: polish.allLanguages, guessLanguage: false });
  const blocks = new Map();
  function clear(node) {
    if (node.nodeType === 3) node.data = '';
    else { node.hidden = true; for (const child of node.childNodes) clear(child); }
  }
  // Only pass poliSH-generated markup here; this demo painter is not a sanitizer.
  function paint(block, html, { followTheme = true } = {}) {
    let state = blocks.get(block);
    if (!state) {
      const target = block.querySelector(':scope > code') || block;
      for (const node of target.childNodes) clear(node);
      state = { target, slots: [], html: null, followTheme };
      blocks.set(block, state);
      if (followTheme) block.classList.add('code');
    }
    if (state.html === html) return;
    const template = document.createElement('template');
    // Character references retain CR when the inert HTML parser would normalize CRLF.
    template.innerHTML = html.replace(/\r/g, '&#13;');
    let index = 0;
    for (const node of template.content.childNodes) {
      let slot = state.slots[index++];
      if (!slot) {
        const span = document.createElement('span');
        const text = document.createTextNode(''); span.append(text);
        state.target.append(span); state.slots.push(slot = { span, text });
      }
      const classes = node.nodeType === 1 ? node.className : '';
      if (slot.span.className !== classes) slot.span.className = classes;
      const style = node.nodeType === 1 ? node.style.cssText : '';
      if (slot.span.style.cssText !== style) slot.span.style.cssText = style;
      if (slot.text.data !== node.textContent) slot.text.data = node.textContent;
      if (slot.span.hidden) slot.span.hidden = false;
    }
    for (; index < state.slots.length; index++) {
      const { span, text } = state.slots[index];
      span.hidden = true; text.data = '';
    }
    state.html = html;
  }
  function write(block, source, language) {
    paint(block, highlighter.highlight(source, language));
  }
  for (const block of document.querySelectorAll('pre[data-code-language]')) {
    write(block, block.textContent, block.dataset.codeLanguage);
  }
  return { write, paint };
})();
