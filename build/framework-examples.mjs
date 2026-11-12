import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
export async function buildFrameworkExamples(outdir = path.join(root, 'examples/frameworks/build')) {
  await build({
    entryPoints: { react: path.join(root, 'examples/frameworks/react.js'), vue: path.join(root, 'examples/frameworks/vue.js') },
    outdir, bundle: true, format: 'iife', platform: 'browser', target: 'es2022',
    alias: { lightmetal: root },
    define: { 'process.env.NODE_ENV': '"development"', __VUE_OPTIONS_API__: 'true',
      __VUE_PROD_DEVTOOLS__: 'false', __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false' },
    logLevel: 'silent'
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await buildFrameworkExamples();
  console.log('Built local React/Vue examples in examples/frameworks/build/');
}
