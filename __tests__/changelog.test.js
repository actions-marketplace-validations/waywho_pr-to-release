import {
  HEADER,
  addUnreleased,
  cutRelease,
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
test('keeps hand-written text in [Unreleased] byte for byte', () => {
  const text = `${HEADER}\n## [Unreleased]\nIntro prose.\n### Added\n- Wrapped entry\n  continues here\n  - nested\n### Notes\n- Remember this\n\n## [1.0.0] - 2026-01-01\n`
  expect(
    addUnreleased(text, { ...emptyEntries(), Added: ['New'], Fixed: ['Fix'] })
  ).toBe(
    `${HEADER}\n## [Unreleased]\nIntro prose.\n### Added\n- Wrapped entry\n  continues here\n  - nested\n- New\n### Notes\n- Remember this\n### Fixed\n- Fix\n\n## [1.0.0] - 2026-01-01\n`
  )
})
test('leaves the version sections untouched', () => {
  const text = `${HEADER}\n## [Unreleased]\n\n## [1.0.0] - 2026-01-01\n### Fixed\n- Same\n`
  expect(addUnreleased(text, { ...emptyEntries(), Fixed: ['Same'] })).toContain(
    '## [Unreleased]\n### Fixed\n- Same\n\n## [1.0.0]'
  )
})

const base = {
  version: '1.1.0',
  previousVersion: '1.0.0',
  date: '2026-10-23',
  repoUrl: 'https://github.com/o/r',
  tagPrefix: 'v'
}
test('moves [Unreleased] and the PR entries into the new section', () => {
  const text = `${HEADER}\n## [Unreleased]\n### Fixed\n- Waiting fix\n\n## [1.0.0] - 2026-01-01\n### Added\n- A\n`
  const { text: out, notes } = cutRelease(text, {
    ...base,
    entries: { ...emptyEntries(), Added: ['Modal'] }
  })
  expect(out).toContain(
    '## [Unreleased]\n\n## [1.1.0] - 2026-10-23\n### Added\n- Modal\n### Fixed\n- Waiting fix\n\n## [1.0.0] - 2026-01-01'
  )
  expect(notes).toBe('### Added\n- Modal\n### Fixed\n- Waiting fix')
})
test('moves hand-written text under [Unreleased] into the release unchanged', () => {
  const text = `${HEADER}\n## [Unreleased]\nHand-written prose.\n\n- Wrapped bullet\n  continues here\n\n## [1.0.0] - 2026-01-01\n`
  const { text: out, notes } = cutRelease(text, {
    ...base,
    entries: emptyEntries()
  })
  expect(out).toContain(
    '## [Unreleased]\n\n## [1.1.0] - 2026-10-23\nHand-written prose.\n\n- Wrapped bullet\n  continues here\n\n## [1.0.0] - 2026-01-01'
  )
  expect(notes).toBe(
    'Hand-written prose.\n\n- Wrapped bullet\n  continues here'
  )
})
test('makes an empty section with empty notes when nothing is waiting', () => {
  const { text, notes } = cutRelease(`${HEADER}\n## [Unreleased]\n`, {
    ...base,
    entries: emptyEntries()
  })
  expect(text).toContain('## [Unreleased]\n\n## [1.1.0] - 2026-10-23\n')
  expect(notes).toBe('')
})
test('adds both links when the file has none', () => {
  const { text } = cutRelease(`${HEADER}\n## [Unreleased]\n`, {
    ...base,
    entries: { ...emptyEntries(), Fixed: ['X'] }
  })
  expect(text).toMatch(
    /\n\[Unreleased\]: https:\/\/github.com\/o\/r\/compare\/v1\.1\.0\.\.\.HEAD\n\[1\.1\.0\]: https:\/\/github.com\/o\/r\/compare\/v1\.0\.0\.\.\.v1\.1\.0\n$/
  )
})
test('updates the [Unreleased] link and keeps older links', () => {
  const text = `${HEADER}\n## [Unreleased]\n\n## [1.0.0] - 2026-01-01\n\n[Unreleased]: https://github.com/o/r/compare/v1.0.0...HEAD\n[1.0.0]: https://github.com/o/r/releases/tag/v1.0.0\n`
  const { text: out } = cutRelease(text, {
    ...base,
    entries: { ...emptyEntries(), Fixed: ['X'] }
  })
  expect(out).toContain(
    '[Unreleased]: https://github.com/o/r/compare/v1.1.0...HEAD\n[1.1.0]: https://github.com/o/r/compare/v1.0.0...v1.1.0\n[1.0.0]: https://github.com/o/r/releases/tag/v1.0.0\n'
  )
})
test('links the first release to its tag page', () => {
  const { text } = cutRelease(`${HEADER}\n## [Unreleased]\n`, {
    ...base,
    version: '0.1.0',
    previousVersion: '0.0.0',
    entries: { ...emptyEntries(), Added: ['A'] }
  })
  expect(text).toContain('[0.1.0]: https://github.com/o/r/releases/tag/v0.1.0')
})
