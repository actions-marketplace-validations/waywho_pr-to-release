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

export const diffContains = async (cwd, text) =>
  lines((await git(cwd, ['diff', 'HEAD', '-U0'])).stdout).some(
    (line) =>
      line.startsWith('+') && !line.startsWith('+++') && line.includes(text)
  )

export const commitAll = async (cwd, message, { name, email }) => {
  await git(cwd, ['add', '-A'])
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
  const refs = tagName ? [branch, tagName] : [branch]
  const { exitCode, stderr } = await git(cwd, ['push', 'origin', ...refs], {
    ignoreReturnCode: true
  })
  if (exitCode !== 0) throw new Error(`Push rejected: ${stderr.trim()}`)
}
