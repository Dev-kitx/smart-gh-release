/**
 * Parse a multiline action input into an array of trimmed, non-empty strings.
 * @param {string} value
 * @returns {string[]}
 */
export function parseMultilineInput(value) {
  if (!value) return [];
  return value
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Format a byte count into a human-readable string.
 * @param {number} bytes
 * @returns {string}
 */
export function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / 1024 ** i).toFixed(1)} ${units[Math.min(i, units.length - 1)]}`;
}

/**
 * Parse a conventional commit message header.
 *
 * Supports:
 *   type(scope)!: subject
 *   type!: subject
 *   type(scope): subject
 *   type: subject
 *   BREAKING CHANGE: … in the commit body/footer
 *
 * @param {string} message  Full commit message
 * @returns {{ type: string|null, scope: string|null, breaking: boolean, subject: string }}
 */
export function parseConventionalCommit(message) {
  const [header, ...rest] = message.trim().split('\n');

  const match = header.match(/^(\w+)(\([^)]+\))?(!)?: (.+)$/);

  if (!match) {
    return { type: null, scope: null, breaking: false, subject: header };
  }

  const [, type, scopeRaw, bang, subject] = match;
  const scope = scopeRaw ? scopeRaw.slice(1, -1) : null;

  const bodyFooter = rest.join('\n');
  const breakingInFooter = /^BREAKING[ -]CHANGE:/m.test(bodyFooter);

  return {
    type: type.toLowerCase(),
    scope,
    breaking: Boolean(bang) || breakingInFooter,
    subject,
  };
}

/**
 * GitHub usernames / name patterns that identify bots.
 */
export const BOT_PATTERNS = [
  /\[bot\]$/i,
  /^dependabot/i,
  /^renovate/i,
  /^github-actions/i,
  /^snyk-bot/i,
  /^semantic-release-bot/i,
];

export function isBot(loginOrName) {
  return BOT_PATTERNS.some((p) => p.test(loginOrName));
}

/**
 * Default changelog section definitions.
 * Order here determines the order they appear in the changelog.
 */
export const DEFAULT_SECTIONS = [
  { types: ['feat', 'feature'],           label: 'Features',               emoji: '✨' },
  { types: ['fix', 'bugfix', 'hotfix'],   label: 'Bug Fixes',              emoji: '🐛' },
  { types: ['perf'],                      label: 'Performance',            emoji: '⚡' },
  { types: ['refactor'],                  label: 'Refactoring',            emoji: '♻️'  },
  { types: ['docs'],                      label: 'Documentation',          emoji: '📚' },
  { types: ['build'],                      label: 'Build',                  emoji: '📦' },
  { types: ['ci'],                        label: 'CI / CD',                emoji: '🔄' },
  { types: ['test', 'tests'],             label: 'Tests',                  emoji: '🧪' },
  { types: ['chore'],                     label: 'Maintenance',            emoji: '🔧' },
  { types: ['style'],                     label: 'Code Style',             emoji: '💅' },
  { types: ['revert'],                    label: 'Reverts',                emoji: '⏪' },
];

/**
 * Parse user-supplied changelog_sections JSON, falling back to defaults on error.
 * @param {string|undefined} jsonStr
 * @returns {typeof DEFAULT_SECTIONS}
 */
export function parseSections(jsonStr) {
  if (!jsonStr) return DEFAULT_SECTIONS;
  try {
    const custom = JSON.parse(jsonStr);
    if (Array.isArray(custom) && custom.length > 0) return custom;
    return DEFAULT_SECTIONS;
  } catch {
    return DEFAULT_SECTIONS;
  }
}

/**
 * Mime type lookup by file extension.
 * @param {string} filename
 * @returns {string}
 */
export function getMimeType(filename) {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  const map = {
    zip:  'application/zip',
    tar:  'application/x-tar',
    gz:   'application/gzip',
    tgz:  'application/gzip',
    bz2:  'application/x-bzip2',
    xz:   'application/x-xz',
    exe:  'application/octet-stream',
    dmg:  'application/octet-stream',
    pkg:  'application/octet-stream',
    deb:  'application/vnd.debian.binary-package',
    rpm:  'application/x-rpm',
    apk:  'application/vnd.android.package-archive',
    jar:  'application/java-archive',
    wasm: 'application/wasm',
    json: 'application/json',
    txt:  'text/plain',
    md:   'text/markdown',
    sig:  'text/plain',
    asc:  'text/plain',
  };
  return map[ext] ?? 'application/octet-stream';
}
