#!/usr/bin/env node
/**
 * CLI entry point for todo-sentry.
 * Scans a repository for TODO markers and prints results.
 */

import { scanRepo, ScanResult } from './engine';
import * as path from 'node:path';

interface Flags {
  root: string;
  markers?: string;
  extensions?: string;
  changedOnly: boolean;
  staleDays?: number;
  format?: string;
}

function parseArgs(args: string[]): Flags {
  const flags: Flags = {
    root: '.',
    changedOnly: false,
  };

  let i = 0;
  // Skip 'scan' subcommand if present
  if (args[0] === 'scan') {
    i = 1;
  }

  while (i < args.length) {
    const arg = args[i];
    switch (arg) {
      case '--root':
      case '-d':
        flags.root = args[++i] ?? '.';
        break;
      case '--markers':
        flags.markers = args[++i] ?? '';
        break;
      case '--ext':
      case '--extensions':
        flags.extensions = args[++i] ?? '';
        break;
      case '--changed-only':
      case '-c':
        flags.changedOnly = true;
        break;
      case '--stale-days':
        flags.staleDays = parseInt(args[++i] ?? '90', 10);
        break;
      case '--format':
        flags.format = args[++i] ?? 'text';
        break;
      default:
        // Treat first positional argument as root
        if (!flags.root || flags.root === '.') {
          flags.root = arg;
        }
        break;
    }
    i++;
  }

  return flags;
}

function formatText(result: ScanResult): string {
  if (result.entries.length === 0) {
    return 'No TODO markers found.\n';
  }

  let output = '';

  // Grouped by file
  output += '=== TODOs by File ===\n\n';
  for (const [file, fileEntries] of result.byFile) {
    output += `${file} (${fileEntries.length} marker${fileEntries.length === 1 ? '' : 's'}):\n`;
    for (const e of fileEntries) {
      const staleTag = e.isStale ? ' [STALE]' : '';
      const blameInfo = e.blame
        ? ` (${e.blame.author} · ${e.ageDays}d ago · ${e.blame.commitHash.slice(0, 7)})`
        : ' (no git blame)';
      output += `  - [${e.line}] ${e.marker}: ${e.text}${staleTag}${blameInfo}\n`;
    }
    output += '\n';
  }

  // Grouped by author
  output += '=== TODOs by Author ===\n\n';
  for (const [author, authorEntries] of result.byAuthor) {
    output += `${author} (${authorEntries.length} marker${authorEntries.length === 1 ? '' : 's'}):\n`;
    for (const e of authorEntries) {
      const staleTag = e.isStale ? ' [STALE]' : '';
      output += `  - ${e.file}:${e.line} [${e.marker}] ${e.text}${staleTag}\n`;
    }
    output += '\n';
  }

  // Summary
  output += `=== Summary ===\n`;
  output += `Total: ${result.total} markers\n`;
  output += `Files: ${result.byFile.size}\n`;
  output += `Authors: ${result.byAuthor.size}\n`;
  if (result.staleCount > 0) {
    output += `Stale: ${result.staleCount}\n`;
  }
  output += '\n';

  return output;
}

function formatMd(result: ScanResult): string {
  if (result.entries.length === 0) {
    return '# TODO Task List\n\nNo TODO markers found.\n';
  }

  let output = '# TODO Task List\n\n';

  // Summary section
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

function formatJson(entries: ScanResult['entries']): string {
  return JSON.stringify(entries, null, 2) + '\n';
}

async function main() {
  const args = process.argv.slice(2);
  const flags = parseArgs(args);

  const scanOptions: Parameters<typeof scanRepo>[0] = {
    root: flags.root,
    markers: flags.markers ? flags.markers.split(',').map(m => m.trim().toUpperCase()) : undefined,
    extensions: flags.extensions ? flags.extensions.split(',').map(e => e.startsWith('.') ? e : `.${e}`) : undefined,
    changedOnly: flags.changedOnly,
    staleDays: flags.staleDays,
  };

  const result = await scanRepo(scanOptions);

  const format = flags.format ?? 'text';
  if (format === 'json') {
    process.stdout.write(formatJson(result.entries));
  } else if (format === 'md') {
    process.stdout.write(formatMd(result));
  } else {
    process.stdout.write(formatText(result));
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
