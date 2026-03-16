import * as core from '@actions/core';

/**
 * Write a rich GitHub Actions Job Summary for the release.
 *
 * @param {object} opts
 * @param {object}   opts.release        Release object from GitHub API
 * @param {string}   opts.version        Version string (without prefix)
 * @param {string}   opts.bumpLevel      'major' | 'minor' | 'patch'
 * @param {string}   opts.changelog      Generated changelog markdown
 * @param {number}   opts.uploadedCount  Number of uploaded assets
 * @param {number}   opts.contributorCount
 * @param {string|null} opts.previousTag
 */
export async function writeJobSummary({
  release,
  version,
  bumpLevel,
  changelog,
  uploadedCount,
  contributorCount,
  previousTag,
}) {
  const statusIcon = release.draft
    ? '📝 Draft'
    : release.prerelease
      ? '🔖 Pre-release'
      : '✅ Published';

  const bumpIcon = bumpLevel === 'major' ? '🚨 major' : bumpLevel === 'minor' ? '✨ minor' : '🐛 patch';

  await core.summary
    .addHeading(`🚀 Released ${release.tag_name}`, 1)
    .addTable([
      [
        { data: 'Field',      header: true },
        { data: 'Value',      header: true },
      ],
      ['Version',        version],
      ['Bump Level',     bumpIcon],
      ['Status',         statusIcon],
      ['Assets',         `${uploadedCount} file${uploadedCount !== 1 ? 's' : ''} uploaded`],
      ['Contributors',   `${contributorCount} contributor${contributorCount !== 1 ? 's' : ''}`],
      ['Release page',   `[${release.tag_name}](${release.html_url})`],
      ...(previousTag
        ? [
            [
              'Full changelog',
              `[${previousTag}...${release.tag_name}](${release.html_url.replace(/\/releases\/.*/, '')}/compare/${previousTag}...${release.tag_name})`,
            ],
          ]
        : []),
    ])
    .addHeading('Changelog', 2)
    .addRaw(changelog || '_No changes detected._')
    .write();
}
