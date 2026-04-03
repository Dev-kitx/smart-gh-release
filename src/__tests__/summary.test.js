import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@actions/core', () => {
  const summary = {
    addHeading: vi.fn().mockReturnThis(),
    addTable:   vi.fn().mockReturnThis(),
    addRaw:     vi.fn().mockReturnThis(),
    write:      vi.fn().mockResolvedValue(undefined),
  };
  return { summary, info: vi.fn(), warning: vi.fn() };
});

import { writeJobSummary } from '../summary.js';
import * as core from '@actions/core';

const baseRelease = {
  tag_name:   'v1.0.0',
  html_url:   'https://github.com/o/r/releases/tag/v1.0.0',
  draft:      false,
  prerelease: false,
};

const baseOpts = {
  release:          baseRelease,
  version:          '1.0.0',
  bumpLevel:        'minor',
  changelog:        '### Features\n- add thing',
  uploadedCount:    2,
  contributorCount: 3,
  previousTag:      'v0.9.0',
};

describe('writeJobSummary', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls addHeading and write for a published release', async () => {
    await writeJobSummary(baseOpts);
    expect(core.summary.addHeading).toHaveBeenCalled();
    expect(core.summary.write).toHaveBeenCalled();
  });

  it('adds full-changelog row when previousTag is set', async () => {
    await writeJobSummary(baseOpts);
    const tableCall = core.summary.addTable.mock.calls[0][0];
    const flatCells = tableCall.flat();
    expect(flatCells.some((c) => typeof c === 'string' && c.includes('Full changelog'))).toBe(true);
  });

  it('omits full-changelog row when previousTag is null', async () => {
    await writeJobSummary({ ...baseOpts, previousTag: null });
    const tableCall = core.summary.addTable.mock.calls[0][0];
    const flatCells = tableCall.flat();
    expect(flatCells.some((c) => typeof c === 'string' && c.includes('Full changelog'))).toBe(false);
  });

  it('uses draft status icon when release is a draft', async () => {
    await writeJobSummary({ ...baseOpts, release: { ...baseRelease, draft: true } });
    const tableCall = core.summary.addTable.mock.calls[0][0];
    const flatCells = tableCall.flat();
    expect(flatCells.some((c) => typeof c === 'string' && c.includes('Draft'))).toBe(true);
  });

  it('uses pre-release status icon when release is a pre-release', async () => {
    await writeJobSummary({ ...baseOpts, release: { ...baseRelease, prerelease: true } });
    const tableCall = core.summary.addTable.mock.calls[0][0];
    const flatCells = tableCall.flat();
    expect(flatCells.some((c) => typeof c === 'string' && c.includes('Pre-release'))).toBe(true);
  });

  it('uses major bump icon for major releases', async () => {
    await writeJobSummary({ ...baseOpts, bumpLevel: 'major' });
    const tableCall = core.summary.addTable.mock.calls[0][0];
    const flatCells = tableCall.flat();
    expect(flatCells.some((c) => typeof c === 'string' && c.includes('major'))).toBe(true);
  });

  it('uses patch bump icon for patch releases', async () => {
    await writeJobSummary({ ...baseOpts, bumpLevel: 'patch' });
    const tableCall = core.summary.addTable.mock.calls[0][0];
    const flatCells = tableCall.flat();
    expect(flatCells.some((c) => typeof c === 'string' && c.includes('patch'))).toBe(true);
  });

  it('falls back to no-changes text when changelog is empty', async () => {
    await writeJobSummary({ ...baseOpts, changelog: '' });
    const rawCall = core.summary.addRaw.mock.calls[0][0];
    expect(rawCall).toContain('No changes detected');
  });

  it('uses singular "file" when uploadedCount is 1', async () => {
    await writeJobSummary({ ...baseOpts, uploadedCount: 1 });
    const tableCall = core.summary.addTable.mock.calls[0][0];
    const flatCells = tableCall.flat();
    expect(flatCells.some((c) => typeof c === 'string' && c.includes('1 file uploaded'))).toBe(true);
  });

  it('uses singular "contributor" when contributorCount is 1', async () => {
    await writeJobSummary({ ...baseOpts, contributorCount: 1 });
    const tableCall = core.summary.addTable.mock.calls[0][0];
    const flatCells = tableCall.flat();
    expect(flatCells.some((c) => typeof c === 'string' && c.includes('1 contributor'))).toBe(true);
  });
});
