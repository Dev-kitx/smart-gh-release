import * as core from '@actions/core';
import semver from 'semver';
import { ChangelogGenerator } from './changelog-generator.js';

export class VersionManager {
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
   * Resolve the tag, version string, and previous tag.
   *
   * Resolution order:
   *  1. Explicit `tag` input  → use as-is
   *  2. `auto_version: true`  → compute from conventional commits
   *  3. Neither               → throw
   *
   * @returns {Promise<{ tag: string, version: string, previousTag: string|null }>}
   */
  async resolve() {
    const previousTag = await this.getLatestSemverTag();

    if (this.inputs.tag) {
      const version = this.inputs.tag.replace(/^[a-zA-Z]+/, '');
      return { tag: this.inputs.tag, version, previousTag };
    }

    if (this.inputs.autoVersion) {
      return this.computeNextVersion(previousTag);
    }

    throw new Error(
      'Provide either the `tag` input or set `auto_version: true` to compute the tag from commits.',
    );
  }

  // ── Private ────────────────────────────────────────────────────────────────

  /**
   * Return the highest semver tag in the repository, or null.
   * @returns {Promise<string|null>}
   */
  async getLatestSemverTag() {
    try {
      const allTags = [];
      let page = 1;

      // Paginate through all tags (repositories can have many)
      while (true) {
        const { data } = await this.octokit.rest.repos.listTags({
          owner: this.repo.owner,
          repo: this.repo.repo,
          per_page: 100,
          page,
        });
        allTags.push(...data);
        if (data.length < 100) break;
        page++;
      }

      const semverTags = allTags
        .map((t) => ({ name: t.name, version: semver.clean(t.name) }))
        .filter((t) => t.version !== null)
        .sort((a, b) => semver.rcompare(a.version, b.version));

      return semverTags[0]?.name ?? null;
    } catch (err) {
      core.warning(`Could not list tags: ${err.message}`);
      return null;
    }
  }

  /**
   * Compute the next version by analysing conventional commits.
   *
   * @param {string|null} previousTag
   * @returns {Promise<{ tag: string, version: string, previousTag: string|null }>}
   */
  async computeNextVersion(previousTag) {
    const { versionPrefix: prefix, initialVersion, prereleaseChannel: channel } = this.inputs;

    // ── No prior tags → initial release ───────────────────────────────────
    if (!previousTag) {
      const version = channel ? `${initialVersion}-${channel}.1` : initialVersion;
      const tag = `${prefix}${version}`;
      core.info(`No existing semver tags found. Creating initial release: ${tag}`);
      return { tag, version, previousTag: null };
    }

    // ── Detect bump level from commits ────────────────────────────────────
    const changelogGen = new ChangelogGenerator(this.octokit, this.repo, this.inputs);
    const { bumpLevel } = await changelogGen.generate(previousTag, this.inputs.targetCommitish);
    core.info(`Detected bump level from commits: ${bumpLevel}`);

    const currentVersion = semver.clean(previousTag);
    if (!currentVersion) {
      throw new Error(`Cannot parse previous tag as semver: ${previousTag}`);
    }

    let nextVersion;

    if (channel) {
      // Pre-release channel logic
      const currentPreid = semver.prerelease(currentVersion)?.[0];

      if (currentPreid === channel) {
        // Same channel → increment the pre-release counter
        nextVersion = semver.inc(currentVersion, 'prerelease', channel);
      } else {
        // New or changed channel → bump the stable part then start channel at .1
        const bumped = semver.inc(currentVersion, bumpLevel);
        nextVersion = `${bumped}-${channel}.1`;
      }
    } else {
      nextVersion = semver.inc(currentVersion, bumpLevel);
    }

    if (!nextVersion) {
      throw new Error(
        `Failed to compute next version from ${currentVersion} with bump level ${bumpLevel}`,
      );
    }

    const tag = `${prefix}${nextVersion}`;
    return { tag, version: nextVersion, previousTag };
  }
}
