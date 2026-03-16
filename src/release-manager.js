import * as core from '@actions/core';

export class ReleaseManager {
  /**
   * @param {import('@octokit/core').Octokit} octokit
   * @param {{ owner: string, repo: string }} repo
   * @param {object} inputs  Parsed action inputs
   */
  constructor(octokit, repo, inputs) {
    this.octokit = octokit;
    this.repo = repo;
    this.inputs = inputs;
  }

  /**
   * Create a new release or update an existing one depending on whether the
   * tag already exists and `update_existing` is set.
   *
   * @param {{ tag: string, name: string, body: string, draft: boolean, prerelease: boolean, targetCommitish: string }} opts
   * @returns {Promise<{ data: object }>}
   */
  async createOrUpdate({ tag, name, body, draft, prerelease, targetCommitish }) {
    const existing = await this.findByTag(tag);

    if (existing) {
      if (!this.inputs.updateExisting) {
        throw new Error(
          `A release for tag "${tag}" already exists (id: ${existing.id}). ` +
            `Set update_existing: true to overwrite it.`,
        );
      }

      core.info(`Updating existing release for tag ${tag} (id: ${existing.id})`);

      const { data } = await this.octokit.rest.repos.updateRelease({
        owner: this.repo.owner,
        repo: this.repo.repo,
        release_id: existing.id,
        name,
        body,
        draft,
        prerelease,
      });

      return { data };
    }

    core.info(`Creating release for tag ${tag}`);

    const { data } = await this.octokit.rest.repos.createRelease({
      owner: this.repo.owner,
      repo: this.repo.repo,
      tag_name: tag,
      name,
      body,
      draft,
      prerelease,
      target_commitish: targetCommitish,
    });

    return { data };
  }

  /**
   * Return an existing release object if one exists for the given tag,
   * otherwise return null.
   *
   * @param {string} tag
   * @returns {Promise<object|null>}
   */
  async findByTag(tag) {
    try {
      const { data } = await this.octokit.rest.repos.getReleaseByTag({
        owner: this.repo.owner,
        repo: this.repo.repo,
        tag,
      });
      return data;
    } catch (err) {
      if (err.status === 404) return null;
      throw err;
    }
  }
}
