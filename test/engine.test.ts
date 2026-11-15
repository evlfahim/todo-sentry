import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { buildMarkerPattern, DEFAULT_MARKERS, scanFile, scanRepo, getBlameInfoForFile, lookupBlame, calculateAgeDays, groupByFile, groupByAuthor, BlameInfo, TodoEntry, getChangedFiles, batchGetBlameInfoForFiles } from '../src/engine';

describe('buildMarkerPattern', () => {
  it('should match TODO markers', () => {
    const pattern = buildMarkerPattern(['TODO', 'FIXME', 'HACK', 'XXX']);
    expect(pattern.test('TODO: fix this')).toBe(true);
    expect(pattern.test('FIXME: broken')).toBe(true);
    expect(pattern.test('HACK: workaround')).toBe(true);
    expect(pattern.test('XXX: urgent')).toBe(true);
  });

  it('should not match partial words', () => {
    const pattern = buildMarkerPattern(['TODO', 'FIXME', 'HACK', 'XXX']);
    expect(pattern.test('TODOLIST')).toBe(false);
    expect(pattern.test('FIXMEUP')).toBe(false);
    expect(pattern.test('HACKER')).toBe(false);
    expect(pattern.test('XXXTRA')).toBe(false);
  });

  it('should be case-insensitive', () => {
    const pattern = buildMarkerPattern(['TODO']);
    expect(pattern.test('todo: lowercase')).toBe(true);
    expect(pattern.test('Todo: mixed')).toBe(true);
    expect(pattern.test('TODO: uppercase')).toBe(true);
  });

  it('should support custom markers', () => {
    const pattern = buildMarkerPattern(['BUG', 'REVIEW']);
    expect(pattern.test('BUG: something')).toBe(true);
    expect(pattern.test('REVIEW: check this')).toBe(true);
    expect(pattern.test('TODO: not included')).toBe(false);
  });
});

describe('DEFAULT_MARKERS', () => {
  it('should contain the four standard markers', () => {
    expect(DEFAULT_MARKERS).toContain('TODO');
    expect(DEFAULT_MARKERS).toContain('FIXME');
    expect(DEFAULT_MARKERS).toContain('HACK');
    expect(DEFAULT_MARKERS).toContain('XXX');
  });
});

describe('scanFile', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'todo-sentry-test-'));
  });

  afterEach(() => {
    // Clean up temp directory
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should find TODO markers in a file', () => {
    const content = [
      'function hello() {',
      '  // TODO: implement this',
      '  return "hello";',
      '}',
    ].join('\n');

    const filePath = path.join(tmpDir, 'test.js');
    fs.writeFileSync(filePath, content);

    const pattern = buildMarkerPattern(['TODO', 'FIXME', 'HACK', 'XXX']);
    const markers = scanFile(filePath, pattern);

    expect(markers).toHaveLength(1);
    expect(markers[0].file).toBe(filePath);
    expect(markers[0].line).toBe(2);
    expect(markers[0].marker).toBe('TODO');
    expect(markers[0].text).toBe('// TODO: implement this');
  });

  it('should find multiple markers in a file', () => {
    const content = [
      '// TODO: first task',
      '// FIXME: second issue',
      '// HACK: third workaround',
      '// XXX: fourth urgent',
    ].join('\n');

    const filePath = path.join(tmpDir, 'test.js');
    fs.writeFileSync(filePath, content);

    const pattern = buildMarkerPattern(['TODO', 'FIXME', 'HACK', 'XXX']);
    const markers = scanFile(filePath, pattern);

    expect(markers).toHaveLength(4);
    expect(markers[0].marker).toBe('TODO');
    expect(markers[1].marker).toBe('FIXME');
    expect(markers[2].marker).toBe('HACK');
    expect(markers[3].marker).toBe('XXX');
  });

  it('should find markers in code comments and inline', () => {
    const content = [
      'const x = 1; // TODO: refactor',
      '/* FIXME: this is broken */',
      'let y = 2; // HACK: temporary fix',
    ].join('\n');

    const filePath = path.join(tmpDir, 'test.js');
    fs.writeFileSync(filePath, content);

    const pattern = buildMarkerPattern(['TODO', 'FIXME', 'HACK', 'XXX']);
    const markers = scanFile(filePath, pattern);

    expect(markers).toHaveLength(3);
  });

  it('should not match partial words', () => {
    const content = [
      '// TODOLIST: manage todos',
      '// FIXMEUP: fix this up',
      '// HACKER: detect hackers',
      '// XXXTRA: extra stuff',
    ].join('\n');

    const filePath = path.join(tmpDir, 'test.js');
    fs.writeFileSync(filePath, content);

    const pattern = buildMarkerPattern(['TODO', 'FIXME', 'HACK', 'XXX']);
    const markers = scanFile(filePath, pattern);

    expect(markers).toHaveLength(0);
  });

  it('should handle files with no markers', () => {
    const content = [
      'function clean() {',
      '  return 42;',
      '}',
    ].join('\n');

    const filePath = path.join(tmpDir, 'test.js');
    fs.writeFileSync(filePath, content);

    const pattern = buildMarkerPattern(['TODO', 'FIXME', 'HACK', 'XXX']);
    const markers = scanFile(filePath, pattern);

    expect(markers).toHaveLength(0);
  });

  it('should handle unreadable files gracefully', () => {
    const pattern = buildMarkerPattern(['TODO', 'FIXME', 'HACK', 'XXX']);
    const markers = scanFile('/nonexistent/file.js', pattern);
    expect(markers).toHaveLength(0);
  });

  it('should support custom markers', () => {
    const content = [
      '// BUG: something is wrong',
      '// REVIEW: needs review',
      '// TODO: not matched',
    ].join('\n');

    const filePath = path.join(tmpDir, 'test.js');
    fs.writeFileSync(filePath, content);

    const pattern = buildMarkerPattern(['BUG', 'REVIEW']);
    const markers = scanFile(filePath, pattern);

    expect(markers).toHaveLength(2);
    expect(markers[0].marker).toBe('BUG');
    expect(markers[1].marker).toBe('REVIEW');
  });

  it('should return correct 1-based line numbers', () => {
    const content = [
      'line 1',
      'line 2',
      '// TODO: on line 3',
      'line 4',
      '// FIXME: on line 5',
    ].join('\n');

    const filePath = path.join(tmpDir, 'test.js');
    fs.writeFileSync(filePath, content);

    const pattern = buildMarkerPattern(['TODO', 'FIXME', 'HACK', 'XXX']);
    const markers = scanFile(filePath, pattern);

    expect(markers).toHaveLength(2);
    expect(markers[0].line).toBe(3);
    expect(markers[1].line).toBe(5);
  });
});

describe('scanRepo', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'todo-sentry-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should return an empty result with no files', async () => {
    const result = await scanRepo({ root: '/tmp/nonexistent-dir-xyz' });
    expect(result.entries).toEqual([]);
    expect(result.total).toBe(0);
    expect(result.staleCount).toBe(0);
  });

  it('should scan a directory and find TODO markers', async () => {
    // Create test files
    fs.writeFileSync(path.join(tmpDir, 'file1.js'), '// TODO: fix this\n');
    fs.writeFileSync(path.join(tmpDir, 'file2.js'), '// FIXME: broken\n');
    fs.writeFileSync(path.join(tmpDir, 'file3.js'), '// no markers here\n');

    const result = await scanRepo({ root: tmpDir });

    expect(result.total).toBe(2);
    expect(result.entries).toHaveLength(2);
    expect(result.entries[0].marker).toBe('TODO');
    expect(result.entries[1].marker).toBe('FIXME');
  });

  it('should filter by file extensions', async () => {
    fs.writeFileSync(path.join(tmpDir, 'file.js'), '// TODO: in js\n');
    fs.writeFileSync(path.join(tmpDir, 'file.py'), '// TODO: in py\n');
    fs.writeFileSync(path.join(tmpDir, 'file.ts'), '// TODO: in ts\n');

    const result = await scanRepo({ root: tmpDir, extensions: ['.js'] });

    expect(result.total).toBe(1);
    expect(result.entries[0].file).toContain('file.js');
  });

  it('should support custom markers', async () => {
    fs.writeFileSync(path.join(tmpDir, 'file.js'), '// BUG: something wrong\n');
    fs.writeFileSync(path.join(tmpDir, 'file2.js'), '// TODO: not matched\n');

    const result = await scanRepo({ root: tmpDir, markers: ['BUG'] });

    expect(result.total).toBe(1);
    expect(result.entries[0].marker).toBe('BUG');
  });

  it('should skip node_modules directory', async () => {
    const nodeModulesDir = path.join(tmpDir, 'node_modules');
    fs.mkdirSync(nodeModulesDir, { recursive: true });
    fs.writeFileSync(path.join(nodeModulesDir, 'pkg.js'), '// TODO: in node_modules\n');

    const result = await scanRepo({ root: tmpDir });

    expect(result.total).toBe(0);
  });

  it('should skip .git directory', async () => {
    const gitDir = path.join(tmpDir, '.git');
    fs.mkdirSync(gitDir, { recursive: true });
    fs.writeFileSync(path.join(gitDir, 'config'), '// TODO: in .git\n');

    const result = await scanRepo({ root: tmpDir });

    expect(result.total).toBe(0);
  });

  it('should return entries with correct structure', async () => {
    fs.writeFileSync(path.join(tmpDir, 'test.js'), '// TODO: test task\n');

    const result = await scanRepo({ root: tmpDir });

    expect(result.total).toBe(1);
    expect(result.staleCount).toBe(0);
    const entry = result.entries[0];
    expect(entry).toHaveProperty('file');
    expect(entry).toHaveProperty('line');
    expect(entry).toHaveProperty('text');
    expect(entry).toHaveProperty('marker');
    expect(entry).toHaveProperty('blame');
    expect(entry).toHaveProperty('ageDays');
    expect(entry).toHaveProperty('isStale');
    expect(entry.blame).toBeNull();
    expect(entry.ageDays).toBeNull();
    expect(entry.isStale).toBe(false);
  });

  it('should find markers in nested directories', async () => {
    const subDir = path.join(tmpDir, 'src');
    fs.mkdirSync(subDir, { recursive: true });
    fs.writeFileSync(path.join(subDir, 'app.js'), '// TODO: nested task\n');

    const result = await scanRepo({ root: tmpDir });

    expect(result.total).toBe(1);
    expect(result.entries[0].file).toContain('src/app.js');
  });
});

describe('getBlameInfoForFile', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'todo-sentry-blame-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should return empty map for non-git directory', () => {
    const filePath = path.join(tmpDir, 'test.js');
    fs.writeFileSync(filePath, '// TODO: test\n');
    const result = getBlameInfoForFile(filePath);
    expect(result.size).toBe(0);
  });

  it('should return blame info for a tracked file in a git repo', () => {
    // Create a mini git repo in tmpDir
    const repoDir = path.join(tmpDir, 'repo');
    fs.mkdirSync(repoDir, { recursive: true });

    // Initialize git repo
    const { execFileSync } = require('node:child_process');
    execFileSync('git', ['init'], { cwd: repoDir });
    execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: repoDir });
    execFileSync('git', ['config', 'user.name', 'Test User'], { cwd: repoDir });

    // Create and commit a file
    const filePath = path.join(repoDir, 'test.js');
    fs.writeFileSync(filePath, '// TODO: fix this\nline 2\nline 3\n');
    execFileSync('git', ['add', 'test.js'], { cwd: repoDir });
    execFileSync('git', ['commit', '-m', 'initial'], { cwd: repoDir });

    // Now get blame info
    const blameMap = getBlameInfoForFile(filePath);

    expect(blameMap.size).toBeGreaterThan(0);
    // Line 1 should have blame info
    const line1Blame = blameMap.get(1);
    expect(line1Blame).not.toBeNull();
    expect(line1Blame!.author).toBe('Test User');
    expect(line1Blame!.email).toBe('test@test.com');
    expect(line1Blame!.commitHash).toHaveLength(40);
    expect(line1Blame!.date).toBeDefined();
  });

  it('should return empty map for untracked file in a git repo', () => {
    const repoDir = path.join(tmpDir, 'repo2');
    fs.mkdirSync(repoDir, { recursive: true });

    const { execFileSync } = require('node:child_process');
    execFileSync('git', ['init'], { cwd: repoDir });
    execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: repoDir });
    execFileSync('git', ['config', 'user.name', 'Test User'], { cwd: repoDir });

    // Create an untracked file
    const filePath = path.join(repoDir, 'untracked.js');
    fs.writeFileSync(filePath, '// TODO: untracked\n');

    const blameMap = getBlameInfoForFile(filePath);
    expect(blameMap.size).toBe(0);
  });
});

describe('calculateAgeDays', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'todo-sentry-age-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should calculate age correctly for a recent commit', () => {
    const repoDir = path.join(tmpDir, 'repo');
    fs.mkdirSync(repoDir, { recursive: true });

    const { execFileSync } = require('node:child_process');
    execFileSync('git', ['init'], { cwd: repoDir });
    execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: repoDir });
    execFileSync('git', ['config', 'user.name', 'Test User'], { cwd: repoDir });

    const filePath = path.join(repoDir, 'test.js');
    fs.writeFileSync(filePath, '// TODO: recent\n');
    execFileSync('git', ['add', 'test.js'], { cwd: repoDir });
    execFileSync('git', ['commit', '-m', 'initial'], { cwd: repoDir });

    const blameMap = getBlameInfoForFile(filePath);
    const blame = blameMap.get(1);
    expect(blame).not.toBeNull();

    const ageDays = calculateAgeDays(blame!.date);

    // A freshly committed file should be 0 or 1 day old
    expect(ageDays).toBeGreaterThanOrEqual(0);
    expect(ageDays).toBeLessThanOrEqual(1);
  });

  it('should calculate age correctly for an old commit', () => {
    const repoDir = path.join(tmpDir, 'repo2');
    fs.mkdirSync(repoDir, { recursive: true });

    const { execFileSync } = require('node:child_process');
    execFileSync('git', ['init'], { cwd: repoDir });
    execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: repoDir });
    execFileSync('git', ['config', 'user.name', 'Test User'], { cwd: repoDir });

    const filePath = path.join(repoDir, 'test.js');
    fs.writeFileSync(filePath, '// TODO: old\n');

    // Create a commit with a date 200 days ago
    const oldDate = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000);
    const env = { ...process.env, GIT_AUTHOR_DATE: oldDate.toISOString(), GIT_COMMITTER_DATE: oldDate.toISOString() };
    execFileSync('git', ['add', 'test.js'], { cwd: repoDir, env });
    execFileSync('git', ['commit', '-m', 'old commit'], { cwd: repoDir, env });

    const blameMap = getBlameInfoForFile(filePath);
    const blame = blameMap.get(1);
    expect(blame).not.toBeNull();

    const ageDays = calculateAgeDays(blame!.date);

    expect(ageDays).toBeGreaterThanOrEqual(199);
    expect(ageDays).toBeLessThanOrEqual(201);
  });
});

describe('staleness filtering', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'todo-sentry-stale-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should mark entries as stale when age exceeds staleDays threshold', async () => {
    const repoDir = path.join(tmpDir, 'repo');
    fs.mkdirSync(repoDir, { recursive: true });

    const { execFileSync } = require('node:child_process');
    execFileSync('git', ['init'], { cwd: repoDir });
    execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: repoDir });
    execFileSync('git', ['config', 'user.name', 'Test User'], { cwd: repoDir });

    const filePath = path.join(repoDir, 'test.js');
    fs.writeFileSync(filePath, '// TODO: old task\n');

    // Create a commit with a date 100 days ago
    const oldDate = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000);
    const env = { ...process.env, GIT_AUTHOR_DATE: oldDate.toISOString(), GIT_COMMITTER_DATE: oldDate.toISOString() };
    execFileSync('git', ['add', 'test.js'], { cwd: repoDir, env });
    execFileSync('git', ['commit', '-m', 'old commit'], { cwd: repoDir, env });

    // With staleDays=90, this should be stale (100 > 90)
    const result = await scanRepo({ root: repoDir, staleDays: 90 });

    expect(result.total).toBe(1);
    expect(result.entries[0].isStale).toBe(true);
    expect(result.entries[0].ageDays).toBeGreaterThanOrEqual(99);
    expect(result.staleCount).toBe(1);
  });

  it('should not mark entries as stale when age is within threshold', async () => {
    const repoDir = path.join(tmpDir, 'repo2');
    fs.mkdirSync(repoDir, { recursive: true });

    const { execFileSync } = require('node:child_process');
    execFileSync('git', ['init'], { cwd: repoDir });
    execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: repoDir });
    execFileSync('git', ['config', 'user.name', 'Test User'], { cwd: repoDir });

    const filePath = path.join(repoDir, 'test.js');
    fs.writeFileSync(filePath, '// TODO: recent\n');
    execFileSync('git', ['add', 'test.js'], { cwd: repoDir });
    execFileSync('git', ['commit', '-m', 'recent commit'], { cwd: repoDir });

    // With staleDays=90, a fresh commit should not be stale
    const result = await scanRepo({ root: repoDir, staleDays: 90 });

    expect(result.total).toBe(1);
    expect(result.entries[0].isStale).toBe(false);
    expect(result.staleCount).toBe(0);
  });

  it('should respect custom staleDays threshold', async () => {
    const repoDir = path.join(tmpDir, 'repo3');
    fs.mkdirSync(repoDir, { recursive: true });

    const { execFileSync } = require('node:child_process');
    execFileSync('git', ['init'], { cwd: repoDir });
    execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: repoDir });
    execFileSync('git', ['config', 'user.name', 'Test User'], { cwd: repoDir });

    const filePath = path.join(repoDir, 'test.js');
    fs.writeFileSync(filePath, '// TODO: medium age\n');

    // Create a commit with a date 50 days ago
    const oldDate = new Date(Date.now() - 50 * 24 * 60 * 60 * 1000);
    const env = { ...process.env, GIT_AUTHOR_DATE: oldDate.toISOString(), GIT_COMMITTER_DATE: oldDate.toISOString() };
    execFileSync('git', ['add', 'test.js'], { cwd: repoDir, env });
    execFileSync('git', ['commit', '-m', 'medium commit'], { cwd: repoDir, env });

    // With staleDays=30, this should be stale (50 > 30)
    const result = await scanRepo({ root: repoDir, staleDays: 30 });

    expect(result.total).toBe(1);
    expect(result.entries[0].isStale).toBe(true);
    expect(result.staleCount).toBe(1);

    // With staleDays=90, this should NOT be stale (50 < 90)
    const result2 = await scanRepo({ root: repoDir, staleDays: 90 });

    expect(result2.total).toBe(1);
    expect(result2.entries[0].isStale).toBe(false);
    expect(result2.staleCount).toBe(0);
  });

  it('should handle entries without git blame (untracked files)', async () => {
    // Create a file in a git repo but don't commit it
    const repoDir = path.join(tmpDir, 'repo4');
    fs.mkdirSync(repoDir, { recursive: true });

    const { execFileSync } = require('node:child_process');
    execFileSync('git', ['init'], { cwd: repoDir });
    execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: repoDir });
    execFileSync('git', ['config', 'user.name', 'Test User'], { cwd: repoDir });

    const filePath = path.join(repoDir, 'untracked.js');
    fs.writeFileSync(filePath, '// TODO: untracked\n');

    // Don't commit - file is untracked
    const result = await scanRepo({ root: repoDir, staleDays: 90 });

    expect(result.total).toBe(1);
    expect(result.entries[0].blame).toBeNull();
    expect(result.entries[0].ageDays).toBeNull();
    expect(result.entries[0].isStale).toBe(false);
    expect(result.staleCount).toBe(0);
  });

  it('should count stale entries correctly across multiple files', async () => {
    const repoDir = path.join(tmpDir, 'repo5');
    fs.mkdirSync(repoDir, { recursive: true });

    const { execFileSync } = require('node:child_process');
    execFileSync('git', ['init'], { cwd: repoDir });
    execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: repoDir });
    execFileSync('git', ['config', 'user.name', 'Test User'], { cwd: repoDir });

    // Create an old file (100 days ago)
    const oldFile = path.join(repoDir, 'old.js');
    fs.writeFileSync(oldFile, '// TODO: old task\n');
    const oldDate = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000);
    const env = { ...process.env, GIT_AUTHOR_DATE: oldDate.toISOString(), GIT_COMMITTER_DATE: oldDate.toISOString() };
    execFileSync('git', ['add', 'old.js'], { cwd: repoDir, env });
    execFileSync('git', ['commit', '-m', 'old'], { cwd: repoDir, env });

    // Create a recent file
    const recentFile = path.join(repoDir, 'recent.js');
    fs.writeFileSync(recentFile, '// TODO: recent task\n');
    execFileSync('git', ['add', 'recent.js'], { cwd: repoDir });
    execFileSync('git', ['commit', '-m', 'recent'], { cwd: repoDir });

    // Create an untracked file
    const untrackedFile = path.join(repoDir, 'untracked.js');
    fs.writeFileSync(untrackedFile, '// TODO: untracked\n');

    const result = await scanRepo({ root: repoDir, staleDays: 90 });

    expect(result.total).toBe(3);
    expect(result.staleCount).toBe(1); // Only the old file should be stale
  });
});

describe('lookupBlame', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'todo-sentry-lookup-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should return null for non-git file', () => {
    const filePath = path.join(tmpDir, 'test.js');
    fs.writeFileSync(filePath, '// TODO: test\n');
    const cache = new Map<string, Map<number, BlameInfo>>();
    const result = lookupBlame(cache, filePath, 1);
    expect(result).toBeNull();
  });

  it('should cache blame results for the same file', () => {
    const repoDir = path.join(tmpDir, 'repo');
    fs.mkdirSync(repoDir, { recursive: true });

    const { execFileSync } = require('node:child_process');
    execFileSync('git', ['init'], { cwd: repoDir });
    execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: repoDir });
    execFileSync('git', ['config', 'user.name', 'Test User'], { cwd: repoDir });

    const filePath = path.join(repoDir, 'test.js');
    fs.writeFileSync(filePath, '// TODO: fix this\nline 2\n');
    execFileSync('git', ['add', 'test.js'], { cwd: repoDir });
    execFileSync('git', ['commit', '-m', 'initial'], { cwd: repoDir });

    const cache = new Map<string, Map<number, BlameInfo>>();

    // First lookup
    const result1 = lookupBlame(cache, filePath, 1);
    expect(result1).not.toBeNull();
    expect(cache.size).toBe(1); // One file in cache

    // Second lookup should use cache
    const result2 = lookupBlame(cache, filePath, 2);
    expect(result2).not.toBeNull();
    expect(cache.size).toBe(1); // Still one file in cache (cached)
  });
});

describe('groupByFile', () => {
  it('should group entries by file path', () => {
    const entries: TodoEntry[] = [
      { file: '/a.js', line: 1, text: '// TODO: a1', marker: 'TODO', blame: null, ageDays: null, isStale: false },
      { file: '/b.js', line: 2, text: '// FIXME: b1', marker: 'FIXME', blame: null, ageDays: null, isStale: false },
      { file: '/a.js', line: 5, text: '// TODO: a2', marker: 'TODO', blame: null, ageDays: null, isStale: false },
    ];

    const grouped = groupByFile(entries);

    expect(grouped.size).toBe(2);
    expect(grouped.get('/a.js')).toHaveLength(2);
    expect(grouped.get('/b.js')).toHaveLength(1);
    // Entries within a file should be sorted by line number
    expect(grouped.get('/a.js')![0].line).toBe(1);
    expect(grouped.get('/a.js')![1].line).toBe(5);
  });

  it('should return empty map for empty entries', () => {
    const grouped = groupByFile([]);
    expect(grouped.size).toBe(0);
  });

  it('should handle single entry', () => {
    const entries: TodoEntry[] = [
      { file: '/solo.js', line: 10, text: '// TODO: solo', marker: 'TODO', blame: null, ageDays: null, isStale: false },
    ];

    const grouped = groupByFile(entries);
    expect(grouped.size).toBe(1);
    expect(grouped.get('/solo.js')).toHaveLength(1);
  });
});

describe('groupByAuthor', () => {
  it('should group entries by author name', () => {
    const entries: TodoEntry[] = [
      { file: '/a.js', line: 1, text: '// TODO: a1', marker: 'TODO', blame: { author: 'Alice', email: 'a@b.com', date: new Date().toISOString(), commitHash: 'a'.repeat(40) }, ageDays: 10, isStale: false },
      { file: '/b.js', line: 2, text: '// FIXME: b1', marker: 'FIXME', blame: { author: 'Bob', email: 'b@c.com', date: new Date().toISOString(), commitHash: 'b'.repeat(40) }, ageDays: 20, isStale: false },
      { file: '/c.js', line: 3, text: '// TODO: c1', marker: 'TODO', blame: { author: 'Alice', email: 'a@b.com', date: new Date().toISOString(), commitHash: 'c'.repeat(40) }, ageDays: 30, isStale: false },
    ];

    const grouped = groupByAuthor(entries);

    expect(grouped.size).toBe(2);
    expect(grouped.get('Alice')).toHaveLength(2);
    expect(grouped.get('Bob')).toHaveLength(1);
  });

  it('should group untracked entries under "(untracked)"', () => {
    const entries: TodoEntry[] = [
      { file: '/a.js', line: 1, text: '// TODO: a1', marker: 'TODO', blame: null, ageDays: null, isStale: false },
      { file: '/b.js', line: 2, text: '// FIXME: b1', marker: 'FIXME', blame: { author: 'Alice', email: 'a@b.com', date: new Date().toISOString(), commitHash: 'a'.repeat(40) }, ageDays: 10, isStale: false },
      { file: '/c.js', line: 3, text: '// TODO: c1', marker: 'TODO', blame: null, ageDays: null, isStale: false },
    ];

    const grouped = groupByAuthor(entries);

    expect(grouped.size).toBe(2);
    expect(grouped.get('(untracked)')).toHaveLength(2);
    expect(grouped.get('Alice')).toHaveLength(1);
  });

  it('should return empty map for empty entries', () => {
    const grouped = groupByAuthor([]);
    expect(grouped.size).toBe(0);
  });

  it('should sort entries by file then line within author groups', () => {
    const entries: TodoEntry[] = [
      { file: '/z.js', line: 10, text: '// TODO: z10', marker: 'TODO', blame: { author: 'Alice', email: 'a@b.com', date: new Date().toISOString(), commitHash: 'a'.repeat(40) }, ageDays: 10, isStale: false },
      { file: '/a.js', line: 5, text: '// FIXME: a5', marker: 'FIXME', blame: { author: 'Alice', email: 'a@b.com', date: new Date().toISOString(), commitHash: 'a'.repeat(40) }, ageDays: 10, isStale: false },
      { file: '/a.js', line: 1, text: '// TODO: a1', marker: 'TODO', blame: { author: 'Alice', email: 'a@b.com', date: new Date().toISOString(), commitHash: 'a'.repeat(40) }, ageDays: 10, isStale: false },
    ];

    const grouped = groupByAuthor(entries);
    const aliceEntries = grouped.get('Alice')!;

    expect(aliceEntries).toHaveLength(3);
    // Sorted by file first, then line
    expect(aliceEntries[0].file).toBe('/a.js');
    expect(aliceEntries[0].line).toBe(1);
    expect(aliceEntries[1].file).toBe('/a.js');
    expect(aliceEntries[1].line).toBe(5);
    expect(aliceEntries[2].file).toBe('/z.js');
    expect(aliceEntries[2].line).toBe(10);
  });
});

describe('scanResult grouping', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'todo-sentry-group-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should include byFile and byAuthor in ScanResult', async () => {
    fs.writeFileSync(path.join(tmpDir, 'file1.js'), '// TODO: task1\n');
    fs.writeFileSync(path.join(tmpDir, 'file2.js'), '// FIXME: task2\n');
    fs.writeFileSync(path.join(tmpDir, 'file3.js'), '// TODO: task3\n');

    const result = await scanRepo({ root: tmpDir });

    expect(result.byFile).toBeDefined();
    expect(result.byAuthor).toBeDefined();
    expect(result.byFile.size).toBe(3);
    expect(result.byAuthor.size).toBe(1); // All untracked, so one "(untracked)" group
  });

  it('should have correct grouping counts matching total', async () => {
    fs.writeFileSync(path.join(tmpDir, 'a.js'), '// TODO: a\n// FIXME: b\n');
    fs.writeFileSync(path.join(tmpDir, 'b.js'), '// HACK: c\n');

    const result = await scanRepo({ root: tmpDir });

    // Total entries should equal sum of all file groups
    const fileGroupTotal = Array.from(result.byFile.values()).reduce((sum, arr) => sum + arr.length, 0);
    expect(fileGroupTotal).toBe(result.total);

    // Total entries should equal sum of all author groups
    const authorGroupTotal = Array.from(result.byAuthor.values()).reduce((sum, arr) => sum + arr.length, 0);
    expect(authorGroupTotal).toBe(result.total);
  });

  it('should group correctly in a git repo with multiple authors', async () => {
    const { execFileSync } = require('node:child_process');

    // Repo with author 1
    const repoDir1 = path.join(tmpDir, 'repo1');
    fs.mkdirSync(repoDir1, { recursive: true });
    execFileSync('git', ['init'], { cwd: repoDir1 });
    execFileSync('git', ['config', 'user.email', 'alice@test.com'], { cwd: repoDir1 });
    execFileSync('git', ['config', 'user.name', 'Alice'], { cwd: repoDir1 });

    const file1 = path.join(repoDir1, 'a.js');
    fs.writeFileSync(file1, '// TODO: alice task\n');
    execFileSync('git', ['add', 'a.js'], { cwd: repoDir1 });
    execFileSync('git', ['commit', '-m', 'alice commit'], { cwd: repoDir1 });

    // Repo with author 2
    const repoDir2 = path.join(tmpDir, 'repo2');
    fs.mkdirSync(repoDir2, { recursive: true });
    execFileSync('git', ['init'], { cwd: repoDir2 });
    execFileSync('git', ['config', 'user.email', 'bob@test.com'], { cwd: repoDir2 });
    execFileSync('git', ['config', 'user.name', 'Bob'], { cwd: repoDir2 });

    const file2 = path.join(repoDir2, 'b.js');
    fs.writeFileSync(file2, '// FIXME: bob task\n');
    execFileSync('git', ['add', 'b.js'], { cwd: repoDir2 });
    execFileSync('git', ['commit', '-m', 'bob commit'], { cwd: repoDir2 });

    // Scan both repos
    const result1 = await scanRepo({ root: repoDir1 });
    const result2 = await scanRepo({ root: repoDir2 });

    expect(result1.byAuthor.get('Alice')).toHaveLength(1);
    expect(result1.byAuthor.get('Alice')![0].file).toContain('a.js');

    expect(result2.byAuthor.get('Bob')).toHaveLength(1);
    expect(result2.byAuthor.get('Bob')![0].file).toContain('b.js');
  });
});

describe('getChangedFiles', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'todo-sentry-changed-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should return empty array for non-git directory', () => {
    const result = getChangedFiles(tmpDir);
    expect(result).toEqual([]);
  });

  it('should return empty array when no changes exist', () => {
    const repoDir = path.join(tmpDir, 'repo');
    fs.mkdirSync(repoDir, { recursive: true });

    const { execFileSync } = require('node:child_process');
    execFileSync('git', ['init'], { cwd: repoDir });
    execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: repoDir });
    execFileSync('git', ['config', 'user.name', 'Test User'], { cwd: repoDir });

    const filePath = path.join(repoDir, 'test.js');
    fs.writeFileSync(filePath, '// TODO: initial\n');
    execFileSync('git', ['add', 'test.js'], { cwd: repoDir });
    execFileSync('git', ['commit', '-m', 'initial'], { cwd: repoDir });

    const result = getChangedFiles(repoDir);
    expect(result).toEqual([]);
  });

  it('should return added files', () => {
    const repoDir = path.join(tmpDir, 'repo');
    fs.mkdirSync(repoDir, { recursive: true });

    const { execFileSync } = require('node:child_process');
    execFileSync('git', ['init'], { cwd: repoDir });
    execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: repoDir });
    execFileSync('git', ['config', 'user.name', 'Test User'], { cwd: repoDir });

    // Initial commit
    const initialFile = path.join(repoDir, 'initial.js');
    fs.writeFileSync(initialFile, '// initial\n');
    execFileSync('git', ['add', 'initial.js'], { cwd: repoDir });
    execFileSync('git', ['commit', '-m', 'initial'], { cwd: repoDir });

    // Add a new file (uncommitted)
    const newFile = path.join(repoDir, 'new.js');
    fs.writeFileSync(newFile, '// TODO: new file\n');

    const result = getChangedFiles(repoDir);
    expect(result).toContain('new.js');
  });

  it('should return modified files', () => {
    const repoDir = path.join(tmpDir, 'repo');
    fs.mkdirSync(repoDir, { recursive: true });

    const { execFileSync } = require('node:child_process');
    execFileSync('git', ['init'], { cwd: repoDir });
    execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: repoDir });
    execFileSync('git', ['config', 'user.name', 'Test User'], { cwd: repoDir });

    const filePath = path.join(repoDir, 'test.js');
    fs.writeFileSync(filePath, '// initial content\n');
    execFileSync('git', ['add', 'test.js'], { cwd: repoDir });
    execFileSync('git', ['commit', '-m', 'initial'], { cwd: repoDir });

    // Modify the file (uncommitted)
    fs.writeFileSync(filePath, '// TODO: modified content\n');

    const result = getChangedFiles(repoDir);
    expect(result).toContain('test.js');
  });

  it('should not include deleted files', () => {
    const repoDir = path.join(tmpDir, 'repo');
    fs.mkdirSync(repoDir, { recursive: true });

    const { execFileSync } = require('node:child_process');
    execFileSync('git', ['init'], { cwd: repoDir });
    execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: repoDir });
    execFileSync('git', ['config', 'user.name', 'Test User'], { cwd: repoDir });

    const filePath = path.join(repoDir, 'deleted.js');
    fs.writeFileSync(filePath, '// TODO: will be deleted\n');
    execFileSync('git', ['add', 'deleted.js'], { cwd: repoDir });
    execFileSync('git', ['commit', '-m', 'initial'], { cwd: repoDir });

    // Delete the file (uncommitted)
    fs.unlinkSync(filePath);

    const result = getChangedFiles(repoDir);
    expect(result).not.toContain('deleted.js');
  });

  it('should return relative paths', () => {
    const repoDir = path.join(tmpDir, 'repo');
    fs.mkdirSync(repoDir, { recursive: true });

    const { execFileSync } = require('node:child_process');
    execFileSync('git', ['init'], { cwd: repoDir });
    execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: repoDir });
    execFileSync('git', ['config', 'user.name', 'Test User'], { cwd: repoDir });

    const initialFile = path.join(repoDir, 'initial.js');
    fs.writeFileSync(initialFile, '// initial\n');
    execFileSync('git', ['add', 'initial.js'], { cwd: repoDir });
    execFileSync('git', ['commit', '-m', 'initial'], { cwd: repoDir });

    // Add a new file in a subdirectory
    const subDir = path.join(repoDir, 'src');
    fs.mkdirSync(subDir, { recursive: true });
    const newFile = path.join(subDir, 'new.js');
    fs.writeFileSync(newFile, '// TODO: nested\n');

    const result = getChangedFiles(repoDir);
    expect(result).toContain('src/new.js');
  });

  it('should support custom base ref', () => {
    const repoDir = path.join(tmpDir, 'repo');
    fs.mkdirSync(repoDir, { recursive: true });

    const { execFileSync } = require('node:child_process');
    execFileSync('git', ['init'], { cwd: repoDir });
    execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: repoDir });
    execFileSync('git', ['config', 'user.name', 'Test User'], { cwd: repoDir });

    const filePath = path.join(repoDir, 'test.js');
    fs.writeFileSync(filePath, '// initial\n');
    execFileSync('git', ['add', 'test.js'], { cwd: repoDir });
    execFileSync('git', ['commit', '-m', 'initial'], { cwd: repoDir });

    // Create a second commit
    fs.writeFileSync(filePath, '// second\n');
    execFileSync('git', ['add', 'test.js'], { cwd: repoDir });
    execFileSync('git', ['commit', '-m', 'second'], { cwd: repoDir });

    // Compare against the first commit
    const firstCommit = execFileSync('git', ['rev-parse', 'HEAD~1'], { cwd: repoDir, encoding: 'utf-8' }).trim();
    const result = getChangedFiles(repoDir, firstCommit);
    expect(result).toContain('test.js');
  });
});

describe('changedOnly mode', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'todo-sentry-changedonly-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should only scan changed files when changedOnly is true', async () => {
    const repoDir = path.join(tmpDir, 'repo');
    fs.mkdirSync(repoDir, { recursive: true });

    const { execFileSync } = require('node:child_process');
    execFileSync('git', ['init'], { cwd: repoDir });
    execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: repoDir });
    execFileSync('git', ['config', 'user.name', 'Test User'], { cwd: repoDir });

    // Initial commit with a file that has no TODOs
    const initialFile = path.join(repoDir, 'initial.js');
    fs.writeFileSync(initialFile, '// no todos here\n');
    execFileSync('git', ['add', 'initial.js'], { cwd: repoDir });
    execFileSync('git', ['commit', '-m', 'initial'], { cwd: repoDir });

    // Add a new file with a TODO (uncommitted)
    const newFile = path.join(repoDir, 'new.js');
    fs.writeFileSync(newFile, '// TODO: fix this\n');

    // Add another file with a TODO (uncommitted)
    const anotherFile = path.join(repoDir, 'another.js');
    fs.writeFileSync(anotherFile, '// FIXME: broken\n');

    // Scan with changedOnly — should only find TODOs in new files
    const result = await scanRepo({ root: repoDir, changedOnly: true });

    expect(result.total).toBe(2);
    expect(result.entries.map(e => path.basename(e.file)).sort()).toEqual(['another.js', 'new.js']);
  });

  it('should return empty result when no files are changed', async () => {
    const repoDir = path.join(tmpDir, 'repo');
    fs.mkdirSync(repoDir, { recursive: true });

    const { execFileSync } = require('node:child_process');
    execFileSync('git', ['init'], { cwd: repoDir });
    execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: repoDir });
    execFileSync('git', ['config', 'user.name', 'Test User'], { cwd: repoDir });

    const filePath = path.join(repoDir, 'test.js');
    fs.writeFileSync(filePath, '// TODO: initial\n');
    execFileSync('git', ['add', 'test.js'], { cwd: repoDir });
    execFileSync('git', ['commit', '-m', 'initial'], { cwd: repoDir });

    // No changes — changedOnly should return empty
    const result = await scanRepo({ root: repoDir, changedOnly: true });

    expect(result.total).toBe(0);
    expect(result.entries).toHaveLength(0);
  });

  it('should work with changedOnly and extension filter', async () => {
    const repoDir = path.join(tmpDir, 'repo');
    fs.mkdirSync(repoDir, { recursive: true });

    const { execFileSync } = require('node:child_process');
    execFileSync('git', ['init'], { cwd: repoDir });
    execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: repoDir });
    execFileSync('git', ['config', 'user.name', 'Test User'], { cwd: repoDir });

    // Initial commit
    const initialFile = path.join(repoDir, 'initial.js');
    fs.writeFileSync(initialFile, '// initial\n');
    execFileSync('git', ['add', 'initial.js'], { cwd: repoDir });
    execFileSync('git', ['commit', '-m', 'initial'], { cwd: repoDir });

    // Add new files with different extensions
    const newJs = path.join(repoDir, 'new.js');
    fs.writeFileSync(newJs, '// TODO: js\n');
    const newPy = path.join(repoDir, 'new.py');
    fs.writeFileSync(newPy, '// TODO: py\n');
    const newTs = path.join(repoDir, 'new.ts');
    fs.writeFileSync(newTs, '// TODO: ts\n');

    // changedOnly with extension filter — should only find .js files
    const result = await scanRepo({ root: repoDir, changedOnly: true, extensions: ['.js'] });

    expect(result.total).toBe(1);
    expect(result.entries[0].file).toContain('new.js');
  });

  it('should work with changedOnly and custom markers', async () => {
    const repoDir = path.join(tmpDir, 'repo');
    fs.mkdirSync(repoDir, { recursive: true });

    const { execFileSync } = require('node:child_process');
    execFileSync('git', ['init'], { cwd: repoDir });
    execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: repoDir });
    execFileSync('git', ['config', 'user.name', 'Test User'], { cwd: repoDir });

    // Initial commit
    const initialFile = path.join(repoDir, 'initial.js');
    fs.writeFileSync(initialFile, '// initial\n');
    execFileSync('git', ['add', 'initial.js'], { cwd: repoDir });
    execFileSync('git', ['commit', '-m', 'initial'], { cwd: repoDir });

    // Add new file with BUG marker (not default TODO)
    const newFile = path.join(repoDir, 'new.js');
    fs.writeFileSync(newFile, '// BUG: something wrong\n// TODO: also here\n');

    // changedOnly with custom markers — should only find BUG
    const result = await scanRepo({ root: repoDir, changedOnly: true, markers: ['BUG'] });

    expect(result.total).toBe(1);
    expect(result.entries[0].marker).toBe('BUG');
  });

  it('should work with changedOnly in non-git directory', async () => {
    // Non-git directory — changedOnly should gracefully return empty
    const result = await scanRepo({ root: tmpDir, changedOnly: true });

    expect(result.total).toBe(0);
    expect(result.entries).toHaveLength(0);
  });

  it('should include blame info for changed tracked files', async () => {
    const repoDir = path.join(tmpDir, 'repo');
    fs.mkdirSync(repoDir, { recursive: true });

    const { execFileSync } = require('node:child_process');
    execFileSync('git', ['init'], { cwd: repoDir });
    execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: repoDir });
    execFileSync('git', ['config', 'user.name', 'Test User'], { cwd: repoDir });

    // Initial commit
    const initialFile = path.join(repoDir, 'initial.js');
    fs.writeFileSync(initialFile, '// initial\n');
    execFileSync('git', ['add', 'initial.js'], { cwd: repoDir });
    execFileSync('git', ['commit', '-m', 'initial'], { cwd: repoDir });

    // Add a new file with a TODO
    const newFile = path.join(repoDir, 'new.js');
    fs.writeFileSync(newFile, '// TODO: fix this\n');

    const result = await scanRepo({ root: repoDir, changedOnly: true });

    expect(result.total).toBe(1);
    // The new file is untracked, so blame should be null
    expect(result.entries[0].blame).toBeNull();
    expect(result.entries[0].ageDays).toBeNull();
  });
});

describe('batchGetBlameInfoForFiles', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'todo-sentry-batch-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should return empty map for non-git directory', () => {
    const result = batchGetBlameInfoForFiles(tmpDir, []);
    expect(result.size).toBe(0);
  });

  it('should return empty map when no files are provided', () => {
    const repoDir = path.join(tmpDir, 'repo');
    fs.mkdirSync(repoDir, { recursive: true });

    const { execFileSync } = require('node:child_process');
    execFileSync('git', ['init'], { cwd: repoDir });
    execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: repoDir });
    execFileSync('git', ['config', 'user.name', 'Test User'], { cwd: repoDir });

    const result = batchGetBlameInfoForFiles(repoDir, []);
    expect(result.size).toBe(0);
  });

  it('should return blame info for tracked files', () => {
    const repoDir = path.join(tmpDir, 'repo');
    fs.mkdirSync(repoDir, { recursive: true });

    const { execFileSync } = require('node:child_process');
    execFileSync('git', ['init'], { cwd: repoDir });
    execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: repoDir });
    execFileSync('git', ['config', 'user.name', 'Test User'], { cwd: repoDir });

    const file1 = path.join(repoDir, 'file1.js');
    const file2 = path.join(repoDir, 'file2.js');
    fs.writeFileSync(file1, '// TODO: fix this\nline 2\n');
    fs.writeFileSync(file2, '// FIXME: broken\nline 2\nline 3\n');
    execFileSync('git', ['add', 'file1.js', 'file2.js'], { cwd: repoDir });
    execFileSync('git', ['commit', '-m', 'initial'], { cwd: repoDir });

    const result = batchGetBlameInfoForFiles(repoDir, [file1, file2]);

    expect(result.size).toBe(2);
    const file1Blame = result.get(file1);
    expect(file1Blame).toBeDefined();
    expect(file1Blame!.size).toBeGreaterThan(0);
    expect(file1Blame!.get(1)!.author).toBe('Test User');
    expect(file1Blame!.get(1)!.email).toBe('test@test.com');
    expect(file1Blame!.get(1)!.commitHash).toHaveLength(40);

    const file2Blame = result.get(file2);
    expect(file2Blame).toBeDefined();
    expect(file2Blame!.size).toBeGreaterThan(0);
    expect(file2Blame!.get(1)!.author).toBe('Test User');
  });

  it('should skip untracked files gracefully', () => {
    const repoDir = path.join(tmpDir, 'repo');
    fs.mkdirSync(repoDir, { recursive: true });

    const { execFileSync } = require('node:child_process');
    execFileSync('git', ['init'], { cwd: repoDir });
    execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: repoDir });
    execFileSync('git', ['config', 'user.name', 'Test User'], { cwd: repoDir });

    const trackedFile = path.join(repoDir, 'tracked.js');
    const untrackedFile = path.join(repoDir, 'untracked.js');
    fs.writeFileSync(trackedFile, '// TODO: tracked\n');
    fs.writeFileSync(untrackedFile, '// TODO: untracked\n');
    execFileSync('git', ['add', 'tracked.js'], { cwd: repoDir });
    execFileSync('git', ['commit', '-m', 'initial'], { cwd: repoDir });

    const result = batchGetBlameInfoForFiles(repoDir, [trackedFile, untrackedFile]);

    expect(result.size).toBe(1);
    expect(result.has(trackedFile)).toBe(true);
    expect(result.has(untrackedFile)).toBe(false);
  });

  it('should skip non-existent files gracefully', () => {
    const repoDir = path.join(tmpDir, 'repo');
    fs.mkdirSync(repoDir, { recursive: true });

    const { execFileSync } = require('node:child_process');
    execFileSync('git', ['init'], { cwd: repoDir });
    execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: repoDir });
    execFileSync('git', ['config', 'user.name', 'Test User'], { cwd: repoDir });

    const file1 = path.join(repoDir, 'file1.js');
    fs.writeFileSync(file1, '// TODO: fix\n');
    execFileSync('git', ['add', 'file1.js'], { cwd: repoDir });
    execFileSync('git', ['commit', '-m', 'initial'], { cwd: repoDir });

    const nonExistent = path.join(repoDir, 'nonexistent.js');

    const result = batchGetBlameInfoForFiles(repoDir, [file1, nonExistent]);

    expect(result.size).toBe(1);
    expect(result.has(file1)).toBe(true);
    expect(result.has(nonExistent)).toBe(false);
  });

  it('should handle mixed tracked and untracked files', () => {
    const repoDir = path.join(tmpDir, 'repo');
    fs.mkdirSync(repoDir, { recursive: true });

    const { execFileSync } = require('node:child_process');
    execFileSync('git', ['init'], { cwd: repoDir });
    execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: repoDir });
    execFileSync('git', ['config', 'user.name', 'Test User'], { cwd: repoDir });

    const file1 = path.join(repoDir, 'file1.js');
    const file2 = path.join(repoDir, 'file2.js');
    const file3 = path.join(repoDir, 'file3.js');
    fs.writeFileSync(file1, '// TODO: 1\n');
    fs.writeFileSync(file2, '// TODO: 2\n');
    fs.writeFileSync(file3, '// TODO: 3\n');
    execFileSync('git', ['add', 'file1.js', 'file2.js'], { cwd: repoDir });
    execFileSync('git', ['commit', '-m', 'initial'], { cwd: repoDir });

    const result = batchGetBlameInfoForFiles(repoDir, [file1, file2, file3]);

    expect(result.size).toBe(2);
    expect(result.has(file1)).toBe(true);
    expect(result.has(file2)).toBe(true);
    expect(result.has(file3)).toBe(false);
  });
});
