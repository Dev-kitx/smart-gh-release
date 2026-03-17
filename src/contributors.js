import * as core from '@actions/core';

/**
 * GitHub usernames / name patterns that identify bots.
 * Bots are excluded from the contributors section.
 */
const BOT_PATTERNS = [
  /\[bot\]$/i,
  /^dependabot/i,
  /^renovate/i,
  /^github-actions/i,
  /^snyk-bot/i,
  /^semantic-release-bot/i,
  /^release-please/i,
];

function isBot(login) {
  return BOT_PATTERNS.some((p) => p.test(login));
}

/**
 * Fetch unique human contributors between two refs.
 *
 * @param {import('@octokit/core').Octokit} octokit
 * @param {{ owner: string, repo: string }} repo
 * @param {string|null} base  Previous tag / SHA  (null = first release)
 * @param {string}      head  Current SHA / branch
 * @returns {Promise<{ count: number, markdown: string, contributors: object[] }>}
 */
export async function getContributors(octokit, repo, base, head) {
  try {
    let commits;

    if (base) {
      const { data } = await octokit.rest.repos.compareCommitsWithBasehead({
        owner: repo.owner,
        repo: repo.repo,
        basehead: `${base}...${head}`,
        per_page: 250,
      });
      commits = data.commits;
    } else {
      const { data } = await octokit.rest.repos.listCommits({
        owner: repo.owner,
        repo: repo.repo,
        sha: head,
        per_page: 100,
      });
      commits = data;
    }

    // Deduplicate by login (preferred) or name
    const seen = new Map();

    for (const commit of commits) {
      const login = commit.author?.login ?? null;
      const name = commit.commit.author?.name ?? null;
      const key = login ?? name;

      if (!key) continue;
      if (login && isBot(login)) continue;
      if (!login && name && isBot(name)) continue;
      if (seen.has(key)) continue;

      seen.set(key, {
        login,
        name,
        avatarUrl: commit.author?.avatar_url ?? null,
        profileUrl: commit.author?.html_url ?? null,
      });
    }

    const contributors = [...seen.values()];

    if (contributors.length === 0) {
      return { count: 0, markdown: '', contributors: [] };
    }

    const items = contributors.map((c) =>
      c.login
        ? `- [@${c.login}](${c.profileUrl ?? `https://github.com/${c.login}`})`
        : `- ${c.name}`,
    );

    const markdown = [
      '### 🙏 Contributors',
      '',
      ...items,
    ].join('\n');

    return { count: contributors.length, markdown, contributors };
  } catch (err) {
    core.warning(`Could not fetch contributors: ${err.message}`);
    return { count: 0, markdown: '', contributors: [] };
  }
}
