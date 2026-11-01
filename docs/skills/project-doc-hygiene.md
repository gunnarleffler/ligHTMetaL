---
name: project-doc-hygiene
description: Clean up project documentation by removing outdated information, capturing enduring knowledge, and reducing unnecessary words, tokens, and future reading effort. Preserve accurate, useful guidance for humans and LLMs, including purposeful repetition where it improves correct use.
version: 1.5.0
---

# Project Documentation Hygiene

Remove outdated information, capture important knowledge, and reduce
future reading effort for humans and LLMs. Optimize for correct use and
understanding with fewer words and tokens, not minimum length alone.

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

## Audience and Document Roles

Follow the project's existing documentation conventions. Identify documents
by purpose, not filename alone. Include agent-facing guides such as `llms.txt`
when present, not only Markdown files.

Common roles include:
- `README.md`: Human-facing introduction, setup, and normal workflows.
- `PROJECT_NOTES.md`: Enduring development knowledge, architecture,
  constraints, design rationale, and unresolved work. Not a development diary.
- `llms.txt`: Operational entry point for LLMs using the project. Keep it
  short, actionable, and useful for completing common tasks correctly.

These are examples, not a required file layout. Equivalent roles may use
other names or span several documents. Readers may consult multiple files.

Preserve useful topic-specific documentation, such as architecture guides,
operational runbooks, tutorials, and API references. Do not collapse a useful
documentation tree into a few large files merely to reduce file count.
Conversely, do not split content or create files merely to satisfy a template.
Choose organization that reduces effort to find, understand, and maintain information.

### LLM Operating Guidance

Prioritize information an LLM cannot safely infer:
- Where to start and where authoritative details live.
- Common tasks, representative commands, prerequisites, and verification steps.
- Which artifacts are authoritative evidence, configuration, drafts, or generated output.
- Project-specific result meanings, uncertainty, and easily confused distinctions.
- Safety boundaries and actions requiring human authorization.

Intentional redundancy in `llms.txt` is acceptable when it prevents mistakes
or avoids consulting several documents for a common task. Keep repeated
guidance consistent with its authoritative source. Do not remove essential
instructions or safeguards solely because they appear elsewhere.

Prefer CLI help over exhaustive option lists. Link to deeper documentation
with a brief indication of when to read it. Remove repetition within the
guide, incidental implementation details, and low-value examples before
removing consequential constraints. Judge brevity by successful task
completion per token, not file length alone.

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
- Redundant explanations and duplicated instructions that serve no audience-specific purpose.
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

- Merge duplicate explanations that serve no distinct purpose.
- Update existing content instead of appending new sections.
- Prefer references to authoritative documentation over copying it.
- Allow concise repetition where a document's audience needs it to act correctly,
  especially in `llms.txt`; keep all copies consistent.
- Avoid restating information already clear from code or configuration.

A cleanup request authorizes edits to existing documentation within scope,
including removal of obsolete passages, but not creation or deletion of whole
files. Unless explicitly authorized, defer file creation, deletion, and moves
that require either operation until approval. Continue other unambiguous edits.

At the end of the report, request approval for each proposed file operation:
- Creation: state the path, purpose, and why existing documents are insufficient.
- Deletion: state the path, why the file is unnecessary, and where any useful
  content will remain or be transferred.

Make the case for each operation; a general cleanup request is not approval.

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

If a contradiction cannot be resolved from available evidence, leave the
contested content unchanged and continue independent cleanup. At the end of
the report, ask a focused question that identifies the contradiction and the
decision needed. Do not guess or add speculative caveats to the documentation.

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

1. Identify the existing documentation structure, each document's audience and purpose,
   and the common tasks it supports.
2. Distinguish temporary working notes from persistent documentation.
3. Identify obsolete, redundant, or inaccurate content.
4. Delete information without continuing relevance.
5. Consolidate unnecessary duplication; verify purposeful repetition stays consistent.
6. Preserve active requirements and enduring design rationale.
7. Transfer useful knowledge from completed work into existing documentation.
8. Rewrite retained content to reduce words, tokens, and effort needed to find and use it.
9. Verify important constraints and technical claims.
10. Remove cleanup commentary from the documentation.

Prefer editing existing documents over creating new ones.

Do not restructure documentation unless it improves navigation
or eliminates meaningful duplication. Keep links and entry points accurate
when moving, merging, or removing content. Obtain approval before creating
or deleting files as part of restructuring; defer those operations and request
permission at the end of the report.

## Decision Rule

For each section, ask:

"Would a developer or agent need this information to understand,
operate, maintain, or extend the project today?"

- **No:** Delete it unless it belongs to an intentional historical record.
- **Yes:** Keep it, then simplify where useful.
- **Uncertain:** Verify its relevance before deleting.

Do not generate a formal relevance score or audit table.

## Output

When asked to clean up documentation, make clear, supported edits to existing
files automatically. A review-only request does not authorize edits. Do not
pause the whole cleanup for isolated ambiguity or unapproved file operations;
defer only the affected changes.

Preserve existing organization unless restructuring improves clarity.

Do not add:
- Cleanup summaries to the documentation.
- New historical narratives.
- Unnecessary headings or boilerplate.
- Speculative requirements or defensive caveats.
- Documentation explaining the documentation cleanup.

After completing the unambiguous cleanup, briefly report:
- Material changes made.
- Important information intentionally preserved.
- Unresolved accuracy concerns and deferred changes, if any.

End the report with focused questions about unresolved ambiguities and requests
for permission to create or delete files, including the case for each operation.
Group related questions and ask only for decisions needed to proceed. Do not
repeat questions already answered or request permission for routine in-scope edits.

Use the answers and approvals for a follow-up pass. Do not treat proposed or
deferred changes as completed. If nothing needs clarification or approval,
finish with the brief report alone.

Do not produce detailed change logs unless requested.
