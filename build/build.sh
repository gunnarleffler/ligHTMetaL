#!/usr/bin/env bash
# Build lightmetal into dist/.
#
# Produces:
#   lightmetal.js       browser-ready IIFE (global: lightmetal)
#   lightmetal.min.js   minified IIFE
#   lightmetal.esm.js   native ES module
#   lightmetal.css      default styles
#   lightmetal.min.css  minified styles
#   maiden.*            optional Markdown companion: IIFE, minified, ESM, CSS
#   MeltDown.*          optional ligHTMetaL::MeltDown parser: IIFE, minified, ESM
#   polish.*            optional full-catalog syntax highlighter, CSS themes
#   etch.*              independent sketch editor: IIFE, minified, ESM, CSS
#   skins/*.css         optional skins, plain and minified
#
# Run `npm install` first.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/src"
DIST="$ROOT/dist"
ESBUILD="$ROOT/node_modules/.bin/esbuild"

[ -x "$ESBUILD" ] || { echo "esbuild not found. Run: npm install" >&2; exit 1; }

mkdir -p "$DIST"

"$ESBUILD" "$SRC/lightmetal.js" --bundle --format=iife --global-name=lightmetal --target=es2020 --outfile="$DIST/lightmetal.js"
"$ESBUILD" "$SRC/lightmetal.js" --bundle --format=iife --global-name=lightmetal --target=es2020 --minify --outfile="$DIST/lightmetal.min.js"
"$ESBUILD" "$SRC/lightmetal.js" --bundle --format=esm --target=es2020 --outfile="$DIST/lightmetal.esm.js"

"$ESBUILD" "$SRC/maiden.js" --bundle --format=iife --global-name=maiden --target=es2020 --outfile="$DIST/maiden.js"
"$ESBUILD" "$SRC/maiden.js" --bundle --format=iife --global-name=maiden --target=es2020 --minify --outfile="$DIST/maiden.min.js"
"$ESBUILD" "$SRC/maiden.js" --bundle --format=esm --target=es2020 --outfile="$DIST/maiden.esm.js"
"$ESBUILD" "$SRC/MeltDown.js" --bundle --format=iife --global-name=meltDown --target=es2020 --outfile="$DIST/MeltDown.js"
"$ESBUILD" "$SRC/MeltDown.js" --bundle --format=iife --global-name=meltDown --target=es2020 --minify --outfile="$DIST/MeltDown.min.js"
"$ESBUILD" "$SRC/MeltDown.js" --bundle --format=esm --target=es2020 --outfile="$DIST/MeltDown.esm.js"

# Capture indices require modern RegExp support (ES2022); no polyfills are bundled.
"$ESBUILD" "$SRC/polish-full.js" --bundle --format=iife --global-name=polish --target=es2022 --outfile="$DIST/polish.js"
"$ESBUILD" "$SRC/polish-full.js" --bundle --format=iife --global-name=polish --target=es2022 --minify --outfile="$DIST/polish.min.js"
"$ESBUILD" "$SRC/polish-full.js" --bundle --format=esm --target=es2022 --outfile="$DIST/polish.esm.js"
"$ESBUILD" "$SRC/etch.js" --bundle --format=iife --global-name=etch --target=es2022 --outfile="$DIST/etch.js"
"$ESBUILD" "$SRC/etch.js" --bundle --format=iife --global-name=etch --target=es2022 --minify --outfile="$DIST/etch.min.js"
"$ESBUILD" "$SRC/etch.js" --bundle --format=esm --target=es2022 --outfile="$DIST/etch.esm.js"
cp "$SRC/etch.css" "$DIST/etch.css"
"$ESBUILD" "$SRC/etch.css" --minify --outfile="$DIST/etch.min.css"

node "$ROOT/build/polish-css.mjs"
cp "$SRC/polish.css" "$DIST/polish.css"
"$ESBUILD" "$SRC/polish.css" --minify --outfile="$DIST/polish.min.css"

cp "$SRC/maiden.css" "$DIST/maiden.css"
"$ESBUILD" "$SRC/maiden.css" --minify --outfile="$DIST/maiden.min.css"

cp "$SRC/lightmetal.css" "$DIST/lightmetal.css"
"$ESBUILD" "$SRC/lightmetal.css" --minify --outfile="$DIST/lightmetal.min.css"

mkdir -p "$DIST/skins"
for skin in "$SRC"/skins/*.css; do
  name="$(basename "$skin" .css)"
  cp "$skin" "$DIST/skins/$name.css"
  "$ESBUILD" "$skin" --minify --outfile="$DIST/skins/$name.min.css"
done

# Report sizes as loaded over the network (gzipped).
bytes() { gzip -c "$1" | wc -c | tr -d ' '; }
echo "dist/lightmetal.js      $(bytes "$DIST/lightmetal.js") bytes gzip"
echo "dist/lightmetal.min.js  $(bytes "$DIST/lightmetal.min.js") bytes gzip"
echo "dist/lightmetal.esm.js  $(bytes "$DIST/lightmetal.esm.js") bytes gzip"
echo "dist/lightmetal.css     $(bytes "$DIST/lightmetal.css") bytes gzip"
echo "dist/maiden.min.js $(bytes "$DIST/maiden.min.js") bytes gzip"
echo "dist/polish.min.js $(bytes "$DIST/polish.min.js") bytes gzip"
echo "Built dist/ from src/"
