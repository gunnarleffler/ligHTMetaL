import { createApp, defineComponent, h, Text, ref, onMounted, watch } from 'vue';
import { LightmetalEditor, MaidenEditor } from 'lightmetal/adapters/vue/index.js';
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

// Keep live output nodes, rather than replacing their children on each edit.
const Output = defineComponent({
  props: ['value', 'language'],
  setup(props) {
    const element = ref(null);
    const write = () => exampleCode.write(element.value, props.value, props.language);
    onMounted(write);
    watch(() => props.value, write, { flush: 'post' });
    return () => h('pre', { ref: element, class: 'output', tabindex: 0, 'aria-label': props.language + ' output' });
  }
});
createApp({
  setup() {
    const html = ref(null), markdown = ref(null);
    onMounted(() => markdownDemo.startSplit(markdown.value.editor));
    const htmlValue = ref(initialHTML), markdownValue = ref(initialMarkdown), updates = ref(0), mode = ref('auto');
    const changed = target => value => { target.value = value; updates.value++; };
    return () => h('section', { 'data-lightmetal-theme': mode.value }, [
      h('div', { class: 'actions' }, [
        h('label', null, ['Color mode ', h('select', { 'aria-label': 'Color mode', value: mode.value, onChange: event => { mode.value = event.target.value; } },
          ['auto', 'light', 'dark'].map(value => h('option', { value }, value)))]),
        h('button', { type: 'button', onClick: () => updates.value++ }, 'Rerender parent'),
        h('button', { type: 'button', onClick: () => { htmlValue.value = html.value.editor.getHTML(); markdownValue.value = markdown.value.editor.getMarkdown(); } }, 'Read instances')
      ]),
      // Explicit text VNodes update Text.data instead of replacing this child.
      h('p', { id: 'parent-updates' }, [h(Text, 'Parent updates: ' + updates.value)]),
      h('h2', null, 'HTML editor'),
      h(LightmetalEditor, { ref: html, id: 'html-wrapper', initialValue: initialHTML, editorClassName: 'lightmetal-frost', onChange: changed(htmlValue) }),
      h(Output, { value: htmlValue.value, language: 'html' }),
      h('h2', null, 'Markdown editor'),
      h(MaidenEditor, { ref: markdown, id: 'markdown-wrapper', initialValue: initialMarkdown, editorClassName: 'lightmetal-frost', options, onChange: changed(markdownValue) }),
      h(Output, { value: markdownValue.value, language: 'markdown' })
    ]);
  }
}).mount('#app');
document.getElementById('build-status').textContent = 'Running a local Vue build. Changes update the parent without writing values back into the editors.';
