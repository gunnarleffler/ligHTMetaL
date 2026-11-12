# Conservative Code Cleanup

Review existing code without redesigning the project or imposing a new
architecture. Prefer boring, obvious code over clever code.

The goal is the same library, written more clearly—not a different library.
If code is already clear and reasonable, leave it alone.

## Review first, change only after approval

The first pass produces findings, not source changes.

1. Read the current file and the project notes.
2. Identify meaningful cleanup candidates and the evidence for each.
3. Explain the benefits, risks, and proposed verification.
4. Discuss the findings with the user.
5. Wait for approval before changing source code.

Approval to review is not approval to refactor. Keep confirmed bugs separate
from cleanup suggestions. A suspected bug needs a reproducer before a fix.
Do not turn an intentional behavior into a bug merely because it is unusual.

## Scope

Review one primary file at a time. Finish its review before choosing another
cleanup target.

Inspect related files only to understand an interface, validate behavior,
trace a caller, check a dynamic reference, confirm suspected duplication, or
assess test coverage. Do not browse neighboring files for extra cleanup work.
Inspection does not make another file a cleanup target.

After approval, a source change may also need focused regression tests,
rebuilt `dist/` files, and documentation updates. These are supporting changes,
not permission to refactor other modules. Explain the supporting scope before
making changes. Record unrelated opportunities for a separate pass.

## Priorities

In this order:

1. Correctness.
2. Simplicity.
3. Readability.
4. Maintainability.
5. Meaningful performance improvements.

Preserve intended behavior unless the user explicitly approves a behavior
change. Do not optimize merely because a theoretically faster approach exists.
Address concrete repeated work, unnecessary I/O or DOM operations, or other
measured or clearly demonstrated costs.

## Project constraints

Preserve the existing architecture:

- Vanilla JavaScript and CSS with zero runtime dependencies.
- The existing public exports, options, return values, and browser usage.
- Native contenteditable editing and `document.execCommand` through `exec()`.
- Native undo/redo; no custom editing engine or undo stack.
- The existing esbuild pipeline and tracked, ready-built `dist/` bundles.
- Scoped editor styles, system/forced themes, and the existing directory layout.
- The documented normal, raw, unrestricted, and Source-mode trust boundaries.

Do not introduce frameworks, TypeScript, sanitizer dependencies, architecture
layers, or new tooling just for cleanup. Preserve the MIT license.
See [project notes](../PROJECT_NOTES.md) and [README](../../README.md) for current
behavior and constraints. Use `security-review.md` for a dedicated security
review; a cleanup pass is not a security audit.

## What to look for

Look for meaningful examples of:

- Unnecessary complexity or nesting.
- Confusing control flow or misleading names.
- Dead code, stale imports, and unnecessary wrappers.
- Repeated work, especially in event handlers and table inspection.
- Duplication that makes the same behavior harder to maintain.
- Helpers or abstractions that add more indirection than clarity.
- Stale comments and comments that merely narrate obvious code.
- Functions handling unrelated responsibilities.

Do not make stylistic changes simply to produce a diff. Avoid broad naming
churn and arbitrary function-length targets.

## Evidence before deletion

A repository search alone does not prove code is unused. Check public exports,
documented extension points, configurable actions and classes, generated markup,
and dynamically added state classes. Public APIs may have consumers outside
this repository.

Before deleting CSS, check templates, JavaScript, generated markup, theme
selectors, and focus/hidden states. Before removing a guard or workaround,
check the documented browser and lifecycle constraints.

Keep comments that explain compatibility quirks, security boundaries, native
editing behavior, or deliberate workarounds. Preserve the reason, even if the
surrounding code gets shorter.

## Simplification and consolidation

Prefer this order:

1. Delete unnecessary code.
2. Simplify existing code.
3. Remove repeated work.
4. Consolidate meaningful duplication.
5. Extract a narrow helper when it clearly helps.
6. Use an appropriate existing module.
7. Create a new file only when existing locations are clearly unsuitable.

A little obvious duplication is better than a complicated abstraction.
Consolidate when copies represent the same concept, are risky to maintain
separately, or would require the same bug fix in several places. Similar-looking
syntax alone is not enough. Do not merge paths whose policies differ.

Before adding a helper or file, ask whether it reduces complexity, whether an
existing owner fits, and whether another developer will know where to find it.
Do not introduce new layers merely to share a few lines.

Cross-file consolidation is a separate proposal. Confirm the duplication,
explain the trade-off, and get approval for its scope before implementing it.

## JavaScript and CSS

Prefer `const`, local state, early returns, descriptive functions, standard
browser APIs, and straightforward event handling. Use `let` for reassignment.
Do not replace a clear promise or callback solely to impose one style.

Pay particular attention to:

- Listener ownership and matching teardown options.
- Focus, selection, and saved-range behavior.
- Deferred work, pending uploads, mode changes, and destruction.
- Change-event counts and event ordering.
- Browser editing differences and document-wide editing settings.
- Repeated DOM queries or table inspection within the same event.

Reuse a local snapshot when safe. Do not cache mutable DOM state across events
without evidence that invalidation is correct.

Consolidate CSS only when rules describe the same component or visual behavior.
Preserve dynamically used selectors, theme precedence, explicit hidden rules,
and contextual-toolbar focus behavior. Do not redesign the visual system.

For supporting shell changes, prefer quoted variables, simple loops, and clear
arrays over repeated commands or clever shell tricks. Keep dependencies and
build tooling unchanged unless a concrete need justifies a separate proposal.

## Findings format

For each meaningful candidate, report:

- **Location:** file and line range or function.
- **Evidence:** what is repeated, confusing, unused, or demonstrably wrong.
- **Proposal:** the smallest useful change.
- **Value/risk:** high value / low risk, medium, or leave alone.
- **Verification:** the behavior and checks needed before accepting the change.

Separate observations from reproduced defects. Do not claim a runtime problem
based only on a suspicious code pattern. Do not manufacture cleanup work.

## Implementation after approval

Make the smallest coherent change. Do not mix unrelated cleanup into a pass.
Review the diff for accidental behavior changes, public API changes, unnecessary
churn, changed error handling, broken selectors, and over-abstraction.

If the result is harder to understand than the original, simplify or leave the
original alone. Stop when further work mainly reflects personal preference.

## Verification

Use the smallest appropriate check. For browser behavior, prefer the existing
Playwright suite in real Chromium and Firefox. Do not introduce jsdom or another
test framework just for cleanup.

A browser refactor must preserve more than serialized HTML. Check the relevant
focus, selection, event timing/counts, teardown, mode transitions, and native
undo/redo. Test meaningful DOM structure across browsers rather than assuming
identical serialization. Use explicit signals, not arbitrary sleeps.

Reproduce suspected bugs before changing code. Add focused regression coverage
for confirmed fixes. After approved source changes, run `npm test`; run
`npm run test:package` when package outputs or consumer behavior are affected.
Commit rebuilt bundles alongside source changes after user approval.

A findings-only pass does not require rebuilding or changing tracked artifacts.
State exactly what was inspected or run. Do not report old test passes as new
verification. Record Safari as untested unless actually checked.

## Finish

Summarize the findings and agreed next steps. After implementation, summarize:

```text
Changed
- Meaningful changes, or none for a review-only pass.

Verified
- Checks actually run and their results.

Follow-up
- Separate opportunities, risks, or decisions still needed.
```

Update `PROJECT_NOTES.md` with durable decisions and important discoveries.
Review the final diff. Ask before committing, tagging, pushing, or publishing.
