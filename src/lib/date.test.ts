import { describe, it, expect } from 'vitest';
import { normalizeDate } from './date';

describe('normalizeDate', () => {
  it('passes through ISO dates', () => {
    expect(normalizeDate('2026-07-01')).toBe('2026-07-01');
  });
  it('converts MM/DD/YYYY to ISO', () => {
    expect(normalizeDate('07/01/2026')).toBe('2026-07-01');
    expect(normalizeDate('7/1/2026')).toBe('2026-07-01');
  });
  it('rejects unrecognized formats', () => {
    expect(() => normalizeDate('nope')).toThrow();
  });
});
