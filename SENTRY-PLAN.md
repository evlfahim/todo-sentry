# todo-sentry

> Zero-dependency CLI that scans codebases for TODO markers, correlates them with git blame for age and author, and exports a grouped Markdown task list for triage, with a clean core API ready for VS Code extension integration.

Task: Code TODO and FIXME collector: scans a repo, groups by file and author (git blame), shows age, exports to a markdown task list; later a VS Code plugin #plugin #vscode

## Why it is better than what exists
- tododebt: Adds grouped markdown task list export and author grouping, not just flat inventory.
- stale-todo: Runs locally with rich export and file/author grouping, not just CI annotations.
- todo-blame: Provides structured markdown task list and hierarchical grouping, not just flat text/JSON.
- todo-age: Includes author grouping and actionable task list export, not just age listing.

## Features
- Precise regex scanning for TODO/FIXME/HACK/XXX with standalone token matching to avoid false positives.
- Git blame integration for age, author, and commit hash on every marker.
- Group output by file and author for structured triage and workload visibility.
- Export to Markdown Task List (- [ ]) and JSON formats for immediate action.
- Staleness thresholds with [STALE] flags and filtering via --stale-days.
- Only changed files mode using git diff for PR-focused scanning.
- Zero dependencies using Node.js child_process and native modules.
- Core engine exported as a standalone module for VS Code plugin consumption.
- Custom markers and file extension filtering.
- Fast batch git blame execution for large repositories.

## Stack
TypeScript, Node.js (Zero Dependencies via child_process and fs), Vitest

## Becoming a plugin
Core engine in src/engine.ts exports scanRepo function; VS Code plugin imports this module to run scans in the background and display results in a TreeView or Markdown preview.

## Steps
- [x] 1. Initialize TypeScript project with zero dependencies, configure Vitest, and verify build/test pipeline with npm test.
- [x] 2. Implement regex-based scanner in src/engine.ts that extracts TODO/FIXME/HACK/XXX markers with line numbers and text, passing unit tests.
- [x] 3. Add git blame integration to src/engine.ts that fetches author, date, and commit hash for each marked line, verifying output with node dist/cli.js scan .
- [x] 4. Implement age calculation logic and staleness threshold filtering, enabling --stale-days flag to flag old comments.
- [x] 5. Build grouping logic to organize results by file and author, ensuring output structure supports hierarchical views.
- [ ] 6. Implement Markdown Task List formatter that exports grouped results as actionable - [ ] items, verified by node dist/cli.js scan . --format md > todos.md.
- [ ] 7. Add JSON output format and CLI argument parsing for markers, extensions, and output format, passing integration tests.
- [ ] 8. Refactor src/engine.ts to export a clean ScanOptions interface and scanRepo function, isolating core logic from CLI.
- [ ] 9. Implement only changed files mode using git diff to restrict scanning to modified paths, useful for PR workflows.
- [ ] 10. Add support for custom markers and file extensions via CLI flags, verifying with node dist/cli.js scan . --markers BUG --ext py.
- [ ] 11. Optimize git blame performance by batching file paths and handling errors gracefully for unreadable files or non-git dirs.
- [ ] 12. Create a stub src/plugin-api.ts that re-exports the engine, demonstrating how a VS Code extension would import and call scanRepo.
- [ ] 13. Run full test suite and linting checks to ensure code quality and zero-dependency compliance.
- [ ] 14. Add executable permissions and package bin configuration, verifying npx todo-sentry scan . works globally.
- [ ] 15. Write comprehensive usage examples in examples/ directory covering CLI, JSON, MD, and changed-files modes.
- [ ] 16. Write README.md with installation, usage, features, and a dedicated section explaining how to wrap src/engine.ts into a VS Code plugin.
