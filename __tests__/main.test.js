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
  commitFiles: jest.fn(),
  tagContains: jest.fn(),
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

  it('fails an open pull request with two release labels', async () => {
    github.context.payload.pull_request = mergedPullRequest({
      merged: false,
      labels: [{ name: 'minor' }, { name: 'patch' }]
    })

    await run()

    expect(core.setFailed).toHaveBeenCalledWith(
      'The pull request has more than one release label: minor, patch. Use one release label.'
    )
    expect(git.syncWithRemote).not.toHaveBeenCalled()
  })

  it('passes an open pull request with one release label', async () => {
    github.context.payload.pull_request = mergedPullRequest({
      merged: false,
      labels: [{ name: 'minor' }]
    })

    await run()

    expect(core.setFailed).not.toHaveBeenCalled()
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
    expect(git.commitFiles).toHaveBeenCalledWith(
      directory,
      'Update the changelog for #7',
      ['CHANGELOG.md'],
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

  it('stops when the changelog already has the entries and there is no release label', async () => {
    await run()
    git.commitFiles.mockClear()
    git.push.mockClear()

    await run()

    expect(git.commitFiles).not.toHaveBeenCalled()
    expect(git.push).not.toHaveBeenCalled()
    expect(core.setOutput).toHaveBeenLastCalledWith('released', 'false')
  })

  it('creates the folder of the changelog when it is missing', async () => {
    inputs['changelog-path'] = 'docs/CHANGELOG.md'

    try {
      await run()
    } finally {
      inputs['changelog-path'] = 'CHANGELOG.md'
    }

    expect(
      fs.readFileSync(path.join(directory, 'docs/CHANGELOG.md'), 'utf8')
    ).toContain('### Added\n- A new thing')
    expect(git.commitFiles).toHaveBeenCalledWith(
      directory,
      'Update the changelog for #7',
      ['docs/CHANGELOG.md'],
      author
    )
  })

  it('keeps CRLF line ends in the changelog', async () => {
    fs.writeFileSync(
      path.join(directory, 'CHANGELOG.md'),
      '# Changelog\r\n\r\n## [Unreleased]\r\n'
    )

    await run()

    const text = readChangelog()
    expect(text).toContain('### Added\r\n- A new thing\r\n')
    expect(text.replace(/\r\n/g, '')).not.toContain('\n')
  })

  it('cuts a release when the pull request has a release label', async () => {
    inputs['version-command'] = 'echo $NEXT_VERSION > version.txt'
    github.context.payload.pull_request = mergedPullRequest({
      labels: [{ name: 'minor' }]
    })
    git.listTags.mockResolvedValue(['v1.2.3'])
    git.changedFiles
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(['version.txt'])

    try {
      await run()
    } finally {
      inputs['version-command'] = ''
    }

    expect(fs.readFileSync('version.txt', 'utf8').trim()).toBe('1.3.0')
    expect(git.diffContains).toHaveBeenCalledWith(directory, '1.3.0', [
      'version.txt'
    ])
    expect(readChangelog()).toContain('## [1.3.0] - ')
    expect(git.commitFiles).toHaveBeenCalledWith(
      directory,
      'Release v1.3.0',
      ['CHANGELOG.md', 'version.txt'],
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
    expect(git.commitFiles).toHaveBeenCalledWith(
      directory,
      'Release v0.0.1',
      ['CHANGELOG.md'],
      author
    )
  })

  it('names the release commit after the tag', async () => {
    inputs['tag-prefix'] = 'rel-'
    github.context.payload.pull_request = mergedPullRequest({
      labels: [{ name: 'minor' }]
    })
    git.listTags.mockResolvedValue(['rel-1.2.3'])

    try {
      await run()
    } finally {
      inputs['tag-prefix'] = 'v'
    }

    expect(git.commitFiles).toHaveBeenCalledWith(
      directory,
      'Release rel-1.3.0',
      ['CHANGELOG.md'],
      author
    )
    expect(git.tag).toHaveBeenCalledWith(directory, 'rel-1.3.0')
  })

  it('does nothing when the current tag already contains the pull request', async () => {
    inputs['version-command'] = 'echo $NEXT_VERSION > version.txt'
    github.context.payload.pull_request = mergedPullRequest({
      labels: [{ name: 'minor' }],
      merge_commit_sha: 'abc123'
    })
    git.listTags.mockResolvedValue(['v1.2.3'])
    git.tagContains.mockResolvedValue(true)

    try {
      await run()
    } finally {
      inputs['version-command'] = ''
    }

    expect(git.tagContains).toHaveBeenCalledWith(directory, 'v1.2.3', 'abc123')
    expect(core.info).toHaveBeenCalledWith(
      'Pull request #7 is already in v1.2.3. Nothing to do.'
    )
    expect(core.setOutput).toHaveBeenCalledWith('released', 'false')
    expect(fs.existsSync('version.txt')).toBe(false)
    expect(git.commitFiles).not.toHaveBeenCalled()
    expect(git.tag).not.toHaveBeenCalled()
    expect(github.createRelease).not.toHaveBeenCalled()
  })

  it('does not check for a tag when no tag exists', async () => {
    github.context.payload.pull_request = mergedPullRequest({
      labels: [{ name: 'patch' }]
    })

    await run()

    expect(git.tagContains).not.toHaveBeenCalled()
  })

  it('neither commits nor counts a file that existed before the run', async () => {
    inputs['version-command'] = 'echo $NEXT_VERSION > version.txt'
    github.context.payload.pull_request = mergedPullRequest({
      labels: [{ name: 'minor' }]
    })
    git.listTags.mockResolvedValue(['v1.2.3'])
    git.changedFiles
      .mockResolvedValueOnce(['vendor/x.txt'])
      .mockResolvedValueOnce(['vendor/x.txt', 'version.txt'])

    try {
      await run()
    } finally {
      inputs['version-command'] = ''
    }

    expect(git.diffContains).toHaveBeenCalledWith(directory, '1.3.0', [
      'version.txt'
    ])
    expect(git.commitFiles).toHaveBeenCalledWith(
      directory,
      'Release v1.3.0',
      ['CHANGELOG.md', 'version.txt'],
      author
    )
  })

  it('fails when only a file from before the run is changed', async () => {
    inputs['version-command'] = 'true'
    github.context.payload.pull_request = mergedPullRequest({
      labels: [{ name: 'minor' }]
    })
    git.listTags.mockResolvedValue(['v1.2.3'])
    git.changedFiles.mockResolvedValue(['vendor/x.txt'])

    try {
      await run()
    } finally {
      inputs['version-command'] = ''
    }

    expect(git.diffContains).not.toHaveBeenCalled()
    expect(core.setFailed).toHaveBeenCalledWith(
      'The version command did not write 1.3.0 into any file. Tag the current version before you adopt the action.'
    )
    expect(git.commitFiles).not.toHaveBeenCalled()
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
    expect(git.commitFiles).not.toHaveBeenCalled()
  })

  it('fails when the version command does not write the next version', async () => {
    inputs['version-command'] = 'true'
    github.context.payload.pull_request = mergedPullRequest({
      labels: [{ name: 'minor' }]
    })
    git.listTags.mockResolvedValue(['v1.2.3'])
    git.diffContains.mockResolvedValue(false)
    git.changedFiles
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(['version.txt'])

    try {
      await run()
    } finally {
      inputs['version-command'] = ''
    }

    expect(core.setFailed).toHaveBeenCalledWith(
      'The version command did not write 1.3.0 into any file. Tag the current version before you adopt the action.'
    )
    expect(git.commitFiles).not.toHaveBeenCalled()
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

  it('fails before any change when the pull request has two release labels', async () => {
    github.context.payload.pull_request = mergedPullRequest({
      labels: [{ name: 'major' }, { name: 'patch' }]
    })

    await run()

    expect(core.setFailed).toHaveBeenCalledWith(
      'The pull request has more than one release label: major, patch. Use one release label.'
    )
    expect(fs.existsSync(path.join(directory, 'CHANGELOG.md'))).toBe(false)
    expect(git.commitFiles).not.toHaveBeenCalled()
  })
})
