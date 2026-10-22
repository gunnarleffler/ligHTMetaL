---
name: remove-cruft
description: Simplify code by removing stale paths, redundant guards, unnecessary fallbacks, duplication, and needless abstractions. Use for cruft removal and refactoring that preserves required behavior.
---

# Remove Cruft

Reduce concepts, states, branches, and indirection. Prefer deletion over
new defensive machinery.

## Rules

- Require evidence before deletion. Show that behavior is redundant, obsolete,
  or outside supported contracts. Missing documentation or text references
  alone does not make code cruft. Do not invent constraints.
- Check callers, configuration, dynamic registration, and public interfaces
  before declaring code unused. No text references is insufficient proof.
- Validate external inputs at boundaries; trust established contracts
  internally. Fix invalid callers before adding downstream guards.
- When removing a downstream check, identify the upstream contract that makes
  it redundant. Verify that all callers satisfy it and protect the boundary
  with focused tests.
- Use early returns where clearer. Keep the main path shallow without
  forcing zero nesting or extracting needless helpers.
- Handle expected outcomes explicitly. Propagate unexpected failures to
  the appropriate error boundary. Preserve cleanup, rollback, security
  controls, and required recovery.
- Remove obsolete fallbacks, compatibility layers, wrappers, duplicate
  paths, and redundant state. Inline helpers that add no useful meaning.
- Do not add speculative abstractions, configuration, retries, defaults,
  or future features. Meaningful constants are not inherently cruft.
- Preserve required behavior and existing architecture. Keep unrelated
  bugs, upgrades, formatting, and redesigns outside the cleanup.
- Preserve observable contracts, including return values, callback timing
  and counts, event ordering, and cleanup ownership—not just final output.

## Workflow

1. Read repository instructions and establish the requested scope.
2. Identify concrete simplifications and verify their justification.
3. Implement small, coherent changes, removing directly obsolete imports,
   tests, comments, and configuration.
4. Run relevant tests and required checks. Protect meaningful behavior;
   do not weaken tests to hide regressions.
5. Review the diff. Justify every added branch, helper, fallback, or
   dependency. Do not merely relocate complexity.

If usage is uncertain, leave that code and report the uncertainty.
When asked to implement, make justified edits rather than stopping at
recommendations. For audit-only requests, report without editing.

Stop when the scoped cleanup is complete. Finding nothing worth deleting
is acceptable. Optimize for clarity, not deleted line count.

## Report

Briefly state what became simpler, any behavior changes, verification,
and material uncertainties.

Before making code tolerate an invalid state, ask whether that state
can be eliminated.
