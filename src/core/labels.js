export function releaseLevel(labelNames, names) {
  if (labelNames.includes(names.skip)) return null
  return (
    ['major', 'minor', 'patch'].find((level) =>
      labelNames.includes(names[level])
    ) ?? null
  )
}
