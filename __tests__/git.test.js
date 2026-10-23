import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  changedFiles,
  commitFiles,
  diffContains,
  listTags,
  push,
  syncWithRemote,
  tag,
  tagContains
} from '../src/github/git.js'

const identity = ['-c', 'user.name=Setup', '-c', 'user.email=setup@example.com']
const author = { name: 'Release Bot', email: 'bot@example.com' }

let root
let work
let remote

const git = (cwd, ...args) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe' }).trim()

const cloneRemote = (name) => {
  const target = path.join(root, name)
  git(root, 'clone', remote, target)
  return target
}

const commitFile = (cwd, file, content, message) => {
  fs.writeFileSync(path.join(cwd, file), content)
  git(cwd, 'add', '-A')
  git(cwd, ...identity, 'commit', '-m', message)
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'git-helpers-'))
  remote = path.join(root, 'remote.git')
  git(root, 'init', '--bare', '-b', 'main', remote)
  work = cloneRemote('work')
  git(work, 'checkout', '-B', 'main')
  commitFile(work, 'version.rb', "VERSION = '0.1.0'\n", 'Initial commit')
  git(work, 'push', 'origin', 'main')
})

afterEach(() => fs.rmSync(root, { recursive: true, force: true }))

test('syncWithRemote brings in a commit pushed by another clone', async () => {
  const other = cloneRemote('other')
  commitFile(other, 'other.txt', 'hello\n', 'From other')
  git(other, 'push', 'origin', 'main')

  await syncWithRemote(work, 'main')

  expect(git(work, 'log', '-1', '--format=%s')).toBe('From other')
})

test('listTags returns the tags of the remote', async () => {
  const other = cloneRemote('other')
  git(other, ...identity, 'tag', 'v0.1.0')
  git(other, 'push', 'origin', 'v0.1.0')
  await syncWithRemote(work, 'main')

  expect(await listTags(work)).toEqual(['v0.1.0'])
})

test('changedFiles lists tracked changes and new files', async () => {
  fs.writeFileSync(path.join(work, 'version.rb'), "VERSION = '0.2.0'\n")
  fs.writeFileSync(path.join(work, 'new.txt'), 'new\n')

  expect((await changedFiles(work)).sort()).toEqual(['new.txt', 'version.rb'])
})

test('diffContains is true when an added line has the text', async () => {
  fs.writeFileSync(path.join(work, 'version.rb'), "VERSION = '0.2.0'\n")

  expect(await diffContains(work, '0.2.0', ['version.rb'])).toBe(true)
})

test('diffContains is false when the text is absent', async () => {
  fs.writeFileSync(path.join(work, 'version.rb'), "VERSION = '0.2.0'\n")

  expect(await diffContains(work, '9.9.9', ['version.rb'])).toBe(false)
})

test('diffContains is true when a new untracked file has the text', async () => {
  fs.writeFileSync(path.join(work, 'new-version.txt'), '0.2.0\n')

  expect(await diffContains(work, '0.2.0', ['new-version.txt'])).toBe(true)
})

test('diffContains ignores a matching line in a file outside the paths', async () => {
  fs.writeFileSync(path.join(work, 'unrelated.txt'), '0.2.0\n')
  fs.writeFileSync(path.join(work, 'version.rb'), "VERSION = '0.1.1'\n")

  expect(await diffContains(work, '0.2.0', ['version.rb'])).toBe(false)
})

test('tagContains is true when the tag contains the commit', async () => {
  const commit = git(work, 'rev-parse', 'HEAD')
  git(work, ...identity, 'tag', 'v0.1.0')

  expect(await tagContains(work, 'v0.1.0', commit)).toBe(true)
})

test('tagContains is false when the commit is newer than the tag', async () => {
  git(work, ...identity, 'tag', 'v0.1.0')
  commitFile(work, 'later.txt', 'later\n', 'Later commit')

  expect(
    await tagContains(work, 'v0.1.0', git(work, 'rev-parse', 'HEAD'))
  ).toBe(false)
})

test('tagContains throws when the commit is unknown', async () => {
  git(work, ...identity, 'tag', 'v0.1.0')

  await expect(tagContains(work, 'v0.1.0', 'f'.repeat(40))).rejects.toThrow()
})

test('a rejected push leaves no tag on the remote', async () => {
  const other = cloneRemote('other')
  commitFile(other, 'other.txt', 'hello\n', 'From other')
  git(other, 'push', 'origin', 'main')
  fs.writeFileSync(path.join(work, 'CHANGELOG.md'), '# Changelog\n')
  await commitFiles(work, 'Release 0.2.0', ['CHANGELOG.md'], author)
  await tag(work, 'v0.2.0')

  await expect(push(work, 'main', 'v0.2.0')).rejects.toThrow(/^Push rejected:/)
  expect(git(remote, 'tag', '--list')).toBe('')
})

test('diffContains ignores removed lines', async () => {
  fs.writeFileSync(path.join(work, 'version.rb'), "VERSION = '0.2.0'\n")

  expect(await diffContains(work, '0.1.0', ['version.rb'])).toBe(false)
})

test('commitFiles does not commit a file outside the paths', async () => {
  fs.writeFileSync(path.join(work, 'CHANGELOG.md'), '# Changelog\n')
  fs.writeFileSync(path.join(work, 'unrelated.txt'), 'gem\n')

  await commitFiles(work, 'Update', ['CHANGELOG.md'], author)

  expect(git(work, 'show', '--name-only', '--format=', 'HEAD')).toBe(
    'CHANGELOG.md'
  )
  expect(git(work, 'status', '--short')).toBe('?? unrelated.txt')
})

test('commitFiles, tag and push put the commit and tag on the remote', async () => {
  fs.writeFileSync(path.join(work, 'CHANGELOG.md'), '# Changelog\n')

  await commitFiles(work, 'Release 0.2.0', ['CHANGELOG.md'], author)
  await tag(work, 'v0.2.0')
  await push(work, 'main', 'v0.2.0')

  expect(git(remote, 'log', '-1', '--format=%s')).toBe('Release 0.2.0')
  expect(git(remote, 'log', '-1', '--format=%an')).toBe('Release Bot')
  expect(git(remote, 'tag', '--list')).toBe('v0.2.0')
})

test('push throws Push rejected when another clone pushed first', async () => {
  const other = cloneRemote('other')
  commitFile(other, 'other.txt', 'hello\n', 'From other')
  git(other, 'push', 'origin', 'main')
  fs.writeFileSync(path.join(work, 'CHANGELOG.md'), '# Changelog\n')
  await commitFiles(work, 'Release 0.2.0', ['CHANGELOG.md'], author)

  await expect(push(work, 'main')).rejects.toThrow(/^Push rejected:/)
})
