import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
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
    assert.equal(result.count, 2);
    assert.ok(result.markdown.includes('@alice'));
    assert.ok(result.markdown.includes('@bob'));
  });

  it('excludes bot accounts', async () => {
    const commits = [
      makeCommit('dependabot[bot]', 'dependabot'),
      makeCommit('renovate[bot]', 'renovate'),
      makeCommit('alice', 'Alice'),
    ];
    const result = await getContributors(makeOctokit(commits), { owner: 'o', repo: 'r' }, 'v1.0.0', 'HEAD');
    assert.equal(result.count, 1);
    assert.ok(!result.markdown.includes('dependabot'));
    assert.ok(result.markdown.includes('@alice'));
  });

  it('returns empty result when all contributors are bots', async () => {
    const commits = [makeCommit('github-actions[bot]', 'GitHub Actions')];
    const result = await getContributors(makeOctokit(commits), { owner: 'o', repo: 'r' }, 'v1.0.0', 'HEAD');
    assert.equal(result.count, 0);
    assert.equal(result.markdown, '');
  });

  it('handles commits without a github login (falls back to name)', async () => {
    const commits = [makeCommit(null, 'External Contributor')];
    const result = await getContributors(makeOctokit(commits), { owner: 'o', repo: 'r' }, 'v1.0.0', 'HEAD');
    assert.equal(result.count, 1);
    assert.ok(result.markdown.includes('External Contributor'));
  });
});
