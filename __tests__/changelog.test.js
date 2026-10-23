import {
  HEADER,
  addUnreleased,
  ensureChangelog
} from '../src/core/changelog.js'
import { emptyEntries } from '../src/core/sections.js'

test('creates a changelog when there is none', () =>
  expect(ensureChangelog(null)).toBe(`${HEADER}\n## [Unreleased]\n`))
test('adds [Unreleased] above the first version', () =>
  expect(
    ensureChangelog(`${HEADER}\n## [1.0.0] - 2026-01-01\n### Added\n- A\n`)
  ).toBe(
    `${HEADER}\n## [Unreleased]\n\n## [1.0.0] - 2026-01-01\n### Added\n- A\n`
  ))
test('adds entries under existing and new headings in section order', () => {
  const text = `${HEADER}\n## [Unreleased]\n### Fixed\n- Old fix\n\n## [1.0.0] - 2026-01-01\n`
  const result = addUnreleased(text, {
    ...emptyEntries(),
    Added: ['Modal'],
    Fixed: ['New fix']
  })
  expect(result).toContain(
    '## [Unreleased]\n### Added\n- Modal\n### Fixed\n- Old fix\n- New fix\n\n## [1.0.0]'
  )
})
test('skips an entry that is already there', () => {
  const text = `${HEADER}\n## [Unreleased]\n### Fixed\n- Same\n`
  expect(addUnreleased(text, { ...emptyEntries(), Fixed: ['Same'] })).toBe(text)
})
test('leaves the version sections untouched', () => {
  const text = `${HEADER}\n## [Unreleased]\n\n## [1.0.0] - 2026-01-01\n### Fixed\n- Same\n`
  expect(addUnreleased(text, { ...emptyEntries(), Fixed: ['Same'] })).toContain(
    '## [Unreleased]\n### Fixed\n- Same\n\n## [1.0.0]'
  )
})
