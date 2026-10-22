// Accessible tabs. Hidden editors keep their source and native history intact.
const tabs = [...document.querySelectorAll('[role="tab"]')];
function activate(index, focus = false) {
  tabs.forEach((tab, i) => {
    tab.setAttribute('aria-selected', String(i === index));
    tab.tabIndex = i === index ? 0 : -1;
    document.getElementById(tab.getAttribute('aria-controls')).hidden = i !== index;
  });
  if (focus) tabs[index].focus();
}
tabs.forEach((tab, index) => {
  tab.addEventListener('click', () => activate(index));
  tab.addEventListener('keydown', event => {
    let next;
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
    if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = tabs.length - 1;
    if (next !== undefined) { event.preventDefault(); activate(next, true); }
  });
});

const htmlHost = document.getElementById('html-editor');
if (htmlHost) {
  const output = document.getElementById('html-output');
  const editor = lightmetal.init({ element: htmlHost, onChange: html => { output.textContent = html; } });
  editor.setHTML('<h2>A place for your ideas</h2><p>Write, revise, and keep your content your own. <strong>No cloud required.</strong></p>');
}
const markdownHost = document.getElementById('made-editor');
if (markdownHost) {
  const output = document.getElementById('markdown-output');
  const editor = maiden.init({ element: markdownHost, preview: { render: meltDown.parse },
    onChange: text => { output.textContent = text; } });
  editor.setMarkdown('# Keep the source.\n\nMake **your words** count. Try Preview or Side-by-side.\n\n- Local-first\n- Native undo\n- Your content');
}
const themeButton = document.getElementById('theme-toggle');
if (themeButton) {
  const themes = ['auto', 'dark', 'light'];
  let themeIndex = 0;
  themeButton.addEventListener('click', () => {
    const theme = themes[themeIndex = (themeIndex + 1) % themes.length];
    document.documentElement.classList.toggle('page-dark', theme === 'dark');
    document.documentElement.classList.toggle('page-light', theme === 'light');
    document.querySelectorAll('.lightmetal').forEach(host => {
      host.classList.toggle('lightmetal-dark', theme === 'dark');
      host.classList.toggle('lightmetal-light', theme === 'light');
    });
    themeButton.textContent = 'Theme: ' + theme;
  });
}
const input = document.getElementById('parser-input');
if (input) {
  const output = document.getElementById('parser-output');
  const frame = document.getElementById('parser-preview');
  function render() {
    const html = meltDown.parse(input.value);
    output.textContent = html;
    // Strip navigation targets in an inert template before the sandbox renders it.
    const template = document.createElement('template');
    template.innerHTML = html;
    template.content.querySelectorAll('a').forEach(link => link.removeAttribute('href'));
    // The opaque sandbox and CSP block scripts and external resources.
    frame.srcdoc = '<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; form-action \'none\'; base-uri \'none\'"><style>body{font:16px/1.6 system-ui,sans-serif;overflow-wrap:anywhere}pre{white-space:pre-wrap}img{display:none}</style>' + template.innerHTML;
  }
  input.addEventListener('input', render);
  render();
}
