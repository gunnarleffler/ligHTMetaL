# React and Vue adapters

The adapters wrap the HTML editor and MaiDEn. They mount the existing editors,
forward changes, expose the native instance, and destroy it on unmount. They do
not add an editing engine or a history stack.

The adapters ship as optional files in **lightmetal 0.7.0**, not as separate
packages. Installing lightmetal alone does not install React or Vue, and importing
a core library loads neither.

## Install

For React:

```sh
npm install lightmetal@0.7.0 react@19 react-dom@19 --ignore-scripts
```

For Vue:

```sh
npm install lightmetal@0.7.0 vue@^3.5.0 --ignore-scripts
```

## Install from this checkout

Pack one archive without lifecycle scripts:

```sh
ARTIFACTS=$(mktemp -d)
VERSION=$(node -p "require('./package.json').version")
npm pack --ignore-scripts --pack-destination "$ARTIFACTS"
```

In your React application, install that archive and your framework:

```sh
npm install "$ARTIFACTS/lightmetal-$VERSION.tgz" react react-dom
```

For Vue, install the same archive and `vue` instead. React 18.3.1/19 and Vue 3.5
are optional peers; install only the framework you use. The adapters are plain ESM
with no build or install hooks. Their small `package.json` files only select ESM
syntax; all versions and peer ranges belong to the root package.

## React

```jsx
import { useRef } from 'react';
import { MaidenEditor } from 'lightmetal/adapters/react/index.js';
import 'lightmetal/dist/lightmetal.css';
import 'lightmetal/dist/skins/frost.css';
import 'lightmetal/dist/maiden.css';

export default function Note() {
  const editor = useRef(null);
  const changed = markdown => console.log(markdown);

  return (
    <section>
      <MaidenEditor
        ref={editor}
        initialValue="# Your words. Your metal."
        editorClassName="lightmetal-frost"
        onChange={changed}
        data-lightmetal-theme="auto"
      />
      <button onClick={() => console.log(editor.current.getMarkdown())}>
        Read Markdown
      </button>
    </section>
  );
}
```

`LightmetalEditor` uses the same props and exposes `getHTML()` and `setHTML()`
instead. Import shared CSS for HTML editing; MaiDEn also needs `maiden.css`.

The forwarded ref holds the native editor after the component's mount effect.
It becomes `null` on cleanup. Object refs and callback refs work. React development
Strict Mode can mount, clean up, and mount again; each setup owns a fresh instance.
Changing the callback ref does not recreate the editor.

## Vue 3

```vue
<script setup>
import { ref } from 'vue';
import { MaidenEditor } from 'lightmetal/adapters/vue/index.js';
import 'lightmetal/dist/lightmetal.css';
import 'lightmetal/dist/skins/frost.css';
import 'lightmetal/dist/maiden.css';

const component = ref(null);
function changed(markdown) { console.log(markdown); }
function readMarkdown() {
  console.log(component.value.editor.getMarkdown());
}
</script>

<template>
  <section>
    <MaidenEditor
      ref="component"
      initial-value="# Your words. Your metal."
      editor-class-name="lightmetal-frost"
      data-lightmetal-theme="auto"
      @change="changed"
    />
    <button @click="readMarkdown">Read Markdown</button>
  </section>
</template>
```

`LightmetalEditor` has the same props and `change` event. A component ref exposes
`editor`, the native instance, after mounting. It is a shallow ref internally:
Vue does not proxy the editor's DOM or API. Cleanup destroys the instance and
clears `editor`.

## Shared contract

| Input | Meaning |
| --- | --- |
| `initialValue` | Initial HTML or Markdown string. Defaults to an empty string. |
| `options` | Native initialization options, except `element` and `onChange`. |
| `editorClassName` | Initial classes on the editor host, such as `lightmetal-frost`. |
| React `onChange` / Vue `change` | Current HTML or Markdown after an edit or an explicit native setter. |

Initialization does not emit a change event. The editor still applies its normal
import rules to the initial value. HTML import filtering is not a general
sanitizer guarantee; applications remain responsible for publishing safety.

`initialValue`, `options`, and `editorClassName` are **mount-only**. Changing them
does not replace content or recreate the editor. Change handlers stay current
when the parent rerenders. To replace a document deliberately, call the native
`setHTML()` or `setMarkdown()` method through the instance. Those setters retain
their normal filtering, callbacks and native-history limitations. To change
initialization options, remount with a different framework `key`.

There is no controlled `value` or Vue `v-model` interface. Do not write every
change back into the editor. Ordinary parent rerenders must leave native typing,
selection, composition, and Undo alone. Children, default slots, HTML host
contents, and a host `contenteditable` override are not supported.

HTML attributes, classes and inline styles belong to the **outer wrapper**.
The stable inner host belongs to the editor, so framework class updates cannot
strip fullscreen or Markdown state classes. Use `editorClassName` for an initial
skin. Theme attributes and inherited CSS variables can change on the outer
wrapper without remounting. The native instance's `element` is the inner host.

Native history is document-wide. If your app paints a live output elsewhere,
keep those output nodes too: update `Text.data` rather than replacing children.
A Vue text interpolation can replace its host's text node; the runnable examples
use a retained output painter and explicit text VNodes to avoid splitting typing
Undo. This is a native-browser constraint, not a separate wrapper history stack.

## Preview and live code colors

Pass the same optional hooks you use with the native MaiDEn API:

```js
import { parse } from 'lightmetal/dist/MeltDown.esm.js';
import { createHighlighter, allLanguages } from 'lightmetal/dist/polish.esm.js';
import 'lightmetal/dist/polish.css';

const highlighter = createHighlighter({ languages: allLanguages });
const options = {
  sourceHighlight: highlighter.highlightTokens,
  preview: {
    render: source => parse(source, { highlight: highlighter.highlight })
  }
};
```

Give `options` to `MaidenEditor`. The adapters do not load a parser, highlighter,
stylesheet, network resource, or upload service for you. Preview stays read-only;
task markers are clickable in the source, including the source half of split.
Live source colors require lightmetal 0.7.0 or a later compatible release.

## Server rendering

Both components can render an empty host on the server. They access the browser
DOM only after mounting, so the editor and initial document appear on the client.
React hydration and Vue SSR hydration use the same empty-host markup. The adapters
do not provide a server-rendered document viewer. Use MeltDown separately for
that job. Frameworks with server/client component boundaries must put the editor
inside a client component.

## Local examples

Run `npm run build:framework-examples`, then open
`examples/frameworks/react.html` or `examples/frameworks/vue.html`, directly or
through the demo server. These optional bundles use the existing esbuild and the
framework development dependencies. They are generated locally and are not
tracked or shipped with the core. Both pages show the two text editors, live
output, parent rerenders, theme changes, and imperative instance reads. No CDN
or framework is added to the main gallery.

## Development checks

`npm run test:frameworks` packs one lightmetal archive and installs it with scripts
disabled. It checks bare-JS, React-only and Vue-only consumers, including that unused
frameworks are neither installed nor bundled. It uses the framework versions in the checkout's development install,
from the local npm cache, and publishes nothing. It bundles the installed
packages with the existing esbuild and runs real Chromium/Firefox checks for
lifecycle, parent updates, refs, native history, optional Markdown hooks, and
server rendering/hydration. The same checks cover the runnable local demos.
To check a specific release archive, run `npm run test:frameworks -- /path/to/lightmetal-0.7.0.tgz`.
For another cached framework version, use `LM_REACT_VERSION=18.3.1` or
`LM_VUE_VERSION=3.5.0`. Install that version in a separate temporary project first
to populate npm's cache; the test itself never falls back to network installation.
