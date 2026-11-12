/** Per-mount presentation preference. Never touches native content or storage. */
export function createSidebarResize(root, body, sidebar, onStart) {
  const doc = root.ownerDocument, win = doc.defaultView;
  const handle = doc.createElement('div');handle.className = 'etch-sidebar-resize';handle.tabIndex = 0;
  for (const [name,value] of Object.entries({role:'separator','aria-label':'Resize sidebar','aria-orientation':'vertical','aria-controls':sidebar.id})) handle.setAttribute(name,value);
  handle.title = 'Drag to resize sidebar · Left/Right: resize · Home/End: limits · Enter or double-click: reset';
  sidebar.prepend(handle);
  let requested = null, drag = null, destroyed = false;
  const limits = () => {const max = Math.max(0,Math.min(400,body.clientWidth-40));return {min:Math.min(200,max),max};};
  const clamp = width => {const {min,max} = limits();return Math.max(min,Math.min(max,width));};
  function update() {
    const {min,max} = limits();
    handle.setAttribute('aria-valuemin',String(Math.round(min)));handle.setAttribute('aria-valuemax',String(Math.round(max)));
    handle.setAttribute('aria-valuenow',String(Math.round(sidebar.getBoundingClientRect().width)));
    handle.setAttribute('aria-valuetext',`${handle.getAttribute('aria-valuenow')} pixels`);
  }
  function set(width) {
    requested = width;
    if (width === null) sidebar.style.removeProperty('--etch-session-sidebar-width');
    else sidebar.style.setProperty('--etch-session-sidebar-width',`${width}px`);
    update();
  }
  function finish(commit) {
    if (!drag) return;
    const previous = drag;drag = null;root.classList.remove('etch-sidebar-resizing');
    if (!commit) set(previous.requested);
    if (handle.hasPointerCapture(previous.id)) handle.releasePointerCapture(previous.id);
  }
  function reset() {if (destroyed) return;finish(false);onStart();set(240);}
  handle.addEventListener('pointerdown',event => {
    if (destroyed || drag || event.button !== 0) return;
    event.preventDefault();onStart();handle.focus({preventScroll:true});
    drag = {id:event.pointerId,x:event.clientX,width:sidebar.getBoundingClientRect().width,requested};
    handle.setPointerCapture(event.pointerId);root.classList.add('etch-sidebar-resizing');
  });
  handle.addEventListener('pointermove',event => {
    if (destroyed || !drag || event.pointerId !== drag.id) return;
    if (!handle.hasPointerCapture(event.pointerId)) {finish(false);return;}
    set(clamp(drag.width+drag.x-event.clientX));
  });
  handle.addEventListener('pointerup',event => {
    if (destroyed || !drag || event.pointerId !== drag.id) return;
    if (!handle.hasPointerCapture(event.pointerId)) {finish(false);return;}
    set(clamp(drag.width+drag.x-event.clientX));finish(true);
  });
  for (const type of ['pointercancel','lostpointercapture']) handle.addEventListener(type,event => {if (drag?.id === event.pointerId) finish(false);});
  handle.addEventListener('dblclick',reset);
  handle.addEventListener('keydown',event => {
    if (destroyed) return;
    if (!['ArrowLeft','ArrowRight','Home','End','Enter','Escape'].includes(event.key)) return;
    event.preventDefault();event.stopPropagation();
    if (event.key === 'Escape') {finish(false);return;}
    if (event.key === 'Enter') {reset();return;}
    finish(false);onStart();const {min,max} = limits(),step = event.shiftKey ? 50 : 10;
    set(event.key === 'Home' ? min : event.key === 'End' ? max : clamp(sidebar.getBoundingClientRect().width+(event.key === 'ArrowLeft' ? step : -step)));
  });
  const cancel = () => finish(false);
  handle.addEventListener('blur',cancel);win.addEventListener('blur',cancel);
  const observer = new win.ResizeObserver(entries => {
    if (destroyed) return;
    if (entries.some(entry => entry.target === body)) finish(false);
    update();
  });
  observer.observe(body);observer.observe(sidebar);
  return {
    cancel,
    destroy() {destroyed = true;finish(false);observer.disconnect();win.removeEventListener('blur',cancel);handle.remove();},
  };
}
