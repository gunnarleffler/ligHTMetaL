/** Keep browser gestures off the canvas without disabling native UI scrollports.
 * touch-action/overscroll CSS do most of the work; non-passive local listeners cover
 * Safari's gesture events and scroll-boundary bounce. Nothing is installed globally.
 */
export function installGestureGuard(root,isExpanded) {
  const win = root.ownerDocument.defaultView,listeners = [];
  let contact = null;
  const element = target => target?.nodeType === 1 ? target : target?.parentElement;
  const viewport = target => Boolean(element(target)?.closest('.etch-viewport'));
  function listen(name,handler,options) {
    root.addEventListener(name,handler,options);listeners.push(() => root.removeEventListener(name,handler,options));
  }
  function remember(event) {
    const touch = event.touches.length === 1 ? event.touches[0] : null;
    contact = touch ? {id:touch.identifier,x:touch.clientX,y:touch.clientY} : null;
  }
  function canScroll(target,dx,dy) {
    const horizontal = Math.abs(dx) > Math.abs(dy),delta = horizontal ? dx : dy;
    if (!delta) return true;
    for (let node = element(target);node && node !== root;node = node.parentElement) {
      const style = win.getComputedStyle(node),overflow = horizontal ? style.overflowX : style.overflowY;
      const maximum = horizontal ? node.scrollWidth-node.clientWidth : node.scrollHeight-node.clientHeight;
      if (!['auto','scroll'].includes(overflow) || maximum <= 1) continue;
      const position = horizontal ? node.scrollLeft : node.scrollTop,rtl = horizontal && style.direction === 'rtl';
      const low = rtl ? -maximum : 0,high = rtl ? 0 : maximum;
      // The closest scrollport owns this drag; don't chain through its boundary.
      return delta > 0 ? position > low+0.5 : position < high-0.5;
    }
    return false;
  }
  listen('touchstart',remember,{passive:true});
  listen('touchmove',event => {
    const touches = Array.from(event.touches),touch = touches.length === 1 ? touches[0] : null;
    const owned = viewport(event.target) || touches.some(t => viewport(t.target));
    if (owned || touches.length > 1 && isExpanded()) {
      if (event.cancelable) event.preventDefault();remember(event);return;
    }
    if (!touch || !contact || touch.identifier !== contact.id) {remember(event);return;}
    const dx = touch.clientX-contact.x,dy = touch.clientY-contact.y;remember(event);
    // Preserve native slider/caret/selection/picker behavior. Range inputs separately
    // disable browser panning via CSS; fullscreen also locks the host page.
    if (element(event.target)?.closest('input,textarea,select,[contenteditable="true"]')) return;
    if (!canScroll(event.target,dx,dy) && event.cancelable) event.preventDefault();
  },{passive:false});
  for (const name of ['touchend','touchcancel']) listen(name,remember,{passive:true});
  for (const name of ['gesturestart','gesturechange','gestureend']) listen(name,event => {
    if ((viewport(event.target) || isExpanded()) && event.cancelable) event.preventDefault();
  },{passive:false});
  return () => {contact = null;for (const remove of listeners) remove();};
}
