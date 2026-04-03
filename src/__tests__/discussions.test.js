import { describe, it, expect, vi } from 'vitest';

vi.mock('@actions/core', () => ({ info: vi.fn(), warning: vi.fn() }));

import { createReleaseDiscussion } from '../discussions.js';
import * as core from '@actions/core';

const repo        = { owner: 'o', repo: 'r' };
const releaseData = {
  tag_name: 'v1.0.0',
  name:     'Release v1.0.0',
  body:     'Some release notes',
  html_url: 'https://github.com/o/r/releases/tag/v1.0.0',
};

function makeOctokit({ categories = [{ id: 'cat1', name: 'Announcements' }], repoId = 'repo1', graphqlError = null } = {}) {
  return {
    graphql: vi.fn().mockImplementation(async (query) => {
      if (graphqlError) throw new Error(graphqlError);

      // Query
      if (query.includes('discussionCategories')) {
        return {
          repository: {
            id: repoId,
            discussionCategories: { nodes: categories },
          },
        };
      }

      // Mutation
      return {
        createDiscussion: {
          discussion: { url: 'https://github.com/o/r/discussions/1' },
        },
      };
    }),
  };
}

describe('createReleaseDiscussion', () => {
  it('creates a discussion and logs the URL', async () => {
    const octokit = makeOctokit();
    await createReleaseDiscussion(octokit, repo, releaseData, 'Announcements');
    expect(core.info).toHaveBeenCalledWith(
      expect.stringContaining('https://github.com/o/r/discussions/1'),
    );
  });

  it('warns when the category is not found', async () => {
    const octokit = makeOctokit({ categories: [{ id: 'cat1', name: 'General' }] });
    await createReleaseDiscussion(octokit, repo, releaseData, 'Announcements');
    expect(core.warning).toHaveBeenCalledWith(expect.stringContaining('"Announcements"'));
  });

  it('is case-insensitive when matching category names', async () => {
    const octokit = makeOctokit({ categories: [{ id: 'cat1', name: 'ANNOUNCEMENTS' }] });
    await createReleaseDiscussion(octokit, repo, releaseData, 'announcements');
    expect(core.info).toHaveBeenCalledWith(expect.stringContaining('discussions'));
  });

  it('warns instead of throwing when graphql fails', async () => {
    const octokit = makeOctokit({ graphqlError: 'GraphQL timeout' });
    await expect(
      createReleaseDiscussion(octokit, repo, releaseData, 'Announcements'),
    ).resolves.not.toThrow();
    expect(core.warning).toHaveBeenCalledWith(expect.stringContaining('GraphQL timeout'));
  });
});
