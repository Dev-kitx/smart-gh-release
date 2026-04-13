import * as core from '@actions/core';

/**
 * Write a rich GitHub Actions Job Summary for the release.
 *
 * @param {object} opts
 * @param {object}      opts.release          Release object from GitHub API
 * @param {string}      opts.version          Version string (without prefix)
 * @param {string}      opts.bumpLevel        'major' | 'minor' | 'patch'
 * @param {string}      opts.changelog        Generated changelog markdown
 * @param {number}      opts.uploadedCount    Number of uploaded assets
 * @param {number}      opts.contributorCount
 * @param {string|null} opts.previousTag
 * @param {string}      [opts.majorTag]       Floating major tag (e.g. 'v1'), if published
 * @param {boolean}     [opts.dryRun]         When true, adds a dry-run banner
 */
export async function writeJobSummary({
  release,
  version,
  bumpLevel,
  changelog,
  uploadedCount,
  contributorCount,
  previousTag,
  majorTag,
  dryRun,
}) {
  const statusIcon = release.draft
    ? '📝 Draft'
    : release.prerelease
      ? '🔖 Pre-release'
      : '✅ Published';

  const bumpIcon = bumpLevel === 'major' ? '🚨 major' : bumpLevel === 'minor' ? '✨ minor' : '🐛 patch';

  const summary = core.summary;
  if (dryRun) summary.addRaw('> [!NOTE]\n> **Dry run** — no release was created. All outputs reflect what would have happened.\n\n');

  await summary
    .addHeading(dryRun ? `🔍 Dry Run: ${release.tag_name}` : `🚀 Released ${release.tag_name}`, 1)
    .addTable([
      [
        { data: 'Field', header: true },
        { data: 'Value', header: true },
      ],
      ['Version',      version],
      ['Bump Level',   bumpIcon],
      ['Status',       dryRun ? '🔍 Dry run (not published)' : statusIcon],
      ...(majorTag ? [['Major tag', `\`${majorTag}\` → ${release.tag_name}`]] : []),
      ['Assets',       `${uploadedCount} file${uploadedCount !== 1 ? 's' : ''} uploaded`],
      ['Contributors', `${contributorCount} contributor${contributorCount !== 1 ? 's' : ''}`],
      ['Release page', `[${release.tag_name}](${release.html_url})`],
      ...(previousTag
        ? [[
            'Full changelog',
            `[${previousTag}...${release.tag_name}](${release.html_url.replace(/\/releases\/.*/, '')}/compare/${previousTag}...${release.tag_name})`,
          ]]
        : []),
    ])
    .addHeading('Changelog', 2)
    .addRaw(changelog || '_No changes detected._')
    .write();
}

/**
 * Write a minimal Job Summary for the major_tag_only flow.
 *
 * @param {object} opts
 * @param {string} opts.tag       Full release tag (e.g. 'v0.5.1')
 * @param {string} opts.majorTag  Floating major tag (e.g. 'v1')
 */
export async function writeMajorTagSummary({ tag, majorTag }) {
  await core.summary
    .addHeading(`🏷️ Major tag updated`, 1)
    .addTable([
      [
        { data: 'Field',     header: true },
        { data: 'Value',     header: true },
      ],
      ['Major tag',    `\`${majorTag}\``],
      ['Points to',    tag],
    ])
    .write();
}
