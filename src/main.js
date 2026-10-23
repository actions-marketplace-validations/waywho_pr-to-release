import * as core from '@actions/core'
import { exec } from '@actions/exec'
import * as github from '@actions/github'
import fs from 'node:fs'
import path from 'node:path'
import { addUnreleased, cutRelease, ensureChangelog } from './core/changelog.js'
import { releaseLevel } from './core/labels.js'
import { entriesFor } from './core/pull-request.js'
import { currentVersion, nextVersion } from './core/version.js'
import {
  changedFiles,
  commitFiles,
  diffContains,
  listTags,
  push,
  syncWithRemote,
  tag,
  tagContains
} from './github/git.js'

export async function run() {
  try {
    const { payload } = github.context
    const pullRequest = payload.pull_request
    const level =
      pullRequest &&
      releaseLevel(
        pullRequest.labels.map((label) => label.name),
        {
          major: core.getInput('major-label'),
          minor: core.getInput('minor-label'),
          patch: core.getInput('patch-label')
        }
      )
    if (pullRequest?.merged !== true) {
      core.info('The pull request is not merged. Nothing to do.')
      core.setOutput('released', 'false')
      return
    }

    const cwd = process.cwd()
    const branch = payload.repository.default_branch
    const author = {
      name: core.getInput('commit-user-name'),
      email: core.getInput('commit-user-email')
    }
    await syncWithRemote(cwd, branch)
    const before = await changedFiles(cwd)

    const entries = entriesFor(pullRequest)
    const changelogPath = core.getInput('changelog-path')
    const changelogFile = path.join(cwd, changelogPath)
    const original = fs.existsSync(changelogFile)
      ? fs.readFileSync(changelogFile, 'utf8')
      : null
    const crlf = original?.includes('\r\n') ?? false
    const existing = original?.replace(/\r\n/g, '\n') ?? null
    const changelog = ensureChangelog(existing)
    const writeChangelog = (text) => {
      fs.mkdirSync(path.dirname(changelogFile), { recursive: true })
      fs.writeFileSync(changelogFile, crlf ? text.replace(/\n/g, '\r\n') : text)
    }

    if (!level) {
      const text = addUnreleased(changelog, entries)
      if (text !== existing) {
        writeChangelog(text)
        await commitFiles(
          cwd,
          `Update the changelog for #${pullRequest.number}`,
          [changelogPath],
          author
        )
        await push(cwd, branch)
      }
      core.setOutput('released', 'false')
      return
    }

    const tagPrefix = core.getInput('tag-prefix')
    const current = currentVersion(await listTags(cwd), tagPrefix)
    const currentTag = `${tagPrefix}${current}`
    if (
      current !== '0.0.0' &&
      (await tagContains(cwd, currentTag, pullRequest.merge_commit_sha))
    ) {
      core.info(
        `Pull request #${pullRequest.number} is already in ${currentTag}. Nothing to do.`
      )
      core.setOutput('released', 'false')
      return
    }
    const next = nextVersion(current, level)
    const versionCommand = core.getInput('version-command')
    let versionFiles = []
    if (versionCommand) {
      const exitCode = await exec('bash', ['-c', versionCommand], {
        cwd,
        env: {
          ...process.env,
          RELEASE_LEVEL: level,
          NEXT_VERSION: next,
          CURRENT_VERSION: current
        },
        ignoreReturnCode: true
      })
      if (exitCode !== 0) {
        core.setFailed(`The version command failed with exit code ${exitCode}.`)
        return
      }
      versionFiles = (await changedFiles(cwd)).filter(
        (file) => !before.includes(file)
      )
      if (
        versionFiles.length === 0 ||
        !(await diffContains(cwd, next, versionFiles))
      ) {
        core.setFailed(
          `The version command did not write ${next} into any file. Tag the current version before you adopt the action.`
        )
        return
      }
    }

    const { text, notes } = cutRelease(changelog, {
      entries,
      version: next,
      previousVersion: current,
      date: new Date().toISOString().slice(0, 10),
      repoUrl: payload.repository.html_url,
      tagPrefix
    })
    writeChangelog(text)
    const tagName = `${tagPrefix}${next}`
    await commitFiles(
      cwd,
      `Release ${tagName}`,
      [changelogPath, ...versionFiles],
      author
    )
    await tag(cwd, tagName)
    await push(cwd, branch, tagName)

    const { data } = await github
      .getOctokit(core.getInput('github-token'))
      .rest.repos.createRelease({
        ...github.context.repo,
        tag_name: tagName,
        name: tagName,
        body: notes
      })
    core.setOutput('released', 'true')
    core.setOutput('version', next)
    core.setOutput('tag', tagName)
    core.setOutput('release-url', data.html_url)
  } catch (error) {
    core.setFailed(error.message)
  }
}
