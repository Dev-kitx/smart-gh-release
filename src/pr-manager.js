import * as core from '@actions/core';

const RELEASE_LABEL = {
  name:        'smart-release: pending',
  color:       '0075ca',
  description: 'Merging this PR will trigger a GitHub Release',
};

export class PrManager {
  /**
   * @param {import('@octokit/core').Octokit} octokit
   * @param {{ owner: string, repo: string }} repo
   */
  constructor(octokit, repo) {
    this.octokit = octokit;
    this.repo    = repo;
  }

  /**
   * Return the repository's default branch name.
   * @returns {Promise<string>}
   */
  async getDefaultBranch() {
    const { data } = await this.octokit.rest.repos.get({
      owner: this.repo.owner,
      repo:  this.repo.repo,
    });
    return data.default_branch;
  }

  /**
   * Return true if `sha` is the merge commit SHA of a recently closed PR
   * from `branchName`. Covers standard and squash merges.
   *
   * @param {string} branchName
   * @param {string} sha  github.context.sha of the current push
   * @returns {Promise<boolean>}
   */
  async isMergedPR(branchName, sha) {
    try {
      const { data: prs } = await this.octokit.rest.pulls.list({
        owner:     this.repo.owner,
        repo:      this.repo.repo,
        state:     'closed',
        head:      `${this.repo.owner}:${branchName}`,
        per_page:  5,
        sort:      'updated',
        direction: 'desc',
      });
      return prs.some((pr) => pr.merged_at && pr.merge_commit_sha === sha);
    } catch (err) {
      core.warning(`PR detection failed: ${err.message}`);
      return false;
    }
  }

  /**
   * Reset an existing branch to `sha`, or create it pointing to `sha`
   * if it does not exist yet. After this call the branch tip === sha.
   *
   * @param {string} branchName
   * @param {string} sha
   */
  async resetOrCreateBranch(branchName, sha) {
    try {
      await this.octokit.rest.git.updateRef({
        owner: this.repo.owner,
        repo:  this.repo.repo,
        ref:   `heads/${branchName}`,
        sha,
        force: true,
      });
      core.debug(`Reset branch ${branchName} to ${sha}`);
    } catch (err) {
      if (err.status !== 404 && err.status !== 422) throw err;
      // Branch does not exist yet — create it
      await this.octokit.rest.git.createRef({
        owner: this.repo.owner,
        repo:  this.repo.repo,
        ref:   `refs/heads/${branchName}`,
        sha,
      });
      core.debug(`Created branch ${branchName} at ${sha}`);
    }
  }

  /**
   * Return the first open PR from `branchName`, or null.
   *
   * @param {string} branchName
   * @returns {Promise<object|null>}
   */
  async findOpenPR(branchName) {
    const { data: prs } = await this.octokit.rest.pulls.list({
      owner:    this.repo.owner,
      repo:     this.repo.repo,
      state:    'open',
      head:     `${this.repo.owner}:${branchName}`,
      per_page: 1,
    });
    return prs[0] ?? null;
  }

  /**
   * Open a new PR from branchName → defaultBranch, or update the title/body
   * of an existing open PR. Returns the PR object.
   *
   * When `addReleaseLabel` is true the `smart-release: pending` label is added
   * to the PR (created in the repo first if it does not exist yet).
   *
   * @param {string}  branchName
   * @param {string}  defaultBranch
   * @param {string}  title
   * @param {string}  body
   * @param {boolean} [addReleaseLabel=false]
   * @returns {Promise<object>}
   */
  async openOrUpdatePR(branchName, defaultBranch, title, body, addReleaseLabel = false) {
    const existing = await this.findOpenPR(branchName);

    if (existing) {
      const { data } = await this.octokit.rest.pulls.update({
        owner:       this.repo.owner,
        repo:        this.repo.repo,
        pull_number: existing.number,
        title,
        body,
      });
      core.info(`Updated PR #${data.number}: ${data.html_url}`);
      return data;
    }

    const { data } = await this.octokit.rest.pulls.create({
      owner: this.repo.owner,
      repo:  this.repo.repo,
      title,
      head:  branchName,
      base:  defaultBranch,
      body,
    });
    core.info(`Opened PR #${data.number}: ${data.html_url}`);

    if (addReleaseLabel) {
      await this.applyReleaseLabel(data.number);
    }

    return data;
  }

  /**
   * Ensure the `smart-release: pending` label exists in the repo, then apply
   * it to the given PR number.
   *
   * @param {number} prNumber
   */
  async applyReleaseLabel(prNumber) {
    try {
      // Create label if it does not already exist
      try {
        await this.octokit.rest.issues.createLabel({
          owner:       this.repo.owner,
          repo:        this.repo.repo,
          name:        RELEASE_LABEL.name,
          color:       RELEASE_LABEL.color,
          description: RELEASE_LABEL.description,
        });
      } catch (err) {
        // 422 = label already exists — safe to ignore
        if (err.status !== 422) throw err;
      }

      await this.octokit.rest.issues.addLabels({
        owner:       this.repo.owner,
        repo:        this.repo.repo,
        issue_number: prNumber,
        labels:      [RELEASE_LABEL.name],
      });

      core.info(`Applied label "${RELEASE_LABEL.name}" to PR #${prNumber}`);
    } catch (err) {
      // Label is cosmetic — warn but never fail the release flow
      core.warning(`Could not apply release label: ${err.message}`);
    }
  }
}
