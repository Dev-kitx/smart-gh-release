import * as core from '@actions/core';

export const BADGE_PATH = '.github/badges/release.json';

export class BadgeGenerator {
  /**
   * @param {import('@octokit/core').Octokit} octokit
   * @param {{ owner: string, repo: string }} repo
   */
  constructor(octokit, repo) {
    this.octokit = octokit;
    this.repo    = repo;
  }

  /**
   * Write the shields.io endpoint JSON badge for the given tag onto the branch.
   * Creates the file if it does not exist; updates it if it does.
   *
   * @param {string}  tag          Full release tag (e.g. "v1.3.0")
   * @param {boolean} isPrerelease Stable → blue, pre-release → orange
   * @param {string}  branch       Branch to commit onto
   */
  async generate(tag, isPrerelease, branch) {
    const payload = {
      schemaVersion: 1,
      label:         'release',
      message:       tag,
      color:         isPrerelease ? 'orange' : 'blue',
    };

    const content = JSON.stringify(payload, null, 2) + '\n';

    // Fetch existing file SHA — required by the GitHub API when updating
    let existingSha;
    try {
      const { data } = await this.octokit.rest.repos.getContent({
        owner: this.repo.owner,
        repo:  this.repo.repo,
        path:  BADGE_PATH,
        ref:   branch,
      });
      existingSha = data.sha;
    } catch (err) {
      if (err.status !== 404) throw err;
      // 404 = file does not exist yet — create it fresh
    }

    await this.octokit.rest.repos.createOrUpdateFileContents({
      owner:   this.repo.owner,
      repo:    this.repo.repo,
      path:    BADGE_PATH,
      message: `chore(release): update release badge to ${tag}`,
      content: Buffer.from(content).toString('base64'),
      ...(existingSha && { sha: existingSha }),
      branch,
    });

    core.info(`Release badge updated → ${BADGE_PATH}`);
  }

  // ── Static helpers ─────────────────────────────────────────────────────────

  /**
   * Return the shields.io endpoint URL for the badge JSON served from this repo.
   *
   * @param {string} owner
   * @param {string} repo
   * @param {string} [defaultBranch='main']
   * @returns {string}
   */
  static badgeUrl(owner, repo, defaultBranch = 'main') {
    const raw = `https://raw.githubusercontent.com/${owner}/${repo}/${defaultBranch}/${BADGE_PATH}`;
    return `https://img.shields.io/endpoint?url=${encodeURIComponent(raw)}`;
  }

  /**
   * Return ready-to-paste Markdown for the release badge.
   *
   * @param {string} owner
   * @param {string} repo
   * @param {string} [defaultBranch='main']
   * @returns {string}
   */
  static badgeMarkdown(owner, repo, defaultBranch = 'main') {
    const badgeUrl   = BadgeGenerator.badgeUrl(owner, repo, defaultBranch);
    const releaseUrl = `https://github.com/${owner}/${repo}/releases/latest`;
    return `[![Release](${badgeUrl})](${releaseUrl})`;
  }
}
