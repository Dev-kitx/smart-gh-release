import { describe, it, expect, vi } from 'vitest';

vi.mock('@actions/core', () => ({ info: vi.fn(), warning: vi.fn(), debug: vi.fn() }));

import { PrManager } from '../pr-manager.js';

const repo = { owner: 'o', repo: 'r' };

function makeOctokit(overrides = {}) {
  return {
    rest: {
      repos: {
        get: async () => ({ data: { default_branch: 'main' } }),
        listPullRequestsAssociatedWithCommit: async () => ({ data: overrides.commitPRs ?? [] }),
        ...overrides.repos,
      },
      pulls: {
        list: async ({ state }) => {
          if (state === 'closed') return { data: overrides.closedPRs ?? [] };
          return { data: overrides.openPRs ?? [] };
        },
        create: async ({ title, body }) => ({
          data: { number: 42, title, body, html_url: 'https://github.com/o/r/pull/42', head: { ref: 'branch' } },
        }),
        update: async ({ pull_number, title, body }) => ({
          data: { number: pull_number, title, body, html_url: 'https://github.com/o/r/pull/99', head: { ref: 'branch' } },
        }),
        ...overrides.pulls,
      },
      git: {
        updateRef: overrides.updateRef ?? vi.fn().mockResolvedValue({}),
        createRef: overrides.createRef ?? vi.fn().mockResolvedValue({}),
      },
      issues: {
        createComment: overrides.createComment ?? vi.fn().mockResolvedValue({}),
        createLabel:   overrides.createLabel   ?? vi.fn().mockResolvedValue({}),
        addLabels:     overrides.addLabels     ?? vi.fn().mockResolvedValue({}),
        ...overrides.issues,
      },
    },
  };
}

describe('PrManager', () => {
  describe('getDefaultBranch()', () => {
    it('returns the default branch name', async () => {
      const pm = new PrManager(makeOctokit(), repo);
      expect(await pm.getDefaultBranch()).toBe('main');
    });
  });

  describe('isMergedPR()', () => {
    it('returns true when a closed PR has a matching merge commit SHA', async () => {
      const pm = new PrManager(makeOctokit({
        closedPRs: [{ merged_at: '2024-01-01T00:00:00Z', merge_commit_sha: 'abc123' }],
      }), repo);
      expect(await pm.isMergedPR('feat/something', 'abc123')).toBe(true);
    });

    it('returns false when SHA does not match', async () => {
      const pm = new PrManager(makeOctokit({
        closedPRs: [{ merged_at: '2024-01-01T00:00:00Z', merge_commit_sha: 'different' }],
      }), repo);
      expect(await pm.isMergedPR('feat/something', 'abc123')).toBe(false);
    });

    it('returns false when PR was not merged', async () => {
      const pm = new PrManager(makeOctokit({
        closedPRs: [{ merged_at: null, merge_commit_sha: 'abc123' }],
      }), repo);
      expect(await pm.isMergedPR('feat/something', 'abc123')).toBe(false);
    });

    it('returns false and warns on API error', async () => {
      const octokit = makeOctokit();
      octokit.rest.pulls.list = async () => { throw new Error('network error'); };
      const pm = new PrManager(octokit, repo);
      expect(await pm.isMergedPR('branch', 'abc')).toBe(false);
    });
  });

  describe('resetOrCreateBranch()', () => {
    it('updates an existing ref', async () => {
      const updateRef = vi.fn().mockResolvedValue({});
      const pm = new PrManager(makeOctokit({ updateRef }), repo);
      await pm.resetOrCreateBranch('feat/branch', 'abc123');
      expect(updateRef).toHaveBeenCalled();
    });

    it('creates ref when updateRef returns 404', async () => {
      const err = Object.assign(new Error('not found'), { status: 404 });
      const updateRef = vi.fn().mockRejectedValue(err);
      const createRef = vi.fn().mockResolvedValue({});
      const pm = new PrManager(makeOctokit({ updateRef, createRef }), repo);
      await pm.resetOrCreateBranch('feat/branch', 'abc123');
      expect(createRef).toHaveBeenCalled();
    });

    it('creates ref when updateRef returns 422', async () => {
      const err = Object.assign(new Error('unprocessable'), { status: 422 });
      const updateRef = vi.fn().mockRejectedValue(err);
      const createRef = vi.fn().mockResolvedValue({});
      const pm = new PrManager(makeOctokit({ updateRef, createRef }), repo);
      await pm.resetOrCreateBranch('feat/branch', 'abc123');
      expect(createRef).toHaveBeenCalled();
    });

    it('re-throws non-404/422 errors from updateRef', async () => {
      const err = Object.assign(new Error('server error'), { status: 500 });
      const updateRef = vi.fn().mockRejectedValue(err);
      const pm = new PrManager(makeOctokit({ updateRef }), repo);
      await expect(pm.resetOrCreateBranch('feat/branch', 'abc123')).rejects.toThrow();
    });
  });

  describe('findOpenPR()', () => {
    it('returns the first open PR when one exists', async () => {
      const pm = new PrManager(makeOctokit({ openPRs: [{ number: 7 }] }), repo);
      const pr = await pm.findOpenPR('feat/branch');
      expect(pr.number).toBe(7);
    });

    it('returns null when no open PRs exist', async () => {
      const pm = new PrManager(makeOctokit({ openPRs: [] }), repo);
      expect(await pm.findOpenPR('feat/branch')).toBeNull();
    });
  });

  describe('openOrUpdatePR()', () => {
    it('creates a new PR when none exists', async () => {
      const pm = new PrManager(makeOctokit({ openPRs: [] }), repo);
      const pr = await pm.openOrUpdatePR('feat/branch', 'main', 'chore: release', 'body');
      expect(pr.number).toBe(42);
    });

    it('updates an existing open PR', async () => {
      const pm = new PrManager(makeOctokit({ openPRs: [{ number: 99 }] }), repo);
      const pr = await pm.openOrUpdatePR('feat/branch', 'main', 'chore: release', 'updated body');
      expect(pr.number).toBe(99);
    });

    it('applies release label when addReleaseLabel is true', async () => {
      const addLabels   = vi.fn().mockResolvedValue({});
      const createLabel = vi.fn().mockResolvedValue({});
      const pm = new PrManager(makeOctokit({ openPRs: [], addLabels, createLabel }), repo);
      await pm.openOrUpdatePR('feat/branch', 'main', 'chore: release', 'body', true);
      expect(addLabels).toHaveBeenCalled();
    });
  });

  describe('findMergedPRsForCommits()', () => {
    it('returns merged PRs for given commit SHAs', async () => {
      const pm = new PrManager(makeOctokit({
        commitPRs: [{ number: 1, merged_at: '2024-01-01T00:00:00Z', head: { ref: 'feat/a' } }],
      }), repo);
      const prs = await pm.findMergedPRsForCommits(['sha1']);
      expect(prs).toHaveLength(1);
      expect(prs[0].number).toBe(1);
    });

    it('deduplicates PRs appearing in multiple commits', async () => {
      const pm = new PrManager(makeOctokit({
        commitPRs: [{ number: 1, merged_at: '2024-01-01T00:00:00Z', head: { ref: 'feat/a' } }],
      }), repo);
      const prs = await pm.findMergedPRsForCommits(['sha1', 'sha2']);
      expect(prs).toHaveLength(1);
    });

    it('excludes unmerged PRs', async () => {
      const pm = new PrManager(makeOctokit({
        commitPRs: [{ number: 2, merged_at: null, head: { ref: 'feat/a' } }],
      }), repo);
      expect(await pm.findMergedPRsForCommits(['sha1'])).toHaveLength(0);
    });

    it('skips PRs from specified branches', async () => {
      const pm = new PrManager(makeOctokit({
        commitPRs: [{ number: 3, merged_at: '2024-01-01T00:00:00Z', head: { ref: 'smart-release' } }],
      }), repo);
      expect(await pm.findMergedPRsForCommits(['sha1'], ['smart-release'])).toHaveLength(0);
    });

    it('handles API errors per-commit gracefully', async () => {
      const octokit = makeOctokit();
      octokit.rest.repos.listPullRequestsAssociatedWithCommit = async () => {
        throw new Error('API down');
      };
      const pm = new PrManager(octokit, repo);
      expect(await pm.findMergedPRsForCommits(['sha1'])).toHaveLength(0);
    });
  });

  describe('commentReleaseOnPRs()', () => {
    it('posts a comment on each PR', async () => {
      const createComment = vi.fn().mockResolvedValue({});
      const pm = new PrManager(makeOctokit({ createComment }), repo);
      const prs = [{ number: 1 }, { number: 2 }];
      await pm.commentReleaseOnPRs(prs, 'v1.0.0', 'https://github.com/o/r/releases/tag/v1.0.0');
      expect(createComment).toHaveBeenCalledTimes(2);
    });

    it('warns (does not throw) when a comment fails', async () => {
      const createComment = vi.fn().mockRejectedValue(new Error('forbidden'));
      const pm = new PrManager(makeOctokit({ createComment }), repo);
      await expect(pm.commentReleaseOnPRs([{ number: 1 }], 'v1.0.0', 'https://...')).resolves.not.toThrow();
    });
  });

  describe('applyReleaseLabel()', () => {
    it('creates label and adds it to the PR', async () => {
      const createLabel = vi.fn().mockResolvedValue({});
      const addLabels   = vi.fn().mockResolvedValue({});
      const pm = new PrManager(makeOctokit({ createLabel, addLabels }), repo);
      await pm.applyReleaseLabel(10);
      expect(createLabel).toHaveBeenCalled();
      expect(addLabels).toHaveBeenCalled();
    });

    it('ignores 422 (label already exists) from createLabel', async () => {
      const err = Object.assign(new Error('label exists'), { status: 422 });
      const createLabel = vi.fn().mockRejectedValue(err);
      const addLabels   = vi.fn().mockResolvedValue({});
      const pm = new PrManager(makeOctokit({ createLabel, addLabels }), repo);
      await expect(pm.applyReleaseLabel(10)).resolves.not.toThrow();
      expect(addLabels).toHaveBeenCalled();
    });

    it('warns (does not throw) when entire label flow fails', async () => {
      const err = Object.assign(new Error('server error'), { status: 500 });
      const createLabel = vi.fn().mockRejectedValue(err);
      const pm = new PrManager(makeOctokit({ createLabel }), repo);
      await expect(pm.applyReleaseLabel(10)).resolves.not.toThrow();
    });
  });
});
