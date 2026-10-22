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
echo "Built dist/ from src/"
