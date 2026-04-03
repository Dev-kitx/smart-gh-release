import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@actions/core', () => ({ info: vi.fn(), warning: vi.fn() }));

vi.mock('@actions/glob', () => ({
  create: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({
  readFile:  vi.fn().mockResolvedValue(Buffer.from('file content')),
  stat:      vi.fn().mockResolvedValue({ size: 1024 }),
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('node:crypto', () => ({
  createHash: vi.fn(() => ({
    update: vi.fn().mockReturnThis(),
    digest: vi.fn().mockReturnValue('a'.repeat(64)),
  })),
}));

import { AssetManager } from '../asset-manager.js';
import * as glob from '@actions/glob';
import * as fs from 'node:fs/promises';
import * as core from '@actions/core';

function makeGlobber(files) {
  return { glob: vi.fn().mockResolvedValue(files) };
}

function makeOctokit() {
  return {
    rest: {
      repos: {
        uploadReleaseAsset: vi.fn().mockResolvedValue({}),
      },
    },
  };
}

beforeEach(() => vi.clearAllMocks());

describe('AssetManager', () => {
  describe('resolveFiles()', () => {
    it('returns empty array when files input is empty', async () => {
      const am = new AssetManager({ files: '' });
      expect(await am.resolveFiles()).toEqual([]);
    });

    it('resolves glob patterns to file paths', async () => {
      glob.create.mockResolvedValue(makeGlobber(['/dist/app.js', '/dist/app.css']));
      const am = new AssetManager({ files: 'dist/**', failOnUnmatchedFiles: false });
      const result = await am.resolveFiles();
      expect(result).toEqual(['/dist/app.js', '/dist/app.css']);
    });

    it('deduplicates files matched by multiple patterns', async () => {
      glob.create
        .mockResolvedValueOnce(makeGlobber(['/dist/app.js']))
        .mockResolvedValueOnce(makeGlobber(['/dist/app.js']));
      const am = new AssetManager({ files: 'dist/*.js\ndist/app*', failOnUnmatchedFiles: false });
      const result = await am.resolveFiles();
      expect(result).toEqual(['/dist/app.js']);
    });

    it('warns when a pattern matches nothing and failOnUnmatchedFiles is false', async () => {
      glob.create.mockResolvedValue(makeGlobber([]));
      const am = new AssetManager({ files: '*.xyz', failOnUnmatchedFiles: false });
      await am.resolveFiles();
      expect(core.warning).toHaveBeenCalledWith(expect.stringContaining('*.xyz'));
    });

    it('throws when a pattern matches nothing and failOnUnmatchedFiles is true', async () => {
      glob.create.mockResolvedValue(makeGlobber([]));
      const am = new AssetManager({ files: '*.xyz', failOnUnmatchedFiles: true });
      await expect(am.resolveFiles()).rejects.toThrow(/matched no files/);
    });
  });

  describe('validateRequired()', () => {
    it('does not throw when all required assets are resolved', async () => {
      glob.create.mockResolvedValue(makeGlobber(['/dist/app.js']));
      const am = new AssetManager({ requiredAssets: 'dist/*.js' });
      await expect(am.validateRequired(['/dist/app.js'])).resolves.not.toThrow();
    });

    it('throws when a required asset pattern is not in resolved files', async () => {
      glob.create.mockResolvedValue(makeGlobber(['/other/file.txt']));
      const am = new AssetManager({ requiredAssets: 'dist/*.js' });
      await expect(am.validateRequired(['/dist/app.js'])).rejects.toThrow(/matched no resolved files/);
    });

    it('does nothing when requiredAssets is empty', async () => {
      const am = new AssetManager({ requiredAssets: '' });
      await expect(am.validateRequired(['/dist/app.js'])).resolves.not.toThrow();
    });
  });

  describe('generateChecksumsFile()', () => {
    it('writes checksums.txt and returns its path', async () => {
      const am = new AssetManager({});
      const result = await am.generateChecksumsFile(['/dist/app.js', '/dist/app.css'], '/tmp/checksums.txt');
      expect(fs.writeFile).toHaveBeenCalledWith('/tmp/checksums.txt', expect.stringContaining('app.js'), 'utf8');
      expect(result).toBe('/tmp/checksums.txt');
    });

    it('includes one SHA-256 line per file', async () => {
      const am = new AssetManager({});
      await am.generateChecksumsFile(['/a/foo.zip', '/a/bar.tar.gz'], '/tmp/checksums.txt');
      const written = fs.writeFile.mock.calls[0][1];
      expect(written).toContain('foo.zip');
      expect(written).toContain('bar.tar.gz');
    });
  });

  describe('uploadAssets()', () => {
    it('uploads each file and returns the count', async () => {
      const octokit = makeOctokit();
      const am = new AssetManager({});
      const count = await am.uploadAssets(octokit, 'https://upload.url', ['/dist/app.js'], false, '');
      expect(octokit.rest.repos.uploadReleaseAsset).toHaveBeenCalledTimes(1);
      expect(count).toBe(1);
    });

    it('generates and appends checksums file when generateChecksums is true', async () => {
      const octokit = makeOctokit();
      const am = new AssetManager({});
      const count = await am.uploadAssets(
        octokit, 'https://upload.url', ['/dist/app.js'], true, '/tmp/checksums.txt',
      );
      // 1 original + 1 checksum file
      expect(octokit.rest.repos.uploadReleaseAsset).toHaveBeenCalledTimes(2);
      expect(count).toBe(2);
    });

    it('returns 0 when files array is empty', async () => {
      const octokit = makeOctokit();
      const am = new AssetManager({});
      const count = await am.uploadAssets(octokit, 'https://upload.url', [], false, '');
      expect(count).toBe(0);
    });

    it('throws a descriptive error when upload fails', async () => {
      const octokit = makeOctokit();
      octokit.rest.repos.uploadReleaseAsset.mockRejectedValue(new Error('forbidden'));
      const am = new AssetManager({});
      await expect(
        am.uploadAssets(octokit, 'https://upload.url', ['/dist/app.js'], false, ''),
      ).rejects.toThrow(/Failed to upload asset "app.js"/);
    });
  });
});
