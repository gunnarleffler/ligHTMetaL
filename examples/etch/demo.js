import { createEtch } from '../../dist/etch.esm.js';

const editor = createEtch(document.querySelector('#editor'),{sidebarOpen:true});
const json = document.querySelector('#native');
const status = document.querySelector('#save-status');
const error = document.querySelector('#error');
const reopen = document.querySelector('#reopen');
let stored = null;
let writes = Promise.resolve();
json.value = JSON.stringify(editor.save(), null, 2);

// Theme belongs to the host presentation, not the saved attachment or editor API.
document.querySelector('#appearance').addEventListener('change', event => {
  document.documentElement.dataset.lightmetalTheme = event.target.value;
});

editor.on('change', () => { status.textContent = 'Unsaved changes'; });
editor.on('load', () => { status.textContent = 'Loaded baseline (not a user edit)'; });
editor.on('error', event => { error.textContent = `${event.code}: ${event.message}`; });

// The host owns storage and serializes writes. In a real app, replace this with
// an attachment write, keeping both the ordering and revision comparison.
document.querySelector('#save').addEventListener('click', () => {
  const revision = editor.getRevision();
  const snapshot = editor.save();
  json.value = JSON.stringify(snapshot, null, 2);
  writes = writes.then(async () => {
    await Promise.resolve(); // stand-in for asynchronous host storage
    stored = snapshot;
    reopen.disabled = false;
    status.textContent = editor.getRevision() === revision ? 'Saved current revision (in memory)' : 'Older revision saved; newer changes remain unsaved';
  }).catch(report);
});
document.querySelector('#sample').addEventListener('click', async () => {
  try {
    const response = await fetch('./fixtures/sample.etch.json');
    if (!response.ok) throw new Error('Could not load the local sample');
    await editor.load(await response.text());
    editor.fit(); // Host-chosen initial framing, never an automatic load side effect.
    json.value = JSON.stringify(editor.save(),null,2);
  } catch (error) { report(error); }
});
for (const [id,name] of [['sample-coloring','coloring.webp'],['sample-note','note.jpeg']]) {
  document.querySelector(`#${id}`).addEventListener('click',async () => {
    const buttons = [...document.querySelectorAll('#sample, #sample-coloring, #sample-note')];
    buttons.forEach(button => {button.disabled = true;});error.textContent = '';
    try {
      const response = await fetch(`./${name}`);
      if (!response.ok) throw new Error(`Could not load local demo image: ${name}`);
      const blob = await response.blob();
      const file = new File([blob],name,{type:blob.type});
      try {await editor.importImage(file);}
      catch(reason) {
        if (reason.code !== 'INVALID_ARGUMENT' || reason.details?.encoder !== 'webp' || reason.details.supported !== false) throw reason;
        await editor.importImage(file,{format:'png'});
      }
      editor.fit();json.value = JSON.stringify(editor.save(),null,2);
    } catch(reason) {report(reason);}
    finally {buttons.forEach(button => {button.disabled = false;});}
  });
}
reopen.addEventListener('click', () => editor.load(stored).catch(report));
document.querySelector('#load').addEventListener('click', () => editor.load(json.value).catch(report));
document.querySelector('#download').addEventListener('click', () => {
  download(new Blob([JSON.stringify(editor.save(), null, 2)], {type:'application/vnd.lightmetal.etch+json'}),'drawing.etch.json');
});
document.querySelector('#export-png').addEventListener('click',async event => {
  const button = event.currentTarget;button.disabled = true;error.textContent = '';
  try {
    let result;
    try {result = await editor.exportPNG();}
    catch(reason) {
      const scale = reason.details?.suggestedScale;
      if (reason.code !== 'EXPORT_TOO_LARGE' || !(scale > 0)) throw reason;
      if (!window.confirm(`This drawing is too large to export at 100%. Download PNG at ${(scale*100).toPrecision(3)}% instead? The editable drawing stays unchanged.`)) return;
      result = await editor.exportPNG({scale});
    }
    download(result.blob,'drawing.png');
  } catch(reason) {report(reason);}
  finally {button.disabled = false;}
});
document.querySelector('#export-svg').addEventListener('click',event => {
  const button = event.currentTarget;button.disabled = true;error.textContent = '';
  try {
    const {svg} = editor.exportSVG();
    download(new Blob([svg],{type:'image/svg+xml;charset=utf-8'}),'drawing.svg');
  } catch(reason) {report(reason);}
  finally {button.disabled = false;}
});
function download(blob,name) {
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');a.href = url;a.download = name;a.click();
  } finally {setTimeout(() => URL.revokeObjectURL(url),0);}
}
function report(reason) { error.textContent = `${reason.code ?? 'ERROR'}: ${reason.message}`; }
window.addEventListener('pagehide', () => editor.destroy(), { once: true });
