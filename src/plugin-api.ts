/**
 * Plugin API — re-exports the todo-sentry engine for VS Code extension consumption.
 *
 * A VS Code extension can import this module to scan a workspace for TODO markers:
 *
 * ```ts
 * import { scanRepo, ScanOptions, ScanResult } from 'todo-sentry/src/plugin-api';
 *
 * // In an extension activation function:
 * const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '.';
 * const options: ScanOptions = { root: workspaceFolder, staleDays: 90 };
 * const result: ScanResult = scanRepo(options);
 *
 * // Display results in a TreeView or Markdown preview
 * console.log(`Found ${result.total} TODO markers in ${result.byFile.size} files`);
 * ```
 *
 * This module is intentionally a thin re-export layer so that the VS Code extension
 * codebase stays decoupled from the core engine implementation.
 */

// ── Import engine types for use in function signatures ────────────────────────

import type {
  TodoMarker,
  BlameInfo,
  TodoEntry,
  ScanOptions,
  ScanResult,
} from './engine';

// ── Re-export all engine types ────────────────────────────────────────────────

export type {
  TodoMarker,
  BlameInfo,
  TodoEntry,
  ScanOptions,
  ScanResult,
};

// ── Re-export all engine constants ────────────────────────────────────────────

export { DEFAULT_MARKERS } from './engine';

// ── Re-export all engine functions ────────────────────────────────────────────

import {
  buildMarkerPattern,
  scanFile,
  getBlameInfoForFile,
  batchGetBlameInfoForFiles,
  lookupBlame,
  calculateAgeDays,
  groupByFile,
  groupByAuthor,
  buildScanResult,
  scanRepo,
} from './engine';

export {
  buildMarkerPattern,
  scanFile,
  getBlameInfoForFile,
  batchGetBlameInfoForFiles,
  lookupBlame,
  calculateAgeDays,
  groupByFile,
  groupByAuthor,
  buildScanResult,
  scanRepo,
};

// ── VS Code extension helper ──────────────────────────────────────────────────

/**
 * Scan the current VS Code workspace and return a ScanResult.
 *
 * This helper is a convenience wrapper that resolves the workspace root
 * automatically. In a real VS Code extension, you would replace the
 * `getWorkspaceRoot()` call with `vscode.workspace.workspaceFolders`.
 *
 * @example
 * ```ts
 * import { scanWorkspace } from 'todo-sentry/src/plugin-api';
 *
 * const result = scanWorkspace({ staleDays: 60 });
 * // result.entries, result.byFile, result.byAuthor, etc.
 * ```
 *
 * @param options - Scan options (root is auto-resolved to the workspace folder).
 * @returns A ScanResult with all found TODO entries and grouping information.
 */
export function scanWorkspace(options: Omit<ScanOptions, 'root'> = {}): ScanResult {
  // In a real VS Code extension, replace this with:
  //   const folder = vscode.workspace.workspaceFolders?.[0];
  //   const root = folder?.uri.fsPath ?? '.';
  const root = '.';
  return scanRepo({ ...options, root });
}

/**
 * Format a ScanResult as a Markdown task list string.
 *
 * This is a convenience wrapper around the engine's formatting logic.
 * In a VS Code extension, you could use this to populate a Markdown preview
 * panel or write the result to a temporary file.
 *
 * @param result - The ScanResult to format.
 * @returns A Markdown string with `- [ ]` task list items grouped by file and author.
 */
export function formatResultAsMarkdown(result: ScanResult): string {
  if (result.entries.length === 0) {
    return '# TODO Task List\n\nNo TODO markers found.\n';
  }

  let output = '# TODO Task List\n\n';

  // Summary
  output += '## Summary\n\n';
  output += `- **Total:** ${result.total} markers\n`;
  output += `- **Files:** ${result.byFile.size}\n`;
  output += `- **Authors:** ${result.byAuthor.size}\n`;
  if (result.staleCount > 0) {
    output += `- **Stale:** ${result.staleCount}\n`;
  }
  output += '\n';

  // Grouped by file
  output += '## TODOs by File\n\n';
  for (const [file, fileEntries] of result.byFile) {
    output += `### ${file} (${fileEntries.length} marker${fileEntries.length === 1 ? '' : 's'})\n\n`;
    for (const e of fileEntries) {
      const staleTag = e.isStale ? ' [STALE]' : '';
      const blameInfo = e.blame
        ? ` (${e.blame.author} · ${e.ageDays}d ago · ${e.blame.commitHash.slice(0, 7)})`
        : ' (no git blame)';
      output += `- [ ] [${e.line}] ${e.marker}: ${e.text}${staleTag}${blameInfo}\n`;
    }
    output += '\n';
  }

  // Grouped by author
  output += '## TODOs by Author\n\n';
  for (const [author, authorEntries] of result.byAuthor) {
    output += `### ${author} (${authorEntries.length} marker${authorEntries.length === 1 ? '' : 's'})\n\n`;
    for (const e of authorEntries) {
      const staleTag = e.isStale ? ' [STALE]' : '';
      output += `- [ ] ${e.file}:${e.line} [${e.marker}] ${e.text}${staleTag}\n`;
    }
    output += '\n';
  }

  return output;
}
