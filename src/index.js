import * as core from '@actions/core';
import * as github from '@actions/github';

import { ReleaseManager } from './release-manager.js';
import { VersionManager } from './version-manager.js';
import { ChangelogGenerator } from './changelog-generator.js';
import { AssetManager } from './asset-manager.js';
import { getContributors } from './contributors.js';
import { createReleaseDiscussion } from './discussions.js';
import { writeJobSummary } from './summary.js';

async function run() {
  try {
    // ── Auth & context ───────────────────────────────────────────────────────
    const token = core.getInput('token', { required: true });
    const octokit = github.getOctokit(token);
    const { repo, sha } = github.context;

    // ── Read inputs ──────────────────────────────────────────────────────────
    const inputs = {
      // Versioning
      tag:                core.getInput('tag'),
      versionPrefix:      core.getInput('version_prefix') || 'v',
      autoVersion:        core.getBooleanInput('auto_version'),
      initialVersion:     core.getInput('initial_version') || '0.1.0',
      // Metadata
      name:               core.getInput('name'),
      body:               core.getInput('body'),
      draft:              core.getBooleanInput('draft'),
      prerelease:         core.getBooleanInput('prerelease'),
      prereleaseChannel:  core.getInput('prerelease_channel'),
      targetCommitish:    core.getInput('target_commitish') || sha,
      // Changelog
      changelogSections:  core.getInput('changelog_sections'),
      excludeTypes:       core.getInput('exclude_types').split(',').map((s) => s.trim()).filter(Boolean),
      // Contributors
      includeContributors: core.getBooleanInput('include_contributors'),
      // Assets
      files:                   core.getInput('files'),
      generateChecksums:       core.getBooleanInput('generate_checksums'),
      checksumFile:            core.getInput('checksum_file') || 'checksums.txt',
      failOnUnmatchedFiles:    core.getBooleanInput('fail_on_unmatched_files'),
      requiredAssets:          core.getInput('required_assets'),
      // Behaviour
      updateExisting:     core.getBooleanInput('update_existing'),
      // Discussions
      createDiscussion:   core.getBooleanInput('create_discussion'),
      discussionCategory: core.getInput('discussion_category') || 'Announcements',
    };

    // ── 1. Resolve version / tag ─────────────────────────────────────────────
    const versionManager = new VersionManager(octokit, repo, inputs);
    const { tag, version, previousTag } = await versionManager.resolve();

    core.info(`Tag: ${tag}  |  version: ${version}  |  previous: ${previousTag ?? '(none)'}`);

    // ── 2. Generate changelog ────────────────────────────────────────────────
    const changelogGen = new ChangelogGenerator(octokit, repo, inputs);
    const { markdown: changelogMd, totalCommits, bumpLevel } = await changelogGen.generate(
      previousTag,
      inputs.targetCommitish,
    );

    core.info(`Changelog: ${totalCommits} commit(s), bump level: ${bumpLevel}`);

    // ── 3. Gather contributors ───────────────────────────────────────────────
    let contributorsSection = '';
    let contributorCount = 0;

    if (inputs.includeContributors) {
      const contrib = await getContributors(octokit, repo, previousTag, inputs.targetCommitish);
      contributorsSection = contrib.markdown;
      contributorCount = contrib.count;
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

    // ── 5. Resolve & validate assets ────────────────────────────────────────
    const assetManager = new AssetManager(inputs);
    const assetFiles = await assetManager.resolveFiles();

    if (assetFiles.length > 0) {
      core.info(`Assets to upload: ${assetFiles.length} file(s)`);
    }

    if (inputs.requiredAssets) {
      await assetManager.validateRequired(assetFiles);
      core.info('Required assets validation passed.');
    }

    // ── 6. Create or update the release ─────────────────────────────────────
    const releaseManager = new ReleaseManager(octokit, repo, inputs);
    const { data: release } = await releaseManager.createOrUpdate({
      tag,
      name: inputs.name || tag,
      body: releaseBody,
      draft: inputs.draft,
      prerelease: inputs.prerelease || Boolean(inputs.prereleaseChannel),
      targetCommitish: inputs.targetCommitish,
    });

    core.info(`Release URL: ${release.html_url}`);

    // ── 7. Upload assets ────────────────────────────────────────────────────
    let uploadedCount = 0;

    if (assetFiles.length > 0) {
      uploadedCount = await assetManager.uploadAssets(
        octokit,
        release.upload_url,
        assetFiles,
        inputs.generateChecksums,
        inputs.checksumFile,
      );
      core.info(`Uploaded ${uploadedCount} asset(s).`);
    }

    // ── 8. Create GitHub Discussion (optional) ───────────────────────────────
    if (inputs.createDiscussion) {
      await createReleaseDiscussion(octokit, repo, release, inputs.discussionCategory);
    }

    // ── 9. Set outputs ───────────────────────────────────────────────────────
    core.setOutput('release_id',      String(release.id));
    core.setOutput('release_url',     release.html_url);
    core.setOutput('upload_url',      release.upload_url);
    core.setOutput('tag_name',        tag);
    core.setOutput('version',         version);
    core.setOutput('assets_uploaded', String(uploadedCount));
    core.setOutput('changelog',       changelogMd);
    core.setOutput('bump_level',      bumpLevel);

    // ── 10. Write Job Summary ────────────────────────────────────────────────
    await writeJobSummary({
      release,
      version,
      bumpLevel,
      changelog: changelogMd,
      uploadedCount,
      contributorCount,
      previousTag,
    });
  } catch (err) {
    core.setFailed(err.message);
    if (core.isDebug()) core.debug(err.stack);
  }
}

/**
 * Assemble the full release body from its parts.
 */
function assembleBody({ customBody, changelogMd, contributorsSection, previousTag, tag, repo }) {
  const parts = [];

  if (customBody) {
    parts.push(customBody);
  }

  if (changelogMd) {
    parts.push(changelogMd);
  }

  if (contributorsSection) {
    parts.push(contributorsSection);
  }

  if (previousTag) {
    const compareUrl =
      `https://github.com/${repo.owner}/${repo.repo}/compare/${previousTag}...${tag}`;
    parts.push(`---\n**Full Changelog**: ${compareUrl}`);
  }

  return parts.join('\n\n');
}

run();
