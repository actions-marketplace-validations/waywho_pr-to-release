import { emptyEntries } from '../src/core/sections.js'
import {
  entriesFor,
  parseEntries,
  titleEntries
} from '../src/core/pull-request.js'

test('reads bullets under each heading', () => {
  const body =
    'Summary.\n\n### Added\n- New modal\n- `--root` flag\n### Fixed\n- Reset link\n'
  expect(parseEntries(body)).toEqual({
    ...emptyEntries(),
    Added: ['New modal', '`--root` flag'],
    Fixed: ['Reset link']
  })
})
test('stops a section at the next ## or ### heading', () => {
  expect(
    parseEntries('### Fixed\n- A\n## Notes\n- not an entry\n').Fixed
  ).toEqual(['A'])
})
test('ignores empty template bullets, prose and unknown headings', () => {
  expect(
    parseEntries('### Added\n-\n- \nSome prose\n### Other\n- x\n')
  ).toEqual(emptyEntries())
})
test('reads Windows line endings', () => {
  expect(parseEntries('### Changed\r\n- One\r\n- Two\r\n').Changed).toEqual([
    'One',
    'Two'
  ])
})
test('reads a null body as no entries', () => {
  expect(parseEntries(null)).toEqual(emptyEntries())
})
test.each([
  ['Add a modal', 'Added'],
  ['fixes the link', 'Fixed'],
  ['Drop Ruby 3.2', 'Removed'],
  ['Delete old files', 'Removed'],
  ['Deprecated the helper', 'Deprecated'],
  ['Security: bump rack', 'Security'],
  ['Tidy the code', 'Changed']
])('title %s goes under %s', (title, section) => {
  expect(titleEntries(title)[section]).toEqual([title])
})
test('uses the title only when the body has no entries', () => {
  expect(entriesFor({ title: 'Fix it', body: '### Added\n-\n' }).Fixed).toEqual(
    ['Fix it']
  )
  expect(
    entriesFor({ title: 'Fix it', body: '### Added\n- New\n' }).Fixed
  ).toEqual([])
})
