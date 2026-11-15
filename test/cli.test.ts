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
