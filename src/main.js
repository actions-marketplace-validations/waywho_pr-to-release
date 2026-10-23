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
  commitAll,
  diffContains,
  listTags,
  push,
  syncWithRemote,
  tag
} from './github/git.js'

export async function run() {
  try {
    const { payload } = github.context
    const pullRequest = payload.pull_request
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

    const entries = entriesFor(pullRequest)
    const level = releaseLevel(
      pullRequest.labels.map((label) => label.name),
      {
        major: core.getInput('major-label'),
        minor: core.getInput('minor-label'),
        patch: core.getInput('patch-label'),
        skip: core.getInput('skip-label')
      }
    )
    const changelogFile = path.join(cwd, core.getInput('changelog-path'))
    const existing = fs.existsSync(changelogFile)
      ? fs.readFileSync(changelogFile, 'utf8')
      : null
    const changelog = ensureChangelog(existing)

    if (!level) {
      fs.writeFileSync(changelogFile, addUnreleased(changelog, entries))
      if ((await changedFiles(cwd)).length > 0) {
        await commitAll(
          cwd,
          `Update the changelog for #${pullRequest.number}`,
          author
        )
        await push(cwd, branch)
      }
      core.setOutput('released', 'false')
      return
    }

    const tagPrefix = core.getInput('tag-prefix')
    const current = currentVersion(await listTags(cwd), tagPrefix)
    const next = nextVersion(current, level)
    const versionCommand = core.getInput('version-command')
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
      if (!(await diffContains(cwd, next))) {
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
    fs.writeFileSync(changelogFile, text)
    const tagName = `${tagPrefix}${next}`
    await commitAll(cwd, `Release v${next}`, author)
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
