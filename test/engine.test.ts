import { describe, it, expect } from 'vitest';
import { buildMarkerPattern, DEFAULT_MARKERS, scanRepo } from '../src/engine';

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

describe('scanRepo', () => {
  it('should return an empty result with no files', async () => {
    const result = await scanRepo({ root: '/tmp/nonexistent-dir-xyz' });
    expect(result.entries).toEqual([]);
    expect(result.total).toBe(0);
    expect(result.staleCount).toBe(0);
  });
});
