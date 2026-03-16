# Smart GitHub Release Action

A feature-rich GitHub Release action that goes beyond what any single marketplace action offers — auto semantic versioning, smart grouped changelogs, SHA-256 checksums, contributor credits, pre-release channels, required-asset validation, GitHub Discussions, and rich Job Summaries, all in one action.

---

## Features

| Feature | Description |
|---|---|
| **Auto semantic versioning** | Reads conventional commits since the last tag and computes the next `major` / `minor` / `patch` version automatically. No need to hardcode tags in your workflow. |
| **Pre-release channels** | Set `prerelease_channel: beta` to produce `v1.1.0-beta.1`, `v1.1.0-beta.2`, etc. The counter increments automatically per channel. |
| **Breaking change detection** | `feat!:` or `BREAKING CHANGE:` in a commit footer forces a major bump and appears under a prominent `🚨 Breaking Changes` section at the top of the changelog. |
| **Grouped emoji changelog** | Commits are grouped by conventional type (`✨ Features`, `🐛 Bug Fixes`, `⚡ Performance`, …). Fully customisable via a JSON `changelog_sections` input. |
| **SHA-256 checksum file** | Automatically generates a `checksums.txt` for every uploaded asset and uploads it alongside them — no extra step or script required. |
| **Required asset validation** | Declare glob patterns that *must* resolve to at least one file. The release is aborted if any required artifact is missing, preventing incomplete publishes. |
| **Contributor credits** | Lists every human contributor with a link to their GitHub profile. Bots (dependabot, renovate, github-actions, snyk, release-please, …) are automatically excluded. |
| **GitHub Discussions** | Optionally creates an announcement Discussion in any category you choose, linked back to the release page. |
| **Rich Job Summary** | A formatted table appears in the GitHub Actions UI showing version, bump level, asset count, contributor count, and the full changelog — no log digging needed. |
| **Update-or-create** | Set `update_existing: true` to patch an existing release instead of failing. Useful for draft-then-publish workflows. |

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

      - uses: your-org/smart-gh-release@v1
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

      - uses: your-org/smart-gh-release@v1
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

| Input | Required | Default | Description |
|---|---|---|---|
| `token` | No | `${{ github.token }}` | GitHub token. Needs `contents: write`. Add `discussions: write` if using `create_discussion`. |

### Versioning

| Input | Required | Default | Description |
|---|---|---|---|
| `tag` | No | — | Explicit tag to release (e.g. `v1.2.3`). Takes precedence over `auto_version`. |
| `auto_version` | No | `false` | Compute the next tag from conventional commits. |
| `version_prefix` | No | `v` | Prefix prepended to auto-generated version numbers. |
| `initial_version` | No | `0.1.0` | Seed version used when no prior semver tags exist. |
| `target_commitish` | No | triggering SHA | Commit SHA or branch to tag. |

### Release Metadata

| Input | Required | Default | Description |
|---|---|---|---|
| `name` | No | tag name | Release title. |
| `body` | No | — | Custom text prepended to the auto-generated changelog. |
| `draft` | No | `false` | Publish as a draft. |
| `prerelease` | No | `false` | Mark as pre-release. |
| `prerelease_channel` | No | — | Channel identifier: `alpha`, `beta`, or `rc`. Implies `prerelease: true`. Used by `auto_version` to produce versioned channels. |

### Changelog

| Input | Required | Default | Description |
|---|---|---|---|
| `changelog_sections` | No | built-in | JSON array to customise sections. See [Custom Sections](#custom-changelog-sections). |
| `exclude_types` | No | `chore,ci,style,test` | Comma-separated conventional commit types to omit. |

### Contributors

| Input | Required | Default | Description |
|---|---|---|---|
| `include_contributors` | No | `true` | Append a Contributors section crediting everyone who committed since the last release. |

### Assets

| Input | Required | Default | Description |
|---|---|---|---|
| `files` | No | — | Newline-separated file paths or glob patterns to upload. |
| `generate_checksums` | No | `true` | Auto-generate and upload a SHA-256 `checksums.txt`. |
| `checksum_file` | No | `checksums.txt` | Name of the checksum file. |
| `fail_on_unmatched_files` | No | `false` | Fail if a glob in `files` matches nothing. |
| `required_assets` | No | — | Newline-separated globs that **must** match a resolved file or the release is aborted. |

### Behaviour

| Input | Required | Default | Description |
|---|---|---|---|
| `update_existing` | No | `false` | Update an existing release for the tag instead of failing. |

### GitHub Discussions

| Input | Required | Default | Description |
|---|---|---|---|
| `create_discussion` | No | `false` | Create a Discussion announcing the release. |
| `discussion_category` | No | `Announcements` | Name of the repository Discussion category to post into. |

---

## Outputs

| Output | Description |
|---|---|
| `release_id` | Numeric ID of the created / updated release. |
| `release_url` | HTML URL of the release page. |
| `upload_url` | Asset upload URL (useful for subsequent upload steps). |
| `tag_name` | The resolved tag name (e.g. `v1.3.0`). |
| `version` | Version string without prefix (e.g. `1.3.0`). |
| `assets_uploaded` | Number of assets successfully uploaded. |
| `changelog` | The full generated changelog in Markdown. |
| `bump_level` | Detected version bump: `major`, `minor`, or `patch`. |

### Using Outputs

```yaml
- uses: your-org/smart-gh-release@v1
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

| Commit type | Bump |
|---|---|
| Any commit with `!` or `BREAKING CHANGE:` in footer | **major** |
| `feat` / `feature` | **minor** |
| Everything else | **patch** |

### Default changelog sections

| Emoji | Section | Types |
|---|---|---|
| 🚨 | Breaking Changes | *(auto-detected)* |
| ✨ | Features | `feat`, `feature` |
| 🐛 | Bug Fixes | `fix`, `bugfix`, `hotfix` |
| ⚡ | Performance | `perf` |
| ♻️ | Refactoring | `refactor` |
| 📚 | Documentation | `docs` |
| 📦 | Build & Dependencies | `build`, `deps` |
| 🔄 | CI / CD | `ci` |
| 🧪 | Tests | `test`, `tests` |
| 🔧 | Maintenance | `chore` |
| 💅 | Code Style | `style` |
| ⏪ | Reverts | `revert` |
| 📌 | Other Changes | *(anything unrecognised)* |

---

## Custom Changelog Sections

Override the default sections with a JSON array:

```yaml
- uses: your-org/smart-gh-release@v1
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
- uses: your-org/smart-gh-release@v1
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

- uses: your-org/smart-gh-release@v1
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

- uses: your-org/smart-gh-release@v1
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
- uses: your-org/smart-gh-release@v1
  id: draft
  with:
    auto_version: true
    draft: true

# Step 2 — run integration tests against the draft assets
- run: ./scripts/smoke-test.sh

# Step 3 — promote draft to published
- uses: your-org/smart-gh-release@v1
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

      - uses: your-org/smart-gh-release@v1
        id: release
        with:
          token: ${{ secrets.GITHUB_TOKEN }}

          # Versioning
          auto_version: true
          version_prefix: v
          initial_version: 0.1.0

          # Changelog
          exclude_types: 'chore,ci,style,test'

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
    ├── changelog-generator.js      # Conventional commit parsing → Markdown
    ├── asset-manager.js            # Glob resolution, upload, checksums
    ├── contributors.js             # Contributor credit extraction
    ├── release-manager.js          # GitHub release CRUD
    ├── discussions.js              # GitHub Discussions via GraphQL
    ├── summary.js                  # GitHub Actions Job Summary
    ├── utils.js                    # Shared helpers
    └── __tests__/
        ├── utils.test.js
        ├── changelog-generator.test.js
        ├── version-manager.test.js
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

| Feature | Required permission |
|---|---|
| Create / update releases | `contents: write` |
| Upload release assets | `contents: write` |
| Create GitHub Discussions | `discussions: write` |

---

## License

MIT
