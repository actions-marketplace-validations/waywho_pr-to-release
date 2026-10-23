import { SECTIONS, emptyEntries } from './sections.js'

export const HEADER = `# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
`

const UNRELEASED_HEADING = '## [Unreleased]\n'

const parseEntries = (body) => {
  const entries = emptyEntries()
  let current = null
  for (const line of body.split('\n')) {
    if (line.startsWith('### ')) {
      const heading = line.slice(4).trim()
      current = SECTIONS.includes(heading) ? entries[heading] : null
    } else if (line.startsWith('- ')) current?.push(line.slice(2))
  }
  return entries
}

const renderEntries = (entries) =>
  SECTIONS.filter((section) => entries[section].length > 0)
    .map(
      (section) =>
        `### ${section}\n${entries[section].map((entry) => `- ${entry}\n`).join('')}`
    )
    .join('')

const locateUnreleased = (text) => {
  const start = text.indexOf(UNRELEASED_HEADING)
  const bodyStart = start + UNRELEASED_HEADING.length
  const bodyLength = text.slice(bodyStart).search(/^(## |\[[^\]]+\]: )/m)
  const end = bodyLength === -1 ? text.length : bodyStart + bodyLength
  return { bodyStart, end }
}

export const ensureChangelog = (text) => {
  if (text === null) return `${HEADER}\n${UNRELEASED_HEADING}`
  if (text.includes(UNRELEASED_HEADING)) return text
  const firstVersion = text.search(/^## /m)
  if (firstVersion === -1) return `${text}\n${UNRELEASED_HEADING}`
  return `${text.slice(0, firstVersion)}${UNRELEASED_HEADING}\n${text.slice(firstVersion)}`
}

export const addUnreleased = (text, entries) => {
  const { bodyStart, end } = locateUnreleased(text)
  const merged = parseEntries(text.slice(bodyStart, end))
  let changed = false
  for (const section of SECTIONS) {
    for (const entry of entries[section]) {
      if (merged[section].includes(entry)) continue
      merged[section].push(entry)
      changed = true
    }
  }
  if (!changed) return text
  const separator = end < text.length ? '\n' : ''
  return `${text.slice(0, bodyStart)}${renderEntries(merged)}${separator}${text.slice(end)}`
}
