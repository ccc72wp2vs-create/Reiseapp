import { describe, expect, it } from 'vitest';
import { CHANGELOG, compareVersions, unseenChanges } from '../../shared/changelog';
import pkg from '../../package.json';

describe('changelog', () => {
  it('compares versions numerically', () => {
    expect(compareVersions('2.10.0', '2.9.0')).toBe(1);
    expect(compareVersions('2.13.1', '2.13.1')).toBe(0);
    expect(compareVersions('2.2', '2.10')).toBe(-1);
  });
  it('shows only what is newer than last seen', () => {
    expect(unseenChanges('2.13.0', '2.15.0').map((e) => e.version)).toEqual(['2.15.0', '2.14.0']);
    expect(unseenChanges(pkg.version, pkg.version)).toEqual([]);
  });
  it('has an entry for the current feature version (newest first; patch fixes need none)', () => {
    const minor = (v: string) => v.split('.').slice(0, 2).join('.');
    expect(minor(CHANGELOG[0].version)).toBe(minor(pkg.version));
    expect(compareVersions(CHANGELOG[0].version, pkg.version)).toBeLessThanOrEqual(0);
  });
});
