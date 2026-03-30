import * as core from '@actions/core';
import { parseConventionalCommit, parseSections, isBot } from './utils.js';

export class ChangelogGenerator {
  /**
   * @param {import('@octokit/core').Octokit} octokit
   * @param {{ owner: string, repo: string }} repo
   * @param {object} inputs  Parsed action inputs
   */
  constructor(octokit, repo, inputs) {
    this.octokit = octokit;
    this.repo = repo;
    this.sections = parseSections(inputs.changelogSections);
    this.excludeTypes = new Set(inputs.excludeTypes ?? []);
  }

  /**
   * Generate a changelog between two refs.
   *
   * @param {string|null} base  Previous tag / SHA (null = first release)
   * @param {string}      head  Current SHA / branch
   * @returns {Promise<{ markdown: string, totalCommits: number, bumpLevel: 'major'|'minor'|'patch', commits: object[] }>}
   */
  async generate(base, head) {
    const rawCommits = await this.fetchCommits(base, head);

    if (rawCommits.length === 0) {
      return { markdown: '', totalCommits: 0, bumpLevel: 'patch', commits: [] };
    }

    const humanCommits = rawCommits.filter((c) => {
      const login = c.author?.login ?? null;
      const name  = c.commit.author?.name ?? null;
      return !(login && isBot(login)) && !(name && isBot(name));
    });

    const commits = humanCommits.map((c) => ({
      ...parseConventionalCommit(c.commit.message),
      sha: c.sha,
      shortSha: c.sha.slice(0, 7),
      author: c.commit.author?.name ?? 'unknown',
      authorLogin: c.author?.login ?? null,
      url: c.html_url,
    }));

    const bumpLevel = this.determineBumpLevel(commits);
    const markdown = this.buildMarkdown(commits);

    return { markdown, totalCommits: rawCommits.length, bumpLevel, commits };
  }

  // ── Private ────────────────────────────────────────────────────────────────

  async fetchCommits(base, head) {
    try {
      if (base) {
        const { data } = await this.octokit.rest.repos.compareCommitsWithBasehead({
          owner: this.repo.owner,
          repo: this.repo.repo,
          basehead: `${base}...${head}`,
          per_page: 250,
        });
        return data.commits;
      }

      // First release — grab recent commits
      const { data } = await this.octokit.rest.repos.listCommits({
        owner: this.repo.owner,
        repo: this.repo.repo,
        sha: head,
        per_page: 100,
      });
      return data;
    } catch (err) {
      core.warning(`Changelog: could not fetch commits — ${err.message}`);
      return [];
    }
  }

  determineBumpLevel(commits) {
    if (commits.some((c) => c.breaking)) return 'major';
    if (commits.some((c) => ['feat', 'feature'].includes(c.type ?? ''))) return 'minor';
    return 'patch';
  }

  buildMarkdown(commits) {
    const parts = [];

    // ── Breaking changes (always first, even if type is excluded) ────────────
    const breaking = commits.filter((c) => c.breaking);
    if (breaking.length > 0) {
      parts.push(`### 🚨 Breaking Changes\n\n${breaking.map((c) => this.fmt(c)).join('\n')}`);
    }

    // ── Defined sections ─────────────────────────────────────────────────────
    for (const section of this.sections) {
      // Skip if the user excluded this entire section's types
      if (section.types.every((t) => this.excludeTypes.has(t))) continue;

      const matching = commits.filter(
        (c) =>
          !c.breaking &&
          c.type !== null &&
          section.types.includes(c.type) &&
          !this.excludeTypes.has(c.type),
      );
      if (matching.length === 0) continue;

      parts.push(
        `### ${section.emoji} ${section.label}\n\n${matching.map((c) => this.fmt(c)).join('\n')}`,
      );
    }

    // ── Uncategorised (commit types not covered by any section) ──────────────
    const knownTypes = new Set(this.sections.flatMap((s) => s.types));
    const uncategorised = commits.filter(
      (c) => !c.breaking && (c.type === null || !knownTypes.has(c.type)),
    );
    if (uncategorised.length > 0) {
      parts.push(
        `### 📌 Other Changes\n\n${uncategorised.map((c) => this.fmt(c)).join('\n')}`,
      );
    }

    return parts.join('\n\n');
  }

  /** Format a single commit as a Markdown list item. */
  fmt(commit) {
    const scope = commit.scope ? `**${commit.scope}**: ` : '';
    const shaLink = `([${commit.shortSha}](${commit.url}))`;
    const by = commit.authorLogin
      ? ` by @${commit.authorLogin}`
      : commit.author !== 'unknown'
        ? ` by ${commit.author}`
        : '';
    return `- ${scope}${commit.subject} ${shaLink}${by}`;
  }
}
