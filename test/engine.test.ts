import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { buildMarkerPattern, DEFAULT_MARKERS, scanFile, scanRepo } from '../src/engine';

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
