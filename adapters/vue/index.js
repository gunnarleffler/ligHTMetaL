import { defineComponent, h, onBeforeUnmount, onMounted, shallowRef } from 'vue';
import { init as initHTML } from 'lightmetal/dist/lightmetal.esm.js';
import { init as initMarkdown } from 'lightmetal/dist/maiden.esm.js';

function configuration(props) {
  const { initialValue, options, editorClassName } = props;
  if (typeof initialValue !== 'string') throw new TypeError('initialValue must be a string.');
  if (!options || typeof options !== 'object' || Array.isArray(options)) throw new TypeError('options must be an object.');
  if (Object.hasOwn(options, 'element') || Object.hasOwn(options, 'onChange')) throw new TypeError('Listen for change on the component; the wrapper owns options.element.');
  if (typeof editorClassName !== 'string') throw new TypeError('editorClassName must be a string.');
  return { initialValue, options: { ...options }, editorClassName };
}

function component(name, init, setter) {
  return defineComponent({
    name,
    inheritAttrs: false,
    props: {
      initialValue: { type: String, default: '' },
      options: { type: Object, default: () => ({}) },
      editorClassName: { type: String, default: '' }
    },
    emits: ['change'],
    setup(props, { attrs, slots, emit, expose }) {
      const config = configuration(props), host = shallowRef(null), editor = shallowRef(null);
      let active = false;
      expose({ editor });
      onMounted(() => {
        host.value.className = 'lightmetal ' + config.editorClassName;
        let instance;
        try {
          instance = init({ ...config.options, element: host.value, onChange: value => {
            if (active) emit('change', value);
          } });
          instance[setter](config.initialValue);
        } catch (error) {
          instance?.destroy();
          throw error;
        }
        editor.value = instance;
        active = true;
      });
      onBeforeUnmount(() => {
        active = false;
        editor.value?.destroy();
        editor.value = null;
      });
      return () => {
        if (slots.default || attrs.innerHTML != null || attrs.textContent != null) throw new TypeError('Editor components do not accept slots or HTML host contents.');
        if (attrs.value !== undefined || attrs.modelValue !== undefined || attrs['onUpdate:modelValue'] !== undefined) throw new TypeError('Use initialValue or the editor instance, not v-model or a controlled value.');
        if (attrs.contenteditable != null || attrs.contentEditable != null) throw new TypeError('The editor owns its editable surface.');
        // Vue owns the outer attributes, not the editor's classes or descendants.
        return h('div', { ...attrs }, [h('div', { ref: host })]);
      };
    }
  });
}

export const LightmetalEditor = component('LightmetalEditor', initHTML, 'setHTML');
export const MaidenEditor = component('MaidenEditor', initMarkdown, 'setMarkdown');
