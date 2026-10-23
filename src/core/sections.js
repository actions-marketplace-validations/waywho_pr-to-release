export const SECTIONS = [
  'Added',
  'Changed',
  'Deprecated',
  'Removed',
  'Fixed',
  'Security'
]

export const emptyEntries = () =>
  Object.fromEntries(SECTIONS.map((section) => [section, []]))
