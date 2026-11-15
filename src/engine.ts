/**
 * Core engine for scanning codebases for TODO markers.
 * Zero dependencies — uses Node.js child_process and fs only.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';

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

/**
 * Run git blame --line-porcelain on a file and return a map of line number -> BlameInfo.
 * Returns an empty map if git is not available or the file is not tracked.
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
 * Look up blame info for a specific line in a file.
 * Uses a cached blame map to avoid repeated git calls.
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
 * Calculate the age in days from a date string.
 */
export function calculateAgeDays(dateStr: string): number {
  const now = new Date();
  const then = new Date(dateStr);
  const diffMs = now.getTime() - then.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Scan a repository for TODO markers.
 * Enriches results with git blame info (author, date, commit hash) and
 * staleness flags.
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

  // Batch git blame: collect unique files and fetch blame for each
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

  return {
    entries,
    total: entries.length,
    staleCount: entries.filter(e => e.isStale).length,
  };
}
