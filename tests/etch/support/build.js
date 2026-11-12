import {createRequire} from 'node:module';
import {mkdir,copyFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const {build}=createRequire(import.meta.url)('esbuild');
const root=fileURLToPath(new URL('../../../',import.meta.url));
// Exercise a genuinely isolated two-file ESM distribution.
export async function buildDistribution(outdir) {
  await mkdir(outdir,{recursive:true});
  await build({entryPoints:[resolve(root,'src/etch.js')],outfile:resolve(outdir,'etch.js'),bundle:true,format:'esm',target:'es2022',minify:true});
  await copyFile(resolve(root,'src/etch.css'),resolve(outdir,'etch.css'));
}
