/**
 * Core engine for scanning codebases for TODO markers.
 * Zero dependencies — uses Node.js child_process and fs only.
 *
 * This module exports a clean public API for programmatic use:
 *   - scanRepo(options) — scan a directory and return a ScanResult
 *   - scanFile(filePath, pattern) — scan a single file for markers
 *   - getBlameInfoForFile(filePath) — get git blame info for a file
 *   - lookupBlame(cache, filePath, line) — lookup blame with caching
 *   - groupByFile(entries) — group entries by file path
 *   - groupByAuthor(entries) — group entries by author name
 *   - buildScanResult(entries) — build a ScanResult from entries
 *   - buildMarkerPattern(markers) — build a regex for marker matching
 *   - calculateAgeDays(dateStr) — calculate age in days from an ISO date
 *
 * A VS Code extension can import this module directly:
 *   import { scanRepo } from 'todo-sentry/src/engine';
 *   const result = await scanRepo({ root: workspaceFolder });
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';

// ── Public Types ──────────────────────────────────────────────────────────────

/** A raw TODO marker found in a file. */
export interface TodoMarker {
  /** Absolute path to the file containing the marker. */
  file: string;
  /** 1-based line number. */
  line: number;
  /** The full trimmed line text. */
  text: string;
  /** The matched marker keyword (e.g. "TODO", "FIXME"). */
  marker: string;
}

/** Git blame information for a line. */
export interface BlameInfo {
  /** Author name. */
  author: string;
  /** Author email. */
  email: string;
  /** Commit date as ISO 8601 string. */
  date: string;
  /** Full 40-character commit hash. */
  commitHash: string;
}

/** A TODO entry enriched with blame info and staleness. */
export interface TodoEntry extends TodoMarker {
  /** Git blame info, or null if the file is not tracked. */
  blame: BlameInfo | null;
  /** Age in days from the commit date, or null if no blame. */
  ageDays: number | null;
  /** Whether the entry exceeds the staleness threshold. */
  isStale: boolean;
}

/** Options for the scanRepo function. */
export interface ScanOptions {
  /** Root directory to scan (default: '.'). */
  root?: string;
  /** Custom markers to detect (default: ['TODO', 'FIXME', 'HACK', 'XXX']). */
  markers?: string[];
  /** File extensions to include (default: all files). E.g. ['.ts', '.js']. */
  extensions?: string[];
  /** Only scan files changed since HEAD (default: false). */
  changedOnly?: boolean;
  /** Base ref to compare against when changedOnly is true (default: 'HEAD'). */
  base?: string;
  /** Staleness threshold in days; entries older than this get isStale=true (default: 90). */
  staleDays?: number;
}

/** Full scan result with grouping information. */
export interface ScanResult {
  /** All found TODO entries. */
  entries: TodoEntry[];
  /** Total count of entries. */
  total: number;
  /** Count of stale entries. */
  staleCount: number;
  /** Entries grouped by file path. */
  byFile: Map<string, TodoEntry[]>;
  /** Entries grouped by author name. */
  byAuthor: Map<string, TodoEntry[]>;
}

// ── Constants ─────────────────────────────────────────────────────────────────

/** Default markers to search for. */
export const DEFAULT_MARKERS = ['TODO', 'FIXME', 'HACK', 'XXX'];

// ── Public Functions ──────────────────────────────────────────────────────────

/**
 * Build a regex pattern that matches standalone TODO/FIXME/HACK/XXX tokens.
 * Uses word boundaries to avoid false positives like "TODOLIST" or "FIXMEUP".
 */
export function buildMarkerPattern(markers: string[]): RegExp {
  const escaped = markers.map(m => m.toUpperCase()).sort((a, b) => b.length - a.length);
  return new RegExp(`\\b(${escaped.join('|')})\\b`, 'i');
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
      const marker = match[1];
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
 * Run git blame --line-porcelain on a file and return a map of line number -> BlameInfo.
 * Returns an empty map if git is not available or the file is not tracked.
 *
 * @deprecated Use batchGetBlameInfoForFiles() for better performance when processing multiple files.
 * Kept for backward compatibility.
 */
export function getBlameInfoForFile(filePath: string): Map<number, BlameInfo> {
  try {
    const output = execFileSync('git', ['blame', '--line-porcelain', '--', filePath], {
      cwd: path.dirname(filePath),
      timeout: 10000,
      encoding: 'utf-8',
    });
    return parseBlamePorcelain(output);
  } catch {
    // Not a git repo, file not tracked, or git not installed
    return new Map();
  }
}

/**
 * Check if a file exists and is readable.
 */
function isFileReadable(filePath: string): boolean {
  try {
    return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

/**
 * Batch git blame for multiple files in a single git invocation.
 *
 * This is significantly faster than calling git blame once per file because
 * it avoids spawning a new child process for each file. Git blame accepts
 * multiple file paths and produces combined porcelain output.
 *
 * @param rootDir - Absolute path to the git repository root.
 * @param filePaths - Array of absolute file paths to get blame info for.
 * @returns A map where each key is an absolute file path and the value is
 *          a map of line number -> BlameInfo. Unreadable or untracked files
 *          are silently skipped.
 */
export function batchGetBlameInfoForFiles(
  rootDir: string,
  filePaths: string[],
): Map<string, Map<number, BlameInfo>> {
  const result = new Map<string, Map<number, BlameInfo>>();

  // Filter to only existing, readable files
  const readableFiles = filePaths.filter(isFileReadable);

  if (readableFiles.length === 0) {
    return result;
  }

  // Get all tracked files in the repo once (single git call)
  let trackedFiles: Set<string>;
  try {
    const output = execFileSync('git', ['ls-files'], {
      cwd: rootDir,
      timeout: 5000,
      encoding: 'utf-8',
    }).trim();
    trackedFiles = new Set(output.split('\n').filter(p => p.length > 0));
  } catch {
    // Not a git repo or git ls-files failed — skip blame entirely
    return result;
  }

  // Filter input files to only those that are tracked
  const relativePaths: string[] = [];
  for (const absPath of readableFiles) {
    const relPath = path.relative(rootDir, absPath);
    if (trackedFiles.has(relPath)) {
      relativePaths.push(relPath);
    }
  }

  if (relativePaths.length === 0) {
    return result;
  }

  try {
    // Single git blame invocation for all tracked files — much faster than per-file calls
    const output = execFileSync('git', ['blame', '--line-porcelain', '--', ...relativePaths], {
      cwd: rootDir,
      timeout: 30000,
      encoding: 'utf-8',
    });

    // Parse combined porcelain output, tracking which file each record belongs to
    const parsed = parseBlamePorcelainForFiles(output, rootDir, relativePaths);
    for (const [absPath, lineMap] of parsed) {
      result.set(absPath, lineMap);
    }
  } catch {
    // Git blame failed — could be non-git dir, missing files, etc.
    // Return whatever we have so far (empty map)
  }

  return result;
}

/**
 * Parse porcelain blame output that was generated for multiple files.
 * Git blame with multiple files interleaves records from each file.
 * The first file's records appear before the first "filename" line.
 * Each subsequent file is preceded by a "filename <path>" line.
 *
 * @param output - Combined porcelain blame output from git blame with multiple files.
 * @param rootDir - Root directory to convert relative paths to absolute.
 * @param relativePaths - The relative file paths that were passed to git blame, in order.
 * @returns Map of absolute file path -> line number -> BlameInfo.
 */
function parseBlamePorcelainForFiles(
  output: string,
  rootDir: string,
  relativePaths: string[],
): Map<string, Map<number, BlameInfo>> {
  const result = new Map<string, Map<number, BlameInfo>>();
  const lines = output.split('\n');
  let currentFileIndex = 0; // index into relativePaths
  let current: PorcelainLine | null = null;

  // Map from index to absolute path
  const indexToAbsPath = relativePaths.map(p => path.resolve(rootDir, p));

  for (const line of lines) {
    // Detect file boundary — git blame outputs "filename <path>" between file groups
    if (/^filename\s/.test(line)) {
      // Save previous record if any
      if (current) {
        const absPath = indexToAbsPath[currentFileIndex];
        if (absPath) {
          const date = new Date(current.authorTime * 1000);
          const lineMap = result.get(absPath) ?? new Map();
          lineMap.set(current.line, {
            author: current.author,
            email: current.email,
            date: date.toISOString(),
            commitHash: current.hash,
          });
          result.set(absPath, lineMap);
        }
      }

      // Advance to next file
      currentFileIndex++;
      current = null;
      continue;
    }

    // New record starts with a 40-char hex hash
    if (/^[0-9a-f]{40}\s/.test(line)) {
      // Save previous record if any
      if (current) {
        const absPath = indexToAbsPath[currentFileIndex];
        if (absPath) {
          const date = new Date(current.authorTime * 1000);
          const lineMap = result.get(absPath) ?? new Map();
          lineMap.set(current.line, {
            author: current.author,
            email: current.email,
            date: date.toISOString(),
            commitHash: current.hash,
          });
          result.set(absPath, lineMap);
        }
      }
      const parts = line.trim().split(/\s+/);
      current = {
        hash: parts[0],
        line: parseInt(parts[1], 10),
        author: '',
        email: '',
        authorTime: 0,
        authorTz: '',
      };
      continue;
    }

    if (!current) continue;

    if (line.startsWith('author ')) {
      current.author = line.slice(7);
    } else if (line.startsWith('author-mail ')) {
      current.email = line.slice(12).replace(/^<|>$/g, '');
    } else if (line.startsWith('author-time ')) {
      current.authorTime = parseInt(line.slice(12), 10);
    } else if (line.startsWith('author-tz ')) {
      current.authorTz = line.slice(10);
    }
  }

  // Don't forget the last record
  if (current) {
    const absPath = indexToAbsPath[currentFileIndex];
    if (absPath) {
      const date = new Date(current.authorTime * 1000);
      const lineMap = result.get(absPath) ?? new Map();
      lineMap.set(current.line, {
        author: current.author,
        email: current.email,
        date: date.toISOString(),
        commitHash: current.hash,
      });
      result.set(absPath, lineMap);
    }
  }

  return result;
}

/**
 * Look up blame info for a specific line in a file.
 * Uses a cached blame map to avoid repeated git calls.
 *
 * @deprecated Use batchGetBlameInfoForFiles() for better performance when processing multiple files.
 * Kept for backward compatibility.
 */
export function lookupBlame(
  blameCache: Map<string, Map<number, BlameInfo>>,
  filePath: string,
  line: number,
): BlameInfo | null {
  let fileBlame = blameCache.get(filePath);
  if (!fileBlame) {
    fileBlame = getBlameInfoForFile(filePath);
    blameCache.set(filePath, fileBlame);
  }
  return fileBlame.get(line) ?? null;
}

/**
 * Calculate the age in days from an ISO 8601 date string.
 */
export function calculateAgeDays(dateStr: string): number {
  const now = new Date();
  const then = new Date(dateStr);
  const diffMs = now.getTime() - then.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Group entries by file path.
 * Returns a Map where each key is an absolute file path and the value is an array of entries for that file.
 * Entries within each group are sorted by line number.
 */
export function groupByFile(entries: TodoEntry[]): Map<string, TodoEntry[]> {
  const grouped = new Map<string, TodoEntry[]>();
  for (const entry of entries) {
    const list = grouped.get(entry.file) ?? [];
    list.push(entry);
    grouped.set(entry.file, list);
  }
  for (const [, list] of grouped) {
    list.sort((a, b) => a.line - b.line);
  }
  return grouped;
}

/**
 * Group entries by author name.
 * Returns a Map where each key is an author name and the value is an array of entries by that author.
 * Entries without blame info are grouped under "(untracked)".
 * Entries within each group are sorted by file path then line number.
 */
export function groupByAuthor(entries: TodoEntry[]): Map<string, TodoEntry[]> {
  const grouped = new Map<string, TodoEntry[]>();
  for (const entry of entries) {
    const author = entry.blame ? entry.blame.author : '(untracked)';
    const list = grouped.get(author) ?? [];
    list.push(entry);
    grouped.set(author, list);
  }
  for (const [, list] of grouped) {
    list.sort((a, b) => {
      const fileCmp = a.file.localeCompare(b.file);
      if (fileCmp !== 0) return fileCmp;
      return a.line - b.line;
    });
  }
  return grouped;
}

/**
 * Build a ScanResult with grouping information attached.
 * Useful for consumers who already have an array of TodoEntry objects
 * and want to add grouping without re-scanning.
 */
export function buildScanResult(entries: TodoEntry[]): ScanResult {
  return {
    entries,
    total: entries.length,
    staleCount: entries.filter(e => e.isStale).length,
    byFile: groupByFile(entries),
    byAuthor: groupByAuthor(entries),
  };
}

/**
 * Scan a repository for TODO markers.
 * Enriches results with git blame info (author, date, commit hash) and
 * staleness flags.
 *
 * @param options - Configuration for the scan.
 * @returns A ScanResult with entries, counts, and grouped maps.
 *
 * @example
 * ```ts
 * import { scanRepo } from './engine';
 * const result = await scanRepo({ root: '.', staleDays: 90 });
 * console.log(`Found ${result.total} markers in ${result.byFile.size} files`);
 * ```
 */
export function scanRepo(options: ScanOptions = {}): ScanResult {
  const {
    root = '.',
    markers = DEFAULT_MARKERS,
    extensions = [],
    changedOnly = false,
    base = 'HEAD',
    staleDays = 90,
  } = options;

  const pattern = buildMarkerPattern(markers);
  const rootDir = path.resolve(root);

  // If only changed files mode, use git diff to get modified paths
  let files: string[];

  if (changedOnly) {
    const relativePaths = getChangedFiles(rootDir, base);
    // Convert relative paths from git diff to absolute paths
    files = relativePaths.map(p => path.join(rootDir, p));
    // Apply extension filter if specified
    if (extensions.length > 0) {
      files = files.filter(f => {
        const ext = path.extname(f).toLowerCase();
        return extensions.includes(ext);
      });
    }
  } else {
    files = collectFiles(rootDir, extensions);
  }

  // Scan each file for markers
  const allMarkers: TodoMarker[] = [];
  for (const file of files) {
    const fileMarkers = scanFile(file, pattern);
    allMarkers.push(...fileMarkers);
  }

  // Batch git blame: collect unique files and fetch blame for each,
  // caching results per file to avoid repeated git calls.
  const blameCache = new Map<string, Map<number, BlameInfo>>();

  // Build TodoEntry objects with blame info and staleness
  const entries: TodoEntry[] = allMarkers.map(m => {
    const blame = lookupBlame(blameCache, m.file, m.line);
    const ageDays = blame ? calculateAgeDays(blame.date) : null;
    const isStale = blame !== null && staleDays !== undefined && ageDays !== null && ageDays > staleDays;

    return {
      ...m,
      blame,
      ageDays,
      isStale,
    };
  });

  return buildScanResult(entries);
}

// ── Internal Helpers ──────────────────────────────────────────────────────────

/**
 * Get list of changed files relative to the repo root using git diff.
 * Returns an array of relative file paths that have been modified, added, or are newly created (untracked).
 * Skips deleted files since they can't be scanned.
 *
 * @param rootDir - Absolute path to the git repository root.
 * @param base - Base ref to compare against (default: 'HEAD').
 * @returns Array of relative file paths that have changed.
 */
export function getChangedFiles(rootDir: string, base: string = 'HEAD'): string[] {
  const changedFiles: string[] = [];

  // Get staged and modified files (not deleted)
  try {
    const output1 = execFileSync('git', ['diff', '--name-only', '--diff-filter=ACMR', base, '--'], {
      cwd: rootDir,
      timeout: 10000,
      encoding: 'utf-8',
    }).trim();

    if (output1) {
      changedFiles.push(...output1.split('\n').filter(p => p.length > 0));
    }
  } catch {
    // Not a git repo or git diff failed
  }

  // Get untracked files (newly created, not yet staged)
  try {
    const output2 = execFileSync('git', ['ls-files', '--others', '--exclude-standard'], {
      cwd: rootDir,
      timeout: 10000,
      encoding: 'utf-8',
    }).trim();

    if (output2) {
      changedFiles.push(...output2.split('\n').filter(p => p.length > 0));
    }
  } catch {
    // git ls-files failed, ignore
  }

  // Deduplicate
  return [...new Set(changedFiles)];
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
 * Parse porcelain blame output for a single file into a map of line -> BlameInfo.
 *
 * git blame --line-porcelain output looks like:
 *   <hash> <line> <finalLine> <numLines>
 *   author Name
 *   author-mail <email>
 *   author-time <timestamp>
 *   author-tz <tz>
 *   ...
 *   <blank line>
 *   <content line>
 *
 * We collect the current blame record and emit it when we hit a new record
 * or reach the end of input.
 */
interface PorcelainLine {
  hash: string;
  author: string;
  email: string;
  authorTime: number;
  authorTz: string;
  line: number;
}

function parseBlamePorcelain(output: string): Map<number, BlameInfo> {
  const result = new Map<number, BlameInfo>();
  const lines = output.split('\n');
  let current: PorcelainLine | null = null;

  for (const line of lines) {
    // New record starts with a 40-char hex hash
    if (/^[0-9a-f]{40}\s/.test(line)) {
      // Save previous record if any
      if (current) {
        const date = new Date(current.authorTime * 1000);
        result.set(current.line, {
          author: current.author,
          email: current.email,
          date: date.toISOString(),
          commitHash: current.hash,
        });
      }
      const parts = line.trim().split(/\s+/);
      current = {
        hash: parts[0],
        line: parseInt(parts[1], 10),
        author: '',
        email: '',
        authorTime: 0,
        authorTz: '',
      };
      continue;
    }

    if (!current) continue;

    if (line.startsWith('author ')) {
      current.author = line.slice(7);
    } else if (line.startsWith('author-mail ')) {
      current.email = line.slice(12).replace(/^<|>$/g, '');
    } else if (line.startsWith('author-time ')) {
      current.authorTime = parseInt(line.slice(12), 10);
    } else if (line.startsWith('author-tz ')) {
      current.authorTz = line.slice(10);
    }
  }

  // Don't forget the last record
  if (current) {
    const date = new Date(current.authorTime * 1000);
    result.set(current.line, {
      author: current.author,
      email: current.email,
      date: date.toISOString(),
      commitHash: current.hash,
    });
  }

  return result;
}
