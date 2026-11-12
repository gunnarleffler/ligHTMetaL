# ligHTMetaL.js — Toolbar UI Modernization
**Scope:** Toolbar UI/UX refinement  
**Dependencies:** None

## 1. Objective

Modernize ligHTMetaL's existing toolbar to provide a polished, intuitive editing experience.

Improve icon visibility, spacing, organization, dropdown menus, and responsive behavior while preserving the editor's existing functionality.

**This is a presentation and interaction update, not an editing-engine rewrite.**

### Design Principles

- Clean, compact, and intuitive.
- Larger, recognizable icons.
- Logical grouping of related commands.
- First-class access to important features.
- Consistent dropdown menus.
- Full light/dark theme support.
- Desktop and touchscreen friendly.
- Zero additional dependencies.

---

## 2. Toolbar Layout

Maintain a single-row primary toolbar with logically grouped controls.

### Proposed Layout

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ + │ ¶ ▾ │ B I U S │ A ▾ │ ≡ ▾ │ ☷ ▾ │ ▦ │ 🔗 🖼 │ </> │ ⋯ │ ↶ ↷ │
└────────────────────────────────────────────────────────────────────────────┘
```

### Toolbar Groups

| Group | Controls | Behavior |
|---|---|---|
| Insert (+) | Horizontal rule, emoji, other supported insertions | Dropdown |
| Paragraph (¶) | Paragraph, H1–H6, blockquote | Dropdown |
| Formatting | Bold, Italic, Underline, Strikethrough | Direct buttons |
| Text Options (A) | Text color, superscript, subscript | Dropdown |
| Alignment | Left, Center, Right, Justify | Dropdown |
| Lists | Bulleted list, numbered list | Dropdown |
| **Table (▦)** | **Table insertion** | **Dedicated button** |
| Link | Insert/edit link | Dedicated button |
| Image | Image insertion | Dedicated button |
| **HTML Source (`</>`)** | Toggle HTML source mode | **Dedicated button** |
| More (⋯) | Additional existing commands | Dropdown |
| History | Undo, Redo | Direct buttons |

### First-Class Actions

The following must remain directly accessible from the primary toolbar:

- Bold, Italic, Underline, Strikethrough.
- Paragraph formatting.
- **Table insertion.**
- Image insertion.
- HTML source editing.
- Undo and Redo.

**Do not bury Table, Image, or HTML Source inside the Insert menu during normal desktop use.**

---

## 3. Icon and Button Improvements

### Dimensions

| Element | Target |
|---|---|
| Icon size | 18–20 px |
| Desktop button target | 34–36 px |
| Touch button target | 40–44 px |
| Toolbar height | 44–48 px |
| Dropdown text | 13–14 px |
| Dropdown item height | 34–38 px |
| Group spacing | 6–10 px |

### Requirements

- Use consistent icon sizing and stroke weight.
- Reuse the existing icon registry or inline SVGs.
- No external icon libraries.
- Provide visible hover, focus, active, and disabled states.
- Use subtle separators between logical groups.
- Maintain a restrained visual appearance.
- Avoid increasing toolbar height unnecessarily.

### Active States

Use consistent visual feedback:

- **Inactive:** Muted icon.
- **Hover:** Slight background highlight.
- **Active:** Muted accent background with brighter icon.
- **Dropdown open:** Active styling with appropriate indicator.
- **Disabled:** Reduced opacity and no interaction.

Formatting buttons must reflect the formatting at the current caret or selection where supported.

---

## 4. Dropdown Menu Redesign

Create a consistent visual and interaction pattern for all toolbar dropdowns.

### Shared Requirements

- Consistent padding, borders, shadows, and corner radius.
- Clear hover and keyboard focus states.
- Highlight the currently selected option.
- Support mouse, keyboard, and touch.
- Close on Escape, outside click, or selection.
- Position menus within the available viewport.
- Preserve the editor's selection during interaction.
- Avoid clipping menus inside the editor container.
- Only one primary dropdown should be open at a time.

Reuse existing dropdown components where practical.

### Paragraph Dropdown

Replace the existing plain heading list with a more descriptive menu:

```text
┌──────────────────────────┐
│ Paragraph                │
├──────────────────────────┤
│ Heading 1                │
│ Heading 2                │
│ Heading 3                │
│ Heading 4                │
│ Heading 5                │
│ Heading 6                │
├──────────────────────────┤
│ Blockquote               │
└──────────────────────────┘
```

Requirements:

- Include normal paragraph formatting.
- Use representative typography for heading levels.
- Display the active paragraph style.
- Preserve existing heading commands.
- Include blockquote only if already supported.

### Alignment Dropdown

Provide:

- Align Left
- Align Center
- Align Right
- Justify

Use recognizable alignment icons with text labels.

### Lists Dropdown

Provide:

- Bulleted List
- Numbered List
- Checklist, if supported.

Do not implement new list types as part of this task.

### Text Options Dropdown

Provide existing controls for:

- Text color.
- Superscript.
- Subscript.
- Other applicable text formatting options.

Reuse existing color-picker functionality.

### Insert Dropdown

Include applicable existing commands such as:

- Horizontal rule.
- Emoji.
- Other less frequently used insertion actions.

Do not duplicate Table, Image, or HTML Source here.

---

## 5. Dedicated Table Control

**Table insertion must remain a first-class toolbar action.**

### Requirements

- Display a recognizable table/grid icon.
- Position it alongside the primary editing controls.
- Clicking opens the existing table insertion dropdown.
- Preserve the TinyMCE-inspired interactive grid.
- Preserve optional manual columns × rows inputs.
- Preserve existing dimension validation.
- Maintain cursor/selection restoration when inserting.
- Apply the updated dropdown styling.
- Do not alter table generation or insertion behavior.

### Important

Do not move Table into the Insert dropdown or hide it behind More at normal desktop widths.

On constrained displays, prioritize keeping Table visible over less frequently used formatting commands.

---

## 6. Dedicated Image and HTML Source Controls

### Image

- Keep the image insertion button directly visible.
- Reuse the existing image insertion popover.
- Preserve upload, URL, and other currently supported methods.
- Update popover styling to match the redesigned menus.
- Do not change image-processing functionality.

### HTML Source

- Keep the `</>` button directly visible.
- Clearly indicate when source mode is active.
- Preserve the existing HTML source editor.
- Do not change source synchronization behavior.
- Ensure toolbar controls that cannot operate in source mode are appropriately disabled.

---

## 7. Responsive Behavior

Maintain a single-row toolbar without uncontrolled wrapping.

### Desktop

- Display all primary control groups when space permits.
- Use compact spacing and subtle separators.
- Keep Table, Image, and HTML Source visible.

### Tablet

- Increase interactive target sizes for touch.
- Move lower-priority controls into an overflow menu when necessary.
- Support dropdown interaction without hover.
- Preserve access to frequently used controls.

### Mobile

- Keep the toolbar to one row.
- Prioritize Paragraph, Bold, Table, Image, and HTML Source.
- Move secondary actions into an overflow menu.
- Avoid horizontal page overflow.
- Allow dropdowns to reposition within the viewport.

### Overflow Behavior

- Use one `⋯` overflow control for actions that do not fit.
- Determine overflow based on available toolbar width rather than fixed screen-size assumptions.
- Preserve command order and accessibility.
- Never remove functionality.
- Do not duplicate commands in multiple menus unnecessarily.
- On extremely narrow screens, permit any command except the overflow trigger itself to move into overflow rather than allowing clipping.

---

## 8. Accessibility and Keyboard Behavior

- Provide accessible names for all icon buttons.
- Use `aria-pressed` for toggleable formatting controls.
- Use `aria-expanded` for dropdown triggers.
- Support keyboard navigation through toolbar controls.
- Support arrow-key navigation within menus.
- Escape closes the active dropdown.
- Enter/Space activates the focused command.
- Preserve the editor's caret and selection during toolbar interactions.
- Provide visible keyboard focus indicators.
- Avoid relying solely on color to indicate active state.

Do not introduce a new keyboard shortcut system; preserve existing shortcuts.

---

## 9. Styling and Themes

Retain ligHTMetaL's current charcoal appearance while improving contrast and consistency.

### Dark Theme

- Dark charcoal toolbar.
- Slightly elevated dropdown surfaces.
- Soft white text and icons.
- Subtle gray borders.
- Muted blue accent for active controls.
- Restrained shadows.

### Light Theme

- Light neutral toolbar.
- White or lightly tinted dropdown surfaces.
- Dark gray icons and text.
- Matching accent states.
- Subtle borders and shadows.

### CSS Requirements

- Use existing CSS variables where possible.
- Avoid unnecessary hardcoded colors.
- Scope styles to ligHTMetaL.
- Avoid global selectors.
- Do not introduce Bootstrap or other CSS frameworks.
- Preserve application-level theme overrides.

---

## 10. Implementation Constraints

- Vanilla JavaScript and plain CSS.
- No new runtime dependencies.
- Reuse existing toolbar actions and command handlers.
- Prefer modifications to existing source files.
- Do not introduce a new toolbar framework.
- Do not rewrite the editing engine.
- Do not modify generated HTML output.
- Preserve backward compatibility with existing toolbar configuration.
- Keep implementation readable and maintainable.
- Avoid unrelated refactoring.

### Important Compatibility Requirement

If ligHTMetaL currently supports user-defined toolbar actions or custom action ordering, preserve that capability.

Treat the proposed toolbar grouping as the **new default configuration**, not a restriction on how developers can customize their toolbars.

---

## 11. Testing and Acceptance Criteria

### Visual

- [ ] Icons are noticeably larger and easier to distinguish.
- [ ] Toolbar controls are logically grouped.
- [ ] Toolbar remains compact and single-row.
- [ ] Dropdowns have consistent styling.
- [ ] Heading dropdown visually differentiates heading levels.
- [ ] Light and dark themes render correctly.
- [ ] Active formatting is clearly indicated.

### Functional

- [ ] All existing toolbar commands remain available.
- [ ] Table remains a dedicated toolbar action.
- [ ] Existing table insertion grid functions correctly.
- [ ] Optional manual table dimensions continue working.
- [ ] Image insertion remains directly accessible.
- [ ] HTML source toggle remains directly accessible.
- [ ] Dropdown interactions preserve editor selection.
- [ ] Undo/Redo continue functioning.
- [ ] Custom toolbar configurations remain supported.

### Responsive

- [ ] Toolbar adapts to available width.
- [ ] Overflow menu retains displaced controls.
- [ ] Dropdowns remain within viewport boundaries.
- [ ] Touch interactions work without hover.
- [ ] No horizontal page overflow.

### Regression

- [ ] Existing formatting behavior is unchanged.
- [ ] HTML output is unaffected.
- [ ] Multiple editor instances work independently.
- [ ] Source mode continues functioning.
- [ ] No new runtime dependencies.
- [ ] Existing automated tests pass.

---

## 12. Deliverables

1. Updated toolbar layout and styling.
2. Consistent dropdown/popover presentation.
3. Responsive overflow behavior.
4. Preserved dedicated Table, Image, and HTML Source controls.
5. Updated relevant tests.
6. Brief implementation summary identifying changes and any known limitations.

