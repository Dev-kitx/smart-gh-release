import * as core from '@actions/core';

/**
 * Create a GitHub Discussion announcing the given release.
 *
 * Requirements:
 *  - The token must have `discussions: write` permission.
 *  - The repository must have Discussions enabled.
 *  - The category named `categoryName` must already exist.
 *
 * Errors are surfaced as warnings (not failures) so they never block a release.
 *
 * @param {import('@octokit/core').Octokit} octokit
 * @param {{ owner: string, repo: string }} repo
 * @param {object} releaseData  The release object returned by the GitHub API
 * @param {string} categoryName
 */
export async function createReleaseDiscussion(octokit, repo, releaseData, categoryName) {
  try {
    // ── 1. Look up the discussion category ID ───────────────────────────────
    const { repository } = await octokit.graphql(
      `query($owner: String!, $name: String!) {
        repository(owner: $owner, name: $name) {
          id
          discussionCategories(first: 25) {
            nodes { id name }
          }
        }
      }`,
      { owner: repo.owner, name: repo.repo },
    );

    const category = repository.discussionCategories.nodes.find(
      (c) => c.name.toLowerCase() === categoryName.toLowerCase(),
    );

    if (!category) {
      core.warning(
        `Discussion category "${categoryName}" was not found in ${repo.owner}/${repo.repo}. ` +
          `Skipping discussion creation. Available categories: ` +
          repository.discussionCategories.nodes.map((c) => c.name).join(', '),
      );
      return;
    }

    // ── 2. Build the discussion body ────────────────────────────────────────
    const title = `Released: ${releaseData.tag_name}`;
    const body = [
      `## ${releaseData.name ?? releaseData.tag_name}`,
      '',
      releaseData.body ?? '',
      '',
      `---`,
      `[View full release on GitHub](${releaseData.html_url})`,
    ].join('\n');

    // ── 3. Create the discussion ─────────────────────────────────────────────
    const result = await octokit.graphql(
      `mutation($repoId: ID!, $categoryId: ID!, $title: String!, $body: String!) {
        createDiscussion(input: {
          repositoryId: $repoId
          categoryId: $categoryId
          title: $title
          body: $body
        }) {
          discussion { url }
        }
      }`,
      {
        repoId: repository.id,
        categoryId: category.id,
        title,
        body,
      },
    );

    const discussionUrl = result.createDiscussion.discussion.url;
    core.info(`Created GitHub Discussion: ${discussionUrl}`);
  } catch (err) {
    // Never let a failed discussion creation block the release
    core.warning(`Could not create GitHub Discussion: ${err.message}`);
  }
}
