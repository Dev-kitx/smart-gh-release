import * as core from '@actions/core'; // eslint-disable-line no-unused-vars

const CHANGELOG_PATH   = 'CHANGELOG.md';
const CHANGELOG_HEADER = '# Changelog\n\nAll notable changes to this project will be documented in this file.\n';

export class ChangelogFile {
  /**
   * @param {import('@octokit/core').Octokit} octokit
   * @param {{ owner: string, repo: string }} repo
   */
  constructor(octokit, repo) {
    this.octokit = octokit;
    this.repo    = repo;
  }

  /**
   * Read CHANGELOG.md from a git ref (branch name or SHA).
   * Returns { content, sha } where both are null when the file does not exist.
   *
   * @param {string} ref
   * @returns {Promise<{ content: string|null, sha: string|null }>}
   */
  async read(ref) {
    try {
      const { data } = await this.octokit.rest.repos.getContent({
        owner: this.repo.owner,
        repo:  this.repo.repo,
        path:  CHANGELOG_PATH,
        ref,
      });
      return {
        content: Buffer.from(data.content, 'base64').toString('utf8'),
        sha:     data.sha,
      };
    } catch (err) {
      if (err.status === 404) return { content: null, sha: null };
      throw err;
    }
  }

  /**
   * Build a single version entry block for CHANGELOG.md.
   *
   * @param {string} tag         e.g. "v1.2.3"
   * @param {string} changelogMd Markdown from ChangelogGenerator
   * @returns {string}
   */
  buildEntry(tag, changelogMd) {
    const date = new Date().toISOString().split('T')[0];
    const body = changelogMd?.trim() || '_No notable changes._';
    return `## [${tag}] - ${date}\n\n${body}`;
  }

  /**
   * Prepend a new version entry to existing CHANGELOG.md content.
   * Inserts before the first `## ` section so the header is preserved.
   *
   * @param {string|null} existingContent
   * @param {string}      newEntry
   * @returns {string}
   */
  prepend(existingContent, newEntry) {
    if (!existingContent) {
      return `${CHANGELOG_HEADER}\n${newEntry}\n`;
    }

    const idx = existingContent.indexOf('\n## ');
    if (idx !== -1) {
      return (
        existingContent.slice(0, idx) +
        '\n\n' +
        newEntry +
        '\n' +
        existingContent.slice(idx)
      );
    }

    return existingContent.trimEnd() + '\n\n' + newEntry + '\n';
  }

  /**
   * Write (create or overwrite) CHANGELOG.md on a branch via the GitHub API.
   *
   * @param {string}      branch
   * @param {string}      content
   * @param {string|null} existingSha  Blob SHA required by GitHub when the file already exists
   * @param {string}      [commitMsg]
   */
  async write(branch, content, existingSha, commitMsg = 'chore: update CHANGELOG.md') {
    await this.octokit.rest.repos.createOrUpdateFileContents({
      owner:   this.repo.owner,
      repo:    this.repo.repo,
      path:    CHANGELOG_PATH,
      message: commitMsg,
      content: Buffer.from(content).toString('base64'),
      ...(existingSha && { sha: existingSha }),
      branch,
    });
  }
}
