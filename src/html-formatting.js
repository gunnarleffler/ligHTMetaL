/** Compact native-formatting controls. No editing engine or custom history. */
const icon = path => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${path}"/></svg>`;
const alignmentIcons = {
  justifyLeft: 'M4 5h16M4 10h10M4 15h16M4 20h10',
  justifyCenter: 'M4 5h16M7 10h10M4 15h16M7 20h10',
  justifyRight: 'M4 5h16M10 10h10M4 15h16M10 20h10',
  justifyFull: 'M4 5h16M4 10h16M4 15h16M4 20h16'
};
const groups = {
  headings: ['Headings', 'H1⌄', [1,2,3,4,5,6].map(n => [`Heading ${n}`, 'formatBlock', `<h${n}>`])],
  blocks: ['Paragraph style', '¶⌄', [['Paragraph','formatBlock','<p>'], ...[1,2,3,4,5,6].map(n => [`Heading ${n}`, 'formatBlock', `<h${n}>`]), ['Blockquote','formatBlock','<blockquote>']]],
  lists: ['Lists', '☷⌄', [['Bulleted list','insertUnorderedList'],['Numbered list','insertOrderedList']]],
  insert: ['Insert', '+⌄', [['Horizontal rule','insertHorizontalRule'], ...[['😀','Grinning face'],['😊','Smiling face'],['😂','Laughing'],['❤️','Heart'],['👍','Thumbs up'],['🎉','Celebration'],['✅','Check mark'],['⭐','Star'],['🔥','Fire'],['💡','Idea'],['🙏','Thanks'],['👋','Wave']].map(([emoji,label]) => [`${emoji} ${label}`,'insertText',emoji])]],
  more: ['More', '⋯', [['Remove formatting','removeFormat'],['Unlink','unlink'],['Indent','indent'],['Outdent','outdent'],['Code block','formatBlock','<pre>']]],
  text: ['Text options', 'A', null],
  script: ['Superscript / Subscript', 'x²⌄', [['Superscript','superscript'],['Subscript','subscript']]],
  alignment: ['Text alignment', '≡⌄', [['Align left','justifyLeft'],['Align center','justifyCenter'],['Align right','justifyRight'],['Justify','justifyFull']]],
  indentation: ['Indentation', '⇥⌄', [['Indent','indent'],['Outdent','outdent']]],
  formatting: ['Formatting', 'T̸⌄', [['Remove formatting','removeFormat'],['Unlink','unlink']]],
  font: ['Font and colors', 'A⌄', null]
};
export const formattingActions = Object.fromEntries(Object.entries(groups).map(([name,[title,icon]]) =>
  [name,{name,title,icon,result:() => false}]
));
for (const [name,title,icon] of [['undo','Undo','↶'],['redo','Redo','↷']]) {
  formattingActions[name] = {name,title,icon,result:() => false};
}
for (const [name,path] of Object.entries({blocks:'M16 4H10a5 5 0 0 0 0 10h2M12 4v16M16 4v16', lists:'M4 6h1M4 12h1M4 18h1M10 6h10M10 12h10M10 18h10', alignment:alignmentIcons.justifyLeft, insert:'M12 4v16M4 12h16', more:'M4 12h1M11 12h1M18 12h1'})) formattingActions[name].icon = icon(path);
let counter = 0;

export function createFormattingControls({element,content,listen,exec,canEdit,applySettings,onInteraction}) {
  const doc = content.ownerDocument, win = doc.defaultView;
  const bindings = [];
  let popupCleanups = [];
  const listenPopup = (target,type,handler) => {
    target.addEventListener(type,handler);
    popupCleanups.push(() => target.removeEventListener(type,handler));
  };
  const disposePopup = () => {
    popupCleanups.forEach(cleanup => cleanup()); popupCleanups = [];
    popup?.remove();
  };
  let popup = null, trigger = null, saved = null, composing = false;
  // Range objects are live: even a same-text DOM replacement invalidates a picker.
  const observer = new win.MutationObserver(() => { if (popup && !popup.hidden) close(); });
  observer.observe(content,{subtree:true,childList:true,characterData:true,attributes:true});
  const selectionRange = () => {
    const selection = doc.getSelection();
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
    return range && content.contains(range.commonAncestorContainer) ? range : null;
  };
  const anchorButton = () => trigger?.closest('.lightmetal-overflow') ? element.querySelector('.lightmetal-overflow-trigger') : trigger;
  function close(focus = false) {
    if (popup) {
      if (popup.hasAttribute('popover') && popup.matches(':popover-open')) popup.hidePopover();
      popup.hidden = true;
    }
    trigger?.setAttribute('aria-expanded','false');
    saved = null;
    if (focus && trigger?.isConnected) anchorButton()?.focus();
  }
  function position() {
    if (!popup || popup.hidden) return;
    popup.style.maxWidth = `${Math.max(0,win.innerWidth-16)}px`;
    popup.style.maxHeight = `${Math.max(0,win.innerHeight-16)}px`;
    const anchor = anchorButton().getBoundingClientRect(), box = popup.getBoundingClientRect();
    popup.style.left = `${Math.max(8,Math.min(anchor.left,win.innerWidth-box.width-8))}px`;
    popup.style.top = `${Math.max(8,Math.min(anchor.bottom+4,win.innerHeight-box.height-8))}px`;
  }
  function run(command,value,range = saved) {
    if (!canEdit() || composing || observer.takeRecords().length || !range || !content.contains(range.commonAncestorContainer)) {
      close(); return false;
    }
    const restored = range.cloneRange();
    close();
    content.focus();
    const selection = doc.getSelection(); selection.removeAllRanges(); selection.addRange(restored);
    applySettings();
    const accepted = exec(command,value);
    refresh();
    return accepted;
  }
  function menuButton(label,command,value) {
    const button = doc.createElement('button'); button.type = 'button'; button.textContent = label;
    button.setAttribute('role','menuitem'); button.tabIndex = -1;
    if (alignmentIcons[command]) {
      const image = doc.createElement('span'); image.innerHTML = icon(alignmentIcons[command]); image.setAttribute('aria-hidden','true'); button.prepend(image);
    }
    if (command === 'formatBlock') {
      const level = /^<h([1-6])>$/.exec(value);
      if (level) { button.style.fontSize = `${21 - Number(level[1])}px`; button.style.fontWeight = '600'; }
    }
    if (command === 'formatBlock' || command.startsWith('justify') || ['superscript','subscript','insertUnorderedList','insertOrderedList'].includes(command)) {
      button.setAttribute('role',command === 'superscript' || command === 'subscript' ? 'menuitemcheckbox' : 'menuitemradio');
      const active = command === 'formatBlock' ? String(doc.queryCommandValue(command)).toLowerCase().replace(/[<>]/g,'') === value.slice(1,-1) : doc.queryCommandState(command);
      button.setAttribute('aria-checked',String(!!selectionRange() && !!active));
    }
    button.disabled = !doc.queryCommandSupported(command) || !!selectionRange() && !doc.queryCommandEnabled(command);
    listenPopup(button,'mousedown',event => event.preventDefault());
    listenPopup(button,'click',() => run(command,value));
    popup.append(button);
    if (popup.getAttribute('role') === 'dialog') {
      const checked = button.getAttribute('aria-checked');
      button.removeAttribute('role'); button.removeAttribute('aria-checked'); button.tabIndex = 0;
      if (checked !== null) button.setAttribute('aria-pressed',checked);
    }
    return button;
  }
  function fontFields() {
    const addSelect = (label,command,values) => {
      const wrapper = doc.createElement('label'); wrapper.textContent = label;
      const select = doc.createElement('select'); select.setAttribute('aria-label',label);
      for (const [text,value] of [['Choose…',''],...values]) {
        const option = doc.createElement('option'); option.textContent = text; option.value = value; select.append(option);
      }
      select.disabled = !doc.queryCommandSupported(command);
      listenPopup(select,'change',() => { if (select.value) run(command,select.value); });
      wrapper.append(select); popup.append(wrapper);
    };
    addSelect('Font family','fontName',['Arial','Verdana','Georgia','Times New Roman','Courier New','sans-serif','serif','monospace'].map(font => [font,font]));
    addSelect('Font size','fontSize',['Smallest','Smaller','Small','Medium','Large','Larger','Largest'].map((label,i) => [label,String(i+1)]));
    for (const [label,command,color] of [['Text color','foreColor','#24292f'],['Highlight color','hiliteColor','#ffff00']]) {
      const wrapper = doc.createElement('div'); wrapper.className = 'lightmetal-color-field';
      const input = doc.createElement('input'); input.type = 'color'; input.value = color; input.setAttribute('aria-label',label);
      const button = doc.createElement('button'); button.type = 'button'; button.textContent = `Apply ${label.toLowerCase()}`;
      button.disabled = input.disabled = !doc.queryCommandSupported(command);
      listenPopup(button,'click',() => run(command,input.value));
      wrapper.append(input,button); popup.append(wrapper);
    }
  }
  function open(name,button,last = false) {
    if (!canEdit() || composing) return;
    if (popup && !popup.hidden && trigger === button) { close(true); return; }
    let range = selectionRange();
    close(); observer.takeRecords();
    if (!range) {
      range = doc.createRange(); range.selectNodeContents(content); range.collapse(false);
    }
    onInteraction();
    saved = range.cloneRange(); trigger = button;
    disposePopup();
    popup = doc.createElement('div');
    popup.className = 'lightmetal-table-dropdown lightmetal-table-menu lightmetal-format-popup';
    popup.id = `lightmetal-format-${++counter}`;
    const fields = name === 'font' || name === 'text';
    popup.setAttribute('role',fields ? 'dialog' : 'menu');
    popup.setAttribute('aria-label',groups[name][0]);
    popup.tabIndex = -1;
    if (typeof popup.showPopover === 'function') popup.setAttribute('popover','manual');
    if (fields) {
      fontFields();
      if (name === 'text') for (const [label,command] of groups.script[2]) menuButton(label,command);
    }
    else if (name === 'insert') {
      menuButton('Horizontal rule','insertHorizontalRule');
      const label = doc.createElement('div'); label.className = 'lightmetal-menu-label'; label.textContent = 'Emoji'; popup.append(label);
      const grid = doc.createElement('div'); grid.className = 'lightmetal-emoji-grid';
      for (const [label,command,value] of groups.insert[2].slice(1)) {
        const choice = menuButton(label,command,value); choice.textContent = value; choice.setAttribute('aria-label',label); choice.title = label; grid.append(choice);
      }
      popup.append(grid);
    } else for (const [label,command,value] of groups[name][2]) menuButton(label,command,value);
    listenPopup(popup,'keydown',event => {
      if (event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true); }
      if (event.key === 'Tab' && !fields) close();
      if (!fields && ['ArrowDown','ArrowUp','Home','End'].includes(event.key)) {
        event.preventDefault();
        const choices = [...popup.querySelectorAll('button:not(:disabled)')], index = choices.indexOf(doc.activeElement);
        choices[event.key === 'Home' ? 0 : event.key === 'End' ? choices.length-1 : (index+(event.key === 'ArrowUp' ? -1 : 1)+choices.length)%choices.length]?.focus();
      }
    });
    element.append(popup); popup.hidden = false;
    if (popup.hasAttribute('popover')) popup.showPopover();
    button.setAttribute('aria-controls',popup.id); button.setAttribute('aria-expanded','true');
    position();
    const choices = [...popup.querySelectorAll('button:not(:disabled),select:not(:disabled),input:not(:disabled)')];
    (choices[last ? choices.length-1 : 0] || popup).focus();
  }
  function refresh() {
    for (const {name,button} of bindings) {
      const disabled = !canEdit() || composing || (['undo','redo'].includes(name) && !doc.queryCommandEnabled(name));
      if (button.disabled !== disabled) button.disabled = disabled;
    }
  }
  function bind(name,button) {
    bindings.push({name,button});
    if (groups[name]) {
      button.setAttribute('aria-haspopup',name === 'font' || name === 'text' ? 'dialog' : 'menu'); button.setAttribute('aria-expanded','false');
      listen(button,'mousedown',event => { event.preventDefault(); });
      listen(button,'click',() => open(name,button));
      listen(button,'keydown',event => {
        if (['ArrowDown','ArrowUp'].includes(event.key) && !event.altKey && !event.ctrlKey && !event.metaKey) {
          event.preventDefault(); open(name,button,event.key === 'ArrowUp');
        }
      });
    } else {
      listen(button,'mousedown',event => event.preventDefault());
      listen(button,'click',() => {
        if (!canEdit() || composing) return;
        onInteraction(); content.focus(); applySettings(); exec(name); refresh();
      });
    }
    refresh();
  }
  listen(content,'compositionstart',() => { composing = true; close(); refresh(); });
  listen(content,'compositionend',() => { composing = false; refresh(); });
  for (const type of ['input','keyup','mouseup','focus']) listen(content,type,refresh);
  listen(doc,'selectionchange',() => { refresh(); });
  listen(doc,'pointerdown',event => {
    if (popup && !popup.hidden && !popup.contains(event.target) && !trigger?.contains(event.target)) close();
  });
  listen(doc,'focusin',event => {
    if (popup && !popup.hidden && !popup.contains(event.target) && !trigger?.contains(event.target)) close();
  });
  listen(win,'resize',position); listen(win,'scroll',position,true);
  return {bind,close,refresh,destroy() {close();observer.disconnect();disposePopup();}};
}
