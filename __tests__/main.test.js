import { jest } from '@jest/globals'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import * as core from '../__fixtures__/core.js'
import * as github from '../__fixtures__/github.js'

const git = {
  syncWithRemote: jest.fn(),
  listTags: jest.fn(),
  changedFiles: jest.fn(),
  diffContains: jest.fn(),
  commitAll: jest.fn(),
  tag: jest.fn(),
  push: jest.fn()
}

jest.unstable_mockModule('@actions/core', () => core)
jest.unstable_mockModule('@actions/github', () => github)
jest.unstable_mockModule('../src/github/git.js', () => git)

const { run } = await import('../src/main.js')

const inputs = {
  'github-token': 'token',
  'changelog-path': 'CHANGELOG.md',
  'version-command': '',
  'tag-prefix': 'v',
  'major-label': 'major',
  'minor-label': 'minor',
  'patch-label': 'patch',
  'skip-label': 'skip-release',
  'commit-user-name': 'Release Bot',
  'commit-user-email': 'bot@example.com'
}
const author = { name: 'Release Bot', email: 'bot@example.com' }

const mergedPullRequest = (overrides = {}) => ({
  number: 7,
  merged: true,
  title: 'Add the thing',
  body: '### Added\n- A new thing',
  labels: [],
  ...overrides
})

let previousDirectory
let directory

const readChangelog = () =>
  fs.readFileSync(path.join(directory, 'CHANGELOG.md'), 'utf8')

beforeEach(() => {
  jest.resetAllMocks()
  github.getOctokit.mockImplementation(() => ({
    rest: { repos: { createRelease: github.createRelease } }
  }))
  github.createRelease.mockResolvedValue({
    data: { html_url: 'https://github.com/octo/widgets/releases/tag/v1.3.0' }
  })
  core.getInput.mockImplementation((name) => inputs[name])
  git.listTags.mockResolvedValue([])
  git.changedFiles.mockResolvedValue(['CHANGELOG.md'])
  git.diffContains.mockResolvedValue(true)
  github.context.payload = {
    pull_request: mergedPullRequest(),
    repository: {
      default_branch: 'main',
      html_url: 'https://github.com/octo/widgets'
    }
  }
  previousDirectory = process.cwd()
  directory = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'pr-to-release-'))
  )
  process.chdir(directory)
})

afterEach(() => {
  process.chdir(previousDirectory)
  fs.rmSync(directory, { recursive: true, force: true })
})

describe('run', () => {
  it('does nothing when the pull request is not merged', async () => {
    github.context.payload.pull_request = mergedPullRequest({ merged: false })

    await run()

    expect(core.info).toHaveBeenCalledWith(
      'The pull request is not merged. Nothing to do.'
    )
    expect(core.setOutput).toHaveBeenCalledWith('released', 'false')
    expect(git.syncWithRemote).not.toHaveBeenCalled()
  })

  it('does nothing when there is no pull request', async () => {
    github.context.payload = {}

    await run()

    expect(core.setOutput).toHaveBeenCalledWith('released', 'false')
    expect(git.syncWithRemote).not.toHaveBeenCalled()
  })

  it('adds the entries and commits when there is no release label', async () => {
    await run()

    expect(git.syncWithRemote).toHaveBeenCalledWith(directory, 'main')
    expect(readChangelog()).toContain('### Added\n- A new thing')
    expect(git.commitAll).toHaveBeenCalledWith(
      directory,
      'Update the changelog for #7',
      author
    )
    expect(git.push).toHaveBeenCalledWith(directory, 'main')
    expect(git.tag).not.toHaveBeenCalled()
    expect(github.createRelease).not.toHaveBeenCalled()
    expect(core.setOutput).toHaveBeenCalledWith('released', 'false')
  })

  it('files a title entry under Fixed when the body is null', async () => {
    github.context.payload.pull_request = mergedPullRequest({
      title: 'Fix the link',
      body: null
    })

    await run()

    expect(readChangelog()).toContain('### Fixed\n- Fix the link')
  })

  it('stops when nothing changed and there is no release label', async () => {
    git.changedFiles.mockResolvedValue([])

    await run()

    expect(git.commitAll).not.toHaveBeenCalled()
    expect(git.push).not.toHaveBeenCalled()
    expect(core.setOutput).toHaveBeenCalledWith('released', 'false')
  })

  it('cuts a release when the pull request has a release label', async () => {
    inputs['version-command'] = 'echo $NEXT_VERSION > version.txt'
    github.context.payload.pull_request = mergedPullRequest({
      labels: [{ name: 'minor' }]
    })
    git.listTags.mockResolvedValue(['v1.2.3'])

    try {
      await run()
    } finally {
      inputs['version-command'] = ''
    }

    expect(fs.readFileSync('version.txt', 'utf8').trim()).toBe('1.3.0')
    expect(git.diffContains).toHaveBeenCalledWith(directory, '1.3.0')
    expect(readChangelog()).toContain('## [1.3.0] - ')
    expect(git.commitAll).toHaveBeenCalledWith(
      directory,
      'Release v1.3.0',
      author
    )
    expect(git.tag).toHaveBeenCalledWith(directory, 'v1.3.0')
    expect(git.push).toHaveBeenCalledWith(directory, 'main', 'v1.3.0')
    expect(github.createRelease).toHaveBeenCalledWith({
      owner: 'octo',
      repo: 'widgets',
      tag_name: 'v1.3.0',
      name: 'v1.3.0',
      body: '### Added\n- A new thing'
    })
    expect(core.setOutput).toHaveBeenCalledWith('released', 'true')
    expect(core.setOutput).toHaveBeenCalledWith('version', '1.3.0')
    expect(core.setOutput).toHaveBeenCalledWith('tag', 'v1.3.0')
    expect(core.setOutput).toHaveBeenCalledWith(
      'release-url',
      'https://github.com/octo/widgets/releases/tag/v1.3.0'
    )
  })

  it('passes the release level to the version command', async () => {
    inputs['version-command'] =
      'echo $RELEASE_LEVEL $CURRENT_VERSION > version.txt'
    github.context.payload.pull_request = mergedPullRequest({
      labels: [{ name: 'minor' }]
    })
    git.listTags.mockResolvedValue(['v1.2.3'])

    try {
      await run()
    } finally {
      inputs['version-command'] = ''
    }

    expect(fs.readFileSync('version.txt', 'utf8').trim()).toBe('minor 1.2.3')
  })

  it('skips the version check when there is no version command', async () => {
    github.context.payload.pull_request = mergedPullRequest({
      labels: [{ name: 'patch' }]
    })

    await run()

    expect(git.diffContains).not.toHaveBeenCalled()
    expect(git.tag).toHaveBeenCalledWith(directory, 'v0.0.1')
  })

  it('fails when the version command exits with an error', async () => {
    inputs['version-command'] = 'exit 3'
    github.context.payload.pull_request = mergedPullRequest({
      labels: [{ name: 'minor' }]
    })

    try {
      await run()
    } finally {
      inputs['version-command'] = ''
    }

    expect(core.setFailed).toHaveBeenCalledWith(
      expect.stringContaining('exit code 3')
    )
    expect(git.commitAll).not.toHaveBeenCalled()
  })

  it('fails when the version command does not write the next version', async () => {
    inputs['version-command'] = 'true'
    github.context.payload.pull_request = mergedPullRequest({
      labels: [{ name: 'minor' }]
    })
    git.listTags.mockResolvedValue(['v1.2.3'])
    git.diffContains.mockResolvedValue(false)

    try {
      await run()
    } finally {
      inputs['version-command'] = ''
    }

    expect(core.setFailed).toHaveBeenCalledWith(
      'The version command did not write 1.3.0 into any file. Tag the current version before you adopt the action.'
    )
    expect(git.commitAll).not.toHaveBeenCalled()
  })

  it('fails when the push is rejected', async () => {
    github.context.payload.pull_request = mergedPullRequest({
      labels: [{ name: 'minor' }]
    })
    git.push.mockRejectedValue(new Error('Push rejected: stale info'))

    await run()

    expect(core.setFailed).toHaveBeenCalledWith('Push rejected: stale info')
    expect(github.createRelease).not.toHaveBeenCalled()
  })
})
