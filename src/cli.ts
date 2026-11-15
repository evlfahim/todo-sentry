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

function formatText(entries: ScanResult['entries']): string {
  if (entries.length === 0) {
    return 'No TODO markers found.\n';
  }

  // Group by file
  const byFile = new Map<string, ScanResult['entries']>();
  for (const entry of entries) {
    const list = byFile.get(entry.file) ?? [];
    list.push(entry);
    byFile.set(entry.file, list);
  }

  let output = '';
  for (const [file, fileEntries] of byFile) {
    output += `\n${file}:\n`;
    for (const e of fileEntries) {
      const staleTag = e.isStale ? ' [STALE]' : '';
      const blameInfo = e.blame
        ? ` (${e.blame.author} · ${e.ageDays}d ago · ${e.blame.commitHash.slice(0, 7)})`
        : ' (no git blame)';
      output += `  - [${e.line}] ${e.marker}: ${e.text}${staleTag}${blameInfo}\n`;
    }
  }

  output += `\nTotal: ${entries.length} markers`;
  if (entries.some((e: ScanResult['entries'][number]) => e.isStale)) {
    const staleCount = entries.filter((e: ScanResult['entries'][number]) => e.isStale).length;
    output += `, ${staleCount} stale`;
  }
  output += '\n';

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
  const entries = result.entries;

  const format = flags.format ?? 'text';
  if (format === 'json') {
    process.stdout.write(formatJson(entries));
  } else {
    process.stdout.write(formatText(entries));
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
