import React, { createElement as h, useRef, useState, useLayoutEffect, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { LightmetalEditor, MaidenEditor } from 'lightmetal/adapters/react/index.js';
import { parse } from 'lightmetal/dist/MeltDown.esm.js';
import '../markdown-demo.js';
import 'lightmetal/dist/lightmetal.css';
import 'lightmetal/dist/skins/frost.css';
import 'lightmetal/dist/maiden.css';
import 'lightmetal/dist/polish.css';

const initialHTML = '<h2>Your words. Your metal.</h2><p>A place for <strong>bold ideas</strong> and words you own.</p>';
const initialMarkdown = markdownSamples.compact;
const highlighter = polish.createHighlighter({ languages: polish.allLanguages });
const options = { sourceHighlight: highlighter.highlightTokens,
  preview: { render: source => parse(source, { highlight: highlighter.highlight }) } };

// The framework owns the pre, but the existing demo painter retains its text
// nodes. Replacing unrelated nodes during input can split native typing Undo.
function Output({ value, language }) {
  const element = useRef(null);
  useLayoutEffect(() => exampleCode.write(element.current, value, language), [value, language]);
  return h('pre', { ref: element, className: 'output', tabIndex: 0, 'aria-label': language + ' output' });
}
function App() {
  const html = useRef(null), markdown = useRef(null);
  useEffect(() => markdownDemo.startSplit(markdown.current), []);
  const [htmlValue, setHTML] = useState(initialHTML), [markdownValue, setMarkdown] = useState(initialMarkdown);
  const [updates, setUpdates] = useState(0), [mode, setMode] = useState('auto');
  const changed = setter => value => { setter(value); setUpdates(count => count + 1); };
  return h('section', { 'data-lightmetal-theme': mode },
    h('div', { className: 'actions' },
      h('label', null, 'Color mode ', h('select', { 'aria-label': 'Color mode', value: mode, onChange: event => setMode(event.target.value) },
        ...['auto', 'light', 'dark'].map(value => h('option', { key: value, value }, value)))),
      h('button', { type: 'button', onClick: () => setUpdates(count => count + 1) }, 'Rerender parent'),
      h('button', { type: 'button', onClick: () => { setHTML(html.current.getHTML()); setMarkdown(markdown.current.getMarkdown()); } }, 'Read instances')),
    h('p', { id: 'parent-updates' }, 'Parent updates: ' + updates),
    h('h2', null, 'HTML editor'),
    h(LightmetalEditor, { ref: html, id: 'html-wrapper', initialValue: initialHTML, editorClassName: 'lightmetal-frost', onChange: changed(setHTML) }),
    h(Output, { value: htmlValue, language: 'html' }),
    h('h2', null, 'Markdown editor'),
    h(MaidenEditor, { ref: markdown, id: 'markdown-wrapper', initialValue: initialMarkdown, editorClassName: 'lightmetal-frost', options, onChange: changed(setMarkdown) }),
    h(Output, { value: markdownValue, language: 'markdown' }));
}
createRoot(document.getElementById('app')).render(h(React.StrictMode, null, h(App)));
document.getElementById('build-status').textContent = 'Running a local React build. Changes update the parent without writing values back into the editors.';
