import { getExecOutput } from '@actions/exec'

const git = async (cwd, args, options = {}) =>
  getExecOutput('git', args, { cwd, silent: true, ...options })

const lines = (output) => output.split('\n').filter(Boolean)

export const syncWithRemote = async (cwd, branch) => {
  await git(cwd, ['fetch', 'origin', branch, '--tags'])
  await git(cwd, ['checkout', '-B', branch, `origin/${branch}`])
}

export const listTags = async (cwd) =>
  lines((await git(cwd, ['tag', '--list'])).stdout)

export const changedFiles = async (cwd) =>
  lines(
    (
      await git(cwd, [
        'ls-files',
        '--modified',
        '--others',
        '--exclude-standard'
      ])
    ).stdout
  )

export const diffContains = async (cwd, text, paths) => {
  await git(cwd, ['add', '--', ...paths])
  return lines(
    (await git(cwd, ['diff', '--cached', 'HEAD', '-U0', '--', ...paths])).stdout
  ).some(
    (line) =>
      line.startsWith('+') && !line.startsWith('+++') && line.includes(text)
  )
}

export const tagContains = async (cwd, tagName, commit) => {
  const { exitCode, stderr } = await git(
    cwd,
    ['merge-base', '--is-ancestor', commit, tagName],
    { ignoreReturnCode: true }
  )
  if (exitCode > 1) throw new Error(`git merge-base failed: ${stderr.trim()}`)
  return exitCode === 0
}

export const commitFiles = async (cwd, message, paths, { name, email }) => {
  await git(cwd, ['add', '--', ...paths])
  await git(cwd, [
    '-c',
    `user.name=${name}`,
    '-c',
    `user.email=${email}`,
    'commit',
    '-m',
    message
  ])
}

export const tag = async (cwd, name) => {
  await git(cwd, ['tag', name])
}

export const push = async (cwd, branch, tagName) => {
  const args = tagName
    ? ['push', '--atomic', 'origin', branch, tagName]
    : ['push', 'origin', branch]
  const { exitCode, stderr } = await git(cwd, args, { ignoreReturnCode: true })
  if (exitCode !== 0) throw new Error(`Push rejected: ${stderr.trim()}`)
}
