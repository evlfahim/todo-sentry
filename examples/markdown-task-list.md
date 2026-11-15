# Markdown Task List Examples

Actionable `- [ ]` task list output for triage, project management, and team collaboration.

## 1. Basic Markdown Output

```bash
npx todo-sentry scan . --format md
```

**Output:**

```markdown
# TODO Task List

## Summary

- **Total:** 12 markers
- **Files:** 3
- **Authors:** 1

## TODOs by File

### src/engine.ts (5 markers)

- [ ] [2] TODO: * Core engine for scanning codebases for TODO markers. (Jarvis Sentry · 0d ago · bdd6216)
- [ ] [27] TODO: /** A raw TODO marker found in a file. */ (Jarvis Sentry · 0d ago · 4620d93)
...

### src/cli.ts (3 markers)

- [ ] [3] todo: * CLI entry point for todo-sentry. (Jarvis Sentry · 0d ago · b5d0e02)
...

## TODOs by Author

### Jarvis Sentry (8 markers)

- [ ] src/engine.ts:2 [TODO] * Core engine for scanning codebases for TODO markers.
...
```

## 2. Save Markdown to a File

```bash
npx todo-sentry scan . --format md > todos.md
```

## 3. Markdown with Filtering

Scan only TypeScript files for TODO and FIXME markers:

```bash
npx todo-sentry scan . --ext ts --markers TODO,FIXME --format md > ts-todo-list.md
```

## 4. Markdown with Staleness Flags

Flag old TODOs with `[STALE]` tags:

```bash
npx todo-sentry scan . --stale-days 30 --format md > stale-todo-list.md
```

## 5. Markdown for Issue Tracking

The `- [ ]` checkboxes are compatible with GitHub, GitLab, and other Markdown-based issue trackers. Save and commit the output:

```bash
npx todo-sentry scan . --format md > docs/TODOS.md
git add docs/TODOS.md
git commit -m "docs: update TODO task list"
```

## 6. Markdown with VS Code Preview

After generating the task list, open it in VS Code's Markdown preview:

```bash
npx todo-sentry scan . --format md > todos.md
code todos.md   # Opens in VS Code
# Then press Ctrl+Shift+V (or Cmd+Shift+V on Mac) to preview
```

## 7. Markdown with Custom Markers

Include custom markers like BUG:

```bash
npx todo-sentry scan . --markers TODO,FIXME,HACK,XXX,BUG --format md > full-todo-list.md
```

## 8. Markdown for Team Triage

Generate a shared task list for team review:

```bash
npx todo-sentry scan . --format md > shared/TODOS-$(date +%Y-%m-%d).md
```
