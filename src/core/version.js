const PLAIN_VERSION = /^\d+\.\d+\.\d+$/

const parts = (version) => version.split('.').map(Number)

function compareVersions(a, b) {
  const [left, right] = [parts(a), parts(b)]
  return left[0] - right[0] || left[1] - right[1] || left[2] - right[2]
}

export function currentVersion(tags, prefix) {
  return (
    tags
      .filter((tag) => tag.startsWith(prefix))
      .map((tag) => tag.slice(prefix.length))
      .filter((version) => PLAIN_VERSION.test(version))
      .sort(compareVersions)
      .at(-1) ?? '0.0.0'
  )
}

export function nextVersion(current, level) {
  const [major, minor, patch] = parts(current)
  if (level === 'major') return `${major + 1}.0.0`
  if (level === 'minor') return `${major}.${minor + 1}.0`
  return `${major}.${minor}.${patch + 1}`
}
