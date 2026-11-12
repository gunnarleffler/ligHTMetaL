import { fail } from './errors.js';

// Only one editor owns page isolation/scroll restoration in a document at a time.
const owners = new WeakMap();

/** Expand the existing root, never clone/remount editor state or canvases. */
export function createFullscreen(root,{onBeforeChange,onChange,onError}) {
  const doc = root.ownerDocument,window = doc.defaultView;
  let expanded = false,desired = false,native = false,destroyed = false,pending = null,saved = null,exiting = false,popover = false;
  const controller = {setExpanded,destroy};
  function capture() {
    const body = doc.body,html = doc.documentElement;
    const touch = window.navigator.maxTouchPoints > 0 || window.matchMedia('(any-pointer: coarse)').matches;
    const properties = ['overflow-x','overflow-y','overscroll-behavior-x','overscroll-behavior-y'];
    const styles = [[html,properties],[body,[...properties,...(touch ? ['position','top','left','width'] : [])]]]
      .map(([element,names]) => ({element,values:names.map(name => [name,element.style.getPropertyValue(name),element.style.getPropertyPriority(name)])}));
    saved = {focus:doc.activeElement,x:window.scrollX,y:window.scrollY,touch,styles,
      role:root.getAttribute('role'),modal:root.getAttribute('aria-modal'),popover:root.getAttribute('popover'),inert:[]};
    for (const element of [html,body]) {element.style.setProperty('overflow','hidden','important');element.style.setProperty('overscroll-behavior','none','important');}
    // iPad Safari can scroll the page despite overflow:hidden. Pin it at the
    // captured offset; restore every touched property/priority on exit or teardown.
    if (touch) {
      for (const [name,value] of [['position','fixed'],['top',`${-saved.y}px`],['left',`${-saved.x}px`],['width','100%']]) body.style.setProperty(name,value,'important');
    }
    for (let node = root;node.parentElement;node = node.parentElement) {
      for (const sibling of node.parentElement.children) if (sibling !== node && !sibling.hasAttribute('inert')) {
        sibling.setAttribute('inert','');saved.inert.push(sibling);
      }
      if (node.parentElement === body) break;
    }
    root.setAttribute('role','dialog');root.setAttribute('aria-modal','true');
  }
  function publish(value) {
    if (expanded === value) return;
    expanded = value;
    if (!destroyed) onChange(value);
  }
  function restore() {
    if (popover) {root.hidePopover();popover = false;}
    root.classList.remove('etch-expanded');native = false;
    if (owners.get(doc) === controller) owners.delete(doc);
    if (!saved) return;
    const previous = saved;saved = null;
    for (const {element,values} of previous.styles) {
      for (const [name] of values) element.style.removeProperty(name);
      for (const [name,value,priority] of values) if (value) element.style.setProperty(name,value,priority);
    }
    for (const node of previous.inert) node.removeAttribute('inert');
    for (const [name,value] of [['role',previous.role],['aria-modal',previous.modal],['popover',previous.popover]]) {
      if (value === null) root.removeAttribute(name);else root.setAttribute(name,value);
    }
    if (previous.focus?.isConnected) previous.focus.focus({preventScroll:true});
    window.scrollTo({left:previous.x,top:previous.y,behavior:'instant'});
  }
  async function exitNative() {
    if (doc.fullscreenElement !== root) return;
    exiting = true;
    try {await doc.exitFullscreen();}
    catch {if (doc.fullscreenElement === root) fail('INVALID_ARGUMENT','Could not exit fullscreen; press Escape or use the browser fullscreen controls');}
    finally {exiting = false;}
  }
  async function reconcile() {
    try {
      while (!destroyed && desired !== expanded) {
        if (desired) {
          let other;
          while ((other = owners.get(doc)) && other !== controller) await other.setExpanded(false);
          if (destroyed || !desired) break;
          owners.set(doc,controller);onBeforeChange();capture();
          // Denial/unavailability is expected: use the same root in fixed-position mode.
          // Touch devices use in-page expansion: Safari reserves gestures that
          // can leave native fullscreen before the editor receives pointer events.
          if (!saved.touch && typeof root.requestFullscreen === 'function' && doc.fullscreenEnabled !== false) {
            try {await root.requestFullscreen();} catch { /* CSS expansion below. */ }
          }
          if (destroyed || !desired) {
            await exitNative();restore();break;
          }
          native = doc.fullscreenElement === root;
          root.classList.add('etch-expanded');
          // Top-layer placement escapes transformed/clipped hosts without reparenting
          // or losing inherited theme tokens. Older browsers still get CSS expansion.
          if (!native && typeof root.showPopover === 'function') {
            root.setAttribute('popover','manual');root.showPopover();popover = true;
          }
          publish(true);root.focus({preventScroll:true});
        } else {
          onBeforeChange();await exitNative();restore();publish(false);
        }
      }
      if (destroyed) fail('CANCELLED','Fullscreen transition cancelled by destruction');
    } catch(error) {
      if (doc.fullscreenElement === root && !destroyed) {
        // Even a cancelled entry may land in native fullscreen if exit is denied.
        native = true;root.classList.add('etch-expanded');publish(true);
      } else {restore();publish(false);}
      desired = expanded;
      throw error;
    }
  }
  function setExpanded(value) {
    if (destroyed) fail('DESTROYED','This editor has been destroyed');
    desired = value;
    if (pending) return pending;
    if (desired === expanded) return Promise.resolve();
    pending = (async () => {
      try {do {await reconcile();} while (!destroyed && desired !== expanded);}
      finally {pending = null;}
    })();
    return pending;
  }
  function fullscreenChanged() {
    if (native && doc.fullscreenElement !== root && !exiting) {
      desired = false;onBeforeChange();restore();publish(false);
    }
  }
  function keydown(event) {
    if (!expanded || !root.contains(event.target) || root.querySelector('dialog[open], .etch-shape-menu:popover-open, .etch-export-menu:popover-open')) return;
    if (event.key === 'Escape') {
      event.preventDefault();event.stopPropagation();setExpanded(false).catch(onError);
    } else if (event.key === 'Tab') {
      const controls = [...root.querySelectorAll('button,input,select,textarea,a[href],[tabindex],[contenteditable="true"]')]
        .filter(node => !node.disabled && node.tabIndex >= 0 && node.getClientRects().length && !node.closest('[inert]'));
      const first = controls[0] ?? root,last = controls.at(-1) ?? root;
      if (event.shiftKey && (doc.activeElement === first || doc.activeElement === root)) {
        event.preventDefault();last.focus();
      } else if (!event.shiftKey && (doc.activeElement === last || doc.activeElement === root)) {
        event.preventDefault();first.focus();
      }
    }
  }
  function destroy() {
    if (destroyed) return;
    destroyed = true;desired = false;
    doc.removeEventListener('fullscreenchange',fullscreenChanged);doc.removeEventListener('keydown',keydown,true);
    // Browser entry can resolve after destruction; reconcile also exits that late entry.
    exitNative().catch(onError);restore();expanded = false;
  }
  doc.addEventListener('fullscreenchange',fullscreenChanged);doc.addEventListener('keydown',keydown,true);
  return controller;
}
