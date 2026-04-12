import * as core from '@actions/core';
import * as github from '@actions/github';

import { ReleaseManager }        from './release-manager.js';
import { VersionManager }        from './version-manager.js';
import { ChangelogGenerator }    from './changelog-generator.js';
import { AssetManager }          from './asset-manager.js';
import { getContributors }       from './contributors.js';
import { createReleaseDiscussion } from './discussions.js';
import { writeJobSummary, writeMajorTagSummary } from './summary.js';
import { ChangelogFile }         from './changelog-file.js';
import { PrManager }             from './pr-manager.js';
import { VersionBumper }         from './version-bumper.js';
import { BadgeGenerator }        from './badge.js';
import { MajorTag }              from './major-tag.js';

// Branch names used for changelog PRs
const RELEASE_BRANCH   = 'smart-release';
const CHANGELOG_BRANCH = 'smart-changelog';

async function run() {
  try {
    // ── Auth & context ───────────────────────────────────────────────────────
    const token   = core.getInput('token', { required: true });
    const octokit = github.getOctokit(token);
    const { repo, sha } = github.context;

    // ── Read inputs ──────────────────────────────────────────────────────────
    const inputs = {
      // Versioning
      tag:               core.getInput('tag'),
      versionPrefix:     core.getInput('version_prefix') || 'v',
      autoVersion:       core.getBooleanInput('auto_version'),
      initialVersion:    core.getInput('initial_version') || '0.1.0',
      // Metadata
      name:              core.getInput('name'),
      body:              core.getInput('body'),
      draft:             core.getBooleanInput('draft'),
      prerelease:        core.getBooleanInput('prerelease'),
      prereleaseChannel: core.getInput('prerelease_channel'),
      targetCommitish:   core.getInput('target_commitish') || sha,
      // Changelog
      changelogSections: core.getInput('changelog_sections'),
      excludeTypes:      core.getInput('exclude_types').split(',').map((s) => s.trim()).filter(Boolean),
      // Contributors
      includeContributors: core.getBooleanInput('include_contributors'),
      // Assets
      files:                core.getInput('files'),
      generateChecksums:    core.getBooleanInput('generate_checksums'),
      checksumFile:         core.getInput('checksum_file') || 'checksums.txt',
      failOnUnmatchedFiles: core.getBooleanInput('fail_on_unmatched_files'),
      requiredAssets:       core.getInput('required_assets'),
      // Behaviour
      updateExisting: core.getBooleanInput('update_existing'),
      autoRelease:    core.getBooleanInput('auto_release'),
      // Discussions
      createDiscussion:   core.getBooleanInput('create_discussion'),
      discussionCategory: core.getInput('discussion_category') || 'Announcements',
      // PR comments
      commentOnPRs: core.getBooleanInput('comment_on_prs'),
      // Version file bumping
      bumpVersionInFiles: core.getInput('bump_version_in_files')
        .split(/[\n,]/)
        .map((s) => s.trim())
        .filter(Boolean),
      // Badge
      generateBadge: core.getBooleanInput('generate_badge'),
      // Major tag
      publishMajorTag: core.getBooleanInput('publish_major_tag'),
      majorTagOnly:    core.getBooleanInput('major_tag_only'),
      // Behaviour
      skipIfNoCommits: core.getBooleanInput('skip_if_no_commits'),
      dryRun:          core.getBooleanInput('dry_run'),
    };

    // ── Route: major_tag_only ────────────────────────────────────────────────
    // Used in a second job (protected by a GitHub Environment) that only needs
    // to publish the floating major tag — skips the full release flow entirely.
    if (inputs.majorTagOnly) {
      if (!inputs.tag) {
        core.setFailed('major_tag_only requires the `tag` input to be set (e.g. tag: v1.2.3)');
        return;
      }
      core.info(`major_tag_only — publishing floating major tag for ${inputs.tag}`);
      const mt        = new MajorTag(octokit, repo);
      const commitSha = await mt.resolveTagSha(inputs.tag);
      const majorTag  = await mt.publish(inputs.tag, commitSha);
      if (majorTag) await writeMajorTagSummary({ tag: inputs.tag, majorTag });
      core.setOutput('major_tag', majorTag ?? '');
      core.setOutput('tag_name',  inputs.tag);
      return;
    }

    const prManager     = new PrManager(octokit, repo);
    const defaultBranch = await prManager.getDefaultBranch();

    // ── Route: auto_release: false ───────────────────────────────────────────
    if (!inputs.autoRelease) {
      const isReleaseMerge = await prManager.isMergedPR(RELEASE_BRANCH, sha);

      if (!isReleaseMerge) {
        // Regular push → update CHANGELOG.md and open/update the Release PR
        core.info(`auto_release: false — updating ${RELEASE_BRANCH} PR`);
        await runChangelogPR({ octokit, repo, inputs, sha, prManager, defaultBranch });
        return;
      }

      core.info(`${RELEASE_BRANCH} PR merged — creating GitHub Release`);
      // Fall through to the shared release flow below
    } else {
      // auto_release: true — skip if this push merged the smart-changelog PR
      // (prevents an infinite loop: changelog PR merge → new release → new changelog PR → …)
      const isChangelogMerge = await prManager.isMergedPR(CHANGELOG_BRANCH, sha);
      if (isChangelogMerge) {
        core.info(`${CHANGELOG_BRANCH} PR merged — no release needed`);
        return;
      }
    }

    // ── Shared release flow ──────────────────────────────────────────────────

    // ── 1. Resolve version / tag ─────────────────────────────────────────────
    const versionManager = new VersionManager(octokit, repo, inputs);
    const { tag, version, previousTag } = await versionManager.resolve();

    core.info(`Tag: ${tag}  |  version: ${version}  |  previous: ${previousTag ?? '(none)'}`);

    // ── 2. Generate changelog ────────────────────────────────────────────────
    const changelogGen = new ChangelogGenerator(octokit, repo, inputs);
    const { markdown: changelogMd, totalCommits, bumpLevel, commits } = await changelogGen.generate(
      previousTag,
      inputs.targetCommitish,
    );

    core.info(`Changelog: ${totalCommits} commit(s), bump level: ${bumpLevel}`);

    if (inputs.skipIfNoCommits && totalCommits === 0) {
      core.info('No commits since last tag — skipping release (skip_if_no_commits: true).');
      core.setOutput('skipped', 'true');
      return;
    }

    // ── 3. Gather contributors ───────────────────────────────────────────────
    let contributorsSection = '';
    let contributorCount    = 0;

    if (inputs.includeContributors) {
      const contrib = await getContributors(octokit, repo, previousTag, inputs.targetCommitish);
      contributorsSection = contrib.markdown;
      contributorCount    = contrib.count;
      if (contributorCount > 0) core.info(`Contributors: ${contributorCount}`);
    }

    // ── 4. Assemble release body ─────────────────────────────────────────────
    const releaseBody = assembleBody({
      customBody: inputs.body,
      changelogMd,
      contributorsSection,
      previousTag,
      tag,
      repo,
    });

    // ── 5. Resolve & validate assets ─────────────────────────────────────────
    const assetManager = new AssetManager(inputs);
    const assetFiles   = await assetManager.resolveFiles();

    if (assetFiles.length > 0) {
      core.info(`Assets to upload: ${assetFiles.length} file(s)`);
    }

    if (inputs.requiredAssets) {
      await assetManager.validateRequired(assetFiles);
      core.info('Required assets validation passed.');
    }

    // ── 6. Create or update the release ──────────────────────────────────────
    let release;
    if (inputs.dryRun) {
      core.info(`[DRY RUN] Would create release ${tag}`);
      release = {
        id:         0,
        html_url:   `https://github.com/${repo.owner}/${repo.repo}/releases/tag/${tag}`,
        upload_url: '',
        tag_name:   tag,
        draft:      inputs.draft,
        prerelease: inputs.prerelease || Boolean(inputs.prereleaseChannel),
      };
    } else {
      const releaseManager   = new ReleaseManager(octokit, repo, inputs);
      const { data }         = await releaseManager.createOrUpdate({
        tag,
        name:            inputs.name || tag,
        body:            releaseBody,
        draft:           inputs.draft,
        prerelease:      inputs.prerelease || Boolean(inputs.prereleaseChannel),
        targetCommitish: inputs.targetCommitish,
      });
      release = data;
      core.info(`Release URL: ${release.html_url}`);
    }

    // ── 6.5. Publish floating major tag (optional) ────────────────────────────
    let majorTag = '';
    if (inputs.publishMajorTag) {
      if (inputs.dryRun) {
        majorTag = MajorTag.majorTagFor(tag) ?? '';
        core.info(`[DRY RUN] Would update floating tag ${majorTag} → ${tag}`);
      } else {
        const majorTagPublisher = new MajorTag(octokit, repo);
        majorTag = (await majorTagPublisher.publish(tag, sha)) ?? '';
      }
    }

    // ── 7. Upload assets ──────────────────────────────────────────────────────
    let uploadedCount = 0;

    if (assetFiles.length > 0) {
      if (inputs.dryRun) {
        core.info(`[DRY RUN] Would upload ${assetFiles.length} asset(s)`);
      } else {
        uploadedCount = await assetManager.uploadAssets(
          octokit,
          release.upload_url,
          assetFiles,
          inputs.generateChecksums,
          inputs.checksumFile,
        );
        core.info(`Uploaded ${uploadedCount} asset(s).`);
      }
    }

    // ── 8. Create GitHub Discussion (optional) ────────────────────────────────
    if (inputs.createDiscussion) {
      if (inputs.dryRun) {
        core.info(`[DRY RUN] Would create Discussion in "${inputs.discussionCategory}"`);
      } else {
        await createReleaseDiscussion(octokit, repo, release, inputs.discussionCategory);
      }
    }

    // ── 8.5. Comment release info on merged PRs ───────────────────────────────
    if (inputs.commentOnPRs && commits.length > 0) {
      if (inputs.dryRun) {
        core.info(`[DRY RUN] Would comment on PRs for ${commits.length} commit(s)`);
      } else {
        const commitShas = commits.map((c) => c.sha);
        const mergedPRs  = await prManager.findMergedPRsForCommits(commitShas, [
          RELEASE_BRANCH,
          CHANGELOG_BRANCH,
        ]);
        if (mergedPRs.length > 0) {
          await prManager.commentReleaseOnPRs(mergedPRs, tag, release.html_url);
        }
      }
    }

    // ── 9. Set outputs ────────────────────────────────────────────────────────
    core.setOutput('release_id',      String(release.id));
    core.setOutput('release_url',     release.html_url);
    core.setOutput('upload_url',      release.upload_url);
    core.setOutput('tag_name',        tag);
    core.setOutput('version',         version);
    core.setOutput('assets_uploaded', String(uploadedCount));
    core.setOutput('changelog',       changelogMd);
    core.setOutput('bump_level',      bumpLevel);
    core.setOutput('skipped',         'false');
    core.setOutput('badge_url',       BadgeGenerator.badgeUrl(repo.owner, repo.repo, defaultBranch));
    core.setOutput('badge_markdown',  BadgeGenerator.badgeMarkdown(repo.owner, repo.repo, defaultBranch));
    core.setOutput('major_tag',       majorTag);

    // ── 10. Write Job Summary ─────────────────────────────────────────────────
    await writeJobSummary({
      release,
      version,
      bumpLevel,
      changelog: changelogMd,
      uploadedCount,
      contributorCount,
      previousTag,
      majorTag: majorTag || undefined,
      dryRun:   inputs.dryRun,
    });

    // ── 11. Open smart-changelog PR (auto_release: true only) ─────────────────
    // When auto_release: false, CHANGELOG.md is already in main via the smart-release PR.
    if (inputs.autoRelease) {
      await openChangelogPR({ octokit, repo, inputs, tag, version, changelogMd, sha, prManager, defaultBranch });
    }
  } catch (err) {
    core.setFailed(err.message);
    if (core.isDebug()) core.debug(err.stack);
  }
}

// ── auto_release: false — regular push path ──────────────────────────────────
/**
 * Compute next version, update CHANGELOG.md on the smart-release branch,
 * and open or update the Release PR. No GitHub Release is created here.
 */
async function runChangelogPR({ octokit, repo, inputs, sha, prManager, defaultBranch }) {
  // Resolve next version (tag computed but NOT created yet)
  const versionManager = new VersionManager(octokit, repo, inputs);
  const { tag, version, previousTag } = await versionManager.resolve();
  core.info(`Pending release: ${tag}  |  previous: ${previousTag ?? '(none)'}`);

  // Generate changelog
  const changelogGen = new ChangelogGenerator(octokit, repo, inputs);
  const { markdown: changelogMd, totalCommits } = await changelogGen.generate(
    previousTag,
    inputs.targetCommitish,
  );

  if (totalCommits === 0) {
    core.info('No commits since last tag — skipping Release PR update.');
    return;
  }

  // Build updated CHANGELOG.md from main's current content + new entry
  const changelogFile = new ChangelogFile(octokit, repo);
  const { content: baseContent, sha: fileSha } = await changelogFile.read(defaultBranch);
  const entry      = changelogFile.buildEntry(tag, changelogMd);
  const newContent = changelogFile.prepend(baseContent, entry);

  if (inputs.dryRun) {
    core.info(`[DRY RUN] Would reset branch ${RELEASE_BRANCH} and commit CHANGELOG.md for ${tag}`);
    if (inputs.bumpVersionInFiles.length > 0)
      core.info(`[DRY RUN] Would bump version in: ${inputs.bumpVersionInFiles.join(', ')}`);
    if (inputs.generateBadge)
      core.info(`[DRY RUN] Would update badge file`);
    core.info(`[DRY RUN] Would open/update Release PR: 🚀 Release ${tag}`);
    core.setOutput('tag_name', tag);
    return;
  }

  // Reset smart-release branch to current main HEAD (keeps PR cleanly mergeable),
  // then commit the updated CHANGELOG.md and any version file bumps on top of it.
  await prManager.resetOrCreateBranch(RELEASE_BRANCH, sha);
  await changelogFile.write(
    RELEASE_BRANCH,
    newContent,
    fileSha,
    `chore(release): update CHANGELOG.md for ${tag}`,
  );

  if (inputs.bumpVersionInFiles.length > 0) {
    const versionBumper = new VersionBumper(octokit, repo);
    await versionBumper.bumpFiles(inputs.bumpVersionInFiles, version, RELEASE_BRANCH, tag);
  }

  if (inputs.generateBadge) {
    const isPrerelease = inputs.prerelease || Boolean(inputs.prereleaseChannel);
    const badge = new BadgeGenerator(octokit, repo);
    await badge.generate(tag, isPrerelease, RELEASE_BRANCH);
  }

  // Open or update the Release PR (label applied only on creation)
  const pr = await prManager.openOrUpdatePR(
    RELEASE_BRANCH,
    defaultBranch,
    `🚀 Release ${tag}`,
    buildReleasePRBody(tag, changelogMd),
    true,   // addReleaseLabel
  );

  core.setOutput('pr_url',   pr.html_url);
  core.setOutput('tag_name', tag);
}

// ── auto_release: true — open smart-changelog PR after release ───────────────
/**
 * After a release is published, open or update the smart-changelog PR so that
 * CHANGELOG.md (and any version files) in the repository stay up to date.
 */
async function openChangelogPR({ octokit, repo, inputs, tag, version, changelogMd, sha, prManager, defaultBranch }) {
  const changelogFile = new ChangelogFile(octokit, repo);

  // If a changelog PR is already open, read accumulated content from that branch
  // so multiple releases before the PR is merged don't overwrite each other.
  // Always read fileSha from main since the branch is reset to main before writing.
  const existingPR = await prManager.findOpenPR(CHANGELOG_BRANCH);
  const { content: baseContent } = existingPR
    ? await changelogFile.read(CHANGELOG_BRANCH)
    : await changelogFile.read(defaultBranch);
  const { sha: fileSha } = await changelogFile.read(defaultBranch);

  const entry      = changelogFile.buildEntry(tag, changelogMd);
  const newContent = changelogFile.prepend(baseContent, entry);

  if (!inputs.dryRun) {
    await prManager.resetOrCreateBranch(CHANGELOG_BRANCH, sha);
    await changelogFile.write(
      CHANGELOG_BRANCH,
      newContent,
      fileSha,
      `chore(changelog): update CHANGELOG.md for ${tag}`,
    );

    if (inputs.bumpVersionInFiles.length > 0) {
      const versionBumper = new VersionBumper(octokit, repo);
      await versionBumper.bumpFiles(inputs.bumpVersionInFiles, version, CHANGELOG_BRANCH, tag);
    }

    if (inputs.generateBadge) {
      const isPrerelease = inputs.prerelease || Boolean(inputs.prereleaseChannel);
      const badge = new BadgeGenerator(octokit, repo);
      await badge.generate(tag, isPrerelease, CHANGELOG_BRANCH);
    }
  }

  // Accumulate all release entries so the PR description always shows every
  // release included since the last time this PR was merged, not just the latest.
  const prevEntries = existingPR ? extractPREntries(existingPR.body) : [];
  const allEntries  = [...prevEntries, { tag, markdown: changelogMd }];

  const prTitle = allEntries.length === 1
    ? `📋 Update CHANGELOG.md for ${tag}`
    : `📋 Update CHANGELOG.md (${allEntries.length} releases)`;

  if (inputs.dryRun) {
    core.info(`[DRY RUN] Would open/update Changelog PR: ${prTitle}`);
    return;
  }

  const pr = await prManager.openOrUpdatePR(
    CHANGELOG_BRANCH,
    defaultBranch,
    prTitle,
    buildChangelogPRBody(allEntries),
  );

  core.setOutput('pr_url', pr.html_url);
  core.info(`Changelog PR: ${pr.html_url}`);
}

// ── PR body builders ─────────────────────────────────────────────────────────

function buildReleasePRBody(tag, changelogMd) {
  const changes = changelogMd?.trim()
    ? `### Changes since last release\n\n${changelogMd}`
    : '_No notable changes._';

  return [
    `## 🚀 Pending Release: ${tag}`,
    '',
    '> **Merging this PR will trigger the GitHub Release.**',
    '> This PR is automatically updated with each new push to the default branch.',
    '',
    changes,
    '',
    '---',
    '_Auto-generated by [smart-gh-release](https://github.com/Dev-Kitx/smart-gh-release)_',
  ].join('\n');
}

// Hidden marker used to persist accumulated release entries across PR body updates.
const PR_ENTRIES_MARKER = '<!-- smart-gh-release-entries:';

/**
 * Build the changelog PR body showing ALL accumulated releases since the last merge.
 *
 * @param {{ tag: string, markdown: string|null }[]} entries  Oldest-first list of releases
 */
function buildChangelogPRBody(entries) {
  // Show newest release first in the PR body
  const sections = [...entries].reverse().map(({ tag, markdown }) =>
    markdown?.trim()
      ? `### Changes in ${tag}\n\n${markdown}`
      : `### ${tag}\n\n_No notable changes._`,
  );

  const heading = entries.length === 1
    ? `## 📋 Changelog update for ${entries[0].tag}`
    : `## 📋 Changelog update (${entries.length} releases: ${[...entries].reverse().map((e) => e.tag).join(', ')})`;

  return [
    heading,
    '',
    '> GitHub Release(s) have been published.',
    '> Merge this PR to update `CHANGELOG.md` in your repository.',
    '>',
    '> ⚠️ If your branch has required reviews or status checks, merge this PR manually.',
    '',
    sections.join('\n\n---\n\n'),
    '',
    '---',
    '_Auto-generated by [smart-gh-release](https://github.com/Dev-Kitx/smart-gh-release)_',
    // Store entries as a hidden comment so future updates can accumulate correctly
    `${PR_ENTRIES_MARKER}${JSON.stringify(entries)} -->`,
  ].join('\n');
}

/**
 * Extract the accumulated release entries embedded in a PR body by buildChangelogPRBody.
 * Returns an empty array when the marker is absent (e.g. PR created by an older version).
 *
 * @param {string|null|undefined} prBody
 * @returns {{ tag: string, markdown: string|null }[]}
 */
function extractPREntries(prBody) {
  if (!prBody) return [];
  const start = prBody.indexOf(PR_ENTRIES_MARKER);
  if (start === -1) return [];
  const end = prBody.indexOf(' -->', start);
  if (end === -1) return [];
  try {
    return JSON.parse(prBody.slice(start + PR_ENTRIES_MARKER.length, end));
  } catch {
    return [];
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Assemble the full release body from its parts.
 */
function assembleBody({ customBody, changelogMd, contributorsSection, previousTag, tag, repo }) {
  const parts = [];

  if (customBody)          parts.push(customBody);
  if (changelogMd)         parts.push(changelogMd);
  if (contributorsSection) parts.push(contributorsSection);

  if (previousTag) {
    const compareUrl =
      `https://github.com/${repo.owner}/${repo.repo}/compare/${previousTag}...${tag}`;
    parts.push(`---\n**Full Changelog**: ${compareUrl}`);
  }

  return parts.join('\n\n');
}

run();
