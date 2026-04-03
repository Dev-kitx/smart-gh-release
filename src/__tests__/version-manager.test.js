import { describe, it, expect } from 'vitest';
import { VersionManager } from '../version-manager.js';

/** Build a minimal octokit stub */
function makeOctokit({ tags = [], commits = [] } = {}) {
  return {
    rest: {
      repos: {
        listTags: async () => ({ data: tags }),
        compareCommitsWithBasehead: async () => ({ data: { commits } }),
        listCommits: async () => ({ data: commits }),
      },
    },
  };
}

const baseInputs = {
  versionPrefix: 'v',
  initialVersion: '0.1.0',
  prereleaseChannel: '',
  changelogSections: null,
  excludeTypes: [],
  targetCommitish: 'HEAD',
};

function makeCommit(message) {
  return {
    sha: 'aabbcc112233',
    html_url: 'https://github.com/o/r/commit/aabbcc112233',
    commit: { message, author: { name: 'dev' } },
    author: { login: 'dev' },
  };
}

describe('VersionManager', () => {
  it('uses an explicit tag directly', async () => {
    const vm = new VersionManager(makeOctokit(), { owner: 'o', repo: 'r' }, {
      ...baseInputs,
      tag: 'v2.0.0',
      autoVersion: false,
    });
    const { tag, version } = await vm.resolve();
    expect(tag).toBe('v2.0.0');
    expect(version).toBe('2.0.0');
  });

  it('creates initial version when no tags exist', async () => {
    const vm = new VersionManager(makeOctokit(), { owner: 'o', repo: 'r' }, {
      ...baseInputs,
      tag: '',
      autoVersion: true,
    });
    const { tag, version, previousTag } = await vm.resolve();
    expect(tag).toBe('v0.1.0');
    expect(version).toBe('0.1.0');
    expect(previousTag).toBeNull();
  });

  it('bumps minor version for feat commits', async () => {
    const vm = new VersionManager(
      makeOctokit({
        tags: [{ name: 'v1.0.0' }],
        commits: [makeCommit('feat: add search')],
      }),
      { owner: 'o', repo: 'r' },
      { ...baseInputs, tag: '', autoVersion: true },
    );
    const { tag } = await vm.resolve();
    expect(tag).toBe('v1.1.0');
  });

  it('bumps major version for breaking changes', async () => {
    const vm = new VersionManager(
      makeOctokit({
        tags: [{ name: 'v1.2.3' }],
        commits: [makeCommit('feat!: redesign API')],
      }),
      { owner: 'o', repo: 'r' },
      { ...baseInputs, tag: '', autoVersion: true },
    );
    const { tag } = await vm.resolve();
    expect(tag).toBe('v2.0.0');
  });

  it('bumps patch version for fix commits', async () => {
    const vm = new VersionManager(
      makeOctokit({
        tags: [{ name: 'v1.2.3' }],
        commits: [makeCommit('fix: null pointer on startup')],
      }),
      { owner: 'o', repo: 'r' },
      { ...baseInputs, tag: '', autoVersion: true },
    );
    const { tag } = await vm.resolve();
    expect(tag).toBe('v1.2.4');
  });

  it('creates pre-release version on a channel', async () => {
    const vm = new VersionManager(
      makeOctokit({
        tags: [{ name: 'v1.0.0' }],
        commits: [makeCommit('feat: new feature')],
      }),
      { owner: 'o', repo: 'r' },
      { ...baseInputs, tag: '', autoVersion: true, prereleaseChannel: 'beta' },
    );
    const { tag } = await vm.resolve();
    expect(tag).toBe('v1.1.0-beta.1');
  });

  it('throws when neither tag nor auto_version is provided', async () => {
    const vm = new VersionManager(makeOctokit(), { owner: 'o', repo: 'r' }, {
      ...baseInputs,
      tag: '',
      autoVersion: false,
    });
    await expect(vm.resolve()).rejects.toThrow(/auto_version/);
  });
});
