import { describe, it, expect, vi } from 'vitest';

vi.mock('@actions/core', () => ({ info: vi.fn(), warning: vi.fn() }));

import { ChangelogFile } from '../changelog-file.js';

function makeOctokit({ content = null, sha = null, throwStatus = null } = {}) {
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
          return {
            data: {
              content: content ? Buffer.from(content).toString('base64') : '',
              sha,
            },
          };
        },
        createOrUpdateFileContents,
      },
    },
    _createOrUpdateFileContents: createOrUpdateFileContents,
  };
}

describe('ChangelogFile', () => {
  describe('read()', () => {
    it('returns decoded content and sha when file exists', async () => {
      const cf = new ChangelogFile(makeOctokit({ content: '# Changelog', sha: 'abc123' }), { owner: 'o', repo: 'r' });
      const result = await cf.read('main');
      expect(result.content).toBe('# Changelog');
      expect(result.sha).toBe('abc123');
    });

    it('returns null content and null sha on 404', async () => {
      const cf = new ChangelogFile(makeOctokit({ throwStatus: 404 }), { owner: 'o', repo: 'r' });
      const result = await cf.read('main');
      expect(result.content).toBeNull();
      expect(result.sha).toBeNull();
    });

    it('re-throws non-404 errors', async () => {
      const cf = new ChangelogFile(makeOctokit({ throwStatus: 500 }), { owner: 'o', repo: 'r' });
      await expect(cf.read('main')).rejects.toThrow();
    });
  });

  describe('buildEntry()', () => {
    const cf = new ChangelogFile({}, {});

    it('includes the tag and today\'s date', () => {
      const entry = cf.buildEntry('v1.2.3', '### Features\n- add search');
      expect(entry).toContain('## [v1.2.3]');
      expect(entry).toMatch(/\d{4}-\d{2}-\d{2}/);
    });

    it('embeds the changelog markdown', () => {
      const entry = cf.buildEntry('v1.0.0', '### Features\n- add thing');
      expect(entry).toContain('### Features');
    });

    it('uses fallback text when changelog is empty string', () => {
      expect(cf.buildEntry('v1.0.0', '')).toContain('_No notable changes._');
    });

    it('uses fallback text when changelog is null', () => {
      expect(cf.buildEntry('v1.0.0', null)).toContain('_No notable changes._');
    });
  });

  describe('prepend()', () => {
    const cf = new ChangelogFile({}, {});

    it('creates a new file with header when existingContent is null', () => {
      const result = cf.prepend(null, '## [v1.0.0] - 2024-01-01\n\n- feat');
      expect(result).toContain('# Changelog');
      expect(result).toContain('## [v1.0.0]');
    });

    it('inserts new entry before the first ## section', () => {
      const existing = '# Changelog\n\n## [v0.9.0] - 2023-01-01\n\n- old stuff';
      const result = cf.prepend(existing, '## [v1.0.0] - 2024-01-01\n\n- new');
      expect(result.indexOf('[v1.0.0]')).toBeLessThan(result.indexOf('[v0.9.0]'));
    });

    it('appends to end when no ## section exists in existing content', () => {
      const existing = '# Changelog\n\nSome preamble text without sections.';
      const result = cf.prepend(existing, '## [v1.0.0]');
      expect(result).toContain('## [v1.0.0]');
      expect(result.indexOf('## [v1.0.0]')).toBeGreaterThan(result.indexOf('preamble'));
    });
  });

  describe('write()', () => {
    it('calls createOrUpdateFileContents with encoded content', async () => {
      const octokit = makeOctokit();
      const cf = new ChangelogFile(octokit, { owner: 'o', repo: 'r' });
      await cf.write('main', '# Changelog\n\n## v1.0.0', null);
      expect(octokit._createOrUpdateFileContents).toHaveBeenCalledWith(
        expect.objectContaining({ branch: 'main', path: 'CHANGELOG.md' }),
      );
    });

    it('passes existingSha when provided', async () => {
      const octokit = makeOctokit();
      const cf = new ChangelogFile(octokit, { owner: 'o', repo: 'r' });
      await cf.write('main', '# Changelog', 'existing-sha-123');
      expect(octokit._createOrUpdateFileContents).toHaveBeenCalledWith(
        expect.objectContaining({ sha: 'existing-sha-123' }),
      );
    });
  });
});
