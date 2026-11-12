/** Move existing controls, never clone command handlers or editing nodes. */
let nextPopup = 0;
export function createToolbarOverflow({element, toolbar, entries, listen, closeMenus, defaultToolbar}) {
  const doc = element.ownerDocument, win = doc.defaultView;
  const trigger = doc.createElement('button');
  trigger.type = 'button'; trigger.className = 'lightmetal-button lightmetal-overflow-trigger'; trigger.textContent = '⋯';
  trigger.title = defaultToolbar ? 'More' : 'Overflow'; trigger.setAttribute('aria-label',trigger.title);
  trigger.setAttribute('aria-haspopup','dialog'); trigger.setAttribute('aria-expanded','false'); trigger.tabIndex = -1;
  const popup = doc.createElement('div');
  popup.className = 'lightmetal-toolbar-popup lightmetal-overflow';
  // Native toolbar buttons keep their toggle semantics inside this non-modal popup.
  popup.setAttribute('role','dialog'); popup.setAttribute('aria-label',trigger.title);
  popup.id = `lightmetal-overflow-${++nextPopup}`; trigger.setAttribute('aria-controls',popup.id); popup.hidden = true;
  if (typeof popup.showPopover === 'function') popup.setAttribute('popover','manual');
  const slots = entries.map(({button}) => {
    const slot = doc.createComment('toolbar action'); toolbar.insertBefore(slot,button); return slot;
  });
  const historyIndex = defaultToolbar ? entries.findIndex(entry => entry.name === 'undo') : -1;
  if (historyIndex >= 0) toolbar.insertBefore(trigger,slots[historyIndex]);
  else toolbar.append(trigger);
  element.append(popup);
  function close(focus = false) {
    if (popup.hasAttribute('popover') && popup.matches(':popover-open')) popup.hidePopover();
    popup.hidden = true; trigger.setAttribute('aria-expanded','false');
    if (focus) trigger.focus();
  }
  function position() {
    if (popup.hidden) return;
    popup.style.maxHeight = `${Math.max(0,win.innerHeight-16)}px`;
    popup.style.maxWidth = `${Math.max(0,win.innerWidth-16)}px`;
    const anchor = trigger.getBoundingClientRect(), box = popup.getBoundingClientRect();
    popup.style.left = `${Math.max(8,Math.min(anchor.left,win.innerWidth-box.width-8))}px`;
    popup.style.top = `${Math.max(8,Math.min(anchor.bottom+4,win.innerHeight-box.height-8))}px`;
  }
  let lastWidth = -1;
  function layout() {
    const width = toolbar.clientWidth;
    if (!width || width === lastWidth) return;
    lastWidth = width; close();
    entries.forEach(({button},i) => slots[i].after(button));
    trigger.hidden = true;
    const style = win.getComputedStyle(toolbar), gap = parseFloat(style.columnGap) || 0;
    const available = width - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    const widths = entries.map(({button}) => button.getBoundingClientRect().width + (parseFloat(win.getComputedStyle(button).marginLeft) || 0));
    const secondary = entries.filter(entry => entry.secondary);
    let total = widths.reduce((sum,width,i) => sum+(entries[i].secondary ? 0 : width),0) + gap*Math.max(0,entries.length-secondary.length-1);
    if (total <= available && !secondary.length) return;
    trigger.hidden = false;
    trigger.style.flexShrink = '0';
    total += trigger.getBoundingClientRect().width + gap;
    trigger.style.removeProperty('flex-shrink');
    const priority = ['blocks','bold','table','image','source','fullscreen'];
    const candidates = entries.map((entry,i) => ({...entry,i})).sort((a,b) => {
      const pa = priority.indexOf(a.name), pb = priority.indexOf(b.name);
      return (pa < 0 ? -1 : priority.length-pa) - (pb < 0 ? -1 : priority.length-pb) || b.i-a.i;
    });
    const moved = new Set(secondary.map(entry => entry.button));
    for (const {button,i} of candidates) {
      if (total <= available) break;
      if (moved.has(button)) continue;
      total -= widths[i]+gap; moved.add(button);
    }
    for (const {button} of entries) if (moved.has(button)) popup.append(button);
  }
  listen(trigger,'mousedown',event => event.preventDefault());
  function open() {
    if (!popup.hidden) { close(true); return; }
    closeMenus(); popup.hidden = false;
    if (popup.hasAttribute('popover')) popup.showPopover();
    trigger.setAttribute('aria-expanded','true'); position();
    popup.querySelector('button:not(:disabled)')?.focus();
  }
  listen(trigger,'click',open);
  listen(trigger,'keydown',event => {
    if (event.key === 'ArrowDown') { event.preventDefault(); open(); }
  });
  listen(popup,'keydown',event => {
    if (event.defaultPrevented || event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true); }
    if (event.key === 'Tab') close();
    if (['ArrowDown','ArrowUp','Home','End'].includes(event.key)) {
      event.preventDefault();
      const choices = [...popup.querySelectorAll('button:not(:disabled)')], i = choices.indexOf(doc.activeElement);
      choices[event.key === 'Home' ? 0 : event.key === 'End' ? choices.length-1 : (i+(event.key === 'ArrowUp' ? -1 : 1)+choices.length)%choices.length]?.focus();
    }
  });
  // Menus opened from overflow anchor to its persistent trigger, not a hidden row.
  listen(popup,'click',event => { if (event.target.closest('button')) close(); });
  listen(doc,'pointerdown',event => { if (!popup.contains(event.target) && !trigger.contains(event.target)) close(); });
  listen(element,'focusin',() => { trigger.tabIndex = 0; });
  listen(element,'focusout',event => { if (!element.contains(event.relatedTarget)) {trigger.tabIndex = -1; close();} });
  listen(win,'resize',position); listen(win,'scroll',position,true);
  const observer = new win.ResizeObserver(layout); observer.observe(toolbar); layout();
  return {close,trigger,popup,destroy() {observer.disconnect();close();popup.remove();trigger.remove();slots.forEach(slot => slot.remove());}};
}
