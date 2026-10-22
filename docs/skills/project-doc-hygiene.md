---
name: project-doc-hygiene
description: Review and maintain internal project documentation. Remove obsolete information, eliminate redundancy, and preserve concise, accurate descriptions of the current project state. Prefer deletion over summarization when information is no longer useful. Optimize documentation for human understanding and efficient LLM context usage.
version: 1.2.0
---

# Project Documentation Hygiene

Maintain concise, accurate project documentation optimized for
human understanding and efficient LLM context usage.

## Core Principles

1. **Current State:** Document what exists, not how the project evolved.
2. **Relevance First:** Question whether information deserves to exist before rewriting it.
3. **Delete Before Compressing:** Remove obsolete information rather than summarizing it.
4. **Single Source of Truth:** Maintain one authoritative description per concept.
5. **Information Density:** Maximize useful information per token without losing meaning.
6. **Preserve Intent:** Retain constraints and decisions that prevent future mistakes.
7. **Context Lifecycle:** Keep temporary working notes separate from enduring project knowledge.

Git preserves development history. Project documentation should
describe what exists, how it works, and what remains unresolved.

## Review Rules

### 1. Relevance First

Evaluate content before rewriting it.

Keep:
- Current architecture and component relationships.
- Configuration, dependencies, and operational requirements.
- Important design decisions and enduring constraints.
- Unresolved issues and known limitations.
- Non-obvious behavior needed for future maintenance.
- Active work that requires follow-up.

Remove:
- Resolved bug narratives and debugging histories.
- Completed tasks and obsolete TODOs.
- Superseded designs and abandoned approaches.
- Redundant explanations and duplicated instructions.
- Historical status updates without continuing relevance.
- Implementation details obvious from the code.

Do not retain information merely because it was previously documented.

### 2. Delete Before Compressing

Prefer removing irrelevant content over summarizing it.

Do not preserve obsolete information as shorter prose.

Retain historical context only when it explains a current
constraint, design decision, or operational requirement.

Example:

Before:
> We encountered an issue with Flask sessions because SECRET_KEY
> was not loaded before session initialization. After investigating,
> we corrected the initialization order and verified the fix.

After, if the initialization order remains an important constraint:
> Load SECRET_KEY before initializing Flask sessions.

Otherwise, delete the passage entirely.

### 3. Current State Over History

Describe how the system works now.

Replace chronological narratives with current-state descriptions.

Update existing sections rather than appending progress reports.

Avoid "previously," "originally," and "we fixed" narratives
unless the history explains a current design decision.

Do not maintain a running development diary in project documentation.

### 4. Single Source of Truth

Each concept should have one authoritative description.

- Merge duplicate explanations.
- Update existing content instead of appending new sections.
- Reference authoritative documentation rather than copying it.
- Avoid restating information already clear from code or configuration.

Do not create additional documentation files without a clear purpose.

### 5. Information Value Per Token

Optimize for useful context, not document length alone.

Every retained statement should help a developer or agent:
- Understand the system.
- Operate or configure it.
- Modify it correctly.
- Avoid a known limitation or design mistake.
- Identify unresolved work.

Prefer concise statements over explanations of obvious behavior.

Do not:
- Repeat implementation details readily discoverable in code.
- Explain standard framework behavior without a project-specific reason.
- Retain speculative requirements or hypothetical edge cases.
- Add boilerplate, filler, or unnecessary background.
- Compress text so aggressively that its meaning becomes ambiguous.

Shorter is better only when the same useful information survives.

### 6. Preserve Enduring Design Rationale

Historical events are usually disposable.

Historical reasoning that constrains the current design is valuable.

Preserve decisions that explain:
- Why a non-obvious implementation exists.
- Why an apparently simpler alternative is unsuitable.
- Why a specific constraint must be maintained.
- What would break if an important design decision changed.

Example:

Keep:
> SMTP uses port 25 because the internal relay does not support
> authenticated submission.

Remove:
> We originally tried port 587 but encountered several connection
> errors before switching to port 25.

Prefer the current constraint over its debugging history.

Do not preserve rationale that no longer applies.

### 7. Accuracy Before Cleanup

Verify questionable claims against code, tests, and configuration
when available.

Do not:
- Assume documentation is correct because it already exists.
- Assume documentation is obsolete solely because it is old.
- Invent implementation details or undocumented requirements.
- Silently resolve contradictions without evidence.

Treat implementation as authoritative for observed behavior,
but preserve explicit requirements that the implementation
may not yet satisfy.

Flag unresolved contradictions rather than guessing.

### 8. Avoid Documentation Cruft

Apply the same principles used to simplify code:

| Code Hygiene | Documentation Hygiene |
|---|---|
| Remove dead code | Remove obsolete information |
| Remove unnecessary guards | Remove unnecessary caveats |
| Flatten control flow | Simplify explanations |
| Avoid speculative edge cases | Avoid speculative requirements |
| Consolidate duplicate logic | Consolidate duplicate documentation |
| Preserve intended behavior | Preserve technical meaning |

Do not introduce complexity without a demonstrated need.

Avoid:
- Defensive explanations for imaginary scenarios.
- Excessive qualifications that add no meaningful precision.
- Multiple sections describing the same behavior.
- Documentation structures more complex than the project requires.
- Elaborate scoring systems, review matrices, or audit machinery.

Complexity must justify its continued existence.

### 9. Preserve Important Context

Do not remove:
- Active requirements or unresolved decisions.
- Security-relevant constraints and warnings.
- Non-obvious architectural rationale.
- Required commands, configuration, or operational procedures.
- Known limitations that still affect the implementation.
- Information needed to prevent likely regressions.

Preserve intentionally historical records, such as changelogs
and architecture decision records, unless explicitly asked to
review their historical content.

When uncertain whether information remains necessary, verify
its relevance before deleting it.

### 10. Temporary vs. Persistent Context

Separate working notes from permanent project documentation.

Temporary notes may contain:
- Debugging observations and failed experiments.
- Implementation progress and intermediate results.
- Short-lived TODOs and investigation details.
- Test failures and troubleshooting steps.

Persistent documentation should contain:
- Current architecture and operational behavior.
- Active requirements and unresolved issues.
- Enduring constraints and design rationale.
- Configuration and maintenance instructions.

When work is complete:

1. Transfer enduring knowledge into existing documentation.
2. Remove resolved tasks and obsolete working notes.
3. Do not promote debugging history into permanent documentation.

Do not delete active working notes while they remain necessary
for ongoing work.

Temporary information should not become permanent merely
because an agent recorded it.

### 11. Concise Technical Writing

Apply STE-inspired clarity principles:

- Use short, direct sentences.
- Prefer active voice.
- Use consistent technical terminology.
- Remove filler, repetition, and unnecessary qualifiers.
- Use headings and lists only when they improve readability.
- Preserve technical identifiers, commands, paths, and literal values.
- Preserve meaningful conditions, uncertainty, and requirements.

Do not sacrifice accuracy for brevity.

Do not rewrite clear text merely to satisfy a stylistic preference.

## Review Process

1. Identify each document's purpose.
2. Distinguish temporary working notes from persistent documentation.
3. Identify obsolete, redundant, or inaccurate content.
4. Delete information without continuing relevance.
5. Consolidate duplicate descriptions.
6. Preserve active requirements and enduring design rationale.
7. Transfer useful knowledge from completed work into existing documentation.
8. Rewrite retained content for clarity and information density.
9. Verify important constraints and technical claims.
10. Remove cleanup commentary from the documentation.

Prefer editing existing documents over creating new ones.

Do not restructure documentation unless it improves navigation
or eliminates meaningful duplication.

## Decision Rule

For each section, ask:

"Would a developer or agent need this information to understand,
operate, maintain, or extend the project today?"

- **No:** Delete it unless it belongs to an intentional historical record.
- **Yes:** Keep it, then simplify where useful.
- **Uncertain:** Verify its relevance before deleting.

Do not generate a formal relevance score or audit table.

## Output

Edit documentation directly when authorized.

Preserve existing organization unless restructuring improves clarity.

Do not add:
- Cleanup summaries to the documentation.
- New historical narratives.
- Unnecessary headings or boilerplate.
- Speculative requirements or defensive caveats.
- Documentation explaining the documentation cleanup.

When reporting completion, briefly state:
- Material changes made.
- Important information intentionally preserved.
- Any unresolved accuracy concerns.

Do not produce detailed change logs unless requested.
