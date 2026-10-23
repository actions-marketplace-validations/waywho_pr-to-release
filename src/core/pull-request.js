import { SECTIONS, emptyEntries } from './sections.js'

const TITLE_SECTIONS = {
  add: 'Added',
  adds: 'Added',
  added: 'Added',
  fix: 'Fixed',
  fixes: 'Fixed',
  fixed: 'Fixed',
  remove: 'Removed',
  removes: 'Removed',
  removed: 'Removed',
  delete: 'Removed',
  drop: 'Removed',
  deprecate: 'Deprecated',
  deprecates: 'Deprecated',
  deprecated: 'Deprecated',
  security: 'Security'
}

export function parseEntries(body) {
  const entries = emptyEntries()
  let currentSection = null
  for (const line of (body ?? '').split(/\r?\n/)) {
    const heading = line.match(/^###\s+(\S.*?)\s*$/)
    if (heading) {
      currentSection = SECTIONS.includes(heading[1]) ? heading[1] : null
    } else if (/^##\s/.test(line)) {
      currentSection = null
    } else if (currentSection) {
      const entry = line.match(/^- (.*\S)\s*$/)
      if (entry) entries[currentSection].push(entry[1])
    }
  }
  return entries
}

export function titleEntries(title) {
  const firstWord = title.match(/[A-Za-z]+/)?.[0].toLowerCase()
  const entries = emptyEntries()
  const section = Object.hasOwn(TITLE_SECTIONS, firstWord)
    ? TITLE_SECTIONS[firstWord]
    : 'Changed'
  entries[section].push(title)
  return entries
}

export function entriesFor({ title, body }) {
  const entries = parseEntries(body)
  return Object.values(entries).every((list) => list.length === 0)
    ? titleEntries(title)
    : entries
}
