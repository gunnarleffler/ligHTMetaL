# Editor UI refinement: toolbar grouping and Substantial

User-approved direction. Both phases are implemented in the user-authorized
checkpoint `Group default toolbars and add Substantial skin`.
Focused Chromium/Firefox grouping, Substantial, and separator tests pass; package
checks cover seven skins in plain/minified forms. No new full-suite pass is claimed.
Implement in two independent phases. Preserve editor
behavior and the existing default skin. Phase 1 targets both MaiDEn and the HTML editor. Preserve each editor's existing
controls and order; do not add unsupported controls to the HTML editor.

## Phase 1: default toolbar grouping

Group related controls with quiet vertical separators. Preserve control order
where practical. Grouping belongs in shared editor configuration, not a skin.

| Group | Controls |
| --- | --- |
| Formatting | Bold, Italic, Strikethrough |
| Structure | H1, H2, Paragraph |
| Blocks | Blockquote, Bulleted list, Numbered list |
| Code | Inline code, Code block |
| Insert | Horizontal rule, Link, Image, Table |
| History | Undo, Redo |
| View and Help | Preview, Split view, Fullscreen, Help (no divider before Help) |

### Behavior

- Define groups in existing toolbar configuration where possible.
- Generate separators between nonempty groups, not individual buttons.
- Adapt to hidden/disabled controls. Omit empty groups and redundant separators.
- No leading or trailing separators.
- Preserve icons, tooltips, actions, shortcuts and custom configurations.
- Prefer horizontal scrolling to wrapping. Keep each group's controls together.
- Avoid orphaned separators when groups are hidden.
- Preserve existing responsive behavior where possible.

### Appearance

- One-pixel vertical separator, about 16–18px high.
- 4px horizontal margin per side; vertically centered. User reduced this from
  the initial 8px to avoid empty-button-sized gaps.
- Use the existing muted border color, with lower visual contrast than the
  toolbar's bottom border.
- Apply consistently across all skins. Do not otherwise change their appearance.

### Acceptance

Default controls form the groups above. Separators adapt automatically to the
available controls across skins and narrow layouts. Toolbar functionality and
custom configuration compatibility remain intact.

## Phase 2: optional Substantial skin

Register `substantial` through the existing CSS-only skin architecture. Reuse existing
variables and shared rules. Do not change the default skin to accommodate it,
duplicate shared editor styles, add dependencies or introduce unnecessary layers.

Substantial should feel like a modern developer tool: substantial without being
chunky, flat rather than raised, structured rather than boxed-in, solid rather
than bulky, clean but not sterile, understated rather than decorative.

### Proportions

These are guidelines, not rigid dimensions.

| Element | Target |
| --- | --- |
| Toolbar height | 47px (user increased vertical padding after visual review) |
| Button hit area | 30–32px |
| Icons | Slightly larger than default |
| Status bar height | 28–30px |
| Separators | 18–20px |
| Borders | Subtle, slightly stronger |
| Corners | Existing rounded style |
| Buttons | Flat and minimal |
| Active state | Subtle background highlight |
| Shadows | None or extremely subtle |

### Toolbar and container

- Add visual weight through proportions, vertical padding and comfortable hit
  areas, not decoration.
- Keep consistent horizontal spacing, flat buttons and quiet hover/active states.
- Inherit Phase 1 grouping and maintain the existing visual hierarchy.
- Slightly strengthen the outer border and retain the existing radius.
- Keep toolbar, editing surface and status bar cohesive, with consistent spacing
  and subtle horizontal boundaries.
- Avoid raised buttons, heavy shadows, thick borders, prominent gradients and
  excessive background contrast.

### Status bar

Keep compact typography and existing indicator alignment. Vertically center the
information. Use a subtle border and background contrast, with slightly more
substance than the default skin.

### Responsive behavior and acceptance

- Keep narrow-screen toolbar controls usable and horizontally scrollable.
- Keep groups intact without unnecessarily reducing editing space.
- Verify normal, split, preview and fullscreen modes.
- Make Substantial available alongside existing skins.
- Leave the default skin unchanged beyond Phase 1's shared separators.
- Preserve all editor behavior. Keep controls comfortably spaced and active
  states understated.

## Implementation boundaries

Separate behavior from appearance. Reuse existing components, variables and
patterns before extending them. Modify the appropriate rules instead of layering
compensating overrides. Keep changes focused; do not refactor unrelated code.
Preserve backward compatibility for skins and editor configurations.

Review and test each phase independently. Get separate approval before committing
new work; the preceding code-background fix has its own authorized checkpoint.
