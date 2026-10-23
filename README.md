# PR to Release

[![GitHub Super-Linter](https://github.com/waywho/pr-to-release/actions/workflows/linter.yml/badge.svg)](https://github.com/waywho/pr-to-release/actions/workflows/linter.yml)
[![CI](https://github.com/waywho/pr-to-release/actions/workflows/ci.yml/badge.svg)](https://github.com/waywho/pr-to-release/actions/workflows/ci.yml)
[![Check dist/](https://github.com/waywho/pr-to-release/actions/workflows/check-dist.yml/badge.svg)](https://github.com/waywho/pr-to-release/actions/workflows/check-dist.yml)
[![CodeQL](https://github.com/waywho/pr-to-release/actions/workflows/codeql-analysis.yml/badge.svg)](https://github.com/waywho/pr-to-release/actions/workflows/codeql-analysis.yml)
[![Coverage](./badges/coverage.svg)](./badges/coverage.svg)

This action writes the description of a merged pull request into a
[Keep a Changelog](https://keepachangelog.com) `CHANGELOG.md`. A release label
on the pull request also releases a new version.

## What it does

When a pull request merges, the action reads the description and the labels.

Without a release label:

1. The action adds the entries under `## [Unreleased]`.
1. The action skips an entry that is already there.
1. The action commits `Update the changelog for #<number>` and pushes.

With a release label:

1. The action finds the current version. This is the highest tag
   `<prefix>X.Y.Z`. It is `0.0.0` if no tag exists.
1. The action stops if the current tag already contains the merge commit of the
   pull request. A re-run of a released pull request does nothing.
1. The action runs `version-command`, if you set it.
1. If you set `version-command`, the action checks that the files it changed
   contain the next version. If not, the action stops before any commit.
1. The action moves `[Unreleased]` and the entries of the pull request into
   `## [<next>] - <YYYY-MM-DD>`. The date is in UTC.
1. The action updates the comparison links at the bottom of the file.
1. The action commits `Release <tag>`, creates the tag and pushes. For example,
   `Release v1.3.0`.
1. The action creates a GitHub Release. The body is the new changelog section.

A rejected push fails the action. The action then creates no release.

If the push succeeds but the GitHub Release fails, the action fails. Create the
GitHub Release for that tag by hand. A re-run does not create it.

The action commits only the changelog and the files that `version-command`
changed. It does not commit other files in the workspace.

If `CHANGELOG.md` does not exist, the action creates it with the Keep a
Changelog header.

## Labels

| Label          | Effect                                          |
| -------------- | ----------------------------------------------- |
| `major`        | Releases the next major version right away.     |
| `minor`        | Releases the next minor version right away.     |
| `patch`        | Releases the next patch version right away.     |
| `skip-release` | Adds the entries to `[Unreleased]`. No release. |
| No label       | Adds the entries to `[Unreleased]`. No release. |

- If a pull request has several release labels, the highest one wins.
- `skip-release` wins over a release label.
- You can change each label name with an input.

## How a description becomes entries

The action reads these six headings in the pull request description:

- `### Added`
- `### Changed`
- `### Deprecated`
- `### Removed`
- `### Fixed`
- `### Security`

Each `- ` line with text under a heading is one entry. A section ends at the
next `##` or `###` heading.

If no heading has an entry, the pull request title becomes one entry. The first
word of the title selects the section. Letter case does not matter.

| First word of the title                          | Section      |
| ------------------------------------------------ | ------------ |
| `Add`, `Adds`, `Added`                           | `Added`      |
| `Fix`, `Fixes`, `Fixed`                          | `Fixed`      |
| `Remove`, `Removes`, `Removed`, `Delete`, `Drop` | `Removed`    |
| `Deprecate`, `Deprecates`, `Deprecated`          | `Deprecated` |
| `Security`                                       | `Security`   |
| Any other word                                   | `Changed`    |

## Setup

1. Tag the current version once. This makes the tag and the version file agree.
   For example, if your version is 1.4.2, run these commands:

   ```bash
   git tag v1.4.2
   git push origin v1.4.2
   ```

1. Copy [`examples/pr-to-release.yml`](examples/pr-to-release.yml) to
   `.github/workflows/pr-to-release.yml`.
1. Copy [`examples/pull_request_template.md`](examples/pull_request_template.md)
   to `.github/pull_request_template.md`.
1. Create the labels `major`, `minor`, `patch` and `skip-release` in your
   repository.
1. If your project has a version file, set `version-command`. See the examples
   below.

## Inputs

| Input               | Default                                                 | Description                                                                  |
| ------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `github-token`      | `${{ github.token }}`                                   | The token that reads pull requests and creates releases.                     |
| `changelog-path`    | `CHANGELOG.md`                                          | The path of the changelog file.                                              |
| `version-command`   | empty                                                   | A command that the action runs with `bash -c` before the release commit.     |
| `tag-prefix`        | `v`                                                     | The text that starts every release tag.                                      |
| `major-label`       | `major`                                                 | The pull request label that releases a major version.                        |
| `minor-label`       | `minor`                                                 | The pull request label that releases a minor version.                        |
| `patch-label`       | `patch`                                                 | The pull request label that releases a patch version.                        |
| `skip-label`        | `skip-release`                                          | The pull request label that stops a release. The entries stay in Unreleased. |
| `commit-user-name`  | `github-actions[bot]`                                   | The author name for the changelog commit.                                    |
| `commit-user-email` | `41898282+github-actions[bot]@users.noreply.github.com` | The author email for the changelog commit.                                   |

## Outputs

| Output        | Description                                  |
| ------------- | -------------------------------------------- |
| `released`    | Is `true` when the action created a release. |
| `version`     | The version of the release.                  |
| `tag`         | The tag of the release.                      |
| `release-url` | The URL of the GitHub Release.               |

## Version command

The action runs `version-command` with `bash -c` before the release commit. The
command receives these environment variables:

- `RELEASE_LEVEL` is `major`, `minor` or `patch`.
- `NEXT_VERSION` is the version to release.
- `CURRENT_VERSION` is the version of the highest tag.

A non-zero exit code stops the action. The files that the command changes must
contain `NEXT_VERSION`. If they do not, the action stops before any commit. The
action commits these files with the changelog. It ignores files that were
already new or changed before the command ran, such as `vendor/bundle`.

Ruby, with the `bump` gem:

```yaml
- uses: ruby/setup-ruby@v1
  with:
    bundler-cache: true
- uses: waywho/pr-to-release@v1
  with:
    version-command: bundle exec bump $RELEASE_LEVEL --no-commit
```

npm:

```yaml
- uses: waywho/pr-to-release@v1
  with:
    version-command: npm version $NEXT_VERSION --no-git-tag-version
```

## Tokens

The default `GITHUB_TOKEN` has two limits:

- It cannot push to a protected branch.
- A push with this token does not start other workflows. CI does not run on the
  release commit.

To remove these limits, use a GitHub App token or a personal access token. Pass
the token to `actions/checkout` and to the action.

```yaml
steps:
  - uses: actions/create-github-app-token@v2
    id: app-token
    with:
      app-id: ${{ vars.APP_ID }}
      private-key: ${{ secrets.APP_PRIVATE_KEY }}
  - uses: actions/checkout@v5
    with:
      fetch-depth: 0
      token: ${{ steps.app-token.outputs.token }}
  - uses: waywho/pr-to-release@v1
    with:
      github-token: ${{ steps.app-token.outputs.token }}
```

## Limits

- The action does not support pull requests from forks. The token is read-only
  for them. The action does not use `pull_request_target`, because it runs with
  write access on fork code.
- The action does not support pre-release versions.
