import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@actions/core', () => ({ info: vi.fn(), warning: vi.fn() }));

import * as core from '@actions/core';
import { VersionBumper } from '../version-bumper.js';

const REPO = { owner: 'o', repo: 'r' };

function makeOctokit({ content = '', sha = 'file-sha', throwStatus = null } = {}) {
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
          return { data: { content: Buffer.from(content).toString('base64'), sha } };
        },
        createOrUpdateFileContents,
      },
    },
    _commit: createOrUpdateFileContents,
  };
}

describe('VersionBumper', () => {
  beforeEach(() => vi.clearAllMocks());

  // ── File type detection ─────────────────────────────────────────────────────

  describe('unknown file type', () => {
    it('warns and skips without committing', async () => {
      const octokit = makeOctokit();
      const vb = new VersionBumper(octokit, REPO);
      await vb.bumpFiles(['some-unknown-file.txt'], '1.2.3', 'main', 'v1.2.3');
      expect(core.warning).toHaveBeenCalledWith(expect.stringContaining('no version pattern known'));
      expect(octokit._commit).not.toHaveBeenCalled();
    });
  });

  // ── API error handling ──────────────────────────────────────────────────────

  describe('file not found', () => {
    it('warns and skips on 404', async () => {
      const octokit = makeOctokit({ throwStatus: 404 });
      const vb = new VersionBumper(octokit, REPO);
      await vb.bumpFiles(['package.json'], '1.2.3', 'main', 'v1.2.3');
      expect(core.warning).toHaveBeenCalledWith(expect.stringContaining('not found'));
      expect(octokit._commit).not.toHaveBeenCalled();
    });

    it('re-throws non-404 errors', async () => {
      const octokit = makeOctokit({ throwStatus: 500 });
      const vb = new VersionBumper(octokit, REPO);
      await expect(vb.bumpFiles(['package.json'], '1.2.3', 'main', 'v1.2.3')).rejects.toThrow();
    });
  });

  describe('version pattern not found in file', () => {
    it('warns and skips without committing', async () => {
      const octokit = makeOctokit({ content: '{ "name": "my-pkg" }' });
      const vb = new VersionBumper(octokit, REPO);
      await vb.bumpFiles(['package.json'], '1.2.3', 'main', 'v1.2.3');
      expect(core.warning).toHaveBeenCalledWith(expect.stringContaining('no version string found'));
      expect(octokit._commit).not.toHaveBeenCalled();
    });
  });

  describe('already at target version', () => {
    it('skips the commit without warning', async () => {
      const octokit = makeOctokit({ content: '{ "version": "1.2.3" }' });
      const vb = new VersionBumper(octokit, REPO);
      await vb.bumpFiles(['package.json'], '1.2.3', 'main', 'v1.2.3');
      expect(octokit._commit).not.toHaveBeenCalled();
      expect(core.warning).not.toHaveBeenCalled();
    });
  });

  // ── bumpFiles helpers ───────────────────────────────────────────────────────

  describe('bumpFiles()', () => {
    it('skips blank/whitespace-only entries', async () => {
      const octokit = makeOctokit();
      const vb = new VersionBumper(octokit, REPO);
      await vb.bumpFiles(['', '   ', '\n'], '1.0.0', 'main', 'v1.0.0');
      expect(octokit._commit).not.toHaveBeenCalled();
    });

    it('processes each path independently', async () => {
      let callCount = 0;
      const octokit = {
        rest: {
          repos: {
            getContent: async ({ path }) => {
              if (path === 'package.json')
                return { data: { content: Buffer.from('{ "version": "1.0.0" }').toString('base64'), sha: 's1' } };
              if (path === 'pyproject.toml')
                return { data: { content: Buffer.from('version = "1.0.0"').toString('base64'), sha: 's2' } };
              throw Object.assign(new Error(), { status: 404 });
            },
            createOrUpdateFileContents: vi.fn().mockImplementation(() => {
              callCount++;
              return Promise.resolve({});
            }),
          },
        },
      };
      const vb = new VersionBumper(octokit, REPO);
      await vb.bumpFiles(['package.json', 'pyproject.toml'], '2.0.0', 'main', 'v2.0.0');
      expect(callCount).toBe(2);
    });
  });

  // ── Per-file-type replacement ───────────────────────────────────────────────

  describe('package.json', () => {
    it('replaces the version field and commits', async () => {
      const octokit = makeOctokit({ content: '{\n  "name": "pkg",\n  "version": "1.0.0"\n}', sha: 'sha1' });
      const vb = new VersionBumper(octokit, REPO);
      await vb.bumpFiles(['package.json'], '2.1.0', 'feat-branch', 'v2.1.0');

      expect(octokit._commit).toHaveBeenCalledOnce();
      const call = octokit._commit.mock.calls[0][0];
      expect(call.path).toBe('package.json');
      expect(call.branch).toBe('feat-branch');
      expect(call.sha).toBe('sha1');
      const decoded = Buffer.from(call.content, 'base64').toString('utf8');
      expect(decoded).toContain('"version": "2.1.0"');
      expect(decoded).not.toContain('"version": "1.0.0"');
    });

    it('does not touch other fields that contain version-like strings', async () => {
      const content = '{ "version": "1.0.0", "peerDependencies": { "node": ">=18" } }';
      const octokit = makeOctokit({ content });
      const vb = new VersionBumper(octokit, REPO);
      await vb.bumpFiles(['package.json'], '1.1.0', 'main', 'v1.1.0');
      const decoded = Buffer.from(octokit._commit.mock.calls[0][0].content, 'base64').toString('utf8');
      expect(decoded).toContain('"version": "1.1.0"');
      expect(decoded).toContain('"node": ">=18"');
    });
  });

  describe('pyproject.toml', () => {
    it('replaces version = "..." and commits', async () => {
      const content = '[project]\nname = "mylib"\nversion = "0.9.0"\n';
      const octokit = makeOctokit({ content });
      const vb = new VersionBumper(octokit, REPO);
      await vb.bumpFiles(['pyproject.toml'], '1.0.0', 'main', 'v1.0.0');
      const decoded = Buffer.from(octokit._commit.mock.calls[0][0].content, 'base64').toString('utf8');
      expect(decoded).toContain('version = "1.0.0"');
      expect(decoded).not.toContain('version = "0.9.0"');
    });

    it('handles Poetry-style pyproject.toml', async () => {
      const content = '[tool.poetry]\nname = "mylib"\nversion = "0.5.0"\n';
      const octokit = makeOctokit({ content });
      const vb = new VersionBumper(octokit, REPO);
      await vb.bumpFiles(['pyproject.toml'], '0.6.0', 'main', 'v0.6.0');
      const decoded = Buffer.from(octokit._commit.mock.calls[0][0].content, 'base64').toString('utf8');
      expect(decoded).toContain('version = "0.6.0"');
    });
  });

  describe('setup.cfg', () => {
    it('replaces version = <plain value>', async () => {
      const content = '[metadata]\nname = mylib\nversion = 1.2.0\n';
      const octokit = makeOctokit({ content });
      const vb = new VersionBumper(octokit, REPO);
      await vb.bumpFiles(['setup.cfg'], '1.3.0', 'main', 'v1.3.0');
      const decoded = Buffer.from(octokit._commit.mock.calls[0][0].content, 'base64').toString('utf8');
      expect(decoded).toContain('version = 1.3.0');
      expect(decoded).not.toContain('version = 1.2.0');
    });
  });

  describe('setup.py', () => {
    it('replaces version="..." with double quotes', async () => {
      const content = 'setup(\n    name="mylib",\n    version="0.1.0",\n)\n';
      const octokit = makeOctokit({ content });
      const vb = new VersionBumper(octokit, REPO);
      await vb.bumpFiles(['setup.py'], '0.2.0', 'main', 'v0.2.0');
      const decoded = Buffer.from(octokit._commit.mock.calls[0][0].content, 'base64').toString('utf8');
      expect(decoded).toContain('version="0.2.0"');
    });

    it('replaces version=\'...\' with single quotes', async () => {
      const content = "setup(name='mylib', version='0.1.0')\n";
      const octokit = makeOctokit({ content });
      const vb = new VersionBumper(octokit, REPO);
      await vb.bumpFiles(['setup.py'], '0.2.0', 'main', 'v0.2.0');
      const decoded = Buffer.from(octokit._commit.mock.calls[0][0].content, 'base64').toString('utf8');
      expect(decoded).toContain("version='0.2.0'");
    });
  });

  describe('__init__.py / _version.py / version.py', () => {
    it.each([
      ['src/mylib/__init__.py'],
      ['src/mylib/_version.py'],
      ['src/mylib/version.py'],
    ])('replaces __version__ in %s', async (filePath) => {
      const content = '__version__ = "1.0.0"\n';
      const octokit = makeOctokit({ content });
      const vb = new VersionBumper(octokit, REPO);
      await vb.bumpFiles([filePath], '1.1.0', 'main', 'v1.1.0');
      const decoded = Buffer.from(octokit._commit.mock.calls[0][0].content, 'base64').toString('utf8');
      expect(decoded).toContain('__version__ = "1.1.0"');
      expect(decoded).not.toContain('__version__ = "1.0.0"');
    });

    it('handles single-quoted __version__', async () => {
      const content = "__version__ = '2.0.0'\n";
      const octokit = makeOctokit({ content });
      const vb = new VersionBumper(octokit, REPO);
      await vb.bumpFiles(['_version.py'], '2.1.0', 'main', 'v2.1.0');
      const decoded = Buffer.from(octokit._commit.mock.calls[0][0].content, 'base64').toString('utf8');
      expect(decoded).toContain("__version__ = '2.1.0'");
    });
  });

  describe('Cargo.toml', () => {
    it('replaces version = "..." and commits', async () => {
      const content = '[package]\nname = "myapp"\nversion = "0.3.0"\nedition = "2021"\n';
      const octokit = makeOctokit({ content });
      const vb = new VersionBumper(octokit, REPO);
      await vb.bumpFiles(['Cargo.toml'], '0.4.0', 'main', 'v0.4.0');
      const decoded = Buffer.from(octokit._commit.mock.calls[0][0].content, 'base64').toString('utf8');
      expect(decoded).toContain('version = "0.4.0"');
      expect(decoded).not.toContain('version = "0.3.0"');
    });
  });

  describe('*.gemspec', () => {
    it('replaces .version = "..."', async () => {
      const content = 'Gem::Specification.new do |s|\n  s.name    = "mygem"\n  s.version = "1.0.0"\nend\n';
      const octokit = makeOctokit({ content });
      const vb = new VersionBumper(octokit, REPO);
      await vb.bumpFiles(['mygem.gemspec'], '1.1.0', 'main', 'v1.1.0');
      const decoded = Buffer.from(octokit._commit.mock.calls[0][0].content, 'base64').toString('utf8');
      expect(decoded).toContain('.version = "1.1.0"');
      expect(decoded).not.toContain('.version = "1.0.0"');
    });
  });

  // ── Commit metadata ─────────────────────────────────────────────────────────

  describe('commit message', () => {
    it('includes the tag and file path', async () => {
      const octokit = makeOctokit({ content: '{ "version": "0.0.1" }' });
      const vb = new VersionBumper(octokit, REPO);
      await vb.bumpFiles(['package.json'], '1.0.0', 'smart-release', 'v1.0.0');
      const { message } = octokit._commit.mock.calls[0][0];
      expect(message).toContain('v1.0.0');
      expect(message).toContain('package.json');
    });
  });
});
