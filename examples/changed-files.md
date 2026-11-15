# Changed Files Mode Examples

Scan only files that have been modified since a reference point — ideal for PR workflows and code reviews.

## 1. Scan Only Changed Files

Scan files modified since HEAD (the latest commit):

```bash
npx todo-sentry scan . --changed-only
```

## 2. Save Changed-Files Output to a File

```bash
npx todo-sentry scan . --changed-only --format md > pr-todos.md
```

## 3. Changed Files with Extension Filter

Scan only changed TypeScript files:

```bash
npx todo-sentry scan . --changed-only --ext ts
```

## 4. Changed Files with Marker Filter

Scan only changed files for TODO and FIXME markers:

```bash
npx todo-sentry scan . --changed-only --markers TODO,FIXME
```

## 5. Changed Files with Staleness

Flag stale TODOs in changed files:

```bash
npx todo-sentry scan . --changed-only --stale-days 30
```

## 6. Compare Against a Specific Branch

Scan files changed relative to the `main` branch:

```bash
npx todo-sentry scan . --changed-only --base main
```

## 7. Compare Against a Specific Commit

Scan files changed relative to a specific commit hash:

```bash
npx todo-sentry scan . --changed-only --base abc1234
```

## 8. PR Workflow Integration

Add a pre-merge check that scans only changed files:

```bash
#!/bin/bash
# .github/scripts/pr-todo-check.sh
CHANGED_TODOS=$(npx todo-sentry scan . --changed-only --format json)
COUNT=$(echo "$CHANGED_TODOS" | jq 'length')

if [ "$COUNT" -gt 0 ]; then
  echo "⚠️  Found $COUNT TODO markers in changed files:"
  echo "$CHANGED_TODOS" | jq -r '.[] | "- \(.file):\(.line) [\(.marker)] \(.text)"'
  exit 1
else
  echo "✅ No TODO markers in changed files."
  exit 0
fi
```

## 9. Changed Files with JSON Output

Get structured JSON for only changed files:

```bash
npx todo-sentry scan . --changed-only --format json > pr-todos.json
```

## 10. Combined: Changed Files + Extension + Marker + Staleness

A comprehensive PR-focused scan:

```bash
npx todo-sentry scan . \
  --changed-only \
  --base main \
  --ext ts,js \
  --markers TODO,FIXME \
  --stale-days 30 \
  --format md > pr-review.md
```
