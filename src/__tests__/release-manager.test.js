import { describe, it, expect, vi } from 'vitest';

vi.mock('@actions/core', () => ({ info: vi.fn(), warning: vi.fn(), debug: vi.fn() }));

import { ReleaseManager } from '../release-manager.js';

function makeOctokit({ existing = null, throwStatus = null } = {}) {
  return {
    rest: {
      repos: {
        getReleaseByTag: async () => {
          if (throwStatus) {
            const err = new Error('API error');
            err.status = throwStatus;
            throw err;
          }
          return { data: existing };
        },
        createRelease: async ({ tag_name, name, body }) => ({
          data: { id: 1, tag_name, name, body, html_url: 'https://github.com/o/r/releases/tag/v1.0.0' },
        }),
        updateRelease: async ({ release_id, name, body }) => ({
          data: { id: release_id, name, body, html_url: 'https://github.com/o/r/releases/tag/v1.0.0' },
        }),
      },
    },
  };
}

const repo   = { owner: 'o', repo: 'r' };
const callOpts = { tag: 'v1.0.0', name: 'v1.0.0', body: 'notes', draft: false, prerelease: false, targetCommitish: 'main' };

describe('ReleaseManager', () => {
  it('creates a new release when tag does not exist (404)', async () => {
    const rm = new ReleaseManager(makeOctokit({ throwStatus: 404 }), repo, { updateExisting: false });
    const { data } = await rm.createOrUpdate(callOpts);
    expect(data.tag_name).toBe('v1.0.0');
  });

  it('throws when release exists and updateExisting is false', async () => {
    const rm = new ReleaseManager(makeOctokit({ existing: { id: 99 } }), repo, { updateExisting: false });
    await expect(rm.createOrUpdate(callOpts)).rejects.toThrow(/already exists/);
  });

  it('updates release when exists and updateExisting is true', async () => {
    const rm = new ReleaseManager(makeOctokit({ existing: { id: 42 } }), repo, { updateExisting: true });
    const { data } = await rm.createOrUpdate({ ...callOpts, body: 'updated' });
    expect(data.id).toBe(42);
  });

  it('re-throws non-404 errors from getReleaseByTag', async () => {
    const rm = new ReleaseManager(makeOctokit({ throwStatus: 500 }), repo, { updateExisting: false });
    await expect(rm.createOrUpdate(callOpts)).rejects.toThrow();
  });

  it('findByTag returns release data when found', async () => {
    const rm = new ReleaseManager(makeOctokit({ existing: { id: 5, tag_name: 'v1.0.0' } }), repo, {});
    const result = await rm.findByTag('v1.0.0');
    expect(result.id).toBe(5);
  });

  it('findByTag returns null on 404', async () => {
    const rm = new ReleaseManager(makeOctokit({ throwStatus: 404 }), repo, {});
    expect(await rm.findByTag('v1.0.0')).toBeNull();
  });

  it('findByTag re-throws non-404 errors', async () => {
    const rm = new ReleaseManager(makeOctokit({ throwStatus: 500 }), repo, {});
    await expect(rm.findByTag('v1.0.0')).rejects.toThrow();
  });
});
