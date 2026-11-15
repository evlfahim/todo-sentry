# todo-sentry — Usage Examples

This directory contains runnable examples demonstrating every mode of the `todo-sentry` CLI.

## Prerequisites

Install the CLI locally so `npx todo-sentry` works:

```bash
npm install
npm run build
```

All examples below assume you are in the project root directory.

---

## Quick Reference

| Example | Description | Command |
|---------|-------------|---------|
| [CLI Usage](cli-usage.md) | Basic scanning, filtering, and text output | `npx todo-sentry scan .` |
| [JSON Output](json-output.md) | Structured JSON for programmatic consumption | `npx todo-sentry scan . --format json` |
| [Markdown Task List](markdown-task-list.md) | Actionable `- [ ]` task list for triage | `npx todo-sentry scan . --format md` |
| [Changed Files](changed-files.md) | PR-focused scanning of only modified files | `npx todo-sentry scan . --changed-only` |

---

## Common Flags

| Flag | Short | Description | Example |
|------|-------|-------------|---------|
| `--root` / `-d` | | Directory to scan | `--root ./src` |
| `--markers` | | Comma-separated markers | `--markers TODO,FIXME` |
| `--ext` / `--extensions` | | Comma-separated extensions | `--ext ts,js` |
| `--changed-only` / `-c` | | Only scan changed files | `--changed-only` |
| `--stale-days` | | Staleness threshold (days) | `--stale-days 30` |
| `--format` | | Output format: `text`, `json`, `md` | `--format md` |

---

## Running the Examples

Each example file in this directory contains copy-pasteable commands. To run them:

```bash
# Text output (default)
npx todo-sentry scan .

# JSON output
npx todo-sentry scan . --format json

# Markdown task list
npx todo-sentry scan . --format md > todos.md

# Filtered scan
npx todo-sentry scan . --ext ts --markers TODO,FIXME

# Changed files only
npx todo-sentry scan . --changed-only

# Stale-only scan
npx todo-sentry scan . --stale-days 30
```
