import * as core from '@actions/core';

export class MajorTag {
  constructor(octokit, repo) {
    this.octokit = octokit;
    this.repo    = repo;
  }

  /**
   * Compute the floating major tag name from a semver tag.
   * Major version is clamped to a minimum of 1 — v0.x.x releases
   * update v1, matching the behaviour of the tag-major.yml workflow.
   *
   * Examples:
   *   v0.5.1  → v1
   *   v1.3.0  → v1
   *   v2.0.0  → v2
   *
   * @param {string} tag  Full release tag, e.g. "v0.5.1"
   * @returns {string|null}  Floating major tag (e.g. "v1") or null if unparseable
   */
  static majorTagFor(tag) {
    const match = tag.match(/^v?(\d+)/);
    if (!match) return null;
    const major = Math.max(1, parseInt(match[1], 10));
    return `v${major}`;
  }

  /**
   * Resolve the commit SHA that a tag points to.
   * Handles both lightweight and annotated tags.
   *
   * @param {string} tag  Tag name (without refs/tags/ prefix)
   * @returns {Promise<string>}  Commit SHA
   */
  async resolveTagSha(tag) {
    const { data } = await this.octokit.rest.git.getRef({
      ...this.repo,
      ref: `tags/${tag}`,
    });

    // Annotated tags point to a tag object — dereference to get the commit SHA
    if (data.object.type === 'tag') {
      const { data: tagObj } = await this.octokit.rest.git.getTag({
        ...this.repo,
        tag_sha: data.object.sha,
      });
      return tagObj.object.sha;
    }

    return data.object.sha;
  }

  /**
   * Create or force-update the floating major tag to point to the given commit SHA.
   *
   * @param {string} tag  Full release tag (e.g. "v0.5.1")
   * @param {string} sha  Commit SHA the major tag should point to
   * @returns {Promise<string|null>}  The major tag name (e.g. "v1") or null on parse failure
   */
  async publish(tag, sha) {
    const majorTag = MajorTag.majorTagFor(tag);
    if (!majorTag) {
      core.warning(`publish_major_tag: could not extract major version from tag "${tag}" — skipping`);
      return null;
    }

    const ref = `tags/${majorTag}`;

    try {
      await this.octokit.rest.git.updateRef({
        ...this.repo,
        ref,
        sha,
        force: true,
      });
      core.info(`Floating tag ${majorTag} updated → ${tag} (${sha.slice(0, 7)})`);
    } catch (err) {
      if (err.status !== 422) throw err;
      // 422 means the ref doesn't exist yet — create it
      await this.octokit.rest.git.createRef({
        ...this.repo,
        ref: `refs/${ref}`,
        sha,
      });
      core.info(`Floating tag ${majorTag} created → ${tag} (${sha.slice(0, 7)})`);
    }

    return majorTag;
  }
}
