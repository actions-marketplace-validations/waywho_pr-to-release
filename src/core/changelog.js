import { SECTIONS } from './sections.js'

export const HEADER = `# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
`

const UNRELEASED_HEADING = '## [Unreleased]\n'

const afterLastContent = (lines, from, to) => {
  for (let index = to - 1; index >= from; index--) {
    if (lines[index].trim() !== '') return index + 1
  }
  return from
}

const insertEntry = (lines, section, entry) => {
  const heading = lines.indexOf(`### ${section}`)
  if (heading === -1) {
    const later = lines.findIndex((line) =>
      SECTIONS.slice(SECTIONS.indexOf(section) + 1).some(
        (name) => line === `### ${name}`
      )
    )
    const at = later === -1 ? afterLastContent(lines, 0, lines.length) : later
    lines.splice(at, 0, `### ${section}`, `- ${entry}`)
    return
  }
  const next = lines.findIndex(
    (line, index) => index > heading && line.startsWith('### ')
  )
  const sectionEnd = next === -1 ? lines.length : next
  if (lines.slice(heading, sectionEnd).includes(`- ${entry}`)) return
  lines.splice(
    afterLastContent(lines, heading + 1, sectionEnd),
    0,
    `- ${entry}`
  )
}

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
  const lines = text.slice(bodyStart, end).split('\n')
  lines.pop()
  const before = lines.length
  for (const section of SECTIONS) {
    for (const entry of entries[section]) insertEntry(lines, section, entry)
  }
  if (lines.length === before) return text
  if (end < text.length && lines.at(-1) !== '') lines.push('')
  return `${text.slice(0, bodyStart)}${lines.join('\n')}\n${text.slice(end)}`
}

const LINK_LINE = /^\[[^\]]+\]: /

export const cutRelease = (
  text,
  { entries, version, previousVersion, date, repoUrl, tagPrefix }
) => {
  const filled = addUnreleased(text, entries)
  const { bodyStart, end } = locateUnreleased(filled)
  const notes = filled.slice(bodyStart, end).trimEnd()
  const rest = filled.slice(end)
  const section = `## [${version}] - ${date}\n${notes ? `${notes}\n` : ''}`
  const released = `${filled.slice(0, bodyStart)}\n${section}${rest ? `\n${rest}` : ''}`

  const lines = released.trimEnd().split('\n')
  let linksStart = lines.length
  while (linksStart > 0 && LINK_LINE.test(lines[linksStart - 1])) linksStart--
  const olderLinks = lines
    .slice(linksStart)
    .filter((line) => !line.startsWith('[Unreleased]: '))
  const tag = `${tagPrefix}${version}`
  const versionUrl =
    previousVersion === '0.0.0'
      ? `${repoUrl}/releases/tag/${tag}`
      : `${repoUrl}/compare/${tagPrefix}${previousVersion}...${tag}`
  const links = [
    `[Unreleased]: ${repoUrl}/compare/${tag}...HEAD`,
    `[${version}]: ${versionUrl}`,
    ...olderLinks
  ]
  const content = lines.slice(0, linksStart).join('\n').trimEnd()
  return { text: `${content}\n\n${links.join('\n')}\n`, notes }
}
