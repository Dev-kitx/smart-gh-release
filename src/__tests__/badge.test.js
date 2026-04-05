import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@actions/core', () => ({ info: vi.fn(), warning: vi.fn() }));

import { BadgeGenerator, BADGE_PATH } from '../badge.js';

const REPO = { owner: 'my-org', repo: 'my-repo' };

function makeOctokit({ existingSha = null, throwStatus = null } = {}) {
  const createOrUpdateFileContents = vi.fn().mockResolvedValue({});
  return {
    rest: {
      repos: {
        getContent: async () => {
          if (throwStatus) {
            const err = new Error('API error');
            err.status = throwStatus;
            throw err;
          }
          if (!existingSha) {
            const err = new Error('Not Found');
            err.status = 404;
            throw err;
          }
          return { data: { sha: existingSha } };
        },
        createOrUpdateFileContents,
      },
    },
    _commit: createOrUpdateFileContents,
  };
}

describe('BadgeGenerator', () => {
  beforeEach(() => vi.clearAllMocks());

  // ── generate() ─────────────────────────────────────────────────────────────

  describe('generate()', () => {
    it('creates the badge file when it does not exist yet', async () => {
      const octokit = makeOctokit(); // existingSha = null → 404
      const bg = new BadgeGenerator(octokit, REPO);
      await bg.generate('v1.3.0', false, 'smart-changelog');

      expect(octokit._commit).toHaveBeenCalledOnce();
      const call = octokit._commit.mock.calls[0][0];
      expect(call.path).toBe(BADGE_PATH);
      expect(call.branch).toBe('smart-changelog');
      expect(call.sha).toBeUndefined(); // no sha → new file
    });

    it('passes the existing sha when updating an existing badge file', async () => {
      const octokit = makeOctokit({ existingSha: 'existing-file-sha' });
      const bg = new BadgeGenerator(octokit, REPO);
      await bg.generate('v1.4.0', false, 'smart-changelog');

      const call = octokit._commit.mock.calls[0][0];
      expect(call.sha).toBe('existing-file-sha');
    });

    it('re-throws non-404 getContent errors', async () => {
      const octokit = makeOctokit({ throwStatus: 500 });
      const bg = new BadgeGenerator(octokit, REPO);
      await expect(bg.generate('v1.0.0', false, 'main')).rejects.toThrow();
    });

    it('writes valid shields.io endpoint JSON', async () => {
      const octokit = makeOctokit();
      const bg = new BadgeGenerator(octokit, REPO);
      await bg.generate('v2.0.0', false, 'smart-release');

      const { content } = octokit._commit.mock.calls[0][0];
      const decoded = JSON.parse(Buffer.from(content, 'base64').toString('utf8'));
      expect(decoded).toEqual({
        schemaVersion: 1,
        label:         'release',
        message:       'v2.0.0',
        color:         'blue',
      });
    });

    it('uses blue color for stable releases', async () => {
      const octokit = makeOctokit();
      const bg = new BadgeGenerator(octokit, REPO);
      await bg.generate('v1.0.0', false, 'main');

      const { content } = octokit._commit.mock.calls[0][0];
      const decoded = JSON.parse(Buffer.from(content, 'base64').toString('utf8'));
      expect(decoded.color).toBe('blue');
    });

    it('uses orange color for pre-releases', async () => {
      const octokit = makeOctokit();
      const bg = new BadgeGenerator(octokit, REPO);
      await bg.generate('v1.1.0-beta.1', true, 'main');

      const { content } = octokit._commit.mock.calls[0][0];
      const decoded = JSON.parse(Buffer.from(content, 'base64').toString('utf8'));
      expect(decoded.color).toBe('orange');
      expect(decoded.message).toBe('v1.1.0-beta.1');
    });

    it('includes the tag in the commit message', async () => {
      const octokit = makeOctokit();
      const bg = new BadgeGenerator(octokit, REPO);
      await bg.generate('v3.0.0', false, 'smart-release');

      const { message } = octokit._commit.mock.calls[0][0];
      expect(message).toContain('v3.0.0');
    });

    it('commits to the correct branch', async () => {
      const octokit = makeOctokit();
      const bg = new BadgeGenerator(octokit, REPO);
      await bg.generate('v1.0.0', false, 'smart-changelog');

      expect(octokit._commit.mock.calls[0][0].branch).toBe('smart-changelog');
    });
  });

  // ── Static helpers ──────────────────────────────────────────────────────────

  describe('badgeUrl()', () => {
    it('returns a shields.io endpoint URL pointing to the badge JSON', () => {
      const url = BadgeGenerator.badgeUrl('my-org', 'my-repo', 'main');
      expect(url).toContain('https://img.shields.io/endpoint');
      expect(url).toContain(encodeURIComponent('my-org/my-repo/main'));
      expect(url).toContain(encodeURIComponent(BADGE_PATH));
    });

    it('defaults to main branch', () => {
      const url = BadgeGenerator.badgeUrl('o', 'r');
      expect(url).toContain(encodeURIComponent('/main/'));
    });

    it('respects a custom default branch', () => {
      const url = BadgeGenerator.badgeUrl('o', 'r', 'master');
      expect(url).toContain(encodeURIComponent('/master/'));
    });
  });

  describe('badgeMarkdown()', () => {
    it('returns markdown with the badge URL and a link to releases', () => {
      const md = BadgeGenerator.badgeMarkdown('my-org', 'my-repo', 'main');
      expect(md).toMatch(/^\[!\[Release\]\(.*\)\]\(.*\)$/);
      expect(md).toContain('https://img.shields.io/endpoint');
      expect(md).toContain('https://github.com/my-org/my-repo/releases/latest');
    });

    it('embeds the correct repo in the release URL', () => {
      const md = BadgeGenerator.badgeMarkdown('acme', 'widget', 'main');
      expect(md).toContain('https://github.com/acme/widget/releases/latest');
    });
  });
});
