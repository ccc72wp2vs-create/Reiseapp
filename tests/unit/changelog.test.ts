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
    expect(unseenChanges('2.11.0', '2.15.0').map((e) => e.version)).toEqual(['2.13.0']);
    // An update without a notable feature shows nothing.
    expect(unseenChanges('2.13.0', '2.15.0')).toEqual([]);
    expect(unseenChanges(pkg.version, pkg.version)).toEqual([]);
  });
  it('never announces a version that is not released yet; newest first', () => {
    expect(compareVersions(CHANGELOG[0].version, pkg.version)).toBeLessThanOrEqual(0);
    for (let i = 1; i < CHANGELOG.length; i++) expect(compareVersions(CHANGELOG[i - 1].version, CHANGELOG[i].version)).toBe(1);
  });
});
