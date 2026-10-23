import { releaseLevel } from '../src/core/labels.js'
import { currentVersion, nextVersion } from '../src/core/version.js'

const names = {
  major: 'major',
  minor: 'minor',
  patch: 'patch',
  skip: 'skip-release'
}
test('the highest release label wins', () =>
  expect(releaseLevel(['patch', 'minor'], names)).toBe('minor'))
test('skip-release beats a release label', () =>
  expect(releaseLevel(['major', 'skip-release'], names)).toBeNull())
test('no release label means no release', () =>
  expect(releaseLevel(['docs'], names)).toBeNull())
test('custom label names', () =>
  expect(
    releaseLevel(['semver:patch'], { ...names, patch: 'semver:patch' })
  ).toBe('patch'))
test('sorts versions as numbers', () =>
  expect(currentVersion(['v0.9.0', 'v0.10.0', 'v0.2.0'], 'v')).toBe('0.10.0'))
test('ignores tags that are not plain versions', () =>
  expect(
    currentVersion(['v1.2', 'release-3', 'v2.0.0-rc.1', 'v1.1.0'], 'v')
  ).toBe('1.1.0'))
test('starts at 0.0.0', () => expect(currentVersion([], 'v')).toBe('0.0.0'))
test('respects the tag prefix', () =>
  expect(currentVersion(['1.4.0', 'v9.0.0'], '')).toBe('1.4.0'))
test.each([
  ['major', '2.0.0'],
  ['minor', '1.3.0'],
  ['patch', '1.2.4']
])('%s after 1.2.3 is %s', (level, next) =>
  expect(nextVersion('1.2.3', level)).toBe(next)
)
