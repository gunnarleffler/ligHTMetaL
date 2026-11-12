import { createElement, forwardRef, useEffect, useLayoutEffect, useRef } from 'react';
import { init as initHTML } from 'lightmetal/dist/lightmetal.esm.js';
import { init as initMarkdown } from 'lightmetal/dist/maiden.esm.js';

const useCommittedEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

function configuration(initialValue, options, editorClassName) {
  if (typeof initialValue !== 'string') throw new TypeError('initialValue must be a string.');
  if (!options || typeof options !== 'object' || Array.isArray(options)) throw new TypeError('options must be an object.');
  if (Object.hasOwn(options, 'element') || Object.hasOwn(options, 'onChange')) throw new TypeError('Pass onChange as a component prop; the wrapper owns options.element.');
  if (typeof editorClassName !== 'string') throw new TypeError('editorClassName must be a string.');
  return { initialValue, options: { ...options }, editorClassName };
}

function attachRef(ref, editor) {
  if (typeof ref === 'function') {
    const cleanup = ref(editor);
    return typeof cleanup === 'function' ? cleanup : () => ref(null);
  }
  if (ref) {
    ref.current = editor;
    return () => { ref.current = null; };
  }
}

function component(name, init, setter) {
  const Editor = forwardRef(function Editor({ initialValue = '', options = {}, onChange,
    editorClassName = '', children, dangerouslySetInnerHTML, textContent, contentEditable, value, ...attributes }, ref) {
    if (children != null || dangerouslySetInnerHTML != null || textContent != null) throw new TypeError('Editor components do not accept children or HTML host contents.');
    if (contentEditable != null) throw new TypeError('The editor owns its editable surface.');
    if (value !== undefined) throw new TypeError('Use initialValue or the editor instance, not a controlled value prop.');
    const host = useRef(null), instance = useRef(null), change = useRef(null);
    const initial = useRef(null);
    if (!initial.current) initial.current = configuration(initialValue, options, editorClassName);
    useCommittedEffect(() => {
      if (onChange != null && typeof onChange !== 'function') throw new TypeError('onChange must be a function.');
      change.current = onChange;
    });
    useEffect(() => {
      const config = initial.current;
      host.current.className = 'lightmetal ' + config.editorClassName;
      let active = false, editor;
      try {
        editor = init({ ...config.options, element: host.current, onChange: value => {
          if (active) change.current?.(value);
        } });
        editor[setter](config.initialValue);
      } catch (error) {
        editor?.destroy();
        throw error;
      }
      instance.current = editor;
      active = true;
      return () => {
        active = false;
        instance.current = null;
        editor.destroy();
      };
    }, []);
    // Changing a callback ref must not remount the editor or reset its history.
    useEffect(() => attachRef(ref, instance.current), [ref]);
    // React owns the outer attributes, not the editor's classes or descendants.
    return createElement('div', attributes, createElement('div', { ref: host }));
  });
  Editor.displayName = name;
  return Editor;
}

export const LightmetalEditor = component('LightmetalEditor', initHTML, 'setHTML');
export const MaidenEditor = component('MaidenEditor', initMarkdown, 'setMarkdown');
