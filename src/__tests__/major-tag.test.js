import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@actions/core', () => ({ info: vi.fn(), warning: vi.fn() }));

import { MajorTag } from '../major-tag.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeOctokit({ getRefType = 'commit', updateRefStatus = null } = {}) {
  return {
    rest: {
      git: {
        getRef: vi.fn(async ({ ref }) => {
          const tag = ref.replace('tags/', '');
          if (getRefType === 'annotated') {
            return { data: { object: { type: 'tag', sha: 'tag-object-sha' } } };
          }
          return { data: { object: { type: 'commit', sha: `sha-for-${tag}` } } };
        }),
        getTag: vi.fn(async () => ({
          data: { object: { sha: 'dereferenced-commit-sha' } },
        })),
        updateRef: vi.fn(async () => {
          if (updateRefStatus) {
            const err = new Error('API error');
            err.status = updateRefStatus;
            throw err;
          }
          return {};
        }),
        createRef: vi.fn(async () => ({})),
      },
    },
  };
}

const REPO = { owner: 'acme', repo: 'my-action' };

// ── majorTagFor ───────────────────────────────────────────────────────────────

describe('MajorTag.majorTagFor()', () => {
  it('clamps v0.x.x to v1', () => {
    expect(MajorTag.majorTagFor('v0.5.1')).toBe('v1');
  });

  it('clamps v0.0.1 to v1', () => {
    expect(MajorTag.majorTagFor('v0.0.1')).toBe('v1');
  });

  it('keeps v1.x.x as v1', () => {
    expect(MajorTag.majorTagFor('v1.3.0')).toBe('v1');
  });

  it('keeps v2.x.x as v2', () => {
    expect(MajorTag.majorTagFor('v2.0.0')).toBe('v2');
  });

  it('handles tag without v prefix', () => {
    expect(MajorTag.majorTagFor('1.2.3')).toBe('v1');
  });

  it('returns null for unparseable tag', () => {
    expect(MajorTag.majorTagFor('latest')).toBeNull();
    expect(MajorTag.majorTagFor('')).toBeNull();
  });
});

// ── resolveTagSha ─────────────────────────────────────────────────────────────

describe('MajorTag.resolveTagSha()', () => {
  it('returns commit sha for lightweight tag', async () => {
    const octokit = makeOctokit({ getRefType: 'commit' });
    const mt = new MajorTag(octokit, REPO);
    const sha = await mt.resolveTagSha('v1.2.3');
    expect(sha).toBe('sha-for-v1.2.3');
    expect(octokit.rest.git.getTag).not.toHaveBeenCalled();
  });

  it('dereferences annotated tag to commit sha', async () => {
    const octokit = makeOctokit({ getRefType: 'annotated' });
    const mt = new MajorTag(octokit, REPO);
    const sha = await mt.resolveTagSha('v1.2.3');
    expect(sha).toBe('dereferenced-commit-sha');
    expect(octokit.rest.git.getTag).toHaveBeenCalledOnce();
  });
});

// ── publish ───────────────────────────────────────────────────────────────────

describe('MajorTag.publish()', () => {
  it('updates existing ref and returns major tag', async () => {
    const octokit = makeOctokit();
    const mt = new MajorTag(octokit, REPO);
    const result = await mt.publish('v1.3.0', 'abc123');
    expect(result).toBe('v1');
    expect(octokit.rest.git.updateRef).toHaveBeenCalledOnce();
    expect(octokit.rest.git.createRef).not.toHaveBeenCalled();
    expect(octokit.rest.git.updateRef).toHaveBeenCalledWith(
      expect.objectContaining({ ref: 'tags/v1', sha: 'abc123', force: true }),
    );
  });

  it('creates ref when updateRef returns 422', async () => {
    const octokit = makeOctokit({ updateRefStatus: 422 });
    const mt = new MajorTag(octokit, REPO);
    const result = await mt.publish('v1.3.0', 'abc123');
    expect(result).toBe('v1');
    expect(octokit.rest.git.createRef).toHaveBeenCalledOnce();
    expect(octokit.rest.git.createRef).toHaveBeenCalledWith(
      expect.objectContaining({ ref: 'refs/tags/v1', sha: 'abc123' }),
    );
  });

  it('re-throws non-422 errors from updateRef', async () => {
    const octokit = makeOctokit({ updateRefStatus: 500 });
    const mt = new MajorTag(octokit, REPO);
    await expect(mt.publish('v1.3.0', 'abc123')).rejects.toMatchObject({ status: 500 });
  });

  it('clamps v0.x.x and updates v1', async () => {
    const octokit = makeOctokit();
    const mt = new MajorTag(octokit, REPO);
    const result = await mt.publish('v0.5.1', 'def456');
    expect(result).toBe('v1');
    expect(octokit.rest.git.updateRef).toHaveBeenCalledWith(
      expect.objectContaining({ ref: 'tags/v1' }),
    );
  });

  it('returns null and does not call API for unparseable tag', async () => {
    const octokit = makeOctokit();
    const mt = new MajorTag(octokit, REPO);
    const result = await mt.publish('not-a-semver', 'abc123');
    expect(result).toBeNull();
    expect(octokit.rest.git.updateRef).not.toHaveBeenCalled();
    expect(octokit.rest.git.createRef).not.toHaveBeenCalled();
  });

  it('passes owner and repo to the API call', async () => {
    const octokit = makeOctokit();
    const mt = new MajorTag(octokit, REPO);
    await mt.publish('v2.0.0', 'sha999');
    expect(octokit.rest.git.updateRef).toHaveBeenCalledWith(
      expect.objectContaining({ owner: 'acme', repo: 'my-action' }),
    );
  });
});
