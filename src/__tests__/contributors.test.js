import { describe, it, expect, vi } from 'vitest';

vi.mock('@actions/core', () => ({ info: vi.fn(), warning: vi.fn() }));

import { getContributors } from '../contributors.js';

function makeCommit(login, name) {
  return {
    sha: 'abc123',
    commit: { author: { name } },
    author: login
      ? { login, avatar_url: `https://avatars.githubusercontent.com/${login}`, html_url: `https://github.com/${login}` }
      : null,
  };
}

function makeOctokit(commits) {
  return {
    rest: {
      repos: {
        compareCommitsWithBasehead: async () => ({ data: { commits } }),
        listCommits: async () => ({ data: commits }),
      },
    },
  };
}

describe('getContributors', () => {
  it('returns unique contributors', async () => {
    const commits = [
      makeCommit('alice', 'Alice'),
      makeCommit('alice', 'Alice'), // duplicate
      makeCommit('bob', 'Bob'),
    ];
    const result = await getContributors(makeOctokit(commits), { owner: 'o', repo: 'r' }, 'v1.0.0', 'HEAD');
    expect(result.count).toBe(2);
    expect(result.markdown).toContain('@alice');
    expect(result.markdown).toContain('@bob');
  });

  it('excludes bot accounts', async () => {
    const commits = [
      makeCommit('dependabot[bot]', 'dependabot'),
      makeCommit('renovate[bot]', 'renovate'),
      makeCommit('alice', 'Alice'),
    ];
    const result = await getContributors(makeOctokit(commits), { owner: 'o', repo: 'r' }, 'v1.0.0', 'HEAD');
    expect(result.count).toBe(1);
    expect(result.markdown).not.toContain('dependabot');
    expect(result.markdown).toContain('@alice');
  });

  it('returns empty result when all contributors are bots', async () => {
    const commits = [makeCommit('github-actions[bot]', 'GitHub Actions')];
    const result = await getContributors(makeOctokit(commits), { owner: 'o', repo: 'r' }, 'v1.0.0', 'HEAD');
    expect(result.count).toBe(0);
    expect(result.markdown).toBe('');
  });

  it('handles commits without a github login (falls back to name)', async () => {
    const commits = [makeCommit(null, 'External Contributor')];
    const result = await getContributors(makeOctokit(commits), { owner: 'o', repo: 'r' }, 'v1.0.0', 'HEAD');
    expect(result.count).toBe(1);
    expect(result.markdown).toContain('External Contributor');
  });

  it('uses listCommits when base is null (first release)', async () => {
    const commits = [makeCommit('alice', 'Alice')];
    const result = await getContributors(makeOctokit(commits), { owner: 'o', repo: 'r' }, null, 'HEAD');
    expect(result.count).toBe(1);
    expect(result.markdown).toContain('@alice');
  });

  it('returns empty result and warns when API throws', async () => {
    const brokenOctokit = {
      rest: {
        repos: {
          compareCommitsWithBasehead: async () => { throw new Error('network error'); },
          listCommits: async () => { throw new Error('network error'); },
        },
      },
    };
    const result = await getContributors(brokenOctokit, { owner: 'o', repo: 'r' }, 'v1.0.0', 'HEAD');
    expect(result.count).toBe(0);
    expect(result.markdown).toBe('');
  });

  it('skips commits with no login and no name', async () => {
    const commits = [{ sha: 'abc', commit: { author: { name: null } }, author: null }];
    const result = await getContributors(makeOctokit(commits), { owner: 'o', repo: 'r' }, 'v1.0.0', 'HEAD');
    expect(result.count).toBe(0);
  });
});
