/**
 * Create an explicit async preparation layer around a synchronous highlighter.
 * Manifest keys must be canonical IDs. Configure aliases here before loading;
 * language-module aliases become available in the highlighter after registration.
 * Required dependencies are explicit manifest metadata, not inferred from regexes.
 *
 * @param {ReturnType<import('./index.js').createHighlighter>} highlighter
 * @param {Record<string, {load: () => Promise<{default: import('./index.js').Language}>, dependencies?: readonly string[]}>} manifest
 * @param {Record<string, string>} [aliases]
 */
export function createLanguageLoader(highlighter, manifest, aliases = {}) {
  const entries = new Map(Object.entries(manifest).map(([id, entry]) => {
    if (!/^[a-z0-9_-]+$/.test(id)) throw new Error(`Invalid manifest ID: ${id}`);
    return [id, { load: entry.load, dependencies: [...(entry.dependencies ?? [])] }];
  }));
  const aliasMap = new Map(Object.entries(aliases));
  for (const [alias, id] of aliasMap) {
    if (!/^(?=.*[a-z0-9])[a-z0-9_+#-]+$/.test(alias) || !entries.has(id) || entries.has(alias)) throw new Error(`Invalid loader alias: ${alias}`);
  }
  const loaded = new Set();
  const loading = new Map();
  const resolve = name => aliasMap.get(name.trim().toLowerCase()) ?? name.trim().toLowerCase();

  async function loadOne(id) {
    if (loaded.has(id)) return;
    if (!loading.has(id)) {
      const promise = Promise.resolve().then(() => entries.get(id).load()).then(module => {
        if (module.default?.id !== id) throw new Error(`Manifest/module ID mismatch: ${id}`);
        highlighter.register(module.default);
        loaded.add(id);
      }).finally(() => loading.delete(id));
      loading.set(id, promise);
    }
    return loading.get(id);
  }

  return {
    /**
     * Validate the complete graph before importing. Cycles are visited once,
     * not awaited recursively. Successful registrations survive a partial failure;
     * a subsequent call retries failed imports only. No rollback is attempted.
     * Use a fresh highlighter for isolation from failed preparation if necessary.
     * @param {...string} names
     */
    async prepare(...names) {
      const visited = new Set();
      const pending = names.map(resolve);
      for (let i = 0; i < pending.length; i++) {
        const id = pending[i];
        if (visited.has(id)) continue;
        const entry = entries.get(id);
        if (!entry) throw new Error(`No loader for language: ${id}`);
        visited.add(id);
        pending.push(...entry.dependencies.map(resolve));
      }
      await Promise.all([...visited].map(loadOne));
    },
  };
}
