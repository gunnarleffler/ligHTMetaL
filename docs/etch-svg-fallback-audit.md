# SVG image fallback — design and boundary audit

## Scope and outcome

**Deferred beyond v1 by agreement.** Retain this review for future work; no fallback
implementation is currently planned for v1.

Reviewed `specs/etch-spec.md` §6.4, `src/svg-import.js`, `src/import/svg-xml.js`,
`src/image-import.js`, and the SVG XML/import browser fixtures. This is a
source/design review, not an independent security certification. There is no
implemented fallback to certify or enable. Keep it disabled until the separate
pipeline and its security/lifecycle tests exist.

The current editable importer intentionally does not decode SVG as an image.
Its full-tree security inspection precedes visibility-based omissions. Preserve
that boundary: an unsupported-feature result is not a sanitized SVG.

## Implementation blockers / audit findings

1. **The vector inspection output is unsuitable for rasterization.** It discards
   definitions, descriptive content and font properties that cannot affect accepted
   native vectors. Raster text, gradients, masks and clips need those semantics.
   Do not serialize that output or retry the original source through an image decoder.
2. **A separate reconstructing allowlist is required.** Build fresh SVG-namespace
   nodes in a disconnected document from parsed, typed values. Never copy arbitrary
   source attributes, inline CSS, child nodes or source XML into the output. Reject
   unsupported appearance rather than stripping it. No `innerHTML` or live-DOM mount.
3. **Local references need a typed, bounded graph.** Validate unique IDs, allowed
   target types, missing references, cycles, depth, and total expansion/work. Merely
   checking that a URL starts with `#` does not establish safety or bounded work.
   Rewrite accepted IDs/references to generated identifiers when serializing.
4. **Font policy must be different from vector import.** Permit only explicitly
   validated system-font properties; reject font downloads, stylesheets and resource
   syntax. Retain text content safely and warn that local font substitution changes
   appearance. Define supported text positioning/whitespace before allowing text;
   unsupported text layout must reject rather than silently change it.
5. **Rendering introduces new allocations and async ownership.** Resolve intrinsic
   dimensions and raster limits before decoding. Reserve decoded surface, raster
   canvas, encoded/decoded PNG and thumbnail overlap against existing retained/history
   allowances. Keep reservations until non-abortable decode/encode work settles.
   Revoke Blob URLs, close decoded resources and reject late results after cancellation,
   supersession or destroy. Existing raster helpers are useful patterns, not a complete
   SVG fallback implementation.
6. **Fallback must be explicit and atomic.** A separately selected image-import mode
   needs proposed dimensions and scalability/font warnings before confirmation. Do not
   auto-retry `UNSAFE_SVG`, invalid XML or limit errors. Capture insertion target/view
   before async work; validate the full destination and insert one PNG in one Undo.
   Save/export during preparation must remain committed-only. Never persist raw SVG.

## Allowed profile and exclusions

The planned profile is the vector subset plus bounded local defs, gradients,
clipPath, mask, fractional opacity and restricted system-font text. Each element,
attribute and CSS value needs an explicit grammar and appearance contract.

Reject scripts/events, foreignObject, animation, external/data resources, embedded
images, downloadable fonts, stylesheet elements, use/symbol and filters, including
inside hidden/unused/metadata content. Preserve the mandatory bounded UTF-8 read,
declaration/PI rejection, namespace checks and whole-tree inspection. Post-parse
node limits do not bound DOMParser peak allocation; the pre-parse byte cap remains
necessary. Host sanitization does not replace this policy.

## Required verification before enabling

- Independently authored positive pixel fixtures for gradients, clips, masks,
  group opacity and text; negative fixtures for each forbidden element/attribute.
- Malformed namespaces, CSS escapes/resource tricks, DTD/entities, duplicate/missing
  IDs, wrong reference targets, cyclic/deep references and excessive geometry/work.
- Network observation covering **all** requests, including same-origin requests and
  font loading, during parsing, decoding and canvas readback; allow only the deliberate
  generated Blob URL. Existing external-request assertions alone are insufficient
  evidence for a zero-network fallback guarantee.
- Confirm only reconstructed XML reaches the image decoder and canvas readback works.
- Input/dimension/pixel/byte/destination boundaries; failures leave history/revision
  unchanged and release resources. Cancel/load/supersede/destroy at every async stage.
- PNG-only native persistence, Undo/redo, committed-only export and no raw-source leaks.
- Chromium/Firefox/Safari coverage for the new decoder path. Browser image sandboxing
  is defense in depth, not a substitute for the sanitizer.

## Next step

Implement the sanitizer as a separately reviewed internal module first, with a
precise per-element/value allowlist and reference/work budgets. Review its output
before connecting any image decoder or exposing UI/API controls. Until then, retain
external-PNG guidance for unsupported artwork.
