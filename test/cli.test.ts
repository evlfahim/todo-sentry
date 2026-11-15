import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { execFileSync } from 'node:child_process';
import { TodoEntry, BlameInfo } from '../src/engine';

// We test the Markdown formatter by invoking the CLI and parsing its output,
// since formatMd is defined in cli.ts alongside the CLI entry point.

function runCli(args: string[]): string {
  return execFileSync('node', ['dist/cli.js', ...args], {
    cwd: path.resolve(__dirname, '..'),
    encoding: 'utf-8',
    timeout: 30000,
  });
}

function parseJsonOutput(output: string): TodoEntry[] {
  return JSON.parse(output.trim());
}

describe('Markdown Task List formatter', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'todo-sentry-md-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should produce a valid Markdown Task List with TODO markers', () => {
    // Create a test file with TODO markers
    fs.writeFileSync(path.join(tmpDir, 'test.js'), '// TODO: fix this bug\n// FIXME: broken code\n');

    const output = runCli(['scan', tmpDir, '--format', 'md']);

    expect(output).toContain('# TODO Task List');
    expect(output).toContain('- [ ]');
    expect(output).toContain('TODO: fix this bug');
    expect(output).toContain('FIXME: broken code');
  });

  it('should include a summary section with total count', () => {
    fs.writeFileSync(path.join(tmpDir, 'a.js'), '// TODO: task 1\n');
    fs.writeFileSync(path.join(tmpDir, 'b.js'), '// FIXME: task 2\n// HACK: task 3\n');

    const output = runCli(['scan', tmpDir, '--format', 'md']);

    expect(output).toContain('## Summary');
    expect(output).toContain('**Total:** 3 markers');
    expect(output).toContain('**Files:** 2');
  });

  it('should group entries by file with headers', () => {
    fs.writeFileSync(path.join(tmpDir, 'app.js'), '// TODO: app task\n');
    fs.writeFileSync(path.join(tmpDir, 'utils.js'), '// FIXME: util task\n');

    const output = runCli(['scan', tmpDir, '--format', 'md']);

    expect(output).toContain('## TODOs by File');
    expect(output).toContain('app.js');
    expect(output).toContain('utils.js');
  });

  it('should group entries by author with headers', () => {
    fs.writeFileSync(path.join(tmpDir, 'app.js'), '// TODO: app task\n');

    const output = runCli(['scan', tmpDir, '--format', 'md']);

    expect(output).toContain('## TODOs by Author');
    expect(output).toContain('(untracked)');
  });

  it('should mark stale entries with [STALE] tag', () => {
    const repoDir = path.join(tmpDir, 'repo');
    fs.mkdirSync(repoDir, { recursive: true });

    execFileSync('git', ['init'], { cwd: repoDir });
    execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: repoDir });
    execFileSync('git', ['config', 'user.name', 'Test User'], { cwd: repoDir });

    const filePath = path.join(repoDir, 'old.js');
    fs.writeFileSync(filePath, '// TODO: old task\n');

    const oldDate = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000);
    const env = { ...process.env, GIT_AUTHOR_DATE: oldDate.toISOString(), GIT_COMMITTER_DATE: oldDate.toISOString() };
    execFileSync('git', ['add', 'old.js'], { cwd: repoDir, env });
    execFileSync('git', ['commit', '-m', 'old commit'], { cwd: repoDir, env });

    const output = runCli(['scan', repoDir, '--format', 'md', '--stale-days', '90']);

    expect(output).toContain('[STALE]');
    expect(output).toContain('100d ago');
  });

  it('should include author and commit hash in file group entries', () => {
    const repoDir = path.join(tmpDir, 'repo2');
    fs.mkdirSync(repoDir, { recursive: true });

    execFileSync('git', ['init'], { cwd: repoDir });
    execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: repoDir });
    execFileSync('git', ['config', 'user.name', 'Test User'], { cwd: repoDir });

    const filePath = path.join(repoDir, 'test.js');
    fs.writeFileSync(filePath, '// TODO: fix this\n');
    execFileSync('git', ['add', 'test.js'], { cwd: repoDir });
    execFileSync('git', ['commit', '-m', 'initial'], { cwd: repoDir });

    const output = runCli(['scan', repoDir, '--format', 'md']);

    expect(output).toContain('Test User');
    expect(output).toContain('d ago');
  });

  it('should produce no-markers message when no TODOs found', () => {
    fs.writeFileSync(path.join(tmpDir, 'clean.js'), 'function hello() { return 42; }\n');

    const output = runCli(['scan', tmpDir, '--format', 'md']);

    expect(output).toContain('# TODO Task List');
    expect(output).toContain('No TODO markers found');
  });

  it('should include stale count in summary when stale entries exist', () => {
    const repoDir = path.join(tmpDir, 'repo3');
    fs.mkdirSync(repoDir, { recursive: true });

    execFileSync('git', ['init'], { cwd: repoDir });
    execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: repoDir });
    execFileSync('git', ['config', 'user.name', 'Test User'], { cwd: repoDir });

    const filePath = path.join(repoDir, 'old.js');
    fs.writeFileSync(filePath, '// TODO: old task\n');

    const oldDate = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000);
    const env = { ...process.env, GIT_AUTHOR_DATE: oldDate.toISOString(), GIT_COMMITTER_DATE: oldDate.toISOString() };
    execFileSync('git', ['add', 'old.js'], { cwd: repoDir, env });
    execFileSync('git', ['commit', '-m', 'old commit'], { cwd: repoDir, env });

    const output = runCli(['scan', repoDir, '--format', 'md', '--stale-days', '90']);

    expect(output).toContain('**Stale:** 1');
  });

  it('should output actionable - [ ] items for triage', () => {
    fs.writeFileSync(path.join(tmpDir, 'app.js'), '// TODO: implement feature X\n// FIXME: fix memory leak\n// HACK: temporary workaround\n// XXX: critical bug\n');

    const output = runCli(['scan', tmpDir, '--format', 'md']);

    // Verify all four marker types produce - [ ] items in the file group section.
    // File group lines have format: - [ ] [line] MARKER: text
    // Author group lines have format: - [ ] file:line [MARKER] text
    // We check that each marker type appears at least once in the file group section.
    const fileSection = output.split('## TODOs by Author')[0];
    const todoLines = fileSection.split('\n').filter(l => l.includes('- [ ]') && l.includes('TODO:'));
    const fixmeLines = fileSection.split('\n').filter(l => l.includes('- [ ]') && l.includes('FIXME:'));
    const hackLines = fileSection.split('\n').filter(l => l.includes('- [ ]') && l.includes('HACK:'));
    const xxxLines = fileSection.split('\n').filter(l => l.includes('- [ ]') && l.includes('XXX:'));

    expect(todoLines.length).toBe(1);
    expect(fixmeLines.length).toBe(1);
    expect(hackLines.length).toBe(1);
    expect(xxxLines.length).toBe(1);
  });
});

describe('JSON output format', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'todo-sentry-json-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should output valid JSON when --format json is used', () => {
    fs.writeFileSync(path.join(tmpDir, 'test.js'), '// TODO: fix this\n// FIXME: broken\n');

    const output = runCli(['scan', tmpDir, '--format', 'json']);

    const entries = parseJsonOutput(output);
    expect(Array.isArray(entries)).toBe(true);
    expect(entries).toHaveLength(2);
  });

  it('should include all required fields in JSON output', () => {
    fs.writeFileSync(path.join(tmpDir, 'test.js'), '// TODO: fix this\n');

    const output = runCli(['scan', tmpDir, '--format', 'json']);

    const entries = parseJsonOutput(output);
    expect(entries[0]).toHaveProperty('file');
    expect(entries[0]).toHaveProperty('line');
    expect(entries[0]).toHaveProperty('text');
    expect(entries[0]).toHaveProperty('marker');
    expect(entries[0]).toHaveProperty('blame');
    expect(entries[0]).toHaveProperty('ageDays');
    expect(entries[0]).toHaveProperty('isStale');
  });

  it('should include marker type in JSON output', () => {
    fs.writeFileSync(path.join(tmpDir, 'a.js'), '// TODO: task 1\n');
    fs.writeFileSync(path.join(tmpDir, 'b.js'), '// FIXME: task 2\n');
    fs.writeFileSync(path.join(tmpDir, 'c.js'), '// HACK: task 3\n');
    fs.writeFileSync(path.join(tmpDir, 'd.js'), '// XXX: task 4\n');

    const output = runCli(['scan', tmpDir, '--format', 'json']);

    const entries = parseJsonOutput(output);
    const markers = entries.map(e => e.marker);
    expect(markers).toContain('TODO');
    expect(markers).toContain('FIXME');
    expect(markers).toContain('HACK');
    expect(markers).toContain('XXX');
  });

  it('should output empty array when no markers found', () => {
    fs.writeFileSync(path.join(tmpDir, 'clean.js'), 'function hello() { return 42; }\n');

    const output = runCli(['scan', tmpDir, '--format', 'json']);

    const entries = parseJsonOutput(output);
    expect(Array.isArray(entries)).toBe(true);
    expect(entries).toHaveLength(0);
  });

  it('should include blame info in JSON output for tracked files', () => {
    const repoDir = path.join(tmpDir, 'repo');
    fs.mkdirSync(repoDir, { recursive: true });

    execFileSync('git', ['init'], { cwd: repoDir });
    execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: repoDir });
    execFileSync('git', ['config', 'user.name', 'Test User'], { cwd: repoDir });

    const filePath = path.join(repoDir, 'test.js');
    fs.writeFileSync(filePath, '// TODO: tracked task\n');
    execFileSync('git', ['add', 'test.js'], { cwd: repoDir });
    execFileSync('git', ['commit', '-m', 'initial'], { cwd: repoDir });

    const output = runCli(['scan', repoDir, '--format', 'json']);

    const entries = parseJsonOutput(output);
    expect(entries).toHaveLength(1);
    expect(entries[0].blame).not.toBeNull();
    expect(entries[0].blame!.author).toBe('Test User');
    expect(entries[0].blame!.commitHash).toHaveLength(40);
    expect(entries[0].ageDays).toBeGreaterThanOrEqual(0);
  });

  it('should include stale flag in JSON output', () => {
    const repoDir = path.join(tmpDir, 'repo2');
    fs.mkdirSync(repoDir, { recursive: true });

    execFileSync('git', ['init'], { cwd: repoDir });
    execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: repoDir });
    execFileSync('git', ['config', 'user.name', 'Test User'], { cwd: repoDir });

    const filePath = path.join(repoDir, 'old.js');
    fs.writeFileSync(filePath, '// TODO: old task\n');

    const oldDate = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000);
    const env = { ...process.env, GIT_AUTHOR_DATE: oldDate.toISOString(), GIT_COMMITTER_DATE: oldDate.toISOString() };
    execFileSync('git', ['add', 'old.js'], { cwd: repoDir, env });
    execFileSync('git', ['commit', '-m', 'old commit'], { cwd: repoDir, env });

    const output = runCli(['scan', repoDir, '--format', 'json', '--stale-days', '90']);

    const entries = parseJsonOutput(output);
    expect(entries).toHaveLength(1);
    expect(entries[0].isStale).toBe(true);
  });
});

describe('CLI argument parsing', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'todo-sentry-args-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should filter by file extension with --ext flag', () => {
    fs.writeFileSync(path.join(tmpDir, 'file.js'), '// TODO: in js\n');
    fs.writeFileSync(path.join(tmpDir, 'file.py'), '// TODO: in py\n');
    fs.writeFileSync(path.join(tmpDir, 'file.ts'), '// TODO: in ts\n');

    const output = runCli(['scan', tmpDir, '--ext', 'js', '--format', 'json']);
    const entries = parseJsonOutput(output);

    expect(entries).toHaveLength(1);
    expect(entries[0].file).toContain('file.js');
  });

  it('should filter by file extension with --extensions flag', () => {
    fs.writeFileSync(path.join(tmpDir, 'file.js'), '// TODO: in js\n');
    fs.writeFileSync(path.join(tmpDir, 'file.py'), '// TODO: in py\n');

    const output = runCli(['scan', tmpDir, '--extensions', 'py', '--format', 'json']);
    const entries = parseJsonOutput(output);

    expect(entries).toHaveLength(1);
    expect(entries[0].file).toContain('file.py');
  });

  it('should support multiple file extensions', () => {
    fs.writeFileSync(path.join(tmpDir, 'file.js'), '// TODO: in js\n');
    fs.writeFileSync(path.join(tmpDir, 'file.py'), '// TODO: in py\n');
    fs.writeFileSync(path.join(tmpDir, 'file.ts'), '// TODO: in ts\n');

    const output = runCli(['scan', tmpDir, '--ext', 'js,py', '--format', 'json']);
    const entries = parseJsonOutput(output);

    expect(entries).toHaveLength(2);
    const files = entries.map(e => path.basename(e.file));
    expect(files).toContain('file.js');
    expect(files).toContain('file.py');
  });

  it('should filter by custom markers with --markers flag', () => {
    fs.writeFileSync(path.join(tmpDir, 'file.js'), '// BUG: something wrong\n// TODO: not matched\n');

    const output = runCli(['scan', tmpDir, '--markers', 'BUG', '--format', 'json']);
    const entries = parseJsonOutput(output);

    expect(entries).toHaveLength(1);
    expect(entries[0].marker).toBe('BUG');
  });

  it('should support multiple custom markers', () => {
    fs.writeFileSync(path.join(tmpDir, 'file.js'), '// BUG: something wrong\n// REVIEW: needs review\n// TODO: not matched\n');

    const output = runCli(['scan', tmpDir, '--markers', 'BUG,REVIEW', '--format', 'json']);
    const entries = parseJsonOutput(output);

    expect(entries).toHaveLength(2);
    const markers = entries.map(e => e.marker);
    expect(markers).toContain('BUG');
    expect(markers).toContain('REVIEW');
  });

  it('should use default format (text) when --format is omitted', () => {
    fs.writeFileSync(path.join(tmpDir, 'test.js'), '// TODO: fix this\n');

    const output = runCli(['scan', tmpDir]);

    expect(output).toContain('=== TODOs by File ===');
    expect(output).toContain('=== TODOs by Author ===');
    expect(output).toContain('=== Summary ===');
  });

  it('should accept positional argument as root directory', () => {
    fs.writeFileSync(path.join(tmpDir, 'test.js'), '// TODO: positional root\n');

    const output = runCli([tmpDir, '--format', 'json']);
    const entries = parseJsonOutput(output);

    expect(entries).toHaveLength(1);
    expect(entries[0].marker).toBe('TODO');
  });

  it('should handle --stale-days flag', () => {
    const repoDir = path.join(tmpDir, 'repo');
    fs.mkdirSync(repoDir, { recursive: true });

    execFileSync('git', ['init'], { cwd: repoDir });
    execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: repoDir });
    execFileSync('git', ['config', 'user.name', 'Test User'], { cwd: repoDir });

    const filePath = path.join(repoDir, 'test.js');
    fs.writeFileSync(filePath, '// TODO: test\n');
    execFileSync('git', ['add', 'test.js'], { cwd: repoDir });
    execFileSync('git', ['commit', '-m', 'initial'], { cwd: repoDir });

    const output = runCli(['scan', repoDir, '--stale-days', '0', '--format', 'json']);
    const entries = parseJsonOutput(output);

    // With stale-days=0, a freshly committed file (0 days old) should not be stale
    // since the check is ageDays > staleDays (0 > 0 is false)
    expect(entries).toHaveLength(1);
    expect(entries[0].isStale).toBe(false);
  });

  it('should output text format by default', () => {
    fs.writeFileSync(path.join(tmpDir, 'test.js'), '// TODO: fix this\n');

    const output = runCli(['scan', tmpDir]);

    expect(output).toContain('=== TODOs by File ===');
    expect(output).toContain('TODO: fix this');
  });

  it('should output markdown format with --format md', () => {
    fs.writeFileSync(path.join(tmpDir, 'test.js'), '// TODO: fix this\n');

    const output = runCli(['scan', tmpDir, '--format', 'md']);

    expect(output).toContain('# TODO Task List');
    expect(output).toContain('- [ ]');
  });

  it('should output json format with --format json', () => {
    fs.writeFileSync(path.join(tmpDir, 'test.js'), '// TODO: fix this\n');

    const output = runCli(['scan', tmpDir, '--format', 'json']);

    const entries = parseJsonOutput(output);
    expect(Array.isArray(entries)).toBe(true);
    expect(entries).toHaveLength(1);
  });

  it('should handle --root flag', () => {
    fs.writeFileSync(path.join(tmpDir, 'test.js'), '// TODO: root flag\n');

    const output = runCli(['scan', '--root', tmpDir, '--format', 'json']);
    const entries = parseJsonOutput(output);

    expect(entries).toHaveLength(1);
  });

  it('should handle combined flags', () => {
    fs.writeFileSync(path.join(tmpDir, 'file.js'), '// BUG: js bug\n// TODO: js todo\n');
    fs.writeFileSync(path.join(tmpDir, 'file.py'), '// BUG: py bug\n// TODO: py todo\n');

    const output = runCli(['scan', tmpDir, '--markers', 'BUG', '--ext', 'js', '--format', 'json']);
    const entries = parseJsonOutput(output);

    expect(entries).toHaveLength(1);
    expect(entries[0].marker).toBe('BUG');
    expect(entries[0].file).toContain('file.js');
  });
});
