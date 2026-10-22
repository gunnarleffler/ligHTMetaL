/** Shared default-toolbar organization. Explicit action lists stay application-owned. */
const groups = [
  ['bold', 'italic', 'underline', 'strikethrough'],
  ['heading1', 'heading2', 'paragraph'],
  ['quote', 'ulist', 'olist'],
  ['code', 'codeblock'],
  ['line', 'link', 'image', 'table'],
  ['undo', 'redo'],
  ['preview', 'side-by-side', 'fullscreen', 'source', 'guide']
];

export function groupToolbar(toolbar, entries) {
  const sections = [];
  for (const entry of entries) {
    const group = groups.findIndex(names => names.includes(entry.name));
    let section = sections[sections.length - 1];
    if (!section || section.group !== group) {
      const divider = sections.length ? toolbar.ownerDocument.createElement('span') : null;
      if (divider) {
        divider.className = 'lightmetal-toolbar-separator';
        divider.setAttribute('role', 'separator');
        divider.setAttribute('aria-orientation', 'vertical');
        toolbar.insertBefore(divider, entry.button);
      }
      section = { group, divider, buttons: [] }; sections.push(section);
    }
    section.buttons.push(entry.button);
  }
  const refresh = () => {
    let previous = false;
    for (const section of sections) {
      const visible = section.buttons.some(button => {
        const style = toolbar.ownerDocument.defaultView.getComputedStyle(button);
        return !button.hidden && style.display !== 'none' && style.visibility !== 'hidden';
      });
      if (section.divider) section.divider.hidden = !visible || !previous;
      if (visible) previous = true;
    }
  };
  refresh();
  const observer = new MutationObserver(records => {
    if (records.some(record => record.target.tagName === 'BUTTON')) refresh();
  });
  observer.observe(toolbar, { subtree: true, attributes: true, attributeFilter: ['hidden', 'style', 'class', 'disabled'] });
  return () => observer.disconnect();
}
