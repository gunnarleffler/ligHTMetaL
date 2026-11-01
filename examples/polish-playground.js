(() => {
  const input = document.getElementById('polish-input');
  if (!input) return;
  const language = document.getElementById('polish-language');
  const theme = document.getElementById('polish-theme');
  const output = document.getElementById('polish-output');
  const highlighter = polish.createHighlighter({ languages: polish.allLanguages });
  const art = document.getElementById('polish-ansi-art');
  if (art) {
    const reload = document.getElementById('polish-ansi-reload');
    const fileInput = document.getElementById('polish-ansi-file');
    // Keep this Text node: replacing it during AJAX completion splits Chromium typing undo.
    const statusText = document.getElementById('polish-ansi-status').firstChild;
    const localPage = location.protocol === 'file:';
    let generation = 0;
    async function loadArt(file) {
      const current = ++generation;
      reload.disabled = true;
      art.setAttribute('aria-busy', 'true');
      statusText.data = 'Loading ANSI art…';
      try {
        let source;
        if (file) source = await file.text();
        else {
          const response = await fetch(document.getElementById('polish-ansi-source').href, { cache: 'no-store' });
          if (!response.ok) throw new Error('HTTP ' + response.status);
          source = await response.text();
        }
        if (current !== generation) return;
        // Cursor visibility belongs to a terminal, not a static pre/code block.
        source = source.replace(/\u001b\[\?25[lh]/g, '');
        exampleCode.paint(art, highlighter.highlight(source, 'ansi'), { followTheme: false });
        art.hidden = false;
        statusText.data = 'Loaded ' + (file ? file.name : 'POLISH.ANS') + '.';
      } catch (error) {
        if (current === generation) statusText.data = 'Could not load ANSI art (' + error.message + '). Try again or open a local file.';
      } finally {
        if (current === generation) {
          art.setAttribute('aria-busy', 'false');
          reload.disabled = localPage;
        }
      }
    }
    reload.addEventListener('click', () => loadArt());
    fileInput.addEventListener('change', () => {
      const file = fileInput.files[0];
      fileInput.value = '';
      if (file) loadArt(file);
    });
    if (localPage) {
      reload.disabled = true;
      statusText.data = 'Open an ANSI file above, or use the local demo server to load POLISH.ANS automatically.';
    } else loadArt();
  }
  for (const name of ['auto', 'plain', 'ansi', ...polish.allLanguages.map(item => item.id).sort()]) {
    language.add(new Option(name === 'auto' ? 'Guess language' : name, name === 'auto' ? '' : name));
  }
  language.value = 'javascript';
  for (const item of polish.allThemes) theme.add(new Option(item.name, item.name));
  theme.value = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  function render() {
    // The highlighter escapes source and emits only its own token markup.
    const html = highlighter.highlight(input.value, language.value);
    exampleCode.paint(output, html, { followTheme: false });
    const raw = document.getElementById('polish-html');
    if (raw) exampleCode.write(raw, html, 'html');
  }
  input.addEventListener('input', render);
  language.addEventListener('change', render);
  theme.addEventListener('change', () => { output.className = 'code theme-' + theme.value; });
  output.className = 'code theme-' + theme.value;
  render();
})();
