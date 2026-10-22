# AGENTS.md

## General

* Read existing code before changing it.
* Prefer simple, focused changes. Don't refactor unrelated code.
* Preserve existing behavior unless instructed otherwise.
* Inspect and test instead of guessing.
* **Do not add dependencies, frameworks, or tooling unless necessary.** Prefer what the project already uses.

## Persistent Memory

`docs/PROJECT_NOTES.md` is durable memory across compaction and sessions.

* Read it at startup, after compaction, and before major decisions.
* Record important decisions, solved non-obvious bugs, constraints, gotchas, current state, and unfinished work.
* Keep it concise: conclusions, not conversation history.
* Correct or remove stale information.
* Before compaction, save anything needed to resume work.

Suggested sections:

```markdown
# Project Notes
## Architecture
## Decisions
## Gotchas
## Current State
## Next Steps
```

## Testing
Use the smallest appropriate test.

For web/browser behavior, **prefer real Chromium/Playwright**.
Use Chromium for:
* DOM and user interaction
* keyboard/mouse/focus
* CSS/visual effects
* timers/animations
* browser APIs
* smoke/end-to-end tests

Use Vitest/jsdom only for isolated JS logic. **Do not introduce them just to test browser behavior.**
Keep browser smoke tests small: verify the page loads and representative functionality works.
Avoid arbitrary sleeps. Prefer explicit signals.

## Debugging
1. Reproduce.
2. Inspect.
3. Form a hypothesis.
4. Make the smallest fix.
5. Test it.
6. Run a browser smoke test when relevant.
7. Save important discoveries to `docs/PROJECT_NOTES.md`.

Don't make repeated speculative changes without testing them.

## Git
* Check `git status` and `git diff`.
* Never discard user changes without permission.
* Don't commit debug/generated artifacts unless appropriate.
* Review the final diff before declaring completion.
* Ask user before committing code.

## Context
Context is limited; conserve it.
* Search before reading large files.
* Prefer targeted inspection.
* Don't repeatedly reread unchanged files.
* Summarize large outputs.
* Store durable knowledge in `docs/PROJECT_NOTES.md`.
* After compaction, recover state from the repo and notes, don't guess.

## Documentation
comments and README.md are for humans. The rule is simple. Use short sentences. Use the active voice. Give each word one meaning. Cut the clutter. Keep the writing warm and human - a person wrote it, not a manual.

