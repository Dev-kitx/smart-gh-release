import * as core from '@actions/core';

// Each detector: match (filename pattern), find (version existence check), replace (fn)
const DETECTORS = [
  {
    match:   /(?:^|\/)package\.json$/,
    find:    /"version"\s*:\s*"[^"]+"/,
    replace: (content, v) => content.replace(/"version"\s*:\s*"[^"]+"/, `"version": "${v}"`),
  },
  {
    match:   /(?:^|\/)pyproject\.toml$/,
    find:    /^version\s*=\s*"[^"]+"/m,
    replace: (content, v) => content.replace(/^(version\s*=\s*)"[^"]+"/m, `$1"${v}"`),
  },
  {
    match:   /(?:^|\/)setup\.cfg$/,
    find:    /^version\s*=\s*.+$/m,
    replace: (content, v) => content.replace(/^(version\s*=\s*).+$/m, `$1${v}`),
  },
  {
    match:   /(?:^|\/)setup\.py$/,
    find:    /\bversion\s*=\s*(['"])[^'"]+\1/,
    replace: (content, v) => content.replace(/(\bversion\s*=\s*['"])[^'"]+(['"])/, `$1${v}$2`),
  },
  {
    // __init__.py, _version.py, version.py
    match:   /(?:^|\/)(?:__init__|_version|version)\.py$/,
    find:    /__version__\s*=\s*(['"])[^'"]+\1/,
    replace: (content, v) => content.replace(/(__version__\s*=\s*['"])[^'"]+(['"])/, `$1${v}$2`),
  },
  {
    match:   /(?:^|\/)Cargo\.toml$/,
    find:    /^version\s*=\s*"[^"]+"/m,
    replace: (content, v) => content.replace(/^(version\s*=\s*)"[^"]+"/m, `$1"${v}"`),
  },
  {
    match:   /\.gemspec$/,
    find:    /\.version\s*=\s*(['"])[^'"]+\1/,
    replace: (content, v) => content.replace(/(\.version\s*=\s*['"])[^'"]+(['"])/, `$1${v}$2`),
  },
];

export class VersionBumper {
  /**
   * @param {import('@octokit/core').Octokit} octokit
   * @param {{ owner: string, repo: string }} repo
   */
  constructor(octokit, repo) {
    this.octokit = octokit;
    this.repo    = repo;
  }

  /**
   * Bump the version string in each file on the given branch.
   * Files that are missing or have no recognisable version pattern are skipped
   * with a warning rather than failing the workflow.
   *
   * @param {string[]} filePaths  Repo-relative paths
   * @param {string}   version    New semver string without prefix (e.g. "1.3.0")
   * @param {string}   branch     Branch to commit onto
   * @param {string}   tag        Full tag name used in the commit message
   */
  async bumpFiles(filePaths, version, branch, tag) {
    for (const raw of filePaths) {
      const filePath = raw.trim();
      if (filePath) await this.bumpFile(filePath, version, branch, tag);
    }
  }

  // ── Private ────────────────────────────────────────────────────────────────

  async bumpFile(filePath, version, branch, tag) {
    const detector = DETECTORS.find((d) => d.match.test(filePath));
    if (!detector) {
      core.warning(`bump_version_in_files: no version pattern known for "${filePath}" — skipping`);
      return;
    }

    let content, sha;
    try {
      const { data } = await this.octokit.rest.repos.getContent({
        owner: this.repo.owner,
        repo:  this.repo.repo,
        path:  filePath,
        ref:   branch,
      });
      content = Buffer.from(data.content, 'base64').toString('utf8');
      sha     = data.sha;
    } catch (err) {
      if (err.status === 404) {
        core.warning(`bump_version_in_files: "${filePath}" not found on branch "${branch}" — skipping`);
        return;
      }
      throw err;
    }

    if (!detector.find.test(content)) {
      core.warning(`bump_version_in_files: no version string found in "${filePath}" — skipping`);
      return;
    }

    const updated = detector.replace(content, version);
    if (updated === content) {
      core.info(`bump_version_in_files: "${filePath}" already at ${version} — no change`);
      return;
    }

    await this.octokit.rest.repos.createOrUpdateFileContents({
      owner:   this.repo.owner,
      repo:    this.repo.repo,
      path:    filePath,
      message: `chore(release): bump version to ${tag} in ${filePath}`,
      content: Buffer.from(updated).toString('base64'),
      sha,
      branch,
    });

    core.info(`bump_version_in_files: "${filePath}" → ${version}`);
  }
}
