# Smart GitHub Release Action

[![Release](https://img.shields.io/endpoint?url=https%3A%2F%2Fraw.githubusercontent.com%2FDev-kitx%2Fsmart-gh-release%2Fmain%2F.github%2Fbadges%2Frelease.json)](https://github.com/Dev-kitx/smart-gh-release/releases/latest)

[![codecov](https://codecov.io/gh/Dev-kitx/smart-gh-release/graph/badge.svg?token=MH8WESXRR8)](https://codecov.io/gh/Dev-kitx/smart-gh-release)

A feature-rich GitHub Release action that goes beyond what any single marketplace action offers — auto semantic versioning, smart grouped changelogs, SHA-256 checksums, contributor credits, pre-release channels, required-asset validation, GitHub Discussions, and rich Job Summaries, all in one action.

---

## Features

| Feature                       | Description                                                                                                                                                                                                                   |
|-------------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Auto semantic versioning**  | Reads conventional commits since the last tag and computes the next `major` / `minor` / `patch` version automatically. No need to hardcode tags in your workflow.                                                             |
| **Pre-release channels**      | Set `prerelease_channel: beta` to produce `v1.1.0-beta.1`, `v1.1.0-beta.2`, etc. The counter increments automatically per channel.                                                                                            |
| **Breaking change detection** | `feat!:` or `BREAKING CHANGE:` in a commit footer forces a major bump and appears under a prominent `🚨 Breaking Changes` section at the top of the changelog.                                                                |
| **Grouped emoji changelog**   | Commits are grouped by conventional type (`✨ Features`, `🐛 Bug Fixes`, `⚡ Performance`, …). Fully customisable via a JSON `changelog_sections` input.                                                                        |
| **SHA-256 checksum file**     | Automatically generates a `checksums.txt` for every uploaded asset and uploads it alongside them — no extra step or script required.                                                                                          |
| **Required asset validation** | Declare glob patterns that *must* resolve to at least one file. The release is aborted if any required artifact is missing, preventing incomplete publishes.                                                                  |
| **Contributor credits**       | Lists every human contributor with a link to their GitHub profile. Bots (dependabot, renovate, github-actions, snyk, release-please, …) are automatically excluded.                                                           |
| **GitHub Discussions**        | Optionally creates an announcement Discussion in any category you choose, linked back to the release page.                                                                                                                    |
| **PR release comments**       | After a release is published, automatically posts a comment on every merged PR that was included in the release, linking back to the release URL.                                                                             |
| **Rich Job Summary**          | A formatted table appears in the GitHub Actions UI showing version, bump level, asset count, contributor count, and the full changelog — no log digging needed.                                                               |
| **Update-or-create**          | Set `update_existing: true` to patch an existing release instead of failing. Useful for draft-then-publish workflows.                                                                                                         |
| **Release badge**             | Commits a `.github/badges/release.json` shields.io endpoint file to the repo so you can display a live version badge in your README with no third-party service.                                                              |
| **Floating major tag**        | Optionally creates or force-updates a `v{major}` tag (e.g. `v1`) pointing to the latest release commit — so consumers can pin to `@v1` and always get the latest. Supports an optional approval gate via GitHub Environments. |

---

## Quick Start

### Option A — Push a tag manually

```yaml
# .github/workflows/release.yml
name: Release

on:
  push:
    tags:
      - 'v*'

permissions:
  contents: write

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: Dev-Kitx/smart-gh-release@v1
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
          generate_checksums: true
          include_contributors: true
```

### Option B — Fully automatic versioning on every merge to `main`

```yaml
# .github/workflows/release.yml
name: Release

on:
  push:
    branches: [main]

permissions:
  contents: write

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0   # required for tag history

      - uses: Dev-Kitx/smart-gh-release@v1
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
          auto_version: true
          generate_checksums: true
          include_contributors: true
```

With `auto_version: true` you never write a tag or bump a version number manually. The action analyses your conventional commits since the last tag and decides.

---

## Inputs

### Authentication

| Input   | Required | Default               | Description                                                                                   |
|---------|----------|-----------------------|-----------------------------------------------------------------------------------------------|
| `token` | No       | `${{ github.token }}` | GitHub token. Needs `contents: write`. Add `discussions: write` if using `create_discussion`. |

### Versioning

| Input              | Required | Default        | Description                                                                    |
|--------------------|----------|----------------|--------------------------------------------------------------------------------|
| `tag`              | No       | —              | Explicit tag to release (e.g. `v1.2.3`). Takes precedence over `auto_version`. |
| `auto_version`     | No       | `false`        | Compute the next tag from conventional commits.                                |
| `version_prefix`   | No       | `v`            | Prefix prepended to auto-generated version numbers.                            |
| `initial_version`  | No       | `0.1.0`        | Seed version used when no prior semver tags exist.                             |
| `target_commitish` | No       | triggering SHA | Commit SHA or branch to tag.                                                   |

### Release Metadata

| Input                | Required | Default  | Description                                                                                                                     |
|----------------------|----------|----------|---------------------------------------------------------------------------------------------------------------------------------|
| `name`               | No       | tag name | Release title.                                                                                                                  |
| `body`               | No       | —        | Custom text prepended to the auto-generated changelog.                                                                          |
| `draft`              | No       | `false`  | Publish as a draft.                                                                                                             |
| `prerelease`         | No       | `false`  | Mark as pre-release.                                                                                                            |
| `prerelease_channel` | No       | —        | Channel identifier: `alpha`, `beta`, or `rc`. Implies `prerelease: true`. Used by `auto_version` to produce versioned channels. |

### Changelog

| Input                | Required | Default         | Description                                                                          |
|----------------------|----------|-----------------|--------------------------------------------------------------------------------------|
| `changelog_sections` | No       | built-in        | JSON array to customise sections. See [Custom Sections](#custom-changelog-sections). |
| `exclude_types`      | No       | `ci,style,test` | Comma-separated conventional commit types to omit.                                   |

### Contributors

| Input                  | Required | Default | Description                                                                            |
|------------------------|----------|---------|----------------------------------------------------------------------------------------|
| `include_contributors` | No       | `true`  | Append a Contributors section crediting everyone who committed since the last release. |

### Assets

| Input                     | Required | Default         | Description                                                                            |
|---------------------------|----------|-----------------|----------------------------------------------------------------------------------------|
| `files`                   | No       | —               | Newline-separated file paths or glob patterns to upload.                               |
| `generate_checksums`      | No       | `true`          | Auto-generate and upload a SHA-256 `checksums.txt`.                                    |
| `checksum_file`           | No       | `checksums.txt` | Name of the checksum file.                                                             |
| `fail_on_unmatched_files` | No       | `false`         | Fail if a glob in `files` matches nothing.                                             |
| `required_assets`         | No       | —               | Newline-separated globs that **must** match a resolved file or the release is aborted. |

### Release Badge

| Input            | Required | Default | Description                                                                                                                     |
|------------------|----------|---------|---------------------------------------------------------------------------------------------------------------------------------|
| `generate_badge` | No       | `false` | Commit a shields.io endpoint badge JSON to `.github/badges/release.json` on the PR branch. See [Release Badge](#release-badge). |

### Version File Bumping

| Input                   | Required | Default | Description                                                                                                                                                                               |
|-------------------------|----------|---------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `bump_version_in_files` | No       | —       | Newline- or comma-separated list of repo-relative file paths whose version string should be bumped to match the new release version. See [Bumping Version Files](#bumping-version-files). |

### Floating Major Tag

| Input               | Required | Default | Description                                                                                                                                   |
|---------------------|----------|---------|-----------------------------------------------------------------------------------------------------------------------------------------------|
| `publish_major_tag` | No       | `false` | After publishing the release, create or force-update a floating major version tag (e.g. `v1`). See [Floating Major Tag](#floating-major-tag). |
| `major_tag_only`    | No       | `false` | Skip the full release flow and only publish the floating major tag. Requires `tag` to be set. Use in a second job with environment approval to avoid release flow side effects. |

### Behaviour

| Input             | Required | Default | Description                                                                               |
|-------------------|----------|---------|-------------------------------------------------------------------------------------------|
| `update_existing`    | No | `false` | Update an existing release for the tag instead of failing. |
| `auto_release`       | No | `true`  | Controls when the GitHub Release is created. See [Auto Release Mode](#auto-release-mode). |
| `dry_run`            | No | `false` | Compute version and changelog but make no changes. All outputs are still set. See [Dry Run](#dry-run). |
| `skip_if_no_commits` | No | `false` | Skip the release when there are no commits since the last tag. Sets `skipped: true` output. |

### GitHub Discussions

| Input                 | Required | Default         | Description                                              |
|-----------------------|----------|-----------------|----------------------------------------------------------|
| `create_discussion`   | No       | `false`         | Create a Discussion announcing the release.              |
| `discussion_category` | No       | `Announcements` | Name of the repository Discussion category to post into. |

### PR Comments

| Input            | Required | Default | Description                                                                                                                                       |
|------------------|----------|---------|---------------------------------------------------------------------------------------------------------------------------------------------------|
| `comment_on_prs` | No       | `true`  | After publishing a release, post a comment on every merged PR included in the release linking back to the release URL. Set to `false` to disable. |

---

## Outputs

| Output            | Description                                                                                                                 |
|-------------------|-----------------------------------------------------------------------------------------------------------------------------|
| `release_id`      | Numeric ID of the created / updated release.                                                                                |
| `release_url`     | HTML URL of the release page.                                                                                               |
| `upload_url`      | Asset upload URL (useful for subsequent upload steps).                                                                      |
| `tag_name`        | The resolved tag name (e.g. `v1.3.0`).                                                                                      |
| `version`         | Version string without prefix (e.g. `1.3.0`).                                                                               |
| `assets_uploaded` | Number of assets successfully uploaded.                                                                                     |
| `changelog`       | The full generated changelog in Markdown.                                                                                   |
| `bump_level`      | Detected version bump: `major`, `minor`, or `patch`.                                                                        |
| `badge_url`       | shields.io endpoint URL for the release badge (always set, regardless of `generate_badge`).                                 |
| `badge_markdown`  | Ready-to-paste Markdown for embedding the release badge in a README (always set).                                           |
| `skipped`         | `"true"` when the release was skipped (e.g. `skip_if_no_commits: true` and no commits found). `"false"` otherwise. |
| `major_tag`       | The floating major tag that was created or updated (e.g. `v1`). Set when `publish_major_tag: true` or `major_tag_only: true`. Empty string otherwise. |
| `pr_url`          | URL of the opened or updated pull request (`smart-changelog` or `smart-release`).                                           |

### Using Outputs

```yaml
- uses: Dev-Kitx/smart-gh-release@v1
  id: release
  with:
    auto_version: true

- name: Send Slack notification
  run: |
    echo "Released ${{ steps.release.outputs.tag_name }}"
    echo "Bump: ${{ steps.release.outputs.bump_level }}"
    echo "URL: ${{ steps.release.outputs.release_url }}"
```

---

## Conventional Commits

The changelog generator and auto-versioner both follow the [Conventional Commits](https://www.conventionalcommits.org/) specification.

### Supported formats

```
feat: add dark mode
fix(auth): correct token expiry
feat!: drop Node 16 support          ← breaking change (! suffix)
refactor(core)!: rewrite scheduler   ← breaking change with scope

feat: change config format

BREAKING CHANGE: config is now YAML  ← breaking change in footer
```

### Version bump rules

| Commit type                                         | Bump      |
|-----------------------------------------------------|-----------|
| Any commit with `!` or `BREAKING CHANGE:` in footer | **major** |
| `feat` / `feature`                                  | **minor** |
| Everything else                                     | **patch** |

### Default changelog sections

| Emoji | Section          | Types                     |
|-------|------------------|---------------------------|
| 🚨    | Breaking Changes | *(auto-detected)*         |
| ✨     | Features         | `feat`, `feature`         |
| 🐛    | Bug Fixes        | `fix`, `bugfix`, `hotfix` |
| ⚡     | Performance      | `perf`                    |
| ♻️    | Refactoring      | `refactor`                |
| 📚    | Documentation    | `docs`                    |
| 📦    | Build            | `build`                   |
| 🔄    | CI / CD          | `ci`                      |
| 🧪    | Tests            | `test`, `tests`           |
| 🔧    | Maintenance      | `chore`                   |
| 💅    | Code Style       | `style`                   |
| ⏪     | Reverts          | `revert`                  |
| 📌    | Other Changes    | *(anything unrecognised)* |

---

## Custom Changelog Sections

Override the default sections with a JSON array:

```yaml
- uses: Dev-Kitx/smart-gh-release@v1
  with:
    auto_version: true
    changelog_sections: |
      [
        { "types": ["feat", "feature"], "label": "What's New",    "emoji": "🎉" },
        { "types": ["fix"],             "label": "Fixes",         "emoji": "🩹" },
        { "types": ["perf"],            "label": "Speed",         "emoji": "🚀" },
        { "types": ["docs"],            "label": "Docs",          "emoji": "📖" }
      ]
```

Any commit type not covered by your custom sections lands in **📌 Other Changes**.

---

## Pre-release Channels

Use channels for staged rollouts: `alpha` → `beta` → `rc` → stable.

```yaml
# Publish to the beta channel
- uses: Dev-Kitx/smart-gh-release@v1
  with:
    auto_version: true
    prerelease_channel: beta
```

**Version progression example:**

```
v1.0.0              ← stable
v1.1.0-beta.1       ← first beta for next minor
v1.1.0-beta.2       ← second commit on beta channel
v1.1.0-rc.1         ← switched to rc channel
v1.1.0              ← stable release (channel removed)
```

The action automatically increments the channel counter. Switching to a different channel (e.g. `beta` → `rc`) resets the counter to `.1`.

---

## Asset Upload & Checksums

```yaml
- name: Build
  run: make build   # produces dist/*.tar.gz and dist/*.zip

- uses: Dev-Kitx/smart-gh-release@v1
  with:
    auto_version: true
    files: |
      dist/*.tar.gz
      dist/*.zip
    generate_checksums: true      # uploads checksums.txt automatically
    fail_on_unmatched_files: true # fail if any glob matches nothing
```

The generated `checksums.txt` looks like:

```
e3b0c44298fc1c149afb4c8996fb92427ae41e4649b934ca495991b7852b855  myapp-linux-amd64.tar.gz
a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3  myapp-darwin-arm64.tar.gz
```

### Requiring specific artifacts

Prevent releasing with missing platform builds:

```yaml
files: |
  dist/*.tar.gz
  dist/*.zip

required_assets: |
  dist/*-linux-amd64.tar.gz
  dist/*-darwin-arm64.tar.gz
  dist/*-windows-amd64.zip
```

If any required pattern goes unmatched, the release is **aborted before creation**.

---

## GitHub Discussions

```yaml
permissions:
  contents: write
  discussions: write   # required

- uses: Dev-Kitx/smart-gh-release@v1
  with:
    auto_version: true
    create_discussion: true
    discussion_category: Announcements   # must already exist in the repo
```

A Discussion is created with the release title, body, and a link back to the release page. If the category is not found, a warning is logged but the release still succeeds.

---

## Draft Workflow

Publish a draft first, review it, then promote it:

```yaml
# Step 1 — create draft
- uses: Dev-Kitx/smart-gh-release@v1
  id: draft
  with:
    auto_version: true
    draft: true

# Step 2 — run integration tests against the draft assets
- run: ./scripts/smoke-test.sh

# Step 3 — promote draft to published
- uses: Dev-Kitx/smart-gh-release@v1
  with:
    tag: ${{ steps.draft.outputs.tag_name }}
    draft: false
    update_existing: true
```

---

## Full Example

```yaml
name: Release

on:
  push:
    branches: [main]

permissions:
  contents: write
  discussions: write

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: actions/setup-node@v4
        with:
          node-version: '24'

      - run: npm ci && npm run build

      - uses: Dev-Kitx/smart-gh-release@v1
        id: release
        with:
          token: ${{ secrets.GITHUB_TOKEN }}

          # Versioning
          auto_version: true
          version_prefix: v
          initial_version: 0.1.0

          # Changelog
          exclude_types: 'ci,style,test'

          # Pre-release (remove to publish stable)
          # prerelease_channel: beta

          # Assets
          files: |
            dist/*.tar.gz
            dist/*.zip
          generate_checksums: true
          fail_on_unmatched_files: true
          required_assets: |
            dist/*-linux-amd64.tar.gz
            dist/*-darwin-arm64.tar.gz

          # Contributors
          include_contributors: true

          # Discussions
          create_discussion: true
          discussion_category: Announcements

      - name: Summary
        run: |
          echo "Tag:   ${{ steps.release.outputs.tag_name }}"
          echo "Bump:  ${{ steps.release.outputs.bump_level }}"
          echo "URL:   ${{ steps.release.outputs.release_url }}"
          echo "Files: ${{ steps.release.outputs.assets_uploaded }}"
```

---

## Release Badge

Enable `generate_badge: true` and the action commits a `.github/badges/release.json` file to the same PR branch as `CHANGELOG.md`. Once that PR is merged, the file is served over `raw.githubusercontent.com` as a live [shields.io endpoint badge](https://shields.io/badges/endpoint-badge) that always reflects the latest release version — no third-party service or token required.

```yaml
- uses: Dev-Kitx/smart-gh-release@v1
  with:
    auto_version: true
    generate_badge: true
```

Then grab the `badge_markdown` output and paste it into your README:

```yaml
- name: Update README badge
  run: echo "${{ steps.release.outputs.badge_markdown }}"
```

Or hardcode it manually using the `badge_url` output pattern:

```markdown
[![Release](https://img.shields.io/endpoint?url=https%3A%2F%2Fraw.githubusercontent.com%2FDev-kitx%2Fsmart-gh-release%2Fmain%2F.github%2Fbadges%2Frelease.json)](https://github.com/Dev-kitx/smart-gh-release/releases/latest)
```

**Badge appearance:**

| Release type                  | Color                                                                 |
|-------------------------------|-----------------------------------------------------------------------|
| Stable (`v1.3.0`)             | ![blue](https://img.shields.io/badge/release-v1.3.0-blue)             |
| Pre-release (`v1.3.0-beta.1`) | ![orange](https://img.shields.io/badge/release-v1.3.0--beta.1-orange) |

The badge lands in the default branch when the PR is merged — same timing as `CHANGELOG.md` and version files. See [Auto Release Mode](#auto-release-mode) for the timing distinction between modes.

---

## Bumping Version Files

Use `bump_version_in_files` to keep your version files in sync with the release tag. The action commits the bumped files onto the same PR branch as `CHANGELOG.md`, so everything lands in the default branch together when the PR is merged.

```yaml
- uses: Dev-Kitx/smart-gh-release@v1
  with:
    auto_version: true
    bump_version_in_files: |
      package.json
      pyproject.toml
      src/mylib/__init__.py
```

### Supported file formats

| File | Ecosystem | Pattern updated |
|---|---|---|
| `package.json` | Node.js | `"version": "x.y.z"` |
| `deno.json`, `deno.jsonc` | Deno | `"version": "x.y.z"` |
| `pyproject.toml` | Python (PEP 517 / Poetry / Hatch) | `version = "x.y.z"` |
| `setup.cfg` | Python | `version = x.y.z` |
| `setup.py` | Python | `version="x.y.z"` or `version='x.y.z'` |
| `__init__.py`, `_version.py`, `version.py` | Python | `__version__ = "x.y.z"` |
| `Cargo.toml` | Rust | `version = "x.y.z"` |
| `*.gemspec` | Ruby | `.version = "x.y.z"` |
| `pubspec.yaml` | Dart / Flutter | `version: x.y.z` (build number preserved: `1.2.3+4` → `NEWVER+4`) |
| `*.csproj` | .NET / C# | `<Version>x.y.z</Version>` |
| `pom.xml` | Java / Maven | First `<version>x.y.z</version>` (project version) |
| `gradle.properties` | Kotlin / Gradle | `version=x.y.z` |
| `Chart.yaml` | Helm | `version: x.y.z` |
| `mix.exs` | Elixir | `@version "x.y.z"` |
| `VERSION`, `version.txt` | Any | Entire file content replaced with new version |

Files with an unrecognised format or a missing version pattern are skipped with a warning — the release is never aborted because of a version bump failure.

### When the bump reaches your default branch

The timing differs between the two release modes:

| Mode                  | Branch bumped     | Reaches default branch when                                                           |
|-----------------------|-------------------|---------------------------------------------------------------------------------------|
| `auto_release: false` | `smart-release`   | The Release PR is merged (same event that triggers the GitHub Release — fully atomic) |
| `auto_release: true`  | `smart-changelog` | The Changelog PR is merged (after the GitHub Release is already live)                 |

**`auto_release: false` is the atomic choice.** Version files, `CHANGELOG.md`, and the GitHub Release are all gated behind the same PR merge. There is no window where the release tag says `v1.3.0` but `package.json` in `main` still reads `1.2.0`.

**`auto_release: true` has a short lag.** The release is published immediately; the version bump lands in `main` only when you merge the `smart-changelog` PR. For most projects this is acceptable, but if downstream tooling reads the version file from `main` straight after a release, prefer `auto_release: false`.

---

## Dry Run

Set `dry_run: true` to validate your workflow configuration without creating any releases, opening PRs, uploading assets, or updating tags. The action computes everything — version, changelog, contributors — and sets all outputs as if a real release had occurred, but makes zero API writes.

```yaml
- uses: Dev-Kitx/smart-gh-release@v1
  id: release
  with:
    auto_version: true
    dry_run: true

- name: Inspect what would be released
  run: |
    echo "Next tag:   ${{ steps.release.outputs.tag_name }}"
    echo "Bump level: ${{ steps.release.outputs.bump_level }}"
    echo "Changelog:"
    echo "${{ steps.release.outputs.changelog }}"
```

The Job Summary shows a **Dry run** banner and marks the status as `🔍 Dry run (not published)` so it's immediately clear in the Actions UI that nothing was shipped.

---

## Floating Major Tag

Enable `publish_major_tag: true` to create or force-update a floating major version tag (e.g. `v1`) every time a release is published. This lets consumers of your action pin to a stable major version without updating their workflow on every patch release.

```yaml
uses: Dev-Kitx/smart-gh-release@v1   # always the latest v1.x.x
# instead of
uses: Dev-Kitx/smart-gh-release@v1.3.0  # pinned to a specific patch
```

### Version mapping

The major version is clamped to a minimum of `1`, matching the behaviour of the `tag-major.yml` workflow — `v0.x.x` releases update `v1`.

| Release tag | Floating tag updated |
|-------------|----------------------|
| `v0.5.1`    | `v1`                 |
| `v1.3.0`    | `v1`                 |
| `v2.0.0`    | `v2`                 |

### Pattern 1 — immediate (no approval)

The major tag is published right after the release. Simple single-job setup:

```yaml
jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: Dev-Kitx/smart-gh-release@v1
        with:
          auto_version: true
          publish_major_tag: true   # v1 updated immediately after release
```

### Pattern 2 — with approval gate

For cases where updating `v1` (which affects all downstream consumers pinned to `@v1`) should require explicit sign-off, use a second job protected by a [GitHub Environment](https://docs.github.com/en/actions/deployment/targeting-different-environments/using-environments-for-deployment) with required reviewers.

```yaml
jobs:
  release:
    runs-on: ubuntu-latest
    outputs:
      tag_name: ${{ steps.release.outputs.tag_name }}
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: Dev-Kitx/smart-gh-release@v1
        id: release
        with:
          auto_version: true
          publish_major_tag: false   # skip — handled by the next job

  publish-major-tag:
    needs: release
    runs-on: ubuntu-latest
    environment: production          # configure required reviewers here in repo settings
    steps:
      - uses: Dev-Kitx/smart-gh-release@v1
        with:
          major_tag_only: true
          tag: ${{ needs.release.outputs.tag_name }}
```

GitHub pauses the `publish-major-tag` job and shows an approval UI before running. Once approved, `v1` is updated.

>[!TIP]
> Configure the `production` environment in **Settings → Environments** and add the reviewers who should approve major tag promotions.

---

## Auto Release Mode

The `auto_release` input gives you two distinct release strategies.

---

### `auto_release: true` (default) — release immediately

Behaves exactly like the classic mode: a GitHub Release is created on every push. In addition, the action opens a pull request from the `smart-changelog` branch to update `CHANGELOG.md` in your repository.

```
push to main
  └─► create GitHub Release immediately
  └─► open / update PR: smart-changelog → main  (updates CHANGELOG.md + bumps version files)
```

Merge the `smart-changelog` PR whenever you are ready. It does **not** gate the release — the release is already live. Version files are bumped in this PR, so there is a short window between the release being published and the version bump landing in `main`.

```yaml
permissions:
  contents: write
  pull-requests: write   # required to open the CHANGELOG.md PR

- uses: Dev-Kitx/smart-gh-release@v1
  with:
    token: ${{ secrets.GITHUB_TOKEN }}
    auto_version: true
    auto_release: true   # default — can be omitted
```

---

### `auto_release: false` — PR-gated release

No release is created on push. Instead, the action opens (or updates) a pull request from the `smart-release` branch containing the updated `CHANGELOG.md`. **Merging that PR triggers the GitHub Release.**

```
push to main  (any number of times)
  └─► open / update PR: smart-release → main  (accumulates CHANGELOG.md + bumps version files)

merge smart-release PR
  └─► create GitHub Release
```

Commits accumulate across multiple pushes into the same open PR. Version files are bumped on the `smart-release` branch, so merging the PR atomically updates `CHANGELOG.md`, version files, and creates the GitHub Release in one step.

```yaml
permissions:
  contents: write
  pull-requests: write   # required

- uses: Dev-Kitx/smart-gh-release@v1
  with:
    token: ${{ secrets.GITHUB_TOKEN }}
    auto_version: true
    auto_release: false
```

---

### Branch protection rules

If your default branch has **required reviews or status checks**, the `smart-changelog` / `smart-release` PR cannot be merged automatically and will require a manual merge. The action will still open the PR and log a clear message — the release workflow itself will not fail.

> **Tip:** Granting the `GITHUB_TOKEN` the `bypass branch protections` permission (repository → Settings → Branches) allows the action to merge without a review, but this is optional.

---

## Development

```bash
# Install dependencies
npm install

# Run tests (Node.js built-in test runner — no external framework)
npm test

# Build the bundled dist/index.js
npm run build
```

### Project structure

```
gh-release-action/
├── action.yml                      # Action definition & input/output schema
├── package.json
├── dist/
│   └── index.js                    # Bundled entrypoint (commit this)
└── src/
    ├── index.js                    # Main orchestrator
    ├── version-manager.js          # Semver resolution & auto-bump
    ├── version-bumper.js           # Version file detection & replacement
    ├── badge.js                    # shields.io endpoint badge generation
    ├── major-tag.js                # Floating major version tag publishing
    ├── changelog-generator.js      # Conventional commit parsing → Markdown
    ├── changelog-file.js           # CHANGELOG.md read/write via GitHub API
    ├── asset-manager.js            # Glob resolution, upload, checksums
    ├── contributors.js             # Contributor credit extraction
    ├── release-manager.js          # GitHub release CRUD
    ├── pr-manager.js               # PR open/update/label via GitHub API
    ├── discussions.js              # GitHub Discussions via GraphQL
    ├── summary.js                  # GitHub Actions Job Summary
    ├── utils.js                    # Shared helpers
    └── __tests__/
        ├── utils.test.js
        ├── changelog-generator.test.js
        ├── changelog-file.test.js
        ├── version-manager.test.js
        ├── version-bumper.test.js
        ├── badge.test.js
        ├── major-tag.test.js
        ├── asset-manager.test.js
        ├── release-manager.test.js
        ├── pr-manager.test.js
        ├── discussions.test.js
        ├── summary.test.js
        └── contributors.test.js
```

### Adding a new changelog section

Edit the `DEFAULT_SECTIONS` array in `src/utils.js`:

```js
{ types: ['security'], label: 'Security', emoji: '🔒' },
```

Or pass it at runtime via `changelog_sections` without touching the source.

---

## Permissions Reference

| Feature                            | Required permission    |
|------------------------------------|------------------------|
| Create / update releases           | `contents: write`      |
| Upload release assets              | `contents: write`      |
| Open / update PRs (`auto_release`) | `pull-requests: write` |
| Comment on PRs (`comment_on_prs`)  | `pull-requests: write` |
| Create GitHub Discussions          | `discussions: write`   |

---

## License

MIT
