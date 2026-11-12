/* Example startup only. The library's default view stays source-only. */
window.markdownDemo = {
  startSplit(editor) {
    const button = editor.element.querySelector('button[aria-label="Side-by-side"]');
    if (button.getAttribute('aria-pressed') === 'true') return;
    const doc = editor.element.ownerDocument, view = doc.defaultView;
    const active = doc.activeElement, selection = doc.getSelection();
    const frame = view.frameElement, parentActive = frame?.ownerDocument.activeElement;
    const { anchorNode, anchorOffset, focusNode, focusOffset } = selection;
    const x = view.scrollX, y = view.scrollY;
    button.click();
    // The normal toolbar action focuses writing. Startup must not steal page focus.
    editor.content.blur();
    active?.focus({ preventScroll: true });
    if (frame && parentActive !== frame) {
      frame.blur();
      // Body needs to be focusable to restore the parent document's focus.
      const temporary = parentActive === frame.ownerDocument.body &&
        !parentActive.hasAttribute('tabindex') && frame.ownerDocument.activeElement !== parentActive;
      if (temporary) parentActive.setAttribute('tabindex', '-1');
      parentActive?.focus({ preventScroll: true });
      if (temporary) parentActive.removeAttribute('tabindex');
    }
    if (anchorNode) selection.setBaseAndExtent(anchorNode, anchorOffset, focusNode, focusOffset);
    else selection.removeAllRanges();
    view.scrollTo(x, y);
  }
};
