import { describe, it, expect } from 'vitest';
import { ChangelogGenerator } from '../changelog-generator.js';

/** Minimal stub commit factory */
function makeCommit(message, login = 'user1', sha = 'abc1234567890') {
  return {
    sha,
    html_url: `https://github.com/owner/repo/commit/${sha}`,
    commit: { message, author: { name: 'Test User' } },
    author: { login },
  };
}

const defaultInputs = {
  changelogSections: null,
  excludeTypes: [],
};

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

describe('ChangelogGenerator', () => {
  it('groups commits by section', async () => {
    const commits = [
      makeCommit('feat: add OAuth login'),
      makeCommit('fix(auth): handle refresh token edge case'),
      makeCommit('chore: bump deps'),
    ];

    const gen = new ChangelogGenerator(makeOctokit(commits), { owner: 'o', repo: 'r' }, defaultInputs);
    const { markdown, bumpLevel } = await gen.generate('v1.0.0', 'HEAD');

    expect(markdown).toContain('✨ Features');
    expect(markdown).toContain('🐛 Bug Fixes');
    expect(markdown).toContain('add OAuth login');
    expect(bumpLevel).toBe('minor');
  });

  it('puts breaking changes first and sets major bump', async () => {
    const commits = [
      makeCommit('feat!: drop legacy API'),
      makeCommit('fix: patch something'),
    ];

    const gen = new ChangelogGenerator(makeOctokit(commits), { owner: 'o', repo: 'r' }, defaultInputs);
    const { markdown, bumpLevel } = await gen.generate('v1.0.0', 'HEAD');

    expect(markdown.startsWith('### 🚨 Breaking Changes')).toBe(true);
    expect(bumpLevel).toBe('major');
  });

  it('excludes commit types listed in excludeTypes', async () => {
    const commits = [
      makeCommit('chore: update lockfile'),
      makeCommit('ci: add workflow'),
      makeCommit('fix: real fix'),
    ];

    const gen = new ChangelogGenerator(
      makeOctokit(commits),
      { owner: 'o', repo: 'r' },
      { ...defaultInputs, excludeTypes: ['chore', 'ci'] },
    );
    const { markdown } = await gen.generate('v1.0.0', 'HEAD');

    expect(markdown).not.toContain('update lockfile');
    expect(markdown).not.toContain('add workflow');
    expect(markdown).toContain('real fix');
  });

  it('places uncategorised commits in Other Changes', async () => {
    const commits = [makeCommit('random: something unexpected')];

    const gen = new ChangelogGenerator(makeOctokit(commits), { owner: 'o', repo: 'r' }, defaultInputs);
    const { markdown } = await gen.generate('v1.0.0', 'HEAD');

    expect(markdown).toContain('📌 Other Changes');
  });

  it('returns empty markdown when there are no commits', async () => {
    const gen = new ChangelogGenerator(makeOctokit([]), { owner: 'o', repo: 'r' }, defaultInputs);
    const { markdown, totalCommits } = await gen.generate('v1.0.0', 'HEAD');

    expect(markdown).toBe('');
    expect(totalCommits).toBe(0);
  });
});
