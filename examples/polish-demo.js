/* Application-owned rendering chain. None of the libraries imports another. */
window.polishDemo = (() => {
  const highlighter = polish.createHighlighter({ languages: polish.allLanguages });
  const render = markdown => meltDown.parse(markdown, { highlight: highlighter.highlight });
  function preview(frame, html, { baseURL = document.baseURI, imageURL = null, headingLinks = false } = {}) {
    // Strip navigation/resource targets before the opaque sandbox renders the document.
    const template = document.createElement('template');
    template.innerHTML = html;
    template.content.querySelectorAll('script,style,link,meta,base,iframe,object,embed,form,template,svg,math,audio,video,source,input').forEach(node => node.remove());
    for (const node of template.content.querySelectorAll('*')) {
      for (const attribute of [...node.attributes]) if (/^on/i.test(attribute.name)) node.removeAttribute(attribute.name);
    }
    const headingIds = new Set([...template.content.querySelectorAll('h1[id],h2[id],h3[id],h4[id],h5[id],h6[id]')].map(heading => heading.id));
    template.content.querySelectorAll('a').forEach(link => {
      const href = link.getAttribute('href') || '';
      link.removeAttribute('href');
      link.removeAttribute('target');
      if (headingLinks && href.startsWith('#') && headingIds.has(href.slice(1))) {
        link.setAttribute('href', 'about:srcdoc' + href);
      }
    });
    template.content.querySelectorAll('img').forEach(image => {
      let allowed = false;
      try { allowed = !!imageURL && [imageURL, 'https://cdn.jsdelivr.net/npm/lightmetal@latest/ligHTMetaL.png'].includes(new URL(image.getAttribute('src'), baseURL).href); } catch {}
      image.removeAttribute('srcset'); image.removeAttribute('data-preview-logo');
      if (allowed) { image.src = imageURL; image.setAttribute('data-preview-logo', ''); }
      else image.removeAttribute('src');
    });
    const root = document.documentElement;
    const dark = root.classList.contains('page-dark') ||
      (!root.classList.contains('page-light') && matchMedia('(prefers-color-scheme: dark)').matches);
    const palette = polish.allThemes.find(item => item.name === (dark ? 'dark' : 'light'));
    frame.style.background = palette.background;
    // README permits only its app-selected logo; other previews block all resources.
    const csp = document.createElement('meta');
    csp.httpEquiv = 'Content-Security-Policy';
    csp.content = "default-src 'none'; style-src 'unsafe-inline'; img-src " + (imageURL || "'none'") + "; form-action 'none'; base-uri 'none'";
    frame.srcdoc = '<!doctype html><meta charset="utf-8">' + csp.outerHTML + '<style>:root{color-scheme:' + palette.name + ';background:' + palette.background + ';color:' + palette.foreground + '}body{font:16px/1.6 system-ui,sans-serif;overflow-wrap:anywhere;margin:20px}pre{white-space:pre-wrap;padding:12px;border:1px solid;border-radius:6px}code{font-family:ui-monospace,monospace}table{display:block;overflow:auto;border-collapse:collapse}th,td{padding:6px 10px;border:1px solid}img{display:none}img[data-preview-logo]{display:inline-block;max-width:100%;height:auto}' + polish.themeToCSS(palette) + '</style><div class="polish theme-' + palette.name + '">' + template.innerHTML + '</div>';
  }
  return { highlighter, render, preview };
})();
