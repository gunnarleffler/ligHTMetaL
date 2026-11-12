import React, { createRef } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { createApp, createSSRApp, h, ref, isProxy, nextTick } from 'vue';
import { LightmetalEditor as ReactHTML, MaidenEditor as ReactMarkdown } from 'lightmetal/adapters/react/index.js';
import { LightmetalEditor as VueHTML, MaidenEditor as VueMarkdown } from 'lightmetal/adapters/vue/index.js';
import { parse } from 'lightmetal/dist/MeltDown.esm.js';
import { createHighlighter } from 'lightmetal/src/polish.js';
import javascript from 'lightmetal/src/polish/languages/javascript.js';
import 'lightmetal/dist/lightmetal.css';
import 'lightmetal/dist/skins/frost.css';
import 'lightmetal/dist/maiden.css';
import 'lightmetal/dist/polish.css';

export function stateFor(framework, settings = {}) {
  const highlighter = createHighlighter({ languages: [javascript] });
  const state = {
    framework, settings, version: 0, renders: 0, events: [], refs: {}, instances: [], cleanupRefs: 0,
    initial: { html: '<p>HTML </p>', markdown: 'Markdown ' }, pending: [], deferPreview: false,
    options: {
      html: { contentHeight: 180, actions: ['bold', 'undo', 'redo', 'fullscreen', 'source'] },
      markdown: { actions: ['bold', 'task-toggle', 'preview', 'side-by-side', 'fullscreen', 'undo', 'redo'], sourceHighlight: highlighter.highlightTokens,
        preview: { render: source => state.deferPreview ? new Promise(resolve => state.pending.push(resolve)) : parse(source, { highlight: highlighter.highlight }) } }
    },
    remember(editor) {
      if (!editor || state.instances.some(item => item.editor === editor)) return;
      const item = { editor, destroys: 0 }, destroy = editor.destroy;
      editor.destroy = () => { item.destroys++; destroy(); };
      state.instances.push(item);
    },
    api(kind) {
      const value = state.refs[kind];
      return framework === 'react' ? value?.current ?? null : value?.value?.editor ?? null;
    },
    capture() { for (const kind of ['html', 'markdown']) state.remember(state.api(kind)); },
    stats() { return { count: state.instances.length, destroys: state.instances.map(item => item.destroys),
      detached: state.instances.map(item => !item.editor.element.isConnected),
      empty: state.instances.map(item => item.editor.element.childNodes.length === 0),
      proxy: ['html', 'markdown'].some(kind => isProxy(state.api(kind))) }; }
  };
  state.refs = framework === 'react' ? { html: createRef(), markdown: createRef() } : { html: ref(null), markdown: ref(null) };
  return state;
}

function properties(state, kind) {
  const version = state.version;
  return {
    initialValue: state.version ? 'Ignored replacement' : state.initial[kind],
    options: state.version ? { actions: [] } : state.options[kind],
    editorClassName: state.version ? 'lightmetal-substantial' : 'lightmetal-frost',
    onChange: value => { state.events.push({ kind, version, value }); state.onParentChange?.(); },
    id: kind + '-wrapper', 'data-renders': String(state.renders), 'data-version': String(version), 'data-lightmetal-theme': version ? 'dark' : 'light',
    style: { '--lightmarkdown-height': '180px', marginBottom: '12px', maxWidth: '700px' }
  };
}

export function reactTree(state) {
  const editor = (Component, kind) => {
    const propertiesForEditor = properties(state, kind);
    let editorRef = state.refs[kind];
    if (!state.settings.objectRefs) editorRef = api => {
      state.refs[kind].current = api;
      state.remember(api);
      if (api && state.settings.cleanupRefs) return () => { state.cleanupRefs++; state.refs[kind].current = null; };
    };
    return React.createElement(Component, { ...propertiesForEditor, key: kind, ref: editorRef,
      className: state.version ? 'outer updated' : 'outer initial' });
  };
  const tree = React.createElement('section', null, editor(ReactHTML, 'html'), editor(ReactMarkdown, 'markdown'));
  return state.settings.strict ? React.createElement(React.StrictMode, null, tree) : tree;
}

export function vueApp(state, hydrate = false) {
  const revision = ref(0);
  const app = (hydrate ? createSSRApp : createApp)({
    setup() {
      return () => {
        revision.value;
        return h('section', null, [
          h(VueHTML, { ...properties(state, 'html'), ref: state.refs.html, class: state.version ? 'outer updated' : 'outer initial' }),
          h(VueMarkdown, { ...properties(state, 'markdown'), ref: state.refs.markdown, class: state.version ? 'outer updated' : 'outer initial' })
        ]);
      };
    }
  });
  state.onParentChange = () => { state.renders++; revision.value++; };
  state.update = async () => { state.version++; revision.value++; await nextTick(); state.capture(); };
  state.unmount = () => app.unmount();
  return app;
}

if (typeof window !== 'undefined') {
  window.mountAdapters = (framework, settings = {}) => {
    const state = stateFor(framework, settings);
    window.adapterState = state;
    const element = document.getElementById('app');
    if (framework === 'react') {
      const root = settings.hydrate ? hydrateRoot(element, reactTree(state)) : createRoot(element);
      if (!settings.hydrate) root.render(reactTree(state));
      state.onParentChange = () => { state.renders++; root.render(reactTree(state)); };
      state.update = () => { state.version++; root.render(reactTree(state)); };
      state.unmount = () => root.unmount();
    } else vueApp(state, settings.hydrate).mount(element);
  };
}
