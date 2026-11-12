# ligHTMetaL React adapter

Included as optional ESM files in **lightmetal 0.7.0**, not a separate package.
See [the framework guide](../../docs/frameworks.md) for installation.

Two components wrap the existing text editors without replacing native editing
or Undo. Install React 18.3.1 or 19 in your app; Vue is not required.

```jsx
import { useRef } from 'react';
import { LightmetalEditor, MaidenEditor } from 'lightmetal/adapters/react/index.js';
import 'lightmetal/dist/lightmetal.css';
import 'lightmetal/dist/maiden.css';

export default function Notes() {
  const markdown = useRef(null);
  return (
    <section>
      <LightmetalEditor initialValue="<p>Hello, HTML.</p>" />
      <MaidenEditor
        ref={markdown}
        initialValue="# Hello, MaiDEn."
        onChange={value => console.log(value)}
      />
      <button onClick={() => console.log(markdown.current.getMarkdown())}>
        Read Markdown
      </button>
    </section>
  );
}
```

- `initialValue` is an initial HTML/Markdown string. It defaults to empty.
- `options` forwards native initialization settings, except `element`/`onChange`.
- `editorClassName` supplies initial classes on the inner editor host.
- `onChange` always uses the latest committed callback. Initialization is silent.
- The forwarded ref holds the native instance after the mount effect, then `null`
  on cleanup. Both object and callback refs work.

The three initialization props are mount-only. Parent rerenders and new callback
refs do not recreate the editor. Use native setters for deliberate document
replacement, or remount with a new `key` to change initialization options.
A controlled `value`, children, or HTML host contents are not supported.

Other HTML attributes, `className`, and `style` apply to an outer wrapper. The
editor owns its inner host and classes. Theme attributes and inherited CSS
variables can change without resetting the document. Use `editorClassName` for
an initial skin and load that skin's CSS separately.

React 18.3.1 and 19 are supported. Server rendering produces empty hosts; editors
mount on the client. Put the wrapper in a client component when your framework
requires that boundary. Optional parser/highlighter hooks work through `options`;
no stylesheets, parser, highlighter, telemetry, or network service load here.
