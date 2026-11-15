/**
 * Core engine for scanning codebases for TODO markers.
 * Zero dependencies — uses Node.js child_process and fs only.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';

export interface TodoMarker {
  file: string;
  line: number;
  text: string;
  marker: string;
}

export interface BlameInfo {
  author: string;
  email: string;
  date: string;
  commitHash: string;
}

export interface TodoEntry extends TodoMarker {
  blame: BlameInfo | null;
  ageDays: number | null;
  isStale: boolean;
}

export interface ScanOptions {
  /** Root directory to scan (default: '.') */
  root?: string;
  /** Custom markers to detect (default: ['TODO', 'FIXME', 'HACK', 'XXX']) */
  markers?: string[];
  /** File extensions to include (default: all files) */
  extensions?: string[];
  /** Only scan files changed since HEAD */
  changedOnly?: boolean;
  /** Staleness threshold in days; entries older than this get isStale=true */
  staleDays?: number;
}

export interface ScanResult {
  /** All found TODO entries */
  entries: TodoEntry[];
  /** Total count */
  total: number;
  /** Count of stale entries */
  staleCount: number;
}

/** Default markers to search for */
export const DEFAULT_MARKERS = ['TODO', 'FIXME', 'HACK', 'XXX'];

/**
 * Build a regex pattern that matches standalone TODO/FIXME/HACK/XXX tokens.
 * Uses word boundaries to avoid false positives like "TODOLIST" or "FIXMEUP".
 */
export function buildMarkerPattern(markers: string[]): RegExp {
  const escaped = markers.map(m => m.toUpperCase()).sort((a, b) => b.length - a.length);
  return new RegExp(`\\b(${escaped.join('|')})\\b`, 'i');
}

/**
 * Recursively collect file paths under a directory.
 * Skips node_modules, .git, and build output directories.
 */
function collectFiles(dir: string, extensions: string[]): string[] {
  const files: string[] = [];
  const skipDirs = new Set(['node_modules', '.git', 'dist', 'build', 'out', '.next', '.nuxt']);

  function walk(current: string) {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return; // skip unreadable dirs
    }

    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);

      if (entry.isDirectory()) {
        if (skipDirs.has(entry.name)) continue;
        walk(fullPath);
      } else if (entry.isFile()) {
        // If extensions filter is provided, check extension
        if (extensions.length > 0) {
          const ext = path.extname(entry.name).toLowerCase();
          if (!extensions.includes(ext)) continue;
        }
        files.push(fullPath);
      }
    }
  }

  walk(dir);
  return files;
}

/**
 * Scan a single file for TODO markers.
 * Returns an array of TodoMarker objects.
 */
export function scanFile(filePath: string, pattern: RegExp): TodoMarker[] {
  const markers: TodoMarker[] = [];
  let content: string;

  try {
    content = fs.readFileSync(filePath, 'utf-8');
  } catch {
    return markers; // skip unreadable files
  }

  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = pattern.exec(line);
    if (match) {
      // Extract the matched marker (first capture group)
      const marker = match[1];
      // Trim the line text and strip leading/trailing whitespace
      const text = line.trim();
      markers.push({
        file: filePath,
        line: i + 1, // 1-based line numbers
        text,
        marker,
      });
    }
  }

  return markers;
}

/**
 * Scan a repository for TODO markers.
 * Returns structured results with file, line, text, and marker info.
 */
export async function scanRepo(options: ScanOptions = {}): Promise<ScanResult> {
  const {
    root = '.',
    markers = DEFAULT_MARKERS,
    extensions = [],
    changedOnly = false,
    staleDays = 90,
  } = options;

  const pattern = buildMarkerPattern(markers);
  const rootDir = path.resolve(root);

  // If only changed files mode, we'd use git diff here (step 9)
  // For now, scan all files
  let files: string[];

  if (changedOnly) {
    // Placeholder for git diff integration (step 9)
    files = [];
  } else {
    files = collectFiles(rootDir, extensions);
  }

  // Scan each file for markers
  const allMarkers: TodoMarker[] = [];
  for (const file of files) {
    const fileMarkers = scanFile(file, pattern);
    allMarkers.push(...fileMarkers);
  }

  // Build TodoEntry objects with blame info (step 3) and staleness (step 4)
  // For now, entries without blame info
  const entries: TodoEntry[] = allMarkers.map(m => ({
    ...m,
    blame: null,
    ageDays: null,
    isStale: false,
  }));

  return {
    entries,
    total: entries.length,
    staleCount: entries.filter(e => e.isStale).length,
  };
}
