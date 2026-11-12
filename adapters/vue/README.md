# ligHTMetaL Vue adapter

Included as optional ESM files in **lightmetal 0.7.0**, not a separate package.
See [the framework guide](../../docs/frameworks.md) for installation.

Two components wrap the existing text editors without replacing native editing
or Undo. Install Vue 3.5 in your app; React is not required.

```vue
<script setup>
import { ref } from 'vue';
import { LightmetalEditor, MaidenEditor } from 'lightmetal/adapters/vue/index.js';
import 'lightmetal/dist/lightmetal.css';
import 'lightmetal/dist/maiden.css';

const markdown = ref(null);
function readMarkdown() {
  console.log(markdown.value.editor.getMarkdown());
}
</script>

<template>
  <section>
    <LightmetalEditor initial-value="<p>Hello, HTML.</p>" />
    <MaidenEditor
      ref="markdown"
      initial-value="# Hello, MaiDEn."
      @change="value => console.log(value)"
    />
    <button @click="readMarkdown">Read Markdown</button>
  </section>
</template>
```

- `initialValue` is an initial HTML/Markdown string. It defaults to empty.
- `options` forwards native initialization settings, except `element`/`onChange`.
- `editorClassName` supplies initial classes on the inner editor host.
- The `change` event supplies current HTML/Markdown. Initialization is silent.
- A component ref exposes `editor`, the native instance, after mount. Cleanup
  destroys it and clears `editor`. The instance is not deeply reactive.

The three initialization props are mount-only. Parent rerenders do not recreate
the editor. Use native setters for deliberate document replacement, or remount
with a new `key` to change initialization options. A controlled `value`, `v-model`,
default slot, or HTML host contents are not supported.

Other HTML attributes, `class`, and `style` apply to an outer wrapper. The editor
owns its inner host and classes. Theme attributes and inherited CSS variables
can change without resetting the document. Use `editorClassName` for an initial
skin and load that skin's CSS separately.

Vue 3.5 is supported. Server rendering produces empty hosts; editors mount on the
client. Optional parser/highlighter hooks work through `options`; no stylesheets,
parser, highlighter, telemetry, or network service load here.
