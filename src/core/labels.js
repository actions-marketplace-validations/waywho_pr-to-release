export function releaseLevel(labelNames, names) {
  const levels = ['major', 'minor', 'patch'].filter((level) =>
    labelNames.includes(names[level])
  )
  if (levels.length > 1) {
    throw new Error(
      `The pull request has more than one release label: ${levels.map((level) => names[level]).join(', ')}. Use one release label.`
    )
  }
  return levels[0] ?? null
}
