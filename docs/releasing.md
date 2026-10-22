# Releasing ligHTMetaL

The npm package ships prebuilt files for the HTML editor, MaiDEn, and MeltDown.
Keep `dist/` tracked. Build explicitly; packing does not rebuild bundles. Do not
add install-time hooks.

## Check the release

1. Follow [the security review](skills/security-review.md). Confirm the version in
   `package.json`, `pyproject.toml`, `uv.lock`, and any local npm lockfile.
2. Update `CHANGELOG.md`, README release wording, and `docs/PROJECT_NOTES.md`.
   Keep a pending release marked unreleased until publication.
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

## Inspect and test the archive

For the pending 0.5.0 release:

```bash
npm pack --ignore-scripts --dry-run
npm pack --ignore-scripts
npm run test:package -- "$PWD/lightmetal-0.5.0.tgz"
```

Expect source, built assets, the README, changelog, license, logo, package metadata,
and the MeltDown guide. Confirm `maiden.*` replaces the old Markdown filenames.
Development servers, tests, local environment files, runtime dependencies, and
install hooks must not ship. Do not change source or bundles after archive testing.

## Publish when approved

Confirm the npm account, package ownership, and published versions:

```bash
npm whoami
npm view lightmetal versions --json
```

Publish the inspected archive, not a fresh package from the working tree:

```bash
npm publish ./lightmetal-0.5.0.tgz --access public --ignore-scripts
```

Follow npm's authentication prompts. Never store tokens in the repository.
Verify registry integrity and install the published version in a clean project
with `--ignore-scripts`. Record publication in `docs/PROJECT_NOTES.md` and remove
the unreleased marker from the changelog.

Commit, tag (`v0.5.0`), push, and publication each require approval. Never link the
private remote in public metadata or release notes. Use a chosen public hosting
service for ready-built artifacts, if available.
