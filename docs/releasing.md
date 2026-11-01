# Releasing ligHTMetaL

The npm package ships prebuilt files for the HTML editor, MaiDEn, MeltDown, and poliSH.
Keep `dist/` tracked. Build explicitly; packing does not rebuild bundles. Do not
add install-time hooks.

## Check the release

1. Follow [the security review](skills/security-review.md). Confirm the version in
   `package.json`, `pyproject.toml`, `uv.lock`, and any local npm lockfile.
2. Update `CHANGELOG.md`, README release wording, and `docs/PROJECT_NOTES.md`.
   Keep development entries marked unreleased until the final release commit.
   Removing the marker prepares release notes; it does not authorize publication.
3. Build and run the checks:

   ```bash
   npm test
   npm run test:package
   ```

   These cover editing, parser behavior, security regressions, examples, skins,
   native history, lifecycle, and Chromium/Firefox integration. Package checks
   exercise standalone, minified, ESM, and bundled use with scripts disabled.
4. Review the diff and generated assets. Commit after approval. Keep the release
   tree clean before tagging.

## 0.6.0 signoff

Final `0.6.0` metadata and release notes are prepared. Version 0.5.0 was an
unpublished development snapshot included in this release. Publication is a
separate, explicitly authorized operation; final metadata and a release heading
do not establish npm availability.

### Accessibility scope approved for 0.6.0

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

### Performance scope approved for 0.6.0

The focused Chromium/Firefox performance and retained-DOM review is complete.
The maintainer accepted rare large-document latency and retained-node high-water
behavior as known 0.6.0 limitations. This is not a performance guarantee or heap
memory bound. See [the diagnostic and findings](performance-review.md).

Before freezing a release archive:

- Confirm final `0.6.0` metadata and matching npm/Python lockfiles.
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
  cached. Quickstarts pin code/CSS to 0.6.0. Keep private remote URLs out of
  metadata and public history.
- Approve the final changelog and tested support limits before the release commit.

## Inspect and test the archive

Use the version recorded in the package metadata:

```bash
VERSION=$(node -p "require('./package.json').version")
npm pack --ignore-scripts --dry-run
npm pack --ignore-scripts
npm run test:package -- "$PWD/lightmetal-$VERSION.tgz"
```

Expect source, built assets, the README, changelog, license, logo, package metadata,
the MeltDown/poliSH guides, and the linked poliSH technical spec. Confirm `maiden.*` replaces the old Markdown filenames.
Development servers, tests, local environment files, runtime dependencies, and
install hooks must not ship. Do not change source or bundles after archive testing.

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
