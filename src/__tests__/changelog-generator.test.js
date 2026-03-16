import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
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

    assert.ok(markdown.includes('✨ Features'), 'should have Features section');
    assert.ok(markdown.includes('🐛 Bug Fixes'), 'should have Bug Fixes section');
    assert.ok(markdown.includes('add OAuth login'), 'should include feat subject');
    assert.equal(bumpLevel, 'minor', 'feat commits should trigger minor bump');
  });

  it('puts breaking changes first and sets major bump', async () => {
    const commits = [
      makeCommit('feat!: drop legacy API'),
      makeCommit('fix: patch something'),
    ];

    const gen = new ChangelogGenerator(makeOctokit(commits), { owner: 'o', repo: 'r' }, defaultInputs);
    const { markdown, bumpLevel } = await gen.generate('v1.0.0', 'HEAD');

    assert.ok(markdown.startsWith('### 🚨 Breaking Changes'), 'breaking changes must come first');
    assert.equal(bumpLevel, 'major');
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

    assert.ok(!markdown.includes('update lockfile'), 'chore should be excluded');
    assert.ok(!markdown.includes('add workflow'), 'ci should be excluded');
    assert.ok(markdown.includes('real fix'), 'fix should remain');
  });

  it('places uncategorised commits in Other Changes', async () => {
    const commits = [makeCommit('random: something unexpected')];

    const gen = new ChangelogGenerator(makeOctokit(commits), { owner: 'o', repo: 'r' }, defaultInputs);
    const { markdown } = await gen.generate('v1.0.0', 'HEAD');

    assert.ok(markdown.includes('📌 Other Changes'));
  });

  it('returns empty markdown when there are no commits', async () => {
    const gen = new ChangelogGenerator(makeOctokit([]), { owner: 'o', repo: 'r' }, defaultInputs);
    const { markdown, totalCommits } = await gen.generate('v1.0.0', 'HEAD');

    assert.equal(markdown, '');
    assert.equal(totalCommits, 0);
  });
});
