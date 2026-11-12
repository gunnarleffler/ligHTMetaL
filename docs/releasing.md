# Releasing ligHTMetaL

The development package ships prebuilt files for the HTML editor, MaiDEn,
MeltDown, poliSH, and Etch.
Keep `dist/` tracked. Build explicitly; packing does not rebuild bundles. Do not
add install-time hooks.

## Check the release

1. Follow [the security review](skills/security-review.md). Confirm the version in
   `package.json` and any local npm lockfile.
2. Update `CHANGELOG.md`, README release wording, and `docs/PROJECT_NOTES.md`.
   Pin npm/CDN examples to the target version. Run `npm run test:release-docs`:
   it checks npm's shipped documentation, including adapter READMEs, for mismatched
   package pins and previous lightmetal versions in prose. It preserves changelog
   history and checks that the first release heading matches `package.json`.
   Review findings; do not blindly replace historical or third-party versions.
   If prose needs an old number, explain it on that line with
   `<!-- release-docs: allow-version 0.6.0; reason -->`. This does not excuse stale
   package, CDN or archive pins. Do not add exceptions to keep old quickstarts.
   Keep development entries and publication notices honest until the final release
   commit. Removing an unreleased marker does not authorize publication.
3. Build and run the checks:

   ```bash
   npm run test:release-docs
   npm test
   npm run test:package
   ```

   These cover editing, parser behavior, security regressions, examples, skins,
   native history, lifecycle, and Chromium/Firefox integration. Package checks
   exercise standalone, minified, ESM, and bundled use with scripts disabled.
4. Review the diff and generated assets. Commit after approval. Keep the release
   tree clean before tagging.

## Package integrations

### Etch integration

Etch joins the suite as an independent library under its MIT license. Its original
feature/native-format spec is retained, but historical package/layout and manual
acceptance instructions do not override this suite's validation policy. Do not
claim completed v1 acceptance, native Safari/device coverage, or assistive-technology
validation. Exercise unit/browser tests and exact-archive standalone, minified,
ESM and bundler use before publishing Etch.

### Framework adapters

`adapters/react/index.js` and `adapters/vue/index.js` ship in the main lightmetal
archive and share its version. React/Vue are optional peers: bare installs must
install neither, and each adapter must work without the other framework. Run
`npm run test:frameworks` for these consumer and lifecycle checks. The nested
package manifests only select ESM; there are no separate adapter releases.
See [the framework guide](frameworks.md) for installation.

## Approved validation scope

The following 0.6.0 decisions define the suite's validation scope. Broader feature
specifications do not override them; revisit them only by maintainer decision.

### Accessibility

Keep a focused keyboard, visible-focus, accessible-name/state, and 200% zoom /
narrow-layout review in scope. Inspect existing Chromium/Firefox coverage first;
check gaps without adding an audit framework. HTML field names, toggle states,
and editing-field focus indicators now have Chromium/Firefox regression coverage,
including base/all seven skins and plain/minified CSS.

The native 200% zoom review completed in Chromium and Firefox. Both editors,
the base style and all seven skins passed the keyboard-driven editing and popup
checks in light/dark mode at 600 and 390 CSS-pixel widths. Checks included native
undo/redo, HTML Source editing, table menus/pickers, and MaiDEn Help, preview,
split view, and fullscreen. No whole-page horizontal overflow was observed.
Writing-first Tab entry was rechecked at both widths after its implementation,
including toolbar access from writing and preview-only entry.

The maintainer accepted one zoom limitation as a 0.6.0 non-blocker. Browser focus
scrolling can leave a toolbar button partly clipped. A plain scrolling flex
toolbar with no editor code reproduces it in both engines. Tab order and Enter
activation still work. Keep the limitation documented; do not claim it is fixed.

Formal accessibility auditing and screen-reader validation are deferred beyond
0.6.0. Do not claim screen-reader compatibility or WCAG conformance. This
release decision does not close the broader M5/M6 accessibility gates or excuse
known usability defects.

Real mobile/IME input, autocorrect, dictation, and mixed RTL/LTR input validation
are also deferred beyond 0.6.0 because suitable devices and input methods are not
available. They are not release blockers. Keep them documented as unverified;
synthetic input tests do not establish real-device support.

Native Safari testing is permanently outside the project's required validation
scope. Use Linux Playwright WebKit for the coverage available here; do not call
it Safari testing or make Safari support claims from it. Accessibility checks
are limited to what the current browser tools can inspect and exercise. Checks
requiring screen readers, additional devices, or external audit services are not
release requirements. Revisit these boundaries only if the maintainer chooses to.

### Performance

The focused Chromium/Firefox performance and retained-DOM review is complete.
The maintainer accepted rare large-document latency and retained-node high-water
behavior as known 0.6.0 limitations. This is not a performance guarantee or heap
memory bound. See [the diagnostic and findings](performance-review.md).

Before freezing a release archive:

- Confirm release metadata and the matching local npm lockfile.
  A tested development archive is not the final release artifact.
- Keep the approved browser-tool usability scope and zoom limitation documented.
  Keep the accepted large-document performance and retained-DOM limits documented.
  The broader
  [M5/M6 goals](specs/markdown-editor-spec.md#m6--harden-integration-accessibility-and-performance)
  are not additional release blockers where the scope decisions above exclude them.
- The Firefox cross-document focus/input diagnostic is an approved non-blocker.
  Keep it intact and separate from the product suite, document the observed
  runtime limitation, and do not add editor workarounds or claim it is fixed.
  A stock-Firefox manual check is not required for 0.6.0.
- The README logo uses jsDelivr's `lightmetal@latest/ligHTMetaL.png` URL.
  Verify it after publication; `@latest` follows npm's latest dist-tag and may be
  cached. Pin quickstart code/CSS to the target package version; check the final
  archive's documentation too. Keep private remote URLs out of metadata and public
  history.
- Approve the final changelog and tested support limits before the release commit.

## Inspect and test the archive

Use the version recorded in the package metadata:

```bash
VERSION=$(node -p "require('./package.json').version")
npm pack --ignore-scripts --dry-run
npm pack --ignore-scripts
npm run test:release-docs -- "$PWD/lightmetal-$VERSION.tgz"
npm run test:package -- "$PWD/lightmetal-$VERSION.tgz"
npm run test:frameworks -- "$PWD/lightmetal-$VERSION.tgz"
```

Expect source, built assets, the README, changelog, license, logo, package metadata,
the editor/framework/MeltDown/poliSH/Etch guides, packaged technical specs, and
Etch maintenance/security/verification notes. Include the optional adapter modules,
ESM manifests, READMEs and licenses; exclude generated framework demo bundles.
Development servers, tests, local environment files, runtime dependencies, and
install hooks must not ship. Package smoke tests also check the installed docs,
so an archive with stale docs cannot pass by borrowing newer checkout files.
Do not change shipped docs, metadata, source or bundles after archive testing;
repack and retest if any of them change.

## Publish when approved

This repository keeps full development history on `dev`. Prepare the public
release as a new snapshot commit on `master`, not a merge from `dev`. Public tags
must point to the reviewed release snapshot. Do not push `dev`, `--all`, or
`--mirror`; development history contains a private remote URL. Snapshot commits,
tags, pushes, and publication each need approval.

Confirm the npm account, package ownership, and published versions:

```bash
npm whoami
npm view lightmetal versions --json
```

Publish the inspected archive, not a fresh package from the working tree:

```bash
npm publish "./lightmetal-$VERSION.tgz" --access public --ignore-scripts
```

Follow npm's authentication prompts. Never store tokens in the repository.
Verify registry integrity and install the published version in a clean project
with `--ignore-scripts`. Record publication in `docs/PROJECT_NOTES.md`.

Choose the final release version before publishing; development prereleases are
not automatically releases. Commit, tag (`v$VERSION`), push, and publication each
require approval. Never link the
private remote in public metadata or release notes. Use a chosen public hosting
service for ready-built artifacts, if available.
