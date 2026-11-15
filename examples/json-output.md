# JSON Output Examples

Structured JSON output for programmatic consumption by scripts, CI pipelines, or custom tooling.

## 1. Basic JSON Output

```bash
npx todo-sentry scan . --format json
```

**Output:**

```json
[
  {
    "file": "/path/to/src/engine.ts",
    "line": 2,
    "text": "* Core engine for scanning codebases for TODO markers.",
    "marker": "TODO",
    "blame": {
      "author": "Jarvis Sentry",
      "email": "sentry@example.com",
      "date": "2026-11-16T02:30:00.000Z",
      "commitHash": "bdd6216..."
    },
    "ageDays": 0,
    "isStale": false
  },
  {
    "file": "/path/to/src/cli.ts",
    "line": 4,
    "text": "* Scans a repository for TODO markers and prints results.",
    "marker": "TODO",
    "blame": {
      "author": "Jarvis Sentry",
      "email": "sentry@example.com",
      "date": "2026-11-16T02:30:00.000Z",
      "commitHash": "b5d0e02..."
    },
    "ageDays": 0,
    "isStale": false
  }
]
```

## 2. Save JSON to a File

```bash
npx todo-sentry scan . --format json > todos.json
```

## 3. JSON with Filtering

Scan only TypeScript files for TODO markers:

```bash
npx todo-sentry scan . --ext ts --markers TODO --format json > ts-todos.json
```

## 4. JSON with Staleness Filter

Find only stale TODOs (older than 90 days):

```bash
npx todo-sentry scan . --stale-days 90 --format json > stale-todos.json
```

## 5. Pipe JSON to jq for Filtering

Extract only stale entries:

```bash
npx todo-sentry scan . --format json | jq '.[] | select(.isStale == true)'
```

Extract TODOs by a specific author:

```bash
npx todo-sentry scan . --format json | jq '.[] | select(.blame.author == "Your Name")'
```

Count TODOs per file:

```bash
npx todo-sentry scan . --format json | jq 'group_by(.file) | map({file: .[0].file, count: length}) | sort_by(-.count)'
```

## 6. Use JSON in a Script

```bash
#!/bin/bash
# Count TODOs in the current repo
count=$(npx todo-sentry scan . --format json | jq 'length')
echo "Found $count TODO markers"

# List files with TODOs
npx todo-sentry scan . --format json | jq -r '.[].file' | sort -u
```

## 7. JSON Schema

Each entry in the JSON array follows this structure:

```typescript
interface TodoEntry {
  file: string;         // Absolute path to the file
  line: number;         // 1-based line number
  text: string;         // Full trimmed line text
  marker: string;       // Matched marker (e.g. "TODO", "FIXME")
  blame: {              // Git blame info, or null if untracked
    author: string;
    email: string;
    date: string;       // ISO 8601
    commitHash: string; // Full 40-char hash
  } | null;
  ageDays: number | null;  // Age in days, or null if no blame
  isStale: boolean;        // Whether entry exceeds staleness threshold
}
```
