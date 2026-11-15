# todo-sentry

> Zero-dependency CLI that scans codebases for TODO markers, correlates them with git blame for age and author, and exports a grouped Markdown task list for triage.

[![npm](https://img.shields.io/badge/npm-1.0.0-blue)](https://www.npmjs.com/package/todo-sentry)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue)](https://www.typescriptlang.org/)

## Table of Contents

- [Why todo-sentry?](#why-todo-sentry)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Usage](#usage)
  - [Basic Scanning](#basic-scanning)
  - [Filtering](#filtering)
  - [Output Formats](#output-formats)
  - [Changed Files Mode](#changed-files-mode)
  - [Staleness Thresholds](#staleness-thresholds)
- [Features](#features)
- [API Reference](#api-reference)
  - [ScanOptions](#scanoptions)
  - [ScanResult](#scanresult)
  - [TodoEntry](#todoentry)
  - [BlameInfo](#blameinfo)
  - [Functions](#functions)
- [VS Code Extension](#vs-code-extension)
  - [Using the Engine in a VS Code Extension](#using-the-engine-in-a-vs-code-extension)
  - [Creating a TreeView](#creating-a-treeview)
  - [Creating a Markdown Preview](#creating-a-markdown-preview)
  - [Full Extension Example](#full-extension-example)
- [Examples](#examples)
- [Development](#development)
- [License](#license)

---

## Why todo-sentry?

Existing tools like [tododebt](https://github.com/mwittlin/tododebt), [stale-todo](https://github.com/nicobailon/stale-todo), [todo-blame](https://github.com/awendland/todo-blame), and [todo-age](https://github.com/awendland/todo-age) provide flat inventories of TODO markers. **todo-sentry** goes further:

- **Grouped output** — Organizes TODOs by file and by author for structured triage and workload visibility.
- **Git blame integration** — Correlates every marker with its author, commit date, and commit hash.
- **Staleness detection** — Flags old TODOs with `[STALE]` based on a configurable threshold.
- **Multiple export formats** — Text, Markdown Task List (`- [ ]`), and JSON for immediate action.
- **PR-focused scanning** — `--changed-only` mode restricts scans to modified files.
- **Zero dependencies** — Uses only Node.js built-in modules (`fs`, `path`, `child_process`).
- **VS Code ready** — Core engine exported as a standalone module for plugin integration.

---

## Installation

### Global (CLI)

```bash
npm install -g todo-sentry
```

### Local (project dependency)

```bash
npm install --save-dev todo-sentry
```

### From source

```bash
git clone https://github.com/your-org/todo-sentry.git
cd todo-sentry
npm install
npm run build
```

---

## Quick Start

```bash
# Scan the current directory for TODO markers
npx todo-sentry scan .

# Export a Markdown task list
npx todo-sentry scan . --format md > todos.md

# Scan only TypeScript files, flagging TODOs older than 60 days
npx todo-sentry scan . --ext ts --stale-days 60

# Scan only changed files (for PR workflows)
npx todo-sentry scan . --changed-only
```

---

## Usage

### Basic Scanning

Scan the current directory (default):

```bash
npx todo-sentry scan .
```

Scan a specific directory:

```bash
npx todo-sentry scan ./src
npx todo-sentry scan . --root ./packages/core
```

### Filtering

Filter by file extension:

```bash
# Scan only TypeScript files
npx todo-sentry scan . --ext ts

# Scan multiple extensions
npx todo-sentry scan . --ext ts,js,jsx,tsx
```

Filter by marker type:

```bash
# Only TODO markers
npx todo-sentry scan . --markers TODO

# Multiple markers
npx todo-sentry scan . --markers TODO,FIXME,HACK
```

Combine filters:

```bash
npx todo-sentry scan . --ext ts --markers TODO,FIXME --stale-days 90
```

### Output Formats

**Text** (default) — Human-readable grouped output:

```bash
npx todo-sentry scan . --format text
```

**Markdown** — Task list with `- [ ]` items, grouped by file and author:

```bash
npx todo-sentry scan . --format md > todos.md
```

**JSON** — Structured data for programmatic consumption:

```bash
npx todo-sentry scan . --format json > todos.json
```

Pipe JSON through `jq` for filtering:

```bash
npx todo-sentry scan . --format json | jq '.[] | select(.isStale == true)'
npx todo-sentry scan . --format json | jq 'length'
npx todo-sentry scan . --format json | jq '[.[] | .marker] | group_by(.) | map({marker: .[0], count: length})'
```

### Changed Files Mode

Scan only files that have been modified, added, or are untracked since `HEAD`:

```bash
npx todo-sentry scan . --changed-only
```

Compare against a specific branch:

```bash
npx todo-sentry scan . --changed-only --base main
```

Combine with other flags:

```bash
npx todo-sentry scan . --changed-only --ext ts --markers TODO,FIXME --stale-days 30
```

### Staleness Thresholds

TODOs older than the threshold (default: 90 days) are flagged with `[STALE]`:

```bash
# Use default 90-day threshold
npx todo-sentry scan .

# Custom threshold: flag TODOs older than 30 days
npx todo-sentry scan . --stale-days 30

# Export only stale TODOs (combine with JSON and filter)
npx todo-sentry scan . --format json | jq '.[] | select(.isStale == true)'
```

---

## Features

| Feature | Description |
|---------|-------------|
| **Precise regex matching** | Standalone token matching for `TODO`, `FIXME`, `HACK`, `XXX` — avoids false positives like `TODOLIST` or `FIXMEUP`. |
| **Git blame integration** | Every marker is correlated with author name, email, commit date, and commit hash. |
| **Age calculation** | Computes the age of each TODO in days from the commit date. |
| **Staleness detection** | Flags old TODOs with `[STALE]` based on a configurable `--stale-days` threshold. |
| **Grouped output** | Results organized by file path and by author for triage and workload visibility. |
| **Multiple export formats** | Text, Markdown Task List (`- [ ]`), and JSON. |
| **Changed files mode** | `--changed-only` restricts scanning to modified paths — ideal for PR workflows. |
| **Zero dependencies** | Uses only Node.js built-in modules (`fs`, `path`, `child_process`). |
| **Custom markers** | `--markers BUG,WARN` to scan for custom marker keywords. |
| **Extension filtering** | `--ext ts,js` to limit scanning to specific file types. |
| **Batch git blame** | Efficient batch processing of git blame for large repositories. |
| **VS Code ready** | Core engine exported as a standalone module for plugin integration. |

---

## API Reference

The core engine is exported as a standalone module. Import it in your own scripts or VS Code extensions:

```typescript
import { scanRepo, ScanOptions, ScanResult } from 'todo-sentry/src/engine';
```

### ScanOptions

Configuration for the `scanRepo` function:

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `root` | `string` | `'.'` | Root directory to scan. |
| `markers` | `string[]` | `['TODO', 'FIXME', 'HACK', 'XXX']` | Custom markers to detect. |
| `extensions` | `string[]` | `[]` (all files) | File extensions to include, e.g. `['.ts', '.js']`. |
| `changedOnly` | `boolean` | `false` | Only scan files changed since `base`. |
| `base` | `string` | `'HEAD'` | Base ref to compare against when `changedOnly` is true. |
| `staleDays` | `number` | `90` | Staleness threshold in days. |

### ScanResult

Full scan result with grouping information:

| Property | Type | Description |
|----------|------|-------------|
| `entries` | `TodoEntry[]` | All found TODO entries. |
| `total` | `number` | Total count of entries. |
| `staleCount` | `number` | Count of stale entries. |
| `byFile` | `Map<string, TodoEntry[]>` | Entries grouped by file path. |
| `byAuthor` | `Map<string, TodoEntry[]>` | Entries grouped by author name. |

### TodoEntry

A TODO entry enriched with blame info and staleness:

| Property | Type | Description |
|----------|------|-------------|
| `file` | `string` | Absolute path to the file. |
| `line` | `number` | 1-based line number. |
| `text` | `string` | The full trimmed line text. |
| `marker` | `string` | The matched marker keyword. |
| `blame` | `BlameInfo \| null` | Git blame info, or null if not tracked. |
| `ageDays` | `number \| null` | Age in days, or null if no blame. |
| `isStale` | `boolean` | Whether the entry exceeds the staleness threshold. |

### BlameInfo

Git blame information for a line:

| Property | Type | Description |
|----------|------|-------------|
| `author` | `string` | Author name. |
| `email` | `string` | Author email. |
| `date` | `string` | Commit date as ISO 8601 string. |
| `commitHash` | `string` | Full 40-character commit hash. |

### Functions

| Function | Description |
|----------|-------------|
| `scanRepo(options)` | Scan a directory and return a `ScanResult`. |
| `scanFile(filePath, pattern)` | Scan a single file for markers, returns `TodoMarker[]`. |
| `getBlameInfoForFile(filePath)` | Get git blame info for a file (deprecated, use batch version). |
| `batchGetBlameInfoForFiles(rootDir, filePaths)` | Batch git blame for multiple files (recommended). |
| `groupByFile(entries)` | Group entries by file path. |
| `groupByAuthor(entries)` | Group entries by author name. |
| `buildScanResult(entries)` | Build a `ScanResult` from an array of `TodoEntry`. |
| `buildMarkerPattern(markers)` | Build a regex for marker matching. |
| `calculateAgeDays(dateStr)` | Calculate age in days from an ISO 8601 date string. |
| `getChangedFiles(rootDir, base)` | Get list of changed files relative to the repo root. |

---

## VS Code Extension

The core engine in `src/engine.ts` is designed to be consumed by VS Code extensions. The `src/plugin-api.ts` module re-exports the engine with additional convenience helpers.

### Using the Engine in a VS Code Extension

Install `todo-sentry` as a dependency in your extension:

```bash
cd your-vscode-extension
npm install todo-sentry
```

Import and use the engine in your extension code:

```typescript
import { scanRepo, ScanOptions, ScanResult } from 'todo-sentry/src/engine';

// In your extension activation:
export function activate(context: vscode.ExtensionContext) {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '.';
  
  const options: ScanOptions = {
    root: workspaceFolder,
    staleDays: 90,
    markers: ['TODO', 'FIXME', 'HACK', 'XXX'],
  };

  const result: ScanResult = scanRepo(options);
  
  console.log(`Found ${result.total} TODO markers in ${result.byFile.size} files`);
  
  // Access grouped results
  for (const [file, entries] of result.byFile) {
    console.log(`  ${file}: ${entries.length} markers`);
  }
}
```

### Creating a TreeView

Use the grouped results to populate a VS Code TreeView:

```typescript
import * as vscode from 'vscode';
import { scanRepo, ScanOptions, ScanResult, TodoEntry } from 'todo-sentry/src/engine';

class TodoTreeItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly tooltip?: string,
  ) {
    super(label, collapsibleState);
    this.tooltip = tooltip;
  }
}

class TodoTreeProvider implements vscode.TreeDataProvider<TodoTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<TodoTreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  refresh() {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '.';
    const result = scanRepo({ root: workspaceFolder, staleDays: 90 });
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: TodoTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: TodoTreeItem): Promise<TodoTreeItem[]> {
    if (element) {
      // Show entries under a file or author node
      return [];
    }
    
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '.';
    const result = scanRepo({ root: workspaceFolder, staleDays: 90 });
    
    // Group by file
    const items: TodoTreeItem[] = [];
    for (const [file, entries] of result.byFile) {
      items.push(
        new TodoTreeItem(
          `${file} (${entries.length})`,
          vscode.TreeItemCollapsibleState.Expanded,
          `${entries.length} TODO markers`,
        )
      );
    }
    return items;
  }
}

// Register the TreeView in activate():
const provider = new TodoTreeProvider();
const treeView = vscode.window.createTreeView('todoSentryTreeView', { treeDataProvider: provider });
```

### Creating a Markdown Preview

Use the `formatResultAsMarkdown` helper from `plugin-api.ts` to populate a Markdown preview panel:

```typescript
import * as vscode from 'vscode';
import { scanRepo, ScanOptions } from 'todo-sentry/src/engine';
import { formatResultAsMarkdown } from 'todo-sentry/src/plugin-api';

export function activate(context: vscode.ExtensionContext) {
  const disposable = vscode.commands.registerCommand('todo-sentry.showPreview', () => {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '.';
    const result = scanRepo({ root: workspaceFolder, staleDays: 90 });
    const markdown = formatResultAsMarkdown(result);
    
    const panel = vscode.window.createWebviewPanel(
      'todoSentryPreview',
      'TODO Task List',
      vscode.ViewColumn.Two,
      { enableScripts: false },
    );
    
    panel.webview.html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <style>
            body { padding: 20px; font-family: -apple-system, sans-serif; }
            details { margin: 8px 0; }
            summary { cursor: pointer; font-weight: bold; }
          </style>
        </head>
        <body>
          ${markdown}
        </body>
      </html>
    `;
  });
  
  context.subscriptions.push(disposable);
}
```

### Full Extension Example

A minimal VS Code extension that adds a TODO scan command:

```typescript
// extension.ts
import * as vscode from 'vscode';
import { scanRepo, ScanOptions, ScanResult } from 'todo-sentry/src/engine';

export function activate(context: vscode.ExtensionContext) {
  const disposable = vscode.commands.registerCommand('todo-sentry.scan', async () => {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceFolder) {
      vscode.window.showErrorMessage('No workspace folder open.');
      return;
    }

    const result: ScanResult = scanRepo({ root: workspaceFolder, staleDays: 90 });

    if (result.total === 0) {
      vscode.window.showInformationMessage('No TODO markers found.');
      return;
    }

    // Show a quick pick of files with TODOs
    const files = [...result.byFile.keys()];
    const selection = await vscode.window.showQuickPick(files, {
      placeHolder: `Select a file (${result.total} TODOs found)`,
    });

    if (selection) {
      const entries = result.byFile.get(selection) ?? [];
      const lines = entries.map(e => `Line ${e.line}: ${e.text}`);
      vscode.window.showInformationMessage(
        `${selection}: ${entries.length} TODO(s)\n${lines.join('\n')}`
      );
    }
  });

  context.subscriptions.push(disposable);
}

export function deactivate() {}
```

```json
// package.json (VS Code extension)
{
  "name": "my-todo-sentry-extension",
  "version": "0.0.1",
  "engines": { "vscode": "^1.85.0" },
  "activationEvents": [],
  "main": "./out/extension.js",
  "contributes": {
    "commands": [
      {
        "command": "todo-sentry.scan",
        "title": "TODO Sentry: Scan for TODOs",
        "category": "TODO Sentry"
      }
    ]
  },
  "dependencies": {
    "todo-sentry": "file:../todo-sentry"
  }
}
```

---

## Examples

Comprehensive usage examples are in the [`examples/`](examples/) directory:

| Example | Description |
|---------|-------------|
| [CLI Usage](examples/cli-usage.md) | Basic scanning, directory targeting, extension filtering, marker filtering, combined filters, staleness thresholds, and custom output directories. |
| [JSON Output](examples/json-output.md) | Structured JSON output, saving to file, filtering, `jq` piping, script integration, and full type schema. |
| [Markdown Task List](examples/markdown-task-list.md) | Markdown task list output, saving to file, filtering, staleness flags, issue tracking integration, VS Code preview, custom markers, and team triage workflows. |
| [Changed Files](examples/changed-files.md) | Changed files mode, extension/marker/staleness filtering, branch comparison, PR workflow integration, and combined scans. |

---

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test

# Type-check
npm run lint

# Full check (lint + tests)
npm run check

# Clean build output
npm run clean
```

### Project Structure

```
src/
  cli.ts          # CLI entry point (arg parsing, formatting)
  engine.ts       # Core scanning engine (public API)
  plugin-api.ts   # Re-exports engine + VS Code helpers
test/
  engine.test.ts  # Engine unit tests
  cli.test.ts     # CLI integration tests
examples/         # Usage examples
```

### Zero-Dependency Guarantee

todo-sentry has **zero production dependencies**. It uses only Node.js built-in modules:

- `fs` — File system operations
- `path` — Path manipulation
- `child_process` — Git command execution

The only dependencies in `package.json` are dev dependencies (`typescript`, `vitest`, `@types/node`) used for building and testing.

---

## License

ISC
