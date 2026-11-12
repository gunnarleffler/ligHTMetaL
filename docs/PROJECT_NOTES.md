# Project Notes

## Release 0.7.0

- The suite includes the HTML editor, MaiDEn, MeltDown, poliSH and Etch.
- React and Vue adapters ship as optional files in the main package.
- The full test suite passed, including Chromium/Firefox Markdown, framework
  adapter and security checks.
- The final 202-file npm archive passed documentation, package and framework
  consumer checks with install scripts disabled.
- SHA256: `54f8ea665e5a30497926857c7abc84d6de339112bf63f7c9853008d1766a2971`.

## Maintenance

- Preserve native text editing, selection and browser history.
- Core libraries have no runtime dependencies. Applications own persistence and
  opt-in uploads; the libraries provide no telemetry or automatic uploads.
- Preview filtering is not an export sanitizer guarantee. Applications must
  validate exported content. Trusted raw HTML and highlighting hooks remain
  explicit bypasses.
- Retained preview nodes include hidden spares. Test visible rendered content.
- Scroll whole-editor iframes into view before testing narrow-layout menus.
- See `docs/releasing.md` for release checks and accepted browser, accessibility
  and performance limits. Native Safari, screen-reader and real-device input
  coverage are not claimed.
