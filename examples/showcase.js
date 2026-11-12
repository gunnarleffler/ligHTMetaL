// Accessible tabs. Hidden editors keep their source and native history intact.
const tabs = [...document.querySelectorAll('[role="tab"]')];
let loadReadme, loadEtch;
function activate(index, focus = false) {
  tabs.forEach((tab, i) => {
    tab.setAttribute('aria-selected', String(i === index));
    tab.tabIndex = i === index ? 0 : -1;
    document.getElementById(tab.getAttribute('aria-controls')).hidden = i !== index;
  });
  if (focus) tabs[index].focus();
  if (tabs[index].id === 'tab-readme') loadReadme?.();
  if (tabs[index].id === 'tab-etch') loadEtch?.();
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

const sketchHost = document.getElementById('sketch-editor');
if (sketchHost) {
  let editor;
  // Mount once, at its visible size. Tab changes retain artwork and drawing history.
  loadEtch = () => {
    if (!editor) editor = etch.createEtch(sketchHost);
  };
}

const htmlHost = document.getElementById('html-editor');
if (htmlHost) {
  const output = document.getElementById('html-output');
  const editor = lightmetal.init({ element: htmlHost, onChange: html => { exampleCode.write(output, html, 'html'); } });
  editor.setHTML('<h2>A place for your ideas</h2><p>Write, revise, and keep your content your own. <strong>No cloud required.</strong></p>');
}
const markdownHost = document.getElementById('made-editor');
if (markdownHost) {
  const output = document.getElementById('markdown-output');
  const editor = maiden.init({ element: markdownHost, sourceHighlight: polishDemo.highlighter.highlightTokens, preview: { render: polishDemo.render },
    onChange: text => { exampleCode.write(output, text, 'markdown'); } });
  editor.setMarkdown(markdownSamples.full);
  markdownDemo.startSplit(editor);
}
let renderParserPreview, renderReadmePreview;
const themeButton = document.getElementById('theme-toggle');
if (themeButton) {
  const themes = ['auto', 'dark', 'light'];
  let themeIndex = 0;
  themeButton.addEventListener('click', () => {
    const theme = themes[themeIndex = (themeIndex + 1) % themes.length];
    document.documentElement.classList.toggle('page-dark', theme === 'dark');
    document.documentElement.classList.toggle('page-light', theme === 'light');
    document.documentElement.dataset.lightmetalTheme = theme;
    renderParserPreview?.();
    renderReadmePreview?.();
    themeButton.textContent = 'Theme: ' + theme;
  });
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  renderParserPreview?.();
  renderReadmePreview?.();
});
const input = document.getElementById('parser-input');
if (input) {
  const output = document.getElementById('parser-output');
  const frame = document.getElementById('parser-preview');
  function render() {
    const html = polishDemo.render(input.value);
    exampleCode.write(output, html, 'html');
    polishDemo.preview(frame, html);
  }
  renderParserPreview = render;
  input.addEventListener('input', render);
  render();
}

const readmeFrame = document.getElementById('readme-preview');
if (readmeFrame) {
  const reload = document.getElementById('readme-reload');
  const statusText = document.getElementById('readme-status').firstChild;
  const localPage = location.protocol === 'file:';
  let source = null, loading = false;
  function renderReadme(text) {
    // Only this repository-owned document opts into raw HTML, not editor previews.
    const html = meltDown.parse(text, { html: 'allow', highlight: polishDemo.highlighter.highlight });
    polishDemo.preview(readmeFrame, html, {
      baseURL: document.getElementById('readme-source').href,
      imageURL: document.querySelector('img.logo').src,
      headingLinks: true
    });
  }
  renderReadmePreview = () => {
    if (source !== null) renderReadme(source);
  };
  loadReadme = async (force = false) => {
    if (loading || (!force && source !== null)) return;
    if (localPage) {
      reload.disabled = true;
      statusText.data = 'Use the local demo server to load README.md; browsers block AJAX between local files.';
      return;
    }
    loading = true;
    reload.disabled = true;
    readmeFrame.setAttribute('aria-busy', 'true');
    statusText.data = 'Loading README…';
    try {
      const response = await fetch(document.getElementById('readme-source').href, { cache: 'no-store' });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const text = await response.text();
      renderReadme(text);
      source = text;
      readmeFrame.hidden = false;
      statusText.data = 'Loaded README.md.';
    } catch (error) {
      statusText.data = 'Could not load README (' + error.message + '). Try Reload README.';
    } finally {
      loading = false;
      reload.disabled = false;
      readmeFrame.setAttribute('aria-busy', 'false');
    }
  };
  reload.addEventListener('click', () => loadReadme(true));
}
