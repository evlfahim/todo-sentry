/**
 * Core engine for scanning codebases for TODO markers.
 * Zero dependencies — uses Node.js child_process and fs only.
 */

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
 * Scan a repository for TODO markers.
 * Returns structured results grouped by file and author.
 */
export async function scanRepo(options: ScanOptions = {}): Promise<ScanResult> {
  const {
    root = '.',
    markers = DEFAULT_MARKERS,
    extensions = [],
    changedOnly = false,
    staleDays = 90,
  } = options;

  // Placeholder — actual implementation will use fs and child_process
  return {
    entries: [],
    total: 0,
    staleCount: 0,
  };
}
