# CLI Usage Examples

Basic scanning, filtering, and text output with `todo-sentry`.

## 1. Scan the Current Directory

The simplest way to scan a repository for all default markers (TODO, FIXME, HACK, XXX):

```bash
npx todo-sentry scan .
```

**Output:** Text format grouped by file and author, with git blame info (author, age, commit hash).

```
=== TODOs by File ===

src/engine.ts (5 markers):
  - [2] TODO: * Core engine for scanning codebases for TODO markers. (Jarvis Sentry · 0d ago · bdd6216)
  - [27] TODO: /** A raw TODO marker found in a file. */ (Jarvis Sentry · 0d ago · 4620d93)
  ...

=== TODOs by Author ===

Jarvis Sentry (12 markers):
  - src/engine.ts:2 [TODO] * Core engine for scanning codebases for TODO markers.
  ...

=== Summary ===
Total: 12 markers
Files: 3
Authors: 1
```

## 2. Scan a Specific Directory

```bash
npx todo-sentry scan ./src
```

## 3. Filter by File Extension

Scan only TypeScript files:

```bash
npx todo-sentry scan . --ext ts
```

Scan only JavaScript and TypeScript files:

```bash
npx todo-sentry scan . --ext ts,js
```

## 4. Filter by Marker Type

Scan only TODO and FIXME markers:

```bash
npx todo-sentry scan . --markers TODO,FIXME
```

Scan only HACK markers:

```bash
npx todo-sentry scan . --markers HACK
```

## 5. Combine Filters

Scan only TypeScript files for TODO and FIXME markers:

```bash
npx todo-sentry scan . --ext ts --markers TODO,FIXME
```

## 6. Set Staleness Threshold

Flag TODOs older than 30 days as `[STALE]`:

```bash
npx todo-sentry scan . --stale-days 30
```

Flag TODOs older than 180 days as `[STALE]`:

```bash
npx todo-sentry scan . --stale-days 180
```

## 7. Custom Output Directory

Scan a specific project directory:

```bash
npx todo-sentry scan ./my-project --ext ts,js
```
